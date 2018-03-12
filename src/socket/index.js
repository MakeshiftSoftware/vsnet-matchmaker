/* eslint-disable prefer-arrow-callback */
const WebSocket = require('uws');
const url = require('url');
const qs = require('query-string');
const jwt = require('jsonwebtoken');
const Redstore = require('./redstore');
const Redpub = require('./redpub');

function noop() {}

const DEFAULT_PORT = 8000;
const DEFAULT_PING_INTERVAL = 30000;
const DEFAULT_STORE_URL = null;
const DEFAULT_PUBSUB_URL = null;
const DEFAULT_SECRET = null;
const DEFAULT_CHANNEL = 'global';

class VsSocket {
  /**
   * Initialize socket server.
   *
   * @param {Object} options - Server options
   */
  constructor(options) {
    this.options = options;
    options.port = options.port || DEFAULT_PORT;
    options.pingInterval = options.pingInterval || DEFAULT_PING_INTERVAL;
    options.channel = options.channel || DEFAULT_CHANNEL;
    options.pubsub = process.env.REDIS_PUBSUB_URL || DEFAULT_PUBSUB_URL;
    options.store = process.env.REDIS_STORE_URL || DEFAULT_STORE_URL;
    options.secret = process.env.APP_SECRET || DEFAULT_SECRET;

    this.users = {};
    this.handlers = {};

    if (this.options.store) {
      this.initStore(this.options.store);
    }

    if (this.options.pubsub) {
      this.initPubsub(this.options.pubsub);
    }

    this.wss = new WebSocket.Server({
      port: options.port,
      verifyClient: this.verifyClient(this.options.secret)
    });

    this.wss.on('connection', this.onClientConnected.bind(this));
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
    this.pubsub.subscribe(this.options.channel);

    this.pubsub.on('message', function(channel, message) {
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

    socket.on('message', function(message) {
      server.onMessageReceived(message, socket);
    });

    socket.on('close', function() {
      server.onClientDisconnected(socket);
    });

    socket.on('pong', function() {
      socket.isAlive = true;
    });

    if (server.handlers.connected) {
      server.handlers.connected(socket);
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
      server.handlers.disconnected(socket);
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
   * TODO: cleanup disconnected sockets
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
    try {
      const m = JSON.parse(message);

      return {
        type: m.type,
        data: m.data,
        recipient: m.recipient
      };
    } catch (e) {
      console.log(e); // eslint-disable-line
    }
  }

  /**
   * Publish message
   *
   * @param {Object} m - Message object
   */
  publishMessage(m) {
    this.pubsub.publish(this.options.channel, JSON.stringify(m));
  }

  /**
   * Send message to user.
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
   * Send message to a single user by user id.
   *
   * @param {Object} data - Message data
   * @param {String} id - User id
   */
  relaySingle(data, id) {
    const socket = this.users[id];

    if (socket) {
      this.sendMessage(data, socket);
    }
  }

  /**
   * Send message to multiple users using an array of user ids.
   *
   * @param {Object} mData - Message data
   * @param {Array} ids - Array of user ids
   */
  relayMulti(data, ids) {
    ids.forEach((id) => {
      const socket = this.users[id];

      if (socket) {
        this.sendMessage(data, socket);
      }
    });
  }

  /**
   * Define custom redis command
   *
   * @param {String} name - Command name
   * @param {String} script - Lua script text
   */
  defineCommand(name, script) {
    this.store.defineCommand(name, script);
  }

  /**
   * Define additional actions on client connected event
   *
   * @param {Function} cb - Callback function
   */
  onConnect(cb) {
    this.handlers.connected = cb;
  }

  /**
   * Define additional actions on client disconnected event
   *
   * @param {Function} cb - Callback function
   */
  onDisconnect(cb) {
    this.handlers.disconnected = cb;
  }
}

module.exports = VsSocket;
