const VsSocket = require('./socket');
const config = require('./config');

const server = new VsSocket({
  port: process.env.PORT,
  secret: process.env.APP_SECRET,
  pubsub: config.pubsub[process.env.NODE_ENV],
  store: config.store[process.env.NODE_ENV]
});

// Attach event handlers
require('./matchmaker')(server);

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
