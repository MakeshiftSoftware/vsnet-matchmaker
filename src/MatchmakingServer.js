/* eslint-disable prefer-arrow-callback, no-console */
const fs = require('fs');
const path = require('path');
const http = require('axios');
const uuid = require('uuid/v4');
const VsSocket = require('./socket');

const MIN_RATING = 1;
const MAX_RATING = 30;
const SESSION_MAX_RETRIES = 30;

const Protocol = {
  CONNECTED: 0,
  FIND_GAME: 1,
  GAME_FOUND: 2,
  GAME_NOT_FOUND: 3,
  SESSION_NOT_FOUND: 4
};

class MatchmakingServer {
  /**
   * Initialize matchmaking server.
   *
   * @param {Object} options - Server options
   */
  constructor(options) {
    const {
      port,
      secret,
      pubsubUrl,
      storeUrl,
      sessionServiceAddr
    } = options;

    if (!secret) {
      console.log('[Warn][matchmaker] No secret provided, connecting clients will not be verified');
    }

    this.server = new VsSocket({
      port,
      secret,
      pubsubUrl,
      storeUrl
    });

    const script = fs.readFileSync(path.resolve(__dirname, './scripts/matchmaker.lua'));
    this.server.defineCommand('match', script);
    this.server.onConnect(this.onClientConnected);
    this.server.onDisconnect(this.onClientDisconnected);
    this.server.on(Protocol.FIND_GAME, this.findGame);
    this.sessionServiceUrl = sessionServiceAddr + '/session';
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
          this.onMatchFound(match, socket);
        } else {
          this.onMatchNotFound(socket);
        }
      }
    } catch (err) {
      console.log('[Error][matchmaker] Error finding match: ', err.message); // eslint-disable-line
    }
  }

  /**
   * Game found handler
   * Create new game and session
   *
   * @param {String} matchId - User id of matched user
   * @param {Object} socket - Socket connection of originating request
   */
  onMatchFound(matchId, socket) {
    const match = {
      currentSocket: socket,
      matchId: matchId,
      game: {
        id: uuid()
      }
    };

    this.createSessionForGame(match);
  }

  /**
   * Game not found handler
   * Notify requesting user of no match
   *
   * @param {Object} socket - Socket connection of originating request
   */
  onMatchNotFound(socket) {
    const message = {
      data: {
        type: Protocol.GAME_NOT_FOUND
      }
    };

    this.server.sendMessage(message, socket);
  }

  /**
   * Sends a message to the session manager to create a new game server session.
   * Waits for the game server IP and Port to become active and returns a fully
   * populated game containing the session details.
   *
   * @param {Object} match - Match object
   */
  async createSessionForGame(match) {
    try {
      console.log('[Info][matchmaker] Creating a new session:', this.sessionServiceUrl);
      // create session
      const res = await http.post(this.sessionServiceUrl);
      match.game.sessionId = res.data.id;
      console.log('[Info][matchmaker] Created session:', match.game.sessionId);
      // attempt to get ip and port for this session
      this.getSessionIPAndPort(match);
    } catch (err) {
      console.log('[Error][matchmaker] Error calling /session:', err.message);
    }
  }

  /**
   * Returns a session with the IP and Port of a running game session.
   * Will time out after 30 attempts, with a 1 second wait in between each attempt.
   *
   * @param {Object} match - Match object
   */
  getSessionIPAndPort(match) {
    let attempts = 0;

    async function attempt() {
      try {
        // attempt to get session info
        const res = await http.get(this.sessionServiceUrl, {
          id: match.game.sessionId
        });

        const session = res.data.session;
        match.game.ip = session.ip;
        match.game.port = session.port;
        console.log('[Info][matchmaker] Recieved session data:', session.port + ':' + session.ip);

        const message = {
          type: Protocol.GAME_FOUND,
          data: match.game
        };

        // todo: update game session info in redis
        // updateGame(match.game)

        // send game found message to players
        this.server.sendMessage(message, match.currentSocket);
        this.server.publishMessage({
          data: message,
          recipient: match.matchId
        });
      } catch (err) {
        console.log('[Info][matchmaker] Unable to get session info, trying again');
        attempts += 1;

        if (attempts > SESSION_MAX_RETRIES) {
          // exceeded max retries, send error message to players
          const message = {
            type: Protocol.SESSION_NOT_FOUND,
            data: match.game
          };

          this.server.sendMessage(message, match.currentSocket);
          this.server.publishMessage({
            data: message,
            recipient: match.matchId
          });
        } else {
          // retry for session info in 1 second
          setTimeout(attempt, 1000);
        }
      }
    }

    // start trying for session info
    setImmediate(attempt);
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

module.exports = MatchmakingServer;
