'use strict';

var server = process.env.COUCH_URL || 'http://localhost:5984';

var url = require('url');
var worker = require('..');
var nano = require('nano')(server);

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

// https://gist.github.com/jed/982883
var uuid = function b(a){return a?(a^Math.random()*16>>a/4).toString(16):([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,b);};

var setUp = function(done) {
  var that = this;
  this.dbname = 'couchdb-worker-test-' + encodeURIComponent(uuid());
  this.url = url.resolve(server, this.dbname);

  process.nextTick(function() {
    nano.db.create(that.dbname, function(err) {
      if (err) {
        console.error('Could not create test database', that.dbname);
        throw(err);
      }
      that.db = nano.use(that.dbname);
      done();
    });
  });
};

var tearDown = function(done) {
  nano.db.destroy(this.dbname, done);
};

exports.api = {
  'typeof': function(test) {
    test.equal(typeof worker, 'function', 'should be a function.');
    test.done();
  },
  'missing id': function(test) {
    test.throws(function() {
      worker();
    }, 'should throw error moaning missing id');
    test.done();
  },
  'missing process': function(test) {
    test.throws(function() {
      worker({ id: 'myworker' });
    }, 'should throw error moaning missing process function');
    test.done();
  },
  'missing url': function(test) {
    test.throws(function() {
      worker({ id: 'myworker', process: function() {} });
    }, 'should throw error moaning missing url');
    test.done();
  },
  'missing url options': function(test) {
    test.throws(function() {
      worker({ id: 'myworker', db: {}, process: function() {} });
    }, 'should throw error moaning missing url options');
    test.done();
  },
};

exports['callback arguments'] = {
  setUp: setUp,
  tearDown: tearDown,

  'url can be an object': function(test) {
    var w = worker({ db: { url: this.url }, id: 'myworker', process: function() {} });
    w.on('stop', test.done);
    w.on('confirm', function() {
      test.ok(true, 'url can be passed in as an object');
      setTimeout(function() {
        w.stop();
      }, 10);
    });
    w.start();
  },
  'feed object': function(test) {
    var w = worker({ db: this.url, id: 'myworker', process: function() {} });
    w.on('stop', test.done);
    w.on('confirm', function() {
      test.equal(typeof w, 'object', 'should return an object');
      test.equal(typeof w.start, 'function', 'should expose `start` function');
      test.equal(typeof w.pause, 'function', 'should expose `pause` function');
      test.equal(typeof w.resume, 'function', 'should expose `resume` function');
      test.equal(typeof w.stop, 'function', 'should expose `stop` function');
      test.equal(typeof w.on, 'function', 'should expose `on` function');
      setTimeout(function() {
        w.stop();
      }, 10);
    });
    w.start();
  },
  'process callback arguments': function(test) {
    var w;
    function process(doc, db, next) {
      test.equal(typeof doc, 'object', 'doc should be an object');
      test.equal(doc._id, 'mydoc', 'doc _id should be `mydoc`');
      test.equal(typeof db, 'object', 'db should be an object');
      test.equal(typeof db.info, 'function', 'ducktyping: db should have info function');
      test.equal(typeof next, 'function', 'next should be a function');
      w.stop();
    }
    w = worker({ db: this.url, id: 'myworker', process: process });
    w.on('stop', test.done);
    this.db.insert({}, 'mydoc');
    w.start();
  }
};

exports.pause = {
  setUp: setUp,
  tearDown: tearDown,

  'during process': function(test) {
    var w;
    function process() {
      test.ok(w.is_paused, 'feed should be paused');
      w.stop();
    }
    w = worker({ db: this.url, id: 'myworker', process: process });
    w.on('stop', test.done);
    this.db.insert({});
    w.start();
  }
};

exports.events = {
  setUp: setUp,
  tearDown: tearDown,

  'complete': function(test) {
    function process(doc, db, next) {
      next(null);
    }
    var w = worker({ db: this.url, id: 'myworker', process: process });
    w.on('stop', test.done);
    w.on('worker:complete', function(doc) {
      test.ok(true, 'worker:complete event should have been fired');
      test.equal(typeof doc, 'object', 'doc should be an object');
      test.equal(doc._id, 'mydoc', 'doc _id should be `mydoc`');
      w.stop();
    });
    this.db.insert({}, 'mydoc');
    w.start();
  },
  'error': function(test) {
    var error = 'this is an error';
    function process(doc, db, next) {
      next(error);
    }
    var w = worker({ db: this.url, id: 'myworker', process: process });
    w.on('stop', test.done);
    w.on('worker:error', function(err) {
      test.ok(true, 'worker:error event should have been fired');
      test.equal(err, error, 'error should be returned');
      w.stop();
    });
    this.db.insert({});
    w.start();
  }
  // TODO: test skip event
};

exports.status = {
  setUp: setUp,
  tearDown: tearDown,

  'worker status': function(test) {
    function process(doc, db, next) {
      next(null);
    }
    var w = worker({ db: this.url, status: true, id: 'myworker', process: process });
    var feed = this.db.follow({ include_docs: true });
    feed.on('change', function(change) {
      if (change.id === 'worker-status/myworker') {
        test.ok(true, 'status has been stored');
        test.equal(change.doc.worker_id, 'myworker', 'status should have worker_id');
        test.equal(change.doc.seq, 1, 'status should have curren seq');
        test.equal(change.doc.last_doc_id, 'mydoc', 'status should have used last `mydoc`');
        test.equal(change.doc.checked, 1, 'status should have one checked doc');
        test.equal(change.doc.triggered, 1, 'status should have one triggered doc');
        test.equal(change.doc.completed, 1, 'status should have one completed doc');
        test.equal(change.doc.failed, 0, 'status should have no failed docs');
        feed.stop();
        w.stop();
        test.done();
      }
    });
    feed.follow();
    this.db.insert({}, 'mydoc');
    w.start();
  },
};
