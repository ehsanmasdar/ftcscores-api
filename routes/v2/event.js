const express = require('express');
const router = express.Router();

const validate = require('express-validation');
const httpStatus = require('http-status');
const moment = require('moment');
const _ = require('lodash');

const cache = require('../../helpers/cache').cache;
const schema = require('../../helpers/validate.js');

const Event = require('../../model/Event.js');


//list events to display on front page
//now: events that occur today
//upcoming: events that occur in the next x days

const MAIN_PAGE_HAPPENING_SOON_DAYS = 30;

const googleMapsClient = require('@google/maps').createClient({
  key: process.env.GOOGLE_API_TOKEN,
  Promise: Promise
});

router.get('/', cache.route({expiry: 60}), async (req, res, next) => {
  try {
    let now = moment.utc();
    let happeningNow = await Event.find({
      "deleted": false,
      "published": true,
      //happening now if the event is today OR status is live
      $or: [
        { "status": "Live" },
        {
          "startDate": { $lte: moment(now).add(2, 'days').toDate() },
          "endDate": { $gte: moment(now).subtract(2, 'days').toDate() }
        }
      ]
    })
    // .project({
    //   matches: 0,
    //   teams: 0
    // })
    .sort({ status: 1, startDate: 1, endDate: -1, shortName: 1 });

    let upcoming = await Event.listByDay({
      "deleted": false,
      "published": true,
      // "status": { $ne: "Live" },
      "startDate": {
        $lte: moment(now).add(MAIN_PAGE_HAPPENING_SOON_DAYS, 'days').toDate(),
        $gt: moment(now).subtract(1, 'days').toDate()
      },
    }, recentFirst=true);

    res.send({
      now: happeningNow,
      upcoming: upcoming
    })
  } catch (e) {
    next(e)
  }
});

router.get('/search', async (req, res, next) => {
  res.header("Cache-Control", "no-cache");

  try {
    if (req.query.q) {
      //list events matching search query
      let result = await Event.search({
        "match_phrase": {
          "_all": {
            "query": req.query.q,
            "slop": 3
          }
        }
      }, {
        "season": req.query.season,
      }, {
        hydrate: true,
        hydrateWithESResults: true
      })

      let events = _(result.hits.hits).filter((e) => {
        if (e.published) {
          if (req.query.season && req.query.season == e.season) {
            return true;
          } else if (!req.query.season) {
            return true;
          }
          return false;
        }
        return false;
      })
      .map((e) => {
        return schema.filterEvent(e.toObject());
      })
      .value();

      res.json(events);
    } else {
      //list only active events
      let events = _.map(await Event.listLimited(), function (e) {
        return schema.filterEvent(e.toObject());
      });
      res.json(events);
    }
  } catch (e) {
    next({
      status: httpStatus.BAD_REQUEST,
      message: "Error retrieving event data",
      detail: e
    });
  }
})

router.get('/season/:season', async (req, res, next) => {
  try {

    let geoNearQuery;

    if ((req.query.lat && req.query.lon) || req.query.loc) {

      let lat, lon;
      if (req.query.lat && req.query.lon) {
        lat = parseFloat(req.query.lat);
        lon = parseFloat(req.query.lon);
      } else {
        let location = await googleMapsClient.geocode({address: req.query.loc}).asPromise();
        if (location && location.json && location.json.status === "OK" && location.json.results && location.json.results.length) {
          lat = location.json.results[0].geometry.location.lat;
          lon = location.json.results[0].geometry.location.lng;
        }
      }

      if (lat && lon) {
        geoNearQuery = {
          near: {
            type: "Point",
            coordinates: [lon, lat]
          },
          distanceField: "distance",
          maxDistance: 200 * 1000, //m (200 km)
          spherical: true
        }
      }
    }

    let events = await Event.listByDay({
      "season": req.params.season,
      "deleted": false,
      "published": true,
      "startDate": { $exists: true }
    }, recentFirst=true, geoNearQuery);

    res.send(events);
  } catch (e) {
    console.error(e)
    next({
      status: httpStatus.BAD_REQUEST,
      message: "Error retrieving event data",
      detail: e
    });
  }
})

module.exports = router;
