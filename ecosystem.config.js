module.exports = {
    apps: [
        {
            name: "redis",
            script: "redis-server",
            args: "--save 60 1",
            autorestart: true,
            env: {
                PORT: 6379,
            },
        },
        {
            name: "whatsapp-adapter",
            script: "services/whatsapp-adapter/dist/index.js",
            cwd: "/home/lourival/Documentos/LaurinhaTTT",
            autorestart: true,
            max_restarts: 50,
            restart_delay: 5000,
            env: {
                NODE_ENV: "production",
                WA_ADAPTER_PORT: 3322,
                REDIS_URL: "redis://localhost:6379",
                WA_SESSION_PATH:
                    "/home/lourival/Documentos/LaurinhaTTT/.wa-session",
                PUPPETEER_EXECUTABLE_PATH: "/usr/bin/google-chrome-stable",
            },
        },
        {
            name: "core-backend",
            script: "services/core-backend/dist/index.js",
            cwd: "/home/lourival/Documentos/LaurinhaTTT",
            autorestart: true,
            max_restarts: 50,
            restart_delay: 5000,
            env: {
                NODE_ENV: "production",
                CORE_PORT: 3321,
                REDIS_URL: "redis://localhost:6379",
                DATABASE_URL:
                    "postgresql://postgres:postgres@localhost:5433/laurinha",
                LM_STUDIO_URL: "http://100.71.223.57:1234/v1",
                LM_STUDIO_MODEL: "gemma-4-e2b-abliterated",
                OPENCODE_GO_API_KEY:
                    "sk-Q9upIsQFcnpEdMxOvMjG3VRc6070YI0cct5kCXdrEeVpgTOoaZ9yt5nu59lbMa5s",
                OPENCODE_GO_MODEL: "opencode-go/deepseek-v4-flash",
                OPENCODE_GO_URL: "https://opencode.ai/zen/go/v1",
                AI_PROVIDER: "opencode-go",
                BRAVE_SEARCH_KEY: "BSAp9hL6_r3lkItD1l3CtxJnf5Rikei",
                GEMINI_API_KEY: "AIzaSyDFsQtkuwZi1EiksVTnEhPEhHkOEbw4I0s",
                GEMINI_MODEL: "gemini-2.0-flash-lite",
            },
        },
        {
            name: "dashboard",
            script: "build/index.js",
            cwd: "/home/lourival/Documentos/LaurinhaTTT/services/dashboard",
            autorestart: true,
            max_restarts: 50,
            restart_delay: 5000,
            env: {
                NODE_ENV: "production",
                PORT: 3323,
                REDIS_URL: "redis://localhost:6379",
                CORE_BACKEND_URL: "http://localhost:3321",
                WA_ADAPTER_URL: "http://localhost:3322",
                ORIGIN: "http://100.114.134.126:3323",
            },
        },
    ],
};
