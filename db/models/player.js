let Waterline = require('waterline');
let player = Waterline.Collection.extend({
    identity: 'player',
    datastore: 'default',
    primaryKey: 'id',
    attributes: {
        id: {
            type: 'number',
            autoMigrations: {
                autoIncrement: true
            }
        },
        sessionId: {
            type: 'string'
        },
        name: {
            type: 'string'
        },
        game: {
            model: 'game',
        },
        role: {
            type: 'string',
        },
        state: {
            type: 'string'
        }
    }
});

module.exports = player;
