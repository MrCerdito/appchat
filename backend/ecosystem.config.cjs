module.exports = {
  apps: [
    {
      name: 'reportacasos-api',
      script: 'dist/src/main.js',
      instances: 4, // 4 of 8 cores — rest for OS/DB/Redis/Docker
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      // Graceful shutdown
      kill_timeout: 10000,
      listen_timeout: 15000,
      // Restart strategy
      exp_backoff_restart_delay: 200,
      max_restarts: 10,
      min_uptime: '5s',
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true,
    },
  ],
};
