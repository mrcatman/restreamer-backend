const empty = require('../helpers/empty');
const filterFields = require('../helpers/filterFields');
const shuffle = require('../helpers/shuffle');

let socketSessions = {}
const gameFields = ['password', 'userId', 'users', 'round', 'users'];

const Utils = {
    getUserRole(game, req) {
        if (game.userId === req.sessionID) {
            return "HOST";
        }
        let user = game.users.filter(user => user.sessionId === req.sessionID)[0];
        if (user) {
            return user.role && user.role !== '' ? user.role : "UNKNOWN";
        }
        return null;
    },
    isAdmin(game, req) {
        if (game.userId === req.sessionID) {
            return true;
        }
        return false;
    },
    getRoomUsers(roomId) {
        let room = io.sockets.adapter.rooms[roomId];
        if (!room) {
            return [];
        }
        let socketIds = Object.keys(room.sockets);
        let sockets = [];
        socketIds.forEach(socketId => {
            sockets.push(io.sockets.connected[socketId]);
        })
        return sockets;
    },
    async getConnectedSockets(game) {
        return await Utils.getRoomUsers('game_' + game.id);
    },
    async sendUsersList(game) {
        let sockets = (await Utils.getConnectedSockets(game));
        let socketUserIds = sockets.map(socket => socket.sessionId);
        let users = game.users.map(user => {
            return {
                id: user.sessionId,
                name: user.name
            }
        });
        users.forEach(user => {
            user.isConnected = socketUserIds.indexOf(user.id) !== -1
        })

        let data = {
            list: users,
            host: {
                isConnected: socketUserIds.indexOf(game.userId) !== -1,
                id: game.userId,
            }
        }
        io.to('game_' + game.id).emit('users', data);
    },
    sendRoles(socket, roles) {
        socket.emit('roles', roles)
    },
    sendAllRoles(socket, game) {
        let data = {};
        game.users.forEach(user => {
            data[user.sessionId.toString()] = user.role;
        })
        socket.emit('roles', data)
    },
    async setGameState(game, {state, round, additionalStateData}) {
        let data = {};
        if (state) {
            data.state = state
        }
        if (round) {
            data.round = round;
        }
        if (additionalStateData) {
            if (game.additionalStateData) {
                data.additionalStateData = {...game.additionalStateData, ...additionalStateData};
            } else {
                data.additionalStateData = additionalStateData;
            }
        }
        let updatedGame = await Game.updateOne({id: game.id}).set(data)
        Utils.sendGameState(updatedGame);
    },
    sendGameState(game) {
        let state = {
            message: Utils.getGameMessage(game)
        };
        io.to('game_' + game.id).emit('state', state);
    },
    getGameMessage(game) {
        let message;
        switch (game.state) {
            case 'STATE_NOT_STARTED':
                message = 'Игра еще не начата';
                break;
            case 'STATE_GREETING':
                message = 'Игроки представляются друг другу';
                break;
            case 'STATE_NIGHT':
                message = 'Наступила ночь. Игроки спят';
                break;
            case 'STATE_MAFIA_GREETING':
                message = 'Мафия знакомится друг с другом';
                break;
            case 'STATE_MAFIA_SELECTING':
                message = 'Мафия выбирает свою жертву';
                break;
            case 'STATE_MORNING':
                message = 'Наступило утро';
                break;
            case 'STATE_VOTING':
                message = 'Игроки выбирают, кого они отправят за решетку';
                break;
        }
        return message;
    },
    getRoles(playersCount) {
        let roles = [];
        let mafiaCount = 1;
        if (playersCount > 5) {
            mafiaCount = 2;
        }
        if (playersCount > 10) {
            mafiaCount = 3;
        }
        for (let i = 0; i < playersCount; i++) {
            if (i < mafiaCount) {
                roles.push("MAFIA");
            } else {
                roles.push("CIVILIAN");
            }
        }
        return roles;
    },
    getMafiaRoles(game) {
        let mafia = game.users.filter(user => user.role === "MAFIA");
        let mafiaRoles = {};
        mafia.forEach(player => {
            mafiaRoles[player.sessionId] = "MAFIA";
        })
        return mafiaRoles;
    },
    async introduceMafia(game) {
        let mafia = game.users.filter(user => user.role === "MAFIA");
        let mafiaRoles = Utils.getMafiaRoles(game);
        for (let index in mafia) {
            let mafiaPlayer = mafia[index];
            if (socketSessions[mafiaPlayer.sessionId]) {
                Utils.sendRoles(socketSessions[mafiaPlayer.sessionId], mafiaRoles);
            }
        }
        await Utils.setGameState(game, {additionalStateData: {mafiaIntroduced: true}});
    }
}

let io, Game, Player;

module.exports = {
    routes: (app, socketIo) => {
        io = socketIo;
        Game = app.db.collections.game;
        Player = app.db.collections.player;

        app.get('/games', async (req, res) => {
            let games = await Game.find({}).populate('users');
            for (let id in games) {
                let game = games[id];
                game.totalUsersCount = game.users.length;
                game.connectedUsersCount = (await Utils.getConnectedSockets(game)).length;
                game.isMember = !!Utils.getUserRole(game, req)
            }
            games = filterFields(games, gameFields);
            res.json(games);
        });

        app.post('/games', async (req, res) => {
            let {name, usePassword, password} = req.body;
            if (empty(name)) {
                res.status(400).json({
                    errors: {
                        name: 'Введите название игры'
                    }
                })
                return;
            }
            if (usePassword && empty(password)) {
                res.status(400).json({
                    errors: {
                        password: 'Введите пароль'
                    }
                })
            }
            if (!usePassword) {
                password = '';
            }
            let game = await Game.create({
                name,
                usePassword,
                password,
                userId: req.sessionID,
                round: 0,
                state: "STATE_NOT_STARTED"
            }).fetch();
            game.totalUsersCount = 0;
            game.connectedUsersCount = 0;
            res.json(filterFields(game, gameFields));
        })


        app.post('/games/:id/join', async (req, res) => {
            let {name, password} = req.body;
            let game = await Game.findOne({id: req.params.id});
            if (!game) {
                res.status(404).json({
                    errors: {
                        name: 'Игра не найдена'
                    }
                })
                return;
            }
            if (empty(name)) {
                res.status(400).json({
                    errors: {
                        name: 'Введите ваше имя'
                    }
                })
                return;
            }
            if (game.usePassword && password !== game.password) {
                res.status(400).json({
                    errors: {
                        password: 'Неверный пароль'
                    }
                })
                return;
            }
            if (game.state !== "STATE_NOT_STARTED") {
                res.status(400).json({
                    errors: {
                        name: 'Игра уже началась'
                    }
                })
                return;
            }
            let player = await Player.create({sessionId: req.sessionID, name, state: 1, game: game.id}).fetch();
            res.json(player);
            game = await game.populate('users');
            Utils.sendUsersList(game);
        })

        app.post('/games/:id/next', async (req, res) => {
            let game = await Game.findOne({id: req.params.id}).populate('users');
            if (!game) {
                res.status(404).json({
                    error: 'Игра не найдена'
                })
                return;
            }
            if (!Utils.isAdmin(game, req)) {
                res.status(400).json({
                    error: 'Ошибка доступа'
                })
                return;
            }
            if (!game.additionalStateData) {
                game.additionalStateData = {};
            }
            if (game.state === "STATE_NOT_STARTED") {
                 if (!game.users || game.users.length < 2) {
                    res.status(400).json({
                        error: 'В игре должно быть хотя бы 2 игрока'
                    })
                    return;
                }
                let roles = Utils.getRoles(game.users.length);
                roles = shuffle(roles);
                for (let index in game.users) {
                    let player = game.users[index];
                    player.role = roles[index];
                    await Player.updateOne({id: player.id}).set({
                        role: player.role
                    })
                }
                let socket = socketSessions[game.userId];
                if (socket) {
                    Utils.sendAllRoles(socket, game);
                }
                game.users.forEach(user => {
                    if (socketSessions[user.sessionId]) {
                        Utils.sendRoles(socketSessions[user.sessionId], {[user.sessionId]: user.role});
                    }
                })
                Utils.setGameState(game, {state: "STATE_GREETING", round: 1});
                res.json({success: true});
                return;
            }
            if (game.state === "STATE_GREETING") {
                Utils.setGameState(game, {state: "STATE_NIGHT"});
                res.json({success: true});
                return;
            }
            if (game.state === "STATE_NIGHT") {
                if (game.round === 1) {
                    await Utils.introduceMafia(game);
                    Utils.setGameState(game, {state: "STATE_MAFIA_GREETING"});
                } else {
                    Utils.setGameState(game, {state: "STATE_MAFIA_SELECTING"});
                }
                res.json({success: true});
                return;
            }
            if (game.state === "STATE_MAFIA_GREETING") {
                Utils.setGameState(game, {state: "STATE_MORNING"});
                res.json({success: true});
                return;
            }
            if (game.state === "STATE_MAFIA_SELECTING") {
                console.log('mafia selecting');
                return;
            }
            if (game.state === "STATE_MORNING") {
                if (game.round === 1) {
                    Utils.setGameState(game, {round: game.round + 1, state: "STATE_NIGHT"});
                } else {
                    Utils.setGameState(game, {state: "STATE_VOTING"});
                }

                res.json({success: true});
                return;
            }
        })

        app.get('/games/:id', async (req, res) => {
            let game = await Game.findOne({id: req.params.id}).populate('users');
            if (!game) {
                res.status(404).json({text: "Игра не найдена"});
                return;
            }
            if (!game.additionalStateData) {
                game.additionalStateData = {};
            }
            let myRole = Utils.getUserRole(game, req);

            if (game.state !== "STATE_NOT_STARTED" && !myRole) {
                res.status(403).json({text: "В данный момент вам недоступна эта игра"});
                return;
            }
            if (myRole) {
                let connectedSocket = (await Utils.getConnectedSockets(game)).filter(socket => socket.sessionId === req.sessionID)[0];
                if (!connectedSocket) {
                    let socket = socketSessions[req.sessionID];
                    if (socket) {
                        socket.join("game_" + game.id);
                        Utils.sendUsersList(game);
                        if (myRole === "HOST") {
                            Utils.sendAllRoles(socket, game);
                        } else {
                            Utils.sendRoles(socket, {[req.sessionID]: myRole});
                            if (myRole === "MAFIA" && game.additionalStateData.mafiaIntroduced) {
                                let mafiaRoles = Utils.getMafiaRoles(game);
                                Utils.sendRoles(socket, mafiaRoles);
                            }
                        }
                    }
                }
            }
            game.yourId = req.sessionID;
            game.canEdit = game.userId === req.sessionID;
            game.stateData = {message: Utils.getGameMessage(game)};
            res.json(filterFields(game, gameFields));
        });
    },
    onConnect: (socket) => {
        socketSessions[socket.request.sessionID] = socket;
        socket.sessionId = socket.request.sessionID;
    },
    onDisconnecting: (socket) => {
        let rooms = Object.keys(socket.rooms);
        rooms.forEach(room => {
            if (room.startsWith("game_")) {
                io.to(room).emit('disconnect', {id: socket.sessionId});
            }
        })
    },
    onDisconnect: (socket) => {
        socketSessions[ socket.sessionId] = undefined;
    }
}
