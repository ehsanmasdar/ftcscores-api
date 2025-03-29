const Joi = require('joi');
const _ = require('lodash');
const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
const httpStatus = require('http-status');
const errorMessages = require('./errorMessages');
const ftcapi = require('./ftcapi');

module.exports = {
  createEvent: {
    body: Joi.object({
      "fullName": Joi.string().required(),
      "shortName": Joi.string().required(),
      "location": Joi.string().required(),
      "type": Joi.string().required(),
      "program": Joi.string().required(),
      "season": Joi.string().required(),
      "startDate": Joi.date().iso().required(),
      "endDate": Joi.date().iso().required(),
      "brandingBanner": Joi.string().allow(''),
      "subtitle": Joi.string().allow(''),
      "streamLink": Joi.string().allow(''),
      "isFinals": Joi.boolean(),
      "firstEventCode": Joi.string().allow('')
    }).unknown(false)
  },
  updateEvent: {
    body: Joi.object({
      "fullName": Joi.string().required(),
      "shortName": Joi.string().required(),
      "location": Joi.string().required(),
      "type": Joi.string().required(),
      "program": Joi.string().required(),
      "startDate": Joi.date().iso(),
      "endDate": Joi.date().iso(),
      "brandingBanner": Joi.string().min(0).allow(''),
      "subtitle": Joi.string().min(0).allow(''),
      "streamLink": Joi.string().min(0).allow(''),
      "isFinals": Joi.boolean(),
      // Admin-only
      "status": Joi.string(),
      "season": Joi.string(),
      "combinedEvents": Joi.array().items(Joi.string()),
      "creator": Joi.string(),
      "bannerMessage": Joi.string().allow(''),
      "from": Joi.string(),
      "firstEventCode": Joi.string().allow('')
    }).unknown(false)
  },
  publishEvent: {
    body: Joi.object({
      "published": Joi.boolean().required()
    }).unknown(false)
  },
  register: {
    body: Joi.object({
      "username": Joi.string().email().required(),
      "password": Joi.string().min(8).required(),
      "firstName": Joi.string().required(),
      "lastName": Joi.string().required(),
      "phone": Joi.string().required(),
      "region": Joi.string().required()
    }).unknown(false)
  },
  changePassword: {
    body: Joi.object({
      "oldPassword": Joi.string().required(),
      "newPassword": Joi.string().min(8).required()
    }).unknown(false)
  },
  resetPassword: {
    body: Joi.object({
      "newPassword": Joi.string().min(8).required()
    }).unknown(false)
  },
  forgotPassword: {
    body: Joi.object({
      "username": Joi.string().email().required()
    }).unknown(false)
  },
  changeUser: {
    body: Joi.object({
      "firstName": Joi.string().required(),
      "lastName": Joi.string().required(),
      "phone": Joi.string().required(),
      "region": Joi.string().required()
    }).unknown(false)
  },
  changeUserAdmin: {
    body: Joi.object({
      "firstName": Joi.string().required(),
      "lastName": Joi.string().required(),
      "phone": Joi.string().required(),
      "region": Joi.string().required(),
      "admin": Joi.boolean().required()
    }).unknown(false)
  },
  notification: {
    body: Joi.object({
      "sub": Joi.object().required(),
      "team": Joi.number(),
      "event": Joi.string()
    }).unknown(false)
  },
  uiErrorUpload: {
    body: Joi.object({
      "message": Joi.any(),
      "file": Joi.any(),
      "line": Joi.any(),
      "column": Joi.any()
    }).unknown(true)
  },
  filterEvent: function (ev, isAdmin) {
    if (ev.combinedRankings && ev.combinedRankings.ranking) {
      ev.combinedRankings = ev.combinedRankings.ranking;
    }
    return _.omit(ev, ['_id', '__v', '_creator', 'deleted', 'teamKey']);
  },
  filterTeam: function (ev) {
    return _.omit(ev, ['_id', '__v']);
  },
  filterMatch: function (ev) {
    return _.omit(ev, ['_id', '__v', 'createdAt', 'updatedAt']);
  },
  filterUser: function (ev) {
    return _.omit(ev, ['__v', 'createdAt', 'updatedAt', 'id','token','hash','salt']);
  },
  getErrorMessage: function (key) {
    if (errorMessages[key])
      return errorMessages[key]
    return null;
  },
  validatePhoneNumber: function (req, res, next) {
    try {
      var number = phoneUtil.parse(req.body.phone.trim(), 'US');
      if (phoneUtil.isValidNumber(number)) {
        next();
      } else {
        next({
          "status": httpStatus.BAD_REQUEST,
          "message": "Some fields are incorrect",
          "errors": {
            "phone": "Phone number invalid"
          }
        });
      }
    } catch (err) {
      next({
        "status": httpStatus.BAD_REQUEST,
        "message": "Some fields are incorrect",
        "errors": {
          "phone": "Phone number invalid"
        }
      });
    }
  },
  validateFIRSTEventCode: async function(req, res, next) {
    try{
      if (!req.body.firstEventCode) {
        next();
      } else {
        const event = await ftcapi.getEvent(req.body.firstEventCode);
        if (event['events'].length == 1) {
          next();
        } else {
          next({
            "status": httpStatus.BAD_REQUEST,
            "message": "Some fields are incorrect",
            "errors": {
              "firstEventCode": "Could not verify FIRST Event Code. Please contact your affiliate partner for the proper Event Code or leave this field blank for now."
            }
          });
        }
      }
    } catch(e) {
      console.error(e);
      next({
        "status": httpStatus.BAD_REQUEST,
        "message": "Some fields are incorrect",
        "errors": {
          "firstEventCode": "Could not verify FIRST Event Code. Please contact your affiliate partner for the proper Event Code or leave this field blank for now."
        }
      });
    }
  }
};
