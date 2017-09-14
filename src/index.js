/*

	  _      _           __  __        _______          _     
	 | |    (_)         |  \/  |      |__   __|        | |    
	 | |     ___   _____| \  / | ___     | | ___   ___ | |___ 
	 | |    | \ \ / / _ \ |\/| |/ _ \    | |/ _ \ / _ \| / __|
	 | |____| |\ V /  __/ |  | |  __/    | | (_) | (_) | \__ \
	 |______|_| \_/ \___|_|  |_|\___|    |_|\___/ \___/|_|___/

		
		 			Licensed under GPL3 now

	Developers:

	thecoder		- https://github.com/thecoder75
	polydragon		- https://github.com/polydragon

*/
const 	{app, BrowserWindow, ipcMain, Menu, shell} = require('electron'), os = require('os'), 
		fs = require('fs'), isDev = require('electron-is-dev'), path = require('path'),
		request = require('request'), Favorites = require('./custom_modules/Favorites'), Downloader = require('./custom_modules/Downloader');
		
let 	mainwin = null, queuewin = null, playerWindow = null, settingsWindow = null, 
		favoritesWindow = null, chatWindow = null, splashWindow = null, menu = null, 
		importwin = null, appSettings = require('electron-settings');


function createWindow(){
	/*
		Load Settings
	*/
	if (!appSettings.get('downloads.directory')) {
		appSettings.set('downloads', {
			directory : path.join(app.getPath('home'), 'Downloads'),
			filemode: 0,
			filetemplate: '',
			history: true,
			replaycount: 10,
			engine: 'internal'
		});

	}

	/*
		Create Windows
	*/
	mainwin=new BrowserWindow({
		icon: __dirname + '/appicon.ico', width:1120, height:720, minWidth:1120, minHeight:720, darkTheme:true, autoHideMenuBar:false,
		disableAutoHideCursor:true, titleBarStyle: 'default', fullscreen:false, maximizable:true, frame:false, vibrancy:'dark', backgroundColor: '#000000',
		webPreferences:{ webSecurity:false, textAreasAreResizable:false, plugins:true }
	});

	queuewin=new BrowserWindow({
		width: 640, height: 400, resizable:true, minWidth:640, maxWidth: 640, minHeight: 160, maxHeight: 1600, darkTheme:true, autoHideMenuBar:false, show: false, skipTaskbar: false,
		disableAutoHideCursor:true, titleBarStyle: 'default', fullscreen:false, maximizable:false, frame:false, backgroundColor: '#000000',
		webPreferences:{ webSecurity:false, plugins:true, devTools:true }
	});

	chatWindow = new BrowserWindow({
		width: 320, height: 760, resizable: true, darkTheme:true, autoHideMenuBar:false, show: false, skipTaskbar: false, backgroundColor: '#000000',
		disableAutoHideCursor:true, titleBarStyle: 'default', fullscreen:false, maximizable:false, frame:false
	});
	
	importwin = new BrowserWindow({
		width: 320, height: 160, resizable: false, darkTheme:true, autoHideMenuBar:false, show: false, skipTaskbar: false, backgroundColor: '#000000',
		disableAutoHideCursor:true, titleBarStyle: 'default', fullscreen:false, maximizable:false, frame:false, child: true, parent: mainwin
	});

	mainwin.webContents.session.clearCache(() => {});		
	mainwin.webContents.session.clearStorageData();
	mainwin.loadURL(`file://${__dirname}/lmt/index.html`);

	mainwin.on('closed', () => { 
		mainwin = null; 
		if (queuewin != null) {
			queuewin.close();
		}
		app.quit();
	});

	queuewin.loadURL(`file://${__dirname}/lmt/queue.html`);
	queuewin.webContents.session.clearCache(() => {});		
	queuewin.webContents.session.clearStorageData();
	queuewin.on('closed', () => { 
		queuewin = null; 
	});

	chatWindow.loadURL(`file://${__dirname}/lmt/chat.html`);
	chatWindow.webContents.session.clearStorageData();
	chatWindow.webContents.session.clearCache(() => {});		
	chatWindow.on('closed', () => { 
		chatWindow = null; 
	});

	importwin.loadURL(`file://${__dirname}/lmt/importlist.html`);
	importwin.webContents.session.clearStorageData();
	importwin.webContents.session.clearCache(() => {});		
	importwin.on('closed', () => { 
		importwin = null; 
	});

	showSplashWindow();

	/*
		Only use custom menus if app is compiled, otherwise leave menus alone during development testing.
	*/
	if (isDev == false) {
		menu = Menu.buildFromTemplate(getMenuTemplate())
		Menu.setApplicationMenu(menu)
	}

	setTimeout(function(){
		CheckForUpgrade();
	}, 10000);

	setTimeout(function(){
		importwin.hide();
	}, 200);

	Favorites.load();
	Downloader.init(appSettings);


	Downloader.events.on('show-queue', () => {
		if (queuewin == null) { return; }
		queuewin.showInactive(); 	
	});

	global.Favorites = Favorites;
	global.Downloader = Downloader;
}


var shouldQuit = app.makeSingleInstance(function(commandLine,workingDirectory){
	if (mainwin) {
		if (mainwin.isMinimized())
			mainwin.restore();

		mainwin.focus();
	}
});
if (shouldQuit) {
	app.quit();
	return;
}

app.on('ready', createWindow)
app.on('window-all-closed', () => { 
	mainwin.webContents.send('do-shutdown');
	app.quit();
});
app.on('activate', () => { if (mainwin === null) { createWindow(); } });





/*
	Splash/About Window
*/
function showSplashWindow() {
	splashWindow=new BrowserWindow({
		width: 600, height: 180, resizable:false, darkTheme:true, autoHideMenuBar:true, show: true, skipTaskbar: true, 
		disableAutoHideCursor:true, titleBarStyle: 'default', fullscreen:false, maximizable:false, frame:false, movable: false, transparent: true,
		webPreferences:{ webSecurity:false, plugins:false, devTools:false }
	});
	splashWindow.loadURL(`file://${__dirname}/lmt/splash.html`);
	splashWindow.on('closed', () => { 
		splashWindow = null; 
	});	
}




/*
	Favorites Related
*/
ipcMain.on('show-favorites', () => {
	favoritesWindow = new BrowserWindow({
		width:360, height:720, resizable:false, darkTheme:true, autoHideMenuBar:false, show: true, skipTaskbar: false, backgroundColor: '#4a4d4e',
		disableAutoHideCursor:true, titleBarStyle: 'default', fullscreen:false, maximizable:false, frame:false, 
		webPreferences:{ webSecurity:false, plugins:true, devTools:true }
	});
	favoritesWindow.webContents.session.clearCache(() => {});		
	favoritesWindow.webContents.session.clearStorageData();
	favoritesWindow.loadURL(`file://${__dirname}/lmt/favorites-list.html`);
	favoritesWindow.on('closed', () => { 
		favoritesWindow = null; 
	});
	favoritesWindow.show();
});



/*
	Import Window
*/
ipcMain.on('show-import-win', (event, arg) => {
	importwin.show();
	importwin.webContents.send('import-list', { list: arg.list }); 
});

ipcMain.on('hide-import-win', () => {
	importwin.hide();
});




/*
	Settings Related
*/
ipcMain.on('show-settings', () => {
	showSettings();
});

function showSettings() {
	var settingsWindow = new BrowserWindow({
		width: 900, height: 432, resizable:false, darkTheme:true, autoHideMenuBar:false, show: true, skipTaskbar: false, center: true, backgroundColor: '#4a4d4e',
		disableAutoHideCursor:true, titleBarStyle: 'default', fullscreen:false, maximizable:false, frame:false, 
		parent: mainwin, modal: false, webPreferences:{ webSecurity:false, plugins:true, devTools:true }
	});
	settingsWindow.loadURL(`file://${__dirname}/lmt/settings.html`);
	settingsWindow.on('closed', () => { 
		settingsWindow = null; 
	});
	settingsWindow.show();
}



/*
	Search Related
*/

ipcMain.on('submit-search', (event, arg) => { mainwin.webContents.send('do-search', { userid: arg.userid }); });

ipcMain.on('livemesearch', (event, arg) => { 
	if (arg.type == 'search') {
		lmt.searchkeyword(arg.query, function(e){
			mainwin.webContents.send('render_results', { data: e, type: 'search' }); 			
		})
	} else {
		lmt.getuservideos(arg.query, function(e){
			mainwin.webContents.send('render_results', { data: e, type: 'userlookup' }); 			
		})
	}
});



/*
	Popup Windows (Followings/Fans)
*/
ipcMain.on('open-window', (event, arg) => {
	var win = new BrowserWindow({
		width: 320, height: 720, resizable:false, darkTheme:true, autoHideMenuBar:false, skipTaskbar: false, backgroundColor: '#4a4d4e',
		disableAutoHideCursor:true, titleBarStyle: 'default', fullscreen:false, maximizable:false, frame:false
	});
	win.setMenu(null);
	win.loadURL(`file://${__dirname}/lmt/`+arg.url);
	win.show();
	//win.once('ready-to-show', () => { win.show(); });
});



/*
	Video Player Related

	Note:  	Tried using Quicktime Player on MacOS but it would resize and stop constantly due to playlists
			Was successful doing a couple tests with Windows Media Player on Windows
			Thought of allowing user to choose in future version, just need to implement UI and handle it here

	For now, its an HLS video player in a web browser window...
*/
ipcMain.on('play-video', (event, arg) => {
	if (playerWindow == null) {
		playerWindow = new BrowserWindow({
			width: 368, height: 640, resizable: true, darkTheme:true, autoHideMenuBar:false, show:true, skipTaskbar: false, backgroundColor: '#4a4d4e',
			disableAutoHideCursor:true, titleBarStyle: 'default', fullscreen:false, maximizable:false, frame:false
		});
		playerWindow.webContents.session.clearCache(() => {});		
		playerWindow.webContents.session.clearStorageData();
		playerWindow.on('closed', () => { 
			playerWindow = null; 
		});		
	}
	playerWindow.loadURL(`file://${__dirname}/lmt/player.html#`+arg.url);

});
ipcMain.on('hide-player', (event, arg) => { 
	playerWindow.close(); 
});






/* 
	Chat Window 
*/
ipcMain.on('open-chat', (event, arg) => {
	chatWindow.showInactive();
	chatWindow.webContents.send('set-chat', { url: arg.url, startTime: arg.startTime, nickname: arg.nickname });
});
ipcMain.on('hide-chat', () => { chatWindow.hide(); });







/*
	Download Queue
*/
ipcMain.on('show-queue', () => { 
	if (queuewin == null) { return; }
	queuewin.show(); 
});

ipcMain.on('hide-queue', () => { 
	if (queuewin == null) { return; }
	queuewin.hide(); 
});


/*
	History relay
*/

ipcMain.on('history-delete', (event, arg) => {
	mainwin.send('history-delete', {});
});





function getMenuTemplate () {

	var template = [
		{
			label: 'Edit',
			submenu: [
				{role: 'undo'},
				{role: 'redo'},
				{type: 'separator'},
				{role: 'cut'},
				{role: 'copy'},
				{role: 'paste'},
				{role: 'delete'},
				{role: 'selectall'}
			]
		},
		{
			role: 'window',
			submenu: [
				{role: 'minimize'},
				{role: 'close'},
				{type: 'separator'},
				{role: 'toggledevtools'}
			]
		},
		{
			role: 'help',
			submenu: [
				{
					label: 'LiveMe Tools Github Page',
					click: () => shell.openExternal('https://github.com/thecoder75/liveme-tools/')
				},
				{
					label: 'Report an Issue',
					click: () => shell.openExternal('https://github.com/thecoder75/liveme-tools/issues')
				}
			]
		}
	];


	if (process.platform === 'darwin') {
		template.unshift({
			label: app.getName(),
			submenu: [
				{role: 'about'},
				{type: 'separator'},
				{role: 'services', submenu: []},
				{type: 'separator'},
				{role: 'hide'},
				{role: 'hideothers'},
				{role: 'unhide'},
				{type: 'separator'},
				{role: 'quit'}
			]
		});
	}

	// Add "File > Quit" menu item so Linux distros where the system tray icon is
	// missing will have a way to quit the app.
	if (process.platform === 'linux') {
		// File menu (Linux)
		template[0].submenu.push({
			label: 'Quit',
			click: () => app.quit()
		})
	}

	

	return template
}


function CheckForUpgrade() {

	var r = new Date().getTime();
	request({ url: 'https://raw.githubusercontent.com/thecoder75/liveme-tools/master/src/package.json?random='+r, timeout: 15000 }, function (err, response, body) {
		var js = JSON.parse(body), nv = parseFloat(js.minversion.replace('.','')), ov = parseFloat(app.getVersion().replace('.','')), isCurrent = nv > ov;

		if (nv > ov) {
			var win = new BrowserWindow({
				width: 400, height: 244, resizable:false, darkTheme:true, autoHideMenuBar:false, skipTaskbar: false, backgroundColor: '#4a4d4e',
				disableAutoHideCursor:true, titleBarStyle: 'default', fullscreen:false, maximizable:false, frame:false
			});
			win.loadURL(`file://${__dirname}/lmt/upgrade.html`);
			win.show();
		}
		
	});

}


