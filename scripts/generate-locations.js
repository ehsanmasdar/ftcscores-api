var mongoose = require('mongoose');
const async = require('async');
const moment = require('moment');
const _ = require('lodash');
const BPromise = require('bluebird');

const googleMapsClient = require('@google/maps').createClient({
  key: process.env.GOOGLE_API_TOKEN,
  Promise: Promise
});

//Connect to DB server
//Disable auto-indexing to improve performance
mongoose.connect(`mongodb://${process.env.DB}`, { config: { autoIndex: false } });

//Load schema
var Schema = mongoose.Schema;
var Event = require('../model/Event.js');

//Connect to database
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'Connection error: '));

db.once('open', async () => {

  try {
    //Connected to DB!
    let events = await Event.find();

    for (var event of events) {
      console.log("Processing event " + event.link)

      //get geolocation information
      let location = await googleMapsClient.geocode({address: event.location}).asPromise();
      if (!location || !location.json || location.json.status !== "OK" || !location.json.results || !location.json.results.length) {
        return next({
          status: 400,
          message: "Location not found",
          errors: {
            location: "Please enter a valid city and state/region."
          }
        })
      }
      let formattedLocation = location.json.results[0].formatted_address;
      let lat = location.json.results[0].geometry.location.lat;
      let lon = location.json.results[0].geometry.location.lng;
      console.log(event.location, lon, lat, formattedLocation)

      await Event.findOneAndUpdate({ link: event.link }, { $set: {
        locationCoords: {
          type: "Point",
          coordinates: [ lon, lat ]
        }
      }})
    }

    console.log("Done!");
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }

})
