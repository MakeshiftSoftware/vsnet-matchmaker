const co = require('co')
const uuid = require('uuid/v4')

module.exports = (server) => {
  /**
   * Find a match for player
   * TEMP: use a single queue
   */
  const findMatch = (m, socket) => {
    const playerId = socket.playerId
    const playerRating = m.r

    if (!isRatingValid(playerRating)) {
      return
    }

    console.log('Finding match for player', playerId)

    socket.queuesJoined = new Set()
    socket.attempts = 0

    co(function* () {
      const matchId = yield server.store.pop(playerRating)

      if (matchId) {
        onMatchFound(playerId, matchId, socket)
      } else {
        onMatchNotFound(playerRating, playerId, socket)
      }
    }).catch(onerror)
  }

  /**
   * Reattempt matchmaking if previous attempt fails
   *
   * @param {Object} m - The message object
   * @param {Object} socket - The socket object
   */
  const reattemptMatch = (m, socket) => {
    const playerId = socket.playerId
    const numQueues = socket.queuesJoined.size - 1

    socket.queuesJoined.forEach((q, i) => {
      co(function* () {
        const matchId = yield server.store.pop(q)

        if (matchId) {
          return onMatchFound(playerId, matchId, socket)
        }

        if (i === numQueues) {
          onMatchNotFound()
        }
      }).catch(onerror)
    })
  }

  /**
   * Handler for match found
   * Generate a unique id for the new game and send
   * a message to both players that includes the game id
   *
   * @param {String} playerId - Player id of the original player
   * @param {String} matchId - Player id of the matched player
   * @param {Object} socket - Socket object of the original player
   */
  const onMatchFound = (playerId, matchId, socket) => {
    console.log('Match found, starting new game')
    const gameId = uuid()

    // TODO: remove both matched players from all joined queues
    // do this as a transaction to avoid weird concurrency issues
    const message = {
      t: 'm',
      g: gameId
    }

    server.sendMessage(message, socket)

    server.relayMessage({
      r: matchId,
      d: message
    })
  }

  /**
   * Handler for no match found
   * Send message to notify user that no match was found
   * TODO: determine if other queues should be joined based on socket.attempts
   *
   * @param {String} playerRating - Player rating
   * @param {String} playerId - Player id
   * @param {Object} socket - Socket object
   */
  const onMatchNotFound = (playerRating, playerId, socket) => {
    console.log('Match not found')
    socket.queuesJoined.add(playerRating)
    socket.attempts++

    if (socket.attempts === 1) {
      console.log('Joining matchmaking queue')

      co(function* () {
        yield server.store.push(playerRating, playerId)
        server.sendMessage({ t: 'nm' }, socket)
      }).catch(onerror)
    }
  }

  /**
   * Verify that player rating is a valid rating
   *
   * @param {String} rating - Player rating
   */
  const isRatingValid = (rating) => {
    if (rating === null) {
      return false
    }

    const n = Number(rating)
    return Number.isInteger(n) && (n >= 1 && n <= 30)
  }

  const onerror = (err) => {
    console.log(err)
  }

  // Attach message handlers
  server.on('q', findMatch)
  server.on('r', reattemptMatch)

  server.on('connected', (socket) => {
    server.sendMessage({ t: 'cm' }, socket)
  })

  server.on('disconnected', (socket) => {
    // TODO: cleanup after disconnect
  })
}

