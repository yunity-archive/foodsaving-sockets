# yunity-sockets

Handles socket.io connections from clients (web, mobile, app, etc...).

It works like this:

- socket.io client connects and makes `authenticate` call with a `sessionId`
- server looks up to see if this session is mapped to a user in redis
  - if so, joins the connection to a `room` for that user id
  - if not, leaves connection open, but will not publish anything to it
- server listens for keyspace events on redis and when a session is added or removed, the room membership is updated accordingly
- server listens for messages sent to redis pubsub channel which contain user ids and message, and pushes messages to appropriate connections

It's intended to be used for one way communications only:

django app --> redis --> yunity-sockets --> client

## sessions vs users vs connections

The three concepts are all independent but related.

When a client connects, this is a connection (or client). There are many of these.

A connection may be associated with a session, multiple connections may share a session (e.g. multiple tabs in a browser). A connection may have no session, in which case the session id is reported as `__nosession__` in the admin http.

A user may be a associated with a session, one user may have multiple sessions (e.g. on their phone, and on their laptop). A session might not have a user id, in which case it will be set to `__nouser__` in the admin http;


## how to run it

```
git clone git@github.com:yunity/yunity-sockets.git
cd yunity-sockets
npm install
node index.js -w 5000 -p 5001
```

This starts socket.io server on port 5000 and admin server on port 5001.


Alternatively if you install it globally with npm install -g, you get an executable on the npm path:

```
yunity-sockets -w 5000 -p 5001
```

## redis sessions

To associate a session with a user id, write to redis with key `session-store-` and the user id as value, e.g.:

```
redis-cli set session-store-mysessionid myuserid
```

### list session/users

You can list session/user pairs with:

```
$ redis-cli --raw keys 'session-store-*' | xargs -n1 -I{} sh -c 'echo -n {}:; redis-cli --raw get {}'
session-store-eerwauvu9314k0swy11wm7pnrgoy442y:79
```

## redis notifications

To send messages to users `PUBLISH` serialized json to key `notifications` with a message like this:

```json
{
  "users": [23, 5, 12],
  "data": {
    "any": "valid",
    "json": "in here"
  }
}
```

E.g.:

```
redis-cli publish notifications '{"users":["user5"],"data":{"a":"b"}}'
```

### Chat messages

Chat messages look like this:

```
{
  "users": [23, 5, 12],
  "data": {
    "type": "chat_message"
    "data": {
      "chat_id": 3434,
      "msesage": {
        "sender": 82,
        "created_at": "2007-12-24T18:21:00.003",
        "type": "TEXT",
        "id": 124624,
        "content": "Hi John, how are you?"
      }
    }
  }
}
```

This will be sent to any connections associated with these users.

## socket.io clients

To connect to server and begin receiving messages, connect as a socket.io client:

```js

var socket = require('socket.io-client')('http://localhost:5000');
var sessionId = 'foo';

socket.on('connect', function(){
  socket.emit('authenticate', { sessionId: sessionId });
});

socket.on('message', function(data){
  console.log('I got a message!', data);
});

```

There is a test command line client included that you can use:

```
node src/client.js sessionname
```

## admin http

The admin http reports all connections/sessions/users:

```
$ curl -s localhost:9080 | jq .
{
  "connections": [
    {
      "connectionId": "kZjaoWHd7dAjTi9FAAAB",
      "sessionId": "mypretendsessionid",
      "userId": "user5",
      "handshake": {
        "headers": {
          "upgrade": "websocket",
          "cache-control": "no-cache",
          "pragma": "no-cache",
          "connection": "keep-alive, Upgrade",
          "cookie": "csrftoken=fPGmNi16HXZSCj7Ij8zwncBnAfZ7FOHU",
          "sec-websocket-key": "MOWVgem1iTClHQutzgwKjg==",
          "sec-websocket-extensions": "permessage-deflate",
          "origin": "http://localhost:8091",
          "sec-websocket-version": "13",
          "accept-encoding": "gzip, deflate",
          "accept-language": "en-US,en;q=0.5",
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "user-agent": "Mozilla/5.0 (X11; Linux x86_64; rv:41.0) Gecko/20100101 Firefox/41.0",
          "host": "localhost:8091"
        },
        "time": "Wed Oct 07 2015 11:11:43 GMT+0200 (CEST)",
        "address": "::ffff:127.0.0.1",
        "xdomain": true,
        "secure": false,
        "issued": 1444209103013,
        "url": "/socket/?EIO=3&transport=websocket",
        "query": {
          "EIO": "3",
          "transport": "websocket"
        }
      }
    },
    {
      "connectionId": "B58Gpt6_n_2sOJ2ZAAAC",
      "sessionId": "mysessionid",
      "userId": "user5",
      "handshake": {
        "headers": {
          "connection": "close",
          "host": "localhost:8091",
          "accept": "*/*",
          "user-agent": "node-XMLHttpRequest"
        },
        "time": "Wed Oct 07 2015 11:11:54 GMT+0200 (CEST)",
        "address": "::ffff:127.0.0.1",
        "xdomain": false,
        "secure": false,
        "issued": 1444209114790,
        "url": "/socket/?EIO=3&transport=polling&t=1444209114743-0&b64=1",
        "query": {
          "EIO": "3",
          "transport": "polling",
          "t": "1444209114743-0",
          "b64": "1"
        }
      }
    }
  ]
}
```
