/*
 * CouchDB Worker
 *
 * Mocha Integration Tests for Worker module.
 *
 * Author: Johannes J. Schmidt
 * (c) null2 GmbH, 2012
 * MIT Licensed
 */

var assert = require("assert");
var request = require("request");
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
  var db = 'couchdb-worker-test';

  beforeEach(function(cb) {
    request({
      url: options.server + '/' + db,
      method: 'DELETE'
    }, function(error, resp, data) {
      request({
        url: options.server + '/' + db,
        method: 'PUT'
      }, function(error, resp, data) {
        if (error !== null) {
          console.error('Error: Could not create test database!');
          return;
        }
        cb();
      });
    });
  });

  var worker = new Worker(options, db);

  describe("doc processing", function() {
    it("should be cool", function() {
      assert.equal('cool', typeof Worker);
    });
  });
});
