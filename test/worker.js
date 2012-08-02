var assert = require("assert");
var Worker = require("./../lib/worker");

describe("CouchDBWorker", function() {
  var options = {
    name: 'test-worker',
    server: 'http://localhost:5984',
    processor: {
      check: function(doc) {
        return true;
      },
      process: function(doc, done) {
        // do something with the doc
        var output = {
          foo: 'bar'
        };
        done(output);
      }
    }
  };
  var db = '_users';

  var worker = new Worker(options, db);

  describe("_onchanges", function() {
    it("should be a function", function() {
      assert.equal('function', typeof worker._onchanges);
    });
  });

  describe("_checkResponse", function() {
    it("should be a function", function() {
      assert.equal('function', typeof worker._checkResponse);
    });
    it("should return null if there are no errors", function() {
      assert.equal(null, worker._checkResponse(null, { statusCode: 200 }, {}));
    });
    it("should return error", function() {
      var error = { error: 'myerror' };

      assert.equal('object', typeof worker._checkResponse(error));
      assert.equal(error, worker._checkResponse(error).error);
    });
  });

  describe("_log", function() {
    it("should be a function", function() {
      assert.equal('function', typeof worker._log);
    });
  });
});
