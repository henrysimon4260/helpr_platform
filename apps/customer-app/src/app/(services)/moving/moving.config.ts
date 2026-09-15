import { photoAndDetailsQuestions } from '../../../components/services/composer/closingQuestions';
import { ServiceComposerConfig } from '../../../components/services/composer/types';

export const movingConfig: ServiceComposerConfig = {
  title: 'Moving Details',
  serviceType: 'Moving',
  signInMessage: 'Please sign in or sign up to schedule a moving service.',
  returnPath: '/(services)/moving',
  scheduleAction: 'schedule-moving',
  locationMode: 'dual',
  startPlaceholder: 'Start Location',
  endPlaceholder: 'End Location',
  descriptionPlaceholder: "Describe your move... (e.g. 'Moving a 2-bedroom apartment across town.')",
  pricingSystemPrompt:
    'You are a pricing assistant for moving services. Respond with a JSON object containing a price field. Keep prices in USD, realistic, and constrain price between 200 and 1800 for jobs requiring transportation between locations. Ensure that any moving services going from one place to another are at least $200 without truck and at least $350 if truck is needed. Start around these two prices for studio/1BR jobs in close proximity to each other and increase accordingly for larger places. use the following constraints to determine the cost of something. 1 bedroom is 15% more expensive than studio, 2 bedroom is 15% expensive than 1 bed, and so on for all bedroom sizes. Make sure this holds true for every single transaction, such that it is guaranteed that the prices are subject to apartment size. Provide optimistic, budget-friendly estimates and, when in doubt, lean toward the lower end of the acceptable price range. Take the driving distance and time into account when estimating prices - longer distances should cost more. Make sure that there is a significant difference between jobs requiring a moving truck and those not requiring it. Take the size of the apartment and whether the customer requires help packing into consideration. Make extra sure all of these criteria are met.',
  priceAdjust: (price, ctx) => {
    if (ctx.drivingMiles != null && ctx.drivingMiles < 0.5 && ctx.drivingMinutes != null) {
      const baseRate = ctx.needsTruck ? 350 : 200;
      const drivingTimeSurcharge = Math.round(ctx.drivingMinutes) * 1;
      return {
        price: baseRate + drivingTimeSurcharge,
        note: `Short distance rate: base + $${drivingTimeSurcharge} (${Math.round(ctx.drivingMinutes)} min drive)`,
      };
    }
    return { price: ctx.needsTruck ? price * 1.6 : price };
  },
  questions: [
    {
      id: 'packingStatus',
      title: 'Do you need help packing?',
      message: 'Let your helpr know if you need your things packed into boxes.',
      kind: 'choice',
      options: [
        { value: 'not-packed', label: 'Yes, I need help packing' },
        { value: 'packed', label: 'No, everything is already packed' },
      ],
      detectInDescription: text => /\b(pack|packed|packing|unpack|unpacked|unpacking)\b/i.test(text),
      toSentence: value =>
        value === 'packed' ? 'Items are already packed.' : value === 'not-packed' ? 'Need help packing items.' : null,
    },
    {
      id: 'needsTruck',
      title: 'Do you need a moving truck?',
      message: 'This helps us determine the right equipment and pricing.',
      kind: 'choice',
      options: [
        { value: 'yes', label: 'Yes, I need a truck' },
        { value: 'no', label: "No, I don't need a truck" },
      ],
      detectInDescription: text => /\b(truck|moving truck|rental truck|vehicle|car|van)\b/i.test(text),
      toSentence: value =>
        value === 'yes' ? 'Moving truck is needed.' : value === 'no' ? 'No moving truck needed.' : null,
    },
    {
      id: 'boxesNeeded',
      title: 'Do you need boxes?',
      message: 'Let your helpr know if they should bring moving boxes.',
      kind: 'choice',
      skipIf: answers => answers.packingStatus === 'packed',
      options: [
        { value: 'yes', label: 'Yes, please bring boxes' },
        { value: 'no', label: 'No, I have boxes' },
      ],
      detectInDescription: text => /\b(box|boxes|packing supplies|supplies)\b/i.test(text),
      toSentence: value =>
        value === 'yes' ? 'Need boxes and packing supplies.' : value === 'no' ? 'Already have boxes and supplies.' : null,
    },
    {
      id: 'apartmentSize',
      title: 'How big is your apartment?',
      message: 'This will help us determine the best price for your service.',
      kind: 'choice',
      options: [
        { value: 'Studio', label: 'Studio' },
        { value: '1BR', label: '1 Bedroom' },
        { value: '2BR', label: '2 Bedrooms' },
        { value: '3BR', label: '3 Bedrooms' },
        { value: '4BR+', label: '4+ Bedrooms' },
      ],
      detectInDescription: text =>
        /\b(\d+)\s*(bedroom|br|room|apt|apartment)\b/i.test(text) ||
        /\b(studio|1br|2br|3br|4br|5br)\b/i.test(text) ||
        /\b(one|two|three|four|five|six|seven|eight|nine|ten|single|double|triple)\s*(?:-|\s)?\s*(bedroom|bed|br|room|apt|apartment)s?\b/i.test(text),
      toSentence: value => (value ? `Moving from a ${value}.` : null),
    },
    ...photoAndDetailsQuestions,
  ],
};
