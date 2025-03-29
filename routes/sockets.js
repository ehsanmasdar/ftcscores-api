const express = require('express');
const router = express.Router();
const {
    getViewerCount,
    getDesktopStatus,
    getUpdateStatus,
    io,
    updateConfiguration
  } = require('../helpers/sockets');

router.get('/websockets', function (req, res, next) {
    res.send({ activeDevices: parseInt(getViewerCount()) });
})

router.get('/desktop', function (req, res, next) {
    res.send({
        updateStatus: getUpdateStatus(),
        desktopStatus: getDesktopStatus()
    });
})
router.post('/send', function (req, res, next) {
    io.to(req.body.id).emit('error', req.body.title, req.body.message);
    res.json({
        success: true
    })
})
router.post('/times', async function (req, res, next) {
    try {
        await updateConfiguration(req.body.id, req.body.servicePeriod, req.body.liveUpdateRate);
    } catch(e) {
        res.json({
            error: e
        });
        return;
    }
    res.json({
        success: true
    });
})
module.exports = router;
