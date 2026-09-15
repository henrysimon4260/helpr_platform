import { useCallback, useState } from 'react';

import { QuestionDef, SelectedLocation } from './types';
import { containsStreetNumber } from './utils';

interface QuestionFlowProps {
  questions: QuestionDef[];
  answers: Record<string, string>;
  description: string;
  locationMode: 'single' | 'dual';
  startQuery: string;
  endQuery: string;
  startLocation: SelectedLocation | null;
  endLocation: SelectedLocation | null;
  showModal: (config: { title: string; message: string }) => void;
}

export function applyAnswersToDescription(originalDescription: string, questions: QuestionDef[], answers: Record<string, string>) {
  let next = originalDescription.trim();
  const appendSentence = (sentence: string) => {
    const normalized = sentence.trim();
    if (!normalized || next.toLowerCase().includes(normalized.toLowerCase())) return;
    if (next.length > 0 && !/[.!?]$/.test(next)) next += '.';
    next = next.length > 0 ? `${next} ${normalized}` : normalized;
  };

  questions.forEach(question => {
    if (question.kind === 'photos') return;
    const value = answers[question.id];
    if (!value?.trim()) return;
    if (question.toSentence) {
      const sentence = question.toSentence(value);
      if (sentence) appendSentence(sentence);
      return;
    }
    if (question.id === 'details') {
      appendSentence(value);
    }
  });

  return next;
}

export function useQuestionFlow({
  questions,
  answers,
  description,
  locationMode,
  startQuery,
  endQuery,
  startLocation,
  endLocation,
  showModal,
}: QuestionFlowProps) {
  const [visible, setVisible] = useState(false);
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [promptingCompleted, setPromptingCompleted] = useState(false);

  const visibleQuestions = useCallback((currentAnswers: Record<string, string>, text: string) => {
    return questions.filter(question => {
      if (question.skipIf?.(currentAnswers)) return false;
      if (question.kind === 'photos' || question.id === 'details') return true;
      if (question.detectInDescription?.(text)) return false;
      return true;
    });
  }, [questions]);

  const startPromptingFlow = useCallback(() => {
    if (promptingCompleted || visible) return;

    const startHasNumber = containsStreetNumber(startQuery) || containsStreetNumber(startLocation?.description ?? '');
    const endHasNumber = containsStreetNumber(endQuery) || containsStreetNumber(endLocation?.description ?? '');

    if (locationMode === 'single') {
      if (startQuery && !startHasNumber) {
        showModal({
          title: 'Add street number',
          message: 'Update your location to include the street number so your helpr can find you.',
        });
        return;
      }
    } else {
      const missing: Array<'start' | 'end'> = [];
      if (startQuery && !startHasNumber) missing.push('start');
      if (endQuery && !endHasNumber) missing.push('end');
      if (missing.length > 0) {
        const needsBoth = missing.length === 2;
        showModal({
          title: needsBoth ? 'Add street numbers' : missing[0] === 'start' ? 'Add an exact street number for your starting location' : 'Add an exact street number for your ending location',
          message: needsBoth ? 'Update both start and end locations to include street numbers.' : missing[0] === 'start' ? 'Update your start location to include the street number.' : 'Update your end location to include the street number.',
        });
        return;
      }
    }

    const queue = visibleQuestions(answers, description);
    if (queue.length === 0) {
      setPromptingCompleted(true);
      return;
    }

    setHistory([queue[0].id]);
    setCurrentQuestionId(queue[0].id);
    setVisible(true);
  }, [
    answers,
    description,
    endLocation,
    endQuery,
    locationMode,
    promptingCompleted,
    showModal,
    startLocation,
    startQuery,
    visible,
    visibleQuestions,
  ]);

  const handleBack = useCallback(() => {
    if (history.length <= 1) {
      setVisible(false);
      setCurrentQuestionId(null);
      setHistory([]);
      return;
    }
    const nextHistory = history.slice(0, -1);
    setHistory(nextHistory);
    setCurrentQuestionId(nextHistory[nextHistory.length - 1]);
  }, [history]);

  const handleNext = useCallback((): boolean => {
    const queue = visibleQuestions(answers, description);
    const currentIndex = currentQuestionId ? queue.findIndex(q => q.id === currentQuestionId) : -1;
    const nextQuestion = queue[currentIndex + 1];

    if (nextQuestion) {
      setHistory(prev => [...prev, nextQuestion.id]);
      setCurrentQuestionId(nextQuestion.id);
      return false;
    }

    setVisible(false);
    setCurrentQuestionId(null);
    setPromptingCompleted(true);
    return true;
  }, [answers, currentQuestionId, description, visibleQuestions]);

  const visibleQueue = visibleQuestions(answers, description);
  const isLast = currentQuestionId != null && visibleQueue[visibleQueue.length - 1]?.id === currentQuestionId;

  return {
    visible,
    currentQuestionId,
    promptingCompleted,
    isLast,
    startPromptingFlow,
    handleBack,
    handleNext,
    setPromptingCompleted,
  };
}
