const httpStatus = require('http-status');
const User = require('../model/User');
const _ = require('lodash');
const semver = require('semver')

const DISALLOW_PUSH_ON_EVENT_STATUS = [ "Completed", "Canceled" ];
const { INSTALLER_MINIMUM_ALLOWED_VERSION } = require('./versions');

function canModify (req, res, next) {
  if ((req.user && req.user.admin) ||
    (req.user && req.user._id == req.ev._creator._id.toString() && !req.ev.published)) {
    next();
  } else {
    res.status(httpStatus.FORBIDDEN).json({
      message: "Operation forbidden"
    });
  }
}
function canUpdateScores (req, res, next) {
  //prevent old versions of clients from accessing system
  console.log("AUTHORIZATION", req.headers.authorization);
  console.log("X-TPA-Version", req.get("X-TPA-Version"));
  if (!req.get("X-TPA-Version") || semver.lt(req.get("X-TPA-Version"), INSTALLER_MINIMUM_ALLOWED_VERSION)) {
    console.warn("Disallowed TPA version: ", req.get("X-TPA-Version"))
    res.status(httpStatus.FORBIDDEN).json({
      message: "Please update the FTCScores client to upload scores"
    });
  } else if (((req.headers.authorization === req.ev._creator.apiKey) && (_.indexOf(DISALLOW_PUSH_ON_EVENT_STATUS, req.ev.status) < 0))
    || (req.user && req.user.admin)) {
    next();
  } else {
    //don't allow regular users to upload to completed events
    res.status(httpStatus.FORBIDDEN).json({
      message: "Operation forbidden"
    });
  }
}
function ensureLoggedIn (req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    return next({ status: httpStatus.UNAUTHORIZED, message: "Must be logged in" })
  }
  if (!req.user.enabled) {
    return next({ status: httpStatus.UNAUTHORIZED, message: "Your account has been disabled. Please contact support if this is in error."})
  }
  if (!req.user.verifiedEmail) {
    return next({ status: httpStatus.UNAUTHORIZED, message: "Please verify your email before continuing" })
  }

  next();
}
function isAdmin (req, res, next) {
  if (req.user && req.user.admin) {
    next();
  } else {
    next({ status: httpStatus.UNAUTHORIZED, message: "Unauthorized" })
  }
}
module.exports = {
  canModify,
  canUpdateScores,
  ensureLoggedIn,
  isAdmin,
  DISALLOW_PUSH_ON_EVENT_STATUS
};
