#!/usr/bin/env node

var amqp     = require('amqplib');
var configs  = require('../config/configs.js');

var mongoose = require('mongoose');
var User     = require('../models/user.js');
var Service  = require('../models/service.js');
var _        = require('underscore');

//var logger   = require('../modules/logger.js')('workEmmit', configs.logs.emmiter);
var logger  = require('../modules/logger.js');

var intervals = [];
var total_services = [];
// kjo duhet bo me .then()
var workEmmiter = require('../modules/emmiter.js');

function scheduler(taskList){
  logger('info','Hyme ne scheduler');
  taskList.forEach(function(task){
    var randInt = task.interval*1000+_.random(1000, 5000);
    logger('info','Creating interval with ID ' + task._id);
    //TODO: kjo duhet me .then qe te mos ta bukosim queuen OSE
    // me limit OSE
    // me IP rotation
    //if(task.interval > 180){
    //  workEmmiter(task,'all_checks');
    //}
    intervals[task._id] = setInterval(function(task) {
      logger('info','[scheduler ] Po monitorojme '+ task.name);
      logger('info','[scheduler ] Me interval '+ randInt);
      //workEmmiter(task,'all_checks');
      workEmmiter(task,'service_checks');
    }, randInt, task);
  });
}

function DbUpdateServices () {

  mongoose.connect(configs.mongodb.url);
  logger('info','Duke marre nga DB');

  Service.find({running_status : true}, function(err, services) {
    //TODO: po kur nuk gje gjo ?
    logger('debug',services);
    scheduler(services);
    mongoose.connection.close();
  });
}

function startInterval (rabbit_task) {
  //if(configs.debug) console.log(services);
  var randomInt = rabbit_task.interval*1000+_.random(1000, 5000);
  clearInterval(intervals[rabbit_task._id]);
  if(rabbit_task.running_status == true){
    logger('info','Creating interval with ID ' + rabbit_task._id);
    intervals[rabbit_task._id] = setInterval(function(rabbit_task) {
      //let's emmit the work on RabbitMQ
      logger('info','[start interval ] Po monitorojme '+ rabbit_task.name);
      logger('info','[start interval ] Me interval '+ randomInt);
      //workEmmiter(rabbit_task,'all_checks');
      workEmmiter(rabbit_task,'service_checks');
      //if(configs.debug) console.log(task);
    }, randomInt , rabbit_task);
  }
}



DbUpdateServices();

amqp.connect(configs.rabbitmq.url).then(function(conn) {
  process.once('SIGINT', function() { conn.close(); });
  return conn.createChannel().then(function(ch) {

    var ok = ch.assertQueue('service_updates', {durable: false});
    // todo : error catching per kur nuk lidhet queueja
    ok = ok.then(function(_qok) {
      return ch.consume('service_updates', function(msg) {
        logger('info',' [x] Received a service update task');
        var toCheck = JSON.parse(msg.content.toString());
        //if(configs.debug) console.log(toCheck);
        startInterval(toCheck);
        //workEmmiter(toCheck,'all_checks');
        workEmmiter(toCheck,'service_checks');
        //if(configs.debug) console.log(msg);
      }, {noAck: true});
    }).catch(function (err){
      logger('error',err);
      process.exit(1);
    });


    // TODO: handle the errors here and catch the .exit(1); its ugly, its bad and I should feel bad
    return ok.then(function (consumeOk) {
      logger('info',' [*] Waiting for messages. To exit press CTRL+C');
    }).catch(function (err){
      logger('error',err);
      process.exit(1);
    });
  }).catch(function (err){
    logger('error',err);
    process.exit(1);
  });
}).then(null, logger('info',console.warn)).catch(function (err){
  logger('error',err);
  process.exit(1);
});