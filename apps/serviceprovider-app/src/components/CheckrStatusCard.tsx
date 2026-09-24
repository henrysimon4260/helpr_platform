import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useModal } from '../contexts/ModalContext';
import { checkrGoLiveCopy, isUsStateCode, type CheckrGateStatus } from '../lib/checkrStatus';
import { supabase } from '../lib/supabase';

export type CheckrProfileSnapshot = {
  checkr_status: CheckrGateStatus | string | null;
  checkr_invitation_url: string | null;
  checkr_invitation_expires_at: string | null;
  checkr_status_updated_at: string | null;
};

type CheckrStatusCardProps = {
  status: string | null;
  invitationUrl: string | null;
  invitationExpiresAt: string | null;
  statusUpdatedAt: string | null;
  loadError?: boolean;
  onUpdated: (next: CheckrProfileSnapshot) => void;
};

export function CheckrStatusCard({
  status,
  invitationUrl,
  invitationExpiresAt,
  statusUpdatedAt,
  loadError = false,
  onUpdated,
}: CheckrStatusCardProps) {
  const { showModal } = useModal();
  const [busy, setBusy] = useState(false);
  const [stateModalVisible, setStateModalVisible] = useState(false);
  const [workState, setWorkState] = useState('');
  const [workCity, setWorkCity] = useState('');
  const copy = checkrGoLiveCopy({
    status,
    invitationExpiresAt,
    statusUpdatedAt,
    hasInvitationUrl: Boolean(invitationUrl),
    loadError,
  });

  const openInvitation = async (url: string | null) => {
    if (!url) {
      showModal({
        title: 'Checkr link missing',
        message: 'Checkr did not return an invitation link. Try again in a moment.',
      });
      return;
    }
    await WebBrowser.openBrowserAsync(url);
  };

  const startInvitation = async () => {
    const normalizedState = workState.trim().toUpperCase();
    if (!isUsStateCode(normalizedState)) {
      showModal({
        title: 'Work state required',
        message: 'Enter the two-letter US state where you will take jobs. Checkr uses it for the background check.',
      });
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkr-invitation', {
        body: {
          work_state: normalizedState,
          work_city: workCity.trim(),
        },
      });

      if (error) {
        showModal({
          title: 'Checkr unavailable',
          message: error.message || 'Unable to start the background check.',
        });
        return;
      }

      if (!data?.success) {
        showModal({
          title: 'Background check blocked',
          message: data?.error || 'Checkr did not start a background check.',
        });
        return;
      }

      const nextStatus = typeof data.checkr_status === 'string' ? data.checkr_status : 'pending';
      onUpdated({
        checkr_status: nextStatus,
        checkr_invitation_url: data.invitation_url ?? invitationUrl,
        checkr_invitation_expires_at: data.expires_at ?? invitationExpiresAt,
        checkr_status_updated_at: new Date().toISOString(),
      });
      setStateModalVisible(false);

      if (nextStatus === 'clear') {
        showModal({
          title: 'Background check clear',
          message: 'Checkr already cleared you. Open jobs are available.',
        });
        return;
      }

      if (typeof data.invitation_url === 'string' && data.invitation_url) {
        await openInvitation(data.invitation_url);
      }
    } catch (startError) {
      showModal({
        title: 'Checkr unavailable',
        message: startError instanceof Error ? startError.message : 'Unable to start the background check.',
      });
    } finally {
      setBusy(false);
    }
  };

  const onAction = async () => {
    if (copy.action === 'continue' && invitationUrl) {
      await openInvitation(invitationUrl);
      return;
    }
    setStateModalVisible(true);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>Checkr</Text>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.message}>{copy.message}</Text>
      {copy.actionLabel ? (
        <Pressable
          style={[styles.button, busy ? styles.buttonDisabled : null]}
          onPress={onAction}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={copy.actionLabel}
        >
          {busy ? <ActivityIndicator color="#FFF8E8" /> : <Text style={styles.buttonText}>{copy.actionLabel}</Text>}
        </Pressable>
      ) : null}

      <Modal visible={stateModalVisible} transparent animationType="fade" onRequestClose={() => setStateModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Where will you work?</Text>
            <Text style={styles.modalBody}>
              Checkr needs the US state for this background check. You cannot accept jobs until the report is clear.
            </Text>
            <TextInput
              value={workState}
              onChangeText={value => setWorkState(value.toUpperCase().slice(0, 2))}
              autoCapitalize="characters"
              maxLength={2}
              placeholder="State (CA)"
              placeholderTextColor="#8a7d68"
              style={styles.input}
            />
            <TextInput
              value={workCity}
              onChangeText={setWorkCity}
              placeholder="City (optional)"
              placeholderTextColor="#8a7d68"
              style={styles.input}
            />
            <Pressable style={styles.button} onPress={startInvitation} disabled={busy}>
              {busy ? <ActivityIndicator color="#FFF8E8" /> : <Text style={styles.buttonText}>Open Checkr</Text>}
            </Pressable>
            <Pressable style={styles.cancel} onPress={() => setStateModalVisible(false)} disabled={busy}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF8E8',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5DCC9',
    padding: 18,
    marginHorizontal: 16,
    marginTop: 16,
  },
  kicker: {
    color: '#0c4309',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0c4309',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 6,
  },
  message: {
    color: '#3d4f3d',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  button: {
    backgroundColor: '#0c4309',
    borderRadius: 10,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFF8E8',
    fontSize: 16,
    fontWeight: '700',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#FFF8E8',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    color: '#0c4309',
    fontSize: 20,
    fontWeight: '700',
  },
  modalBody: {
    color: '#3d4f3d',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5DCC9',
    color: '#0c4309',
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  cancel: {
    alignItems: 'center',
    marginTop: 12,
    padding: 8,
  },
  cancelText: {
    color: '#0c4309',
    fontSize: 15,
    fontWeight: '600',
  },
});
