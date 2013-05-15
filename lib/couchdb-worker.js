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

  var db = require('nano')(options.db);

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

  function onchange(change) {
    var doc = change.doc;

    function ondone(err, next) {
      if (err) {
        doc.worker_status[id].status = 'error';
        doc.worker_status[id].error = err;
        feed.emit('worker:error', err, doc);
      } else {
        doc.worker_status[id].status = 'complete';
        feed.emit('worker:complete', doc);
      }
    
      db.insert(doc, doc._rev, function(err, body) {
        if (err) {
          feed.emit('worker:error', err, doc);
        } else {
          doc._rev = body.rev;
          feed.emit('worker:committed', doc);
        }

        feed.resume();

        if (typeof next === 'function') {
          next(err, doc);
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
        feed.emit('worker:error', err, doc);
        return;
      }

      doc._rev = body.rev;

      feed.emit('worker:triggered', doc);

      process.apply({}, [doc, ondone]);
    });
  }

  // initialize feed
  var feed = db.follow(options.follow);

  // TODO: handle paused from outside in the meantime...
  feed.on('change', onchange);

  // start listening
  feed.follow();

  // return feed object
  return feed;
};
