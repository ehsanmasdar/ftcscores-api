
const rp = require('request-promise')
const Team = require('../model/Team');


async function getTeamFromFIRST(team) {
    let json_struct = { "query": { "bool": { "must": [{ "match": { "team_number_yearly": team } }, { "bool": { "should": [{ "match": { "team_type": "FTC" } }] } }, { "bool": { "should": [{ "match": { "fk_program_seasons": "311" } }, { "match": { "fk_program_seasons": "309" } }, { "match": { "fk_program_seasons": "313" } }, { "match": { "fk_program_seasons": "307" } }] } }] } }, "sort": "team_nickname.raw" }
    var url = "https://es02.firstinspires.org/teams/_search?size=5000&from=0&source_content_type=application/json&source=" + encodeURIComponent(JSON.stringify(json_struct));
    try {
        let parsed = await rp.get(url, { json: true });

        if (parsed.hits && parsed.hits.total.value > 0) {
            var data = parsed.hits.hits[0]._source;
            const team = new Team({
                number: data.team_number_yearly,
                rookieYear: data.team_rookieyear,
                name: data.team_name_calc,
                nickname: data.team_nickname,
                city: data.team_city,
                state: data.team_stateprov,
                postalcode: data.team_postalcode,
                url: data.team_web_url,
                country: data.team_country,
                worldsYears: [],
                social: []
            });
            if (data.events) {
                for (var i = 0; i < data.events.length; i++) {
                    // They changed the name for 2015 season
                    if (data.events[i].event_name.includes("World Championship")) {
                        team.worldsYears.push(parseInt(data.events[i].event_season) + 1);
                    }
                }
            }
            return team;
        }

    } catch (e) {
        console.error(e);
    }
    return null;
}

async function generateTeamList(teams) {
    let teamsOut = {}
    for (let team of teams) {
        try {
            let teamData = await Team.get(team);
            teamsOut[team] = {
                name: teamData.nickname,
                school: teamData.name,
                city: teamData.city,
                state: teamData.state,
                country: teamData.country,
                rookie: teamData.rookieYear,
                number: parseInt(team)
            };
        } catch (e) {
            teamsOut[team] = {
                name: "",
                school: "",
                city: "",
                state: "",
                country: "",
                rookie: -1,
                number: parseInt(team)
            };
        }
    }
    return teamsOut;
};

module.exports = {
    getTeamFromFIRST,
    generateTeamList
};
