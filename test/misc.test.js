const chai = require('chai');
const expect = chai.expect;
const request = require('supertest-as-promised');
const httpStatus = require('http-status');
const mongoose = require('mongoose');

// Dummy AUTH_TOKEN
process.env.AUTH_TOKEN = "testauthtoken";
// Use non standard port for test
process.env.PORT = 10000;
const app = require('../app.js');

after(function(done) {
  mongoose.models = {};
  mongoose.modelSchemas = {};
  mongoose.connection.close();
  done();
});

describe('## Misc', function() {
  describe('# GET /api/', function () {
    it('should return Hi There!', function (done) {
      request(app)
        .get('/api/')
        .expect(httpStatus.OK)
        .then(function (res) {
          expect(res.text).to.equal('Hi There!');
          done();
        })
        .catch(done);
    });
  });
});
