# CouchDB Worker

A worker module that manages state.


## Installation


    npm install couchdb-worker


## Create a new Worker

Basically you define an object with two functions: _check_ and _process_:

    var Worker = require("couchdb-worker");

    new Worker({
      name: 'foo',
      server: "http://127.0.0.1:5984",
      processor: {
        check: function(doc) {
          return true
        },
        process: function(doc, done) {
          // do something with the doc
          done(null, {
            foo: 'bar'
          });
        }
      }
    }, 'mydb');


The _check_ function is called to decide whether this doc should be processed generally.
For example you might only be interested in docs of a certain field.
This function is the same as a [filter function](http://guide.couchdb.org/draft/notifications.html#filters).

The processing takes place in the  _process_ function.
This function takes two arguments: the _doc_ and a callback function, _done_,
which takes an _error_ and the _ouput_ of the processing when the job has been done.
This output will be merged with the doc (if _error_ is `null`) and saved.
Note that the doc could have been changed after the job has been started
so that the doc variable could differ from the doc when it gets saved.

The processor above inserts the property _foo_ with the value _bar_ into every document.

Also take a look at examples/.


## Create a new Worker for all databases

Use a _Worker.pool_ if you want to spawn workers for each database:

    var Worker = require("couchdb-worker");

    new Worker.pool({
      name: 'foo',
      server: "http://127.0.0.1:5984",
      processor: {
        check: function(doc) {
          return true
        },
        process: function(doc, done) {
          // do something with the doc
          done(null, {
            foo: 'bar'
          });
        }
      }
    });


## Per Database Configuration

Configuration is done in a worker configuration document inside the target database.
The worker looks at all databases and only process if there exists such a configuration file.

A Worker Configuration File might look like this:

    {
      "_id": "worker-config/myworker",
      "_rev": "1-a653b27246b01cf9204fa9f5dee7cc64",
      "my_worker_setting": "100%"
    }

You can update the config live so that all future processings will take the new configuration.


## Worker Status Document

The worker stores a status document inside the target database.
The worker stores its last update seq here and can resume at the point it has started the last processing.

    {
      "_id": "worker-status/myworker",
      "_rev": "543-1922b5623d07453a753ab6ab2c634d04",
      "last_seq": 34176,
      "docs_processed": 145
    }


## Document Status Object

The worker updates a status object inside the document.
This makes it supereasy to monitor worker status as well as
it keeps a lock when many workers listen to the same database.

The status object of the worker could look like this:

    "worker_status": {
      "worker-name": {
        "status": "completed"
      }
    }

The status field can be _triggered_, _completed_ or _error_.

The worker status is scoped by the worker name in order to have many workers
processing the same document.


## Running the Worker

To start, this needs either the following environment variables set:

    export HOODIE_SERVER=http://example.org
    npm start


or pass them to the commandline:

    HOODIE_SERVER=http://example.org npm start


## Testing

Testing is done with Mocha. Run the tests with

    npm test



## License & Copyright

(c) null2 GmbH, 2012

License: The MIT License
