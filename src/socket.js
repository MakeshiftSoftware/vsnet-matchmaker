const url = require('url')
const co = require('co')
const qs = require('query-string')
const jwt = require('jsonwebtoken')
const WebSocket = require('uws')
const StoreClient = require('./store')
const PubSubClient = require('./pubsub')

class VsSocket {
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

  initStore(url) {
    if (url) {
      this.store = new StoreClient(url)
    }
  }

  initPubsub(url) {
    this.pubsub = new PubSubClient(url)
    this.pubsub.subscribe('global')
    this.pubsub.on('message', this.pubsubOnMessage.bind(this))
  }

  /**
   * Start server
   *
   * @param {Function} cb - Callback function
   */
  start(cb) {
    // Start heartbeat interval
    setInterval(this.ping.bind(this), this.pingInterval)

    if (process.send) {
      process.send('ready')
    }

    if (cb) {
      cb()
    }
  }

  /**
   * Stop server
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
   * Authenticate connection request using jwt
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
   * Client connected handler
   *
   * @param {Object} socket - The socket object of new client
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
   * Client disconnected handler
   * TODO: more cleanup, notify other player?
   *
   * @param {Object} socket - The disconnected socket
   */
  onClientDisconnected(socket) {
    console.log('Client %s disconnected', socket.playerId)
    const playerId = socket.playerId
    delete this.users[playerId]

    if (this.handlers.disconnected) {
      this.handlers.disconnected(socket)
    }
  }

  on(event, callback) {
    this.handlers[event] = callback
  }

  /**
   * Ping clients to check if they are alive and clean up severed connections
   * TODO: more cleanup, handle disconnections
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

  pong(socket) {
    socket.on('pong', this.heartbeat)
  }

  heartbeat() {
    this.isAlive = true
  }

  attachMessageHandler(socket) {
    const server = this

    socket.on('message', (message) => {
      server.onMessage.bind(server)(message, socket)
    })
  }

  attachCloseHandler(socket) {
    const server = this

    socket.on('close', () => {
      server.onClientDisconnected(socket)
    })
  }

  registerPlayer(playerId, socket) {
    this.users[playerId] = socket
  }

  /**
   * Message received handler
   *
   * @param {String} message - The message received from client
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
   * Publish message to other servers
   *
   * @param {Object} m - The message object
   */
  relayMessage(m) {
    this.pubsub.publish('global', JSON.stringify(m))
  }

  /**
   * Send message to socket
   *
   * @param {Object} m - The message object
   * @param {Object} socket - The socket object
   */
  sendMessage(m, socket) {
    socket.send(JSON.stringify(m))
  }

  /**
   * Pubsub message handler. Parse incoming message
   * and relay it to intended recipients
   *
   * @param {String} channel - The sub channel
   * @param {String} message - The message metadata
   */
  pubsubOnMessage(channel, message) {
    console.log('Received pubsub message:', message)
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
   * Send a message to a single user by user id
   *
   * @param {Object} mData - The message data
   * @param {String} id - The user id of recipient
   */
  relaySingle(mData, id) {
    console.log('Retrieving socket for player:', id)
    const socket = this.getSocket(id)

    if (socket) {
      console.log('Socket found, sending message to player')
      this.sendMessage(mData, socket)
    }
  }

  /**
   * Send a message to multiple users using an array of user ids
   *
   * @param {Object} message - The message data
   * @param {Array} ids - The array of recipient user ids
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
   * Get player's socket object by player id
   *
   * @param {String} id - Player id
   */
  getSocket(id) {
    return this.users[id]
  }
}

module.exports = VsSocket
