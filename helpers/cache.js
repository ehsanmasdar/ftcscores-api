const chalk = require('chalk')
const REDIS_HOST = process.env.CACHE_HOST || "127.0.0.1";

module.exports = { };
module.exports.cache = require('express-redis-cache')({
  host: REDIS_HOST,
  expire: 60,
  prefix: process.env.REL
});
module.exports.cache.on('message', function (message) {
  try {
    var parts = message.split(" ");
    if (parts[0] === "GET") {
      console.log(chalk.blue(`[cache] GET ${parts[1]} ${parts[2]} ${parts[3]}`))
    } else if (parts[0] === "SET") {
      console.log(chalk.cyan(`[cache] SET ${parts[1]} ${parts[2]} ${parts[3]} for ${parts[4]}s`))
    }
  } catch (e) {
    console.log(chalk.warn(`[cache] Error in processing message: ${message}`))
  }
});

const bluebird = require('bluebird');
var client = require('redis').createClient({
  host: REDIS_HOST
});
const Redlock = require('redlock');

module.exports.redis = bluebird.promisifyAll(client);
module.exports.redlock = new Redlock([client]);
