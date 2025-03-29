var mongoose = require('mongoose'),
  Schema = mongoose.Schema,
  passportLocalMongoose = require('passport-local-mongoose');

var User = new Schema({
  "firstName": {
    type: String,
    required: true
  },
  "lastName": {
    type: String,
    required: true
  },
  "phone": {
    type: String
  },
  "region": {
    type: String
  },
  "apiKey": {
    type: String,
    required: true
  },
  "verifiedEmail": {
    type: Boolean,
    required: true
  },
  "token": {
    type: String,
    required: true
  },
  "admin": {
    type: Boolean,
    default: false
  },
  "createdOn": {
    type: Date
  },
  "lastLogin": {
    type: Date
  }
}, { toJSON: { virtuals: true }, toObject: { virtuals: true }});

User.virtual('enabled').get(function () {
  return !!this.apiKey;
})

User.plugin(passportLocalMongoose, {
  passwordValidator: function (password, cb) {
    if (password.length < 8) {
      cb("Password must be at least 8 characters");
    }
    cb();
  },
  usernameLowerCase: true
});

module.exports = mongoose.model('User', User);
