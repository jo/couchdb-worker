'use strict';

module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    nodeunit: {
      files: ['test/**/*_test.js'],
    },
    jshint: {
      options: {
        jshintrc: '.jshintrc'
      },
      gruntfile: {
        src: 'Gruntfile.js'
      },
      lib: {
        src: ['lib/**/*.js']
      },
      test: {
        src: ['test/**/*.js']
      },
    },
    watch: {
      gruntfile: {
        files: '<%= jshint.gruntfile.src %>',
        tasks: ['jshint:gruntfile']
      },
      lib: {
        files: '<%= jshint.lib.src %>',
        tasks: ['jshint:lib', 'nodeunit']
      },
      test: {
        files: '<%= jshint.test.src %>',
        tasks: ['jshint:test', 'nodeunit']
      },
    },
  });

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-contrib-nodeunit');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-watch');

  grunt.registerTask('clean', 'Clean up lost test databases.', function() {
    var nano = require('nano')(process.env.COUCH_URL || 'http://localhost:5984');
    var done = this.async();

    function destroy(db, next) {
      nano.db.destroy(db, function(err, resp) {
        if (err) {
          grunt.log.err('Failed to delete ' + db + ': ' + err.error);
        } else {
          grunt.log.ok('Deleted ' + db);
        }
        next(err, resp);
      });
    }

    nano.db.list(function(err, body) {
      var dbs = body.filter(function(db) { return db.match(/^couchdb-worker-test-/); });

      grunt.util.async.map(dbs, destroy, done);
    });
  });

  // Default task.
  grunt.registerTask('default', ['jshint', 'nodeunit']);
};
