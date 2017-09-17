const VsSocket = require('./socket')
const matchmaker = require('./matchmaker')

const storeUrl = process.env.NODE_ENV === 'production'
  ? process.env.REDIS_URL_PROD
  : process.env.REDIS_URL_DEV

const pubsubUrl = process.env.NODE_ENV === 'production'
  ? process.env.PUBSUB_URL_PROD
  : process.env.PUBSUB_URL_DEV

// Define server options
const serverOpts = {
  port: process.env.PORT,
  secret: process.env.SECRET,
  pingInterval: 30000,
  store: storeUrl,
  pubsub: pubsubUrl
}

const server = new VsSocket(serverOpts)
matchmaker(server)

// Start server
server.start(() => {
  /* eslint-disable */
  process.on('SIGINT', () => {
    server.stop(() => {
      process.exit(0)
    })
  })

  console.log('Listening on', process.env.PORT)
})