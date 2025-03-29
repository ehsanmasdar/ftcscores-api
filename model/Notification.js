const mongoose = require('mongoose'),
  Schema = mongoose.Schema;

var NotificationSchema = new Schema({
  "body": {
      type: String,
      required: true
  },
  "title": {
      type: String,
      required: true
  },
  "team": Number,
  "event": String,
  "apple": Boolean
},
{
  timestamps: true,
  strict: true
});

NotificationSchema.statics = {
  get: function (id) {
     return this.findOne({
        "_id": id
     })
      .exec()
      .then(function(subs) {
        if (subs) {
          return subs;
        }
        return Promise.reject();
      });
  }
};
module.exports = mongoose.model('Notification', NotificationSchema);