let Waterline = require('waterline');
let sailsDiskAdapter = require('sails-disk');
let waterline = new Waterline();

let game = require('./models/game');
let player = require('./models/player');

waterline.registerModel(player);
waterline.registerModel(game);

let config = {
    adapters: {
        'disk': sailsDiskAdapter
    },
    datastores: {
        default: {
            adapter: 'disk'
        }
    }
};

module.exports = {
    waterline,
    config
}
