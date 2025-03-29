const teamHelper = require('../helpers/team');
const mongoose = require('mongoose');
mongoose.Promise = require('bluebird');
mongoose.connect(process.env.DATABASE_PORT_27017_TCP_ADDR);
const Event = require('../model/Event');
const Team  = require('../model/Team');

async function main() {
    const events = await Event.find({
        season: '1920'
    });
    for (let event of events) {
        console.log('Working on event', event.link)
        if ("teams" in event) {
            for (let team of Object.keys(event["teams"])) {
                try {
                    let newTeam =  await Team.get(team)
                    if (newTeam.nickname != event["teams"][team].name) {
                        console.log('replacing team', newTeam.nickname, event["teams"][team].name);
                    }
                    event["teams"][team].country = newTeam.country;
                    event["teams"][team].state = newTeam.state;
                    event["teams"][team].city = newTeam.city;
                    event["teams"][team].school = newTeam.name;
                    event["teams"][team].name = newTeam.nickname;
                } catch(e) {
                    console.log('did not find', team);
                }
            }
        }
        await event.markModified('teams');
        await event.save();
    }
}

main()