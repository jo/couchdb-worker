/*
 * couchdb-worker
 * https://github.com/jo/couchdb-worker
 *
 * Copyright (c) 2012-2013 Johannes J. Schmidt, null2 GmbH
 * Licensed under the MIT license.
 */

'use strict';

exports.listen = function(options) {
  options = options || {};
  options.follow = options.follow || {};
  options.status = options.status || {};

  // defaults
  options.follow.include_docs = true;
  options.status.db = options.status.db || options.db;
  options.status.id = options.status.id || 'worker-status/' + options.id;
  options.status.prefix = options.status.prefix || 'worker-lock/' + options.id + '/';

  // mandatory options
  if (typeof options.id !== 'string') {
    throw('worker needs an id.');
  }
  if (typeof options.process !== 'function') {
    throw('worker needs a process function.');
  }
  // database connector
  var db = require('nano')(options.db);
  // status database connector
  var statusDb = require('nano')(options.status.db);
  // changes feed
  var feed = db.follow(options.follow);

  // capture a document
  function capture(doc, done) {
    statusDb.insert({}, options.status.prefix + doc._id, done);
  }

  // release a document
  function release(lock, done) {
    statusDb.destroy(lock.id, lock.rev, function(err) {
      if (!err) {
        return done();
      }
      // force delete in case of conflict
      if (err.error === 'conflict') {
        statusDb.get(lock._id, function(err, doc) {
          if (err) {
            return feed.emit('worker:release-error', err, lock);
          }

          lock.rev = doc._rev;
          release(lock, done);
        });
      }
    });
  }

  function discard(doc) {
    // discard status
    if (doc._id === options.status.id) {
      return true;
    }

    // discard lock
    var match = doc._id.match(options.status.prefix);
    if (match && match.index === 0) {
      return true;
    }
  }

  var statusDoc = {
    _id: options.status.id,
    worker_id: options.id
  };
  var statusDiff = {
    checked: 0,
    triggered: 0,
    completed: 0,
    failed: 0
  };
  function storeStatus() {
    if (feed.dead) {
      return;
    }
    
    statusDoc.checked = statusDoc.checked || 0;
    statusDoc.triggered = statusDoc.triggered || 0;
    statusDoc.completed = statusDoc.completed || 0;
    statusDoc.failed = statusDoc.failed || 0;

    // set seq to the greatest seq
    if (statusDiff.seq && (!statusDoc.seq || parseInt(statusDiff.seq, 10) > parseInt(statusDoc.seq, 10))) {
      statusDoc.seq = statusDiff.seq;
    }
    statusDoc.last_doc_id = statusDiff.last_doc_id;
    statusDoc.checked = statusDoc.checked + statusDiff.checked;
    statusDoc.triggered = statusDoc.triggered + statusDiff.triggered;
    statusDoc.completed = statusDoc.completed + statusDiff.completed;
    statusDoc.failed = statusDoc.failed + statusDiff.failed;

    statusDb.insert(statusDoc, function(err, body) {
      if (err) {
        // fetch current status
        statusDb.get(statusDoc._id, function(err, body) {
          if (!err) {
            statusDoc = body;
            // try updating the status again
            storeStatus();
          }
        });
      } else {
        statusDoc._rev = body.rev;

        delete statusDiff.seq;
        delete statusDiff.last_doc_id;
        statusDiff.checked = 0;
        statusDiff.triggered = 0;
        statusDiff.completed = 0;
        statusDiff.failed = 0;
      }
    });
  }

  function onchange(change) {
    var doc = change.doc;

    if (discard(doc)) {
      return;
    }

    statusDiff.checked++;

    feed.pause();

    capture(doc, function(err, lock) {
      if (err) {
        feed.emit('worker:skip', doc);
        return;
      }

      statusDiff.seq = change.seq;
      statusDiff.last_doc_id = change.id;
      statusDiff.triggered++;

      options.process(doc, function(err) {
        if (err) {
          statusDiff.failed++;
          feed.emit('worker:error', err, doc);
        }

        release(lock, function() {
          if (!err) {
            feed.emit('worker:complete', err, doc);
            statusDiff.completed++;
          }

          feed.resume();

          storeStatus();
        });
      });
    });
  }

  // TODO: handle paused from outside in the meantime...
  feed.on('change', onchange);

  statusDb.get(statusDoc._id, function(err, doc) {
    if (!err && doc) {
      statusDoc = doc;
    }
    if (statusDoc.seq) {
      feed.since = statusDoc.seq;
    }
    // start listening
    feed.follow();
  });

  // return feed object
  return feed;
};
