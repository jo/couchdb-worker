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
  options.follow.include_docs = true;

  // worker id
  if (typeof options.id !== 'string') {
    throw('worker needs an id.');
  }
  var id = options.id;
  delete options.id;

  // process function
  if (typeof options.process !== 'function') {
    throw('worker needs a process function.');
  }
  var process = options.process;
  delete options.process;

  // check if document is processable, that is
  // * it has no worker status at all (no worker touched it ever)
  // * there is no `triggered` status (no other worker has already taken over)
  // * no own worker status for this document (I haven't touched it)
  function isProcessable(doc) {
    // no worker status at all
    if (!doc.worker_status) {
      return true;
    }
    // no worker took over
    for (var key in doc.worker_status) {
      if (doc.worker_status[key].status === 'triggered') {
        return false;
      }
    }
    // no own worker status
    return !doc.worker_status[id];
  }


  // initialize database connector
  var db = require('nano')(options.db);
  // initialize feed
  var feed = db.follow(options.follow);

  // context for processor function evaluation
  var ctx = {
    db: db,
    feed: feed
  };

  function onchange(change) {
    var doc = change.doc;

    function ondone(err, next) {
      if (err) {
        doc.worker_status[id].status = 'error';
        doc.worker_status[id].error = err;
      } else {
        doc.worker_status[id].status = 'complete';
      }
    
      db.insert(doc, doc._rev, function(err, body) {
        if (err) {
          feed.emit('worker:error', err, doc);
        } else {
          doc._rev = body.rev;
          feed.emit('worker:complete', doc);
        }

        feed.resume();

        if (typeof next === 'function') {
          next.apply(ctx, [err, doc]);
        }
      });
    }

    if (!isProcessable(doc)) {
      return;
    }

    feed.pause();

    doc.worker_status = doc.worker_status || {};
    doc.worker_status[id] = doc.worker_status[id] || {};
    doc.worker_status[id].status = 'triggered';
    delete doc.worker_status[id].error;

    db.insert(doc, doc._rev, function(err, body) {
      if (err) {
        if (err.error !== 'conflict') {
          feed.emit('worker:error', err, doc);
        }
        return;
      }

      doc._rev = body.rev;

      process.apply(ctx, [doc, ondone]);
    });
  }

  // TODO: handle paused from outside in the meantime...
  feed.on('change', onchange);

  // start listening
  feed.follow();

  // return feed object
  return feed;
};
