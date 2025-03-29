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

describe('## Event', function() {
  const ev = {
    "info": {
      "name": "Test Event",
      "shortname": "test",
      "sponsor": "",
      "location": "Test",
      "tier": "League",
      "startdate": "2017-04-01",
      "enddate": "2017-04-29",
      "date": "April 1 - 29, 2017"
    },
    "matches": []
  };
  describe('# POST /api/events', function() {
    it('should create an event', function(done) {
      request(app)
        .post('/api/events')
        .set('Authorization', process.env.AUTH_TOKEN)
        .send(ev)
        .expect(httpStatus.OK)
        .then(function(res) {
          expect(res.body.matches).to.deep.equal(ev.matches);
          expect(res.body.info).to.deep.equal(ev.info);
          done();
        });
    });
    it('should report error 403 Forbidden since Authorization token is invalid', function(done) {
      request(app)
        .post('/api/events')
        .set('Authorization', "")
        .send(ev)
        .expect(httpStatus.FORBIDDEN)
        .then(function(res) {
          expect(res.body.message).to.equal("Operation forbidden");
          done();
        });
    });
    it('should report error 400 Bad Request since object sent is malformed',
      function(done) {
        request(app)
          .post('/api/events')
          .set('Authorization', process.env.AUTH_TOKEN)
          .send(ev.info)
          .expect(httpStatus.BAD_REQUEST)
          .then(function(res) {
            expect(res.body.message).to.equal("validation error")
            done();
          });
      });
    it('should report error 409 Conflict since event already exists',
      function(done) {
        request(app)
          .post('/api/events')
          .set('Authorization', process.env.AUTH_TOKEN)
          .send(ev)
          .expect(httpStatus.CONFLICT)
          .then(function(res) {
            expect(res.body.message).to.equal("Event already exists")
            done();
          });
      });
  });
  describe('# GET /api/events/:eventId', function() {
    it('should get event information', function(done) {
      request(app)
        .get(`/api/events/${ev.info.shortname}`)
        .expect(httpStatus.OK)
        .then(function(res) {
          expect(res.body.matches).to.deep.equal(ev.matches);
          expect(res.body.info).to.deep.equal(ev.info);
          done();
        });
    });
    it('should report error 404 Not Found since event does not exist', function(done) {
      request(app)
        .get("/api/events/abc123")
        .expect(httpStatus.NOT_FOUND)
        .then(function(res) {
          expect(res.body.message).to.equal("Event not found");
          done();
        });
    });
  });
  const newMatches = [{
    "id": 1,
    "status": "done",
    "number": "Q-1",
    "teams": [{
      "number": 1,
      "name": "",
      "rank": 1
    }, {
      "number": 2,
      "name": "",
      "rank": 2
    }, {
      "number": 3,
      "name": "",
      "rank": 3
    }, {
      "number": 4,
      "name": "",
      "rank": 4
    }],
    "scores": {
      "red": 80,
      "blue": 55
    },
    "subscoresRed": {
      "auto": 30,
      "tele": 50,
      "endg": 0,
      "pen": 0
    },
    "subscoresBlue": {
      "auto": 5,
      "tele": 10,
      "endg": 40,
      "pen": 0
    }
  }];
  describe('# PUT /api/events/:eventId/matches', function() {
    it('should report error 403 Forbidden since Authorization token is invalid', function(done) {
      request(app)
        .put(`/api/events/${ev.info.shortname}/matches`)
        .set('Authorization', "")
        .expect(httpStatus.FORBIDDEN)
        .then(function(res) {
          expect(res.body.message).to.equal("Operation forbidden");
          done();
        });
    });
    it('should update event matches', function(done) {
      request(app)
        .put(`/api/events/${ev.info.shortname}/matches`)
        .set('Authorization', process.env.AUTH_TOKEN)
        .send(newMatches)
        .expect(httpStatus.OK)
        .then(function(res) {
          ev.matches = newMatches;
          expect(res.body.matches).to.deep.equal(newMatches);
          done();
        });
    });
    it('should report error 404 Not Found since event does not exist', function(done) {
      request(app)
        .put("/api/events/abc123/matches")
        .set('Authorization', process.env.AUTH_TOKEN)
        .send(newMatches)
        .expect(httpStatus.NOT_FOUND)
        .then(function(res) {
          expect(res.body.message).to.equal("Event not found");
          done();
        });
    });
  });
  describe('# GET /api/events', function() {
    it('should return a list of events', function(done) {
      request(app)
        .get('/api/events')
        .expect(httpStatus.OK)
        .then(function(res) {
          expect(res.body).to.be.an('array');
          done();
        });
    });
  });
  describe('# DELETE /api/events/:eventId', function() {
    it('should report error 403 Forbidden since Authorization token is invalid', function(done) {
      request(app)
        .delete(`/api/events/${ev.info.shortname}`)
        .set('Authorization', "")
        .expect(httpStatus.FORBIDDEN)
        .then(function(res) {
          expect(res.body.message).to.equal("Operation forbidden");
          done();
        });
    });
    it('should delete event', function(done) {
      request(app)
        .delete(`/api/events/${ev.info.shortname}`)
        .set('Authorization', process.env.AUTH_TOKEN)
        .expect(httpStatus.OK)
        .then(function(res) {
          expect(res.body.matches).to.deep.equal(ev.matches);
          expect(res.body.info).to.deep.equal(ev.info);
          done();
        });
    });
    it('should report error 404 Not Found since event does not exist', function(done) {
      request(app)
        .delete("/api/events/abc123")
        .expect(httpStatus.NOT_FOUND)
        .then(function(res) {
          expect(res.body.message).to.equal("Event not found");
          done();
        });
    });
  });
});
