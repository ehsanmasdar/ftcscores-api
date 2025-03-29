const mongoose = require('mongoose');
const mongoosastic = require('mongoosastic');
const Promise = require("bluebird");
const Schema = mongoose.Schema;
const mongoose_delete = require('mongoose-delete');
const moment = require('moment');
const _ = require('lodash');

const CURRENT_SEASON = "2223";
const SEASON_LIST =
 [ "1617", "1718", "1819", "1920", "2021", "2122", "2223" ];
const FROM_TYPES = ["local", "ftc-api"];
const EventSchema = new mongoose.Schema({
  "link": {
    type: String,
    required: true,
    unique: true
  },
  "season": {
    type: String,
    required: true,
    enum: SEASON_LIST,
    es_indexed: true
  },
  "shortName": {
    type: String,
    required: true,
    es_indexed: true
  },
  "fullName": {
    type: String,
    required: true,
    es_indexed: true
  },
  "streamLink": String,
  "subtitle": {
    type: String,
    es_indexed: true
  },
  "brandingBanner": String,
  "location": {
    type: String,
    required: true,
    es_indexed: true
  },
  "locationCoords": {
    type: { type: String },
    coordinates: [Number],
  },
  "isFinals": {
    type: Boolean,
    required: true,
    default: false
  },
  "url": String,
  "type": {
    type: String,
    required: true
  },
  "endDate": {
    type: Date
  },
  "startDate": {
    type: Date
  },
  "program": {
    type: String,
    required: true
  },
  "matches": Array,
  "rankings": {
    type: Array
  },
  "teams": {
    type: Object
  },
  "teamKey": {
    type: [Number],
    index: true
  },
  "topMatches": {
    type: Array
  },
  "topTeams": {
    type: Array
  },
  "latestMatch": {
    type: String
  },
  "status": {
    type: String,
    default: "Starting soon"
  },
  "prettyDate": {
    type: String
  },
  "published": {
    type: Boolean,
    default: false
  },
  "combinedEvents": {
    type: [String]
  },
  "combinedRankings": {
    type: Schema.Types.ObjectId,
    ref: 'CombinedRanking'
  },
  "_creator": {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  "desktopConnected": {
    type: Boolean,
    default: false
  },
  "bannerMessage": {
    type: String
  },
  "from": {
    type: String,
    required: true,
    enum: FROM_TYPES,
    default: "local"
  },
  "firstEventCode": {
    type: String,
    es_indexed: true
  },
  "remote": {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  strict: true,
  usePushEach: true
});

EventSchema.index({ "locationCoords": "2dsphere" });

EventSchema.statics = {
  get: function (link) {
    return this.findOne({
        "link": link,
        "deleted": false
      })
      .populate('_creator')
      .populate('combinedRankings')
      .exec()
      .then(function (ev) {
        if (ev) {
          return ev;
        }
        return Promise.reject(new Error(`Event ${link} not found`));
      });
  },
  getLimited: function (link) {
    return this.findOne({
        "link": link,
        "deleted": false
      })
      .select('-matches -teams -rankings -combinedRankings')
      .populate('_creator')
      .exec()
      .then(function (user) {
        if (user) {
          return user;
        }
        return Promise.reject();
      });
  },
  checkExistance: function (link) {
    return this.findOne({
        "link": link,
        "deleted": false
      })
      .exec()
      .then(function (user) {
        if (user) {
          return true;
        }
        return false;
      });
  },
  checkExistanceFIRST: function (firstEventCode) {
    return this.findOne({
        "firstEventCode": firstEventCode,
        "deleted": false
      })
      .exec()
      .then(function (event) {
        if (event) {
          return event;
        }
        return null;
      });
  },
  list: function (season) {
    return this.find({
        "deleted": false,
        "published": true,
        "season": season
      })
      .select('-matches -teams -rankings -topMatches -topTeams -combinedRankings')
      .sort({
        startDate: -1,
        createdAt: -1
      })
      .exec();
  },
  listByDay: async function(predicate, recentFirst=false, geoNearQuery=null) {
    let eventsQuery = this.aggregate();

    if (geoNearQuery) {
      geoNearQuery.query = predicate;
      eventsQuery.near(geoNearQuery);
    } else {
      eventsQuery.match(predicate);
    }

    eventsQuery
    .project({
      matches: 0,
      teams: 0 
    })
    .sort({ shortName: 1 })
    .project({
      teamKey: 0,
      rankings: 0,
      topMatches: 0,
      topTeams: 0,
      __v: 0,
      _creator: 0,
      _id: 0,
    })
    .project({
      event: "$$ROOT",
      date: "$startDate"
      // date: { $ifNull: [ "$startDate", "$dateCreated" ] }
    })
    .sort({
      date: -1
    })
    .project({
      event: "$$ROOT",
      day : { $substr: ["$date", 0, 10] } //first 10 characters of date mm-dd-yyyy
    })
    .group({
      _id: {
        day: "$day"
      },
      events: {
        $push: "$event"
      }
    })
    .sort({
      "_id.day": recentFirst ? 1 : -1
    });

    let events = await eventsQuery;

    return _.map(events, (e) => {
      // var month = e._id.month;
      // var year = e._id.year;
      // var week = e._id.week;
      // var startDate = moment().utc().day("Monday").year(year).week(week).startOf('day');
      // e.startDate = startDate.toDate();
      // e.endDate = startDate.add(6, 'days').toDate();
      // e.weeksSinceKickoff = Math.abs(moment(SEASON_DATA[req.params.season].kickoff).diff(startDate, 'weeks'));

      e.date = e._id.day;
      e.day = e.date ? moment(e.date).format("D") : "";
      e.month = e.date ? moment(e.date).format("MMMM") : "Unknown";
      e.year = e.date ? moment(e.date).format("YYYY") : "";

      e.events = _.map(e.events, function(event) {
        event = event.event;
        event.teamCount = ('teams' in event) ? Object.keys(event.teams).length : 0;
        event.matchCount = ('matches' in event) ? event.matches.length : 0;
        event.teamListAvailable = ('teams' in event) && (Object.keys(event.teams).length > 0);
        event.matchListAvailable = ('matches' in event) && (event.matches.length > 0);
        delete event.matches;
        delete event.teams;
        delete event.locationCoords;
        return event;
      })

      delete e._id;
      return e;
    })
  },
  listByWeek: function(season) {
    return this.aggregate().match({
      "season": season,
      "deleted": false,
      "published": true,
    })
    .project({
      matches: 0,
      teams: 0,
      teamKey: 0,
      rankings: 0,
      topMatches: 0,
      topTeams: 0,
      __v: 0,
      _creator: 0,
      _id: 0,
    })
    .project({
      date: { $ifNull: [ "$startDate", "$dateCreated" ] }
    })
    .sort({
      date: -1
    })
    .project({
      event: "$$ROOT",
      year: { $year: [ "$date" ] },
      month: { $month: [ "$date" ] },
      week: { $isoWeek: [ "$date" ] }
    })
    .group({
      _id: {
        year: "$year",
        month: "$month",
        week: "$week"
      },
      events: {
        $push: {
          event: "$event"
        }
      }
    })
    .sort({
      "_id.year": -1,
      "_id.month": -1,
      "_id.week": -1
    })
  },
  listLimited: function() {
    return this.find({
      "deleted": false,
      "status": {$in:["Starting soon", "Live"]},
      "published": true,
      "season": CURRENT_SEASON
    })
    .select('-matches -teams -rankings -combinedRankings')
    .sort({
      startDate: -1,
      createdAt: -1
    })
    .exec();
  }
};

EventSchema.plugin(mongoose_delete);
EventSchema.plugin(mongoosastic, {
  host: process.env.ELASTICSEARCH_HOST,
  index: process.env.REL + "-events"
});

const Event =  mongoose.model('Event', EventSchema);
Event.search = Promise.promisify(Event.search);
module.exports = Event;
