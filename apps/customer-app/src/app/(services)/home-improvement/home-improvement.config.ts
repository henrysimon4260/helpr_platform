import { photoAndDetailsQuestions } from '../../../components/services/composer/closingQuestions';
import { ServiceComposerConfig } from '../../../components/services/composer/types';

export const homeImprovementConfig: ServiceComposerConfig = {
  title: 'Home Improvement Details',
  serviceType: 'home-improvement',
  signInMessage: 'Please sign in or sign up to schedule a home improvement service.',
  returnPath: '/(services)/home-improvement',
  scheduleAction: 'schedule-home-improvement',
  locationMode: 'single',
  locationPlaceholder: 'Location',
  descriptionPlaceholder: "Describe your task... (e.g. 'Patch and paint a bedroom, then hang new shelves.')",
  pricingSystemPrompt:
    'You are a pricing assistant for home improvement services. Respond with a JSON object containing: price (number), needs_clarification (boolean), clarification_prompt (string, only if needs_clarification is true), safety_concern (boolean), safety_message (string, only if safety_concern is true). Analyze the task description and determine if critical details are missing: 1) type of home improvement work (repair/installation/renovation), 2) specific areas or rooms requiring work, 3) scope and complexity of the project. If any are unclear, set needs_clarification to true and provide a friendly clarification_prompt asking for the missing details. If the request involves hazardous materials, biohazards, licensed electrical/plumbing/HVAC, or dangerous conditions, set safety_concern to true with an appropriate safety_message. For complete descriptions, provide price in USD (40-400 range). IMPORTANT: Scale prices based on scope - small repair $40-90, moderate install $90-180, larger renovation or multi-room $180-400. Provide competitive, budget-friendly estimates.',
  questions: [
    {
      id: 'projectType',
      title: 'What kind of project is this?',
      message: 'Repair, installation, or a larger renovation.',
      kind: 'choice',
      options: [
        { value: 'repair', label: 'Repair', description: 'Fix, patch, or replace something that is already there' },
        { value: 'installation', label: 'Installation', description: 'Put in something new' },
        { value: 'renovation', label: 'Renovation', description: 'A larger refresh of a room or area' },
      ],
      detectInDescription: text => /\b(repair|install|renovat|patch|paint|replace)\b/i.test(text),
      toSentence: value =>
        value === 'repair' ? 'Project type: repair.' : value === 'installation' ? 'Project type: installation.' : value === 'renovation' ? 'Project type: renovation.' : null,
    },
    {
      id: 'apartmentSize',
      title: 'How big is the space?',
      message: 'Helps us size the job and the crew.',
      kind: 'choice',
      options: [
        { value: 'Studio', label: 'Studio' },
        { value: '1BR', label: '1 Bedroom' },
        { value: '2BR', label: '2 Bedrooms' },
        { value: '3BR', label: '3 Bedrooms' },
        { value: '4BR+', label: '4+ Bedrooms / house' },
      ],
      detectInDescription: text =>
        /\b(\d+)\s*(bedroom|br|room|apt|apartment)\b/i.test(text) || /\b(studio|1br|2br|3br|4br)\b/i.test(text),
      toSentence: value => (value ? `Property size: ${value}.` : null),
    },
    {
      id: 'materialsNeeded',
      title: 'Should your helpr bring materials?',
      message: 'Paint, hardware, patch compound, and similar supplies.',
      kind: 'choice',
      options: [
        { value: 'bring', label: 'Yes, bring materials' },
        { value: 'have', label: 'No, I have materials' },
      ],
      detectInDescription: text => /\b(materials|paint|hardware|supplies)\b/i.test(text),
      toSentence: value =>
        value === 'bring' ? 'Please bring materials.' : value === 'have' ? 'Customer has materials on site.' : null,
    },
    ...photoAndDetailsQuestions,
  ],
};
