const opr = require('../helpers/opr.js');
const diff = require('deep-diff').diff;
const cache = require('../helpers/cache').cache;
const _ = require('lodash');

const {
    computeTopMatchesFTC,
    computeTopTeamsFTC,
    computeLatestMatchFTC,
    computeStatusFTC,
    mixRankingsIntoTeam,
    mixNamesIntoMatches,
    generateRankingsIfBlank
} = require('./computation.js');

const {
    computeCombinedOnEvent
} = require('./ranking')

const {
    sendNotification
} = require('../helpers/notificationdispatch');

function removeBadTeams(team) {
    return team.number !== -1;
}
async function updateEvent(ev, data) {
    // Temporary server-side patch for 2 team alliances where third team has number -1
    for (var match of data.matches) {
        match.teams.red = match.teams.red.filter(removeBadTeams)
        match.teams.blue = match.teams.blue.filter(removeBadTeams)
    }
    ev.topMatches = computeTopMatchesFTC(data.matches);
    ev.topTeams = computeTopTeamsFTC(data.rankings);
    ev.latestMatch = computeLatestMatchFTC(data.matches);
    ev.status = computeStatusFTC(data.matches, ev.status);
    var newMatches;
    if (!ev.isFinals) {
        ev.rankings = opr.compute(data.matches, generateRankingsIfBlank(data.rankings, data.teams), ev.season);
        ev.teams = mixRankingsIntoTeam(data.rankings, data.teams);
        ev.teamKey = Object.keys(data.teams);
        newMatches = mixNamesIntoMatches(data.matches, data.rankings);
    } else {
        newMatches = data.matches;
    }
    for (var match of newMatches) {
        for (var oldMatch of ev.matches) {
            if (match.number == oldMatch.number) {
                if (!_.isEqual(oldMatch, match)) {
                    cache.del(ev.link, (err) => { });
                    if (match.status == "done") {
                        if (ev.published) {
                            console.log(`Sending notification for ${ev.shortName}-${match.number}`)
                            sendNotification(match, ev.link);
                        } else {
                            console.log(`Ignoring notification for unpublished event ${ev.shortName}-${match.number}`);
                        }
                    } else {
                        console.log(`Not sending notification for ${ev.shortName}-${match.number} due to pending status`);
                    }
                }
            }
        }
        if (!ev.matches.find((ele) => {return ele.number == match.number})) {
            console.log(`Sending notification for ${ev.shortName}-${match.number} which was added to match list`);
            sendNotification(match, ev.link);
        }
    }
    // Preserve live matches
    for (var match of newMatches) {
        for (var oldMatch of ev.matches) {
            if (oldMatch.status == 'live' && oldMatch.number == match.number && oldMatch.scores.red > 0 && oldMatch.scores.blue > 0) {
                console.log(`Preserving pending scores for ${ev.shortName}-${oldMatch.number}`)
                match.scores = oldMatch.scores;
                match.gameSubscores = oldMatch.gameSubscores;
                match.subscoresRed = oldMatch.subscoresRed;
                match.subscoresBlue = oldMatch.subscoresBlue;
                match.startTime = oldMatch.startTime;
                match.updatedTime = oldMatch.updatedTime;
            }
        }
    }

    ev.matches = newMatches;
    ev = await computeCombinedOnEvent(ev);
    try {
        if (ev.type == "League Championship" && ev.combinedRankings) {
            for (let i = 0; i < ev.rankings.length; i ++) {
                for (let j = 0; j < ev.combinedRankings.ranking.length; j++) {
                    if (ev.rankings[i].number == ev.combinedRankings.ranking[j].number) {
                        ev.rankings[i].current.qp += ev.combinedRankings.ranking[j].qp;
                        ev.rankings[i].current.rp += ev.combinedRankings.ranking[j].rp;
                    }
                }
            }
            ev.rankings = ev.rankings.sort(function (a, b) {
                if (a.current.qp != b.current.qp) {
                  return b.current.qp - a.current.qp;
                } else if (a.current.rp != b.current.rp) {
                  return b.current.rp - a.current.rp;
                } else {
                  return b.number - a.number;
                }
            });
            for (let i = 0; i < ev.rankings.length; i++) {
                ev.rankings[i].rank = i+1;
                try {
                    ev.teams[ev.rankings[i].number].rank = i + 1;
                }catch(e) {

                }
                
            }
            ev.markModified('rankings');
            ev.markModified('teams');
        }
    } catch(e) {
        console.error('error with the patch', e)
    }
    
    return ev;
}

/*
    Fast update push for live scoring
*/
async function fastUpdate(ev, matchIdx, data) {
    // Sanity check that we're updating the right match
    if (ev.matches[matchIdx].number.includes((matchIdx + 1) + "")) {
        ev.matches[matchIdx].status = 'live';
        ev.matches[matchIdx].scores = data.scores;
        ev.matches[matchIdx].subscoresRed = data.subscoresRed;
        ev.matches[matchIdx].subscoresBlue = data.subscoresBlue;
        ev.matches[matchIdx].gameSubscores = data.gameSubscores;
        ev.matches[matchIdx].updatedTime = data.updatedTime;
        ev.matches[matchIdx].startTime = data.startTime;
    } else {
        console.log('Index mismatch');
    }
    ev.markModified('matches');
    return await ev.save();
}

module.exports = {updateEvent, fastUpdate};
