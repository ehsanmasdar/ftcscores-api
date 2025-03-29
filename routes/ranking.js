const express = require('express');
const router = express.Router();
const httpStatus = require('http-status');
const Heap = require('heap');
const matchStats = require('../helpers/matchStats');

const Event = require('../model/Event.js');

router.route('/normal').get(getEvents, function (req, res) {
  var teams = {};
  for (var i = 0; i < req.query.event.length; i++) {
    var event = req.query.event[i];
    if (event) {
      for (var j = 0; j < event.matches.length; j++) {
        var match = event.matches[j];
        // Only use matches that are complete
        if (matchStats.matchComplete(match)) {
          // Red teams
          for (var k = 0; k < match.teams.red.length; k++) {
            var team = match.teams.red[k];
            if (!team.surrogate) {
              if (!teams[team.number]) {
                teams[team.number] = {
                  qp: 0,
                  rp: 0,
                  number: team.number,
                  matches: 1,
                  name: team.name
                };
              } else {
                teams[team.number].matches += 1;
              }
              teams[team.number].rp += matchStats.calculateRp(match);
              teams[team.number].qp += matchStats.calculateQp(match, team.number);
            }
          }
          // Blue Teams
          for (var k = 0; k < match.teams.blue.length; k++) {
            var team = match.teams.blue[k];
            if (!team.surrogate) {
              if (!teams[team.number]) {
                teams[team.number] = {
                  qp: 0,
                  rp: 0,
                  number: team.number,
                  matches: 1,
                  name: team.name
                };
              } else {
                teams[team.number].matches += 1;
              }
              teams[team.number].rp += matchStats.calculateRp(match);
              teams[team.number].qp += matchStats.calculateQp(match, team.number);
            }
          }
        }
      }
    }
  }
  var arr = Object.keys(teams).map(function (key) {
    return teams[key];
  });
  // Sorted Descending - highest ranked team first
  arr.sort(function (a, b) {
    if (a.qp != b.qp) {
      return b.qp - a.qp;
    } else if (a.rp != b.rp) {
      return b.rp - a.rp;
    } else {
      return b.number - a.number;
    }
  });
  res.json(arr);
});

// Retrieve event from database
function retrieveEvent(link) {
  return new Promise(function (resolve) {
    Event.get(link).then(function (ev) {
      resolve(ev);
    }).catch(function (e) {
      resolve(null);
    });
  });
}
// Get list of event shortnames and retrieve the corresponding event objects
function getEvents(req, res, next) {
  if (req.query.event) {
    var events = req.query.event.split(",");
    Promise.all(events.map(retrieveEvent)).then(function (data) {
      req.query.event = data;
      next();
    });
  } else {
    res.status(httpStatus.BAD_REQUEST).json({
      "message": "No events supplied"
    });
  }
}
module.exports = router;
