let Waterline = require('waterline');
let task = Waterline.Collection.extend({
    identity: 'task',
    datastore: 'default',
    primaryKey: 'id',
    attributes: {
        id: {
            type: 'number',
            autoMigrations: {
                autoIncrement: true
            }
        },
        name: {
            type: 'string'
        },
		state: {
			type: 'string',
		},
		processId: {
			type: 'number'
		},
        url: {
            type: 'string',
        },
        endpoints: {
            collection: 'endpoint',
            via: 'task'
        },
        startTime: {
            type: 'number'
        },
		endTime: {
            type: 'number'
        },
		needRecord: {
            type: 'boolean'
        },
        recordState: {
            type: 'string'
        },
        recordProcessId: {
            type: 'number'
        },
        files: {
            collection: 'file',
            via: 'task'
        },
        disableAutolaunch: {
            type: 'boolean'
        },
        useYTDL: {
            type: 'boolean'
        }
    }
});

module.exports = task;
