const request = require('request-promise');
const moment = require('moment');

if (!process.env.SENDGRID_API_KEY)
{
  console.warn("WARNING: SENDGRID_API_KEY environment variable not set. Mail system will be disabled.")
} else if (!process.env.ORIGIN)
{
  console.error("Please set ORIGIN environment variable.")
  process.exit(1);
}

if (!process.env.SLACK_HOOK_URL) {
  console.warn("WARNING: SLACK_HOOK_URL is required to post updates to Slack.")
}

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

exports.sendEmail = function(subject, bodyHtml, toEmail, cb) {
  if (!process.env.SENDGRID_API_KEY) {
    return cb(null); //Mail system did not send anything, but we quitely ignore the error
  }

  const msg = {
    to: toEmail,
    from: {
      email: process.env.SENDGRID_EMAIL,
      name: "FTCScores"
    },
    subject: subject,
    templateId: process.env.SENDGRID_TEMPLATE_ID,
    dynamic_template_data: {
      origin: "https://account." + process.env.ORIGIN,
      emailto: toEmail,
      body: bodyHtml,
      subject: subject
    },
  };

  sgMail.send(msg)
  .then(() => { cb() })
  .catch(cb)
}

exports.sendVerificationEmail = function(user, cb) {
  var html = `Hello ${user.firstName} ${user.lastName},<br><br>\
  Thanks for signing up for your <b>FTC</b><i>Scores</i> Event Organizer Account! Go to <a href="https://account.${process.env.ORIGIN}/verify/${user.token}">https://account.${process.env.ORIGIN}/verify/${user.token}</a> to verify your email. Please note that the link above is only valid for 24 hours - after that, you will need to register again.`;
  var subject = 'Complete FTCScores Registration';
  var email = user.username;

  exports.sendEmail(subject, html, email, (error) => {
    cb(error);
  });
}
exports.sendPasswordResetEmail = function(user, token, cb) {
  var html = `Hello ${user.firstName} ${user.lastName},<br><br><b>We received a request to reset your account password.</b><br><br>Go to <a href="https://account.${process.env.ORIGIN}/change-password/${token}">https://account.${process.env.ORIGIN}/change-password/${token}</a> within 1 hour to complete reset.`;
  var subject = 'Reset FTCScores Password';
  var email = user.username;

  exports.sendEmail(subject, html, email, (error) => {
    cb(error);
  });
}

exports.sendRegistrationNotification = function(user, emails) {
  if (process.env.SLACK_HOOK_URL) {
    //send notification to Slack
    request({
      method: "POST",
      uri: process.env.SLACK_HOOK_URL,
      body: {
        type: "mrkdwn",
        blocks: [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": `User *${user.firstName} ${user.lastName} (${user.username})* just registered!`
            }
          },
          {
            "type": "context",
            "elements": [
              {
                "type": "mrkdwn",
                "text": `*Name*: ${user.firstName} ${user.lastName}\n*Email*: ${user.username}\n*Phone*: ${user.phone}\n*Region*: ${user.region}`
              }
            ]
          },
          {
            "type": "actions",
            "elements": [
              {
                "type": "button",
                "text": {
                  "type": "plain_text",
                  "text": "Go to dashboard",
                  "emoji": true
                },
                "url": `https://account.${process.env.ORIGIN}`
              }
            ]
          }
        ]
      },
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      json: true
    })
    .then((response) => {
      console.log("[mail] Slack response", response);
    })
    .catch((e) => {
      console.error(e);
    })
  }

  var html = `Hello FTCScores Admin,<br><br>User <b> ${user.firstName} ${user.lastName} (${user.username})</b> just created an account on ${process.env.ORIGIN}.
  <br><br><b>Name:</b> ${user.firstName} ${user.lastName}
  <br><b>Email:</b> ${user.username}
  <br><b>Phone:</b> ${user.phone}
  <br><b>Region:</b> ${user.region}
  `;
  var subject = `New user registered: ${user.username}`;
  for (var email of emails) {
    exports.sendEmail(subject, html, email, (error) => {
    });
  }
}

exports.sendEventNotification = function(user, event, emails) {

  if (process.env.SLACK_HOOK_URL) {
    //send notification to Slack
    request({
      method: "POST",
      uri: process.env.SLACK_HOOK_URL,
      body: {
        type: "mrkdwn",
        blocks: [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": `User *${user.firstName} ${user.lastName}* (${user.username}) created a new event!\n\n*<https://${process.env.ORIGIN}/event/${event.link}|${event.fullName + (event.subtitle ? ` (${event.subtitle})` : "")}>*`
            }
          },
          {
            "type": "context",
            "elements": [
              {
                "type": "mrkdwn",
                "text": `*Full Name*: ${event.fullName}\n*Short Name*: ${event.shortName}\n*Type*: ${event.type}\n*Start Date*: ${moment(event.startDate).format("MM/DD/YYYY")}\n*End Date*: ${moment(event.startDate).format("MM/DD/YYYY")}\n*Location*: ${event.location}\n*Stream Link*: ${event.streamLink ? event.streamLink : "_None_"}`
              }
            ]
          },
          {
            "type": "actions",
            "elements": [
              {
                "type": "button",
                "style": "primary",
                "text": {
                  "type": "plain_text",
                  "text": "Manage event",
                  "emoji": true
                },
                "url": `https://account.${process.env.ORIGIN}/event/${event.link}`
              }
            ]
          }
        ]
      },
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      json: true
    })
    .then((response) => {
      console.log("[mail] Slack response", response);
    })
    .catch((e) => {
      console.error(e);
    })
  }

  var html = `Hello FTCScores Admin,<br><br>User <b>${user.firstName} ${user.lastName} (${user.username})</b> just created event <b>${event.fullName}</b> on ${process.env.ORIGIN}. <a href="https://account.${process.env.ORIGIN}/event/${event.link}">Here</a> is the event dashboard.
  <br><br><b>Full Name:</b> ${event.fullName}
  <br><b>Short Name:</b> ${event.shortName}
  <br><b>Type:</b> ${event.type}
  <br><b>Division/League:</b> ${event.subtitle}
  <br><b>Start Date:</b> ${event.startDate.toLocaleDateString()}
  <br><b>End Date:</b> ${event.endDate.toLocaleDateString()}
  <br><b>Location:</b> ${event.location}
  <br><b>Stream Link:</b> ${event.streamLink}
  `;
  var subject = `New event created: ${event.shortName}`;
  for (var email of emails) {
    exports.sendEmail(subject, html, email, (error) => {
    });
  }
}

exports.sendPublishedNotification = function(user, event, emails, admin) {
  if (process.env.SLACK_HOOK_URL) {
    //send notification to Slack
    request({
      method: "POST",
      uri: process.env.SLACK_HOOK_URL,
      body: {
        type: "mrkdwn",
        blocks: [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": `Event *<https://${process.env.ORIGIN}/event/${event.link}|${event.fullName + (event.subtitle ? ` (${event.subtitle})` : "")}>* was just *published* by ${admin.firstName} ${admin.lastName}!`
            }
          },
          {
            "type": "actions",
            "elements": [
              {
                "type": "button",
                "style": "primary",
                "text": {
                  "type": "plain_text",
                  "text": "Manage event",
                  "emoji": true
                },
                "url": `https://account.${process.env.ORIGIN}/event/${event.link}`
              }
            ]
          }
        ]
      },
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      json: true
    })
    .then((response) => {
      console.log("[mail] Slack response", response);
    })
    .catch((e) => {
      console.error(e);
    })
  }

  var html = `Hello ${user.firstName},<br><br> Your event, <b>${event.fullName}</b>, has been approved for publication! Event information will now appear on the FTCScores front page, in search results and on team profiles. Please reach out to us if you have any questions, and have a great event!`;
  var subject = `Event published: ${event.shortName}`;
  for (var email of emails) {
    exports.sendEmail(subject, html, email, (error) => {
    });
  }
}
