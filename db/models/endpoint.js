let Waterline = require('waterline');
let endpoint = Waterline.Collection.extend({
    identity: 'endpoint',
    datastore: 'default',
    primaryKey: 'id',
    attributes: {
        id: {
            type: 'number',
            autoMigrations: {
                autoIncrement: true
            }
        },

        task: {
            model: 'task',
        },
        url: {
            type: 'string',
        },
        state: {
            type: 'string'
        },
        processId: {
            type: 'number'
        }
    }
});

module.exports = endpoint;
