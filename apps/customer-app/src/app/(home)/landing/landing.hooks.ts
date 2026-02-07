import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, InteractionManager, Platform } from 'react-native';

import { RouteParams } from '../../../constants/routes';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';
import { hasShownSelectProModal, markSelectProModalShown, resetSelectProModalTracker } from '../../../lib/selectProModalTracker';
import { supabase } from '../../../lib/supabase';
import { LandingServiceItem, NavigateFn } from './landing.types';

export function useLandingScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { showModal } = useModal();
  const isScreenFocused = useIsFocused();

  const lottieRef = useRef<any>(null);
  const helpLottieRef = useRef<any>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
  const [canRenderLottie, setCanRenderLottie] = useState(Platform.OS !== 'web');

  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousServiceStatusesRef = useRef<Record<string, string>>({});

  const userEmail = user?.email ?? null;

  // Lottie render guard for native
  useEffect(() => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      setCanRenderLottie(false);
      const task = InteractionManager?.runAfterInteractions?.(() => setCanRenderLottie(true));
      // @ts-ignore - cancel is optional in some envs
      return () => task?.cancel?.();
    }

    setCanRenderLottie(true);
  }, []);

  // Smooth fade in
  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1200,
      delay: 0,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Reset tracking when user logs out
  useEffect(() => {
    if (!user) {
      previousServiceStatusesRef.current = {};
      resetSelectProModalTracker();
    }
  }, [user]);

  const navigate: NavigateFn = useCallback(
    (route: keyof RouteParams) => {
      const serviceRoutes = ['moving', 'cleaning', 'furniture-assembly', 'home-improvement', 'wall-mounting', 'custom-service'];
      const bookingFlowRoutes = ['booked-services', 'past-services', 'select-helpr', 'service-details'];
      const homeRoutes = ['account', 'customer-service-chat'];

      if (serviceRoutes.includes(route as any)) {
        router.push(`/(services)/${route}` as any);
      } else if (bookingFlowRoutes.includes(route as any)) {
        router.push(`/(booking-flow)/${route}` as any);
      } else if (homeRoutes.includes(route as any)) {
        router.push(`/(home)/${route}` as any);
      } else {
        router.push(`/(auth)/${route}` as any);
      }
    },
    [router],
  );

  const handleAccountPress = useCallback(() => {
    setIsMenuOpen(false);
    navigate(user ? 'account' : 'signup');
  }, [navigate, user]);

  const evaluateServiceStatuses = useCallback(async () => {
    if (!isScreenFocused || authLoading) return;
    if (!userEmail) return;

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
        if (!row?.service_id) return;

        const normalizedStatus = (row.status ?? '').toLowerCase();
        nextStatuses[row.service_id] = normalizedStatus;

        const previousStatus = previousServiceStatusesRef.current[row.service_id];
        const hasShownModal = hasShownSelectProModal(row.service_id);

        if (previousStatus === 'finding_pros' && normalizedStatus === 'select_service_provider' && !hasShownModal) {
          markSelectProModalShown(row.service_id);
          showModal({
            title: 'Select a Pro',
            message: "Workers are available to fill your request! Select a pro when you're ready.",
            buttons: [
              {
                text: 'Go',
                onPress: () => router.push('/(booking-flow)/booked-services' as never),
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

  const handleMenuPress = useCallback(() => {
    if (Platform.OS === 'web') {
      setIsMenuOpen(v => !v);
      return;
    }

    if (lottieRef.current) {
      if (isMenuOpen) lottieRef.current.play(24, 0);
      else lottieRef.current.play(0, 24);
    }
    setIsMenuOpen(v => !v);
  }, [isMenuOpen]);

  const handleHelpPress = useCallback(() => {
    if (Platform.OS === 'web') {
      setIsHelpMenuOpen(v => !v);
      return;
    }

    if (helpLottieRef.current) {
      if (isHelpMenuOpen) helpLottieRef.current.play(24, 0);
      else helpLottieRef.current.play(0, 24);
    }
    setIsHelpMenuOpen(v => !v);
  }, [isHelpMenuOpen]);

  const closeMenu = useCallback(() => {
    if (Platform.OS !== 'web' && lottieRef.current) {
      lottieRef.current.play(24, 0);
    }
    setIsMenuOpen(false);
  }, []);

  const closeHelpMenu = useCallback(() => {
    if (Platform.OS !== 'web' && helpLottieRef.current) {
      helpLottieRef.current.play(24, 0);
    }
    setIsHelpMenuOpen(false);
  }, []);

  const services: LandingServiceItem[] = useMemo(
    () => [
      { id: '1', title: 'Moving', image: require('../../../assets/images/moving.png'), route: 'moving' },
      { id: '2', title: 'Cleaning', image: require('../../../assets/images/cleaning.png'), route: 'cleaning' },
      { id: '3', title: 'Wall Mounting', image: require('../../../assets/images/wall-mounting.png'), route: 'wall-mounting' },
      { id: '4', title: 'Furniture Assembly', image: require('../../../assets/images/furniture-assembly.png'), route: 'furniture-assembly' },
      { id: '5', title: 'Home Improvement', image: require('../../../assets/images/home-improvement.png'), route: 'home-improvement' },
    ],
    [],
  );

  return {
    fadeAnim,
    canRenderLottie,
    lottieRef,
    helpLottieRef,
    isMenuOpen,
    isHelpMenuOpen,
    navigate,
    handleAccountPress,
    handleMenuPress,
    handleHelpPress,
    closeMenu,
    closeHelpMenu,
    services,
  };
}



















