import type { ConfigContext, ExpoConfig } from '@expo/config';
import appJson from './app.json';

type AppJson = {
  expo: ExpoConfig & {
    extra?: Record<string, unknown>;
  };
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const baseConfig = (appJson as AppJson).expo;
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
  };

  const merged: ExpoConfig = {
    ...config,
    ...baseConfig,
    extra,
    plugins: [
      ...(baseConfig.plugins || []),
      'expo-web-browser',
    ],
  } as ExpoConfig;

  return merged;
};
