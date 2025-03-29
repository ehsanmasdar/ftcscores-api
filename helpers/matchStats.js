module.exports = {
  calculateRp2021: (match, teamNumber) => {
    var isRed = false;
    for (var i = 0; i < match.teams.red.length; i++) {
      if (match.teams.red[i].number == teamNumber) {
        var isRed = true;
        break;
      }
    }
    if (isRed) {
      return match.scores.red;
    } else {
      return match.scores.blue;
    }
  },
  calculateTbp12021: (match, teamNumber) => {
    var isRed = false;
    for (var i = 0; i < match.teams.red.length; i++) {
      if (match.teams.red[i].number == teamNumber) {
        var isRed = true;
        break;
      }
    }
    if (isRed) {
      return match.subscoresRed.auto;
    } else {
      return match.subscoresBlue.auto;
    }
  },
  calculateTbp22021: (match, teamNumber) => {
    var isRed = false;
    for (var i = 0; i < match.teams.red.length; i++) {
      if (match.teams.red[i].number == teamNumber) {
        var isRed = true;
        break;
      }
    }
    if (isRed) {
      return match.subscoresRed.endg;
    } else {
      return match.subscoresBlue.endg;
    }
  },
  calculateRp: function calculateRp(match) {
    if (match.scores.red > match.scores.blue) {
      return match.subscoresBlue.auto + match.subscoresBlue.tele + match.subscoresBlue.endg;
    } else if (match.scores.blue > match.scores.red) {
      return match.subscoresRed.auto + match.subscoresRed.tele + match.subscoresRed.endg;
    } else {
      var rp1 = match.subscoresBlue.auto + match.subscoresBlue.tele + match.subscoresBlue.endg;
      var rp2 = match.subscoresRed.auto + match.subscoresRed.tele + match.subscoresRed.endg
      return Math.min(rp1, rp2);
    }
  },
  calculateQp: function calculateQp(match, teamNumber) {
    var isRed = false;
    for (var i = 0; i < match.teams.red.length; i++) {
      if (match.teams.red[i].number == teamNumber) {
        var isRed = true;
        break;
      }
    }
    if (match.scores.red == match.scores.blue) {
      return 1;
    }
    if (isRed) {
      if (match.scores.red > match.scores.blue) {
        return 2;
      }
      return 0
    } else {
      if (match.scores.blue > match.scores.red) {
        return 2;
      }
      return 0;
    }
  },
  matchComplete: function(match) {
    return match.status === "done";
  },
  isSurrogateForTeam: function(match, teamNumber) {
    for (var color of ["red", "blue"])
    {
      for (var team of match.teams[color]) {
        if (team.number.toString() === teamNumber.toString()) {
          return team.surrogate || false;
        }
      }
    }
    return null; //team did not play in this match
  },
  isQualificationMatch: function(match) {
    return match.number.substring(0,2) !== "F-" && match.number.substring(0,2) !== "SF"
  }
}
