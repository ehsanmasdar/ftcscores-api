const Heap = require('heap');
const diff = require('deep-diff').diff;
const _ = require('lodash');

module.exports = {
    computeTopMatchesFTC: function (matches) {
      if (matches && matches.length > 0) {
        var heap = new Heap(function (a, b) {
          var aScores = Math.max(a.scores.red, a.scores.blue);
          var bScores = Math.max(b.scores.red, b.scores.blue);
          return aScores - bScores;
        });
        for (var i = 0; i < matches.length; i++) {
          var match = matches[i];
          if (heap.size() == 4 && heap.cmp(match, heap.peek()) > 0) {
            heap.replace(match);
          } else if (heap.size() < 4 && match.status == 'done') {
            heap.push(match);
          }
        }
        // Sort into decending order using b - a
        return heap.nodes.sort(function (a, b) {
          var aScores = Math.max(a.scores.red, a.scores.blue);
          var bScores = Math.max(b.scores.red, b.scores.blue);
          return bScores - aScores;
        });
      }
      return null;
    },
    generateRankingsIfBlank: function (_rankings, teams) {
      if (_rankings && _rankings.length) return _rankings;
      if (!teams || !Object.keys(teams) || !Object.keys(teams).length) return null;

      //generate blank rankings
      let rankings = [ ];
      for (var teamNumber in teams) {
        if (teams.hasOwnProperty(teamNumber)) {
          let team = teams[teamNumber];
          rankings.push({
            name: team.name,
            number: team.number,
            current: {
              matches: 0,
              qp: 0,
              rp: 0
            }
          })
        }
      }

      let sortedRankings = _.sortBy(rankings, "number");
      for (var i=0; i<rankings.length; i++) {
        sortedRankings[i].rank = i + 1;
      }

      return sortedRankings;
    },
    computeTopTeamsFTC: function (teams) {
      if (teams) {
        return teams.slice(0, 4);
      }
      return null;
    },
    computeLatestMatchFTC: function (matches) {
      if (matches && matches.length > 0) {
        for (var i = matches.length - 1; i > -1; i--) {
          if (matches[i].status == 'done') {
            return matches[i].number;
          }
        }
      }
      return null;
    },
    computeStatusFTC: function (matches, status) {
      if (status == "Completed") {
        return "Completed";
      }
      if (matches.length > 0 && matches[0].status == 'done') {
        return "Live";
      } else {
        return "Starting soon";
      }
    },
    computeNotificationFTC: function (oldMatches, newMatches) {
      if (oldMatches != null && oldMatches.length > 0) {
        for (var i = 0; i < oldMatches.length; i++) {
          for (var j = 0; j < newMatches.length; j++) {
            if (oldMatches[i].number == newMatches[j].number) {
              if ((oldMatches[i].scores.blue != newMatches[j].scores.blue) || (oldMatches[i].scores.red != newMatches[j].scores.red)) {
                return newMatches[j];
              }
            }
          }
        }
      }
      return null;
    },
    matchComparator: function (a, b) {
      return a.order - b.order;
    },
    mixRankingsIntoTeam: function (rankings, teams) {
      for (var i = 0; i < rankings.length; i++) {
        try {
          teams[rankings[i].number].rank = rankings[i].rank;
        } catch(e) {
          console.error("Team in rankings but not in team list", rankings[i].number);
        }
      }
      return teams;
    },
    mixNamesIntoMatches: function (matches, rankings) {
      try {
        var rankingsMap = {};
        for (var i = 0; i < rankings.length; i++) {
          rankingsMap[rankings[i].number] = rankings[i];
        }
        for (var i = 0; i < matches.length; i++) {
          for (var j = 0; j < matches[i].teams.red.length; j++) {
            matches[i].teams.red[j].name = rankingsMap[matches[i].teams.red[j].number].name;
          }
          for (var j = 0; j < matches[i].teams.blue.length; j++) {
            matches[i].teams.blue[j].name = rankingsMap[matches[i].teams.blue[j].number].name;
          }
        }
        return matches;
      } catch (e) {
        throw({ status: 400, message: "Rankings and matches are inconsistent", detail: e.stack })
      }
    }
}
