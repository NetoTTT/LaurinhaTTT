module.exports = {
    apps: [
      {
        name: "whatsapp-adapter",
        script: "services/whatsapp-adapter/dist/index.js",
        cwd: __dirname,
        autorestart: true,
        max_restarts: 50,
        restart_delay: 5000,
        env: {
          NODE_ENV: "production",
          WA_ADAPTER_PORT: 3322,
          REDIS_URL: "redis://100.114.134.126:6379",
          WA_SESSION_PATH: ".wa-session",
        },
      },
    ],
  };
