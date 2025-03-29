const fs = require('fs');
const mongoose = require('mongoose');
if (fs.existsSync('.env')) {
  require('dotenv').config();
}
const Team = require('./model/Team');
const Event = require('./model/Event');

function clearAllIndices() {
  return new Promise((resolve, reject) => {
    esClient.indices.delete({
      index: '_all'
    }, function(err, res) {
      if (err) {
        reject(err);
      } else {
        console.log("[Search] All indices cleared");
        resolve();
      }
    });
  })
}
function syncIndex(Model) {
  return new Promise((resolve, reject) => {
    var stream = Model.synchronize();
    var count = 0;
    stream.on('data', function(err, doc){
      count++;
    });
    stream.on('close', function(){
      console.log(`[Search] Indexed ${count} documents in collection "${Model.modelName}"`);
      resolve();
    });
    stream.on('error', function(err){
      console.error(err);
      reject(err);
    });
  })
}
function clearIndex(Model) {
  return new Promise((resolve, reject) => {
    Model.esTruncate(function(err){
      if (err) reject(err)
      else resolve()
    });
  })
}
function resyncIndex(Model) {
  return clearIndex(Model)
  .catch((err) => {
    console.warn(err);
  })
  .then(() => {
    return syncIndex(Model);
  })
  .then(() => {
    console.log(`Synchronized ${Model.modelName}`)
  })
}

mongoose.connect(process.env.DATABASE_PORT_27017_TCP_ADDR);

return Promise.all([
  syncIndex(Event),
  syncIndex(Team)
])
.then(() => {
  console.log("[Search] All indices synced")
  process.exit(0)
})
.catch((e) => {
  console.error(e);
  process.exit(1)
})
