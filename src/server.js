const MatchmakingManager = require('./core/MatchmakingManager');

// Initialize matchmaking manager
const server = new MatchmakingManager();

server.start(() => {
  process.on('SIGINT', () => {
    server.stop((err) => {
      process.exit(err ? 1 : 0);  // eslint-disable-line
    });
  });

  if (process.send) {
    process.send('ready');
  }

  console.log('vsnet-matchmaker: listening on', process.env.PORT); // eslint-disable-line
});
