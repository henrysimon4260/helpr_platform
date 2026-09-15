import { photoAndDetailsQuestions } from '../../../components/services/composer/closingQuestions';
import { ServiceComposerConfig } from '../../../components/services/composer/types';
import { descriptionHasPropertySize } from '../../../components/services/composer/utils';

export const cleaningConfig: ServiceComposerConfig = {
  title: 'Cleaning Details',
  serviceType: 'cleaning',
  signInMessage: 'Please sign in or sign up to schedule a cleaning service.',
  returnPath: '/(services)/cleaning',
  scheduleAction: 'schedule-cleaning',
  locationMode: 'single',
  locationPlaceholder: 'Location',
  descriptionPlaceholder: "Describe your task... (e.g. 'I need my one bedroom apartment deep cleaned.')",
  pricingSystemPrompt:
    'You are a pricing assistant for cleaning services. Respond with a JSON object containing: price (number), needs_clarification (boolean), clarification_prompt (string, only if needs_clarification is true), safety_concern (boolean), safety_message (string, only if safety_concern is true). Analyze the task description and determine if critical details are missing: 1) degree of cleaning needed (light/medium/deep), 2) which rooms or entire home, 3) property size. If any are unclear, set needs_clarification to true and provide a friendly clarification_prompt asking for the missing details. If the request involves hazardous materials, biohazards, or dangerous conditions, set safety_concern to true with an appropriate safety_message. For complete descriptions, provide price in USD (20-250 range). IMPORTANT: Scale prices significantly based on property size - Studio: $20-40 (basic) / $40-80 (deep), 1-bed: $30-50 (basic) / $60-100 (deep), 2-bed: $45-70 (basic) / $90-130 (deep), 3-bed: $60-90 (basic) / $120-170 (deep), 4+ bed or house: $80-130 (basic) / $150-250 (deep). Always increase price proportionally with more bedrooms. Provide competitive, budget-friendly estimates.',
  priceAdjust: price => ({ price: price * 0.85 }),
  questions: [
    {
      id: 'cleaningType',
      title: 'What type of cleaning do you need?',
      message: 'This helps us match the right helpr and price.',
      kind: 'choice',
      options: [
        { value: 'basic', label: 'Basic Cleaning', description: 'General tidying, dusting, vacuuming, and surface cleaning' },
        { value: 'deep', label: 'Deep Cleaning', description: 'Baseboards, inside appliances, and hard-to-reach areas' },
      ],
      detectInDescription: text => /\b((deep|basic|standard)\s*clean(ing|ed)?)\b/i.test(text),
      toSentence: value =>
        value === 'basic' ? 'Type: Basic cleaning.' : value === 'deep' ? 'Type: Deep cleaning.' : null,
    },
    {
      id: 'rooms',
      title: 'What should we clean?',
      message: 'Entire home or just specific rooms.',
      kind: 'choice',
      options: [
        { value: 'entire', label: 'Entire home' },
        { value: 'specific', label: 'Specific rooms' },
      ],
      detectInDescription: text =>
        /\b(entire|whole|all rooms|whole (home|house|apartment|apt)|kitchen|bathroom|living room)\b/i.test(text),
      toSentence: value =>
        value === 'entire' ? 'Clean the entire home.' : value === 'specific' ? 'Clean specific rooms only.' : null,
    },
    {
      id: 'apartmentSize',
      title: 'How big is the space?',
      message: 'Property size is the biggest factor in cleaning price.',
      kind: 'choice',
      options: [
        { value: 'Studio', label: 'Studio' },
        { value: '1BR', label: '1 Bedroom' },
        { value: '2BR', label: '2 Bedrooms' },
        { value: '3BR', label: '3 Bedrooms' },
        { value: '4BR+', label: '4+ Bedrooms / house' },
      ],
      detectInDescription: text => descriptionHasPropertySize(text),
      toSentence: value => (value ? `Property size: ${value}.` : null),
    },
    {
      id: 'suppliesNeeded',
      title: 'Should your helpr bring supplies?',
      message: 'Let us know if you already have cleaning products on site.',
      kind: 'choice',
      options: [
        { value: 'bring', label: 'Yes, bring cleaning supplies' },
        { value: 'have', label: 'No, I have supplies' },
      ],
      detectInDescription: text =>
        /\b((bring|have|provide)\s+(cleaning\s+)?(supplies|products)|supplies\s+(included|provided|on\s+site))\b/i.test(text),
      toSentence: value =>
        value === 'bring' ? 'Please bring cleaning supplies.' : value === 'have' ? 'Customer has cleaning supplies.' : null,
    },
    ...photoAndDetailsQuestions,
  ],
};
