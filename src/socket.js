const url = require('url')
const co = require('co')
const qs = require('query-string')
const jwt = require('jsonwebtoken')
const WebSocket = require('uws')
const StoreClient = require('./store')
const PubSubClient = require('./pubsub')

class VsSocket {
  /**
   * Initialize socket server.
   *
   * @param {Object} opts - Server options
   */
  constructor(opts) {
    this.users = {}
    this.handlers = {}
    this.secret = opts.secret
    this.pingInterval = opts.pingInterval || 30000

    this.initStore(opts.store)
    this.initPubsub(opts.pubsub)

    this.wss = new WebSocket.Server({
      port: opts.port,
      verifyClient: this.verifyClient.bind(this)
    })

    this.wss.on('connection', this.onClientConnected.bind(this))
  }

  /**
   * Initialize store connection.
   *
   * @param {String} url - Store connection url
   */
  initStore(url) {
    if (url) {
      this.store = new StoreClient(url)
    }
  }

  /**
   * Initialize pubsub connection.
   *
   * @param {String} url - Pubsub connection url
   */
  initPubsub(url) {
    this.pubsub = new PubSubClient(url)
    this.pubsub.subscribe('global')
    this.pubsub.on('message', this.pubsubOnMessage.bind(this))
  }

  /**
   * Start server.
   *
   * @param {Function} cb - Callback function
   */
  start(cb) {
    setInterval(this.ping.bind(this), this.pingInterval)

    if (process.send) {
      process.send('ready')
    }

    if (cb) {
      cb()
    }
  }

  /**
   * Stop server.
   *
   * @param {Function} cb - Callback function
   */
  stop(cb) {
    const me = this

    co(function* () {
      yield me.pubsub.unsubscribe()
      yield me.pubsub.close()
      yield me.store.close()
      cb()
    }).catch((err) => {
      console.log(err)
      cb()
    })
  }

  /**
   * Authenticate connection request using jwt.
   *
   * @param {Object} info - Request data
   * @param {Function} cb - Callback function
   */
  verifyClient(info, cb) {
    const token = qs.parse(url.parse(info.req.url).search).token

    if (!token) {
      return cb(false)
    }

    jwt.verify(token, this.secret, (err, decoded) => {
      if (err) {
        cb(false)
      } else {
        info.req.user = decoded
        cb(true)
      }
    })
  }

  /**
   * Client connected handler.
   *
   * @param {Object} socket - Socket object
   */
  onClientConnected(socket) {
    const user = socket.upgradeReq.user

    if (!user || !user.id) {
      return socket.terminate()
    }

    const playerId = user.id
    socket.playerId = playerId
    socket.isAlive = true

    console.log('Client %s connected', playerId)

    this.registerPlayer(playerId, socket)
    this.pong(socket)
    this.attachMessageHandler(socket)
    this.attachCloseHandler(socket)

    if (this.handlers.connected) {
      this.handlers.connected(socket)
    }
  }

  /**
   * Client disconnected handler.
   *
   * @param {Object} socket - Socket object
   */
  onClientDisconnected(socket) {
    console.log('Client %s disconnected', socket.playerId)
    delete this.users[socket.playerId]

    if (this.handlers.disconnected) {
      this.handlers.disconnected(socket)
    }
  }

  /**
   * Register callback function for an event.
   *
   * @param {String} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    this.handlers[event] = callback
  }

  /**
   * Ping sockets to check if they are alive.
   * TODO: attach custom handler for cleanup
   */
  ping() {
    this.wss.clients.forEach((socket) => {
      if (socket.isAlive === false) {
        delete this.users[socket.playerId]
        return socket.terminate()
      }

      socket.isAlive = true
      socket.ping('', false, true)
    })
  }

  /**
   * Indicates that socket is still alive
   */
  pong(socket) {
    socket.on('pong', () => {
      this.isAlive = true
    })
  }

  /**
   * Attach message handler for when socket sends message.
   *
   * @param {Object} socket - Socket object
   */
  attachMessageHandler(socket) {
    const server = this

    socket.on('message', (message) => {
      server.onMessage(message, socket)
    })
  }

  /**
   * Attach close handler for when sockets are disconnected.
   *
   * @param {Object} socket - Socket object
   */
  attachCloseHandler(socket) {
    const server = this

    socket.on('close', () => {
      server.onClientDisconnected(socket)
    })
  }

  /**
   * Associate player id with socket object
   *
   * @param {String} playerId - Player id
   * @param {Object} socket - Socket object
   */
  registerPlayer(playerId, socket) {
    this.users[playerId] = socket
  }

  /**
   * Message received handler.
   *
   * @param {String} message - Message json
   * @param {Object} socket - Socket object
   */
  onMessage(message, socket) {
    console.log('Received message from client:', message)
    let m

    try {
      m = JSON.parse(message)
    } catch (e) {
      return
    }

    const handler = this.handlers[m.t]

    if (handler) {
      handler(m, socket)
    }
  }

  /**
   * Publish message
   *
   * @param {Object} m - Message object
   */
  relayMessage(m) {
    this.pubsub.publish('global', JSON.stringify(m))
  }

  /**
   * Send message to player.
   *
   * @param {Object} m - The message object
   * @param {Object} socket - The socket object
   */
  sendMessage(m, socket) {
    socket.send(JSON.stringify(m))
  }

  /**
   * Pubsub message handler.
   * Parse incoming message and relay it to recipient.
   *
   * @param {String} channel - Channel name
   * @param {String} message - Message metadata
   */
  pubsubOnMessage(channel, message) {
    let m

    try {
      m = JSON.parse(message)
    } catch (e) {
      return
    }

    const mRecipient = m.r
    const mData = m.d

    if (mRecipient && mData) {
      if (Array.isArray(mRecipient)) {
        this.relayMulti(mData, mRecipient)
      } else {
        this.relaySingle(mData, mRecipient)
      }
    }
  }

  /**
   * Send message to a single user by player id.
   *
   * @param {Object} mData - Message data
   * @param {String} id - Player id
   */
  relaySingle(mData, id) {
    const socket = this.getSocket(id)

    if (socket) {
      this.sendMessage(mData, socket)
    }
  }

  /**
   * Send message to multiple users using an array of player ids.
   *
   * @param {Object} mData - Message data
   * @param {Array} ids - Array of player ids
   */
  relayMulti(mData, ids) {
    ids.forEach((id) => {
      const socket = this.getSocket(id)

      if (socket) {
        this.sendMessage(mData, socket)
      }
    })
  }

  /**
   * Get socket object by player id.
   *
   * @param {String} id - Player id
   */
  getSocket(id) {
    return this.users[id]
  }
}

module.exports = VsSocket
