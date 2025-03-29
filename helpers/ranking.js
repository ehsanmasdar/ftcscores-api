const Heap = require('heap');
const matchStats = require('./matchStats.js');
const Event = require('../model/Event.js');
const CombinedRanking = require('../model/CombinedRanking');

const _ = require('lodash');
const async = require('async');
const moment = require('moment');
const {redlock, redis} = require('../helpers/cache');
exports.validateCombinedEvents = function(events, thisEventLink) {
  return Promise.all(events.map(retrieveEvent))
  .then((_events) => {
    //validated!
    //remove this event
    return _.pull(JSON.parse(JSON.stringify(events)), thisEventLink);
  })
}

exports.structureCombinedEvents = async function(events, thisEventLink) {
  const combinedRankingDoc = await CombinedRanking.create({ranking:[]});
  //add this event to events to map
  events.push(thisEventLink);

  //remove all affected events from any other events' combinedEvents
  await Event.update({ combinedEvents: { "$in": events } }, { "$unset": { combinedEvents: 1, combinedRankings: 1 }}, { multi: true })
  for (let event of events) {
      var set = _.pull(JSON.parse(JSON.stringify(events)), event);
      //add events to set
      await Event.findOneAndUpdate({ link: event }, { "$set": { "combinedEvents": set , "combinedRankings": combinedRankingDoc._id}});
  }
  var event = await Event.get(thisEventLink);
  await exports.computeCombinedOnEvent(event);
}

exports.computeCombinedOnEvent = async function(event) {
  if (!_.isArray(event.combinedEvents) || event.combinedEvents.length < 1) {
    return event;
  } else {
    var lock = await redlock.lock('combinedranking:' + event.combinedRankings._id.toString(), 10000)
    var set = JSON.parse(JSON.stringify(event.combinedEvents));

    //retrieve all event data
    var events = await Promise.all(set.map(retrieveEvent))

    // Add current event to events list
    events.push(event);

    var combinedRankings = await exports.calcCombinedRanking(events);
    if (event.link != "iA-puAWd") {
      var res = await CombinedRanking.findByIdAndUpdate(event.combinedRankings._id, {$set: {ranking: combinedRankings}});
    } else {
      console.log('Not recomputing combined rankings for championship');
    }
    // Clear cache for every event
    for (let eventLink of set) {
      redis.del(eventLink);
    }
    // Update this event to chain through
    await lock.unlock();
    return event;
  }
}
exports.calcCombinedRanking = function(events) {
  return new Promise((resolve, reject) => {
    try {
      if (!events) {
        reject({ status: httpStatus.BAD_REQUEST, message: "No events supplied"});
      } else {
        let teams = {};
        for (let i = 0; i < events.length; i++) {
          let event = events[i];
          if (event && event.type != "League Championship") {
            for (let j = 0; j < event.matches.length; j++) {
              // Only use matches that are complete
              let match = event.matches[j];
              if (matchStats.matchComplete(match)) {
                // Red Teams
                for (let k = 0; k < match.teams.red.length; k++) {
                  let team = match.teams.red[k];
                  if (!team.surrogate) {
                    if (!teams[team.number]) {
                      teams[team.number] = {
                        matchheap: new Heap(function (a, b) {
                          if (a.qp != b.qp)
                            return a.qp - b.qp
                          else if (a.rp != b.rp)
                            return a.rp - b.rp
                          else 
                            return a.tbp2 - b.tbp2
                        }),
                        matches: 1,
                        number: team.number,
                        name: team.name,
                        highest: match.scores.red
                      };
                    } else {
                      teams[team.number].matches += 1;
                      teams[team.number].highest = Math.max(teams[team.number].highest, match.scores.red)
                    }
                    let teamScore = {
                      "qp": matchStats.calculateRp2021(match, team.number),
                      "rp": matchStats.calculateTbp12021(match, team.number),
                      "tbp2": matchStats.calculateTbp22021(match, team.number)
                    };
                    if (teams[team.number].matchheap.size() == 10) {
                      // If teamScore greater than the min element of the heap, replace min element of the heap
                      if (teams[team.number].matchheap.cmp(teamScore, teams[team.number].matchheap.peek()) > 0) {
                        teams[team.number].matchheap.replace(teamScore);
                      }
                    } else {
                      teams[team.number].matchheap.push(teamScore);
                    }
                  }
                }

                // Blue Teams
                for (let k = 0; k < match.teams.blue.length; k++) {
                  let team = match.teams.blue[k];
                  if (!team.surrogate) {
                    if (!teams[team.number]) {
                      teams[team.number] = {
                        matchheap: new Heap(function (a, b) {
                          if (a.qp != b.qp)
                            return a.qp - b.qp
                          else if (a.rp != b.rp)
                            return a.rp - b.rp
                          else 
                            return a.tbp2 - b.tbp2
                        }),
                        matches: 1,
                        number: team.number,
                        name: team.name,
                        highest: match.scores.blue
                      };
                    } else {
                      teams[team.number].matches += 1;
                      teams[team.number].highest = Math.max(teams[team.number].highest, match.scores.blue)
                    }
                    let qp = matchStats.calculateQp(match, team.number);
                    let teamScore = {
                      "qp": matchStats.calculateRp2021(match, team.number),
                      "rp": matchStats.calculateTbp12021(match, team.number),
                      "tbp2": matchStats.calculateTbp22021(match, team.number)
                    };
                    if (teams[team.number].matchheap.size() == 10) {
                      // If teamScore greater than the min element of the heap, replace min element of the heap
                      if (teams[team.number].matchheap.cmp(teamScore, teams[team.number].matchheap.peek()) > 0) {
                        teams[team.number].matchheap.replace(teamScore);
                      }
                    } else {
                      teams[team.number].matchheap.push(teamScore);
                    }
                  }
                }
              }
            }
          }
        }
        let arr = Object.keys(teams).map(function (key) {
          let tenbest = teams[key].matchheap.nodes;
          // Only sort by TBP for dropping TBP scores
          let tenbestSorted = tenbest.sort((a, b) => {
            return b.rp - a.rp;
          });
          let finalqp = tenbestSorted.reduce((prev, curr) => {return prev + curr.qp}, 0);
          let finalrp = tenbestSorted.reduce((prev, curr) => {return prev + curr.rp}, 0);
          let finaltbp2 = tenbestSorted.reduce((prev, curr) => {return prev + curr.tbp2}, 0);

          // Cleanup the object
          teams[key].qp = finalqp;
          teams[key].rp = finalrp;
          teams[key].tbp2 = finaltbp2;
          delete teams[key].matchheap;
 
          return teams[key];
        });
        // Sorted Descending - highest ranked team first
        arr.sort(function (a, b) {
          if (a.qp != b.qp) {
            return b.qp - a.qp;
          } else if (a.rp != b.rp) {
            return b.rp - a.rp;
          } else {
            return b.tbp2 - a.tbp2;
          }
        });

        for (let i=0; i<arr.length; i++) {
          arr[i]= {
            current: {
              qp: arr[i].qp.toFixed(),
              rp: arr[i].rp.toFixed(),
              tbp2: arr[i].tbp2.toFixed(),
              matches: arr[i].matches
            },
            rank: i+1,
            name: arr[i].name,
            number: arr[i].number
          };
        }

        //return combined ranking
        resolve(arr);
      }
    } catch (e) {
      console.error(e)
      reject({ status: 500, message: "An internal error occured"})
    }
  })
}

// Retrieve event from database
function retrieveEvent(link) {
  return new Promise(function (resolve, reject) {
    Event.get(link).then(function (ev) {
      resolve(ev);
    }).catch(function (e) {
      reject({ status: 404, message: `Event '${link}' not found` });
    });
  });
}
