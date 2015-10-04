var url = 'http://localhost:5000';
var socket = require('socket.io-client')(url);

var winston = require('winston');
var logger = new winston.Logger({
    transports: [
      new (winston.transports.Console)({ 
        timestamp: function() {
          return new Date().toISOString();
        }
      })
    ]
});

var sessionId = 'sessionfoo';

socket.on('connect', function(){
  logger.info('socket connected to', url);
  socket.emit('authenticate', { sessionId: sessionId });
});

socket.on('message', function(data){
  logger.info('recv', data);
});