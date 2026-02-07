import { SavedPaymentMethodSummary } from '../../../lib/paymentMethods';

export interface PaymentMethodModalProps {
  visible: boolean;
  onClose: () => void;
  savedPaymentMethods: SavedPaymentMethodSummary[];
  activePaymentMethodId: string | null;
  onSelectPaymentMethod: (methodId: string) => void;
  showAddForm: boolean;
  setShowAddForm: (show: boolean) => void;
  cardComplete: boolean;
  setCardComplete: (complete: boolean) => void;
  setCardDetailsSnapshot: (details: {
    brand?: string | null;
    last4?: string | null;
    expiryMonth?: number | null;
    expiryYear?: number | null;
  } | null) => void;
  onSavePaymentMethod: (isDefault?: boolean) => void;
  loading: boolean;
  saving?: boolean;
  showModal: (config: { title: string; message: string; buttons?: { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void }[] }) => void;
}



