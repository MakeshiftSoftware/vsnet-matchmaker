/* eslint-disable prefer-arrow-callback */
const WebSocket = require('uws');
const url = require('url');
const qs = require('query-string');
const jwt = require('jsonwebtoken');
const Redstore = require('./redstore');
const Redpub = require('./redpub');

function noop() {}

const defaults = {
  pingInterval: 30000
};

const Event = {
  CONNECTION: 'connection',
  CLOSE: 'close',
  MESSAGE: 'message',
  PONG: 'pong'
};

const MessageProp = {
  TYPE: 't',
  DATA: 'd',
  RECIPIENT: 'r'
};

const PUBSUB_CHANNEL = 'global';

class VsSocket {
  /**
   * Initialize socket server.
   *
   * @param {Object} options - Server options
   */
  constructor(options) {
    this.users = {};
    this.handlers = {};
    this.options = Object.assign({}, defaults, options);

    if (this.options.store) {
      this.initStore(this.options.store);
    }

    if (this.options.pubsub) {
      this.initPubsub(this.options.pubsub);
    }

    this.wss = new WebSocket.Server({
      port: this.options.port,
      verifyClient: this.verifyClient(this.options.secret)
    });

    this.wss.on(Event.CONNECTION, this.onClientConnected.bind(this));
  }

  /**
   * Initialize store connection.
   *
   * @param {String} url - Store connection url
   */
  initStore(url) {
    this.store = new Redstore(url);
  }

  /**
   * Initialize pubsub connection.
   *
   * @param {String} url - Pubsub connection url
   */
  initPubsub(url) {
    this.pubsub = new Redpub(url);
    this.pubsub.subscribe(PUBSUB_CHANNEL);
    this.pubsub.on(Event.MESSAGE, function(channel, message) {
      const m = this.parseMessage(message);

      if (m && m.data && m.recipient) {
        if (Array.isArray(m.recipient)) {
          this.relayMulti(m.data, m.recipient);
        } else {
          this.relaySingle(m.data, m.recipient);
        }
      }
    });
  }

  /**
   * Start server.
   *
   * @param {Function} cb - Callback function
   */
  start(cb) {
    setInterval(this.ping.bind(this), this.options.pingInterval);

    if (cb) {
      cb();
    }
  }

  /**
   * Stop server.
   *
   * @param {Function} cb - Callback function
   */
  async stop(cb) {
    try {
      await this.pubsub.close();

      if (this.store) {
        await this.store.close();
      }

      cb();
    } catch (err) {
      cb(err);
    }
  }

  /**
   * Authenticate connection request using jwt.
   *
   * @param {Object} info - Request data
   * @param {Function} cb - Callback function
   */
  verifyClient(secret) {
    return function(info, cb) {
      const token = qs.parse(url.parse(info.req.url).search).token;

      if (!token) {
        return cb(false);
      }

      jwt.verify(token, secret, function(err, decoded) {
        if (err) {
          cb(false);
        } else {
          info.req.user = decoded;
          cb(true);
        }
      });
    };
  }

  /**
   * Client connected handler.
   *
   * @param {Object} socket - Socket object
   */
  onClientConnected(socket) {
    const server = this;
    const { user } = socket.upgradeReq;

    if (!user || !user.id) {
      return socket.terminate();
    }

    socket.id = user.id;
    server.users[user.id] = socket;
    socket.isAlive = true;

    socket.on(Event.PONG, function() {
      socket.isAlive = true;
    });

    socket.on(Event.MESSAGE, function(message) {
      server.onMessageReceived(message, socket);
    });

    socket.on(Event.CLOSE, function() {
      server.onClientDisconnected(socket);
    });

    if (server.handlers.connected) {
      server.handlers.connected(null, socket);
    }

    console.log('Client %s connected', user.id); // eslint-disable-line
  }

  /**
   * Client disconnected handler.
   *
   * @param {Object} socket - Socket object
   */
  onClientDisconnected(socket) {
    const server = this;

    delete this.users[socket.id];

    if (server.handlers.disconnected) {
      server.handlers.disconnected(null, socket);
    }

    console.log('Client %s disconnected', socket.id); // eslint-disable-line
  }

  /**
   * Register callback function for an event.
   *
   * @param {String} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    this.handlers[event] = callback;
  }

  /**
   * Ping sockets to check if they are alive.
   * TODO: attach custom handler for cleanup
   */
  ping() {
    const server = this;

    for (let i = 0; i < server.wss.clients.length; ++i) {
      const socket = server.wss.clients[i];

      if (socket.isAlive === false) {
        delete server.users[socket.id];
        return socket.terminate();
      }

      socket.isAlive = false;
      socket.ping(noop);
    }
  }

  /**
   * Message received handler.
   *
   * @param {String} message - Message json
   * @param {Object} socket - Socket object
   */
  onMessageReceived(message, socket) {
    console.log('Received message from client:', message);  // eslint-disable-line
    const m = this.parseMessage(message);

    if (m) {
      const handler = this.handlers[m.type];

      if (handler) {
        handler(m, socket);
      }
    }
  }

  /**
   * Parse incoming socket message.
   *
   * @param {String} message - Socket message
   */
  parseMessage(message) {
    let m;

    try {
      m = JSON.parse(message);
    } catch (e) {
      return;
    }

    return {
      type: m[MessageProp.TYPE],
      data: m[MessageProp.DATA],
      recipient: m[MessageProp.RECIPIENT]
    };
  }

  /**
   * Publish message
   *
   * @param {Object} m - Message object
   */
  publishMessage(m) {
    this.pubsub.publish(PUBSUB_CHANNEL, JSON.stringify(m));
  }

  /**
   * Send message to player.
   *
   * @param {(String|Object)} message - The message string or object
   * @param {Object} socket - The socket object
   */
  sendMessage(message, socket) {
    if (typeof message === 'object') {
      socket.send(JSON.stringify(message));
    } else {
      socket.send(message);
    }
  }

  /**
   * Send message to a single user by player id.
   *
   * @param {Object} data - Message data
   * @param {String} id - Player id
   */
  relaySingle(data, id) {
    const socket = this.users[id];

    if (socket) {
      this.sendMessage(data, socket);
    }
  }

  /**
   * Send message to multiple users using an array of player ids.
   *
   * @param {Object} mData - Message data
   * @param {Array} ids - Array of player ids
   */
  relayMulti(data, ids) {
    ids.forEach((id) => {
      const socket = this.users[id];

      if (socket) {
        this.sendMessage(data, socket);
      }
    });
  }
}

module.exports = VsSocket;
