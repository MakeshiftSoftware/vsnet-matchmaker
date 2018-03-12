const Redis = require('ioredis');

class PubsubClient {
  constructor(url) {
    this.sub = new Redis(url);
    this.pub = new Redis(url);
  }

  subscribe(channel) {
    this.sub.subscribe(channel);
  }

  publish(channel, msg) {
    this.pub.publish(channel, msg);
  }

  on(event, cb) {
    this.sub.on(event, cb);
  }

  unsubscribe() {
    return this.sub.unsubscribe();
  }

  close() {
    return Promise.all([
      this.unsubscribe(),
      this.sub.close(),
      this.pub.close()
    ]);
  }
}

module.exports = PubsubClient;
