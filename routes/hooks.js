const express = require('express');
const router = express.Router();

router.post('/slack/action', async function (req, res, next) {
  try {
    res.send("");
  } catch (e) {
    next(e);
  }
})

module.exports = router;
