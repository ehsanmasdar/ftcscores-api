// Helpers for transforming data from https://ftc-api.firstinspires.org/v2.0
const username = process.env.FTC_API_USERNAME;
const token = process.env.FTC_API_TOKEN;
const FTC_API_VERSION = "v2.0";
const FTC_API_YEAR = "2022";
const CURRENT_SEASON = "2223";

const crypto = require('crypto');
const base64url = require('base64url');

const base = `https://ftc-api.firstinspires.org/${FTC_API_VERSION}/${FTC_API_YEAR}/`;

const rp = require('request-promise').defaults({
    auth: {
        user: username,
        pass: token,
        sendImmediately: true
    },
    json: true,
    baseUrl: base
});
const teamHelper = require('./team');
const Event = require('../model/Event');


const googleMapsClient = require('@google/maps').createClient({
    key: process.env.GOOGLE_API_TOKEN,
    Promise: Promise
  });

async function getEvents() {
    return rp.get('/events');
}
async function getEvent(eventCode) {
    return await rp.get(`/events?eventCode=${eventCode}`);
}
async function getMatches(eventCode) {
    return rp.get(`/matches/${eventCode}`);
}
async function getHybridSchedule(eventCode, level) {
    return rp.get(`/schedule/${eventCode}/${level}/hybrid`);
}
async function getRankings(eventCode) {
    return rp.get(`/rankings/${eventCode}`)
}
async function getAlliances(eventCode) {
    return rp.get(`/alliances/${eventCode}`)
}

async function getScores(eventCode, level) {
    return rp.get(`/scores/${eventCode}/${level}`)
}

function getMatchNumber(desciption) {
    if (desciption.includes('Qualification')) {
        // Example Qualification 1 -> Q-1
        return `Q-${desciption.split(' ')[1]}`;
    } else if (desciption.includes('Semifinal')) {
        // Example Semifinal 1 Match 1 -> SF-1-1
        return `SF-${desciption.split(' ')[1]}-${desciption.split(' ')[3]}`;
    } else {
        // Example Finals Match 2 -> F-2
        return `F-${desciption.split(' ')[2]}`
    }
}

function getType(type) {
    switch(type) {
        case "FTC_Qualifier":
            return "Qualifier"
        case "FTC_Championship":
            return "Regional"
        case "FTC_FIRSTChampionship":
            return "World Championship"
        case "FTC_LeagueMeet":
            return "League"
        case "FTC_LeagueTournament":
            return "League Championship"
        default:
            return type
    }
}

async function getEventForFTCAPI(apiEvent) {
    //TODO  timezone
    let scoresData = {
        link: base64url(crypto.randomBytes(6)),
        season: CURRENT_SEASON,
        shortName: apiEvent.name,
        fullName: apiEvent.name,
        subtitle: apiEvent.divisionCode ? `${apiEvent.divisionCode} Division` : null,
        location: `${apiEvent.city}, ${apiEvent.stateprov}`,
        type: getType(apiEvent.type),
        program: "FTC",
        startDate: apiEvent.dateStart,
        endDate: apiEvent.dateEnd,
        status: 'Completed',
        from: 'ftc-api',
        firstEventCode: apiEvent.code,
        published: true,
        remote: apiEvent.remote
    };
    let location = await googleMapsClient.geocode({address: "1001 Avenida De Las Americas, Houston, TX 77010"}).asPromise();
    let lat = location.json.results[0].geometry.location.lat;
    let lon = location.json.results[0].geometry.location.lng;
    scoresData.locationCoords = {
        type: "Point",
        coordinates: [ lon, lat ]
    }
    return new Event(scoresData);
}

async function getAlliancesForFTCAPI(eventCode) {
    let alliances = (await getAlliances(eventCode))['alliances'];
    let alliancesOut = {};
    for (let alliance of alliances) {
        alliancesOut[alliance.number] = [alliance.captain, alliance.round1];
        if (alliance.round2) {
            alliancesOut[alliance.number].push(alliance.round2);
        }
    }
    return alliancesOut
}
function constructScoreObject(s) {
    return {
        auto: s.autoPoints,
        teleop: s.driverControlledPoints,
        // Negate because FTC API is reversed
        penalty: -s.penaltyPoints,
        end: s.endgamePoints,
        ...s
    };
}

async function getMatchesForFTCAPIRemoteEvent(eventCode) {
    let matches = (await getMatches(eventCode))['matches'];
    let qualScores = (await getScores(eventCode, 'qual'))['MatchScores'];
    let scoresMatches = [];
    for (let i = 0; i < matches.length; i++) {
        let match = matches[i];
        let scores = qualScores[i];
        let scoresMatch = {
            updateTime: new Date(match.postResultTime).getTime() || -1,
            scheduledTime: -1,
            resultPostedTime: new Date(match.postResultTime).getTime() || -1,
            startTime: new Date(match.actualStartTime).getTime(),
            gameSubscores: {
                blue: scores.scores,
                red: null
            },
            subscoresBlue: {
                pen: scores.scores.penaltyPoints,
                auto: scores.scores.autoPoints,
                teleop: scores.scores.dcPoints,
                end: scores.scores.endgamePoints
            },
            subscoresRed: null,
            scores: {
                blue: scores.scores.totalPoints,
                red: 0
            },
            teams: {
                'blue': [],
                'red': []
            },
            number: scores.matchNumber,
            state: "COMMITTED",
            status:	"done",
            order: scoresMatches.length
        }
        scoresMatch.teams['blue'].push({
            surrogate: false,
            number: scores.teamNumber
        });
        scoresMatches.push(scoresMatch);
    }
    return scoresMatches
}

function getScheduleTeam(matchTeam) {
    return {
        number: matchTeam.teamNumber,
        surrogate: matchTeam.surrogate
    }
}
async function getMatchesForFTCAPI(eventCode, alliances) {
    // TODOS:
    // Surrogates
    let qualMatches = (await getHybridSchedule(eventCode, 'qual'))['schedule'];
    let elimMatches = (await getHybridSchedule(eventCode, 'playoff'))['schedule'];
    let matches = qualMatches.concat(elimMatches);
    let qualScores = (await getScores(eventCode, 'qual'))['MatchScores'];
    let elimScores = (await getScores(eventCode, 'playoff'))['MatchScores'];
    let scores = qualScores.concat(elimScores);
    let scoresMatches = [];

    for (let i = 0; i < matches.length; i++) {
        let match = matches[i];
        // match finished
        if (match.scoreRedFinal != null) {

            
            let scoreBlue = scores[i].alliances[0];
            let scoreRed = scores[i].alliances[1];
            let scoresMatch = {
                updateTime: new Date(match.postResultTime).getTime() || -1,
                scheduledTime: -1,
                resultPostedTime: new Date(match.postResultTime).getTime() || -1,
                startTime: new Date(match.actualStartTime).getTime(),
                gameSubscores: {
                    blue: constructScoreObject(scoreBlue),
                    red: constructScoreObject(scoreRed)
                },
                subscoresBlue: null,
                subscoresRed: null,
                scores: {
                    'red': match.scoreRedFinal,
                    'blue': match.scoreBlueFinal
                },
                teams: {
                    'blue': [],
                    'red': []
                },
                number: getMatchNumber(match.description),
                state: "COMMITTED",
                status:	"done",
                order: scoresMatches.length
            }
            scoresMatch.subscoresBlue =  {
                pen: scoresMatch.gameSubscores.blue.penalty,
                tele: scoresMatch.gameSubscores.blue.teleop,
                auto: scoresMatch.gameSubscores.blue.auto,
                endg: scoresMatch.gameSubscores.blue.end
            }
            scoresMatch.subscoresRed =  {
                pen: scoresMatch.gameSubscores.red.penalty,
                tele: scoresMatch.gameSubscores.red.teleop,
                auto: scoresMatch.gameSubscores.red.auto,
                endg: scoresMatch.gameSubscores.red.end
            }

            if (scoresMatch.number.startsWith('Q-')) {
                scoresMatch.teams['red'].push({
                    surrogate: false,
                    number: match.teams[0].teamNumber
                });
                scoresMatch.teams['red'].push({
                    surrogate: false,
                    number: match.teams[1].teamNumber
                });
                scoresMatch.teams['blue'].push({
                    surrogate: false,
                    number: match.teams[2].teamNumber
                });
                scoresMatch.teams['blue'].push({
                    surrogate: false,
                    number: match.teams[3].teamNumber
                });
            } else {
                // Find red alliance
                let redAlliance = null;
                for (let allianceNum of Object.keys(alliances)) {
                    let alliance = alliances[allianceNum];
                    for (let team of alliance) {
                        if (team == match.teams[0].teamNumber) {
                            redAlliance = alliance;
                        }
                    }
                }
                let blueAlliance = null;
                for (let allianceNum of Object.keys(alliances)) {
                    let alliance = alliances[allianceNum];
                    for (let team of alliance) {
                        if (team == match.teams[2].teamNumber) {
                            blueAlliance = alliance;
                        }
                    }
                }
                for (let team of redAlliance) {
                    let played = match.teams[0].teamNumber == team || match.teams[1].teamNumber == team;
                    scoresMatch.teams['red'].push({
                        number: team,
                        surrogate: false,
                        missing: !played
                    });
                }
                for (let team of blueAlliance) {
                    let played = match.teams[2].teamNumber == team || match.teams[3].teamNumber == team;
                    scoresMatch.teams['blue'].push({
                        number: team,
                        surrogate: false,
                        missing: !played
                    });
                }
            }
            scoresMatches.push(scoresMatch);
        } else {
            let scoresMatch = {
                scheduledTime: -1,
                scores: {
                    'red': 0,
                    'blue': 0
                },
                teams: {
                    'blue': [getScheduleTeam(match.teams[2]), getScheduleTeam(match.teams[3])],
                    'red': [getScheduleTeam(match.teams[0]), getScheduleTeam(match.teams[1])],
                },
                number: getMatchNumber(match.description),
                state: "UNPLAYED",
                status:	"pending",
                order: scoresMatches.length
            }
            scoresMatches.push(scoresMatch);
        }
    }
    return scoresMatches;
}


async function getTeamForFTCAPI(eventCode) {
    let rankings = await getRankings(eventCode);
    let teams = rankings['Rankings'].map((ele) => ele.teamNumber);
    let out = await teamHelper.generateTeamList(teams);
    return out;
}

async function getRankingsForFTCAPI(eventCode, teamMap) {
    let rankings = (await getRankings(eventCode))['Rankings'];
    let scoresRankings = [];
    for (let ranking of rankings) {
        let team = ranking.teamNumber;
        scoresRankings.push({
            np: false,
            name: teamMap[team].name,
            number: team,
            rank: scoresRankings.length + 1,
            current: {
                qp: ranking.sortOrder1,
                rp: ranking.sortOrder2,
                tbp2: ranking.sortOrder3,
                highest: ranking.sortOrder6,
                matches: ranking.matchesPlayed
            },
        });
    }
    return scoresRankings;
}

module.exports = {
    getEvent,
    getEvents,
    getAlliancesForFTCAPI,
    getEventForFTCAPI,
    getTeamForFTCAPI,
    getMatchesForFTCAPI,
    getMatchesForFTCAPIRemoteEvent,
    getRankingsForFTCAPI,
}
