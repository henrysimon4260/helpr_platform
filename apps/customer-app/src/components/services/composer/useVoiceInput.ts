import * as FileSystem from 'expo-file-system';
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Platform } from 'react-native';

import { Audio } from './audio';
import { resolveOpenAIApiKey } from './utils';

interface VoiceInputProps {
  setDescription: Dispatch<SetStateAction<string>>;
  resetPriceState: () => void;
  showModal: (config: { title: string; message: string }) => void;
}

export function useVoiceInput({ setDescription, resetPriceState, showModal }: VoiceInputProps) {
  const openAiApiKey = useMemo(resolveOpenAIApiKey, []);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recordingRef = useRef<InstanceType<typeof Audio.Recording> | null>(null);

  const transcribeAudio = useCallback(async (uri: string) => {
    if (!openAiApiKey) {
      showModal({ title: 'Missing API key', message: 'Add an OpenAI API key to enable voice mode.' });
      return '';
    }

    try {
      const formData = new FormData();
      formData.append('file', { uri, name: 'voice-input.m4a', type: Platform.select({ ios: 'audio/m4a', android: 'audio/mpeg', default: 'audio/m4a' }) } as any);
      formData.append('model', 'gpt-4o-mini-transcribe');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openAiApiKey}` },
        body: formData,
      });

      if (!response.ok) throw new Error('Transcription failed');
      const data = await response.json();
      return typeof data?.text === 'string' ? data.text.trim() : '';
    } catch {
      showModal({ title: 'Transcription failed', message: 'Unable to transcribe your recording.' });
      return '';
    } finally {
      FileSystem.deleteAsync(uri).catch(() => undefined);
    }
  }, [openAiApiKey, showModal]);

  const stopRecordingAndTranscribe = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) {
      setIsRecording(false);
      return;
    }

    try {
      await recording.stopAndUnloadAsync();
    } catch {}
    setIsRecording(false);

    const uri = recording.getURI();
    recordingRef.current = null;
    if (!uri) return;

    setIsTranscribing(true);
    try {
      const transcript = await transcribeAudio(uri);
      if (transcript) {
        resetPriceState();
        setDescription(prev => {
          const trimmed = prev.trim();
          return trimmed.length > 0 ? `${trimmed} ${transcript}` : transcript;
        });
      }
    } finally {
      setIsTranscribing(false);
    }
  }, [resetPriceState, setDescription, transcribeAudio]);

  const handleVoicePress = useCallback(async () => {
    if (isTranscribing) return;
    if (isRecording) {
      await stopRecordingAndTranscribe();
      return;
    }

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        showModal({ title: 'Microphone needed', message: 'Enable microphone access to record your request.' });
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
    } catch {
      showModal({ title: 'Recording failed', message: 'Unable to start voice mode.' });
    }
  }, [isRecording, isTranscribing, showModal, stopRecordingAndTranscribe]);

  useEffect(() => {
    return () => {
      recordingRef.current?.stopAndUnloadAsync().catch(() => undefined);
    };
  }, []);

  return { isRecording, isTranscribing, handleVoicePress };
}
