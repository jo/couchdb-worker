/*
 * CouchDB Worker Foo Example
 * 
 * example mimimal worker that inserts foo: 'bar' into every document.
 *
 * Author: Johannes J. Schmidt
 * (c) null2 GmbH, 2012
 * MIT Licensed
 */

var Worker = require("couchdb-worker");

var config = {
  name: 'foo',
  server: process.env.COUCH_SERVER || "http://127.0.0.1:5984",
  processor: {
    process: function(doc, done) {
      console.log('jooo');
      // do something with the doc
      done(null, {
        foo: 'bar'
      });
    }
  }
};

if (process.env.COUCH_DB) {
  new Worker(config, process.env.COUCH_DB);
} else {
  new Worker.pool(config);
}
