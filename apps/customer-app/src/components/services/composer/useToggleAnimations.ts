import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

export function useToggleAnimations() {
  const [isAuto, setIsAuto] = useState(false);
  const [isPersonal, setIsPersonal] = useState(true);
  const slideAnimation = useRef(new Animated.Value(0)).current;
  const slideAnimation2 = useRef(new Animated.Value(0)).current;
  const slideAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const slideAnimation2Ref = useRef<Animated.CompositeAnimation | null>(null);

  const handleAutoToggle = useCallback(() => {
    setIsAuto(prev => {
      const next = !prev;
      slideAnimationRef.current?.stop();
      slideAnimationRef.current = Animated.spring(slideAnimation, {
        toValue: next ? 1 : 0,
        useNativeDriver: false,
        friction: 8,
        tension: 50,
      });
      slideAnimationRef.current.start();
      return next;
    });
  }, [slideAnimation]);

  const handlePersonalToggle = useCallback(() => {
    setIsPersonal(prev => {
      const next = !prev;
      slideAnimation2Ref.current?.stop();
      slideAnimation2Ref.current = Animated.spring(slideAnimation2, {
        toValue: next ? 0 : 1,
        useNativeDriver: false,
        friction: 8,
        tension: 50,
      });
      slideAnimation2Ref.current.start();
      return next;
    });
  }, [slideAnimation2]);

  const restoreToggles = useCallback((nextIsAuto: boolean, nextIsPersonal: boolean) => {
    setIsAuto(nextIsAuto);
    setIsPersonal(nextIsPersonal);
    slideAnimation.setValue(nextIsAuto ? 1 : 0);
    slideAnimation2.setValue(nextIsPersonal ? 0 : 1);
  }, [slideAnimation, slideAnimation2]);

  useEffect(() => {
    return () => {
      slideAnimationRef.current?.stop();
      slideAnimation2Ref.current?.stop();
    };
  }, []);

  return {
    isAuto,
    isPersonal,
    slideAnimation,
    slideAnimation2,
    handleAutoToggle,
    handlePersonalToggle,
    restoreToggles,
  };
}
