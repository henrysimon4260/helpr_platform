import { photoAndDetailsQuestions } from '../../../components/services/composer/closingQuestions';
import { ServiceComposerConfig } from '../../../components/services/composer/types';

export const furnitureAssemblyConfig: ServiceComposerConfig = {
  title: 'Furniture Assembly Details',
  serviceType: 'furniture-assembly',
  signInMessage: 'Please sign in or sign up to schedule a furniture assembly service.',
  returnPath: '/(services)/furniture-assembly',
  scheduleAction: 'schedule-furniture-assembly',
  locationMode: 'single',
  locationPlaceholder: 'Location',
  descriptionPlaceholder: "Describe your task... (e.g. 'Assemble a desk, bookshelf, and two chairs.')",
  pricingSystemPrompt:
    'You are a pricing assistant for furniture assembly services. Respond with a JSON object containing: price (number), needs_clarification (boolean), clarification_prompt (string, only if needs_clarification is true), safety_concern (boolean), safety_message (string, only if safety_concern is true). Analyze the task description and determine if critical details are missing: 1) complexity of assembly (simple/moderate/complex), number of furniture pieces, 2) types of furniture items to assemble, 3) number and size of furniture pieces. If any are unclear, set needs_clarification to true and provide a friendly clarification_prompt asking for the missing details. If the request involves hazardous materials, biohazards, or dangerous conditions, set safety_concern to true with an appropriate safety_message. For complete descriptions, provide price in USD (30-300 range). IMPORTANT: Scale prices based on item complexity and quantity - Small item (chair, small table): $30-60 (simple) / $60-100 (complex), Medium item (desk, bookshelf): $50-90 (simple) / $90-150 (complex), Large item (bed frame, wardrobe): $80-130 (simple) / $130-200 (complex), Multiple items or very large (entertainment center, sectional): $120-180 (simple) / $180-300 (complex). Always increase price proportionally with more items and complexity. Provide competitive, budget-friendly estimates.',
  questions: [
    {
      id: 'assemblyComplexity',
      title: 'How complex is the assembly?',
      message: 'Simple pieces take less time than large or multi-part furniture.',
      kind: 'choice',
      options: [
        { value: 'simple', label: 'Simple Assembly', description: 'Chairs, small tables, or simple shelves' },
        { value: 'complex', label: 'Complex Assembly', description: 'Beds, wardrobes, or multi-piece sets' },
      ],
      detectInDescription: text => /\b(simple|complex|moderate)\s+(assembly|furniture)\b/i.test(text),
      toSentence: value =>
        value === 'simple' ? 'Simple furniture assembly.' : value === 'complex' ? 'Complex furniture assembly.' : null,
    },
    {
      id: 'items',
      title: 'What are you assembling?',
      message: 'List the items and about how many pieces.',
      kind: 'text',
      placeholder: 'e.g., IKEA Pax wardrobe, desk, and two nightstands',
      detectInDescription: text => /\b(desk|chair|table|bookshelf|bed|wardrobe|dresser|shelf)\b/i.test(text),
      toSentence: value => (value.trim() ? `Items: ${value.trim()}.` : null),
    },
    {
      id: 'toolsNeeded',
      title: 'Should your helpr bring tools?',
      message: 'Most assemblies need a drill, screwdriver, and hex keys.',
      kind: 'choice',
      options: [
        { value: 'bring', label: 'Yes, bring tools' },
        { value: 'have', label: 'No, I have tools' },
      ],
      detectInDescription: text =>
        /\b((bring|have|provide)\s+(the\s+)?tools|tools\s+(included|provided|on\s+site)|I have (a )?drill)\b/i.test(text),
      toSentence: value =>
        value === 'bring' ? 'Please bring assembly tools.' : value === 'have' ? 'Customer has tools on site.' : null,
    },
    ...photoAndDetailsQuestions,
  ],
};
