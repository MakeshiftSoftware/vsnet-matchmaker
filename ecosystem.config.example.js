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
        APP_SECRET: 'SECURE_JWT_SECRET',
        REDIS_PUBSUB_URL: 'redis://vs-matchmaker-pubsub:6379',
        REDIS_STORE_URL: 'redis://vs-matchmaker-store:6379',
        SESSION_SERVICE_URL: 'http://vsnet-session:8000'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8000,
        APP_SECRET: 'SECURE_JWT_SECRET',
        REDIS_PUBSUB_URL: 'redis://vs-matchmaker-pubsub:6379',
        REDIS_STORE_URL: 'redis://vs-matchmaker-store:6379',
        SESSION_SERVICE_URL: 'http://vsnet-session:8000'
      }
    }
  ]
};
