import { photoAndDetailsQuestions } from '../../../components/services/composer/closingQuestions';
import { ServiceComposerConfig } from '../../../components/services/composer/types';

export const customServiceConfig: ServiceComposerConfig = {
  title: 'Custom Service Details',
  serviceType: 'customService',
  signInMessage: 'Please sign in or sign up to schedule a custom service.',
  returnPath: '/(services)/custom-service',
  scheduleAction: 'schedule-customService',
  locationMode: 'dual',
  startPlaceholder: 'Start Location',
  endPlaceholder: 'End Location',
  descriptionPlaceholder: "Describe your task... (e.g. 'Help me haul donations from my apartment to a drop-off.')",
  pricingSystemPrompt:
    'You are a pricing assistant for custom service requests. Respond with a JSON object containing: price (number), needs_clarification (boolean), clarification_prompt (string, only if needs_clarification is true), safety_concern (boolean), safety_message (string, only if safety_concern is true). Carefully analyze the task description for the exact scope of work. Use your best judgment to determine if essential details are missing - dynamically adjust what you ask for based on the type of task described. If the description is too vague or missing critical details for that specific type of work, set needs_clarification to true with a clarification_prompt asking for the specific missing information. If the request involves: dangerous activities, illegal activities, licensed professional work (electrical/plumbing/HVAC), hazardous materials, extreme physical risk, or appears priced well above $800, set safety_concern to true. For complete, suitable descriptions, provide price in USD (50-800 range): simple tasks $50-150, medium complexity $150-300, complex tasks $300-800. Provide optimistic, budget-friendly estimates.',
  questions: [
    {
      id: 'duration',
      title: 'About how long should this take?',
      message: 'A rough time window helps us price the job.',
      kind: 'choice',
      options: [
        { value: 'under-2h', label: 'Under 2 hours' },
        { value: 'half-day', label: 'Half day' },
        { value: 'full-day', label: 'Full day' },
        { value: 'unsure', label: 'Not sure' },
      ],
      detectInDescription: text => /\b(\d+\s*(hour|hr|hours)|half\s*day|full\s*day)\b/i.test(text),
      toSentence: value =>
        value === 'under-2h'
          ? 'Estimated duration: under 2 hours.'
          : value === 'half-day'
            ? 'Estimated duration: half day.'
            : value === 'full-day'
              ? 'Estimated duration: full day.'
              : null,
    },
    ...photoAndDetailsQuestions,
  ],
};
