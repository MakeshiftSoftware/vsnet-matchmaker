module.exports = {
  apps: [
    {
      name: 'vsnet-matchmaker',
      script: './src/server.js',
      exec_mode: 'cluster',
      instances: 0,
      wait_ready: true,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
}
