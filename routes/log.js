const express = require('express');
const router = express.Router();
const validate = require('express-validation');
const httpStatus = require('http-status');
const schema = require('../helpers/validate.js');

router.post('/uierror', validate(schema.uiErrorUpload), function(req, res, next) {
  var data = JSON.parse(JSON.stringify(req.body))
  data.userAgent = req.get('user-agent');
  res.status(200).send({ message: "OK" })
  try {
    throw data;
  } catch (e) {
    console.error(e)
  }
})

module.exports = router;
