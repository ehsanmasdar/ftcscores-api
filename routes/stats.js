const express = require('express');
const router = express.Router();
const _ = require('lodash');
const httpStatus = require('http-status');
const Heap = require('heap');
const cache = require('../helpers/cache').cache;
const {
  getViewerCount,
  getDesktopStatus,
  getUpdateStatus,
  io
} = require('../helpers/sockets');

const Event = require('../model/Event.js');
const Team = require('../model/Team.js');
const ConnectedSocket = require('../model/ConnectedSocket');
const BEST_MATCH_NUM = 5;
const isAdmin = require('../helpers/auth').isAdmin;


function nonPen(subscore) {
  return subscore.auto + subscore.tele + subscore.endg;
}

function matchCompare(a, b) {
  if (a.subscoresRed && a.subscoresBlue && b.subscoresRed && b.subscoresBlue) {
    return Math.max(nonPen(a.subscoresRed), nonPen(a.subscoresBlue)) - Math.max(nonPen(b.subscoresRed), nonPen(b.subscoresBlue))
  } else if (a.subscoresRed && a.subscoresBlue && !b.subscoresRed && !b.subscoresBlue) {
    return 1;
  } else if (a.subscoresRed && a.subscoresBlue && !b.subscoresRed && !b.subscoresBlue) {
    return -1;
  }
  return 0;
}
router.get('/', cache.route({expire: 24*60*60}), function (req, res) {
  Promise.all([Event.count(), Team.count(), Event.find({
    published: true
  })]).then(function (values) {
    var matchCount = 0;
    var bestMatches = new Heap(matchCompare);

    var events = values[2];

    for (var event of events) {
      matchCount += event.matches.length;
      for (var match of event.matches) {
        if (bestMatches.size() == BEST_MATCH_NUM) {
          if (bestMatches.cmp(match, bestMatches.peek()) > 0) {
            match.event = event.shortName;
            bestMatches.replace(match);
          }
        } else {
          match.event = event.shortName;
          bestMatches.push(match);
        }
      }
    }
    res.json({
      "events": values[0],
      "matches": matchCount,
      "teams": values[1],
      "bestMatches": bestMatches.toArray().sort(matchCompare).reverse()
    });
  }).catch((err) => {
    console.error(err);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      "message": "Error retrieving stats"
    });
  });
});

router.get('/users', isAdmin, async function(req, res, next) {
  const activeDevices = await ConnectedSocket.count({ });

  const users = await ConnectedSocket.aggregate()
  .match({ })
  .group({
    _id: "$clientId",
    sockets: { $push: {
      socketId: "$socketId",
      page: "$page",
      lastUpdate: "$lastUpdate"
    } }
  })

  var _pages = await ConnectedSocket.aggregate()
  .match({ })
  .group({
    _id: "$page",
    v: { $sum: 1 }
  })
  .sort({ _id: 1 })

  const pages = { };
  for (var page of _pages) {
    pages[page._id] = page.v;
  }

  res.send({
    activeDevices: activeDevices,
    activeUsers: users.length,
    users: users,
    pages: pages
  })
})

router.get('/desktop', isAdmin, function(req, res, next) {
  res.send({
    updateStatus: getUpdateStatus(),
    desktopStatus: getDesktopStatus()
  });
})

router.post('/send', isAdmin, function(req, res, next) {
  io.to(req.body.id).emit('error', req.body.title, req.body.message);
  res.json({
    success: true
  })
})


module.exports = router;
