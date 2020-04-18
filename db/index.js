let Waterline = require('waterline');
let sailsDiskAdapter = require('sails-disk');
let waterline = new Waterline();

let Task = require('./models/task');
let Endpoint = require('./models/endpoint');

waterline.registerModel(Task);
waterline.registerModel(Endpoint);

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
