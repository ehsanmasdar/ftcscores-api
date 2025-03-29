const express = require('express');
const httpStatus = require('http-status');
const _ = require('lodash');

const Event = require('../model/Event.js');
const Team = require('../model/Team.js');
const schema = require('../helpers/validate.js');

const router = express.Router();
router.route('/').get(function (req, res) {
  if (req.query.q) {
    Promise.all([Event.search({
      "bool": {
        "must": [
          {
            "term": { "season": req.query.season }
          }
        ],
        "should": {
          "multi_match": {
            "query": req.query.q.toString(),
            "fields": ["shortName^5", "fullName^3", "location^2", "firstEventCode"],
            "fuzziness": "AUTO",
            "type": "most_fields",
            "analyzer": "standard",
            "slop": 40
          }
        }
      }
    }, {
      hydrate: true,
      hydrateWithESResults: true,
      size: 10
    }), Team.search({
      "dis_max": {
        "queries": [
          {
            "multi_match": {
              "query": req.query.q,
              "fields": ["nickname^5", "name", "city^3", "state^2"],
              "fuzziness": "AUTO",
              "type": "most_fields",
              "analyzer": "standard",
              "slop": 40
            }
          },
          {
            "match": {
              "number": {
                "query": req.query.q,
                "boost": 20,
                "lenient": true
              }
            }
          }
        ]
      }
    }, {
      hydrate: true,
      hydrateWithESResults: true,
      size: 5
    })]).then(function (values) {
      const eventHits = values[0].hits.total.value;
      const teamHits = values[1].hits.total.value;
      values[0] = values[0].hits.hits;
      values[1] = values[1].hits.hits;
      if (eventHits > 0) {
        values[0] = _.filter(values[0], function (e) {
          if (e.toObject().published && !e.toObject().deleted) {
            return true;
          }
          return false;
        });
        values[0] = _.map(values[0], function (e) {
          var out = schema.filterEvent(e.toObject());
          out._esResult = e._esResult;
          return out;
        });
      } else {
        values[0] = [];
      }
      if (teamHits > 0) {
        values[1] = _.map(values[1], function (e) {
          var out = schema.filterTeam(e.toObject());
          out._esResult = e._esResult;
          return out;
        });
      } else {
        values[1] = [];
      }

      res.json({
        events: values[0],
        teams: values[1],
      })
    }, function (err) {
      console.log(err);
      res.status(httpStatus.NOT_FOUND).json({
        message: "No results found"
      });
    });
  } else {
    res.status(httpStatus.BAD_REQUEST).json({
      message: "No search paramater supplied"
    })
  }
});
module.exports = router;
