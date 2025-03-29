const webpush = require('web-push');
const fs = require('fs');
const apn = require('apn');
const path = require('path');

const Subscription = require('../model/Subscription');

webpush.setVapidDetails(
  'mailto:info@ftcscores.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

var apnOptions = {};
var apnProvider;
if (process.env.APN_KEY_ID && process.env.APN_TEAM_ID && fs.existsSync("key.p8")) {
  apnOptions = {
    token: {
      key: "key.p8",
      keyId: process.env.APN_KEY_ID,
      teamId: process.env.APN_TEAM_ID
    },
    production: true
  };
  apnProvider = new apn.Provider(apnOptions);
} else {
  console.warn("WARNING! iOS notifications are not configured.");
}

function pushNotification(newNotif, subs) {
  subs.forEach((data) => {
    if (data.sub.apple) {
      if (apnProvider) {
        var notification = new apn.Notification();
        // Expires after 10 minutes
        notification.expiry = Math.floor(Date.now() / 1000) + 600;
        notification.alert = {
          title: newNotif.title,
          body: newNotif.body
        }
        notification.sound = "default";
        notification.topic = "com.lcocco.FTCScores";
        apnProvider.send(notification, data.sub.deviceToken.split("/")[0]).then((res) => {
          console.log("APNS OK", res);
          if (res.failed && res.failed.length > 0 && res.failed[0].response) console.log(res.failed[0].response);
        }).catch((err) => {
          console.log("APNS Error", err);
        });
      } else {
        console.warn("WARNING! iOS notification will not send - APN is not configured.");
      }
    } else {
      webpush.sendNotification(data.sub, JSON.stringify(newNotif))
      .catch((err) => {
        console.log(err);
      });
    }
  });
}

function generateBody(match) {
  var body = "";
  var redString = "";
  for (var i = 0; i < match.teams.red.length; i++) {
    if (i == match.teams.red.length - 1) {
      redString += match.teams.red[i].number;
    } else {
      redString += match.teams.red[i].number + " ";
    }
  }
  var blueString = "";
  for (var i = 0; i < match.teams.blue.length; i++) {
    if (i == match.teams.blue.length - 1) {
      blueString += match.teams.blue[i].number;
    } else {
      blueString += match.teams.blue[i].number + " ";
    }
  }
  if (match.scores.red > match.scores.blue) {
    body += "Red wins ";
    body += match.scores.red + " - " + match.scores.blue + '\r\n';
    body += `Red (${redString}) v. Blue (${blueString})`;
  } else if (match.scores.blue > match.scores.red) {
    body += "Blue wins ";
    body += match.scores.blue + " - " + match.scores.red + '\r\n';
    body += `Blue (${blueString}) v. Red (${redString})`;
  } else {
    body += "Match tied ";
    body += match.scores.red + " - " + match.scores.blue + '\r\n';
    body += `Red (${redString}) v. Blue (${blueString})`;
  }
  return body;
}
module.exports = {
  sendNotification: function (match, event) {
    const m = match;
    for (var i = 0; i < m.teams.red.length; i++) {
      const number = m.teams.red[i].number;
      Subscription.getTeam(number).then(function (subs) {
        pushNotification({
          title: `Team ${number} Score`,
          body: generateBody(m),
          tag: "team-" + number,
          url: "/team/" + number,
          action: "View Team"
        }, subs);
      });
    }
    for (var i = 0; i < m.teams.blue.length; i++) {
      const number = m.teams.blue[i].number;
      Subscription.getTeam(number).then(function (subs) {
        pushNotification({
          title: `Team ${number} Score`,
          body: generateBody(m),
          tag: "team-" + number,
          url: "/team/" + number,
          action: "View Team"
        }, subs);
      });
    }
    Subscription.getEvent(event).then(function (subs) {
      pushNotification({
        title: `Match ${m.number} Score`,
        body: generateBody(m),
        tag: "event-" + event,
        url: "/event/" + event,
        action: "View Event"
      }, subs);
    });
  }
}
