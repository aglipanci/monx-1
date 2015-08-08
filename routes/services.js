var express     = require('express');
var router      = express.Router();
var dns         = require('dns');
var checkRBL    = require('../modules/checkBlacklist.js');
var Service     = require('../models/service.js');
var ServiceData = require('../models/service_data.js');
var Notification = require('../models/notification.js');
var configs = require('../config/configs.js');
var m  = require('../middlewares/middlewares.js');
var util        = require('util');
var logger      = require('../modules/logger.js');

router.get('/index', function(req, res){

  var user = req.user;
  // TODO: LIMIT / PAGINATION ?
// TODO:  getaddrinfo ENOTFOUND ds031882.mongolab.com ?? (nuk lidhemi dot me db dmth)
  Service.find({ user: user._id }, function(err, services) {
    
    if(!err) {
      res.render('services/index', { services: services });
    }

  });

});

router.get('/add', function(req, res){
	res.render('services/add');
});

router.get('/:id/events/:event_id', function(req, res){
	// TODO : validation
	var serviceData = require('../models/service_data.js')(req.params.id);
	console.log('Service id ' + req.params.id);
	console.log('Event id ' + req.params.event_id);
	serviceData.findOne({_id: req.params.event_id}, function(err, data) {
			if(!err) {
				//res.setHeader('Content-Type', 'application/json');
				console.log(data);
				res.end(JSON.stringify(data));
				//res.render('services/data', {data : data});
			} else {
				logger.debug(err);
				// res.flash('error_messages', 'No data for this service');
		  //   return res.redirect('/services/index');
		  		res.end('error');
			}

		});

//	res.end('nuk u gjet gje');
});

router.get('/notifications', function(req, res) {
	var service_id = req.params.id;
	Notification.find({user: req.user} ,function(err, notifics) {
			if(!err && notifics) {
				// res.setHeader('Content-Type', 'application/json');
			 //  res.end(JSON.stringify(notifics));
				// console.log(notifics);
				res.render('services/notifics', {notifications : notifics});
			} else {
				logger.debug(err);
				res.flash('error_messages', 'No notifications for this service');
		    return res.redirect('/services/index');
			}
		});
});


router.get('/:id/edit', m.hasServiceAccess, function(req, res){
	//verifikim per fiksim ID
	Service.findOne({_id: req.params.id}, function (err, service) {
			if(err){
				res.end('No service found');
			}
		res.render('services/edit', {service : service});
	});	
});



router.post('/:id/edit', m.hasServiceAccess, function(req, res){

	  		  //TODO fix messages
	  		  //TODO validation
  req.check('id', 'Service ID is required').notEmpty();
  req.check('name', 'Service name is required').notEmpty();
  req.check('host', 'Your name is required').notEmpty();
  req.check('type', 'A valid type is required').notEmpty();
  req.check('interval', 'The interval is required').notEmpty();

	var errors = req.validationErrors();

	  if(errors){   //No errors were found.  Passed Validation!
	    req.flash('error_messages', errors);
	    return res.redirect('/services/' + req.params.id + '/edit');
	  }
	Service.findOne({_id:req.params.id}, function(err, service){

  	service.name = req.body.name;
  	service.host = req.body.host;
  	service.type = req.body.type;
  	service.interval = req.body.interval;
  	service.running_status = req.body.running_status != '' ? true : false;

		  service.save(function(err) {
		     if(err) {
		     	logger.debug('There was an error saving the service', err);
		      req.flash('error_messages', 'There was an error saving the service');
		      res.redirect('/services/index');
		     } else {
		     	logger.debug('Service updated!');
		      req.flash('success_messages', 'Service updated.');
		      res.redirect('/services/index');
		     }
		  });
	});
});

router.get('/:id/delete', m.hasServiceAccess, function(req, res){
  //TODO: validations
  Service.findOne({_id:req.params.id}).remove(function(){

    var serviceData = ServiceData(req.params.id);

    //TODO: delete collection
    serviceData.remove(function(){
      req.flash('success_messages', 'Service deleted.');
      res.redirect('/services/index');
    });

  });

});

router.get('/:id/action/:action', m.hasServiceAccess, function(req, res){
	// TODO validation 
	var action = req.params.action;

	Service.findOne({_id:req.params.id}, function(err, service){
		// ACTIONS: stop, mute, 
	  if(!err){

	  	switch(action) {
	  		case 'start_stop':

	  			var new_status = service.running_status ? false : true;

	  			service.running_status = new_status;

	  			service.save(function(err) {
			     if(err) {
			     	res.json({success:0});
			     } else {
			     	res.json({success:1, new_status: new_status});
			     }
			 	});

	  			break;
	  		case 'mute_unmute':
	  			break;
        default:
          res.json({success:0});
        break;
	  	}
	  }
	});
});



router.get('/:id/data/page/:page?', service_data);
router.get('/:id/data', service_data);
function service_data(req, res) {
	var service_id = req.params.id;
	var page = req.params.page;
	var limit = 10;

	if(!page) {
		page = 1;
	}

	var skip = ( page - 1 ) * limit; 

	console.log('aaaaaaaaaaaaaaaaaaaaaaaaaaa');
	console.log(skip);
	
//  { skip: 10, limit: 5 }, 
//MyModel.find(query, fields, { skip: 10, limit: 5 }, function(err, results) { ... });

	var serviceData = require('../models/service_data.js')(service_id);
	serviceData.count({}, function(err, count){
		var pages = count / limit;
		var rounded_pages = Math.round(pages);
		if(pages > rounded_pages) {
			pages = Math.round(pages + 1);
		}	else {
			pages = Math.round(pages);
		}
		console.log(pages);	
	});
	serviceData.find({}, {}, { skip: skip, limit: limit, sort: { 'created_at' : -1 } }, function(err, data) {
			if(!err && data) {
				//res.setHeader('Content-Type', 'application/json');
				//res.end(JSON.stringify(data));
				console.log(data);
				res.render('services/data', {data : data});
			} else {
				logger.debug(err);
				res.flash('error_messages', 'No data for this service');
		    return res.redirect('/services/index');
			}

		});
		
}


//router.post('/:id/edit', m.hasServiceAccess, function(req, res){
// ket e kaluam lart te actioni   
//});

router.get('/:id', function(req, res) {
// ktu duhet marre thjesht configurimi total i atij sherbimi 
	Service.findOne({_id:req.params.id}, function(err, service){
		if(err) {
			logger.debug('There was an error saving the service', err);
		} else {
			res.render('services/view', {service : service});
	  	// service.name 
	  	// service.host ;
	  	// service.type ;
	  	// service.interval 
	  	// service.status 
		}	
	});
});



router.post('/add', function(req, res){
  
  //TODO fix messages
  req.check('name', 'Service name is required').notEmpty();
  req.check('host', 'Your name is required').notEmpty();
  req.check('type', 'A valid email is required').notEmpty();
  req.check('interval', 'The password is required').notEmpty();
  req.check('status', 'The password confirmation is required').notEmpty();

  var errors = req.validationErrors();

  if(errors){   //No errors were found.  Passed Validation!
    req.flash('error_messages', errors);
    return res.redirect('/services/add');
  }   

	var newService = new Service();

    newService.name = req.body.name;
    newService.host = req.body.host;
    newService.type = req.body.type;
    newService.interval = req.body.interval;

    newService.user = req.user;
   
    newService.save(function(err) {
       if(err) {
       	logger.debug('There was an error saving the service', err);
       } else {
       	logger.debug('The new service was saved!');
        req.flash('success_messages', 'Service added.');
        res.redirect('/services/index');
       }
    });
    
});

router.post('/mx', function(req, res){
	"use strict";
	var domain = req.body.domain;
	dns.resolveMx(domain, function(error, addr) {

		if(error) {
			logger.debug(error);
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({'success': 0, 'message': 'No mx records'}));
		} else {
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify(addr));
		}
	});
});

router.post('/blacklist', function(req, res){

	var domain = req.body.domain;
	logger.debug('routi');
	checkRBL(domain, function(server_result){
		logger.debug(server_result);
		res.setHeader('Content-Type', 'application/json');
		res.end(JSON.stringify(server_result));
	});

});


module.exports = router;