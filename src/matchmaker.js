const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v4');

const MIN_RATING = 1;
const MAX_RATING = 30;

const Event = {
  CLIENT_CONNECTED: 'connected',
  CLIENT_DISCONNECTED: 'disconnected',
  FIND_GAME: 'find_game'
};

const MessageProp = {
  GAME_ID: 'game_id',
  PLAYER_RATING: 'player_rating',
  NUM_ATTEMPTS: 'num_attempts',
  MESSAGE_TYPE: 'type',
  MESSAGE_DATA: 'data',
  MESSAGE_RECIPIENT: 'recipient'
};

const SocketProp = {
  PLAYER_ID: 'id',
  NUM_ATTEMPTS: 'attempts'
};

const MessageType = {
  CONNECTION_ESTABLISHED: 'connected_matchmaking',
  GAME_FOUND: 'game_found',
  GAME_NOT_FOUND: 'game_not_found'
};

function findGameRequest(m, socket) {
  return {
    playerId: socket[SocketProp.PLAYER_ID],
    playerRating: m[MessageProp.PLAYER_RATING]
  };
}

const clientConnectedResponse = {
  [MessageProp.MESSAGE_TYPE]: MessageType.CONNECTION_ESTABLISHED
};

function gameFoundResponse(recipient) {
  const newGameId = uuid();

  const message = {
    [MessageProp.GAME_ID]: newGameId,
    [MessageProp.MESSAGE_TYPE]: MessageType.GAME_FOUND
  };

  return {
    local: message,
    broadcast: {
      [MessageProp.MESSAGE_DATA]: message,
      [MessageProp.MESSAGE_RECIPIENT]: recipient
    }
  };
}

function gameNotFoundResponse(socket) {
  return {
    [MessageProp.MESSAGE_TYPE]: MessageType.GAME_NOT_FOUND,
    [MessageProp.NUM_ATTEMPTS]: socket[SocketProp.NUM_ATTEMPTS]
  };
}

/**
 * Check if player rating is valid.
 *
 * @param {String} rating - Player rating
 */
function isRatingValid(rating) {
  const n = Number(rating);
  return Number.isInteger(n) && (n >= MIN_RATING && n <= MAX_RATING);
}

module.exports = (server) => {
  async function findGame(m, socket) {
    try {
      const {
        playerId,
        playerRating
      } = findGameRequest(m, socket);

      if (!isRatingValid(playerRating)) {
        return;
      }

      const [match, ignore] = await server.store.match(playerId, playerRating);

      if (ignore) {
        return;
      }

      if (match) {
        onGameFound(match, socket);
      } else {
        onGameNotFound(socket);
      }
    } catch (err) {
      console.log(err); // eslint-disable-line
    }
  }

  function onGameFound(matchId, socket) {
    const { local, broadcast } = gameFoundResponse(matchId);

    server.sendMessage(local, socket);
    server.publishMessage(broadcast);

    delete socket.attempts;
  }

  function onGameNotFound(socket) {
    server.sendMessage(gameNotFoundResponse(socket), socket);
  }

  function onClientConnected(m, socket) {
    server.sendMessage(clientConnectedResponse, socket);
  }

  function onClientDisconnected(m, socket) {  // eslint-disable-line
    // todo
  }

  server.store.defineCommand('match', fs.readFileSync(path.resolve(__dirname, './scripts/matchmaker.lua')));
  server.on(Event.CLIENT_CONNECTED, onClientConnected);
  server.on(Event.CLIENT_DISCONNECTED, onClientDisconnected);
  server.on(Event.FIND_GAME, findGame);
};
