var mongoose = require('mongoose'),
  Schema = mongoose.Schema;
const mongoosastic = require('mongoosastic');
const Promise = require("bluebird");

var TeamSchema = new Schema({
  "number": {
    type: Number,
    required: true,
    es_indexed: true
  },
  "rookieYear": {
    type: Number
  },
  "name": {
    type: String,
    required: true,
    es_indexed: true
  },
  "nickname": {
    type: String,
    required: true,
    es_indexed: true
  },
  "city": {
    type: String,
    required: true,
    es_indexed: true
  },
  "state": {
    type: String,
    required: true,
    es_indexed: true
  },
  "postalcode": {
    type: String,
    required: true,
    es_indexed: true
  },
  "country": {
    type: String,
    required: true,
    es_indexed: true
  },
  "worldsYears": [Number],
  "url": String,
  "social": [{
    name: String,
    text: String,
    url: String,
    icon: String
  }]
}, {
  timestamps: true,
  strict: true
});

TeamSchema.statics = {
  get: function (number) {
    return this.findOne({
        "number": number,
      })
      .exec()
      .then(function (team) {
        if (team) {
          return team;
        }
        return Promise.reject();
      });
  },
  getNoFail: function (number) {
    if (isNaN(number))
      return Promise.resolve([]);
    return this.findOne({
        "number": number,
      })
      .exec()
      .then(function (team) {
        if (team) {
          return [team];
        }
        return [];
      });
  },
  list: function () {
    return this.find()
      .sort({
        number: -1
      })
      .exec();
  },
  search: function (str) {
    return this.find({
        $text: {
          $search: str
        }
      })
      .exec()
      .then(function (teams) {
        if (teams) {
          return teams;
        }
        return [];
      })
  },
};
TeamSchema.plugin(mongoosastic, {
  host: process.env.ELASTICSEARCH_HOST,
  index: process.env.REL + "-teams"
});
const Team = mongoose.model('Team', TeamSchema);
Team.search = Promise.promisify(Team.search);
module.exports = Team;
