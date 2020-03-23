let express = require("express");
let Server = require("http").Server;
let session = require("express-session");
let FileStore = require('session-file-store')(session);
let bodyParser = require('body-parser')
let app = express();
let server = Server(app);
let io = require("socket.io")(server);

let {
    waterline,
    config
} = require('./db/index.js');

let { routes, onConnect, onDisconnect, onDisconnecting } = require('./controllers/index');

let sessionMiddleware = session({
    store: new FileStore({
        ttl: 60 * 60 * 24 * 7  * 1000
    }),
    secret: '1',
    cookie: {
        maxAge: 60 * 60 * 24 * 7 * 1000
    }
});

io.use(function(socket, next) {
    sessionMiddleware(socket.request, socket.request.res, next);
});
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

app.use(sessionMiddleware);
app.use((req, res, next) => {
	res.header("Access-Control-Allow-Origin", "http://localhost:8080");
	res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Credentials", true);
	return next();
});


io.on('connection', (socket) => {
    let sessionId = socket.request.sessionID;
    if (!sessionId) return;
    onConnect(socket);
    socket.on('disconnecting', () => {
        onDisconnecting(socket);
    })
    socket.on('disconnect', () => {
        onDisconnect(socket);
    })
})



waterline.initialize(config, (err, db)=> {
    if (err) {
        console.log(err);
    }
    app.db = db;

    routes(app, io);

    server.listen(8082);

});
