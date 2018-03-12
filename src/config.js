const pubsub = {
  development: process.env.REDIS_PUBSUB_URL_DEV,
  production: process.env.REDIS_PUBSUB_URL_PROD
};

const store = {
  development: process.env.REDIS_STORE_URL_DEV,
  production: process.env.REDIS_STORE_URL_PROD
};

module.exports = {
  pubsub,
  store
};
