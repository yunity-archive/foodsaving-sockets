var argv = require('yargs')
    .usage('Usage: $0 -w [websocket port] -p [http admin port]')
    .demand(['w','p'])
    .describe('w', 'Websocket port')
    .describe('p', 'HTTP admin port')
    .argv;

var REDIS_NOTIFICATION_CHANNEL = 'notifications';
var REDIS_SESSION_PREFIX = 'session-store-';
var REDIS_KEYSPACE_CHANNEL = '__keyspace@0__:' + REDIS_SESSION_PREFIX + '*';
var WEBSOCKET_PORT = argv.w;
var HTTP_ADMIN_PORT = argv.p;
var SOCKETIO_CHANNEL = 'message';

var io = require('socket.io')({
    path: '/socket',
    serveClient: false
});

io.listSockets = function(){
    var s = io.sockets.sockets;
    if (isarray(s)) {
        return s;
    } else {
        return Object.keys(io.sockets.sockets).map(function(k){
            return io.sockets.sockets[k];
        });
    }
};

var adminServer = require('./admin-server')(io);

var redis = require('redis').createClient();
var redisSubscriber = require('redis').createClient();

redisSubscriber.config('SET', 'notify-keyspace-events', 'KA');

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

logger.info('starting');

/*

    incoming websocket connections arrive here

    the client needs to send an "authenticate" message with:

        {
            "sessionId" : "<some session id>"
        }

    we check redis to see if we have a session/userid registered
    for this. otherwise we just leave the connection open, and hook it
    up later if we get notified from redis.

*/

io.on('connection', function(socket) {

    socket.data = {};

    logger.info('connection', socket.id, 'connected', socket.handshake);

    // when they emit an authenticate message, check they are ok

    socket.on('authenticate', function(data) {

        logger.info('connection', socket.id, 'authenticating', data);

        socket.data.sessionId = data.sessionId;

        getUserIdFor(data.sessionId, function(err, userId) {
            if (err) {
                logger.info('connection', socket.id, 'session', data.sessionId, 'has no logged-in user');
                return;
            }
            updateSocketUser(socket, userId);
        });

    });

    socket.on('disconnect', function() {
        logger.info('connection', socket.id, 'disconnected');
        logger.info('connection count', io.listSockets().length);
    });

});

function updateSocketUser(socket, userId) {
    
    if (userId && socket.data.userId !== userId) {
        var joinRoom = roomFor(userId);
        logger.info('connection', socket.id, 'joining [' + joinRoom + ']');
        socket.join(joinRoom);
    }

    if (socket.data.userId !== undefined && 
        socket.data.userId !== userId) {
        var leaveRoom = roomFor(socket.data.userId);
        logger.info('connection', socket.id, 'leaving [' + leaveRoom + ']');
        socket.leave(leaveRoom);
    }

    socket.data.userId = userId;
}

/*

    subscribe redis to listen for messages on the notification channel

    these will then be pushed to the relevent users

    the content is a json object like:

        {
            "users": [43, 35, 35],
            "type": "some_message_type",
            "payload": {
                "stuff" : "for",
                "the"   : "users"
            }
        }

*/


redisSubscriber.subscribe(REDIS_NOTIFICATION_CHANNEL);
logger.info('subscribed to redis channel', REDIS_NOTIFICATION_CHANNEL);

redisSubscriber.on('message', function(channel, str) {
    if (channel === REDIS_NOTIFICATION_CHANNEL) {
        try {
            var message = JSON.parse(str);
            if (message.users === undefined || message.users.constructor !== Array) {
                logger.info('discarding message as it does not specify a user array', message);
                return;
            } else if (message.payload === undefined) {
                logger.info('discarding message as it does not have a payload', message);
                return;
            } else {
                var users = message.users;
                delete message.users; // the remaining fields go to each user
                logger.info('publishing [', message, ']', 'to users', users.join(','));
                users.forEach(function(userId){
                    console.log('publishing to', roomFor(userId));
                    io.to(roomFor(userId)).emit(SOCKETIO_CHANNEL, message);
                });
            }
        } catch (e) {
            logger.error('failed to parsed json from redis [' + str + ']', e.message);
        }
    } else {
        logger.info('got message on unknown channel', channel, str);
    }
});

/*

    we listen for key events on redis so that we can:

        1) know when when a session/userid pair is added to redis
        2) know when a session is removed from redis

*/

redisSubscriber.psubscribe(REDIS_KEYSPACE_CHANNEL);
logger.info('subscribed to redis channel', REDIS_KEYSPACE_CHANNEL);

redisSubscriber.on('pmessage', function(pattern, channel, action){
    var m = new RegExp(':' + REDIS_SESSION_PREFIX + '(.*)$').exec(channel);
    if (!m) return;
    var sessionId = m[1];
    if (action === 'set') {

        getUserIdFor(sessionId, function(err, userId){
            if (err) return logger.error(err);

            logger.info('got notification that user logged in', sessionId, userId);

            var room = roomFor(userId);

            io.listSockets().forEach(function(socket){
                if (socket.data.sessionId === sessionId) {
                    updateSocketUser(socket, userId);
                }
            });

        });

    } else if (action === 'del' || action === 'expired') {

        logger.info('session', sessionId, 'ended');

        // find any sockets with this session

        io.listSockets().forEach(function(socket){
            if (socket.data.sessionId === sessionId) {
                //logger.info('connection', socket.id, 'session', sessionId, 'ended, disconnecting from user', socket.data.userId);
                updateSocketUser(socket, undefined);
                socket.data.sessionId = undefined;
            }
        });

    }
});

// listen!

io.listen(WEBSOCKET_PORT);
adminServer.listen(HTTP_ADMIN_PORT);

logger.info('websocket listening on', WEBSOCKET_PORT);
logger.info('http admin server listening on', HTTP_ADMIN_PORT);

// utility functions

function getUserIdFor(sessionId, callback) {
    redis.get(REDIS_SESSION_PREFIX + sessionId, function(err, userId){
        if (err) return callback(err);
        if (!userId) return callback(new Error('no session found for [' + sessionId + ']'));
        callback(null, userId);
    });
}

function roomFor(userId) {
    return 'room:' + userId;
}

// based on https://github.com/juliangruber/isarray/blob/master/index.js
function isarray(arr) {
  return {}.toString.call(arr) == '[object Array]';
}
