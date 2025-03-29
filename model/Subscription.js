const mongoose = require('mongoose'),
  Schema = mongoose.Schema;

var SubscriptionSchema = new Schema({
  "sub": {
      type: Object,
      required: true
  },
  "team": {
      type: Number
  },
  "event": {
      type: String
  }
},
{
  timestamps: true,
  strict: true
});

SubscriptionSchema.statics = {
  getTeam: function(team) {
    return this.find({
        "team": team,
      })
      .exec()
      .then(function(subs) {
        if (subs) {
          return subs;
        }
        return Promise.reject();
      });
  },
  getEvent: function(event) {
    return this.find({
        "event": event,
      })
      .exec()
      .then(function(subs) {
        if (subs) {
          return subs;
        }
        return Promise.reject();
      });
  },
  getOne: function (search) {
     return this.findOne(search)
      .exec()
      .then(function(subs) {
        if (subs) {
          return subs;
        }
        return Promise.reject();
      });
  }
};
module.exports = mongoose.model('Subscription', SubscriptionSchema);