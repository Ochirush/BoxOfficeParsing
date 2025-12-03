module.exports = {
  apps: [
    {
      name: 'movie-data-scheduler',
      script: './src/scheduler.js',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      watch: false,
      autorestart: true,
      restart_delay: 10000,
      max_restarts: 10,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      out_file: './src/logs/pm2-out.log',
      error_file: './src/logs/pm2-error.log',
      time: true,
    },
  ],
};