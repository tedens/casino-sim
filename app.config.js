// wraps app.json so CI can set a base path for GitHub Pages (served from /<repo-name>/)
module.exports = ({ config }) => ({
  ...config,
  name: 'Casino Strategy Lab',
  experiments: {
    ...config.experiments,
    baseUrl: process.env.BASE_URL || '',
  },
});
