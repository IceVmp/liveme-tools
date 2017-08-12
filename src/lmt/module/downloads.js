/*
	Downloads Module
*/

const appSettings = require('electron').remote.require('electron-settings'), path = require('path'), ffpmeg = require('fluent-ffmpeg'), m3u8stream = require('./m3u8stream/index'), fs = require('fs');
var download_queue = [], download_history = [], can_run = false, is_running = false;

module.exports = {
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
    add: function(User, Video) {
        download_queue.push({ user: User, video: Video });
    },
    
    /*
        Starts/Resumes downloading
    */
    start: function() {
        if (download_queue.length > 0) {
            can_run = true;
        }

        if (!is_running && can_run) {
            runDownloader();
        }
    },

    /*
        Stops downloading any new files after the one(s) it's downloading now, until told to start again
    */
    stop: function() {
        can_run = false;
    },

    /*
        Called on startup
    */
    init: function() {
        loadQueue();
        loadHistory();
    },

    is_running: function() {
        return is_running;
    },

    is_paused: function() {
        return !can_run; // If it can't run, it is paused
    },

    /* 
        TODO: Look up what Electron ships with support for; I don't want to add too many dependencies
        Observable or something to subscribe to be notified about status of downloads, for the downloads page
    */
    subscribe_to_progress: function() {

    }
};

function loadQueue() {

}

function saveQueue() {

}

function loadHistory() {

}

function saveHistory() {

}

/*
    Pop an item from the queue and process it here
*/
function processItem(item) {
    let downloadEngine = appSettings.get('downloads.engine');
    let localFilename = getLocalFilename(item.user, item.video);
    let remoteFilename = item.video.url;

    if (downloadEngine == 'internal') {
        m3u8stream(remoteFilename, {
            on_complete: function(e) {
                console.log('Finished!');
            },
            on_error: function(e) {
                console.log('Errored');
            },
            on_progress: function(e) {
                let percent = Math.round((e.current / e.total) * 100);
                console.log(`Progress: ${percent}%`);
            }
        }).pipe(fs.createWriteStream(localFilename));
    } else if (downloadEngine == 'ffmpeg') {
        ffmpeg(remoteFilename)
            .audioCodec('aac')
            .videoCodec('libx264')
            .output(localFilename)
            .on('end', function(stdout, stderr) {
                console.log('Finished!');
            })
            .on('progress', function(progress) {
                console.log(`Progress: ${progress.percent}%`);
            })
            .on('start', function(c) {
                console.log(`Started using command: ${c}`);
            })
            .on('error', function(err, stdout, etderr) {
                console.log('Cannot process video', err.message);
            })
            .run();
    }
}

/*
    Starts processing the download queue until it's paused or empty
*/
function runDownloader() {
    while (download_queue.length > 0 && can_run) {
        let item = download_queue.unshift();
        is_running = true;
        processItem(item);
    }

    is_running = false;
}

/*
    Gets full local filename for the download
    Replaces wildcards in the filename with the variables
*/
function getLocalFilename(user, video) {
    if (appSettings.get('downloads.filemode') == 0) {
        return path.join(appSettings.get('downloads.directory'), path.basename(video.url).replace("m3u8", "ts"));
    } else {
        let finalname = appSettings.get('downloads.filetemplate')
                                    .replace("%%username%%", user.name)
                                    .replace("%%userid%%", user.id)
                                    //.replace("%%usercountry%%", user.country)
                                    .replace("%%videoid%%", video.id)
                                    .replace("%%videotitle%%", video.title)
                                    .replace("%%videotime%%", video.time);

        if (!finalname || finalname == "") {
            return path.join(appSettings.get('downloads.directory'), path.basename(video.url).replace("m3u8", "ts"));
        } else {
            return path.join(appSettings.get('downloads.directory'), finalname + ".ts");
        }
    }
}