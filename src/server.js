const VsSocket = require('./socket');

const server = new VsSocket();

// Attach event handlers
require('./handlers')(server);

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
