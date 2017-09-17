const Redis = require('ioredis')

class PubSubClient {
  constructor(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('Missing or invalid connection url')
    }

    this.sub = new Redis(url)
    this.pub = new Redis(url)
  }

  subscribe(channel) {
    this.sub.subscribe(channel)
  }

  publish(channel, msg) {
    this.pub.publish(channel, msg)
  }

  on(event, cb) {
    this.sub.on(event, cb)
  }
}

module.exports = PubSubClient
