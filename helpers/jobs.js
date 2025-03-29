const opr = require('../helpers/opr.js');

const Agenda = require('agenda');
const ftcapi = require('./ftcapi');
const agenda = new Agenda({db: {address: process.env.DATABASE_PORT_27017_TCP_ADDR}});
const {
    computeTopMatchesFTC,
    computeTopTeamsFTC,
    computeLatestMatchFTC,
    mixRankingsIntoTeam,
    mixNamesIntoMatches,
    generateRankingsIfBlank
} = require('./computation.js');
const _ = require('lodash');
const {
    sendNotification
} = require('./notificationdispatch');

const Event = require('../model/Event');
async function update(eventCode) {
    let exists = await Event.checkExistanceFIRST(eventCode);
    if (exists) {
        console.log('updating existing event: ' + eventCode);
    }
    let ev = exists ? exists : await ftcapi.getEventForFTCAPI(eventCode);
    let teams = await ftcapi.getTeamForFTCAPI(eventCode);
    let alliances = await ftcapi.getAlliancesForFTCAPI(eventCode);
    let newMatches = await ftcapi.getMatchesForFTCAPI(eventCode, alliances);
    let rankings = await ftcapi.getRankingsForFTCAPI(eventCode, teams);
    newMatches = mixNamesIntoMatches(newMatches, rankings);
    // If event has data
    if (newMatches.length > 0) {
        for (var match of newMatches) {
            for (var oldMatch of ev.matches) {
                if (match.number == oldMatch.number) {
                    if (!_.isEqual(oldMatch, match)) {
                        if (match.status == "done") {
                            if (ev.published) {
                                console.log(`Sending notification for ${ev.link}-${match.number}`)
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
        ev.teams = teams;
        ev.matches = newMatches;
        ev.rankings = rankings;

        ev.topMatches = computeTopMatchesFTC(newMatches);
        ev.topTeams = computeTopTeamsFTC(rankings);
        ev.latestMatch = computeLatestMatchFTC(newMatches);
        ev.teamKey = Object.keys(teams);

        // Mixins
        // ev.rankings = opr.compute(matches, generateRankingsIfBlank(rankings, teams), ev.season);
        ev.teams = mixRankingsIntoTeam(rankings, teams);
        ev.status = 'Live';
        await ev.save();
    }

}
agenda.define('update_single_job', async (job, done) => {
    await update(job.attrs.data.event.code);

    await done();
})

agenda.define('update_single_job_div_2', async (job, done) => {
    await update(job.attrs.data.event.code);

    await done();
})

agenda.define('update_events_from_first', { concurrency: 1, priority: "high" }, async (job, done) => {
    let eventsList = (await ftcapi.getEvents())['events'];
    for (let event of eventsList) {
        if (!event.published || event.remote) {
            continue;
        }
        await agenda.now("update_single_job", {event: event})
    }
    await done();
});

agenda.on('ready', async function() {
    await agenda.start();
    if (process.env.FIRST_API_ENABLED) {
        // await agenda.every('15 seconds', 'update_single_job', {event: {code: "FTCCMP1FRNK"}});
        // await agenda.every('15 seconds', 'update_single_job_div_2', {event: {code: "FTCCMP1JEMI"}});
    }
});

module.exports = {
    agenda
};
