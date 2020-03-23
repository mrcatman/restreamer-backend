const empty = require('../helpers/empty');
const filterFields = require('../helpers/filterFields');
const shuffle = require('../helpers/shuffle');
const mostPopularInArray = require('../helpers/mostPopularInArray');

let socketSessions = {}
const gameFields = ['password', 'userId', 'users', 'round', 'users'];

const Utils = {
    getUserRole(game, req) {
        return Utils.getUserRoleById(game, req.sessionID);
    },
    getUserRoleById(game, id) {
        if (game.userId === id) {
            return "HOST";
        }
        let user = game.users.filter(user => user.sessionId === id)[0];
        if (user) {
            return user.role && user.role !== '' ? user.role : "UNKNOWN";
        }
        return null;
    },
    getUserState(game, req) {
        if (game.userId === req.sessionID) {
            return "";
        }
        let user = game.users.filter(user => user.sessionId === req.sessionID)[0];
        if (user) {
            return user.state;
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
    async sendUsersList(game) { // список игроков
		
        let sockets = (await Utils.getConnectedSockets(game));
        let socketUserIds = sockets.map(socket => socket.sessionId);
        let users = game.users.map(user => {
            return {
                id: user.sessionId,
                name: user.name,
                state: user.state
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
    sendRolesToAll(game, roles) {
        io.to('game_' + game.id).emit('roles', roles);
    },
    sendAllRoles(socket, game) {
        let data = {};
        game.users.forEach(user => {
            data[user.sessionId.toString()] = user.role;
        })
        if (socket === null) {
            io.to('game_' + game.id).emit('roles', data)
        } else {
            socket.emit('roles', data)
        }
    },
    async setGameState(oldGameState, {state, round, additionalStateData}) { // обновление состояния игры
	    let game = await Game.findOne({id: oldGameState.id});
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
		if (game.additionalStateData && game.additionalStateData.poll && additionalStateData.poll === null) {
			data.additionalStateData.poll = null;
			io.to('game_' + game.id).emit('close_poll');
		}
        let updatedGame = await Game.updateOne({id: game.id}).set(data)
        Utils.sendGameState(updatedGame);
    },
    sendGameState(game) {
        let state = {
            stateName: game.state,
            message: Utils.getGameMessage(game),
			day: game.round
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
            case 'STATE_RESULTS':
                message = 'Игроки узнают о том, что произошло ночью';
                break;
            case 'STATE_VOTING_RESULTS':
                message = 'Суд окончен';
                break;
            case 'STATE_GAME_OVER':
                message = 'Игра окончена. Мафия победила!';
                break;
            case 'STATE_GAME_WIN':
                message = 'Игра окончена. Победа на стороне мирных жителей!';
                break;
            case 'STATE_DOCTOR':
                message = 'Доктор выбирает, кого он вылечит';
                break;
            case 'STATE_SHERIFF':
                message = 'Шериф выбирает, кого он проверит';
                break;
        }
        return message;
    },
    getMafiaCount(playersCount) { // сколько мафии в игре
        let mafiaCount = 1;
        if (playersCount >= 5) {
            mafiaCount = 2;
        }
        if (playersCount > 10) {
            mafiaCount = 3;
        }
        return mafiaCount;
    },
    getAdditionalRoles(playersCount) { // получение доп.ролей для игры
        let roles = [];
        if (playersCount >= 4) {
            roles.push("DOCTOR");
        }
        if (playersCount >= 4) {
            roles.push("SHERIFF");
        }
        return roles;
    },
    getRoles(playersCount) {
        let roles = [];
        let mafiaCount = Utils.getMafiaCount(playersCount);
        for (let i = 0; i < mafiaCount; i++) {
           roles.push(i === 0 && mafiaCount > 1 ? "MAFIA_BOSS" : "MAFIA");
        }
        let additionalRoles = Utils.getAdditionalRoles(playersCount);
        additionalRoles.forEach(role => {
            roles.push(role);
        })
        for (let i = roles.length - 1; i < playersCount - 1; i++) {
            roles.push("CIVILIAN");
        }
		console.log(roles);
        return roles;
    },
    getMafiaRoles(game) {
        let mafia = game.users.filter(user => user.role === "MAFIA");
        let mafiaRoles = {};
        mafia.forEach(player => {
            mafiaRoles[player.sessionId] = "MAFIA";
        })
        let mafiaBoss = game.users.filter(user => user.role === "MAFIA_BOSS");
        mafiaBoss.forEach(player => {
            mafiaRoles[player.sessionId] = "MAFIA_BOSS";
        })
        return mafiaRoles;
    },
    async introduceMafia(game) { // знакомим мафию друг с другом
        let mafia = game.users.filter(user => (user.role === "MAFIA" || user.role === "MAFIA_BOSS"));
        let mafiaRoles = Utils.getMafiaRoles(game);
        for (let index in mafia) {
            let mafiaPlayer = mafia[index];
            if (socketSessions[mafiaPlayer.sessionId]) {
                Utils.sendRoles(socketSessions[mafiaPlayer.sessionId], mafiaRoles);
            }
        }
        await Utils.setGameState(game, {additionalStateData: {mafiaIntroduced: true}});
    },
	async generatePollObject(game, title, usersToVote, usersToSelect) { // генерация опроса
		console.log('generate poll', title, usersToVote, usersToSelect);
        usersToVote = usersToVote.filter(user => user.state !== "STATE_KILLED");
        usersToSelect = usersToSelect.filter(user => user.state !== "STATE_KILLED");
        let poll = {
            title,
            availableFor: usersToVote.map(user => user.sessionId),
            variants: usersToSelect.map(user => user.sessionId),
            results: {},
        };
        console.log('users', usersToVote);
		usersToVote.forEach(user => {
            if (socketSessions[user.sessionId]) {
                socketSessions[user.sessionId].emit('poll', poll)
            }
        })
        if (socketSessions[game.userId]) {
            socketSessions[game.userId].emit('poll', poll)
        }
		return poll;
	},
    async generatePoll(game, title, usersToVote, usersToSelect) {
		let poll = await Utils.generatePollObject(game, title, usersToVote, usersToSelect);
        await Utils.setGameState(game, {additionalStateData: {poll}});
    },
    async setPollResults(game, results) {
        let poll = game.additionalStateData.poll;
        poll.results = results;
        await Utils.setGameState(game, {additionalStateData: {poll}});
        poll.availableFor.forEach(userId => {
            if (socketSessions[userId]) {
                socketSessions[userId].emit('poll_results', poll.results)
            }
        })
        if (socketSessions[game.userId]) {
            socketSessions[game.userId].emit('poll_results', poll.results)
        }
    },
    getNightResults(game) { // узнаем убитых и вылеченных
        let killed =  game.additionalStateData.killed || [];
        let healed =  game.additionalStateData.healed || [];
        return {killed: killed.filter(player => healed.indexOf(player) === -1)};
    },
    isGameOver(game) {
        let users = game.users.filter(user => user.state !== "STATE_KILLED");
        let mafiaCount = users.filter(user => (user.role === "MAFIA" || user.role === "MAFIA_BOSS")).length;
        let civilCount = users.length - mafiaCount;
        console.log(mafiaCount, civilCount);
        if (mafiaCount >= civilCount) { // если мафии больше чем мирных (или столько же) - конец игры
            return true;
        }
        return false;
    },
    isGameWon(game) {
        let mafiaCount = game.users.filter(user => (user.role === "MAFIA" || user.role === "MAFIA_BOSS")).filter(user => user.state !== "STATE_KILLED").length;
        return mafiaCount === 0; // если вся мафия убита - конец игры
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
            game.isMember = true;
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
            let player = await Player.create({sessionId: req.sessionID, name, state: '', game: game.id}).fetch();
            res.json(player);
            let gameWithUsers = await Game.findOne({id: req.params.id}).populate('users');
            Utils.sendUsersList(gameWithUsers);
        })

        const nextGameStep = async(req, res) => {
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
                if (!game.users || game.users.length < 3) {
                    res.status(400).json({
                        error: 'В игре должно быть хотя бы 3 игрока'
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
                await Utils.setGameState(game, {state: "STATE_GREETING", round: 1});
                res.json({success: true});
                return;
            }
            if (game.state === "STATE_GREETING") {
                await Utils.setGameState(game, {state: "STATE_NIGHT"});
                res.json({success: true});
                return;
            }
            if (game.state === "STATE_NIGHT") {
                if (game.round === 1) {
                    await Utils.introduceMafia(game);
					let mafia =  game.users.filter(user => (user.role === "MAFIA" || user.role === "MAFIA_BOSS"));
					//if (mafia.length > 1) {
						await Utils.setGameState(game, {state: "STATE_MAFIA_GREETING"});
					//} else {
					//	await Utils.setGameState(game, {state: "STATE_MORNING"});
					//}
                } else {
				    let poll = await Utils.generatePollObject(game, "Выберите жертву", game.users.filter(user => (user.role === "MAFIA" || user.role === "MAFIA_BOSS")), game.users.filter(user => (user.role !== "MAFIA" && user.role !== "MAFIA_BOSS")));   
                    await Utils.setGameState(game, {state: "STATE_MAFIA_SELECTING", additionalStateData: {poll}});
                }
                res.json({success: true});
                return;
            }
            if (game.state === "STATE_MAFIA_GREETING") {
                await Utils.setGameState(game, {state: "STATE_MORNING", round: game.round + 1});
                res.json({success: true});
                return;
            }
            if (game.state === "STATE_MAFIA_SELECTING") {
                let poll = game.additionalStateData.poll;
                let killed = null;

                let mafiaBoss = game.users.filter(user => (user.role === "MAFIA_BOSS"))[0]; // если у нас есть босс, то его выбор главнее остальных
                if (mafiaBoss && poll.results[mafiaBoss.sessionId]) {
                    killed = poll.results[mafiaBoss.sessionId];
                }
                if (!killed) {
                    killed = mostPopularInArray(Object.values(poll.results));
                }
                if (!killed) {
                    res.status(400).json({error: "Не выбрана жертва"});
                    return;
                }
				console.log('set killed');
                await Utils.setGameState(game, {additionalStateData: {killed: [killed], poll: null}});
                let nextRole = Utils.getAdditionalRoles(game.users.length)[0];
                if (nextRole) {
                    await handleAdditionalRoleStart(nextRole, game);
                } else {
                    Utils.setGameState(game, {state: "STATE_MORNING", additionalStateData: {currentAdditionalRole: null}});
                }
                res.json({success: true});
                return;
            }
            if (game.state === "STATE_MORNING") {
                if (game.round <= 2) {
                    await Utils.setGameState(game, {state: "STATE_NIGHT"});
                } else {
                    await Utils.setGameState(game, {state: "STATE_RESULTS", additionalStateData: {poll: null}});
                    io.to('game_'+game.id).emit('night_results', Utils.getNightResults(game));

                    let killed =  game.additionalStateData.killed || [];
                    let healed =  game.additionalStateData.healed || [];
                    for (let index in game.additionalStateData.killed) {
						let killedPlayer = game.additionalStateData.killed[index];
						 if (healed.indexOf(killedPlayer) === -1) { // если игрока не вылечили
							let gamePlayer = game.users.filter(player => player.id === killedPlayer)[0];
							if (gamePlayer) {
								gamePlayer.state = "STATE_KILLED";
							}
                            let player = await Player.updateOne({sessionId: killedPlayer, game: game.id}).set({
                                state: "STATE_KILLED"
                            });
                            io.sockets.in('game_'+game.id).emit('user_state', {id: killedPlayer, state: "STATE_KILLED"});
                          
                        }
                    }
                }
                res.json({success: true});
                return;
            }
            if (game.state === "STATE_RESULTS") {
                if ( Utils.isGameOver(game)) {
                    await Utils.setGameState(game, {state: "STATE_GAME_OVER"});
                    Utils.sendAllRoles(null, game);
                    res.json({success: true});
                } else {
					let poll = await Utils.generatePollObject(game, "Выберите того, кого отправите за решетку", game.users, game.users);
                    await Utils.setGameState(game, {state: "STATE_VOTING", additionalStateData: {poll}});
                }
            }
            if (game.state === "STATE_VOTING") {
                let poll = game.additionalStateData.poll;
                let accused = mostPopularInArray(Object.values(poll.results), true);
                if (!accused) {
                    res.status(400).json({error: "Не выбран подсудимый или нет самого популярного результата"});
                    return;
                }
                await Utils.setGameState(game, {state: "STATE_VOTING_RESULTS", additionalStateData: {poll: null, killed: null, accused}});
                let accusedRole = Utils.getUserRoleById(game, accused);
                io.to('game_'+game.id).emit('voting_results', {user: accused, role: accusedRole});
                Utils.sendRolesToAll(game, {[accused]:  accusedRole});
				
				let gamePlayer = game.users.filter(player => player.id === accused)[0];
				if (gamePlayer) {
					gamePlayer.state = "STATE_KILLED";
				}
                let player = await Player.updateOne({sessionId: accused, game: game.id}).set({
                    state: "STATE_KILLED"
                });
                console.log(player);
                res.json({success: true});
                return;
            }
            if (game.state === "STATE_VOTING_RESULTS") {
                if (Utils.isGameOver(game)) {
                    await Utils.setGameState(game, {state: "STATE_GAME_OVER"});
                    Utils.sendAllRoles(null, game);
                    res.json({success: true});
                } else {
                    if (Utils.isGameWon(game)) {
                        await Utils.setGameState(game, {state: "STATE_GAME_WIN"});
                        Utils.sendAllRoles(null, game);
                        res.json({success: true});
                    } else {
                        await Utils.setGameState(game, {round: game.round + 1, state: "STATE_NIGHT"});
                    }
                }
            }
            if (game.additionalStateData.currentAdditionalRole) {
                await handleAdditionalRoleEnd(game, req, res);
            }
        }

        const handleAdditionalRoleStart = async (role, game) => {
			console.log('additional role', role);
            if (!role) {
                await Utils.setGameState(game, {state: "STATE_MORNING", round: game.round + 1, additionalStateData: {currentAdditionalRole: null}});
                return;
            }
            let additionalRoles = Utils.getAdditionalRoles(game.users.length);
            let roleIndex = additionalRoles.indexOf(role);
            switch (role) {
                case 'DOCTOR':
                    let doctor = game.users.filter(player => player.role === "DOCTOR" && player.state !== "STATE_KILLED")[0];
					if (doctor) { // если доктор не убит, то вызываем его, иначе переходим к следующей роли
						let poll = await Utils.generatePollObject(game, "Выберите того, кого хотите вылечить", [doctor], game.users);
						console.log("generated poll", poll);
                        await Utils.setGameState(game, {state: "STATE_DOCTOR", additionalStateData: {currentAdditionalRole: "DOCTOR", poll}});
					} else {
                        await handleAdditionalRoleStart(additionalRoles[roleIndex + 1], game);
                    }
                    break;
                case 'SHERIFF':  
                    let sheriff = game.users.filter(player => player.role === "SHERIFF" && player.state !== "STATE_KILLED")[0];
                    if (sheriff) { // аналогично с шерифом
						let poll = await Utils.generatePollObject(game, "Выберите того, кого хотите проверить", [sheriff], game.users);
                        await Utils.setGameState(game, {state: "STATE_SHERIFF", additionalStateData: {currentAdditionalRole: "SHERIFF", poll}});
					 } else {
                        await handleAdditionalRoleStart(additionalRoles[roleIndex + 1], game);
                    }
                    break;
                default:
                    await Utils.setGameState(game, {state: "STATE_MORNING", round: game.round + 1,  additionalStateData: {currentAdditionalRole: null}});
                    break;
            }
        }

        const handleAdditionalRoleEnd = async (game, req, res) => {
            let role = game.additionalStateData.currentAdditionalRole;
            let poll = game.additionalStateData.poll;
            let additionalRoles = Utils.getAdditionalRoles(game.users.length);
            let roleIndex = additionalRoles.indexOf(role);
            switch (role) {
                case 'DOCTOR':
                    let doctorSelection = poll ? poll.results[Object.keys(poll.results)[0]] : null; // получаем выбор доктора, если он никого не выбрал то выдаем ошибку
                    if (doctorSelection) {
                        await Utils.setGameState(game, {additionalStateData: {healed: [doctorSelection], poll: null}});
						
                        await handleAdditionalRoleStart(additionalRoles[roleIndex + 1], game);
                    } else {
                        res.status(403).json({text: "Не выбран пациент"});
                        return;
                    }
                    break;
                case 'SHERIFF':
                    if (!game.additionalStateData.sheriffResults) {
                        let sheriffSelection = poll ? poll.results[Object.keys(poll.results)[0]] : null;
                        if (sheriffSelection) { // аналогично с шерифом
                            let sheriff = game.users.filter(player => player.role === "SHERIFF" && player.state !== "STATE_KILLED");
                            let selectionRole = Utils.getUserRoleById(game, sheriffSelection);
                            let sheriffResults = {role: selectionRole, id: sheriffSelection};
                            await Utils.setGameState(game, {
                                state: "STATE_SHERIFF",
                                additionalStateData: {sheriffResults, poll: null}
                            });
                            let sheriffSession = socketSessions[sheriff.sessionId];
                            if (sheriffSession) {
                                sheriffSession.emit('sheriff_results', sheriffResults);
                            }
						    if (socketSessions[game.userId]) {
								socketSessions[game.userId].emit('sheriff_results', sheriffResults);
							}
                        } else {
                            await handleAdditionalRoleStart(additionalRoles[roleIndex + 1], game);
                        }
                    } else {
                        await Utils.setGameState(game, {
                            state: "STATE_SHERIFF",
                            additionalStateData: {sheriffResults: null}
                        });
                        await handleAdditionalRoleStart(additionalRoles[roleIndex + 1], game);
                    }
                    break;
                default:
                    await Utils.setGameState(game, {state: "STATE_MORNING", round: game.round + 1, additionalStateData: {currentAdditionalRole: null}});
                    break;
            }
        }

        app.post('/games/:id/next', async (req, res) => {
            nextGameStep(req, res);
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
            let myState = null;
            if (!myRole) {
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
                            if ((myRole === "MAFIA" || myRole === "MAFIA_BOSS") && game.additionalStateData.mafiaIntroduced) {
                                let mafiaRoles = Utils.getMafiaRoles(game);
                                Utils.sendRoles(socket, mafiaRoles);
                            }
                        }
                        if (game.additionalStateData.poll) {
                            const canVote = game.additionalStateData.poll.availableFor.indexOf(req.sessionID) !== -1 || myRole === "HOST";
                            console.log('can vote', canVote);
							if (canVote) {
                                socket.emit('poll', game.additionalStateData.poll)
                            }
                        }
                        let killed = game.users.filter(user => user.state === "STATE_KILLED");
                        let killedRoles = {};
                        killed.forEach(player => {
                            killedRoles[player.sessionId] = player.role;
                        })
                        Utils.sendRoles(socket, killedRoles);
                        myState = Utils.getUserState(game, req);
                        if (game.state === "STATE_RESULTS" || game.state === "STATE_VOTING") {
                            socket.emit('night_results', Utils.getNightResults(game));
                        }
                        if (game.state === "STATE_VOTING_RESULTS") {
                            let accused = game.additionalStateData.accused;
                            let accusedRole = Utils.getUserRoleById(game, accused);
                            socket.emit('voting_results', {user: accused, role: accusedRole});
                            Utils.sendRoles(socket, {[accused]:  accusedRole});
                        }
                        if ((myRole === "HOST" || myRole === "SHERIFF") && game.additionalStateData.sheriffResults) {
                            socket.emit('sheriff_results', game.additionalStateData.sheriffResults);
                        }
                    }
                }
            }
            game.yourId = req.sessionID;
            game.canEdit = game.userId === req.sessionID;
            game.yourState = myState;
            game.stateData = {stateName: game.state, message: Utils.getGameMessage(game), day: game.round};
            res.json(filterFields(game, gameFields));
        });

        app.post('/games/:id/poll', async (req, res) => {
            let game = await Game.findOne({id: req.params.id}).populate('users');
            if (!game) {
                res.status(404).json({error: "Игра не найдена"});
                return;
            }
            let myRole = Utils.getUserRole(game, req);
            if (!myRole) {
                res.status(403).json({error: "Ошибка доступа"});
                return;
            }
            let poll = game.additionalStateData.poll;
            if (!poll) {
                res.status(400).json({error: "Сейчас нет активных голосований"});
                return;
            }
            let userId = req.body.id;
            if (poll.variants.indexOf(userId) === -1) {
                res.status(400).json({error: "Вы не можете проголосовать за этого игрока"});
            }
            if (myRole === "HOST") {
                poll.results = {
                    [req.sessionID]: userId
                };
                await Utils.setPollResults(game, poll.results);
                nextGameStep(req, res);
            } else {
                const canVote = poll.availableFor.indexOf(req.sessionID) !== -1;
                if (canVote) {
                    poll.results[req.sessionID] = userId;
                    await Utils.setPollResults(game, poll.results);
                    res.json({success: true});
                    return;
                } else {
                    res.status(403).json({error: "Ошибка доступа"});
                    return;
                }
            }
        })
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
