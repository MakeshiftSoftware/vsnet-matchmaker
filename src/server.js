/* eslint-disable no-process-exit, no-console */
const os = require('os');
const cluster = require('cluster');
const MatchmakingServer = require('./MatchmakingServer');

if (cluster.isMaster) {
  for (let i = 0; i < os.cpus().length; ++i) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    if (!worker.exitedAfterDisconnect) {
      console.log('[Error][matchmaker] Worker has died', worker.process.pid);
      cluster.fork();
    }
  });
} else {
  // Initialize matchmaking server
  const server = new MatchmakingServer({
    port: process.env.PORT,
    secret: process.env.APP_SECRET,
    pubsub: {
      url: process.env.REDIS_PUBSUB_SERVICE,
      password: process.env.REDIS_PUBSUB_PASSWORD
    },
    store: {
      url: process.env.REDIS_STORE_SERVICE,
      password: process.env.REDIS_STORE_PASSWORD
    },
    sessionService: process.env.SESSION_SERVICE
  });

  server.start(() => {
    process.on('SIGINT', () => {
      server.stop((err) => {
        process.exit(err ? 1 : 0);
      });
    });

    process.on('SIGTERM', () => {
      server.stop((err) => {
        process.exit(err ? 1 : 0);
      });
    });

    if (process.send) {
      process.send('ready');
    }

    console.log('vsnet-matchmaker: listening on', process.env.PORT);
  });
}
