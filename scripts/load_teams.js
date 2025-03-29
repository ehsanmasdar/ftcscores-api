const teamHelper = require('../helpers/team');
const mongoose = require('mongoose');
mongoose.Promise = require('bluebird');
mongoose.connect(process.env.DATABASE_PORT_27017_TCP_ADDR);

const Team  = require('../model/Team');

const maxTeam = 25000;

async function main() {
    for (let i = 0; i < maxTeam; i++) {
        try {
            const team = await teamHelper.getTeamFromFIRST(i);
            if (team) {
                console.log('Loaded', i);
                await team.save();
            } else {
                console.log('Error', i);
            }
        } catch(e) {
            console.log('Error', e);
        }
       
    }
    console.log('ended', i)
}

main().catch(e => {
    console.error(e);
}) 
