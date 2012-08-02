/*
 * CouchDB Worker
 * (c) Johannes J. Schmidt, 2012
 * MIT Licensed
 */
var request = require("request");

module.exports = Worker;

function Worker(config, db) {
  if (typeof config !== 'object') throw('I need a config!');

  // worker name
  if (!config.name) throw('I need a name!');
  this.name = config.name;

  // server
  if (!config.server) throw('I need a server!');
  this.server = config.server; 
  // strip username and password for log messages
  this.server_stripped = this.server.replace(/:\/\/.+:.+@/, '://');

  // processor
  if (typeof config.processor !== 'object') throw('I need a processor!');
  if (typeof config.processor.check !== 'function') throw('I need a processor.check function!');
  if (typeof config.processor.process !== 'function') throw('I need a processor.process function!');
  this.processor = config.processor;

  // config and status id
  if (config.config_id && typeof config.config_id !== 'string') throw('config_id must be a string!');
  this.config_id = config.config_id || 'worker-config/' + this.name;
  if (config.status_id && typeof config.status_id !== 'string') throw('status_id must be a string!');
  this.status_id = config.status_id || 'worker-status/' + this.name;

  // batch size
  if (config.batch_size && typeof config.batch_size !== 'number') throw('batch_size must be a number!');
  this.batch_size = typeof config.batch_size === 'number' ? config.batch_size : 10;

  // timeout
  if (config.timeout && typeof config.timeout !== 'number') throw('timeout must be a number!');
  this.timeout = typeof config.timeout === 'number' ? config.timeout : 60000;

  // since
  if (config.since && typeof config.since !== 'number') throw('since must be a number!');
  this.since = config.since || 0;

  this.db = db;

  console.log(this.name + ' worker listening on ' + this.server_stripped + '/' + this.db);

  // initially get config
  request({
    url: this.server
      + '/' + encodeURIComponent(this.db)
      + '/' + encodeURIComponent(this.config_id),
    json: true
  }, function(error, resp, doc) {
    if (error !== null) {
      console.error(this.server_stripped + '/' + this.db + ' Error fetching config: ', error);
      return;
    }

    if (resp.statusCode < 400 && typeof doc === 'object') {
      this.config = doc;
    }

    // initially get status
    request({
      url: this.server
        + '/' + encodeURIComponent(this.db)
        + '/' + encodeURIComponent(this.status_id),
      json: true
    }, function(error, resp, doc) {
      if (error !== null) {
        console.error(this.server_stripped + '/' + this.db + ' Error fetching status: ', error);
        return;
      }

      if (resp.statusCode < 400 && typeof doc === 'object') {
        this.status = doc;
      }

      this._listen();
    }.bind(this));
  }.bind(this));
};


// request next batch of changes
Worker.prototype._listen = function() {
  request({
    url: this.server
      + '/' + encodeURIComponent(this.db)
      + '/_changes?include_docs=true&feed=longpoll'
      + '&timeout=' + this.timeout
      + '&limit=' + this.batch_size
      + '&since=' + Math.max((this.status && this.status.last_seq) || 0, this.since || 0, this.last_seq || 0),
    json: true
  }, this._onchanges.bind(this));
};


// changes callback
Worker.prototype._onchanges = function(error, resp, changes) {
  // TODO: retry, like follow does
  if (this._checkResponse(error, resp, changes, 'get changes feed')) return;

  this.docs_processed = 0;
  this.changes = changes.results;

  // remember update seq
  this.last_seq = changes.last_seq;

  // start processing changes
  this._nextChange();
};

// get change from change results
// remove from changes results
// process it
// if no more changes left, call process done
Worker.prototype._nextChange = function() {
  var change = this.changes.pop();
  
  if (!change) {
    return this._changesDone();
  }

  // check change
  if (change.id === this.config_id) {
    // update config
    this.config = change.doc;
    this._nextChange();
  } else if (change.id === this.status_id) {
    // update status
    this.status = change.doc;
    this._nextChange();
  } else if (this._check(change.doc)) {
    // process doc
    this._process(change.doc);
  } else {
    // ignore doc
    this._nextChange();
  }
};

// check a doc if it needs processing
// that is if we have a config doc
// and the processor function returns true for that doc
Worker.prototype._check = function(doc) {
  if (!this.config) return false;

  return this.processor.check(doc);
};

// process a doc
Worker.prototype._process = function(doc) {
  this._log('processing doc...');

  // TODO
  //   set status
  //   and save doc

  this.processor.process(doc, this._processDone.bind(this));
};

// finish processing of one doc
Worker.prototype._processDone = function(attributes) {
  this.docs_processed++;

  // TODO
  //   merge attributes into doc
  //   set status
  //   save doc
  //   and try again
  
  this._log('doc processed.');
  this._nextChange();
};

// called when batch done
// store update seq
// listen again
Worker.prototype._changesDone = function() {
  // only store status if we did something
  if (!this.docs_processed) return this._listen();

  // update status information
  this.status || (this.status = { _id: this.status_id });
  this.status.last_seq = this.last_seq;
  this.status.docs_processed || (this.status.docs_processed = 0);
  this.status.docs_processed += this.docs_processed;

  // store status
  request({
    url: this.server
      + '/' + encodeURIComponent(this.db)
      + '/' + encodeURIComponent(this.status_id),
    method: 'PUT',
    body: JSON.stringify(this.status),
    json: true
  }, function(error, resp, data) {
    if (this._checkResponse(error, resp, data, 'store status')) return;

    // update status rev
    this.status._rev = data.rev;

    // start listening for next changes
    this._listen();
  }.bind(this));

};


// check response and log errors
Worker.prototype._checkResponse = function(error, resp, data, msg) {
  msg || (msg = 'in response');

  if (error !== null) {
    console.error(this.server_stripped + '/' + this.db + ' Error ' + msg + ': ', error);
    return {
      msg: msg,
      error: error
    };
  }
  if (resp.statusCode >= 400 || typeof data !== 'object') {
    console.error(this.server_stripped + '/' + this.db + ' Response Error ' + msg + ': ' + resp.statusCode, data);
    return {
      msg: msg,
      status: resp.statusCode,
      error: data
    };
  }

  return null;
};

// log messages with server and db
Worker.prototype._log = function(msg) {
  console.log(this.server_stripped + '/' + this.db + ' ' + msg);
};
