/*
 * CouchDB Worker Foo Example
 *
 * example mimimal worker that inserts foo: 'bar' into every document.
 *
 * (c) Johannes J. Schmidt, 2012
 * MIT Licensed
 */

var Worker = require("couchdb-worker");

new Worker({
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
