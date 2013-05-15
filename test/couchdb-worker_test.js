'use strict';

var server = process.env.COUCH_URL || 'http://localhost:5984';

var url = require('url');
var worker = require('../lib/couchdb-worker.js');
var nano = require('nano')(server);

// https://gist.github.com/jed/982883
var uuid = function b(a){return a?(a^Math.random()*16>>a/4).toString(16):([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,b);};

/*
  ======== A Handy Little Nodeunit Reference ========
  https://github.com/caolan/nodeunit

  Test methods:
    test.expect(numAssertions)
    test.done()
  Test assertions:
    test.ok(value, [message])
    test.equal(actual, expected, [message])
    test.notEqual(actual, expected, [message])
    test.deepEqual(actual, expected, [message])
    test.notDeepEqual(actual, expected, [message])
    test.strictEqual(actual, expected, [message])
    test.notStrictEqual(actual, expected, [message])
    test.throws(block, [error], [message])
    test.doesNotThrow(block, [error], [message])
    test.ifError(value)
*/

exports.api = {
  'typeof': function(test) {
    test.expect(1);
    test.equal(typeof worker.listen, 'function', 'should be a function.');
    test.done();
  },
  'missing id': function(test) {
    test.expect(1);
    test.throws(function() {
      worker.listen();
    }, 'should throw error moaning missing id');
    test.done();
  },
  'missing process': function(test) {
    test.expect(1);
    test.throws(function() {
      worker.listen({ id: 'myworker' });
    }, 'should throw error moaning missing process function');
    test.done();
  },
  'missing url': function(test) {
    test.expect(1);
    test.throws(function() {
      worker.listen({ id: 'myworker', process: function() {} });
    }, 'should throw error moaning missing url');
    test.done();
  },
};

exports.listen = {
  setUp: function(done) {
    var that = this;
    this.dbname = 'couchdb-worker-test-' + encodeURIComponent(uuid());
    this.url = url.resolve(server, this.dbname);
    
    nano.db.create(this.dbname, function(err) {
      if (err) {
        throw(err);
      }
      that.db = nano.use(that.dbname);
      done();
    });
  },
  tearDown: function(done) {
    nano.db.destroy(this.dbname, done);
  },
  'feed object': function(test) {
    test.expect(5);
    var w = worker.listen({ db: this.url, id: 'myworker', process: function() {} });
    test.equal(typeof w, 'object', 'should return an object');
    test.equal(typeof w.pause, 'function', 'should expose `pause` function');
    test.equal(typeof w.resume, 'function', 'should expose `resume` function');
    test.equal(typeof w.stop, 'function', 'should expose `stop` function');
    test.equal(typeof w.on, 'function', 'should expose `on` function');
    w.stop();
    test.done();
  },
  'pause during process': function(test) {
    test.expect(2);
    var w;
    function process(doc, next) {
      test.ok(w.is_paused, 'feed should be paused');
      next(null, function() {
        test.ok(!w.is_paused, 'feed should be resumed');
        w.stop();
        test.done();
      });
    }
    w = worker.listen({ db: this.url, id: 'myworker', process: process });
    this.db.insert({});
  },
  'event worker:triggered': function(test) {
    test.expect(1);
    var w = worker.listen({ db: this.url, id: 'myworker', process: function() {} });
    w.on('worker:triggered', function() {
      test.ok(true, 'worker:triggered event should have been fired');
      test.done();
    });
    this.db.insert({});
  },
  'event worker:committed': function(test) {
    test.expect(1);
    function process(doc, next) {
      next(null, function() {
        w.stop();
      });
    }
    var w = worker.listen({ db: this.url, id: 'myworker', process: process });
    w.on('worker:committed', function() {
      test.ok(true, 'worker:committed event should have been fired');
      test.done();
    });
    this.db.insert({});
  },
  'event worker:error': function(test) {
    test.expect(1);
    function process(doc, next) {
      // let the status update fail
      delete doc._rev;
      next(null, function() {
        w.stop();
      });
    }
    var w = worker.listen({ db: this.url, id: 'myworker', process: process });
    w.on('worker:error', function() {
      test.ok(true, 'worker:error event should have been fired');
      test.done();
    });
    this.db.insert({});
  },
  'worker status error info': function(test) {
    test.expect(4);
    function process(doc, next) {
      next({ failed: true, reason: 'my_reason' }, function(err, doc) {
        test.equal(doc.worker_status.myworker.status, 'error', 'worker status should be set to `error`');
        test.equal(typeof doc.worker_status.myworker.error, 'object', 'worker status error should be an object');
        test.ok(doc.worker_status.myworker.error && doc.worker_status.myworker.error.failed, 'worker status error should be failed');
        test.equal(doc.worker_status.myworker.error && doc.worker_status.myworker.error.reason, 'my_reason', 'worker status error reason should be set');
        w.stop();
        test.done();
      });
    }
    var w = worker.listen({ db: this.url, id: 'myworker', process: process });
    this.db.insert({});
  },
  'process arguments': function(test) {
    test.expect(3);
    var w;
    function process(doc, next) {
      test.equal(typeof doc, 'object', 'doc should be an object');
      test.equal(doc._id, 'mydoc', 'doc should have proper _id');
      test.equal(typeof next, 'function', 'next should be a function');
      w.stop();
      test.done();
    }
    w = worker.listen({ db: this.url, id: 'myworker', process: process });
    this.db.insert({}, 'mydoc');
  },
  'global worker status': function(test) {
    test.expect(1);
    var w;
    var count = 0;
    function process(doc) {
      count++;
      if (doc._id === 'mydoc') {
        test.equal(count, 1, 'only mydoc should have been processed');
        w.stop();
        test.done();
      }
    }
    w = worker.listen({ db: this.url, id: 'myworker', process: process });
    var db = this.db;
    this.db.insert({ worker_status: { otherworker: { status: 'triggered' } } }, function() {
      db.insert({}, 'mydoc');
    });
  },
  'own worker status triggered': function(test) {
    test.expect(1);
    var w;
    var count = 0;
    function process(doc) {
      count++;
      if (doc._id === 'mydoc') {
        test.equal(count, 1, 'only mydoc should have been processed');
        w.stop();
        test.done();
      }
    }
    w = worker.listen({ db: this.url, id: 'myworker', process: process });
    var db = this.db;
    this.db.insert({ worker_status: { myworker: { status: 'triggered' } } }, function() {
      db.insert({}, 'mydoc');
    });
  },
  'own worker status complete': function(test) {
    test.expect(1);
    var w;
    var count = 0;
    function process(doc) {
      count++;
      if (doc._id === 'mydoc') {
        test.equal(count, 1, 'only mydoc should have been processed');
        w.stop();
        test.done();
      }
    }
    w = worker.listen({ db: this.url, id: 'myworker', process: process });
    var db = this.db;
    this.db.insert({ worker_status: { myworker: { status: 'complete' } } }, function() {
      db.insert({}, 'mydoc');
    });
  },
  'own worker status error': function(test) {
    test.expect(1);
    var w;
    var count = 0;
    function process(doc) {
      count++;
      if (doc._id === 'mydoc') {
        test.equal(count, 1, 'only mydoc should have been processed');
        w.stop();
        test.done();
      }
    }
    w = worker.listen({ db: this.url, id: 'myworker', process: process });
    var db = this.db;
    this.db.insert({ worker_status: { myworker: { status: 'error' } } }, function() {
      db.insert({}, 'mydoc');
    });
  },
  'worker status': function(test) {
    test.expect(3);
    var w;
    function done(err, doc) {
      test.ok(!err, 'no error occured');
      test.equal(doc.worker_status.myworker.status, 'complete', 'doc should be in complete state');
      w.stop();
      test.done();
    }
    function process(doc, next) {
      test.equal(doc.worker_status.myworker.status, 'triggered', 'doc should be in triggered state');
      next(null, done);
    }
    w = worker.listen({ db: this.url, id: 'myworker', process: process });
    this.db.insert({});
  },
};
