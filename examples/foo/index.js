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

new Worker.pool({
  name: 'foo',
  server: process.env.HOODIE_SERVER || "http://127.0.0.1:5984",
  processor: {
    check: function(doc) {
      return true
    },
    process: function(doc, done) {
      // do something with the doc
      setTimeout(function() {
        done(null, {
          foo: 'bar'
        });
      }, 200);
    }
  }
});
