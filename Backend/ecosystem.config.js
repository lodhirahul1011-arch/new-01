module.exports = {
    apps: [
      {
        name: 'dvaari-backend',
        cwd: __dirname,
        script: 'server.js',
        instances: 1,
        exec_mode: 'fork',
        watch: false,
        autorestart: true,
        max_restarts: 10,
        env: {
          NODE_ENV: 'production',
        },
      },
      {
        name: 'ollama-server',
        cwd: __dirname,
        script: './scripts/start-ollama.sh',
        interpreter: 'bash',
        instances: 1,
        exec_mode: 'fork',
        watch: false,
        autorestart: true,
        max_restarts: 10,
        env: {
          OLLAMA_HOST: '127.0.0.1:11434',
          OLLAMA_NUM_PARALLEL: '1',
          OLLAMA_KEEP_ALIVE: '15m',
        },
      },
    ],
  };