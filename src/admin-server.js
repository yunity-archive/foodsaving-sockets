var express = require('express');

module.exports = function(io) {

  var app = express();

  app.get('/', function(req, res){
    var users = {};
    io.sockets.sockets.forEach(function(socket){
      var data = socket.data;
      var userId = data.userId || '__anonymous__';
      var sessionId = data.sessionId || '__nosession__';
      if (!users[userId]) users[userId] = {};
      if (!users[userId][sessionId]) users[userId][sessionId] = [];
      users[userId][sessionId].push({
        clientId: socket.id,
        handshake: socket.handshake
      });
    });
    res.send({ users: users });
  });

  return app;
}