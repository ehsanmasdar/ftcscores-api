const express = require('express');
const router = express.Router();

const eventRoute = require('./event.js');

router.get('/', function(req, res){
  res.send('Welcome to FTCScores API Version 2!');
})

router.use('/events', eventRoute);

module.exports = router;
