const { getDefaultConfig } = require('expo/metro-config');
const { applyServiceTypeResolver } = require('../../shared/metro-resolve-service-type');

module.exports = (() => {
  const config = getDefaultConfig(__dirname);

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

  return applyServiceTypeResolver(config, __dirname);
})();
