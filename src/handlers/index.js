const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v4');

const MIN_RATING = 1;
const MAX_RATING = 30;

const Protocol = {
  CONNECTED: 0,
  FIND_GAME: 1,
  GAME_FOUND: 2,
  GAME_NOT_FOUND: 3
};

module.exports = (server) => {
  /**
   * Find game handler
   * Attempt to match user to another user in matchmaking queue
   * If match is found, generate new game id and notify users
   * If no match is found, notify original user
   *
   * @param {Object} m - Message object
   * @param {Object} socket - Socket connection of originating request
   */
  async function findGame(m, socket) {
    try {
      const userId = socket.id;
      const userRating = m.data.rating;

      const n = Number(userRating);

      if (!Number.isInteger(n) || (n < MIN_RATING || n > MAX_RATING)) {
        return;
      }

      const [match, valid] = await server.store.match(userId, userRating);

      if (valid) {
        if (match) {
          onGameFound(match, socket);
        } else {
          onGameNotFound(socket);
        }
      }
    } catch (err) {
      console.log(err); // eslint-disable-line
    }
  }

  /**
   * Game found handler
   * Notify both users of match
   *
   * @param {String} matchId - User id of matched user
   * @param {Object} socket - Socket connection of originating request
   */
  function onGameFound(matchId, socket) {
    const message = {
      type: Protocol.GAME_FOUND,
      data: {
        gameId: uuid()
      }
    };

    server.sendMessage(message, socket);

    server.publishMessage({
      data: message,
      recipient: matchId
    });
  }

  /**
   * Game not found handler
   * Notify requesting user of no match
   *
   * @param {Object} socket - Socket connection of originating request
   */
  function onGameNotFound(socket) {
    const message = {
      type: Protocol.GAME_NOT_FOUND
    };

    server.sendMessage(message, socket);
  }

  /**
   * Client connected handler
   * Notify user of new connection
   *
   * @param {Object} socket - New socket connection
   */
  function onClientConnected(socket) {
    const message = {
      type: Protocol.CONNECTED
    };

    server.sendMessage(message, socket);
  }

  /**
   * Client disconnected handler
   * Cleanup user's matchmaking state
   *
   * @param {Object} socket - Disconnected socket
   */
  function onClientDisconnected(socket) {  // eslint-disable-line
    // todo
  }

  const script = fs.readFileSync(path.resolve(__dirname, '../scripts/matchmaker.lua'));
  server.defineCommand('match', script);
  server.onConnect(onClientConnected);
  server.onDisconnect(onClientDisconnected);
  server.on(Protocol.FIND_GAME, findGame);
};
