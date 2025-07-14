const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const reactNativePlugin = require('eslint-plugin-react-native');

module.exports = defineConfig([
  expoConfig,
  {
    files: ['**/*.tsx'], // Target all TypeScript React files
    plugins: {
      'react-native': reactNativePlugin,
    },
    rules: {
      'react-native/no-raw-text': 'error', // Now recognized with the plugin
    },
    ignores: ['dist/*'], // Keep existing ignore rule
  },
]);