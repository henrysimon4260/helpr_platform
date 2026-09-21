export type JobTypeOption = {
  value: string;
  label: string;
  description: string;
  /** Phrase appended as `. Type: {written}`. */
  written: string;
};

/**
 * Identity and question copy for a single-location request screen
 * (cleaning, furniture assembly, home improvement, wall mounting).
 * Regex sources are passed to `new RegExp` and must not include flags.
 */
export type SingleLocationServiceConfig = {
  returnPath: string;
  resumeAction: string;
  serviceType: string;
  /** Used in schedule / sign-in sentences: "your {servicePhrase} service". */
  servicePhrase: string;
  screenTitle: string;
  locationPlaceholder: string;
  descriptionPlaceholder: string;
  typeModalTitle: string;
  typeModalMessage: string;
  typeRequiredMessage: string;
  typeLogLabel: string;
  typeOptions: JobTypeOption[];
  typeEnhancedPattern: string;
  typeExtractPattern: string;
  typeStripPattern: string;
  /** When true, free text such as "deep cleaning" skips the type modal. */
  inferTypeFromDescription: boolean;
  /** When true, spelled-out bedroom counts ("one bedroom") count as a known size. */
  includeSpelledOutRoomDetection: boolean;
  sizeDetectPattern: string;
  sizeWrittenLabel: string;
  sizeExtractPattern: string;
  sizeStripPattern: string;
  sizeLogLabel: string;
  bringDetectPattern: string;
  bringWrittenLabel: string;
  bringExtractPattern: string;
  bringStripPattern: string;
  bringLogLabel: string;
  bringModalTitle: string;
  bringModalMessage: string;
  bringPlaceholder: string;
  pricingSystemPrompt: string;
};

/** Identity for the start/end custom-service composer. */
export type RouteServiceConfig = {
  returnPath: string;
  resumeAction: string;
  serviceType: string;
  servicePhrase: string;
  screenTitle: string;
  locationPlaceholder: string;
  descriptionPlaceholder: string;
  pricingSystemPrompt: string;
};
