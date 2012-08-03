# CouchDB Worker

A worker module that manages state.


## Installation


    npm install couchdb-worker


## Create a new Worker for a Single Database

    new Worker(config, db)


Basically you define an object with two functions: _check_ and _process_:

    var Worker = require("couchdb-worker");

    new Worker({
      name: 'myworker',
      server: "http://127.0.0.1:5984",
      processor: {
        check: function(doc) {
          return true;
        },
        process: function(doc, done_func) {
          // Do work and call done_func callback with an error object
          // and the attributes to be merged into the doc.
          // You have access to the config document, see below.
          done_func(null, {
            foo: this.config.big_animal ? 'Bär' : 'bar'
          });
        }
      }
    }, 'mydb');


This example processor inserts the property _foo_ with the value `bar` or `Bär`,
depending on the config document, into every document.



## Create a new Worker for All Databases

    new Worker.pool(config)


Use a _Worker.pool_ if you want to spawn workers for each database:

    var Worker = require("couchdb-worker");

    new Worker.pool(config);


## Worker Options

### `name`

Each worker needs a uniq name. It will be used for status objects and
config - and status document ids.

### `server`

The CouchDB server url.

### `processor.check`

The `check` function is called to decide whether this doc should be processed generally.
For example you might only be interested in docs of a certain field.

This function is similar to a [filter function](http://guide.couchdb.org/draft/notifications.html#filters).

CouchDB Worker will support Server Side Filters at some point in the future.

### `processor.process`

The processing takes place in the  `process` function.

This function takes two arguments: the _doc_ and a callback function, `done_func`,
which takes an _error_ and the _ouput_ of the processing when the job has been done.

This output will be merged (using jQuery like deep `extend`) with the doc (if _error_ is `null`) and saved.

### `config_id`

The id of the configuration document.

### `status_id`

The id of the status document.

### `batch_size`

Number of changes to keep in RAM. Higher value means less HTTP requests but higher memory consumption.

### `timeout`

Number of miliseconds for timeout the changes feed.

### `since`

`update_seq` to initially start listening.

### Conflict Resolution

Note that the doc could have changed after the job has been started
so that the doc can not be saved. In that case CouchDB Worker will reset its worker state.
The document will again show up in the changes feed an processed again.

Future versions of CouchDB Worker will provide a _resolve conflict_ callback,
where you can resolve that conflict in order to keep your heavy computed output.


Also take a look at [examples](couchdb-worker/tree/master/examples).


## Per Database Configuration

Configuration is done in a worker configuration document inside the target database.

The worker looks only processes if there exists such a configuration file.

A Worker configuration document might look like this:

    {
      "_id": "worker-config/myworker",
      "_rev": "1-a653b27246b01cf9204fa9f5dee7cc64",
      "big_animal": true
    }

You can update the config live so that all future processings will take the new configuration.


## Worker Status Document

The worker stores a status document inside the target database.
The worker stores its last update seq here and can resume where it left off.

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
      "myworker": {
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
