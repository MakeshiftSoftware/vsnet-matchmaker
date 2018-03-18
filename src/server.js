const MatchmakingServer = require('./MatchmakingServer');

// Initialize matchmaking server
const server = new MatchmakingServer({
  port: process.env.PORT,
  secret: process.env.APP_SECRET,
  pubsubUrl: process.env.REDIS_PUBSUB_URL,
  storeUrl: process.env.REDIS_STORE_URL,
  sessionServiceUrl: process.env.SESSION_SERVICE_URL
});

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
