const express = require('express');
const router = express.Router();
const _ = require('lodash');

const Team  = require('../model/Team');
const Event = require('../model/Event');
const httpStatus = require('http-status');
const schema = require('../helpers/validate.js');
const matchStats = require('../helpers/matchStats');
const cache = require('../helpers/cache').cache;
const teamHelper = require('../helpers/team');

function getRank(event, team) {
  if (event && event.rankings) {
    for (var i = 0; i < event.rankings.length; i++) {
      if (event.rankings[i].number == team) {
        return event.rankings[i].rank;
      }
    }
  }
  return null;
}

function generateStats(event, matches, team) {
  try {
    var result = { matches: 0, matchesWon: 0, matchesLost: 0, matchesTied: 0 };

    for (var i = 0; i < matches.length; i++) {
      var match = matches[i];

      if (matchStats.matchComplete(match) &&
          !matchStats.isSurrogateForTeam(match, team) &&
          matchStats.isQualificationMatch(match)) {
        result.matches++;

        let isTeamOnRed = !!_.find(match.teams.red, (t) => { return t.number == team });
        let isTeamOnBlue = !!_.find(match.teams.blue, (t) => { return t.number == team });
        if (isTeamOnRed) {
          if (match.scores.red > match.scores.blue) result.matchesWon++;
          else if (match.scores.red < match.scores.blue) result.matchesLost++;
          else result.matchesTied++;
        } else if (isTeamOnBlue) {
          if (match.scores.red > match.scores.blue) result.matchesLost++;
          else if (match.scores.red < match.scores.blue) result.matchesWon++;
          else result.matchesTied++;
        }
      }
    }

    //get all stats
    if (event && event.rankings) {
      for (var i = 0; i < event.rankings.length; i++) {
        if (event.rankings[i].number == team) {
          return Object.assign(result, event.rankings[i].current);
        }
      }
    }

    return result;
  } catch (e) {
    console.error(e)
  }
}

router.route('/brief').get(function (req,res) {
  if (req.query.filter) {
    Team.search({"match_phrase":{"_all":{"query":req.query.filter, "slop":3}}},{hydrate: true, hydrateWithESResults: true}).then(function (results) {
      var teams = results.hits.hits;
      teams = _.map(teams, function (e) {
        return schema.filterTeam(e.toObject());
      });
      res.json(teams);
    }, function (err){
      console.log(err);
      res.status(httpStatus.BAD_REQUEST).json({
        message: "Error retrieving team data"
      });
    });
  } else {
    Team.list().then(function (teams) {
      teams = _.map(teams, function (e) {
        return schema.filterTeam(e.toObject());
      });
      res.json(teams);
    }, function (err){
      console.log(err);
      res.status(httpStatus.BAD_REQUEST).json({
        message: "Error retrieving team data"
      });
    });
  }
});

router.route('/brief/:team').get(function(req, res) {
  //no match or event data - just brief information
  res.json(req.team.toObject());
});

router.route('/batch').get(async (req, res, next) => {
  if (!req.query.teams) {
    res.json({});
    return;
  }
  let teams = req.query.teams.split(',');
  res.json(await teamHelper.generateTeamList(teams));
});

router.route('/:team').get((req, res, next) => {
  res.express_redis_cache_name = "team-" + req.params.team + (req.query.season ? "-season-" + req.query.season : "");
  next();
}, cache.route({ expiry: 60 }), function (req, res) {

  let query = { teamKey: req.team.number, published: true, deleted: false };
  if (req.query.season) {
    query.season = req.query.season;
  }

  Event.find(query).then(function (events) {
    var participation = [];
    for (var event of events) {
      var teamMatches = []
      // TODO Decouple from Red + Blue alliance
      for (var match of event.matches) {
        for (var blueTeam of match.teams.blue) {
          if (blueTeam.number == req.team.number) {
            teamMatches.push(match);
            break;
          }
        }
        for (var redTeam of match.teams.red) {
          if (redTeam.number == req.team.number) {
            teamMatches.push(match);
            break;
          }
        }
      }
      participation.push({
        event: schema.filterEvent(event),
        matches: teamMatches,
        rank: getRank(event, req.team.number),
        stats: generateStats(event, teamMatches, req.team.number)
      });
    }
    const teamFinal = req.team.toObject()
    teamFinal.participation = participation.reverse();
    teamFinal.participation = teamFinal.participation.sort((a, b) => {
      return b.event.startDate - a.event.startDate;
    });
    res.json(schema.filterTeam(teamFinal));
  }, function (err){
    console.log(err);
    res.status(httpStatus.BAD_REQUEST).json({
      message: "Error retrieving team"
    });
  });
});

// Retrieve team from database, or fetch/parse from FIRST if we haven't seen team yet
router.param('team', async function (req, res, next) {
  Team.get(req.params.team).then(function (team){
    req.team = team;
    next();
  }).catch(async function () {
    console.log(req.params.team + " not found! Pulling...");
    let team = await teamHelper.getTeamFromFIRST(req.params.team);
    if (team) {
      team.save().then(function (team){
        req.team = team;
        next();
      });
    } else {
      res.status(httpStatus.NOT_FOUND).json({'message': 'Team not registered for current season'});
    }
  });
});
module.exports = router;
