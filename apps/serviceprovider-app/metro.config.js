const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

// #region agent log
const DEBUG_LOG = '/Users/henrysimon/Projects/.cursor/debug-5df5b7.log';
const debugLog = (hypothesisId, message, data) => {
  try {
    fs.appendFileSync(
      DEBUG_LOG,
      `${JSON.stringify({ sessionId: '5df5b7', hypothesisId, location: 'metro.config.js', message, data, timestamp: Date.now(), runId: 'pre-fix' })}\n`
    );
  } catch (_) {}
};
// #endregion

module.exports = (() => {
  const config = getDefaultConfig(__dirname);

  // #region agent log
  const monorepoRoot = path.resolve(__dirname, '../..');
  const topLevelBabelPreset = path.join(__dirname, 'node_modules/babel-preset-expo');
  const nestedBabelPreset = path.join(__dirname, 'node_modules/expo/node_modules/babel-preset-expo');
  let babelPresetResolve = null;
  let babelPresetResolveError = null;
  try {
    babelPresetResolve = require.resolve('babel-preset-expo', { paths: [__dirname] });
  } catch (err) {
    babelPresetResolveError = err.message;
  }
  debugLog('H1', 'babel-preset-expo resolution paths', {
    topLevelExists: fs.existsSync(topLevelBabelPreset),
    nestedUnderExpoExists: fs.existsSync(nestedBabelPreset),
    requireResolve: babelPresetResolve,
    requireResolveError: babelPresetResolveError,
  });
  debugLog('H2', 'babel-preset-expo in package.json', {
    inDependencies: !!require('./package.json').dependencies?.['babel-preset-expo'],
    inDevDependencies: !!require('./package.json').devDependencies?.['babel-preset-expo'],
  });
  debugLog('H3', 'customer-app comparison', {
    customerTopLevelExists: fs.existsSync(
      path.join(__dirname, '../customer-app/node_modules/babel-preset-expo')
    ),
  });
  debugLog('H4', 'monorepo root node_modules state', {
    rootNodeModulesExists: fs.existsSync(path.join(monorepoRoot, 'node_modules')),
    appNodeModulesExists: fs.existsSync(path.join(__dirname, 'node_modules')),
  });
  debugLog('H5', 'metro watchFolders', {
    watchFolders: config.watchFolders,
    missingFolders: (config.watchFolders ?? []).filter((folder) => !fs.existsSync(folder)),
  });
  // #endregion

  const { transformer, resolver } = config;

  config.transformer = {
    ...transformer,
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
    // Disable dev menu
    dev: false,
  };
  config.resolver = {
    ...resolver,
    assetExts: resolver.assetExts.filter((ext) => ext !== 'svg'),
    sourceExts: [...resolver.sourceExts, 'svg']
  };

  return config;
})();
