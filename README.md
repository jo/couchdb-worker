# couchdb-worker [![Build Status](https://secure.travis-ci.org/jo/couchdb-worker.png?branch=master)](http://travis-ci.org/jo/couchdb-worker)

Abstract CouchDB worker module

## Getting Started
Install the module with: `npm install couchdb-worker`

```javascript
var worker = require('couchdb-worker');
var myWorker = worker.listen({
  id: 'my-worker',
  db: 'http://localhost:5984/mydb',
  process: function(doc, done) {
    doc.computed_value = Math.random();
    done(null);
  }
});
myWorker.on('error', function(err) {
  console.error('Since Follow always retries on errors, this must be serious');
});
myWorker.on('worker:triggered', function(doc) {
  console.log('worker triggered: ', doc);
});
myWorker.on('worker:completed', function(doc) {
  console.log('worker completed: ', doc);
});
myWorker.on('worker:committed', function(doc) {
  console.log('worker committed: ', doc);
});
myWorker.on('worker:error', function(err, doc) {
  console.log('worker error: ', err, doc);
});
// myWorker.status();
myWorker.pause();
myWorker.resume();
myWorker.stop();
```

## Documentation
The object returned by `worker.listen()` is a `Feed` object, which is an EventEmitter.
See [follow](https://github.com/iriscouch/follow) for documentation. 

## Options
* `id` | Unique identifier for the worker.
* `process` | Processor function. Receives `doc` and `done` arguments.
* 'db' | [nano](https://github.com/dscape/nano) options
* 'follow' | [follow](https://github.com/iriscouch/follow) options

## Examples
```javascript
var worker = require('couchdb-worker');
worker.listen({
  id: 'my-worker',
  db: {
    url: 'http://localhost:5984/mydb',
    request_defaults: {
      auth: {
        user: 'me',
        pass: 'secret'
      }
    }
  },
  follow: {
    since: 42,
    heartbeat: 1000,
    filter: function(doc, req) {
      return !doc.dirty && !doc.stinky;
    },
    query_params: {
      worker: 'my-worker',
      app: '1234'
    }
  }
  process: function(doc, done) {
    doc.computed_value = Math.random();
    done(null);
  }
});
```

## Testing
To run the tests, run `grunt`.

The tests run agains a CouchDB server, and they create random databases of the form `couchdb-worker-test-<uuid>`.
The default url is `http://localhost:5984`,
which can be changed by setting the `COUCH_URL` environment variable,
eg via `COUCH_URL=http://me.iriscouch.com grunt`.

## Contributing
In lieu of a formal styleguide, take care to maintain the existing coding style.
Add unit tests for any new or changed functionality.
Lint and test your code using [Grunt](http://gruntjs.com/).

## Versioning
couchdb-worker follows [semver-ftw](http://semver-ftw.org/).
Dont think 1.0.0 means production ready yet.
There were some breaking changes, so had to move up the major version.

## Release History
* `1.0.0`: complete rewrite and new (functional) API using [nano](https://github.com/dscape/nano)
(and [follow](https://github.com/iriscouch/follow)) _currently no attachment support_
* `0.x`: object oriented version with attachment support

## License
Copyright (c) 2012-2013 Johannes J. Schmidt, null2 GmbH
Licensed under the MIT license.
