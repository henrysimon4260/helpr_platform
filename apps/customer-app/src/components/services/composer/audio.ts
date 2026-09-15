import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import AudioModule from 'expo-audio/build/AudioModule';

class Recording {
  private recorder: InstanceType<typeof AudioModule.AudioRecorder> | null = null;

  async prepareToRecordAsync(_preset?: unknown) {
    this.recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
    await this.recorder.prepareToRecordAsync();
  }

  async startAsync() {
    this.recorder?.record();
  }

  async stopAndUnloadAsync() {
    await this.recorder?.stop();
  }

  getURI() {
    return this.recorder?.uri ?? null;
  }
}

export const Audio = {
  Recording,
  RecordingOptionsPresets: {
    HIGH_QUALITY: RecordingPresets.HIGH_QUALITY,
  },
  requestPermissionsAsync: requestRecordingPermissionsAsync,
  setAudioModeAsync: async (mode: {
    allowsRecordingIOS?: boolean;
    playsInSilentModeIOS?: boolean;
    staysActiveInBackground?: boolean;
    shouldDuckAndroid?: boolean;
  }) => {
    await setAudioModeAsync({
      allowsRecording: mode.allowsRecordingIOS ?? true,
      playsInSilentMode: mode.playsInSilentModeIOS ?? true,
      shouldPlayInBackground: mode.staysActiveInBackground ?? false,
      interruptionMode: mode.shouldDuckAndroid ? 'duckOthers' : 'mixWithOthers',
    });
  },
};
