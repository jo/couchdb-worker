/*
 * CouchDB Worker
 * (c) Johannes J. Schmidt, 2012
 * MIT Licensed
 */
var request = require("request");

module.exports = Worker;

function Worker(config, db) {
  if (typeof config !== 'object') throw('I need a config!');

  if (!config.name) throw('I need a name!');
  this.name = config.name;

  if (!config.server) throw('I need a server!');
  this.server = config.server; 
  // strip username and password for log messages
  this.server_stripped = this.server.replace(/:\/\/.+:.+@/, '://');

  if (typeof config.processor !== 'object') throw('I need a processor!');
  if (typeof config.processor.check !== 'function') throw('I need a processor.check function!');
  if (typeof config.processor.process !== 'function') throw('I need a processor.process function!');
  this.processor = config.processor;

  if (config.config_id && typeof config.config_id !== 'string') throw('config_id must be a string!');
  this.config_id = config.config_id || 'worker-config/' + this.name;
  if (config.status_id && typeof config.status_id !== 'string') throw('status_id must be a string!');
  this.status_id = config.status_id || 'worker-status/' + this.name;

  if (config.batch_size && typeof config.batch_size !== 'number') throw('batch_size must be a number!');
  // TODO: allow 0
  this.batch_size = config.batch_size || 10;

  if (config.timeout && typeof config.timeout !== 'number') throw('timeout must be a number!');
  this.timeout = config.timeout || 1000;

  if (config.update_seq && typeof config.update_seq !== 'number') throw('update_seq must be a number!');
  this.update_seq = config.update_seq || 0;

  this.config = config;
  this.db = db;

  console.log(this.name + ' worker listening on ' + this.server_stripped + '/' + this.db);

  // TODO: get config
  // TODO: get status and update seq
  this._listen();
};

// request next batch of changes
// TODO: retry, like follow does
Worker.prototype._listen = function() {
  request({
    url: this.server
      + '/' + encodeURIComponent(this.db)
      + '/_changes?include_docs=true&feed=longpoll'
      + '&timeout=' + this.timeout
      + '&limit=' + this.batch_size
      + '&since=' + this.update_seq,
    json: true
  }, this._onchanges.bind(this));
};

// changes callback
Worker.prototype._onchanges = function(error, resp, changes) {
  if (this._checkResponse(error, resp, changes, 'get changes feed')) return;

  this._log(changes.results.length + ' changes arrived');

  this.changes = changes.results;
  this.update_seq = changes.last_seq;

  this._processChange();
};

// get change from change results
// remove from changes results
// process it
// if no more changes left, call process done
Worker.prototype._processChange = function() {
  var change = this.changes.pop();
  
  if (!change) {
    return this._processDone();
  }

  // this._log('processing change');

  // TODO:
  //   is config? update config
  //   is status? update status
  //   process othertise

  if (this.processor.check(change.doc)) {
    this.processor.process(change.doc, this._processChange.bind(this));
  } else {
    this._processChange();
  }
};

// called when batch done
// store update seq
// listen again
Worker.prototype._processDone = function() {
  this._log('block done');
  // TODO: update seq speichern
  this._listen();
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
    console.error(this.server_stripped + '/' + this.db + ' Could not ' + msg + ': ' + resp.statusCode, data);
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
