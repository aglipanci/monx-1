var configs = require('../config/configs.js');
var amqp    = require('amqplib');
var logger  = require('../modules/logger.js')('workProcessor', configs.logs.processor);
//var logger  = require('../modules/logger.js');


//var checkRBL = require('../modules/checkBlacklist.js');
var checkHttpStatus = require('../modules/checkHttpStatus.js');
var workEmmiter  = require('../modules/emmiter.js');

//var checkPing = require('../modules/checkPing.js');
var request = require('request');
var http = require('http');

// TODO: error handling post to api


// per tu shtu: ------
// throttle (kjo behet ne vend tjeter faktikisht)

// web analysis per te identifiku sensoret automatikisht
// tipit
// dns, web, match, snmpt,pop, etj..

amqp.connect(configs.rabbitmq.url).then(function(conn) {
	process.once('SIGINT', function() { conn.close(); });
	return conn.createChannel().then(function(ch) {

		var ok = ch.assertQueue('all_checks', {durable: false});
		// todo : error catching per kur nuk lidhet queueja
		ok = ok.then(function(_qok) {
			return ch.consume('all_checks', function(msg) {
				logger('info',' [x] Received a task');
				var toCheck = JSON.parse(msg.content.toString());
				//if(configs.debug) console.log(toCheck);
				logger('info',toCheck);
				processWork(toCheck);
			}, {noAck: true});
		});

		return ok.then(function(_consumeOk) {
			logger('info',' [*] Waiting for messages. To exit press CTRL+C');
		});
	});
}).then(null, logger('info',console.warn)).catch(function (err) {
	logger('error', err);
	process.exit(1);
});


// atm here we have only blacklist_check but this eventually will be extended
// with port scan, ssl check, smtp, ping and other stuff like that

function processWork(tC,callback){
	logger('info','Got type: ' + tC.type);
	if(tC.type === "blacklist"){
		monxBlacklist(tC);
	}
	if(tC.type === "http_status"){
		monxHttpStatus(tC);
	}
	if(tC.type === "icmp_ping"){
		monxPing(tC);
	}
	if(tC.type === "api_route_check"){
		// kontrollo 3-4 URL ne grup te nje API
	}
	if(tC.type === "api_response_time"){
		//monxPing(tC);
	}
}


/**
 *
 * @param data
 */
function postToAPI (data) {
	//TODO https if
	logger('info', 'Posting data to API');
	logger('info', data);
	//if(configs.debug) console.log('Data received', data);
	var options = {
		uri: configs.api_url + 'service-data/add',
		//headers: { 'Content-Type': 'application/json', },
		method: 'POST',
		agent: new http.Agent({keepAlive:false}),
		json: {
			data : {
				message: data.message,
				status: data.status,
				service_id: data.service_id,
				user: data.user,
				status_code: data.status_code,
				name: data.name
			}
		}
	};
	if(data.dump != null){
		logger('info', 'Adding content to API Call');
		options.json.data.content = data.dump;
	}
	else{
		logger('info', 'No HTML error content added to API call ');
	}

	request(options, function(error, response, body){
		if(error) {
			logger('error','Got error while posting data to API !');
			logger('error',error);
		} else {
			logger('info','Data posted to API!');
			logger('info',response.statusCode);
		}
	});
}

// http status module
function monxHttpStatus(httpStatObject){
	// duhet taru timeouti	
	checkHttpStatus(httpStatObject, 8000, function (data) {
		// duhet fut timeout si parameter jareby
		//double check here
		//TODO: duhet ripare llogjika e ksaj ndoshta duhet me .then 
		if(data.status === 'ERROR'){
			checkHttpStatus(httpStatObject, 8000, function (rechecked_data) {
				console.log('PO RIKONTROLLOHET'); // me logger kjo kur ta tarosh
				rechecked_data['service_id'] = httpStatObject._id;
				rechecked_data['name'] = httpStatObject.name;
				
				console.log('CURRENT RECHECKER DATA'); // me logger kjo kur ta tarosh
				console.log(httpStatObject); // me logger kjo kur ta tarosh
				if(httpStatObject.interval > 60 && rechecked_data.status === 'ERROR'){
						httpStatObject.interval = 60;
						console.log('UPDATING DATA TO SERVICEEEEEEE')
						workEmmiter(httpStatObject,'service_updates');
				}
				else if(rechecked_data.status === 'OK' && httpStatObject.interval === 60 && httpStatObject.options.original_interval !== 60){
						httpStatObject.interval = httpStatObject.options.original_interval;
						workEmmiter(httpStatObject,'service_updates');
				}
				postToAPI(rechecked_data, function (err) {
					if (err) {
						logger('error', err);
					} else {
						logger('info', 'Data posted!');
					}
				}, 3000);
			});
		} else {
			console.log(data);
			data['service_id'] = httpStatObject._id;
			data['name'] = httpStatObject.name;
			postToAPI(data, function (err) {
				if (err) {
					logger('error', err);
				} else {
					logger('info', 'Data posted!');
				}
			}, 3000);
		}
	});
}

function monxPing(pingStatObject){
	// // duhet taru timeouti
	// checkPing(pingStatObject.host, 2000, function (data) {
	// 	// duhet fut timeout
	// 	console.log(data);
	// 	data['service_id'] = pingStatObject._id;
	// 	data['name'] = pingStatObject.name;
	// 	postToAPI(data, function (err) {
	// 		if (err) {
	// 			logger('error', err);
	// 		} else {
	// 			logger('info', 'Data posted!');
	// 		}
	// 	}, 3000);
	// });
}


// blacklist module
function monxBlacklist(blacklistObject){
	checkRBL(blacklistObject.host, 80000, function(totalResults){
		logger('info','Scan finished for: ' + blacklistObject.host);
		//if(configs.debug) console.log('Result: ', results);
		var blackStatus = [];
		var timeoutStatus = [];
		var cleanStatus = [];
		var stat = 'OK';
		//The logic for the status to be handled
		for (var i = totalResults.length - 1; i >= 0; i--) {
			if(totalResults[i]['status'] > 0){
				if(totalResults[i]['status'] == 1){
					stat = 'ERROR';
					blackStatus.push(totalResults[i]);
				}
				if(totalResults[i]['status'] == 2){
					timeoutStatus.push(totalResults[i]);
				}
			}
			else{
				cleanStatus.push(totalResults[i]);
			}
			logger('info',totalResults[i]);
		}

		var data = {
			message: {
				listed : blackStatus,
				timeout: timeoutStatus,
				clean: cleanStatus
			},
			status_code: '-30',
			status: stat,
			service_id: blacklistObject._id,
			user: blacklistObject.user
		};
		if (data.status === 'OK') {
			data.status_code = '-35';
		}

		postToAPI(data, function(err) {
			if(err){
				logger('error',err);
			} else {
				logger('info','Data posted!');
			}
		}, 3000);
	});
}
