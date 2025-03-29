var mongoose = require('mongoose'),
  Schema = mongoose.Schema;

var CombinedRanking = new Schema({
  "ranking": {
    type: Array
  }
}, { usePushEach: true });
module.exports = mongoose.model('CombinedRanking', CombinedRanking);
