let express = require("express");
let Server = require("http").Server;
let session = require("express-session");
let FileStore = require('session-file-store')(session);

let app = express();
let server = Server(app);
let io = require("socket.io")(server);

let {
    waterline,
    config
} = require('./db/index.js');

let gamesController = require('./controllers/gamesController');

let sessionMiddleware = session({
    store: new FileStore({}),
    secret: '1'
});

io.use(function(socket, next) {
    sessionMiddleware(socket.request, socket.request.res, next);
});

app.use(sessionMiddleware);

waterline.initialize(config, (err, db)=> {
    if (err) {
        console.log(err);
    }
    app.db = db;

    gamesController(app, io);

    server.listen(8080);

});
