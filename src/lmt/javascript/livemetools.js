/*

	  _      _           __  __        _______          _     
	 | |    (_)         |  \/  |      |__   __|        | |    
	 | |     ___   _____| \  / | ___     | | ___   ___ | |___ 
	 | |    | \ \ / / _ \ |\/| |/ _ \    | |/ _ \ / _ \| / __|
	 | |____| |\ V /  __/ |  | |  __/    | | (_) | (_) | \__ \
	 |______|_| \_/ \___|_|  |_|\___|    |_|\___/ \___/|_|___/

*/

const 	{ electron, BrowserWindow, remote, ipcRenderer, shell, clipboard } = require('electron'),
		fs = require('fs'), path = require('path'), 
		appSettings = remote.require('electron-settings'),
		Favorites = remote.getGlobal('Favorites'),
		Downloads = remote.getGlobal('Downloader'),
		LiveMe = require('liveme-api');

var isSearching = false, favorites_list = [], debounced = false, current_user = {}, current_page = 0, MAX_PAGE_SIZE = 10;

$(function(){

	document.title = remote.app.getName() + ' v' + remote.app.getVersion();

	onTypeChange();

	// Remote search calls
	ipcRenderer.on('do-search' , function(event , data) { 
		$('#query').val(data.userid);
		$('#type').val('user-lookup');
		beginSearch2();
	});

	ipcRenderer.on('do-shutdown' , function(event , data) { 
		Favorites.forceSave();
        Downloads.forceSave();
        Downloads.killActiveDownload();
	});

	ipcRenderer.on('show-status' , function(event , data) { 
		$('overlay').html(data.message).show();
	});
	ipcRenderer.on('update-status' , function(event , data) { 
		$('overlay').html(data.message);
	});
	ipcRenderer.on('hide-status' , function(event , data) { 
		$('overlay').hide();
	});

	Downloads.load();
});

function copyToClipboard(i) { clipboard.writeText(i); }
function cancelAction() { cancelLMTweb = true; }
function enterOnSearch(e) { if (e.keyCode == 13) beginSearch(); } 

function onTypeChange() {
	var t=$('#type').val();
	switch (t) {
		case 'user-lookup': $('#query').attr('placeholder', 'Short or Long UserID'); break;
		case 'video-lookup': $('#query').attr('placeholder', 'Enter VideoID'); break;
		case 'url-lookup': $('#query').attr('placeholder', 'Enter URL'); break;
		case 'search': $('#query').attr('placeholder', 'Enter Partial or Full Username'); break;
		case 'hashtag': $('#query').attr('placeholder', 'Enter a hashtag'); break;
	}
}

function toggleFavorite() {
	if (Favorites.isOnList(current_user.uid) == true) {
		Favorites.remove(current_user.uid);
		$('#favorites_button').removeClass('active');
	} else {
		Favorites.add(current_user);
		$('#favorites_button').addClass('active');
	}
}

function beginSearch() {

	var u=$('#query').val(), isnum = /^\d+$/.test(u);

	if ((u.length==20) && (isnum)) {
		if ($('#type').val() != 'video-lookup') {
			$('#type').val('video-lookup');
			onTypeChange();
		}
	} else if ((u.length == 18) && (isnum)) {
		if ($('#type').val() != 'user-lookup') {
			$('#type').val('user-lookup');
			onTypeChange();
		}
	} else if (u.indexOf('http') > -1) {
		if ($('#type').val() != 'url-lookup') {
			$('#type').val('url-lookup');
			onTypeChange();
		}
	} else if (u.indexOf('#') > -1) {
		if ($('#type').val() != 'hashtag') {
			$('#type').val('hashtag');
			$('#query').val($('#query').val().replace('#', ''));
			onTypeChange();
		}
/*		
	} else {
		if (($('#type').val() != 'search') || ($('#type').val() != 'hashtag')) {
			$('#type').val('search');
			onTypeChange();
		}
*/		
	}
	beginSearch2();
}

function beginSearch2() {

	var videoid = '', userid = '';

	isSearching = true;
	$('overlay').show();
	$('main').html('');
	
	if ($('#type').val() == 'url-lookup') {
		var q = '', u=$('#query').val(), t=u.split('/');

		if (u.indexOf('/live/') > -1) {
			$('#type').val('video-lookup');
			$('#query').val(u[3]);
			videoid = u[3];

		} else if (t[t.length-1].indexOf('yolo') > -1) {
			var a=t[t.length - 1].split('-');
			$('#type').val('video-lookup');
			$('#query').val(a[1]);
			videoid = a[1];			

		} else if (u.indexOf('videoid') > -1) {
			var a=t[t.length - 1].split('?'),b=a[1].split('&');
			console.log(a);
			for (i = 0; i < b.length; i++) {
				if (b[i].indexOf('videoid') > -1) {
					var c=b[i].split('=');
					
					$('#type').val('video-lookup');
					$('#query').val(c[1]);
					videoid = c[1];

				}
			}
		} else if (u.indexOf('userid') > -1) {
			var a=t[t.length - 1].split('?'),b=a[1].split('&');
			console.log(a);
			for (i = 0; i < b.length; i++) {
				if (b[i].indexOf('userid') > -1) {
					var c=b[i].split('=');
					
					$('#type').val('user-lookup');
					$('#query').val(c[1]);
					videoid = c[1];

				}
			}
		} else {
			$('main').html('<div class="list"><div class="empty">Unsupported URL was specified.</div></div>');									
		}
		isSearching = false;
		$('overlay').hide();		
	} else if ($('#type').val() == 'video-lookup') {
		videoid = $('#query').val();
	} else if ($('#type').val() == 'user-lookup') {
		userid = $('#query').val();
	}

	$('overlay').hide();
	if (videoid.length > 0) {
		LiveMe.getVideoInfo(videoid)
			.then(video => {
				performUserLookup(video.userid);
			})
			.catch(err => {
				$('main').html('<div class="list"><div class="empty">Search returned no data, account may be closed.</div></div>');						
			});

	} else if (userid.length > 0) {
		performUserLookup(userid);
	} else {
		if ($('#type').val() == 'search') {
			current_page = 1;
			performUsernameSearch();
		} else if ($('#type').val() == 'hashtag') {
			current_page = 1;
			performHashtagSearch();
		}
	}
}

function performUserLookup(uid) {
	$('overlay').hide();
	$('panel').show();
	$('main').addClass('with-panel').html('<div id="videolist" class="list"></div>');

	LiveMe.getUserInfo(uid)
		.then(user => {

			var sex = user.user_info.sex < 0 ? '' : (user.user_info.sex == 0 ? 'female' : 'male');

			$('.user-panel').html(`
				<img class="avatar" src="${user.user_info.face}" onerror="this.src='images/blank.png'">
				<div class="meta">
					<div>
						<span>Username:</span>
						${user.user_info.uname}
					</div>
					<div class="align-center">
						<span>User ID:</span>
						<div class="input has-right-button width180">
							<input type="text" id="useridtf" value="${user.user_info.uid}" disabled="disabled">
							<input type="button" class="icon icon-copy" value="" onClick="copyToClipboard('${user.user_info.uid}')" title="Copy to Clipboard">
						</div>
					</div>
					<div>
						<span>Level:</span>
						${user.user_info.level}
					</div>
					<div>
						<br><br>
						<input type="button" class="toggle tiny tiny-100" value="Favorite" onClick="toggleFavorite()" id="favorites_button">
						<br><br><br>
					</div>
					<div>
						<span>Following:</span>
						<input type="button" class="tiny tiny-100" value="${user.count_info.following_count}" onClick="showFollowing('${user.user_info.uid}', ${user.count_info.following_count}, '${user.user_info.uname}')">
					</div>
					<div>
						<span>Fans:</span>
						<input type="button" class="tiny tiny-100" value="${user.count_info.follower_count}" onClick="showFans('${user.user_info.uid}', ${user.count_info.follower_count}, '${user.user_info.uname}')">
					</div>
				</div>
				<input type="hidden" id="sex" value="${sex}">
			`);

			setTimeout(function(){
				if (Favorites.isOnList($('#useridtf').val()) == true) {
					$('#favorites_button').addClass('active');
				}
			}, 250);

			current_page = 1;
			current_user = {
				uid: user.user_info.uid,
				sex: sex,
				face: user.user_info.face,
				nickname: user.user_info.uname
			};
			getUsersReplays();

		})
		.catch(err => {
			console.log(err);
			$('main').html('<div class="list"><div class="empty">Search returned no data, account may be closed.</div>');
		});

}

function getUsersReplays() {
	LiveMe.getUserReplays(current_user.uid, current_page, MAX_PAGE_SIZE)
		.then(replays => {
			if (replays.length > 0) {
				for (var i = 0; i < replays.length; i++) {

					let dt = new Date(replays[i].vtime * 1000);
					var ds = (dt.getMonth() + 1) + '-' + dt.getDate() + '-' + dt.getFullYear() + ' ' + (dt.getHours() < 10 ? '0' : '') + dt.getHours() + ':' + (dt.getMinutes() < 10 ? '0' : '') + dt.getMinutes();
					var hi1 = $('#type').val() == 'url-lookup' ? ($('#query').val() == replays[i].hlsvideosource ? true : false) : false;
					var hi2 = $('#type').val() == 'video-lookup' ? ($('#query').val() == replays[i].vid ? true : false) : false;

					var ls = (replays[i].videolength - Math.round(replays[i].videolength / 60)) % 60, lm = Math.round(replays[i].videolength / 60);
					var length = lm + ':' + (ls < 10 ? '0' : '') + ls;
					var deleted = replays[i].private == true ? '[PRIVATE] ' : '', highlight = hi1 || hi2 ? 'highlight' : '';
					var downloaded = Downloads.hasBeenDownloaded(replays[i].vid) ? 'downloaded' : '';

					var h = `
						<div class="item ${highlight} ${downloaded}">
							<div class="header">${deleted}${replays[i].title}&nbsp;</div>
							<div class="content">
								<div class="meta">
									<div class="width150">
										<span>Posted on:</span>
										${ds}
									</div>
									<div class="width100">
										<span>Length:</span>
										${length}
									</div>
									<div class="width100">
										<span>Views:</span>
										${replays[i].playnumber}
									</div>
									<div class="width100">
										<span>Likes:</span>
										${replays[i].likenum}
									</div>
									<div class="width100">
										<span>Shares:</span>
										${replays[i].sharenum}
									</div>
									<div class="width60">
										<span>Country</span>
										${replays[i].countryCode}
									</div>
									<div class="width400 align-right">
										<a class="button icon icon-play" onClick="playVideo('${replays[i].hlsvideosource}')" title="Play Video"></a>
						`;
					if (replays[i].hlsvideosource.indexOf('liveplay') < 0 && replays[i].hlsvideosource.indexOf('hlslive') < 0) {
						h += `
										<!-- <a class="button icon icon-chat" onClick="openChat('${replays[i].msgfile}', '${replays[i].vtime}', '${replays[i].uname}')" title="View Message History"></a> -->
										<a class="button icon icon-download" onClick="downloadVideo('${replays[i].userid}', '${replays[i].uname}', '${replays[i].vid}', '${replays[i].title.replace("'", "")}', '${replays[i].vtime}', '${replays[i].hlsvideosource}')" title="Download Replay"></a>
						`;
					}
						
					h += `
									</div>
								</div>
							</div>
							<div class="footer">
								<div class="width200">
									<span>Video ID:</span>
									<div class="input has-right-button">
										<input type="text" value="${replays[i].vid}" disabled="disabled">
										<input type="button" class="icon icon-copy" value="" onClick="copyToClipboard('${replays[i].vid}')" title="Copy to Clipboard">
									</div>
								</div>
								<div class="spacer">&nbsp;</div>
								<div class="width700">
									<span>Video URL:</span>
									<div class="input has-right-button">
										<input type="text" value="${replays[i].hlsvideosource}" disabled="disabled">
										<input type="button" class="icon icon-copy" value="" onClick="copyToClipboard('${replays[i].hlsvideosource}')" title="Copy to Clipboard">
									</div>
								</div>
							</div>
						</div>
					`;
					$('#videolist').append(h);	
				}			
			}

			if (current_page == 1 && replays.length == 0) {
				$('.list').html('<div class="empty">No visible replays available for this account.</div>');						
			}

			if (replays.length == MAX_PAGE_SIZE) {
				current_page++;
				getUsersReplays();
			}

		})
		.catch(err => {			
			if (current_page == 1)
				$('.list').html('<div class="empty">No visible replays available for this account.</div>');						
		});
}

function performUsernameSearch() {
	if (current_page == 1) {
		$('main').html('<div id="userlist" class="list"></div>');
	}

	LiveMe.performSearch($('#query').val(), current_page, MAX_PAGE_SIZE, 1 )
		.then(results => {
			for(var i = 0; i < results.length; i++) {
				$('#userlist').append(`
					<div class="item">
						<div class="avatar">
							<img src="${results[i].face}" onerror="this.src='images/blank.png'">
						</div>
						<div class="content">
							<div class="header">${results[i].nickname}&nbsp;</div>
							<div class="meta">
								<div class="width100">
									<span>Level:</span>
									${results[i].level}
								</div>
								<div class="width200">
									<span>User ID:</span>
									<input type="button" class="tiny tiny-160" value="${results[i].user_id}" onClick="showUser('${results[i].user_id}')">
								</div>
								<div class="width100">
									<span>Fans:</span>
									<input type="button" class="tiny tiny-100" value="${results[i].follwer_count}" onClick="showFans('${results[i].user_id}', '${results[i].follower_count}', '${results[i].nickname}')">
								</div>
							</div>
						</div>
					</div>
				`);
			}

			if (results.length == 0) {
				$('.list').html('<div class="empty">No accounts were found matching your search.</div>');						
			}

		})
		.catch(err => {
			console.log(err);
		});	
}

function performHashtagSearch() {
	if (current_page == 1) {
		$('main').html('<div id="videolist" class="list"></div>');
	}

	LiveMe.performSearch($('#query').val(), current_page, MAX_PAGE_SIZE, 2 )
		.then(results => {
			console.log(JSON.stringify(results[0], null, 2));

			for(var i = 0; i < results.length; i++) {
			
				var dt = new Date(results[i].vtime * 1000);
				var ds = (dt.getMonth() + 1) + '-' + dt.getDate() + '-' + dt.getFullYear() + ' ' + (dt.getHours() < 10 ? '0' : '') + dt.getHours() + ':' + (dt.getMinutes() < 10 ? '0' : '') + dt.getMinutes();
				var hi1 = $('#type').val() == 'url-lookup' ? ($('#query').val() == results[i].hlsvideosource ? true : false) : false;
				var hi2 = $('#type').val() == 'video-lookup' ? ($('#query').val() == results[i].vid ? true : false) : false;

				var ll = parseFloat(results[i].videolength), lh = Math.round(ll / 3600), lm = Math.round(ll / 60) % 60, ls = ll % 60;
				var length = lh + ':' + (lm < 10 ? '0' : '') + lm + ':' + (ls < 10 ? '0' : '') + ls;
				var downloaded = Downloads.hasBeenDownloaded(results[i].vid) ? 'downloaded' : '';

				var h = `

					<div class="item ${downloaded}">
						<div class="header">${results[i].title}&nbsp;</div>
						<div class="content">
							<div class="meta">
								<div class="width150">
									<span>Posted on:</span>
									${ds}
								</div>
								<div class="width100">
									<span>Length:</span>
									${length}
								</div>
								<div class="width100">
									<span>Views:</span>
									${results[i].playnumber}
								</div>
								<div class="width100">
									<span>Likes:</span>
									${results[i].likenum}
								</div>
								<div class="width100">
									<span>Shares:</span>
									${results[i].sharenum}
								</div>
								<div class="width60">
									<span>Country</span>
									${results[i].countryCode}
								</div>
								<div class="width400 align-right">
									<a class="button icon icon-play" onClick="playVideo('${results[i].hlsvideosource}')" title="Play Video"></a>
					`;
				if (results[i].hlsvideosource.indexOf('liveplay') < 0 && results[i].hlsvideosource.indexOf('hlslive') < 0) {
					h += `
									<!-- <a class="button icon icon-chat" onClick="openChat('${results[i].msgfile}', '${results[i].vtime}', '${results.uname}')" title="View Message History"></a> -->
									<a class="button icon icon-download" onClick="downloadVideo('${results[i].userid}', '${results.uname}', '${results[i].vid}', '${results[i].title.replace("'", "")}', '${results[i].vtime}', '${results[i].hlsvideosource}')" title="Download Replay"></a>
					`;
				}
					
				h += `
								</div>
							</div>
						</div>
						<div class="footer">
							<div class="width200">
								<span>Video ID:</span>
								<div class="input has-right-button">
									<input type="text" value="${results[i].vid}" disabled="disabled">
									<input type="button" class="icon icon-copy" value="" onClick="copyToClipboard('${results[i].vid}')" title="Copy to Clipboard">
								</div>
							</div>
							<div class="spacer">&nbsp;</div>
							<div class="width700">
								<span>Video URL:</span>
								<div class="input has-right-button">
									<input type="text" value="${results[i].hlsvideosource}" disabled="disabled">
									<input type="button" class="icon icon-copy" value="" onClick="copyToClipboard('${results[i].hlsvideosource}')" title="Copy to Clipboard">
								</div>
							</div>
						</div>
					</div>
				`;

				$('#videolist').append(h);
				
			}

			if (current_page == 1 && results.length == 0) {
				$('.list').html('<div class="empty">No videos were found on LiveMe matching the specified hashtag.</div>');
			}

			if (results.length == MAX_PAGE_SIZE) {
				current_page++;
				performHashtagSearch();
			}

		})
		.catch(err => {
			console.log(err);
		});	
}




function showUser(u) {
	$('#type').val('user-lookup');
	$('#query').val(u);
	beginSearch2();
}

function showFollowing(u,m,n) {
	if (debounced) return;
	debounced = true;
	setTimeout(function(){ debounced = false; }, 500);

	ipcRenderer.send('open-window', { url: 'following.html?'+u+'#'+m+'#'+n });
}

function showFans(u,m,n) {
	if (debounced) return;
	debounced = true;
	setTimeout(function(){ debounced = false; }, 500);

	ipcRenderer.send('open-window', { url: 'fans.html?'+u+'#'+m+'#'+n });
}

function playVideo(u) {
	if (debounced) return;
	debounced = true;
	setTimeout(function(){ debounced = false; }, 500);

	ipcRenderer.send('play-video', { url: u });
}

function downloadVideo(userid, username, videoid, videotitle, videotime, videourl) {
	if (debounced) return;
	debounced = true;
	setTimeout(function(){ debounced = false; }, 500);

	Downloads.add({
		user: {
			id: userid,
			name: username
		},
		video: {
			id: videoid,
			title: videotitle,
			time: videotime,
			url: videourl
		}
	});
}

/*
function openChat(u, t, a) {
	if (debounced) return;
	debounced = true;
	setTimeout(function(){ debounced = false; }, 500);

	ipcRenderer.send('open-chat', { url: u, startTime: t, nickname: a });
}

*/