module.exports = {
  apps: [
    {
      name: 'searchmydrivers-api',
      script: 'src/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        NODE_CLUSTER_SCHED_POLICY: 'rr' // Force Round-Robin clustering (solves Windows/Linux EADDRINUSE race conditions)
      }
    }
  ]
};
