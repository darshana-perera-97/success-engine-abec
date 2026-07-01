/**
 * PM2 process manager — production on AWS EC2 (4 vCPU / 8 GB RAM, ~20 users).
 *
 * Usage (on server, after `npm run build` in frontend):
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup
 *
 * IMPORTANT: Keep `instances: 1` — this app uses JSON file storage with in-memory
 * cache; multiple Node workers would cause stale reads and write conflicts.
 */
module.exports = {
  apps: [
    {
      name: "success-engine",
      cwd: "./backend",
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "1500M",
      node_args: "--max-old-space-size=1536",
      env: {
        NODE_ENV: "production",
        PORT: 3334,
        HOST: "0.0.0.0",
        WHATSAPP_LAZY_START: "true",
        WARM_JSON_CACHE_ON_START: "true",
      },
      env_development: {
        NODE_ENV: "development",
        PORT: 3334,
        HOST: "127.0.0.1",
        WHATSAPP_LAZY_START: "false",
        WARM_JSON_CACHE_ON_START: "false",
      },
    },
  ],
};
