module.exports = {
  apps: [
    {
      name: 'tofu-dubbing-api',
      script: 'dist/main.js',
      exec_mode: 'cluster',
      instances: 4,
      kill_timeout: 60000,
    },
  ],
};
