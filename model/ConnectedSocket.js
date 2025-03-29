const mongoose = require('mongoose');
const Schema = mongoose.Schema;

var schema = new Schema({
  socketId: { type: String, required: true, unique: true },
  clientId: { type: String },
  page: { type: String },
  lastUpdate: { type: Date, expires: '60m' }
});

module.exports = mongoose.model('ConnectedSocket', schema);
