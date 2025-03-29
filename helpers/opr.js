const _ = require('lodash');

const {
  Matrix,
  solve,
  inverse
} = require('ml-matrix');

const {
  mixRankingsIntoTeam
} = require('../helpers/computation.js');

function setOPRs(rankings, oprs, field) {
  if (oprs == null) {
    //underdetermined system
    for (var i=0; i<rankings.length; i++) {
      rankings[i].current[field] = 0.0;
    }
  } else {
    //set oprs to each team in rankings
    for (var i=0; i<oprs.length; i++) {
      //if team didn't play yet, set OPR to zero
      if (rankings[i].current.matches == 0 || isNaN(oprs[i]) || oprs[i] < 0) {
        rankings[i].current[field] = 0.0;
      } else {
        rankings[i].current[field] = +(oprs[i].toFixed(1));
      }
    }
  }
}


exports.compute2 = function(_matches, _rankings) {
  const mmse = 1; //0 for OPR, 1-3 for typical matches

  if (!_rankings || !_matches || _.isEmpty(_rankings)) return _rankings;

  console.time("opr compute2")

  let rankings = JSON.parse(JSON.stringify(_rankings));
  let matches = JSON.parse(JSON.stringify(_matches));

  //create lookup table for teams
  let teams = { };
  for (var i = 0; i < rankings.length; i++) {
    teams[rankings[i].number] = rankings[i].rank - 1;
  }

  //pick only matches that have been scores
  const scoredMatches = _.filter(matches, (match) => {
    if (match.number.substring(0,2) === "F-" || match.number.substring(0,2) === "SF") return false;
    if (match.status !== "done") return false;

    return true;
  })

  const N = scoredMatches.length;
  const M = rankings.length;

  //setup matrices and vectors
  A_red = Matrix.zeros(N, M);
  A_blue = Matrix.zeros(N, M);
  b_red = Matrix.zeros(N, 1); //b can be called "M"
  b_blue = Matrix.zeros(N, 1);

  A_offense = Matrix.zeros(2 * N, M);
  b_offense = Matrix.zeros(2 * N, 1);

  let highestScore = Array.from({length: N}).map((x, i) => 0);
  let highestScorePenFree = Array.from({length: N}).map((x, i) => 0);

  //populate matrices and vectors
  var totalScore = 0;
  for (var matchIndex=0; matchIndex < scoredMatches.length; matchIndex++) {
    let match = scoredMatches[matchIndex];

    //red teams
    for (var team of match.teams.red) {
      if (team.surrogate) continue;
      let teamIndex = teams[team.number];
      A_red[matchIndex][teamIndex] = 1;
      A_offense[matchIndex][teamIndex] = 1; //red goes on top half
    }
    //blue teams
    for (var team of match.teams.blue) {
      if (team.surrogate) continue;
      let teamIndex = teams[team.number];
      A_blue[matchIndex][teamIndex] = 1;
      A_offense[matchIndex + N][teamIndex] = 1; //blue goes on bottom half
    }

    b_red[matchIndex][0] = match.scores.red;
    b_blue[matchIndex][0] = match.scores.blue;
    totalScore += match.scores.red + match.scores.blue;
  }

  const totalParticipation = A_offense.sum();
  const meanTeamOffense = totalScore / totalParticipation; //totalScore / (numScoredMatches * 2 * teamsPerAlliance); // 2=alliancesPerMatch
  console.log("totalParticipation", totalParticipation)
  console.log("meanTeamOffense", meanTeamOffense)

  for (var i = 0; i < N; i++) {
    b_red[i][0] -= 2.0 * meanTeamOffense;
    b_blue[i][0] -= 2.0 * meanTeamOffense;
    b_offense[i][0] = b_red[i][0];
    b_offense[i + N][0] = b_blue[i][0];
  }

  var M_matches = A_offense.transpose().mmul(A_offense); //A^T A
  var M_matches_mmse = M_matches.clone();

  //mInv += Matrix.eye(numTeams, numTeams, mmse)
  for (var i=0; i<M_matches_mmse.length; i++) {
    M_matches_mmse[i][i] += mmse;
  }

  //compute inverse (do NOT use SVD)
  //TODO catch lack of invertability
  M_matches = inverse(M_matches, false);
  M_matches_mmse = inverse(M_matches_mmse, false);

  var M_partial = A_offense.transpose().mmul(b_offense);

  //compute OPRm
  var oprs = M_matches.mmul(M_partial).to1DArray();
  oprs = _.map(oprs, (a) => a + meanTeamOffense);

  var oprms = M_matches.mmul(M_partial).to1DArray();
  oprms = _.map(oprms, (a) => a + meanTeamOffense);

  console.log("M_matches", M_matches)
  console.log("oprs", oprs)
  console.log("oprms", oprms)

  //set data from arrays
  setOPRs(rankings, oprs, "opr");
  setOPRs(rankings, oprms, "oprm");

  console.timeEnd("opr compute2")

  return rankings;
}

exports.compute = function(_matches, _rankings, eventSeason) {
  if (!_rankings || !_matches || _.isEmpty(_rankings)) return _rankings;

  console.log("opr compute", eventSeason)
  console.time("opr compute")

  let rankings = JSON.parse(JSON.stringify(_rankings));
  let matches = JSON.parse(JSON.stringify(_matches));
  //create lookup table for teams
  let teams = { };
  for (var i = 0; i < rankings.length; i++) {
    teams[rankings[i].number] = rankings[i].rank - 1;
  }

  let N = rankings.length;

  //iterate rows
  //A_i (A row i) = all matches that team i was involved in
  let M = Array.from({length: N}).map((x, i) => Array.from({length: N}).map((y, j) => 0)); //initialize to all zeros
  //B_i = sum of all of that team's matches, including surrogates
  let b = Array.from({length: N}).map((x, i) => 0); //initialize to all zeros
  //sum of all teams' matches, excluding penalty points, including surrogates
  let bPenFree = Array.from({length: N}).map((x, i) => 0);

  //calclate high scores
  let highestScore = Array.from({length: N}).map((x, i) => 0);
  let highestScorePenFree = Array.from({length: N}).map((x, i) => 0);

  //sum of teams' scores, excluding surrogates (for average calculation)
  let sumScore = Array.from({length: N}).map((x, i) => 0);
  let sumScorePenFree = Array.from({length: N}).map((x, i) => 0);

  const colors = [ "blue", "red" ];
  const colorsPenalty = eventSeason === "1819" ? [ "Red", "Blue" ] : [ "Blue", "Red" ];

  //for each match
  for (var i=0; i<matches.length; i++) {
    let match = matches[i];

    //for each team in the match, add match to team's row
    if (match.number.substring(0,2) === "F-" || match.number.substring(0,2) === "SF") continue;
    if (match.status !== "done") continue;

    //for each team color
    for (var c=0; c<colors.length; c++) {
      let color = colors[c];

      //b: add match score to each member in match (on same team)
      let matchScore = match.scores[color];
      let matchScorePenFree = match["subscores" + colorsPenalty[c]] ?
        match.scores[color] - match["subscores" + colorsPenalty[c]].pen :
        matchScore;
      for (var j=0; j<match.teams[color].length; j++) {
        let teamNumber = match.teams[color][j].number; //team number
        let teamRow = teams[teamNumber];
        b[teamRow] += matchScore;
        bPenFree[teamRow] += matchScorePenFree;

        if (!match.teams[color][j].surrogate) {
          //add to sum, highest
          highestScore[teamRow] = Math.max(highestScore[teamRow], matchScore);
          highestScorePenFree[teamRow] = Math.max(highestScorePenFree[teamRow], matchScorePenFree);
          sumScore[teamRow] += matchScore;
          sumScorePenFree[teamRow] += matchScorePenFree;
        }
      }

      //A: add 1 to each participating team cell (all permutations)
      for (var k=0; k<match.teams[color].length; k++) {
        let teamRowA = teams[match.teams[color][k].number];
        // if (match.teams[color][k].surrogate) continue; //ignore surrogates

        for (var l=0; l<match.teams[color].length; l++) {
          let teamRowB = teams[match.teams[color][l].number];
          // if (match.teams[color][l].surrogate) continue; //ignore surrogates
          if (typeof teamRowA === 'undefined') {
            console.error(`Team ${match.teams[color][k].number} in match ${match.number} but not in rankings`);
            continue;
          }
          if (typeof teamRowB === 'undefined') {
            console.error(`Team ${match.teams[color][l].number} in match ${match.number} but not in rankings`);
            continue;
          }
          M[teamRowA][teamRowB] += 1;
        }
      }

    }
  }

  const averageScores = _.map(sumScore, (v, i) => { return (rankings[i].current.matches > 0) ? v / rankings[i].current.matches : 0 });
  const averageScoresPenFree = _.map(sumScorePenFree, (v, i) => { return (rankings[i].current.matches > 0) ? v / rankings[i].current.matches : 0 });

  setOPRs(rankings, averageScores, "average")
  setOPRs(rankings, averageScoresPenFree, "averagePenFree")

  _M = new Matrix(M);
  _b = Matrix.columnVector(b);
  _bPenFree = Matrix.columnVector(bPenFree);

  const det = _M.det();
  const isSingular = det == 0;

  try {
    const oprs = solve(_M, _b, isSingular).to1DArray();
    const oprsPenFree = solve(_M, _bPenFree, isSingular).to1DArray();

    setOPRs(rankings, oprs, "opr");
    setOPRs(rankings, oprsPenFree, "oprPenFree");
    setOPRs(rankings, highestScore, "highest")
    setOPRs(rankings, highestScorePenFree, "highestPenFree")
  } catch (e) {
    console.error(e);
    return rankings;
  }

  console.timeEnd("opr compute")

  return rankings;
}
