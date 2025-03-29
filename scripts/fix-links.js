var mongoose = require('mongoose');
const async = require('async');

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
      if (event.link.startsWith("1617velv-")) {
        Event.findOneAndUpdate({ link: event.link }, { link: "1617-" + event.link.substring(9), season: "1617", status: "Completed" }, (err) => {
          cb(err);
        });
      } else if (event.link.startsWith("tpa-")) {
        Event.findOneAndUpdate({ link: event.link }, { link: "1617-" + event.link.substring(4), season: "1617", status: "Completed" }, (err) => {
          cb(err);
        });
      } else if (event.link.startsWith("1617-")) {
        Event.findOneAndUpdate({ link: event.link }, { season: "1617", status: "Completed" }, (err) => {
          cb(err);
        });
      } else if (event.link.startsWith("1718-")) {
        Event.findOneAndUpdate({ link: event.link }, { season: "1718" }, (err) => {
          cb(err);
        });
      } else {
        console.log("Unknown event " + event.link);
        cb(null);
      }
    }, (err) => {
      if (err) console.error(err);
      console.log("Done!");
    })
  })
});
