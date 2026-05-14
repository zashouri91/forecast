module.exports = {
  apps: [
    {
      name: "forecast-static",
      cwd: __dirname,
      script: "node_modules/serve/build/main.js",
      args: "-l 3500 -s .",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "128M",
      out_file: "./logs/out.log",
      error_file: "./logs/err.log",
      time: true,
    },
  ],
};
