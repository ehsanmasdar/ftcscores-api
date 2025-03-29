var mongoose = require('mongoose');
const async = require('async');
const BPromise = require('bluebird');
const _ = require('lodash');

//Connect to DB server
//Disable auto-indexing to improve performance
mongoose.connect(`mongodb://${process.env.DB}`, { config: { autoIndex: false } });

//Load schema
var Schema = mongoose.Schema;
var Event = require('../model/Event.js');
var CombinedRanking = require('../model/CombinedRanking.js');

const { calcCombinedRanking } = require('../helpers/ranking');

//Connect to database
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'Connection error: '));

function retrieveEvent(link) {
  return new Promise(function (resolve, reject) {
    Event.findOne({ link: link }).then(function (ev) {
      resolve(ev);
    }).catch(function (e) {
      console.error(e)
      reject({ status: 404, message: `Event '${link}' not found` });
    });
  });
}

db.once('open', async () => {
  //Connected to DB!
  try {
    const events = Event.find({ });

    await BPromise.mapSeries(events, async (event) => {
      try {
        console.log("Computing event ", event.link)

        if (!_.isArray(event.combinedEvents) || event.combinedEvents.length < 1) {
          console.warn("Nothing to do for event")
          return;
        }

        var set = event.combinedEvents;
        //add self to set
        set.push(event.link);

        //retrieve all event data
        const combinedEvents = await Promise.all(set.map(retrieveEvent));
        const combinedRankings = await calcCombinedRanking(combinedEvents);
        // console.log(combinedRankings)
        await CombinedRanking.findOneAndUpdate({ _id: event.combinedRankings }, { $set: { ranking: combinedRankings }});
        // await Event.findOneAndUpdate({ link: event.link }, { $set: { combinedRankings: combinedRankings || [ ] } });
      } catch (e) {
        console.error(e);
        process.exit(1);
      }
    })

    console.log("Done!");
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }


});
