const express = require('express');
const router = express.Router();
router.get('/', function(req, res) {
    if (req.query.deviceToken) {
        res.cookie("deviceToken", req.query.deviceToken, { domain: '.ftcscores.com'});
        if (process.env.REL == "production") {
            res.redirect(`https://ftcscores.com`)
        } else {
            res.redirect(`https://${process.env.REL}.ftcscores.com`)
        }
    } else {
        res.status(400).json({
            error: "No device token sent"
        })
    }
    
})

module.exports = router;
