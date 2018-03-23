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
  const port = process.env.PORT;
  const secret = process.env.SECRET;
  const sessionService = process.env.SESSION_SERVICE;

  const pubsub = {
    url: process.env.REDIS_PUBSUB_SERVICE,
    password: process.env.REDIS_PUBSUB_PASSWORD
  };

  const store = {
    url: process.env.REDIS_STORE_SERVICE,
    password: process.env.REDIS_STORE_PASSWORD
  };

  // Initialize matchmaking server
  const server = new MatchmakingServer({
    port,
    secret,
    pubsub,
    store,
    sessionService
  });

  server.start(() => {
    process.on('SIGINT', () => {
      server.stop(stop);
    });

    process.on('SIGTERM', () => {
      server.stop(stop);
    });
  });
}

function stop(err) {
  process.exit(err ? 1 : 0);
}
