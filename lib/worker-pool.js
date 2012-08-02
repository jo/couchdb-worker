/*
 * CouchDB Worker Pool
 * (c) Johannes J. Schmidt, 2012
 * MIT Licensed
 */

var Worker = require('./worker');
var request = require("request");

module.exports = WorkerPool;


// a worker pool listens to all databases
function WorkerPool(config) {
  if (typeof config !== 'object') throw('I need a config!');
  if (!config.name) throw('I need a name!');
  if (!config.server) throw('I need a server!');
  
  this.config = config;
  this.server = config.server;
  // strip username and password for log messages
  this.server_stripped = this.server.replace(/:\/\/.+:.+@/, '://');

  this.workers = [];
  request({
    url: this.server + '/_all_dbs',
    json: true
  }, this._on_all_dbs.bind(this));
};

// listen to all databases
// _all_docs request callback
WorkerPool.prototype._on_all_dbs = function(error, resp, data) {
  if (this._checkResponse(error, resp, data, 'get database list')) return;

  data.forEach(this._listen.bind(this));
};

// install a worker for one database
WorkerPool.prototype._listen = function(db) {
  this.workers.push(new Worker(this.config, db));
};

// check response and log errors
WorkerPool.prototype._checkResponse = function(error, resp, data, msg) {
  if (error !== null) {
    console.error(this.server_stripped + ' Error ' + msg + ': ', error);
    return;
  }
  if (resp.statusCode >= 400 || typeof data !== 'object') {
    console.error(this.server_stripped + ' Could not ' + msg + ': ' + resp.statusCode, data);
    return;
  }
};
