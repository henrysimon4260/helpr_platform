import { useIsFocused } from '@react-navigation/native';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Image, ImageSourcePropType, InteractionManager, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { RouteParams } from '../../constants/routes';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { hasShownSelectProModal, markSelectProModalShown, resetSelectProModalTracker } from '../../lib/selectProModalTracker';
import { supabase } from '../../lib/supabase';
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
  const { user, loading: authLoading } = useAuth();
  const searchParams = useLocalSearchParams();
  const showSplash = searchParams.splash === 'true';
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
  const { showModal } = useModal();
  const voicePulseValue = useRef(new Animated.Value(1)).current;
  const voicePulseAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const isScreenFocused = useIsFocused();
  const userEmail = user?.email ?? null;
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousServiceStatusesRef = useRef<Record<string, string>>({});

  const splashFadeAnim = useRef(new Animated.Value(1)).current;
  const splashScaleAnim = useRef(new Animated.Value(1)).current;

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
    if (showSplash) {
      // Animate splash away
      const dissolveAnimation = Animated.parallel([
        Animated.timing(splashFadeAnim, {
          toValue: 0,
          duration: 1400,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }),
        Animated.timing(splashScaleAnim, {
          toValue: 0.95,
          duration: 1400,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }),
      ]);
      dissolveAnimation.start();
      // Set landing to visible immediately
      fadeAnim.setValue(1);
      landingScaleAnim.setValue(1);
    } else {
      // Normal fade in
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
    }

    return () => {
      if (showSplash) {
        // Stop splash animation
      } else {
        // Stop fade in
      }
    };
  }, [fadeAnim, landingScaleAnim, splashFadeAnim, splashScaleAnim, showSplash]);

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

  useEffect(() => {
    if (!user) {
      previousServiceStatusesRef.current = {};
      resetSelectProModalTracker();
    }
  }, [user]);

  const evaluateServiceStatuses = useCallback(async () => {
    if (!isScreenFocused || authLoading) {
      return;
    }

    if (!userEmail) {
      return;
    }

    try {
      const { data: customer, error: customerError } = await supabase
        .from('customer')
        .select('customer_id')
  .eq('email', userEmail)
        .maybeSingle();

      if (customerError) {
        console.error('Landing status watch failed to load customer record:', customerError);
        return;
      }

      if (!customer?.customer_id) {
        previousServiceStatusesRef.current = {};
        return;
      }

      const { data: services, error: servicesError } = await supabase
        .from('service')
        .select('service_id, status')
        .eq('customer_id', customer.customer_id);

      if (servicesError) {
        console.error('Landing status watch failed to load services:', servicesError);
        return;
      }

      const nextStatuses: Record<string, string> = {};
      services?.forEach((row: { service_id?: string | null; status?: string | null }) => {
        if (!row?.service_id) {
          return;
        }
        const normalizedStatus = (row.status ?? '').toLowerCase();
        nextStatuses[row.service_id] = normalizedStatus;

        const previousStatus = previousServiceStatusesRef.current[row.service_id];
        const hasShownModal = hasShownSelectProModal(row.service_id);

        if (
          previousStatus === 'finding_pros' &&
          normalizedStatus === 'select_service_provider' &&
          !hasShownModal
        ) {
          markSelectProModalShown(row.service_id);
          showModal({
            title: 'Select a Pro',
            message: 'Workers are available to fill your request! Select a pro when you\'re ready.',
            buttons: [
              {
                text: 'Go',
                onPress: () => router.push('/booked-services' as never),
              },
            ],
          });
        }
      });

      previousServiceStatusesRef.current = nextStatuses;
    } catch (error) {
      console.error('Landing status watch encountered an unexpected error:', error);
    }
  }, [authLoading, isScreenFocused, router, showModal, userEmail]);

  useEffect(() => {
    if (!isScreenFocused) {
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
        statusPollRef.current = null;
      }
      return;
    }

    evaluateServiceStatuses();

    statusPollRef.current = setInterval(() => {
      evaluateServiceStatuses();
    }, 5000);

    return () => {
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
        statusPollRef.current = null;
      }
    };
  }, [evaluateServiceStatuses, isScreenFocused]);

  const navigate = (route: keyof RouteParams) => router.push(route as any);

  const handleAccountPress = useCallback(() => {
    setIsMenuOpen(false);
    navigate(user ? 'account' : 'signup');
  }, [navigate, user]);

  const handleDescriptionChange = useCallback((text: string) => {
    setJobDescription(text);
  }, []);

  const handleMediaUpload = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showModal({
          title: 'Permission needed',
          message: 'Enable photo library access to add photos or videos.',
        });
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
      showModal({
        title: 'Upload failed',
        message: 'Unable to select media right now.',
      });
    }
  }, [showModal]);

  const handleCustomServiceContinue = useCallback(() => {
    if (jobDescription.trim().length === 0) {
      showModal({
        title: 'Add a description',
        message: 'Please describe your custom service before continuing.',
      });
      return;
    }

    router.push('/customService' as never);
  }, [jobDescription, router, showModal]);
  const transcribeAudioAsync = useCallback(
    async (uri: string) => {
      if (!openAiApiKey) {
  showModal({
          title: 'Missing API key',
          message: 'Add an OpenAI API key to enable voice mode.',
        });
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
  showModal({
          title: 'Transcription failed',
          message: 'Unable to transcribe your recording.',
        });
        return '';
      } finally {
        FileSystem.deleteAsync(uri).catch(() => undefined);
      }
    },
    [openAiApiKey, showModal],
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
  showModal({
          title: 'Microphone needed',
          message: 'Enable microphone access to use voice mode.',
        });
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
      showModal({
        title: 'Recording failed',
        message: 'Unable to start voice mode.',
      });
    }
  }, [isRecording, isTranscribing, showModal, stopRecordingAndTranscribe]);

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

  const arrowRightSvg = `
    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 12h14M12 5l7 7-7 7" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
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
    { id: '1', title: 'Moving', image: require('../../assets/images/moving.png'), route: 'moving' },
    { id: '2', title: 'Cleaning', image: require('../../assets/images/cleaning.png'), route: 'cleaning' },
    { id: '3', title: 'Wall Mounting', image: require('../../assets/images/wall-mounting.png'), route: 'wall-mounting' },
    { id: '4', title: 'Furniture Assembly', image: require('../../assets/images/furniture-assembly.png'), route: 'furniture-assembly' },
    { id: '5', title: 'Home Improvement', image: require('../../assets/images/home-improvement.png'), route: 'home-improvement' },
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
              source={require('../../assets/animations/menuButtonAnimation.json')}
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
              source={require('../../assets/animations/helpButtonAnimation.json')}
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
                onPress={handleAccountPress}
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

      {showSplash && (
        <Animated.View style={[
          styles.splashOverlay,
          { 
            opacity: splashFadeAnim,
            transform: [{ scale: splashScaleAnim }]
          }
        ]}>
          <Image 
            source={require('../../assets/images/splash.png')}
            style={styles.splashImage}
            resizeMode="cover"
          />
        </Animated.View>
      )}
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
    marginBottom: 20,
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
    justifyContent: 'center',
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
    marginTop: 10,
  },
  jobDescriptionContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingTop: 10,
    paddingBottom: 10,
    height: 150,
    borderWidth: 1,
    borderColor: '#e1e1e1ff'
  },
  jobDescriptionText: {
    flex: 1,
    color: '#333333',
    fontSize: 16,
    textAlign: 'left',
    textAlignVertical: 'top',
    paddingLeft: 15,
    paddingRight: 15,
    paddingBottom: 50,
  },
  inputButtonsContainer: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cameraButton: {
    width: 50,
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
  },
  attachmentCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0c4309',
    marginLeft: 10,
  },
  continueButtonInline: {
    minWidth: 72,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0c4309',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  continueButtonText: {
    color: '#FFF8E8',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 6,
    textTransform: 'uppercase',
  },
  continueButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  continueButtonLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
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
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
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
  splashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  splashImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});

