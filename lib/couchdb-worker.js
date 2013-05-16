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

  // initialize status database connector
  var statusDb = require('nano')(options.status.db);
  // initialize feed
  var feed = db.follow(options.follow);
  feed.status = {
    _id: options.status.id
  };

  function storeStatus() {
    if (feed.dead) {
      return;
    }
    statusDb.insert(feed.status, function(err, body) {
      if (!err) {
        feed.status._rev = body.rev;
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

    feed.status.checked = feed.status.checked || 0;
    feed.status.checked++;

    function ondone(err, next) {
      if (err) {
        doc[options.status.key][options.id].status = 'error';
        doc[options.status.key][options.id].error = err;
      } else {
        doc[options.status.key][options.id].status = 'complete';
      }
    
      db.insert(doc, function(err, body) {
        if (err) {
          feed.emit('worker:error', err, doc);
        } else {
          doc._rev = body.rev;
          feed.emit('worker:complete', doc);
        }

        feed.status.completed = feed.status.completed || 0;
        feed.status.completed++;

        feed.resume();

        if (typeof next === 'function') {
          next.apply(ctx, [err, doc]);
        }

        // store status
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

    db.insert(doc, function(err, body) {
      if (err) {
        if (err.error !== 'conflict') {
          feed.emit('worker:error', err, doc);
        }
        return;
      }

      feed.status.seq = change.seq;
      feed.status.last = doc._id;
      feed.status.triggered = feed.status.triggered || 0;
      feed.status.triggered++;

      doc._rev = body.rev;

      options.process.apply(ctx, [doc, ondone]);
    });
  }

  // TODO: handle paused from outside in the meantime...
  feed.on('change', onchange);

  statusDb.get(feed.status._id, function(err, doc) {
    if (!err && doc) {
      feed.status = doc;
    }
    if (feed.status.seq) {
      feed.since = feed.status.seq;
    }
    // start listening
    feed.follow();
  });

  // return feed object
  return feed;
};
