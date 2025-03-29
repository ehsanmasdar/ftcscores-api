var mongoose = require('mongoose');
const async = require('async');
const opr = require('../helpers/opr.js');
const _ = require('lodash');

//Connect to DB server
//Disable auto-indexing to improve performance
mongoose.connect(`mongodb://${process.env.DB}`, { config: { autoIndex: false } });

//Load schema
var Schema = mongoose.Schema;
var Event = require('../model/Event.js');

//Connect to database
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'Connection error: '));

db.once('open', () => {
  //Connected to DB!
  Event.find()
    .then((events) => {
      async.each(events, (event, cb) => {
        if (event.rankings && event.rankings.length > 0) {
          try {
            console.log("Recomputing OPR for event " + event.shortName + ` (${event.link})...`);
            let rankings = opr.compute(event.matches, event.rankings, event.season);
            Event.findOneAndUpdate({ link: event.link }, { "$set": { rankings: rankings } })
              .then(() => { cb(null); })
              .catch((err) => { cb(err); });
          } catch (err) {
            console.error(err);
            cb(null);
          }
        } else {
          cb(null);
        }
      }, (err) => {
        if (err) {
          console.error(err);
          process.exit(1);
        }
        else {
          console.log("Done!");
          process.exit(0);
        }
      });
    });
});