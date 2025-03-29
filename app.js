//force pwetty colors
process.env.FORCE_COLOR = 1;

//ensure promise rejections aren't silent
(require('loud-rejection'))();

const express = require('express');
const app = express();
const server = require('http').Server(app);
module.exports = server;

const fs = require('fs');
if (fs.existsSync('.env')) {
  require('dotenv').config();
}
const cors = require('cors');
const mongoose = require('mongoose');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const httpStatus = require('http-status');
const session = require('express-session');
const MongoStore = require('connect-mongo')(session);
const passport = require('passport');
const validate = require('express-validation');
const chalk = require('chalk');
const util = require('util');
const _ = require('lodash');

// Bugsnag setup
function getVersion() {
  if (fs.existsSync('version')) {
    return fs.readFileSync('version').toString().trim();
  }
  return null;
}
const bugsnag = require('@bugsnag/js')
const bugsnagExpress = require('@bugsnag/plugin-express')
let bugsnagMiddleware = null;
if (process.env.BUGSNAG_API) {
  const bugsnagClient = bugsnag({
    apiKey: process.env.BUGSNAG_API,
    releaseStage: process.env.REL,
    appVersion: getVersion()
  })
  console.log('Running version: ' + getVersion());
  bugsnagClient.use(bugsnagExpress)
  bugsnagMiddleware = bugsnagClient.getPlugin('express')

  // This must be the first piece of middleware in the stack.
  // It can only capture errors in downstream middleware
  app.use(bugsnagMiddleware.requestHandler)
}

const errorHelper = require('./helpers/errors.js')

console.log(chalk.gray("==========================================="));
console.log(chalk.gray(`FTCScores Server Starting`));


mongoose.connect(process.env.DATABASE_PORT_27017_TCP_ADDR, {connectTimeoutMS: 60000, family: 4});
console.log("Database IP:" + process.env.DATABASE_PORT_27017_TCP_ADDR);

app.set('port', (process.env.PORT || 5000));
app.enable('trust proxy');

// Setup middleware
app.use(morgan('dev'));
var originWhitelist = [ "https://" + process.env.ORIGIN, "https://account." + process.env.ORIGIN, 'https://beta.ftcscores.com'];
console.log("Allowed CORS domains are", originWhitelist);
var corsOptions = {
  origin: originWhitelist,
  credentials: true
}

app.use(cors(corsOptions));
app.use(require('cookie-parser')());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new MongoStore({
    mongooseConnection: mongoose.connection,
    touchAfter: 24 * 3600 //24 hours
  }),
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: 'none'
  }
}));
app.use(passport.initialize());
app.use(passport.session());

// Passport setup
var User = require('./model/User.js');

passport.use(User.createStrategy());

passport.serializeUser((user, done) => {
  var sessionUser = {
    _id: user._id,
    username: user.username
  }
  done(null, sessionUser)
});

passport.deserializeUser(async (sessionUser, done) => {
  let user = await User.findById(sessionUser._id).
  select("-token -hash -salt")
  done(null, user.toObject())
});

// Agenda setup
var Agendash = require('agendash');
const jobs = require('./helpers/jobs');
const isAdmin = require('./helpers/auth').isAdmin;

app.use('/dash', isAdmin, Agendash(jobs.agenda));

app.use('/api', require('./routes/index.js'));

app.use('/api/v2', require('./routes/v2/index.js'));



if (process.env.BUGSNAG_API) {
  // This handles any errors that Express catches
  app.use(bugsnagMiddleware.errorHandler);
}

// Error Handler
app.use(function (err, req, res, next) {
  if (err instanceof validate.ValidationError) {
    console.error(err.errors);
    res.status(err.status).json({
      "message": "Some fields are incorrect",
      "errors": errorHelper.form(err.errors)
    });
  } else if (err.status) {
    console.error(err);
    res.status(err.status).json({
      "message": err.message || "An unknown error occurred",
      "errors": err.errors,
      "detail": err.detail
    });
  } else {
    console.error(err);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      "message": "An unknown error occured"
    });
  }
});

//handle 404s
app.use(function (req, res, next) {
  res.status(404).send({ message: "Endpoint does not exist"})
})

//Main server
server.listen(app.get('port'), function () {
  console.log(chalk.green.bold("RUNNING on port " + (process.env.PORT || 3000)))

  console.log(chalk.gray("==========================================="));

  //rewrite log statements to include file and line numbers
  ['log', 'warn', 'error', 'trace'].forEach((methodName) => {
    const originalMethod = (console)[methodName];
    (console)[methodName] = (...args) => {
      let initiator = 'unknown';
      try {
        throw new Error();
      } catch (e) {
        if (typeof e.stack === 'string') {
          let isFirst = true;
          for (const line of e.stack.split('\n')) {
            const matches = line.match(/^\s+at\s+(.*)/);
            if (matches) {
              if (!isFirst) { // first line - current function
                // second line - caller (what we are looking for)
                initiator = matches[1];
                initiator = initiator.split('/')[0] + _.join(initiator.split('/').splice(3), '/');
                break;
              }
              isFirst = false;
            }
          }
        }
      }
      var color = (a) => { return a };
      if (methodName == "warn") color = chalk.yellow;
      if (methodName == "error") color = chalk.red;
      for (var i=0; i<args.length; i++) {
        if (_.isPlainObject(args[i]))
        args[i] = JSON.stringify(args[i], null, 2)
        else if (!_.isString(args[i]))
        args[i] = util.inspect(args[i]);

        args[i] = color(args[i]);
      }
      originalMethod.apply(console, [...args, chalk.gray(`at ${initiator}`)]);
    };
  });
});
