import { LatLng } from 'react-native-maps';
import { AttachmentAsset } from '../AttachmentThumbnails/types';

export type SelectedLocation = {
  description: string;
  coordinate: LatLng;
};

export type ServiceZoneBoundingBox = {
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export type LocationMode = 'single' | 'dual';

export type QuestionKind = 'choice' | 'text' | 'photos';

export type QuestionOption = {
  value: string;
  label: string;
  description?: string;
};

export type QuestionDef = {
  id: string;
  title: string;
  message: string;
  kind: QuestionKind;
  options?: QuestionOption[];
  placeholder?: string;
  required?: boolean;
  skipIf?: (answers: Record<string, string>) => boolean;
  detectInDescription?: (text: string) => boolean;
  toSentence?: (value: string) => string | null;
};

export type PriceAdjustContext = {
  needsTruck?: boolean;
  drivingMiles?: number;
  drivingMinutes?: number;
};

export type ServiceComposerConfig = {
  title: string;
  serviceType: string;
  signInMessage: string;
  returnPath: string;
  scheduleAction: string;
  locationMode: LocationMode;
  locationPlaceholder?: string;
  startPlaceholder?: string;
  endPlaceholder?: string;
  descriptionPlaceholder: string;
  pricingSystemPrompt: string;
  questions: QuestionDef[];
  priceAdjust?: (price: number, ctx: PriceAdjustContext) => { price: number; note?: string };
};

export type ServiceFormState = {
  startQuery: string;
  endQuery: string;
  startLocation: SelectedLocation | null;
  endLocation: SelectedLocation | null;
  description: string;
  isAuto: boolean;
  isPersonal: boolean;
  priceQuote: string | null;
  priceNote: string | null;
  priceError: string | null;
  attachments: AttachmentAsset[];
  answers: Record<string, string>;
};

export type ServiceReturnData = {
  formState: ServiceFormState;
  action?: string;
  timestamp?: number;
  params?: Record<string, string>;
};

export type EditServicePayload = {
  service_id: string;
  service_type?: string | null;
  location?: string | null;
  start_location?: string | null;
  end_location?: string | null;
  price?: number | null;
  payment_method_type?: string | null;
  autofill_type?: string | null;
  scheduling_type?: string | null;
  scheduled_date_time?: string | null;
  description?: string | null;
};
