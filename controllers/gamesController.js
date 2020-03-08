module.exports = (app, io) => {

    let Game = app.db.collections.game;

    app.get('/games', async (req, res) => {
        let games = await Game.find({});
        res.json(games);
    })
	
	app.post('/games', async (req, res) => {
        let games = await Game.find({});
        res.json(games);
    })

}
