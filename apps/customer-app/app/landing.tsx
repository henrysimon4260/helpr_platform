import { View, Text, TextInput, Pressable, Image, FlatList, StyleSheet, ImageSourcePropType, Platform, InteractionManager, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard, Animated, Easing, Alert, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { SvgXml } from 'react-native-svg';
import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { RouteParams } from '../constants/routes';
// @ts-ignore - Only for native platforms
import LottieView from 'lottie-react-native';

// Route params are centralized in `../constants/routes`

type Attachment = {
  uri: string;
  type: 'photo' | 'video';
  name: string;
};

const resolveOpenAIApiKey = () => {
  const extras = (Constants?.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const keyFromExtras = typeof extras.openAiApiKey === 'string' ? extras.openAiApiKey : undefined;

  return (
    process.env.EXPO_PUBLIC_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    keyFromExtras ||
    ''
  );
};

export default function Landing() {
  const router = useRouter();
  const lottieRef = useRef<any>(null);
  const helpLottieRef = useRef<any>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
  const [canRenderLottie, setCanRenderLottie] = useState(Platform.OS !== 'web');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const landingScaleAnim = useRef(new Animated.Value(0.9)).current;
  const openAiApiKey = useMemo(resolveOpenAIApiKey, []);
  const [jobDescription, setJobDescription] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const voicePulseValue = useRef(new Animated.Value(1)).current;
  const voicePulseAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  useEffect(() => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      setCanRenderLottie(false);
      const task = InteractionManager?.runAfterInteractions?.(() => setCanRenderLottie(true));
      // @ts-ignore - the cancel property is still optional in some environments
      return () => task?.cancel?.();
    }

    // Web and other platforms don't need the interaction guard
    setCanRenderLottie(true);
  }, []);

  useEffect(() => {
  fadeAnim.setValue(0);
  landingScaleAnim.setValue(0.9);
    const fadeInAnimation = Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1700,
        delay: 150,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
      Animated.timing(landingScaleAnim, {
        toValue: 1,
        duration: 1700,
        delay: 150,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
    ]);

    fadeInAnimation.start();

    return () => {
      fadeInAnimation.stop();
    };
  }, [fadeAnim, landingScaleAnim]);

  useEffect(() => {
    if (isRecording) {
      voicePulseAnimationRef.current?.stop();
      voicePulseAnimationRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(voicePulseValue, {
            toValue: 1.2,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(voicePulseValue, {
            toValue: 1,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      voicePulseAnimationRef.current.start();
    } else {
      voicePulseAnimationRef.current?.stop();
      voicePulseValue.setValue(1);
    }

    return () => {
      voicePulseAnimationRef.current?.stop();
    };
  }, [isRecording, voicePulseValue]);

  useEffect(() => {
    return () => {
      voicePulseAnimationRef.current?.stop();
      const currentRecording = recordingRef.current;
      if (currentRecording) {
        currentRecording.stopAndUnloadAsync().catch(() => undefined);
      }
    };
  }, []);

  const navigate = (route: keyof RouteParams) => router.push(route as any);

  const handleDescriptionChange = useCallback((text: string) => {
    setJobDescription(text);
  }, []);

  const handleMediaUpload = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Enable photo library access to add photos or videos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: false,
        quality: 0.8,
      });

      if (result.canceled || !(result.assets && result.assets.length > 0)) {
        return;
      }

      const asset = result.assets[0];
      const type = asset.type === 'video' ? 'video' : 'photo';
      const name = asset.fileName ?? (type === 'video' ? 'video-upload.mp4' : 'photo-upload.jpg');

      setAttachments(prev => [...prev, { uri: asset.uri, type, name }]);
    } catch (error) {
      console.warn('Media picker error', error);
      Alert.alert('Upload failed', 'Unable to select media right now.');
    }
  }, []);

  const transcribeAudioAsync = useCallback(
    async (uri: string) => {
      if (!openAiApiKey) {
        Alert.alert('Missing API key', 'Add an OpenAI API key to enable voice mode.');
        return '';
      }

      try {
        const formData = new FormData();
        formData.append('file', {
          uri,
          name: 'voice-input.m4a',
          type: Platform.select({ ios: 'audio/m4a', android: 'audio/mpeg', default: 'audio/m4a' }),
        } as any);
        formData.append('model', 'gpt-4o-mini-transcribe');

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openAiApiKey}`,
          },
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Transcription failed');
        }

        const data = await response.json();
        const text = typeof data?.text === 'string' ? data.text.trim() : '';

        return text;
      } catch (error) {
        console.warn('Transcription error', error);
        Alert.alert('Transcription failed', 'Unable to transcribe your recording.');
        return '';
      } finally {
        FileSystem.deleteAsync(uri).catch(() => undefined);
      }
    },
    [openAiApiKey],
  );

  const stopRecordingAndTranscribe = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) {
      setIsRecording(false);
      return;
    }

    try {
      await recording.stopAndUnloadAsync();
    } catch (error) {
      console.warn('Failed to stop recording', error);
    }

    setIsRecording(false);

    const uri = recording.getURI();
    recordingRef.current = null;

    if (!uri) {
      return;
    }

    setIsTranscribing(true);
    try {
      const transcript = await transcribeAudioAsync(uri);
      if (transcript) {
        setJobDescription(prev => {
          const trimmedPrev = prev.trim();
          const combined = trimmedPrev.length > 0 ? `${trimmedPrev} ${transcript}` : transcript;
          return combined.trim();
        });
      }
    } finally {
      setIsTranscribing(false);
    }
  }, [transcribeAudioAsync]);

  const handleVoiceModePress = useCallback(async () => {
    if (isTranscribing) {
      return;
    }

    if (isRecording) {
      await stopRecordingAndTranscribe();
      return;
    }

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Microphone needed', 'Enable microphone access to use voice mode.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      recordingRef.current = recording;
      setIsRecording(true);
    } catch (error) {
      console.warn('Failed to start recording', error);
      Alert.alert('Recording failed', 'Unable to start voice mode.');
    }
  }, [isRecording, isTranscribing, stopRecordingAndTranscribe]);

  const handleMenuPress = () => {
    if (Platform.OS === 'web') {
      setIsMenuOpen((v) => !v);
      return;
    }
    if (lottieRef.current) {
      if (isMenuOpen) lottieRef.current.play(24, 0);
      else lottieRef.current.play(0, 24);
    }
    setIsMenuOpen((v) => !v);
  };

   const handleHelpPress = () => {
    if (Platform.OS === 'web') {
      setIsHelpMenuOpen((v) => !v);
      return;
    }
    if (helpLottieRef.current) {
      if (isHelpMenuOpen) helpLottieRef.current.play(24, 0);
      else helpLottieRef.current.play(0, 24);
    }
    setIsHelpMenuOpen((v) => !v);
  };

  const voiceIconSvg = `
    <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="#0c4309"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none" stroke="#0c4309" stroke-width="2"/>
      <line x1="12" y1="19" x2="12" y2="23" stroke="#0c4309" stroke-width="2"/>
      <line x1="8" y1="23" x2="16" y2="23" stroke="#0c4309" stroke-width="2"/>
    </svg>
  `;

  const cameraIconSvg = `
    <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" fill="none" stroke="#ffffff" stroke-width="2"/>
      <circle cx="12" cy="13" r="4" fill="none" stroke="#ffffff" stroke-width="2"/>
    </svg>
  `;
   
   const helpIconSvg = `
    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="none" stroke="#0c4309" stroke-width="2"/>
      <path d="M10 10a2 2 0 0 1 2-2c1.1 0 2 .9 2 2 0 .7-.3 1.3-.8 1.7l-.2.2c-.3.3-.5.6-.5 1" fill="none" stroke="#0c4309" stroke-width="2"/>
      <circle cx="12" cy="16" r="1" fill="#0c4309"/>
    </svg>
  `;
  
  const services: { id: string; title: string; image: ImageSourcePropType; route: keyof RouteParams }[] = [
    { id: '1', title: 'Moving', image: require('../assets/images/moving.png'), route: 'moving' },
    { id: '2', title: 'Cleaning', image: require('../assets/images/cleaning.png'), route: 'cleaning' },
    { id: '3', title: 'Wall Mounting', image: require('../assets/images/wall-mounting.png'), route: 'wall-mounting' },
    { id: '4', title: 'Furniture Assembly', image: require('../assets/images/furniture-assembly.png'), route: 'furniture-assembly' },
    { id: '5', title: 'Home Improvement', image: require('../assets/images/home-improvement.png'), route: 'home-improvement' },
    { id: '6', title: 'Running Errands', image: require('../assets/images/running-errands.png'), route: 'running-errands' },
  ];

  const renderService = ({ item }: { item: { id: string; title: string; image: ImageSourcePropType; route: keyof RouteParams } }) => (
    <Pressable onPress={() => navigate(item.route)} style={styles.serviceItem}>
      <View>
        <Image source={item.image} style={styles.serviceImage} />
      </View>
      <Text style={styles.serviceTitle}>{item.title}</Text>
    </Pressable>
  );

  return (
    // root without padding so overlay anchors to the real screen edges
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
  <Animated.View style={[styles.fadeContainer, { opacity: fadeAnim, transform: [{ scale: landingScaleAnim }] }]}> 
        <KeyboardAvoidingView
          style={styles.root}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
        >
        <StatusBar style="dark" backgroundColor="#0c4309" />
        <View style={styles.container}>
          <View style={styles.contentArea}>
            <Text style={styles.title}>What can we help with?</Text>
            <Text style={styles.popularTitle}>Popular Services</Text>
          <View style={styles.servicesWrapper}>
            <FlatList
              data={services}
              renderItem={renderService}
              keyExtractor={(item) => item.id}
              numColumns={3}
              columnWrapperStyle={styles.row}
              contentContainerStyle={styles.listContent}
              scrollEnabled={false}
            />
          </View>

          <View style={styles.orContainer}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>or</Text>
            <View style={styles.orLine} />
          </View>

          <Text style={styles.makeYourCustomServiceText}>Make A Custom Service</Text>
          <View style={styles.jobDescriptionContainer}>
            <TextInput
              style={styles.jobDescriptionText}
              placeholder="Describe exactly what you need...                   (For Example: I need my dogs picked up from doggy daycare.)"
              multiline
              numberOfLines={4}
              placeholderTextColor="#666666"
              value={jobDescription}
              onChangeText={handleDescriptionChange}
              editable={!isTranscribing}
            />
              <View style={styles.inputButtonsContainer}>
                <View style={styles.voiceContainer}>
                  <Pressable
                    style={[styles.voiceButton, (isRecording || isTranscribing) && styles.voiceButtonActive]}
                    onPress={handleVoiceModePress}
                    disabled={isTranscribing}
                  >
                    <Animated.View style={{ transform: [{ scale: voicePulseValue }] }}>
                      <SvgXml xml={voiceIconSvg} width="20" height="20" />
                    </Animated.View>
                  </Pressable>
                  <View style={styles.voiceStatusRow}>
                    <Text style={styles.inputButtonsText}>
                      {isRecording ? 'Listening…' : isTranscribing ? 'Processing…' : 'Voice Mode'}
                    </Text>
                    {isTranscribing ? <ActivityIndicator size="small" color="#0c4309" style={styles.voiceStatusSpinner} /> : null}
                  </View>
                </View>
                <View style={styles.cameraContainer}> 
                  <Text style={styles.inputButtonsText}>Add Photo or Video</Text> 
                  <Pressable style={styles.cameraButton} onPress={handleMediaUpload}>
                    <SvgXml xml={cameraIconSvg} width="20" height="20" />
                  </Pressable>
                </View>
              </View>
              {attachments.length > 0 ? (
                <View style={styles.attachmentsSummary}>
                  <Text style={styles.attachmentsSummaryText}>
                    {attachments.length} file{attachments.length > 1 ? 's' : ''} attached
                  </Text>
                </View>
              ) : null}
          </View>
        </View>
      </View>

      {/* Screen-wide overlay, outside the padded container (true screen edges) */}
      <View pointerEvents="box-none" style={styles.overlay}>
        {/* Large animation view (visual only, no touches) */}
        <View style={[styles.menuButton, { pointerEvents: 'none', backgroundColor: 'transparent' }]}>
          {Platform.OS === 'web' || !canRenderLottie ? (
            <Text style={[styles.menuIconTextLarge, { color: '#0c4309' }]}>☰</Text>
          ) : (
            <LottieView
              ref={lottieRef}
              source={require('../assets/animations/menuButtonAnimation.json')}
              autoPlay={false}
              loop={false}
              style={styles.lottieAnimationLarge}
            />
          )}
        </View>
        
        {/* Small pressable area for toggling (matches closed button size) */}
        <Pressable 
          onPress={handleMenuPress} 
          style={styles.menuTogglePressable}
        />

        <View style={[styles.helpButton, { pointerEvents: 'none', backgroundColor: 'transparent' }]}>
          {Platform.OS === 'web' || !canRenderLottie ? (
            <SvgXml xml={helpIconSvg} width="20" height="20" />
          ) : (
            <LottieView
              ref={helpLottieRef}
              source={require('../assets/animations/helpButtonAnimation.json')}
              autoPlay={false}
              loop={false}
              style={styles.lottieAnimationLarge}
            />
          )}
        </View>
        
        {/* Small pressable area for toggling (matches closed button size) */}
        <Pressable 
          onPress={handleHelpPress} 
          style={styles.helpTogglePressable}
        />
  
        {/* Invisible overlay with visible menu items */}
        {isMenuOpen && (
          <>
          {/* Full-screen dismiss overlay (taps here close the menu) */}
          <Pressable
            style={styles.dismissOverlay}
            onPress={() => {
              if (Platform.OS !== 'web' && lottieRef.current) {
                lottieRef.current.play(24, 0); // Reverse the open animation
              }
              setIsMenuOpen(false);
            }}
          />
          {/* Menu Overlay */}
          <View style={styles.menuOverlay}>
            <View style={styles.menuContainer}>
              <Pressable 
                style={styles.menuItem} 
                onPress={() => {
                  setIsMenuOpen(false);
                  navigate('booked-services');
                }}
              >
                <View style={styles.menuItemRow}>
                  <Text style={styles.menuItemText}>Booked Services</Text>
                </View>
              </Pressable>
              
              <Pressable 
                style={styles.menuItem} 
                onPress={() => {
                  setIsMenuOpen(false);
                  navigate('past-services');
                }}
              >
                <View style={styles.menuItemRow}>
                  <Text style={styles.menuItemText}>Past Services</Text>
                </View>
              </Pressable>
              
              <Pressable 
                style={styles.menuItem} 
                onPress={() => {
                  setIsMenuOpen(false);
                  navigate('account');
                }}
              >
                <View style={styles.menuItemRow}>
                  <Text style={styles.menuItemText}>Account</Text>
                </View>
              </Pressable>
            </View>
          </View>
          </>
        )}
        {isHelpMenuOpen && (
          <>
          {/* Full-screen dismiss overlay (taps here close the help menu) */}
          <Pressable
            style={styles.dismissOverlay}
            onPress={() => {
              if (Platform.OS !== 'web' && helpLottieRef.current) {
                helpLottieRef.current.play(24, 0); // Reverse the open animation
              }
              setIsHelpMenuOpen(false);
            }}
          />
          {/* Help Button overlay */}
          <View style={styles.helpMenuOverlay}>
            <View style={styles.helpMenuContainer}>
              <Pressable 
                style={styles.helpMenuItem} 
                onPress={() => {
                  setIsMenuOpen(false);
                  navigate('customer-service-chat');
                }}
              >
              <View style={styles.menuItemRow}>
                <Text style={styles.menuItemText}>Customer Service Chat</Text>
              </View>
              </Pressable>
            </View>
          </View>
          </>
        )}
        </View>
      </KeyboardAvoidingView>
      </Animated.View>
    </TouchableWithoutFeedback>
  );  
}

const styles = StyleSheet.create({
  // New root: no padding so overlay sits at true screen edges
  root: {
    flex: 1,
    backgroundColor: '#FFF8E8',
  },
  fadeContainer: {
    flex: 1,
    backgroundColor: '#FFF8E8',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingTop: 80,
  },
  contentArea: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingBottom: 50,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'box-none',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0c4309',
    marginBottom: 10,
    marginTop: 10,
    textAlign: 'center',
  },
  popularTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0c4309',
    marginBottom: 5,
    marginTop: 5,
    textAlign: 'center',
  },
  servicesWrapper: {
    height: 300,
  },
  listContent: {
    paddingTop: 15,
    paddingBottom: 10,
  },
  row: {
    justifyContent: 'space-evenly',
    gap: 10,
  },
  serviceItem: {
    flex: 1,
    alignItems: 'center',
    marginBottom: 15,
    marginTop: 5,
    maxWidth: '30%',
  },
  serviceImage: {
    width: 90,
    height: 90,
    borderRadius: 12,
  },
  serviceTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0c4309',
    marginTop: 10,
    textAlign: 'center',
  },
  orContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 15,
  },
  orText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#0c4309',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  orLine: {
    width: 140,
    height: 1,
    backgroundColor: '#cfbf9dff',
  },
  makeYourCustomServiceText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0c4309',
    textAlign: 'center',
    paddingTop: 5,
    paddingBottom: 15,
  },
  jobDescriptionContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingTop: 10,
    marginBottom: 20,
    height: 150,
    borderWidth: 1,
    borderColor: '#e1e1e1ff'
  },
  jobDescriptionText: {

    color: '#333333',
    fontSize: 16,
    textAlign: 'left',
    textAlignVertical: 'top',
    paddingLeft: 15,
    paddingRight: 20,
  },
  inputButtonsContainer: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
     // Adjusted gap to account for added text width
  },
  voiceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cameraContainer: {
    flexDirection: 'row',
    alignItems: 'center',
     // Space between text and camera button
  },
  voiceButton: {
    width: 60,
    height: 40,
    borderRadius:20,
    backgroundColor: '#E5DCC9',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  voiceButtonActive: {
    backgroundColor: '#d6c5a5',
  },
  voiceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginLeft: 6,
    marginBottom: 4,
  },
  voiceStatusSpinner: {
    marginLeft: 4,
  },
  inputButtonsText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#0c4309',
    textAlign: 'center',
  },
  cameraButton: {
    width: 60,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0c4309',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    marginLeft: 8,
  },
  inputButtonIcon: {
    fontSize: 16,
    marginRight: 0,
  },
  attachmentsSummary: {
    marginTop: 8,
    marginLeft: 15,
  },
  attachmentsSummaryText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#0c4309',
  },
  // Menu button positioned consistently in bottom left corner across all devices
  menuButton: {
    position: 'absolute',
    left: -380,      // distance from left edge
    bottom: -350,    // distance from bottom edge (accounts for typical safe areas)
    width: 900,    // consistent size across devices
    height: 900,
  },

  helpButton: {
    position: 'absolute',
    left: -200,      // distance from left edge
    bottom: -305,    // distance from bottom edge (accounts for typical safe areas)
    width: 900,    // consistent size across devices
    height: 900,
  },

  menuTogglePressable: {
  position: 'absolute',
  left: 35,  // Adjust as needed for your button's visible position
  bottom: 35,   // Use safe area for bottom padding
  width: 70,  // Size to match closed button (tune based on your animation/icon)
  height: 70,
  borderRadius: 70, // Make it circular
  backgroundColor: 'transp',  // Invisible hit area
  
  
  // Optional: add hitSlop if you want to slightly enlarge the touch target without changing visual size
  // hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
  },
  
  helpTogglePressable: {
    position: 'absolute',
    right: 35,
    bottom: 35,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'transparent',
  },

  lottieAnimationLarge: {
    width: '100%',
    height: '100%',
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  menuIconTextLarge: {
    fontSize: 120,
    fontWeight: 'bold',
  },
  dismissOverlay: {
  ...StyleSheet.absoluteFillObject, // Covers entire screen
  backgroundColor: 'transparent', // Or 'rgba(0, 0, 0, 0.4)' for dimming
  zIndex: 998, // Below menu
  },
  // Invisible overlay that positions menu items over the animation
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent', // Completely invisible
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    zIndex: 1000,
    pointerEvents: 'box-none', // Allow touches to pass through to background
  },
  menuContainer: {
    backgroundColor: 'transparent', // Container is also invisible
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginLeft: 38, // Position relative to menu button
    marginBottom: 98, // Shifted down - reduced from 160 to 80
  },
  helpMenuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    zIndex: 1000,
    pointerEvents: 'box-none',
  },
  helpMenuContainer: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginRight: 70,
    marginBottom: 125,
  },
  menuItem: {
    backgroundColor: 'transparent', // Light beige background like your screenshot
    paddingVertical: 17,
    paddingHorizontal: 25,
    borderRadius: 8,
    marginVertical: 2,
    minWidth: 200,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  helpMenuItem: {
    backgroundColor: 'transparent', // Light beige background like your screenshot
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginVertical: 2,
    marginHorizontal: 20,
    minWidth: 90,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemText: {
    color: 'transparent',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
});

