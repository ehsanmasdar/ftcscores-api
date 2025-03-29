const express = require('express');
const router = express.Router();
const validate = require('express-validation');
const httpStatus = require('http-status');
const _ = require('lodash');
const cache = require('../helpers/cache').cache;

const tocsv = require('csv-stringify');
const moment = require('moment');
const crypto = require('crypto');
const base64url = require('base64url');

const Event = require('../model/Event.js');
const Team = require('../model/Team.js');
const User = require('../model/User.js');
const auth = require('../helpers/auth.js');
const schema = require('../helpers/validate.js');
const rankings = require('../helpers/ranking.js');
const email = require('../helpers/email');
const sockets = require('../helpers/sockets');
const opr = require('../helpers/opr');
const qr = require('qr-image');

const {
  matchComparator
} = require('../helpers/computation.js');

const {
  updateEvent
} = require('../helpers/event.js');

const SEASON_DATA = {
  "1617": {
    name: "Velocity Vortex",
    kickoff: new Date(2016, 8, 10) //noon EST
  },
  "1718": {
    name: "Relic Recovery",
    kickoff: new Date(2017, 8, 3) //noon EST
  },
  "1819": {
    name: "Rover Ruckus",
    kickoff: new Date(2018, 9, 8)
  },
  "1920": {
    name: "Skystone",
    kickoff: new Date(2019, 9, 7)
  },
  "2021": {
    name: "Ultimate Goal",
    kickoff: new Date(2020, 9, 12)
  },
  "2122": {
    name: "Freight Frenzy",
    kickoff: new Date(2021, 9, 18)
  },
  "2223": {
    name: "Power Play",
    kickoff: new Date(2022, 9, 10)
  }
};

const googleMapsClient = require('@google/maps').createClient({
  key: process.env.GOOGLE_API_TOKEN,
  Promise: Promise
});

router.route('/').get(function (req, res) {
  res.header("Cache-Control", "no-cache");
  if (req.query.filter) {
    //list events matching search query
    Event.search({
      "match_phrase": {
        "_all": {
          "query": req.query.filter,
          "slop": 3
        }
      }
    }, {
      "season": req.query.season,
    }, {
      hydrate: true,
      hydrateWithESResults: true
    }).then(function (result) {
      var ev = result.hits.hits;
      ev = _.filter(ev, function (e) {
        if (e.published) {
          if (req.query.season && req.query.season == e.season) {
            return true;
          } else if (!req.query.season) {
            return true;
          }
          return false;
        }
        return false;
      });
      ev = _.map(ev, function (e) {
        return schema.filterEvent(e.toObject());
      });
      res.json(ev);
    }, function (err) {
      console.log(err);
      res.status(httpStatus.BAD_REQUEST).json({
        message: "Error retrieving event data"
      });
    });
  } else {
    //list only active events
    Event.listLimited().then(function (ev) {
      ev = _.map(ev, function (e) {
        return schema.filterEvent(e.toObject());
      });
      res.json(ev);
    }, function (err) {
      console.log(err);
      res.status(httpStatus.BAD_REQUEST).json({
        message: "Error retrieving event data"
      });
    });
  }
})
.post(auth.ensureLoggedIn, validate(schema.createEvent), schema.validateFIRSTEventCode, function (req, res, next) {
  req.body.startDate = moment(req.body.startDate).utcOffset(0).startOf('day').toDate();
  req.body.endDate = moment(req.body.endDate).utcOffset(0).startOf('day').toDate();
  const event = new Event(req.body);
  Event.checkExistance(req.body.link).then(async (exists) => {
    if (!exists) {
      try {
        //get geolocation information
        let location = await googleMapsClient.geocode({address: req.body.location}).asPromise();
        if (!location || !location.json || location.json.status !== "OK" || !location.json.results || !location.json.results.length) {
          return next({
            status: 400,
            message: "Location not found",
            errors: {
              location: "Please enter a valid city and state/region."
            }
          })
        }
        let formattedLocation = location.json.results[0].formatted_address;
        let lat = location.json.results[0].geometry.location.lat;
        let lon = location.json.results[0].geometry.location.lng;
        event.locationCoords = {
          type: "Point",
          coordinates: [ lon, lat ]
        }

        event._creator = req.user._id;
        event.link = base64url(crypto.randomBytes(6));
        if (!event.firstEventCode) delete event.firstEventCode;
        let newEvent = await event.save();

        //send notification emails to all admins
        var docs = await User.find({admin: true});
        var emails = docs.map((doc) => doc.username);
        email.sendEventNotification(req.user, schema.filterEvent(newEvent.toObject()), emails);

        res.json(schema.filterEvent(newEvent.toObject()));
      } catch (e) {
        next(e);
      }
    } else {
      res.status(httpStatus.CONFLICT).json({
        message: "Event already exists"
      });
    }
  });
});

router.get('/all/:season', auth.isAdmin, async function(req, res, next) {
  try {
    let events = await Event.listByDay({
      "season": req.params.season,
      "deleted": false
    })
    res.send(events);
  } catch (e) {
    next(e);
  }
})

router.get('/season/:season', cache.route({expiry: 120}), async function(req, res, next) {
  try {
    let events = await Event.listByDay({
      "season": req.params.season,
      "deleted": false,
      "published": true,
      "startDate": { $exists: true }
    })
    res.send(events);
  } catch (e) {
    next(e);
  }
})

router.route('/featured').get(cache.route({expiry: 300}), function (req, res) {
  Event.find({
    featured: true
  }).then((evs) => {
    if (evs) {
      res.json(evs);
    } else {
      res.status(httpStatus.NOT_FOUND).json({
        "message": "Error retrieving events"
      });
    }
  })
})
router.route('/unpublished').get(auth.ensureLoggedIn, auth.isAdmin, function (req, res) {
  Event.find({
    published: false
  }).then((evs) => {
    if (evs) {
      res.json(evs);
    } else {
      res.status(httpStatus.BAD_REQUEST).json({
        "message": "Error retrieving events"
      });
    }
  })
})
router.route('/:eventId').get((req, res, next) => {
  res.express_redis_cache_name = req.params.eventId;
  next();
}, cache.route({expiry: 60}), function (req, res, next) {
  req.ev.matches.sort(matchComparator);
  let event = req.ev.toObject();
  res.json(schema.filterEvent(event));
})
.delete(auth.canModify, function (req, res) {
  const ev = req.ev;
  ev.delete().then(function (ev) {
    res.json(schema.filterEvent(ev.toObject()));
  }).catch(function (e) {
    console.log(e);
    res.status(httpStatus.BAD_REQUEST).json({
      message: "Error deleting event"
    });
  });
})
.put(auth.canModify, validate(schema.updateEvent), schema.validateFIRSTEventCode, async function (req, res, next) {
  try {
    const ev = req.ev;
    var admin = req.user && req.user.admin;
    if (!admin) {
      delete req.body.status;
      delete req.body.season;
      delete req.body.combinedEvents;
      delete req.body.bannerMessage;
      delete req.body.creator;
      delete req.body.from;
    }
    else {
      if (!req.body.combinedEvents) req.body.combinedEvents = [ ];
    }

    if (req.body.startDate) {
      req.body.startDate = moment(req.body.startDate).utcOffset(0).startOf('day').toDate();
    }
    if (req.body.endDate) {
      req.body.endDate = moment(req.body.endDate).utcOffset(0).startOf('day').toDate();
    }

    if (req.body.creator) {
      let creator = await User.findOne({ username: req.body.creator });
      if (!creator) {
        return next({ status: 400, message: "Owner not found" })
      }
      req.body._creator = creator._id;
      delete req.body.creator;
    }

    //get geolocation information
    try {
      let location = await googleMapsClient.geocode({address: req.body.location}).asPromise();
      if (!location || !location.json || location.json.status !== "OK" || !location.json.results || !location.json.results.length) {
        return next({
          status: 400,
          message: "Location not found",
          errors: {
            location: "Please enter a valid city and state/region."
          }
        })
      }
      let formattedLocation = location.json.results[0].formatted_address;
      let lat = location.json.results[0].geometry.location.lat;
      let lon = location.json.results[0].geometry.location.lng;
      req.body.locationCoords = {
        type: "Point",
        coordinates: [ lon, lat ]
      }
    } catch (e) {
      console.error("Location internal error", e);
      throw {
        status: 400,
        message: "Error updating event's location"
      };
    }

    if (req.body.combinedEvents){
      //validate combined event urls
      req.body.combinedEvents = await rankings.validateCombinedEvents(req.body.combinedEvents, ev.link)
      //save
      Object.assign(ev, req.body);
      console.log(ev)
      await ev.save()
      //update properties on all combined events
      await rankings.structureCombinedEvents(req.body.combinedEvents, ev.link)
    } else {
      //save
      Object.assign(ev, req.body);
      await ev.save();
    }

    //clear cache
    cache.del(req.params.eventId, (err) => {});

    res.send({
      message: "Successfully updated event"
    })
  } catch (e) {
    next(e)
  }
});

router.get('/:eventId/brief', (req, res, next) => {
  res.express_redis_cache_name = "event-brief-" + req.params.eventId;
  next();
}, cache.route({ expiry: 60 * 15 }), function (req, res, next) {
  try {
    res.send({
      shortName: req.ev.shortName,
      fullName: req.ev.fullName,
      status: req.ev.status,
      subtitle: req.ev.subtitle,
      link: req.ev.link,
      startDate: req.ev.startDate,
      endDate: req.ev.endDate
    })
  } catch (e) {
    next(e)
  }
});

router.get('/:eventId/qrcode.svg', cache.route({expiry: 60 * 5}), (req, res, next) => {
  try {
    var code = qr.image('https://ftcscores.com/event/' + req.params.eventId, { type: 'svg' });
    res.setHeader('Content-type', 'image/svg+xml');
    code.pipe(res);
  } catch (e) {
    next(e)
  }
})

router.route('/:eventId/publish').post(auth.ensureLoggedIn, auth.isAdmin, validate(schema.publishEvent), function (req, res) {
  const ev = req.ev;
  ev.published = req.body.published;
  if (ev.published) {
    User.find({admin: true}).then((docs) => {
      var emails = docs.map((doc) => doc.username);
      emails.push(ev._creator.username);
      email.sendPublishedNotification(ev._creator,
        schema.filterEvent(ev.toObject()), emails, req.user);
    });
  }
  ev.save().then(function () {
    res.json({
      "message": "Changed event publication"
    })
  }, function (err) {
    res.status(httpStatus.BAD_REQUEST).json({
      "message": "Error publishing event"
    })
  })
});

router.route('/:eventId/update').put(auth.canUpdateScores, async function (req, res) {
  const ev = await updateEvent(req.ev, req.body);
  ev.save()
  .then(function (newEvent) {
    //clear cache
    cache.del(req.params.eventId, (err) => {});

    //send response
    let cleanedEvent = schema.filterEvent(newEvent.toObject());
    res.json(cleanedEvent);

    //send update to subscribers
    sockets.emitUpdate(`/events`, cleanedEvent)
    sockets.emitUpdate(`/event/${ev.link}`, cleanedEvent);
    for (var teamNumber of Object.keys(ev.teams)) {
      sockets.emitUpdate(`/team/${teamNumber}`, { })
    }
  }, function (e) {
    console.log(e);
    res.status(httpStatus.BAD_REQUEST).json({
      message: "Error updating event"
    });
  });
});

router.route('/:eventId/export/matches/:exportFactory').get(function (req, res) {
  switch (req.params.exportFactory) {
    case "csv":
      var data = _.map(req.ev.matches, (_match) => {
        return [
          _match.order,
          _match.number,
          _match.status,
          _match.scores ? _match.scores.red : "",
          _match.scores ? _match.scores.blue : "",
          _match.teams.red[0] ? _match.teams.red[0].number : "",
          _match.teams.red[0] ? _match.teams.red[0].name : "",
          _match.teams.red[1] ? _match.teams.red[1].number : "",
          _match.teams.red[1] ? _match.teams.red[1].name : "",
          _match.teams.red[2] ? _match.teams.red[2].number : "",
          _match.teams.red[2] ? _match.teams.red[2].name : "",
          _match.teams.blue[0] ? _match.teams.blue[0].number : "",
          _match.teams.blue[0] ? _match.teams.blue[0].name : "",
          _match.teams.blue[1] ? _match.teams.blue[1].number : "",
          _match.teams.blue[1] ? _match.teams.blue[1].name : "",
          _match.teams.blue[2] ? _match.teams.blue[2].number : "",
          _match.teams.blue[2] ? _match.teams.blue[2].name : "",
          _match.subscoresRed ? _match.subscoresRed.auto : "",
          _match.subscoresRed ? _match.subscoresRed.tele : "",
          _match.subscoresRed ? _match.subscoresRed.endg : "",
          _match.subscoresRed ? _match.subscoresRed.pen : "",
          _match.subscoresBlue ? _match.subscoresBlue.auto : "",
          _match.subscoresBlue ? _match.subscoresBlue.tele : "",
          _match.subscoresBlue ? _match.subscoresBlue.endg : "",
          _match.subscoresBlue ? _match.subscoresBlue.pen : "",
          _match.teams.red[0] ? _match.teams.red[0].surrogate : "",
          _match.teams.red[1] ? _match.teams.red[1].surrogate : "",
          _match.teams.red[2] ? _match.teams.red[2].surrogate : "",
          _match.teams.blue[0] ? _match.teams.blue[0].surrogate : "",
          _match.teams.blue[1] ? _match.teams.blue[1].surrogate : "",
          _match.teams.blue[2] ? _match.teams.blue[2].surrogate : ""
        ];
      });

      tocsv(data, function (err, csv) {
        var header = `Order,Number,Status,Red Score,Blue Score,Red 1 Number,Red 1 Name,Red 2 Number,Red 2 Name,Red 3 Number,Red 3 Name,Blue 1 Number,Blue 1 Name,Blue 2 Number,Blue 2 Name,Blue 3 Number,Blue 3 Name,Red Autonomous,Red Teleop,Red Endgame,Red Penalty Bonus,Blue Autonomous,Blue Teleop,Blue Endgame,Blue Penalty Bonus,Red 1 Surrogate,Red 2 Surrogate,Red 3 Surrogate,Blue 1 Surrogate,Blue 2 Surrogate,Blue 3 Surrogate\n`;
        res.json({
          filename: `${req.ev.link}-matches.csv`,
          data: header + csv
        });
      });
      break;
    default:
      res.status(httpStatus.BAD_REQUEST).json({
        message: "Cannot export to this data type"
      });
      break;
  }
});

router.route('/:eventId/export/rankings/:exportFactory').get(function (req, res) {
  switch (req.params.exportFactory) {
    case "csv":
      var data = _.map(req.ev.rankings, (_team) => {
        return [
          _team.rank,
          _team.number,
          _team.name,
          _team.current ? _team.current.qp : "",
          _team.current ? _team.current.rp : "",
          _team.current ? _team.current.tbp2 : "",
          _team.current ? _team.current.matches : "",
          _team.current ? _team.current.highest : "",
          _team.current ? _team.current.highestPenFree : "",
          _team.current ? _team.current.average : "",
          _team.current ? _team.current.averagePenFree : "",
          _team.current ? _team.current.opr : "",
          _team.current ? _team.current.oprPenFree : "",
        ];
      });

      let qp_rp = "QP,RP,";

      if (req.ev.season === "1819" || req.ev.season === "1920") {
        qp_rp = "RP,TBP,";
      } else if (req.ev.season === "2021" || req.ev.season === "2122") {
        qp_rp = "RP,TBP1,TBP2";
      }

      tocsv(data, function (err, csv) {
        var header = `Rank,Team Number,Team Name,${qp_rp},Matches Played,Highest Score,Highest Score (non-penalty),Average Score,Average Score (non-penalty),OPR,OPR (non-penalty)\n`;
        res.json({
          filename: `${req.ev.link}-rankings.csv`,
          data: header + csv
        });
      });
      break;
    default:
      res.status(httpStatus.BAD_REQUEST).json({
        message: "Cannot export to this data type"
      });
      break;
  }
});

// Load event for modification
router.param('eventId', function (req, res, next, id) {
  Event.get(id).then(function (ev) {
    req.ev = ev;
    next();
  }).catch(function (err) {
    console.log(err);
    res.status(httpStatus.NOT_FOUND).json({
      message: "Event not found"
    });
  });
});

module.exports = router;
