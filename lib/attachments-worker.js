/*
 * CouchDB Worker
 *
 * A worker module that manages state.
 *
 * Author: Johannes J. Schmidt
 * (c) null2 GmbH, 2012
 * MIT Licensed
 */

var Worker = require('./worker');
var request = require("request");
var _ = require("underscore");

module.exports = AttachmentsWorker;

function AttachmentsWorker(config, db) {
  if (typeof config !== 'object') throw('I need a config!');

  // processor
  if (typeof config.processor !== 'object') throw('I need a processor!');
  if (typeof config.processor.process !== 'function') throw('I need a processor.process function!');
  if (config.processor.check && typeof config.processor.check !== 'function') throw('processor.check must be a function if given!');

  var check = config.processor.check;
  var process = config.processor.process;

  // check one attachment
  function checkAttachment(doc, name) {
    var status = doc.worker_status && doc.worker_status[this.name] && doc.worker_status[this.name][name];

    // ignore if we already processed that attachment
    // and attachment has not changed since that
    if (status && (status.status !== 'completed' || doc._attachments[name].revpos === status.revpos)) return false;

    // default is true for all docs
    if (typeof check !== 'function') return true;
    
    // and either no check function defined,
    return check(doc, name);
  }

  config.processor = {
    check: function(doc) {
      // there are any attachments
      return doc._attachments &&
        _.size(doc._attachments) &&
        // or any of the check function called with the attachment returns true
        _.any(_.keys(doc._attachments), function(attachment) { return checkAttachment(doc, attachment) });
    },
    process: function(doc, commit) {
      // get next attachment to be processed
      var attachment = _.find(_.keys(doc._attachments), function(attachment) { return checkAttachment(doc, attachment) });

      // TODO: manage state
      process.call(this, doc, attachment, commit);
    }
  };

  return new Worker(config, db);
};
