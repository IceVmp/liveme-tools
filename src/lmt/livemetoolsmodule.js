/*

	  _      _           __  __        _______          _     
	 | |    (_)         |  \/  |      |__   __|        | |    
	 | |     ___   _____| \  / | ___     | | ___   ___ | |___ 
	 | |    | \ \ / / _ \ |\/| |/ _ \    | |/ _ \ / _ \| / __|
	 | |____| |\ V /  __/ |  | |  __/    | | (_) | (_) | \__ \
	 |______|_| \_/ \___|_|  |_|\___|    |_|\___/ \___/|_|___/

													v3.0.0
		
		(c)2017 by TheCoder - Licensed under GPL now


	This is where the magic is...
*/
const request = require('then-request');

var	callback_holder = null, query = '', page_index = 0, return_data = [], index = 0, max_count = 0;
var build_table = [], build_table2 = [];



exports.getuservideos = function(u, cb) {
	query = u;
	callback_holder = cb;
	return_data = {
		userinfo: {
			userid: 0
		},
		videos: []
	};
	_dolookup();
}

exports.searchkeyword = function(k, cb) {
	query = k;
	callback_holder = cb;
	page_index = 1;
	return_data = [];
	_dosearch();
}



/*
	Video Lookup
*/
function _dolookup() {

	request('GET', 'http://live.ksmobile.net/live/getreplayvideos?userid='+query+'&page_size=20&page_index='+page_index).done( function(res){
		var json = JSON.parse(res.getBody());

		if (json.data.video_info !== undefined) {
			for (i = 0; i < json.data.video_info.length; i++) {
				return_data.videos.push({
					url : json.data.video_info[i].hlsvideosource,
					dt :  parseInt(json.data.video_info[i].vtime),
					deleted : false,
					title : json.data.video_info[i].title,
					length : parseInt(json.data.video_info[i].videolength),
					videoid : json.data.video_info[i].vdoid,
					plays : json.data.video_info[i].watchnumber,
					shares : json.data.video_info[i].sharenum,
					likes : json.data.video_info[i].likenum,
					location : { country: json.data.video_info[i].countryCode }
				});
			}
		}

		if (json.data.video_info !== undefined) {
			_dolookup2();
		} else if ((page_index < 20) && (json.data.data_info.length == 20)) {
			page_index++;
			_dolookup();
		} else {
			_dolookup2();			
		}
	});	
}

function _dolookup2() {

	request('GET', 'http://live.ksmobile.net/user/getinfo?userid='+query).done( function(res){
		var json = JSON.parse(res.getBody());

		console.log(json);

		if (json.status != 500) {
			return_data.userinfo = {
				userid: json.data.user.user_info.uid,
				username: json.data.user.user_info.nickname,
				sex: json.data.user.user_info.sex == 0 ? 'female' : 'male',
				usericon: json.data.user.user_info.face,
				level: parseInt(json.data.user.user_info.level),
				following: parseInt(json.data.user.count_info.following_count),
				fans: parseInt(json.data.user.count_info.follower_count)
			}
		}

		callback_holder(return_data);	

	});	

}





/*
	User Lookup Search
*/
function _dosearch() {

	request('GET', 'http://live.ksmobile.net/search/searchkeyword?keyword='+encodeURI(query)+'&page_size=10&page_index='+page_index).done( function(res){
		var json = JSON.parse(res.getBody());

		for (i = 0; i < json.data.data_info.length; i++) {
			return_data.push({
				userid : json.data.data_info[i].user_id
			});
		}

		if (page_index < 3) {
			page_index++;
			_dosearch();
		} else {
			index = 0;
			max_count = return_data.length - 1;
			_dosearch2();			
		}
	});
}

function _dosearch2() {

	request('GET', 'http://live.ksmobile.net/user/getinfo?userid='+return_data[index].userid).done( function(res){
		var json = JSON.parse(res.getBody());

		return_data[index] = {
				userid: json.data.user.user_info.uid,
				nickname: json.data.user.user_info.nickname,
				sex: json.data.user.user_info.sex == 0 ? 'female' : 'male',
				thumb: json.data.user.user_info.face,
				level: parseInt(json.data.user.user_info.level),
				followings: parseInt(json.data.user.count_info.following_count),
				fans: parseInt(json.data.user.count_info.follower_count),
				videos : [],
				videosplus : false
		};

		if (index < max_count) {
			index++;
			_dosearch2();
		} else {
			index = 0;
			_dosearch3();
		}

	});
}

function _dosearch3() {

	request('GET', 'http://live.ksmobile.net/live/getreplayvideos?userid='+return_data[index].userid+'&page_index=1&page_size=12').done( function(res){
		var json = JSON.parse(res.getBody());

		var max = json.data.video_info.length;
		if (max > 10) max = 10;
		for (i = 0; i < max; i++) {
			return_data[index].videos.push({
				url: json.data.video_info[i].hlsvideosource,
				dt: parseInt(json.data.video_info[i].vtime),
				length: parseInt(json.data.video_info[i].videolength),
				videoid: json.data.video_info[i].vdoid,
				title: json.data.video_info[i].title,
				views: json.data.video_info[i].watchnumber,
				plays: json.data.video_info[i].playnumber,
				likes: json.data.video_info[i].likenum,
				shares: json.data.video_info[i].sharenum,
				location: { country : json.data.video_info[i].countryCode }
			});
		}
		return_data[index].videosplus = json.data.video_info.length > 10 ? true : false;

		if (index < max_count) {
			index++;
			_dosearch3();
		} else {
			callback_holder({ data: return_data });
		}
	});

}

