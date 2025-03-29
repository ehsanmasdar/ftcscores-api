const server = require('../app.js');
const _ = require('lodash');
const { redis, redlock } = require('./cache');
const io = require('socket.io')(server, {path: "/wss"});
const Event = require('../model/Event');

const {
  updateEvent,
  fastUpdate
} = require('../helpers/event.js');
const schema = require('../helpers/validate.js');
const { DISALLOW_PUSH_ON_EVENT_STATUS } = require('../helpers/auth');
const ConnectedSocket = require('../model/ConnectedSocket');


const DIFF_EXPIRY_SECONDS = 60 * 60; //1 hour then force clients to refresh data
let connectedClientCount = 0;
let lastUpdateMap = {};
let statusMap = {};

//delete all connected sockets on startup
ConnectedSocket.remove({ }, (err) => {
  if (err) console.error(err)
  console.log("[WS] Removed all socket data")
});

io.on('connection', async function (socket) {
  console.log("[WS] Client connected", socket.id)
  connectedClientCount++;

  socket.on('subscribe', async function (page, clientId) {
    try {
      let savedSocket = await ConnectedSocket.findOne({ socketId: socket.id.toString() });

      if (savedSocket && savedSocket.page) {
        //leave older page
        socket.leave(savedSocket.page)
      }

      console.log("[WS] Client subscribed to page", page, socket.id);

      socket.join(page);

      if (savedSocket) {
        //update socket
        await ConnectedSocket.findOneAndUpdate({ socketId: socket.id.toString() }, { $set: {
          lastUpdate: Date.now(),
          page: page
        }});
      } else {
        //create socket info
        var newSocket = new ConnectedSocket({
          socketId: socket.id.toString(),
          clientId: clientId,
          page: page,
          lastUpdate: Date.now()
        })
        await newSocket.save();
      }

      let eventId = page.split('/event/')[1];
      if (eventId) {
        let eventToPush = await Event.get(eventId);
        socket.emit('update', schema.filterEvent(eventToPush.toObject()));
      }
    } catch (e) {
      console.error('[WS] Subscribe error', e);
    }
  });
  socket.on('heartbeat', async function (eventId, apiKey) {
    console.log(`[WS] Heartbeat from ${eventId} by ${apiKey}`);
  });
  socket.on('hello', async function (config, session) {
    statusMap[socket.id] = {};
    statusMap[socket.id].config = config;
    statusMap[socket.id].session = session;
    statusMap[socket.id].connected = true;
  });
  socket.on('update-times-confirm', async function (config) {
    console.log(`[WS] Got update confirmation from ${socket.id}:`, config)
  })
  socket.on('live-update', async function (eventId, matchIdx, data, apiKey) {
    console.log(`[WS] Live update Request for ${eventId}/${matchIdx + 1} by ${apiKey}`);
    try {
      let ev = await Event.get(eventId);
      if (apiKey === ev._creator.apiKey && _.indexOf(DISALLOW_PUSH_ON_EVENT_STATUS, ev.status) < 0) {
        io.to(`/event/${eventId}`).emit('live-update', matchIdx, data);
        fastUpdate(ev, matchIdx, data);
        console.log(`[WS] Live update success for ${eventId}/${matchIdx + 1}`)
      }
    } catch(e) {
      console.error(`[WS] Live update failed for ${eventId}/${matchIdx + 1}: ${e}`)
    }
  });

  socket.on('update', async function (eventId, update, apiKey, firstliveVersion) {
    console.log(`[WS] Update Request for ${eventId} by ${apiKey}`)
    var start = new Date();
    try {
      var lock = await redlock.lock('event:' + eventId, 10000)
      let ev = await Event.get(eventId);
      if (apiKey === ev._creator.apiKey && _.indexOf(DISALLOW_PUSH_ON_EVENT_STATUS, ev.status) < 0) {
        lastUpdateMap[eventId] = {
          socket: socket.id,
          time: new Date(),
        };
        // First version comes in normal updates due to async nature of the client
        statusMap[socket.id].firstliveVersion = firstliveVersion;
        ev = await updateEvent(ev, update);
        ev.desktopConnected = true;

        await ev.save();
        var updatedEvent = await Event.get(eventId);
        //clear cache
        redis.delAsync(eventId);

        let cleanedEvent = schema.filterEvent(updatedEvent.toObject());
        //send update to subscribers
        await emitUpdate(`/event/${eventId}`, cleanedEvent);
        for (let linkedEvent of updatedEvent.combinedEvents) {
          let eventToPush = await Event.get(linkedEvent);
          await emitUpdate(`/event/${linkedEvent}`, schema.filterEvent(eventToPush.toObject()));
        }

        io.to(socket.id).emit('success');
        console.log(`[WS] Update successful for event: ${eventId}, socket: ${socket.id} in ${new Date().getTime() - start.getTime()}ms`)
      } else if (_.indexOf(DISALLOW_PUSH_ON_EVENT_STATUS, ev.status) >= 0) {
        io.to(socket.id).emit('error', 'Event is locked', 'You are no longer allowed to upload to this event. Contact support if changes need to be made.');
        console.warn(`[WS] Bad authentication ${eventId} by ${socket.id}, event is completed`)
      } else {
        io.to(socket.id).emit('error', 'Authorization error', 'You are not allowed to upload to this event. Contact support if changes need to be made.');
        console.warn(`[WS] Bad authentication ${eventId} by ${socket.id}`)
      }
    } catch (e) {
      io.to(socket.id).emit('error', 'Upload Error', 'An unknown error occurred while uploading scores. Please contact support.');
      console.error(`[WS] Update failed for ${eventId}: ${e}`);
      console.trace(e);
    }
    await lock.unlock();
  });

  socket.on('disconnect', async function () {
    console.log("[WS] Client disconnected", socket.id);

    await ConnectedSocket.remove({ socketId: socket.id });

    connectedClientCount--;
    if (socket.id in statusMap) {
      const link = statusMap[socket.id].session.instances[0].event.link;
      console.log(`[WS] Desktop App disconnected for event ${link}`)
      await Event.updateOne({ link: link}, {$set:{desktopConnected: false}});
      redis.del(link, (err) => { });
      statusMap[socket.id].connected = false;
      statusMap[socket.id].disconnectedTime = new Date();
    }
  });
});

const diff = require('deep-diff').diff;

async function emitUpdate(page, data) {

  let savedData = await redis.getAsync(`sockets_diffs_${page}`);
  data = JSON.parse(JSON.stringify(data));

  if (savedData) {
    savedData = JSON.parse(savedData);
    let cleanedData = JSON.parse(JSON.stringify(data));
    delete cleanedData.updatedAt;
    delete savedData.updatedAt;

    var differences = diff(savedData, cleanedData);
    if (data === savedData || !differences || differences.length == 0) return false;
    // console.log("[WS] Diff", differences)
  }

  console.log("[WS] Emitting " + page)
  io.to(page).emit('update', data);

  await redis.setAsync(`sockets_diffs_${page}`, JSON.stringify(data), 'EX', DIFF_EXPIRY_SECONDS)

  return true;
}

async function updateConfiguration(socket, servicePeriod, liveUpdateRate) {
  io.to(socket).emit('update-times', servicePeriod, liveUpdateRate);
}

module.exports = {emitUpdate, lastUpdateMap, statusMap, updateConfiguration, io};

module.exports.getViewerCount = function () {
  return connectedClientCount;
}

module.exports.getDesktopStatus = function () {
  return statusMap;
}

module.exports.getUpdateStatus = function () {
  return lastUpdateMap;
}
