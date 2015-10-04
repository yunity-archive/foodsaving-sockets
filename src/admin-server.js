var express = require('express');

module.exports = function(io) {

  var app = express();

  app.get('/', function(req, res){
    var connections = io.sockets.sockets.map(function(socket){
      var data = socket.data || {};
      return {
        connectionId: socket.id,
        sessionId: data.sessionId,
        userId: data.userId,
        handshake: socket.handshake
      };
    });
    res.send({ connections: connections });
  });

  return app;
}