import { SavedPaymentMethodSummary } from '../../../lib/paymentMethods';

export interface ProviderSummary {
  firstName: string;
  fullName: string;
  profileImageUrl: string | null;
  initials: string;
  rating: number | null;
}

export interface PaymentSummaryModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  provider: ProviderSummary | null;
  price: number;
  serviceName?: string;
  scheduledDateTime?: string;
  savedPaymentMethods: SavedPaymentMethodSummary[];
  activePaymentMethodId: string | null;
  onSelectPaymentMethod: (methodId: string) => void;
  onAddPaymentMethod: () => void;
  loading?: boolean;
  confirming?: boolean;
  showModal: (config: { title: string; message: string }) => void;
}
