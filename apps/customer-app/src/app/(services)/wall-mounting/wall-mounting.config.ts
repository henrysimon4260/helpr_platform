import { photoAndDetailsQuestions } from '../../../components/services/composer/closingQuestions';
import { ServiceComposerConfig } from '../../../components/services/composer/types';

export const wallMountingConfig: ServiceComposerConfig = {
  title: 'Wall Mounting Details',
  serviceType: 'wall-mounting',
  signInMessage: 'Please sign in or sign up to schedule a wall mounting service.',
  returnPath: '/(services)/wall-mounting',
  scheduleAction: 'schedule-wall-mounting',
  locationMode: 'single',
  locationPlaceholder: 'Location',
  descriptionPlaceholder: "Describe your task... (e.g. 'Mount a 65-inch TV on drywall.')",
  pricingSystemPrompt:
    'You are a pricing assistant for wall mounting services. Respond with a JSON object containing: price (number), needs_clarification (boolean), clarification_prompt (string, only if needs_clarification is true), safety_concern (boolean), safety_message (string, only if safety_concern is true). Analyze whether the description includes: 1) what is being mounted (TV, shelf, art, mirror), 2) approximate size or weight, 3) wall type if known. If critical details are missing, set needs_clarification to true. If the request involves structural work, electrical in-wall installs that need a licensed electrician, or unsafe conditions, set safety_concern to true. For complete descriptions, provide price in USD (40-250 range). Typical ranges: art/small shelf $40-80, TV 32-55" $80-140, TV 60"+ or brick/concrete $140-250. Provide competitive, budget-friendly estimates.',
  questions: [
    {
      id: 'mountType',
      title: 'What are you mounting?',
      message: 'TV, shelf, artwork, or something else.',
      kind: 'choice',
      options: [
        { value: 'tv', label: 'TV' },
        { value: 'shelf', label: 'Shelf' },
        { value: 'art', label: 'Artwork or mirror' },
        { value: 'other', label: 'Other' },
      ],
      detectInDescription: text => /\b(tv|television|shelf|shelves|artwork|mirror)\b/i.test(text),
      toSentence: value =>
        value === 'tv'
          ? 'Mounting a TV.'
          : value === 'shelf'
            ? 'Mounting a shelf.'
            : value === 'art'
              ? 'Mounting artwork or a mirror.'
              : value === 'other'
                ? 'Custom wall mounting.'
                : null,
    },
    {
      id: 'wallType',
      title: 'What kind of wall is it?',
      message: 'Anchors and time depend on the surface.',
      kind: 'choice',
      options: [
        { value: 'drywall', label: 'Drywall' },
        { value: 'plaster', label: 'Plaster' },
        { value: 'brick', label: 'Brick or concrete' },
        { value: 'unsure', label: 'Not sure' },
      ],
      detectInDescription: text => /\b(drywall|plaster|brick|concrete|stud)\b/i.test(text),
      toSentence: value =>
        value === 'drywall'
          ? 'Wall type: drywall.'
          : value === 'plaster'
            ? 'Wall type: plaster.'
            : value === 'brick'
              ? 'Wall type: brick or concrete.'
              : value === 'unsure'
                ? 'Wall type is unknown.'
                : null,
    },
    ...photoAndDetailsQuestions,
  ],
};
