const path = require('path');

const SERVICE_TYPE_MODULE = '@helpr/service-type';

/**
 * Let an Expo app import `shared/service-type.ts` as `@helpr/service-type`.
 * Not an npm package — both Metro configs call this so the module stays outside
 * either app tree.
 */
function applyServiceTypeResolver(config, projectRoot) {
  const sharedDir = path.resolve(projectRoot, '../../shared');
  const serviceTypeFile = path.join(sharedDir, 'service-type.ts');
  const watchFolders = new Set(config.watchFolders ?? []);
  watchFolders.add(projectRoot);
  watchFolders.add(sharedDir);
  config.watchFolders = Array.from(watchFolders);

  const previousResolveRequest = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === SERVICE_TYPE_MODULE) {
      return { type: 'sourceFile', filePath: serviceTypeFile };
    }
    if (typeof previousResolveRequest === 'function') {
      return previousResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  };

  return config;
}

module.exports = { applyServiceTypeResolver, SERVICE_TYPE_MODULE };
