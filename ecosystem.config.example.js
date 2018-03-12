module.exports = {
  apps: [
    {
      name: 'vsnet-matchmaker',
      script: './src/server.js',
      exec_mode: 'cluster',
      instances: 0,
      wait_ready: true,
      env: {
        NODE_ENV: 'development',
        PORT: 8000,
        REDIS_PUBSUB_URL_DEV: 'redis://vs-matchmaker-pubsub:6379',
        REDIS_STORE_URL_DEV: 'redis://vs-matchmaker-store:6379',
        APP_SECRET: 'SECURE_JWT_SECRET'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8000,
        REDIS_PUBSUB_URL_PROD: 'redis://vs-matchmaker-pubsub:6379',
        REDIS_STORE_URL_PROD: 'redis://vs-matchmaker-store:6379',
        APP_SECRET: 'SECURE_JWT_SECRET'
      }
    }
  ]
};
