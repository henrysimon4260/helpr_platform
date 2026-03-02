import { LatLng } from 'react-native-maps';
import { AttachmentAsset } from '../../../components/services/AttachmentThumbnails/types';

export type SelectedLocation = {
  description: string;
  coordinate: LatLng;
};

export type EditServicePayload = {
  service_id: string;
  service_type?: string | null;
  location?: string | null;
  price?: number | null;
  payment_method_type?: string | null;
  autofill_type?: string | null;
  scheduling_type?: string | null;
  scheduled_date_time?: string | null;
  description?: string | null;
};

export type WallMountingFormState = {
  locationQuery: string;
  location: SelectedLocation | null;
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
  cleaningType: '' | 'basic' | 'deep';
  specialRequests: string;
  detailsPhotos: AttachmentAsset[];
  suppliesNeeded: string;
};

export type WallMountingReturnData = {
  formState: WallMountingFormState;
  action?: 'schedule-wall-mounting';
  timestamp?: number;
  params?: Record<string, string>;
};
