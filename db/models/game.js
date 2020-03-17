let Waterline = require('waterline');
let game = Waterline.Collection.extend({
    identity: 'game',
    datastore: 'default',
    primaryKey: 'id',
    attributes: {
        id: {
            type: 'number',
            autoMigrations: {
                autoIncrement: true
            }
        },
        userId: {
            type: 'string'
        },
        name: {
            type: 'string'
        },
        usePassword: {
            type: 'boolean',
            defaultsTo: false
        },
        password: {
            type: 'string',
        },
        users: {
            collection: 'player',
            via: 'game'
        },
        state: {
            type: 'string'
        },
        additionalStateData: {
            type: 'json'
        },
        round: {
            type: 'number',
            defaultsTo: 1
        }
    }
});

module.exports = game;
