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

var io = require('socket.io')();

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

    logger.info('client', socket.id, 'connected', socket.handshake);

    // when they emit an authenticate message, check they are ok

    socket.on('authenticate', function(data) {

        logger.info('client', socket.id, 'authenticating', data);

        socket.data.sessionId = data.sessionId;

        getUserIdFor(data.sessionId, function(err, userId) {
            if (err) {
                logger.info('client', socket.id, 'session', data.sessionId, 'has no logged-in user');
                return;
            }
            socket.data.userId = userId;
            var room = roomFor(userId);
            logger.info('client', socket.id, 'authenticated! joining [' + room + ']');
            socket.join(room);
        });

    });

    socket.on('disconnect', function() {
        logger.info('client', socket.id, 'disconnected');
        logger.info('connection count', io.sockets.sockets.length);
    });

});

/*

    subscribe redis to listen for messages on the notification channel

    these will then be pushed to the relevent users

    the content is a json object like:

        {
            "users": [43, 35, 35],
            "data": {
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
            } else if (message.data === undefined) {
                logger.info('discarding message as it does not specify data', message);
                return;
            } else {
                var data = JSON.stringify(message.data);
                logger.info('publishing [' + data + ']', 'to users', message.users.join(','));
                message.users.forEach(function(userId){
                    console.log('publishing to', roomFor(userId));
                    io.to(roomFor(userId)).emit(SOCKETIO_CHANNEL, data);
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

            io.sockets.sockets.forEach(function(socket){
                if (socket.data.sessionId === sessionId && socket.data.userId !== userId) {
                    logger.info('client', socket.id, 'logged in as ', userId);
                    socket.data.userId = userId;
                    logger.info('client', socket.id, 'authenticated! joining [' + room + ']');
                    socket.join(room);
                }
            });

        });

    } else if (action === 'del') {

        logger.info('session', sessionId, 'ended');

        // find any sockets with this session

        io.sockets.sockets.forEach(function(socket){
            if (socket.data.sessionId === sessionId) {
                logger.info('client', socket.id, 'session', sessionId, 'ended, disconnecting from user', socket.data.userId);
                delete socket.data.userId;
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
