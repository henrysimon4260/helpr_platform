import type { ConfigContext, ExpoConfig } from '@expo/config';
import appJson from './app.json';

type AppJson = {
  expo: ExpoConfig & {
    extra?: Record<string, unknown>;
  };
};

function googleIosReversedScheme(iosClientId: string | undefined): string | null {
  if (!iosClientId?.endsWith('.apps.googleusercontent.com')) return null;
  const id = iosClientId.slice(0, -'.apps.googleusercontent.com'.length);
  return id ? `com.googleusercontent.apps.${id}` : null;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const baseConfig = (appJson as AppJson).expo;
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
  const googleScheme = googleIosReversedScheme(googleIosClientId);
  const extra = {
    ...(config.extra ?? {}),
    ...(baseConfig.extra ?? {}),
    googlePlacesApiKey:
      process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ??
      process.env.GOOGLE_PLACES_API_KEY ??
      '',
    openAiApiKey:
      process.env.EXPO_PUBLIC_OPENAI_API_KEY ??
      process.env.OPENAI_API_KEY ??
      '',
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
    googleIosClientId,
    googleAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
  };

  const baseIos = baseConfig.ios ?? {};
  const baseInfoPlist = (baseIos.infoPlist ?? {}) as Record<string, unknown>;
  const existingUrlTypes = Array.isArray(baseInfoPlist.CFBundleURLTypes)
    ? baseInfoPlist.CFBundleURLTypes
    : [];

  const merged: ExpoConfig = {
    ...config,
    ...baseConfig,
    ios: {
      ...baseIos,
      usesAppleSignIn: true,
      ...(googleScheme
        ? {
            infoPlist: {
              ...baseInfoPlist,
              CFBundleURLTypes: [
                ...existingUrlTypes,
                { CFBundleURLSchemes: [googleScheme] },
              ],
            },
          }
        : {}),
    },
    extra,
    plugins: [
      ...(baseConfig.plugins || []),
      'expo-web-browser',
    ],
  } as ExpoConfig;

  return merged;
};
