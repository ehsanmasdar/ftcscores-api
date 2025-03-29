const express = require('express');
const router = express.Router();
const passport = require('passport');
const _ = require('lodash');
const uuidV4 = require('uuid/v4');
const validate = require('express-validation');
const httpStatus = require('http-status');
const crypto = require('crypto');
const base64url = require('base64url');
const cache = require('../helpers/cache').cache;

const User = require('../model/User.js');
const UserPasswordReset = require('../model/UserPasswordReset');
const Event = require('../model/Event.js');
const schema = require('../helpers/validate.js');
const { ensureLoggedIn, isAdmin, DISALLOW_PUSH_ON_EVENT_STATUS } = require('../helpers/auth');

const email = require('../helpers/email');

router.get('/', ensureLoggedIn, function (req, res) {
  res.json(schema.filterUser(req.user));
});

router.put('/', ensureLoggedIn, validate(schema.changeUser), function (req, res) {
  // Update session
  Object.assign(req.user, req.body);
  User.findById(req.user._id).then((doc) => {
    Object.assign(doc, req.body);
    doc.save().then(() => {
      res.json(schema.filterUser(doc.toObject()));
    });
  })
});

router.get('/admin/all', ensureLoggedIn, isAdmin, function (req, res) {
  User.find()
  .select("-token")
  .sort({ firstName: 1 })
  .then((docs) => {
    docs = docs.map((doc) => {
      return schema.filterUser(doc.toObject());
    });
    res.json(docs);
  })
});

router.get('/admin/:userId', ensureLoggedIn, isAdmin, function (req, res) {
  User.findOne({_id: req.params.userId})
  .select("-token")
  .then((doc) => {
    if (doc) {
      res.json(schema.filterUser(doc.toObject()));
    } else {
      res.status(httpStatus.NOT_FOUND).json({
        message: "User not found"
      })
    }
  })
});

router.put('/admin/:userId', ensureLoggedIn, isAdmin, validate(schema.changeUserAdmin), function (req, res) {
  User.findOne({_id: req.params.userId}).then((doc) => {
    Object.assign(doc, req.body);
    if (doc) {
      doc.save().then(() => {
        res.json(schema.filterUser(doc.toObject()));
      });
    } else {

    }
  })
});

router.get('/admin/:userId/events', ensureLoggedIn, isAdmin, function (req, res, next) {
  var query = {
    "_creator": req.params.userId,
    "deleted": false
  };
  if (req.query.season) {
    query.season = req.query.season;
  }

  Event.find(query).then(function (ev) {
    ev = _.map(ev, function (e) {
      return schema.filterEvent(e.toObject());
    });
    res.json(ev);
  })
  .catch(next)
});

router.post('/admin/:userId/disable', ensureLoggedIn, isAdmin, async function(req, res, next) {
  try {
    let user = await User.findOne({ _id: req.params.userId });
    if (!user) {
      return res.status(httpStatus.NOT_FOUND).send({ message: "User not found" })
    }
    if (!user.apiKey) {
      return res.status(httpStatus.BAD_REQUEST).send({ message: "User already disabled" })
    }

    await User.findOneAndUpdate({ _id: req.params.userId }, { $unset: { "apiKey": 1 }});

    res.send({ message: "Successfully disabled user"})
  } catch (e) { next(e) }
})

router.post('/admin/:userId/enable', ensureLoggedIn, isAdmin, async function(req, res, next) {
  try {
    let user = await User.findOne({ _id: req.params.userId });
    if (!user) {
      return res.status(httpStatus.NOT_FOUND).send({ message: "User not found" })
    }
    if (!!user.apiKey) {
      return res.status(httpStatus.BAD_REQUEST).send({ message: "User already enabled" })
    }

    await User.findOneAndUpdate({ _id: req.params.userId }, { $set: {
      "apiKey": uuidV4()
    }});

    res.send({ message: "Successfully enabled user. Their API key has been reset"})
  } catch (e) { next(e) }
})

router.post('/password/requestresetemail', validate(schema.forgotPassword), function (req,res,next) {
  User.findByUsername(req.body.username).then(function (doc) {
    if (doc) {
      var request = new UserPasswordReset({
        username: req.body.username,
        token: base64url(crypto.randomBytes(16))
      })
      request.save().then(function (reset) {
        email.sendPasswordResetEmail(doc.toObject(), reset.token, (err) => {
          if (err) {
            res.status(httpStatus.INTERNAL_SERVER_ERROR).json({message: "Error sending email"});
          }
          res.json({message: "Check your email for reset instructions"});
        })
      })
    } else {
      res.status(httpStatus.BAD_REQUEST).json({message: "Account not found"});
    }
  });
})

router.get('/events', ensureLoggedIn, function (req, res, next) {
  var query = {
    "_creator": req.user._id,
    "deleted": false
  };
  if (req.query.season) {
    query.season = req.query.season;
  }

  Event.find(query).then(function (ev) {
    ev = _.map(ev, function (e) {
      return schema.filterEvent(e.toObject());
    });
    res.json(ev);
  })
  .catch(next)
});

router.get('/events/pushable', ensureLoggedIn, function (req, res, next) {
  var query = {
    "_creator": req.user._id,
    "deleted": false,
    "status": { $not: { $in: DISALLOW_PUSH_ON_EVENT_STATUS }}
  };
  if (req.query.season) {
    query.season = req.query.season;
  }

  Event.find(query).then(function (ev) {
    ev = _.map(ev, function (e) {
      return schema.filterEvent(e.toObject());
    });
    res.json(ev);
  })
  .catch(next)
});

router.post('/register', validate(schema.register), schema.validatePhoneNumber, function (req, res, next) {
  const user = {
    username: req.body.username,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    phone: req.body.phone,
    region: req.body.region,
    apiKey: uuidV4(),
    token: base64url(crypto.randomBytes(16)),
    verifiedEmail: false,
    createdOn: Date.now()
  };
  User.register(new User(user), req.body.password, function (err) {
    if (err) {
      err.status = 400;
      return next(err);
    }
    email.sendVerificationEmail(user, (err) => {
      if (err) {
        res.status(httpStatus.BAD_REQUEST).json({
          message: "We couldn't send the email. Try again in a few minutes."
        })
      } else {
        User.find({admin: true}).then((docs) => {
          var emails = docs.map((doc) => doc.username);
          email.sendRegistrationNotification(user, emails);
        });
        res.json({
          message: "User registered"
        });
      }
    });
  });
});

router.post('/verify/:token', function (req, res, next) {
  User.findOne({token: req.params.token}).then(function (doc){
    if (doc && doc.verifiedEmail) {
      res.status(httpStatus.BAD_REQUEST).json({message: "Account already verified! Please log in."});
    } else if (doc) {
      doc.verifiedEmail = true;
      doc.save();
      res.send({message: "Email verified!"});
    } else {
      res.status(httpStatus.BAD_REQUEST).json({message: "Account not found!"});
    }
  }, next);
});

router.post('/password/reset/:token', validate(schema.resetPassword), function (req, res, next) {
  UserPasswordReset.findOne({token: req.params.token}).then(function (doc){
    if (doc) {
      User.findByUsername(doc.username).then(function (user){
        user.setPassword(req.body.newPassword, function (err, user) {
          if (err) {
            res.status(httpStatus.INTERNAL_SERVER_ERROR).json({message: "Error changing password"});
          }
          Promise.all([doc.remove(), user.save()]).then(function (){
            res.send({message: "Successfully reset password"});
          }, next);
        });
      });
    } else {
      res.status(httpStatus.BAD_REQUEST).json({message: "Reset token invalid or already used."});
    }
  }, next);
});

router.post('/password/change', ensureLoggedIn, validate(schema.changePassword), function (req, res, next) {
  User.findOne({_id: req.user._id}).then(function (doc) {
    if (doc) {
      doc.authenticate(req.body.oldPassword, function (err, user, message){
        if (!err && user) {
          doc.setPassword(req.body.newPassword, function (err, user){
            if (err) {
              res.status(httpStatus.INTERNAL_SERVER_ERROR).json({message: "Error changing password"});
            }
            doc.save(function (err){
              if (err) {
                res.status(httpStatus.INTERNAL_SERVER_ERROR).json({message: "Error changing password"});
              }
              else {
                req.logout();
                res.json({message: "Successfully changed password"});
              }
            });
          })
        } else {
          res.status(httpStatus.BAD_REQUEST).json({message: "Current password is incorrect"});
        }
      });
    } else {
      res.status(httpStatus.BAD_REQUEST).json({message: "Account not found"});
    }
  }, next);
});

router.post('/password/requestresetemail', validate(schema.forgotPassword), function (req,res,next) {
  User.findByUsername(req.body.username).then(function (doc) {
    if (doc) {
      var request = new UserPasswordReset({
        username: req.body.username,
        token: base64url(crypto.randomBytes(16))
      })
      request.save().then(function (reset) {
        email.sendPasswordResetEmail(doc.toObject(), reset.token, (err) => {
          if (err) {
            res.status(httpStatus.INTERNAL_SERVER_ERROR).json({message: "Error sending email"});
          }
          res.json({message: "Check your email for reset instructions"});
        })
      })
    } else {
      res.status(httpStatus.BAD_REQUEST).json({message: "Account not found"});
    }
  });
})

router.post('/login', function (req, res, next) {
  passport.authenticate('local', async (err, user, info) => {
    if (err) {
      return next(err);
    } else if (!user) {
      return next({ status: httpStatus.UNAUTHORIZED, message: "Email and password do not match" });
    }

    if (!user.enabled) {
      return next({ status: httpStatus.UNAUTHORIZED, message: "Your account has been disabled. Please contact support if this is in error." });
    }
    if (!user.verifiedEmail) {
      return next({ status: httpStatus.UNAUTHORIZED, message: "Please verify your email before logging in" });
    }

    await User.findOneAndUpdate({ _id: user._id }, { $set: { lastLogin: Date.now() }});

    req.logIn(user, function(err) {
      if (err) { return next(err); }

      res.json(schema.filterUser(req.user.toObject()));
    });
  })(req, res, next)
});

router.post('/logout', function (req, res) {
  req.logout();
  res.send({ message: "Logged out successfully" })
});

router.get('/regions', cache.route({expire: 30*60}), function(req, res) {
  const regions = {
    "United States": [
      "Alaska",
      "Alabama",
      "Arizona",
      "Arkansas",
      "California - Los Angeles",
      "California - North",
      "California - San Diego",
      "Colorado",
      "Connecticut",
      "Delaware",
      "Florida",
      "Georgia",
      "Hawaii",
      "Idaho",
      "Illinois",
      "Indiana",
      "Iowa",
      "Kentucky",
      "Louisiana",
      "Maryland",
      "Massachusetts",
      "Michigan - FiM",
      "Michigan - HIS",
      "Minnesota",
      "Mississippi",
      "Missouri",
      "Montana",
      "Nebraska",
      "Nevada",
      "New Hampshire",
      "New Jersey",
      "New York - Excelsior",
      "New York - Hudson Valley",
      "New York - NYC",
      "New York - Long Island",
      "North Carolina",
      "North Dakota",
      "Ohio",
      "Oklahoma",
      "Oregon",
      "Pennsylvania",
      "Rhode Island",
      "South Carolina",
      "Texas - Arlington",
      "Texas - Houston",
      "Texas - Lubbock",
      "Texas - San Antonio",
      "Utah",
      "Vermont",
      "Virginia",
      "Washington",
      "West Virginia",
      "Wisconsin",
      "Wyoming"
    ],
    "North America": [
      "United States - Territory",
      "United States - Not Listed",
      "Canada - British Columbia",
      "Canada - Ontario",
      "Canada - Quebec",
      "Canada - Other",
      "Mexico",
      "North America - Other"
    ],
    "Europe": [
      "Czech Republic",
      "France",
      "Netherlands",
      "Romania",
      "Russia",
      "Europe - Other"
    ],
    "Asia": [
      "China",
      "China - Hong Kong",
      "India",
      "Japan",
      "Taiwan",
      "South Korea",
      "Asia - Other"
    ],
    "Middle East": [
      "Egypt",
      "Israel",
      "Lebanon",
      "Middle East - Other"
    ],
    "Africa": [
      "South Africa",
      "Africa - Other"
    ],
    "Australia": [
      "Australia",
      "Australia - Other",
      "New Zealand"
    ],
    "Other": [
      "Not Listed"
    ]
  };
  res.json(regions);
});

module.exports = router;
