const empty = require('../helpers/empty');
const toDate = require('../helpers/toDate');
const process = require("child_process");
const fs = require('fs');

let Task, Endpoint;

let processes = {};

const ffmpegPath = "ffmpeg";
const ytdlPath = "youtube-dl";

module.exports = (app, db, io) => {

    Task = db.collections.task;
    Endpoint = db.collections.endpoint;
    File = db.collections.file;

    const getYTDLUrl = async (url) => {
        return new Promise((resolve, reject) => {
            let cmdArgStr = [
                '-g',
                url
            ].join(" ").trim();
            let ytdlProcess = process.spawn(ytdlPath, cmdArgStr.split(/\s+/));
            ytdlProcess.stdout.on("data", chunk => {
                streamUrl = chunk.toString().split(/\r?\n/g).filter(Boolean)[0];
                resolve(streamUrl);
            });
        })
    };

    app.get('/ytdl', async (req, res) => {
        let url = await getYTDLUrl(req.query.url);
        res.json({url});
    });

    const startEndpoint = async (task, endpoint) => {

        let cmdArgStr;

        let url = task.useYTDL ? (await getYTDLUrl(task.url)) :task.url;
        let needReencode = url.indexOf('m3u8') !== -1 && endpoint.url.indexOf('vkuserlive') !== -1;

        if (needReencode) {
            cmdArgStr = [
                "-timeout 30",
                "-hide_banner",
                "-loglevel error",
                "-re",
                `-i ${url}`,
                "-strict -2",
                "-c:v libx264",
                "-preset medium",
                "-maxrate 3500k",
                "-bufsize 6000k",
                "-r 30",
                "-pix_fmt yuv420p",
                "-c:a aac",
                "-b:a 160k",
                "-ac 2",
                "-ar 44100",
                "-f flv",
                `-y ${endpoint.url}`
            ].join(" ").trim();
        } else {
            cmdArgStr = [
                "-timeout 30",
                "-hide_banner",
                "-loglevel error",
                "-re",
                `-i ${url}`,
                "-f flv",
                `-y ${endpoint.url}`
            ].join(" ").trim();
        }
        console.log(`Run command: ${ffmpegPath} ${cmdArgStr}`);

        let recProcess = process.spawn(ffmpegPath, cmdArgStr.split(/\s+/));
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
                io.emit('ffmpeg_error', {
                    endpointId: endpoint.id,
                    taskId: task.id,
                    output
                });
            } else {
                await Endpoint.updateOne({ id: endpoint.id }).set({
                    state: 'STATE_ENDED'
                });
            }
            fs.writeFileSync(`logs/${endpoint.id}.log`, output.join('\n'));
            processes[recProcess.pid] = null;
        });

        let output = [];
        let started = false;
        recProcess.stderr.on("data", chunk => {
            chunk.toString().split(/\r?\n/g).filter(Boolean).forEach(line => {
                console.log(line);
                if (!started) {
                    output.push(line);
                }
            });
        });
        await Endpoint.updateOne({ id: endpoint.id }).set({
            processId: recProcess.pid,
            state: "STATE_STARTED"
        });
        console.log('pid:', recProcess.pid);
        processes[recProcess.pid] = recProcess;
    };

    const startRecord = async (task) => {
        let taskName = task.name;
        taskName = taskName.replace(/ /g, '_');
        taskName = taskName.replace(/[^.a-zA-Zа-яА-Я0-9]/gi,'');
        let fileName = `${taskName}_${(~~(Math.random()*1e8)).toString(16)}.mp4`;
        let file = await File.create({
            task: task.id,
            url: fileName
        }).fetch();
        let url = task.useYTDL ? (await getYTDLUrl(task.url)) :task.url;
        let needReencode = url.indexOf('m3u8') !== -1;
        let cmdArgStr;
        if (needReencode) {
            cmdArgStr = [
                "-timeout 30",
                "-hide_banner",
                "-loglevel error",
                "-re",
                `-i ${url}`,
                "-strict -2",
                "-c:v libx264",
                "-preset medium",
                "-maxrate 3500k",
                "-bufsize 6000k",
                "-r 30",
                "-pix_fmt yuv420p",
                "-c:a aac",
                "-b:a 160k",
                "-ac 2",
                "-ar 44100",
                `-y records/${fileName}`
            ].join(" ").trim();
        } else {
            cmdArgStr = [
                "-timeout 10",
                "-hide_banner",
                "-loglevel error",
                "-re",
                `-i ${url}`,
                `-y records/${fileName}`
            ].join(" ").trim();
        }
        console.log(`Run command: ${ffmpegPath} ${cmdArgStr}`);
        let recProcess = process.spawn(ffmpegPath, cmdArgStr.split(/\s+/));
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
                io.emit('ffmpeg_error', {
                    endpointId: 'record',
                    taskId: task.id,
                    output
                });
            } else {
                await Task.updateOne({ id: task.id }).set({
                    recordState: 'STATE_ENDED'
                });
            }
            fs.writeFileSync(`logs/record_${task.id}.log`, output.join('\n'));
            processes[recProcess.pid] = null;
        });

        let output = [];
        recProcess.stderr.on("data", chunk => {
            chunk.toString().split(/\r?\n/g).filter(Boolean).forEach(line => {
                console.log(line);
                output.push(line);
            });
        });
        await Task.updateOne({ id: task.id }).set({
            recordProcessId: recProcess.pid,
            recordState: "STATE_STARTED"
        });
        processes[recProcess.pid] = recProcess;
    }

    const startAll = async (task) => {
        if (task.needRecord) {
            await startRecord(task);
        }
        for (let endpointIndex in task.endpoints) {
            let endpoint = task.endpoints[endpointIndex];
            await startEndpoint(task, endpoint);
        }
    }

    const stopAll = async (task) => {
        if (task.needRecord) {
            if (processes[task.recordProcessId]) {
               await stopProcess(processes[task.recordProcessId]);
            }
        }
        for (let endpointIndex in task.endpoints) {
            let endpoint = task.endpoints[endpointIndex];
            if (processes[endpoint.processId]) {
                await stopProcess(processes[endpoint.processId]);
            }
        }
    }

    const timer = async () => {
        let tasks = await Task.find({}).populate('endpoints').populate('files');
        let now = new Date().getTime();
        console.log('Date: '+now);
        for (let index in tasks) {
            let task = tasks[index];
            if (!task.disableAutolaunch) {
                console.log('Task: %s, startTime: %s, endTime: %s', task.name, task.startTime, task.endTime)
                if (task.state !== "STATE_STARTED") {
                    if (task.startTime <= now) {
                        if (!task.endTime || task.endTime > now) {
                            console.log('Starting task...');

                            await startAll(task);
                            await Task.updateOne({id: task.id}).set({
                                state: "STATE_STARTED"
                            });
                        }
                    } else {
                        console.log('Starting in %s seconds', ((task.startTime - now) / 1000));
                    }
                }
                if (task.state === "STATE_STARTED") {
                    if (task.endTime && now >= task.endTime) {
                        console.log('Stopping task...');
                        await stopAll(task);
                        await Task.updateOne({id: task.id}).set({
                            state: "STATE_ENDED"
                        });
                    } else {
                        console.log('Stopping in %s seconds', ((task.endTime - now) / 1000));
                    }
                }
            }
        }
    };

    setInterval(timer, 60000);
    timer();

    const stopProcess = (process) => {
        process.stdin.setEncoding('utf8');
        process.stdin.write('q');
        setTimeout(() => {
            process.kill('SIGINT');
        }, 750)
    }

    app.post('/tasks/:id/start-all', async (req, res) => {
        let task = await Task.findOne({id: req.params.id}).populate('endpoints').populate('files');
        if (!task) {
            res.status(400).json({error: 'Задача не существует'});
            return;
        }
        await startAll(task, true);
        res.json({});
    })

    app.post('/tasks/:id/stop-all', async (req, res) => {
        let task = await Task.findOne({id: req.params.id}).populate('endpoints').populate('files');
        if (!task) {
            res.status(400).json({error: 'Задача не существует'});
            return;
        }
        await stopAll(task);
        res.json({});
    })

    app.post('/tasks/:id/start/:endpoint', async (req, res) => {
        let task = await Task.findOne({id: req.params.id}).populate('endpoints').populate('files');
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
        let task = await Task.findOne({id: req.params.id}).populate('endpoints').populate('files');
        if (!task) {
            res.status(400).json({error: 'Задача не существует'});
            return;
        }
        let endpointId = req.params.endpoint;
        if (endpointId === 'record') {
            let process = processes[task.recordProcessId];
            if (process) {
                stopProcess(process);
                await Task.updateOne({id: task.id}).set({
                    recordState: "STATE_ENDED"
                });
            } else {
                res.status(400).json({error: 'Процесс не существует'});
            }
        } else {
            let endpoint = task.endpoints.filter(endpoint => endpoint.id == endpointId)[0];
            if (!endpoint) {
                res.status(400).json({error: 'Объект адреса не существует'});
                return;
            }
            let process = processes[endpoint.processId];
            if (process) {
                stopProcess(process);
                await Endpoint.updateOne({id: endpoint.id}).set({
                    state: "STATE_ENDED"
                });
            } else {
                res.status(400).json({error: 'Процесс не существует'});
            }
        }
        res.json({});
    })

    app.get('/tasks', async (req, res) => {
        let tasks = await Task.find({}).populate('endpoints').populate('files');
        res.json(tasks);
    });

    app.post('/tasks', async (req, res) => {
        let {id, name, url, startTime, endTime, endpoints, needRecord, disableAutolaunch, useYTDL} = req.body;
        if (empty(url)) {
            res.status(400).json({errors: {
                url: 'Введите URL потока'
            }})
            return;
        }
        if (!url.startsWith('rtmp') && !url.startsWith('http') && !useYTDL) {
            res.status(400).json({errors: {
                url: 'Некорректный URL потока'
            }});
            return;
        }
        if (empty(startTime)) {
            res.status(400).json({errors: {
               startTime: 'Введите время начала'
            }});
            return;
        }
        let now = new Date().getTime();
        startTime = toDate(startTime).getTime();


        if (startTime < now) {
            //res.status(400).json({errors: {
            //    startTime: 'Дата начала должна быть больше текущей'
            //}});
            //return;
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
        if (!endpoints || (endpoints.length === 0 && !needRecord)) {
            res.status(400).json({errors: {
                url: 'Введите хотя бы 1 адрес для ретрансляции'
            }})
            return;
        }
        for (let i in endpoints) {
            if (!endpoints[i].url || (!endpoints[i].url.startsWith('rtmp'))) {
                let errors = {};
                errors['endpoints_' + i] = 'Некорректный адрес ретрансляции';
                res.status(400).json({
                    errors
                })
                return;
            }
        }
        if (!endTime) {
            endTime = 0;
        }
        needRecord = !!needRecord;
        disableAutolaunch = !!disableAutolaunch;
        useYTDL = !!useYTDL;
        let task;
        let taskData = {
            name,
            url,
            startTime,
            endTime,
            needRecord,
            disableAutolaunch,
            useYTDL,
            state: 'STATE_NOT_STARTED',
        };

        if (id) {
            await Task.updateOne({ id }).set(taskData);
            task = await Task.findOne({id}).populate('endpoints').populate('files');
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

    app.post('/tasks/delete/:id', async (req, res) => {
        let task = await Task.findOne({id: req.params.id});
        let files = await File.find({task: req.params.id});
        let endpoints = await Endpoint.find({task: req.params.id});
        endpoints.forEach(endpoint => {
            if (processes[endpoint.processId]) {
                stopProcess(processes[task.processId]);
            }
        });
        if (processes[task.recordProcessId]) {
            await stopProcess(processes[task.recordProcessId]);
        }
        files.forEach(file => {
            let path= `records/${file.url}`;
            if (fs.existsSync(path)) {
                fs.unlinkSync(path);
            }
        });
        await Task.destroyOne({id: req.params.id});
        await File.destroy({task: req.params.id});
        await Endpoint.destroy({task: req.params.id});
        res.json({});
    });
    app.post('/tasks/delete-endpoint/:id', async (req, res) => {
        let endpoint = await Endpoint.findOne({id: req.params.id});
        if (processes[endpoint.processId]) {
            await stopProcess(processes[task.processId]);
        }
        await Endpoint.destroyOne({id: req.params.id});
        res.json({});
    });

    app.post('/tasks/delete-file/:id', async (req, res) => {
        let file = await File.findOne({id: req.params.id});
        let path= `records/${file.url}`;
        if (fs.existsSync(path)) {
            fs.unlinkSync(path);
        }
        await File.destroyOne({id: req.params.id});
        res.json({});
    });

};
