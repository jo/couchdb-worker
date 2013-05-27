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
  options.status.key = options.status.key || 'worker_status';
  options.status.db = options.status.db || options.db;
  options.status.id = options.status.id || 'worker-status/' + options.id;

  // mandatory options
  if (typeof options.id !== 'string') {
    throw('worker needs an id.');
  }
  if (typeof options.process !== 'function') {
    throw('worker needs a process function.');
  }

  // check if document is processable, that is
  // * it is not the status document
  // * it has no worker status at all (no worker touched it ever)
  // * there is no `triggered` status (no other worker has already taken over)
  // * no own worker status for this document (I haven't touched it)
  function isProcessable(doc) {
    // status document
    if (doc._id === options.status.id) {
      return false;
    }
    // no worker status at all
    if (!doc[options.status.key]) {
      return true;
    }
    // no worker took over
    for (var key in doc[options.status.key]) {
      if (doc[options.status.key][key].status === 'triggered') {
        return false;
      }
    }
    // no own worker status
    return !doc[options.status.key][options.id];
  }

  // initialize database connector
  var db = require('nano')(options.db);

  // initialize feed
  var feed = db.follow(options.follow);

  // initialize status database connector
  var statusDb = require('nano')(options.status.db);
  var statusDoc = {
    _id: options.status.id
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
    statusDoc.last = statusDiff.last;
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
        delete statusDiff.last;
        statusDiff.checked = 0;
        statusDiff.triggered = 0;
        statusDiff.completed = 0;
        statusDiff.failed = 0;
      }
    });
  }

  // context for processor function evaluation
  var ctx = {
    db: db,
    feed: feed
  };

  function onchange(change) {
    var doc = change.doc;

    statusDiff.checked++;

    function ondone(err, next) {
      if (err) {
        doc[options.status.key][options.id].status = 'error';
        doc[options.status.key][options.id].error = err;
      } else {
        doc[options.status.key][options.id].status = 'complete';
      }
    
      db.insert(doc, doc._id, function(err, body) {
        if (err) {
          feed.emit('worker:error', err, doc);
        } else {
          doc._rev = body.rev;
          feed.emit('worker:complete', doc);
        }

        statusDiff.completed++;

        feed.resume();

        if (typeof next === 'function') {
          next.apply(ctx, [err, doc]);
        }

        storeStatus();
      });
    }

    if (!isProcessable(doc)) {
      return;
    }

    feed.pause();

    doc[options.status.key] = doc[options.status.key] || {};
    doc[options.status.key][options.id] = doc[options.status.key][options.id] || {};
    doc[options.status.key][options.id].status = 'triggered';
    delete doc[options.status.key][options.id].error;

    db.insert(doc, doc._id, function(err, body) {
      if (err) {
        if (err.error !== 'conflict') {
          feed.emit('worker:error', err, doc);
        }
        return;
      }

      statusDiff.seq = change.seq;
      statusDiff.last = change.id;
      statusDiff.triggered++;

      doc._rev = body.rev;

      options.process.apply(ctx, [doc, ondone]);
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
