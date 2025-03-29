const express = require('express');
const router = express.Router();

const eventRoute = require('./event.js');
const userRoute = require('./user.js');
const teamRoute = require('./team.js');
const notificationRoute = require('./notification.js');
const searchRoute = require('./search.js');
const statsRoute = require('./stats.js');
const socketsRoute = require('./sockets.js');
const iosRoute = require('./ios.js');
const sitemapRoute = require('./sitemap.js');
const logRoute = require('./log.js');
const hooksRoute = require('./hooks.js');

const {
  INSTALLER_LATEST_VERSION,
  INSTALLER_MINIMUM_ALLOWED_VERSION,
  MINIMUM_COMPATIBLE_FTCLIVE_VERSION,
  LATEST_TESTED_FTCLIVE_VERSION
} = require('../helpers/versions');
const isAdmin = require('../helpers/auth').isAdmin;

router.get('/', (req, res) => {
  res.send('Welcome to the FTCScores API!');
})
router.get('/versions', (req, res) => {
  res.send({
    latestApi: "1",
    latestDesktopVersion: INSTALLER_LATEST_VERSION,
    minimumAllowedDesktopVersion: INSTALLER_MINIMUM_ALLOWED_VERSION,
    minimumCompatibleScoringSystemVersion: MINIMUM_COMPATIBLE_FTCLIVE_VERSION,
    latestTestedScoringSystemVersion: LATEST_TESTED_FTCLIVE_VERSION,
  })
})

router.use('/teams', teamRoute);
router.use('/events', eventRoute);
router.use('/users', userRoute);
router.use('/search', searchRoute);
router.use('/stats', statsRoute);
router.use('/sockets', isAdmin, socketsRoute);

router.use('/notifications', notificationRoute);
router.use('/ios', iosRoute);
router.use('/sitemap', sitemapRoute);
router.use('/log', logRoute);
router.use('/hooks', hooksRoute);

module.exports = router;
