import { QuestionDef } from './types';

export const photoAndDetailsQuestions: QuestionDef[] = [
  {
    id: 'uploadPhotos',
    title: 'Upload photos for a more accurate price quote?',
    message: 'Photos of your space help us provide the best estimate.',
    kind: 'photos',
    required: false,
  },
  {
    id: 'details',
    title: 'Details (optional)',
    message: "Anything else you'd like us to know?",
    kind: 'text',
    placeholder: 'Add any other information...',
    required: false,
  },
];
