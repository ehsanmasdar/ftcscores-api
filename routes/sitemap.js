const express = require('express');
const router = express.Router();
const _ = require('lodash');
const cache = require('../helpers/cache').cache;

const Event = require('../model/Event.js');
const Team = require('../model/Team.js');

const CONSTANT_URLS = [
  "https://ftcscores.com",
  "https://ftcscores.com/events"
]

router.get('/', cache.route({expiry: 60*60}), async function (req, res) {
  let events = await Event.find({ published: true })
  .select("link -_id");

  let teams = await Team.find()
  .select("number -_id");

  let urls = _.concat(CONSTANT_URLS,
                      _.map(events, (event) => { return "https://ftcscores.com/event/" + event.link; }),
                      _.map(teams, (team) => { return "https://ftcscores.com/team/" + team.number; }))

  res.header("Content-Type", "text/plain");
  res.send(_.join(urls, "\n"));
});

module.exports = router;
