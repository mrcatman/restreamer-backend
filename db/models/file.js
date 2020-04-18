let Waterline = require('waterline');
let file = Waterline.Collection.extend({
    identity: 'file',
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
    }
});

module.exports = file;
