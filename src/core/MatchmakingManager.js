/* eslint-disable prefer-arrow-callback */
const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v4');
const VsSocket = require('../socket');

const MIN_RATING = 1;
const MAX_RATING = 30;

const Protocol = {
  CONNECTED: 0,
  FIND_GAME: 1,
  GAME_FOUND: 2,
  GAME_NOT_FOUND: 3
};

const script = fs.readFileSync(path.resolve(__dirname, '../scripts/matchmaker.lua'));

class MatchmakingManager {
  constructor() {
    this.server = new VsSocket();
    this.server.defineCommand('match', script);
    this.server.onConnect(this.onClientConnected);
    this.server.onDisconnect(this.onClientDisconnected);
    this.server.on(Protocol.FIND_GAME, this.findGame);
  }

  /**
   * Find game handler
   * Attempt to match user to another user in matchmaking queue
   * If match is found, generate new game id and notify users
   * If no match is found, notify original user
   *
   * @param {Object} m - Message object
   * @param {Object} socket - Socket connection of originating request
   */
  async findGame(m, socket) {
    try {
      const userId = socket.id;
      const userRating = m.data.rating;

      const n = Number(userRating);

      if (!Number.isInteger(n) || (n < MIN_RATING || n > MAX_RATING)) {
        return;
      }

      const [match, valid] = await this.server.store.match(userId, userRating);

      if (valid) {
        if (match) {
          this.onGameFound(match, socket);
        } else {
          this.onGameNotFound(socket);
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
  onGameFound(matchId, socket) {
    const message = {
      data: {
        type: Protocol.GAME_FOUND,
        gameId: uuid()
      }
    };

    this.server.sendMessage(message, socket);

    this.server.publishMessage({
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
  onGameNotFound(socket) {
    const message = {
      data: {
        type: Protocol.GAME_NOT_FOUND
      }
    };

    this.server.sendMessage(message, socket);
  }

  /**
   * Client connected handler
   * Notify user of new connection
   *
   * @param {Object} socket - New socket connection
   */
  onClientConnected(socket) {
    const message = {
      data: {
        type: Protocol.CONNECTED
      }
    };

    this.server.sendMessage(message, socket);
  }

  /**
   * Client disconnected handler
   * Cleanup user's matchmaking state
   *
   * @param {Object} socket - Disconnected socket
   */
   onClientDisconnected(socket) {  // eslint-disable-line
    // todo
  }

  /**
   * Stop server and cleanup
   *
   * @param {Function} cb - callback function
   */
  start(cb) {
    this.server.start();

    if (cb) {
      cb();
    }
  }

  /**
   * Stop server and cleanup
   *
   * @param {Function} cb - callback function
   */
  async stop(cb) {
    try {
      await this.server.stop();

      if (cb) {
        cb();
      }
    } catch (err) {
      cb(err);
    }
  }
}

module.exports = MatchmakingManager;
