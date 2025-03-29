var mongoose = require('mongoose'),
  Schema = mongoose.Schema;
var UserPasswordReset = new Schema({
  "time": {
    type: Date,
    expires: 3600,
    default: Date.now
  },
  "token": {
      type: String,
      required: true
  },
  "username": {
      type: String,
      required: true
  }
});

module.exports = mongoose.model('UserPasswordReset', UserPasswordReset);