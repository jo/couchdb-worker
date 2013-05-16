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

    process.nextTick(function() {
      nano.db.create(that.dbname, function(err) {
        if (err) {
          throw(err);
        }
        that.db = nano.use(that.dbname);
        done();
      });
    });
  },
  tearDown: function(done) {
    nano.db.destroy(this.dbname, done);
  },
  'feed object': function(test) {
    test.expect(5);
    var w = worker.listen({ db: this.url, id: 'myworker', process: function() {} });
    w.on('start', function() {
      test.equal(typeof w, 'object', 'should return an object');
      test.equal(typeof w.pause, 'function', 'should expose `pause` function');
      test.equal(typeof w.resume, 'function', 'should expose `resume` function');
      test.equal(typeof w.stop, 'function', 'should expose `stop` function');
      test.equal(typeof w.on, 'function', 'should expose `on` function');
      w.stop();
    });
    w.on('stop', test.done);
  },
  'process callback arguments': function(test) {
    test.expect(3);
    var w;
    function process(doc, next) {
      test.equal(typeof doc, 'object', 'doc should be an object');
      test.equal(doc._id, 'mydoc', 'doc _id should be `mydoc`');
      test.equal(typeof next, 'function', 'next should be a function');
      w.stop();
    }
    w = worker.listen({ db: this.url, id: 'myworker', process: process });
    w.on('stop', test.done);
    this.db.insert({}, 'mydoc');
  },
  'next callback arguments': function(test) {
    test.expect(3);
    function process(doc, next) {
      next(null, function(err, doc) {
        test.ok(!err, 'error should be null');
        test.equal(typeof doc, 'object', 'doc should be an object');
        test.equal(doc._id, 'mydoc', 'doc _id should be `mydoc`');
        w.stop();
      });
    }
    var w = worker.listen({ db: this.url, id: 'myworker', process: process });
    w.on('stop', test.done);
    this.db.insert({}, 'mydoc');
  },
  'pause during process': function(test) {
    test.expect(2);
    var w;
    function process(doc, next) {
      test.ok(w.is_paused, 'feed should be paused');
      next(null, function() {
        test.ok(!w.is_paused, 'feed should be resumed');
        w.stop();
      });
    }
    w = worker.listen({ db: this.url, id: 'myworker', process: process });
    w.on('stop', test.done);
    this.db.insert({});
  },
  'event worker:complete': function(test) {
    test.expect(3);
    function process(doc, next) {
      next(null, function() {
        w.stop();
      });
    }
    var w = worker.listen({ db: this.url, id: 'myworker', process: process });
    w.on('worker:complete', function(doc) {
      test.ok(true, 'worker:complete event should have been fired');
      test.equal(typeof doc, 'object', 'doc should be an object');
      test.equal(doc._id, 'mydoc', 'doc _id should be `mydoc`');
    });
    w.on('stop', test.done);
    this.db.insert({}, 'mydoc');
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
      });
    }
    var w = worker.listen({ db: this.url, id: 'myworker', process: process });
    w.on('stop', test.done);
    this.db.insert({});
  },
  'event worker:error': function(test) {
    test.expect(5);
    function process(doc, next) {
      // let the status update fail
      delete doc._rev;
      next(null, function() {
        w.stop();
      });
    }
    var w = worker.listen({ db: this.url, id: 'myworker', process: process });
    w.on('worker:error', function(err, doc) {
      test.ok(true, 'worker:error event should have been fired');
      test.equal(typeof err, 'object', 'err should be an object');
      test.equal(err.error, 'conflict', 'err should be a `conflict`');
      test.equal(typeof doc, 'object', 'doc should be an object');
      test.equal(doc._id, 'mydoc', 'doc _id should be `mydoc`');
    });
    w.on('stop', test.done);
    this.db.insert({}, 'mydoc');
  },
  'global worker document status': function(test) {
    test.expect(1);
    var w;
    var count = 0;
    function process(doc) {
      count++;
      if (doc._id === 'mydoc') {
        test.equal(count, 1, 'only mydoc should have been processed');
        w.stop();
      }
    }
    w = worker.listen({ db: this.url, id: 'myworker', process: process });
    w.on('stop', test.done);
    var db = this.db;
    this.db.insert({ worker_status: { otherworker: { status: 'triggered' } } }, function() {
      db.insert({}, 'mydoc');
    });
  },
  'own worker document status triggered': function(test) {
    test.expect(1);
    var w;
    var count = 0;
    function process(doc) {
      count++;
      if (doc._id === 'mydoc') {
        test.equal(count, 1, 'only mydoc should have been processed');
        w.stop();
      }
    }
    w = worker.listen({ db: this.url, id: 'myworker', process: process });
    w.on('stop', test.done);
    var db = this.db;
    this.db.insert({ worker_status: { myworker: { status: 'triggered' } } }, function() {
      db.insert({}, 'mydoc');
    });
  },
  'own worker document status complete': function(test) {
    test.expect(1);
    var w;
    var count = 0;
    function process(doc) {
      count++;
      if (doc._id === 'mydoc') {
        test.equal(count, 1, 'only mydoc should have been processed');
        w.stop();
      }
    }
    w = worker.listen({ db: this.url, id: 'myworker', process: process });
    w.on('stop', test.done);
    var db = this.db;
    this.db.insert({ worker_status: { myworker: { status: 'complete' } } }, function() {
      db.insert({}, 'mydoc');
    });
  },
  'own worker document status error': function(test) {
    test.expect(1);
    var w;
    var count = 0;
    function process(doc) {
      count++;
      if (doc._id === 'mydoc') {
        test.equal(count, 1, 'only mydoc should have been processed');
        w.stop();
      }
    }
    w = worker.listen({ db: this.url, id: 'myworker', process: process });
    w.on('stop', test.done);
    var db = this.db;
    this.db.insert({ worker_status: { myworker: { status: 'error' } } }, function() {
      db.insert({}, 'mydoc');
    });
  },
  'document status': function(test) {
    test.expect(3);
    var w;
    function done(err, doc) {
      test.ok(!err, 'no error occured');
      test.equal(doc.worker_status.myworker.status, 'complete', 'doc should be in complete state');
      w.stop();
    }
    function process(doc, next) {
      test.equal(doc.worker_status.myworker.status, 'triggered', 'doc should be in triggered state');
      next(null, done);
    }
    w = worker.listen({ db: this.url, id: 'myworker', process: process });
    w.on('stop', test.done);
    this.db.insert({});
  },
  'worker status default id': function(test) {
    test.expect(1);
    var w;
    function done() {
      w.stop();
    }
    function process(doc, next) {
      next(null, done);
    }
    w = worker.listen({ db: this.url, id: 'myworker', process: process });
    test.equal(w.status && w.status._id, 'worker-status/myworker', 'status should have default id');
    w.on('stop', test.done);
    this.db.insert({}, 'mydoc');
  },
  'worker status custom id': function(test) {
    test.expect(1);
    var w;
    function done() {
      w.stop();
    }
    function process(doc, next) {
      next(null, done);
    }
    w = worker.listen({ db: this.url, id: 'myworker', process: process, status: { id: 'mystatus' } });
    test.equal(w.status && w.status._id, 'mystatus', 'status should have custom id');
    w.on('stop', test.done);
    this.db.insert({}, 'mydoc');
  },
  'worker status updates': function(test) {
    test.expect(6);
    var w;
    function done() {
      w.stop();
    }
    function process(doc, next) {
      test.equal(w.status.checked, 1, 'status should have checked one doc');
      test.equal(w.status.seq, 1, 'status should have curren seq');
      test.equal(w.status.last, 'mydoc', 'status should have used last `mydoc`');
      test.equal(w.status.triggered, 1, 'status should have triggered one doc');
      next(null, done);
    }
    w = worker.listen({ db: this.url, id: 'myworker', process: process });
    test.equal(typeof w.status, 'object', 'status should be an object');
    test.equal(w.status._id, 'worker-status/myworker', 'status should have default id');
    w.on('stop', test.done);
    this.db.insert({}, 'mydoc');
  },
  'worker status storage': function(test) {
    test.expect(1);
    var w;
    function process(doc, next) {
      next(null);
    }
    w = worker.listen({ db: this.url, id: 'myworker', process: process });
    var feed = this.db.follow();
    feed.on('change', function(change) {
      if (change.id === 'worker-status/myworker') {
        test.ok(true, 'status has been stored');
        feed.stop();
        w.stop();
        // test.done();
      }
    });
    feed.follow();
    this.db.insert({}, 'mydoc');
  },
};
