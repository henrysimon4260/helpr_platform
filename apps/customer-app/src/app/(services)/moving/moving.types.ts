import { LatLng } from 'react-native-maps';
import { AttachmentAsset } from '../../../components/services/AttachmentThumbnails/types';

export type SelectedLocation = {
  description: string;
  coordinate: LatLng;
};

export type EditServicePayload = {
  service_id: string;
  service_type?: string | null;
  start_location?: string | null;
  end_location?: string | null;
  price?: number | null;
  payment_method_type?: string | null;
  autofill_type?: string | null;
  scheduling_type?: string | null;
  scheduled_date_time?: string | null;
  description?: string | null;
};

export type MovingFormState = {
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
  apartmentSize: string;
  packingStatus: '' | 'packed' | 'not-packed';
  needsTruck: '' | 'yes' | 'no';
  boxesNeeded: '' | 'yes' | 'no';
  furnitureScope: string;
};

export type MovingReturnData = {
  formState: MovingFormState;
  action?: 'schedule-moving';
  timestamp?: number;
  params?: Record<string, string>;
};

export type MovingModalQuestion =
  | 'apartmentSize'
  | 'packingStatus'
  | 'needsTruck'
  | 'boxesNeeded'
  | 'uploadPhotos'
  | 'details';

export type MovingAnalysisResult = {
  hasApartmentSize: boolean;
  hasPackingStatus: boolean;
  hasTruckInfo: boolean;
  hasBoxInfo: boolean;
  hasFurnitureScope: boolean;
  areItemsPacked: boolean;
  hasStreetNumber: boolean;
  hasStartStreetNumber: boolean;
  hasEndStreetNumber: boolean;
  missingStreetNumberTargets: Array<'start' | 'end'>;
};

export type ServiceZoneBoundingBox = {
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export type MovingQuestionsState = {
  apartmentSize: string;
  packingStatus: '' | 'packed' | 'not-packed';
  needsTruck: '' | 'yes' | 'no';
  boxesNeeded: '' | 'yes' | 'no';
  optionalDetails: string;
};






