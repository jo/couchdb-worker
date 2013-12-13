# couchdb-worker

Abstract CouchDB worker module

## Getting Started
Install the module with: `npm install couchdb-worker`

```js
var config = {
  id: 'my-worker',
  db: 'http://localhost:5984/mydb',
  process: function(doc, db, done) {
    doc.computed_value = Math.random();
    db.insert(doc, done);
  }
};

require('couchdb-worker')(config)
  .start();
```

## Documentation
The object returned by `worker.listen()` is a `Feed` object, which is an EventEmitter.
See [follow](https://github.com/iriscouch/follow) for documentation. 

## Options
* `id` | Unique identifier for the worker.
* `process` | Processor function. Receives `doc` and `done` arguments.
* `db` | [nano](https://github.com/dscape/nano) options
* `follow` | [follow](https://github.com/iriscouch/follow) options
* `status` | status options (optional)
* `status.db` | [nano](https://github.com/dscape/nano) options for status database connection. Default is to use the `db` connection.
* `status.id` | id for status document. Default is `worker-status/<id>`.
* `status.prefix` | prefix for lock document ids. Default is `worker-lock/<id>/`.

## `process(doc, done)`
This is where you do your work. It receives a `doc`, which is the current document,
as well as a `done` callback function, which must be invoked when the work is done.

The `done` callback accepts itself an `error` argument,
where you can inform couchdb-worker about any errors.

## Lock
To prevent two same workers from processing the same document twice,
couchdb-worker keeps a lock on the document.

This is achieved by putting an empty doc inside the `status.db` while processing.
It will be deleted when done.

The id of that lock document is calculated by appending the documents id to `status.prefix`.

## Status
couchdb-worker maintains a status document, where some stats are stored:

```json
{
  "_id": "worker-status/my-worker",
  "worker_id": "my-worker",
  "seq": 123,
  "last_doc_id": "mydoc",
  "checked": 42,
  "triggered": 42,
  "completed": 40,
  "failed": 2
}
```

## Examples
```js
var worker = require('couchdb-worker')({
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
    filter: 'myddoc/myfilter',
    query_params: {
      worker: 'my-worker',
      app: '1234'
    }
  }
  process: function(doc, db, done) {
    doc.computed_value = Math.random();
    db.insert(doc, done);
  }
});

// listen to some events
worker.on('error', function(err) {
  console.error('Since Follow always retries on errors, this must be serious');
});
worker.on('worker:complete', function(doc) {
  console.log('worker completed: ', doc);
});
worker.on('worker:error', function(err, doc) {
  console.log('worker error: ', err, doc);
});

// start work
worker.start();

// you can pause the worker
worker.pause();
// and resume...
worker.resume();
// and finally stop it.
worker.stop();
```

## Testing
To run the tests, run `npm test`.

The tests run agains a CouchDB server, and they create random databases of the form `couchdb-worker-test-<uuid>`.
The default url is `http://localhost:5984`,
which can be changed by setting the `COUCH_URL` environment variable, eg:

```bash
COUCH_URL=http://me:secure@me.iriscouch.com npm test
```

## Contributing
In lieu of a formal styleguide, take care to maintain the existing coding style.
Add unit tests for any new or changed functionality.
Lint your code using `npm run jshint`.

## Versioning
couchdb-worker follows [semver-ftw](http://semver-ftw.org/).
Dont think 1.0.0 means production ready yet.
There were some breaking changes, so had to move up the major version.

## Release History
* `3.1.1`: fix issue with db objects
* `3.1.0`: process function receives db object
* `3.0.0`: return function (`worker.listen(config)` -> `worker(config).listen()`)
* `2.0.0`: do not store worker status in documents, store lock in extra documents
* `1.0.0`: complete rewrite and new (functional) API using [nano](https://github.com/dscape/nano)
(and [follow](https://github.com/iriscouch/follow)) - _currently no attachment support_
* `0.x`: object oriented version with attachment support - _The `0.x` line continues on the v0 branch_

## License
Copyright (c) 2012-2013 Johannes J. Schmidt, null2 GmbH

Licensed under the MIT license.
