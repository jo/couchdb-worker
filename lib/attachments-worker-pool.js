/*
 * CouchDB Worker Attachments Worker Pool
 * 
 * Create an Attachments Worker for each database in _all_docs.
 *
 * Author: Johannes J. Schmidt
 * (c) null2 GmbH, 2012
 * MIT Licensed
 */

var AttachmentsWorker = require('./attachments-worker');
var WorkerPool = require('./worker-pool');

module.exports = function(config) {
  return new WorkerPool(config, AttachmentsWorker);
};
