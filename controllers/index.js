const empty = require('../helpers/empty');
const toDate = require('../helpers/toDate');
const process = require("child_process");
const fs = require('fs');

let Task, Endpoint;

let processes = {};

module.exports = (app, db, io) => {

    Task = db.collections.task;
    Endpoint = db.collections.endpoint;

    const startEndpoint = async (task, endpoint) => {
         const cmdProgram = "ffmpeg";
        const cmdArgStr = [
            "-timeout 5",
            "-hide_banner",
            "-loglevel info",
            "-re",
            `-i ${task.url}`,
            `-y ${endpoint.url}`
        ].join(" ").trim();
        console.log(`Run command: ${cmdProgram} ${cmdArgStr}`);

        let recProcess = process.spawn(cmdProgram, cmdArgStr.split(/\s+/));
        recProcess.on("error", async (err) => {
            console.error("Recording process error:", err);
            await Endpoint.updateOne({ id: endpoint.id }).set({
                state: 'STATE_ERROR'
            });
            io.emit('ffmpeg_error', {
                endpointId: endpoint.id,
                taskId: task.id,
                output
            });
            fs.writeFileSync(`logs/${endpoint.id}.log`, output.join('\n'));
            processes[recProcess.pid] = null;
        });

        recProcess.on("exit", async (code, signal) => {
            console.log("Recording process exit, code: %d, signal: %s", code, signal);

            if (code === 1) {
                await Endpoint.updateOne({ id: endpoint.id }).set({
                    state: 'STATE_ERROR'
                });
            } else {
                await Endpoint.updateOne({ id: endpoint.id }).set({
                    state: 'STATE_ENDED'
                });
            }
            io.emit('ffmpeg_error', {
                endpointId: endpoint.id,
                taskId: task.id,
                output
            });
            fs.writeFileSync(`logs/${endpoint.id}.log`, output.join('\n'));
            processes[recProcess.pid] = null;
        });

        let output = [];
        recProcess.stderr.on("data", chunk => {
            chunk.toString().split(/\r?\n/g).filter(Boolean).forEach(line => {
                console.log(line);
                output.push(line);
            });
        })
        await Endpoint.updateOne({ id: endpoint.id }).set({
            processId: recProcess.pid
        });
        processes[recProcess.pid] = recProcess;
    }

    const startRecord = async (task) => {
        const cmdProgram = "ffmpeg";
        const cmdArgStr = [
            "-timeout 5",
            "-hide_banner",
            "-loglevel info",
            "-re",
            `-i ${task.url}`,
            `-y records/${task.id}.mp4`
        ].join(" ").trim();
        console.log(`Run command: ${cmdProgram} ${cmdArgStr}`);
        let recProcess = process.spawn(cmdProgram, cmdArgStr.split(/\s+/));
        recProcess.on("error", async (err) => {
            console.error("Recording process error:", err);
            await Task.updateOne({ id: task.id }).set({
                recordState: 'STATE_ERROR'
            });
            io.emit('ffmpeg_error', {
                endpointId: 'record',
                taskId: task.id,
                output
            });
            fs.writeFileSync(`logs/${endpoint.id}.log`, output.join('\n'));
            processes[recProcess.pid] = null;
        });

        recProcess.on("exit", async (code, signal) => {
            console.log("Recording process exit, code: %d, signal: %s", code, signal);
            if (code === 1) {
                await Task.updateOne({ id: task.id }).set({
                    recordState: 'STATE_ERROR'
                });
            } else {
                await Task.updateOne({ id: task.id }).set({
                    recordState: 'STATE_ENDED'
                });
            }
            io.emit('ffmpeg_error', {
                endpointId: 'record',
                taskId: task.id,
                output
            });
            fs.writeFileSync(`logs/record_${task.id}.log`, output.join('\n'));
            processes[recProcess.pid] = null;
        });

        let output = [];
        recProcess.stderr.on("data", chunk => {
            chunk.toString().split(/\r?\n/g).filter(Boolean).forEach(line => {
                console.log(line);
                output.push(line);
            });
        })
        await Task.updateOne({ id: task.id }).set({
            recordProcessId: recProcess.pid
        });
        processes[recProcess.pid] = recProcess;
    }

    const startAll = async (task) => {
        if (task.needRecord) {
            if (!task.recordState || task.recordState == "" || task.recordState === "STATE_NOT_STARTED") {
                await startRecord(task);
            }
        }
        for (let endpointIndex in task.endpoints) {
            let endpoint = task.endpoints[endpointIndex];
            if (endpoint.state === "STATE_NOT_STARTED") {
                await startEndpoint(task, endpoint);
            }
        }
    }

    const stopAll = async (task) => {
        if (task.needRecord) {
            if (processes[task.recordProcessId]) {
                processes[task.recordProcessId].kill();
            }
        }
        for (let endpointIndex in task.endpoints) {
            let endpoint = task.endpoints[endpointIndex];
            if (processes[endpoint.processId]) {
                processes[endpoint.processId].kill();
            }
        }
    }

    const start = async () => {
        let tasks = await Task.find({}).populate('endpoints');
        let now = new Date().getTime();
        for (let index in tasks) {
            let task = tasks[index];
            if (task.startTime > now || true) {
                startAll(task);
            }
        }
    }

    app.post('/tasks/:id/start-all', async (req, res) => {
        let task = await Task.find({id: req.params.id}).populate('endpoints');
        if (!task) {
            res.status(400).json({error: 'Задача не существует'});
            return;
        }
        await startAll(task, true);
        res.json({});
    })

    app.post('/tasks/:id/stop-all', async (req, res) => {
        let task = await Task.find({id: req.params.id}).populate('endpoints');
        if (!task) {
            res.status(400).json({error: 'Задача не существует'});
            return;
        }
        await stopAll(task);
        res.json({});
    })

    app.post('/tasks/:id/start/:endpoint', async (req, res) => {
        let task = await Task.findOne({id: req.params.id}).populate('endpoints');
        if (!task) {
            res.status(400).json({error: 'Задача не существует'});
            return;
        }
        let endpointId = req.params.endpoint;
        if (endpointId === 'record') {
            await startRecord(task);
        } else {
            let endpoint = task.endpoints.filter(endpoint => endpoint.id == endpointId)[0];
            if (!endpoint) {
                res.status(400).json({error: 'Объект адреса не существует'});
                return;
            }
            await startEndpoint(task, endpoint);
        }
        res.json({});
    })

    app.post('/tasks/:id/stop/:endpoint', async (req, res) => {
        let task = await Task.findOne({id: req.params.id}).populate('endpoints');
        if (!task) {
            res.status(400).json({error: 'Задача не существует'});
            return;
        }
        let endpointId = req.params.endpoint;
        if (endpointId === 'record') {
            let process = processes[task.recordProcessId];
            if (process) {
                process.kill();
            } else {
                res.status(400).json({error: 'Процесс не существует'});
            }
        } else {
            let endpoint = task.endpoints.filter(endpoint => endpoint.id == endpointId)[0];
            if (!endpoint) {
                res.status(400).json({error: 'Объект адреса не существует'});
                return;
            }
            let process = processes[endpoint.recordProcessId];
            if (process) {
                process.kill();
            } else {
                res.status(400).json({error: 'Процесс не существует'});
            }
        }
        res.json({});
    })

    app.get('/tasks', async (req, res) => {
        let tasks = await Task.find({}).populate('endpoints');
        res.json(tasks);
    });

    app.post('/tasks', async (req, res) => {
        let {id, name, url, startTime, endTime, endpoints, needRecord} = req.body;
        if (empty(url)) {
            res.status(400).json({errors: {
                url: 'Введите URL потока'
            }})
            return;
        }
        if (!url.startsWith('rtmp') && !url.startsWith('http')) {
            res.status(400).json({errors: {
                url: 'Некорректный URL потока'
            }})
            return;
        }
        if (empty(startTime)) {
            res.status(400).json({errors: {
               startTime: 'Введите время начала'
            }})
            return;
        }
        let now = new Date().getTime();
        startTime = toDate(startTime).getTime();


        if (startTime < now) {
            res.status(400).json({errors: {
                startTime: 'Дата начала должна быть больше текущей'
            }})
            return;
        }
        if (endTime && endTime !== '') {
            endTime = toDate(endTime).getTime();
            if (endTime < now) {
                res.status(400).json({errors: {
                    endTime: 'Дата окончания должна быть больше текущей'
                }})
                return;
            }
            if (endTime < startTime) {
                res.status(400).json({errors: {
                    endTime: 'Дата окончания должна быть больше даты начала'
                }})
                return;
            }
        }
        if (!endpoints || endpoints.length === 0) {
            res.status(400).json({errors: {
                url: 'Введите хотя бы 1 адрес для ретрансляции'
            }})
            return;
        }
        for (let i in endpoints) {
            if (!endpoints[i].url || (!endpoints[i].url.startsWith('rtmp') && !endpoints[i].url.startsWith('http'))) {
                let errors = {};
                errors['endpoints_' + i] = 'Некорректный адрес ретрансляции';
                res.status(400).json({
                    errors
                })
                return;
            }
        }
        needRecord = !!needRecord;
        let task;
        let taskData = {
            name,
            url,
            startTime,
            endTime,
            needRecord,
            state: 'STATE_NOT_STARTED',
        };

        if (id) {
            await Task.updateOne({ id }).set(taskData);
            task = await Task.findOne({id}).populate('endpoints');
        } else {
            task = await Task.create(taskData).fetch()
            task.is_new = true;
        }
        let oldIds = task.endpoints ? task.endpoints.map(endpoint => endpoint.id) : [];
        let newIds = [];
        task.endpoints = [];
        for (let index in endpoints) {
            let endpointUrl = endpoints[index].url;
            let endpointInstance;
            if (endpoints[index].id) {
                endpointInstance = await Endpoint.updateOne({id: endpoints[index].id}).set({
                    url: endpointUrl,
                 });
            } else {
                endpointInstance = await Endpoint.create({
                    task: task.id,
                    url: endpointUrl,
                    state: 'STATE_NOT_STARTED',
                }).fetch();
            }
            newIds.push(endpointInstance.id);
            task.endpoints.push(endpointInstance);
        }
        for (let index in oldIds) {
            let oldId = oldIds[index];
            console.log(newIds, oldId);
            if (newIds.indexOf(oldId) === -1) {
                await Endpoint.destroyOne({id: oldId});
            }
        }
        res.json(task);
    })

    app.get('/tasks/log/:id', async (req, res) => {
        let log = fs.readFileSync('logs/' +  req.params.id + '.log', 'utf8');
        res.json(log.split('\n'));
    });
}
