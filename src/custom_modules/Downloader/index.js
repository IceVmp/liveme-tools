/*
	Downloader Module
*/

const { app, ipcMain } = require('electron');

const path = require('path'),
      ffmpeg = require('fluent-ffmpeg'),
      m3u8stream = require('../m3u8stream'),
      fs = require('fs-extra'),
      eventEmitter = new(require('events').EventEmitter)();

//class DownloadEmitter extends EventEmitter {}
//const eventEmitter = new DownloadEmitter();

var appSettings = null,
    download_queue = [],
    download_history = [],
    can_run = true,
    is_running = false;

module.exports = {
    events: eventEmitter,

    /*
        Expecting data in this format:
        user: {
            id: 123,
            name: "name"
        },
        video: {
            id: 123,
            title: "name",
            time: 123,
            url: 'http://xyz.m3u8'
        }
    */
    add: function(obj) {
        download_queue.push(obj);
        // TODO: SEND TO GUI -- ipcRenderer.send('download-add', { id: obj.video.id, value: obj.video.url });
        eventEmitter.emit('add', { id: obj.video.id, value: obj.video.url });
        saveQueue();
        
        if (!is_running && can_run) {
            runDownloader();
        }
    },

    /*
        Removes an item from the queue
    */
    remove: function(vid) {
        let index = -1;

        for (i = 0; i < download_queue.length; i++) {
            if (download_queue[i].video.id == vid) {
                index = i;
                break;
            }
        }

        if (index != -1) {
            download_queue.splice(index, 1);
            saveQueue();
            eventEmitter.emit('remove', { id: vid });
            return true;
        }
        
        return false;
    },
    
    /*
        Starts/Resumes downloading
    */
    start: function() {
        if (!is_running && can_run) {
            runDownloader();
        }
    },

    /*
        Stops downloading any new files after the one(s) it's downloading now, until told to start again
    */
    pause: function() {
        can_run = false;
        eventEmitter.emit('pause');
    },

    /*
        Resumes downloading
    */

    resume: function() {
        can_run = true;
        eventEmitter.emit('resume');

        if (!is_running && can_run) {
            runDownloader();
        }
    },

    init: function(settings) {
        appSettings = settings;
    },

    /*
        Called on startup
    */
    load: function() {
        loadQueue();
        loadHistory();
    },

    /*
        Called on shutdown
    */
    forceSave: function() {
        saveQueue();
        saveHistory();
    },

    isRunning: function() {
        return is_running;
    },

    isPaused: function() {
        return !can_run; // If it can't run, it is paused
    },

    /*
        Checks if a video is in the download history
    */
    hasBeenDownloaded: function(videoid) {
        return download_history.indexOf(videoid) != -1;
    },

    purgeHistory: function() {
        fs.removeSync(path.join(app.getPath('appData'), app.getName(), 'downloadHistory.json'));
        download_history = [];
    },

    purgeQueue: function() {
        download_queue = [];
        saveQueue();
        // TODO: SEND TO GUI -- ipcRenderer.send('wipe-download-queue');
        eventEmitter.emit('clear-queue');
    }
};

function loadQueue() {
    fs.readFile(path.join(app.getPath('appData'), app.getName(), 'downloadQueue.json'), 'utf8', function(err, data) {
        if (err) {
            download_queue = [];
        } else {
            try {
                download_queue = JSON.parse(data);
            } catch (err) {
                download_queue = [];
            }
        }
        
        if (download_queue.length > 0) {
            for (i = 0; i < download_queue.length; i++) {
                // TODO: SEND TO GUI -- ipcRenderer.send('download-add', { id: download_queue[i].video.id, value: download_queue[i].video.url });
                eventEmitter.emit('add', { id: download_queue[i].video.id, value: download_queue[i].video.url });
            }

            runDownloader();
        }
    });
}

function saveQueue() {
    fs.writeFile(path.join(app.getPath('appData'), app.getName(), 'downloadQueue.json'), JSON.stringify(download_queue), 'utf8', () => {});
}

function loadHistory() {
    if (!appSettings.get('downloads.history')) {
        return;
    }

    fs.readFile(path.join(app.getPath('appData'), app.getName(), 'downloadHistory.json'), 'utf8', function(err, data) {
        if (err) {
            download_history = [];
        } else {
            try {
                download_history = JSON.parse(data);
            } catch (err) {
                download_history = [];
            }
        }
    });
}

function saveHistory() {
    if (!appSettings.get('downloads.history')) {
        return;
    }

    fs.writeFile(path.join(app.getPath('appData'), app.getName(), 'downloadHistory.json'), JSON.stringify(download_history), 'utf8', () => {});
}

/*
    Pop an item from the queue and process it here
*/
function processItem(item) {
    return new Promise((resolve, reject) => {
        let downloadEngine = appSettings.get('downloads.engine');
        let localFilename = getLocalFilename(item);
        let remoteFilename = item.video.url;

        if (downloadEngine == 'internal') {
            // TODO: SEND TO GUI -- ipcRenderer.send('download-start', { id: item.video.id, value: item.video.url });
            eventEmitter.emit('start', { id: item.video.id, url: item.video.url });
            
            m3u8stream(remoteFilename, {
                on_complete: function(e) {
                    if (appSettings.get('downloads.history')) {
                        download_history.push(item.video.id);
                    }

                    // TODO: SEND TO GUI -- ipcRenderer.send('download-finish', { id: item.video.id });
                    eventEmitter.emit('finish', { id: item.video.id });
                    resolve();
                },
                on_error: function(e) {
                    //download_queue.push(item);
                    // TODO: SEND TO GUI -- ipcRenderer.send('download-error', { id: item.video.id });
                    eventEmitter.emit('fail', { id: item.video.id });
                    resolve();
                },
                on_progress: function(e) {
                    let percent = Math.round((e.current / e.total) * 100);
                    // TODO: SEND TO GUI -- ipcRenderer.send('download-progress', { id: item.video.id, url: item.video.url, value: percent });
                    eventEmitter.emit('progress', { id: item.video.id, url: item.video.url, value: percent });
                }
            }).pipe(fs.createWriteStream(localFilename));
        } else if (downloadEngine == 'ffmpeg') {
            ffmpeg(remoteFilename)
                .outputOptions([
                    '-c copy',
                    '-bsf:a aac_adtstoasc',
                    '-vsync 2'
                ])
                .output(localFilename.replace(".ts", ".mp4"))
                .on('end', function(stdout, stderr) {
                    if (appSettings.get('downloads.history')) {
                        download_history.push(item.video.id);
                    }

                    // TODO: SEND TO GUI -- ipcRenderer.send('download-finish', { id: item.video.id });
                    eventEmitter.emit('finish', { id: item.video.id });
                    resolve();
                })
                .on('progress', function(progress) {
                    // TODO: SEND TO GUI -- ipcRenderer.send('download-progress', { id: item.video.id, url: item.video.url, value: progress.percent });
                    eventEmitter.emit('progress', { id: item.video.id, url: item.video.url, value: progress.percent });
                })
                .on('start', function(c) {
                    // TODO: SEND TO GUI -- ipcRenderer.send('download-start', { id: item.video.id, value: item.video.url });
                    eventEmitter.emit('start', { id: item.video.id, url: item.video.url });
                })
                .on('error', function(err, stdout, etderr) {
                    //download_queue.push(item);
                    // TODO: SEND TO GUI -- ipcRenderer.send('download-error', { id: item.video.id });
                    eventEmitter.emit('fail', { id: item.video.id });
                    resolve();
                })
                .run();
        }
    });
}

/*
    Starts processing the download queue until it's paused or empty
*/
async function runDownloader() {
    while (download_queue.length > 0 && can_run) {
        let item = download_queue.shift();
        is_running = true;
        await processItem(item);
        saveQueue();
        saveHistory();
    }

    is_running = false;
}

/*
    Gets full local filename for the download
    Replaces wildcards in the filename with the variables
*/
function getLocalFilename(item) {
    let defaultPath = path.join(appSettings.get('downloads.directory'), path.basename(item.video.url).replace("m3u8", "ts"));
    let fullPath = null;

    if (appSettings.get('downloads.filemode') == 0) {
        fullPath = defaultPath;
    } else {
        let finalname = appSettings.get('downloads.filetemplate')
                                    .replace(/%%username%%/g, item.user.name)
                                    .replace(/%%userid%%/g, item.user.id)
                                    //.replace(/%%usercountry%%/g, user.country)
                                    .replace(/%%videoid%%/g, item.video.id)
                                    .replace(/%%videotitle%%/g, item.video.title ? item.video.title : 'untitled')
                                    .replace(/%%videotime%%/g, item.video.time);

        if (!finalname || finalname == "") {
            fullPath = defaultPath;
        } else {
            fullPath = path.join(appSettings.get('downloads.directory'), finalname.replace(/[:*?""<>|]/g, '_') + ".ts");
        }
    }

    let basename = path.basename(fullPath);

    if (basename == 'playlist.ts' || basename == 'playlist_eof.ts') {
        let parentName = path.basename(path.dirname(item.video.url));
        fullPath = fullPath.replace(basename, parentName + '.ts');
    }

    fs.ensureDirSync(path.dirname(fullPath));
    return fullPath;
}