let express = require("express");
let Server = require("http").Server;
let session = require("express-session");
let FileStore = require('session-file-store')(session);
let bodyParser = require('body-parser');
let app = express();
let server = Server(app);
let routes = require('./controllers/index');
let io = require("socket.io")(server);

let {
    waterline,
    config
} = require('./db/index.js');


let sessionMiddleware = session({
    store: new FileStore({
        ttl: 60 * 60 * 24 * 7  * 1000
    }),
    secret: '1',
    cookie: {
        maxAge: 60 * 60 * 24 * 7 * 1000
    }
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


waterline.initialize(config, (err, db)=> {
    if (err) {
        console.log(err);
    }

    setTimeout(() => {
        routes(app, db, io);
        server.listen(8082);
    }, 500)

});
