const express = require('express');
const router = express.Router();
const validate = require('express-validation');
const httpStatus = require('http-status');

const schema = require('../helpers/validate.js');
const Subscription = require('../model/Subscription.js');
const Notification = require('../model/Notification.js');

router.post('/', validate(schema.notification), function (req, res) {
  const sub = new Subscription(req.body);
  if (req.body.event && req.body.team) {
    res.status(httpStatus.BAD_REQUEST).json({
      'message': 'Cannot specify both team and event'
    });
  }
  sub.save().then(function () {
    res.json({
      'message': 'Success'
    });
  }, function (err) {
    console.log(err);
    res.status(httpStatus.CONFLICT).json({
      'message': 'Subscription already exists'
    });
  });
});

router.delete('/', function (req, res) {
  var find = {
    event: req.body.event,
    team: req.body.team
  };
  if (req.body.sub.apple) {
    find['sub.deviceToken'] = req.body.sub.deviceToken;
  } else {
    find['sub.endpoint'] = req.body.sub.endpoint;
  }
  Subscription.find(find).then(function (subs) {
    var all = [];
    for (var sub of subs) {
      all.push(sub.remove());
    }
    return Promise.all(all);
  }).then(() => {
    res.json({
      "message": "Subscription removed"
    });
  })
  .catch(function (e) {
    console.log(e);
    res.status(httpStatus.NOT_FOUND).json({
      message: "Subscription not found"
    });
  });
});
router.get('/publickey', function (req, res) {
  res.json({
    'publickey': process.env.VAPID_PUBLIC_KEY
  });
});

router.get('/:notificationId', function (req, res) {
  res.json(req.notification);
});

router.param('notificationId', function (req, res, next, id) {
  Notification.get(id).then(function (notification) {
    req.notification = notification;
    return next();
  }).catch(function (e) {
    res.status(httpStatus.NOT_FOUND).json({
      message: "Notification not found"
    });
  });
});
module.exports = router;