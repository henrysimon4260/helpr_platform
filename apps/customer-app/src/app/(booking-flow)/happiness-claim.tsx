import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import {
  HAPPINESS_COPY,
  HAPPINESS_EXCLUSIONS,
  HAPPINESS_INCIDENT_LABELS,
  HAPPINESS_INCIDENT_TYPES,
  HELPR_HAPPINESS_EVIDENCE_BUCKET,
  HELPR_HAPPINESS_PROGRAM_NAME,
  HappinessIncidentType,
  dollarsToRequestedCents,
  evaluateHappinessEligibility,
  formatPledgeCap,
  formatUsdFromCents,
} from '../../lib/helprHappiness/policy';
import { supabase } from '../../lib/supabase';

type ServiceSnapshot = {
  service_id: string;
  customer_id?: string | null;
  status?: string | null;
  payment_status?: string | null;
  completed_at?: string | null;
  date_of_creation?: string | null;
  service_type?: string | null;
};

type ExistingClaim = {
  id: string;
  status: string;
  outcome: string | null;
  amount_requested_cents: number;
  amount_approved_cents: number | null;
  decision_notes: string | null;
  incident_type: string;
};

type LocalPhoto = {
  uri: string;
  name: string;
  contentType: string;
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return fallback;
}

function createClaimId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function outcomeLabel(claim: ExistingClaim): string {
  if (claim.status === 'paid' && claim.outcome === 'partial') return 'Paid in part';
  if (claim.status === 'paid') return 'Paid';
  if (claim.status === 'denied') return 'Declined';
  if (claim.status === 'needs_info') return 'More information requested';
  return 'Submitted';
}

export default function HappinessClaimScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const serviceId = typeof params.serviceId === 'string' ? params.serviceId : '';
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [service, setService] = useState<ServiceSnapshot | null>(null);
  const [existing, setExisting] = useState<ExistingClaim | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [incidentType, setIncidentType] = useState<HappinessIncidentType>('property_damage');
  const [amount, setAmount] = useState('');
  const [narrative, setNarrative] = useState('');
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [ownCoveragePursued, setOwnCoveragePursued] = useState(false);
  const [ownCoverageNotes, setOwnCoverageNotes] = useState('');
  const [ackNotInsurance, setAckNotInsurance] = useState(false);
  const [ackSecondary, setAckSecondary] = useState(false);
  const [ackExclusions, setAckExclusions] = useState(false);
  const [ackNegligence, setAckNegligence] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const eligibility = useMemo(() => {
    if (!service) return null;
    return evaluateHappinessEligibility({
      status: service.status,
      paymentStatus: service.payment_status,
      completedAt: service.completed_at,
      createdAt: service.date_of_creation,
    });
  }, [service]);

  const load = useCallback(async () => {
    if (authLoading) return;
    if (!serviceId) {
      setLoadError('This job could not be opened.');
      setLoading(false);
      return;
    }
    if (!user?.id) {
      setLoadError('Sign in to file a Helpr Happiness request.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const { data: serviceRow, error: serviceError } = await supabase
        .from('service')
        .select('*')
        .eq('service_id', serviceId)
        .maybeSingle();

      if (serviceError) throw serviceError;
      if (!serviceRow) {
        setLoadError('That job could not be found.');
        setService(null);
        return;
      }

      setService(serviceRow as ServiceSnapshot);

      const { data: claimRow, error: claimError } = await supabase
        .from('helpr_happiness_claim')
        .select('id, status, outcome, amount_requested_cents, amount_approved_cents, decision_notes, incident_type')
        .eq('service_id', serviceId)
        .maybeSingle();

      if (claimError && claimError.code !== 'PGRST116') {
        throw claimError;
      }
      setExisting((claimRow as ExistingClaim | null) ?? null);
    } catch (error) {
      const message = errorMessage(error, 'Unable to load this job.');
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [authLoading, serviceId, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const addPhoto = useCallback(async () => {
    if (photos.length >= 4) {
      setFormError('You can attach up to 4 photos.');
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setFormError('Allow photo library access to attach evidence.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setPhotos((current) => [
      ...current,
      {
        uri: asset.uri,
        name: asset.fileName ?? `evidence-${current.length + 1}.jpg`,
        contentType: asset.mimeType ?? 'image/jpeg',
      },
    ]);
    setFormError(null);
  }, [photos.length]);

  const submit = useCallback(async () => {
    if (!user?.id || !service || !eligibility?.ok || submitting) return;
    if (service.customer_id && service.customer_id !== user.id) {
      setFormError('This job is on a different account, so the request cannot be filed here.');
      return;
    }

    const cents = dollarsToRequestedCents(Number(amount));
    if (cents == null) {
      setFormError(`Enter an amount from $1 to ${formatPledgeCap()}.`);
      return;
    }
    if (narrative.trim().length < 20 || evidenceNotes.trim().length < 20) {
      setFormError('Describe what happened and the evidence you have, in a few sentences each.');
      return;
    }
    if (!ownCoveragePursued && ownCoverageNotes.trim().length < 10) {
      setFormError('Say whether you asked your own insurer, or why that policy does not apply.');
      return;
    }
    if (!ackNotInsurance || !ackSecondary || !ackExclusions || !ackNegligence) {
      setFormError('Confirm the goodwill terms before filing.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    const claimId = createClaimId();

    try {
      const evidencePaths: string[] = [];
      for (const [index, photo] of photos.entries()) {
        const response = await fetch(photo.uri);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const safeName = photo.name.replace(/[^a-zA-Z0-9.]+/g, '-').slice(-40);
        const path = `${user.id}/${claimId}/${Date.now()}-${index}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from(HELPR_HAPPINESS_EVIDENCE_BUCKET)
          .upload(path, bytes, {
            contentType: photo.contentType,
            upsert: false,
          });
        if (uploadError) throw uploadError;
        evidencePaths.push(path);
      }

      const { error: insertError } = await supabase.from('helpr_happiness_claim').insert({
        id: claimId,
        service_id: service.service_id,
        customer_id: user.id,
        incident_type: incidentType,
        narrative: narrative.trim(),
        amount_requested_cents: cents,
        evidence_notes: evidenceNotes.trim(),
        evidence_paths: evidencePaths,
        acknowledged_not_insurance: true,
        acknowledged_secondary: true,
        acknowledged_exclusions: true,
        negligence_attestation: true,
        own_coverage_pursued: ownCoveragePursued,
        own_coverage_notes: ownCoverageNotes.trim() || null,
      });

      if (insertError) throw insertError;
      await load();
    } catch (error) {
      const message = errorMessage(error, 'The request could not be filed.');
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }, [
    ackExclusions,
    ackNegligence,
    ackNotInsurance,
    ackSecondary,
    amount,
    eligibility?.ok,
    evidenceNotes,
    incidentType,
    load,
    narrative,
    ownCoverageNotes,
    ownCoveragePursued,
    photos,
    service,
    submitting,
    user?.id,
  ]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.back}>Back</Text>
        </Pressable>
        <Text style={styles.title}>{HELPR_HAPPINESS_PROGRAM_NAME}</Text>
        <Text style={styles.subtitle}>{HAPPINESS_COPY.notInsurance}</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#0c4309" />
      ) : loadError ? (
        <Text style={styles.error}>{loadError}</Text>
      ) : existing ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.section}>{outcomeLabel(existing)}</Text>
          <Text style={styles.body}>
            {`Requested ${formatUsdFromCents(existing.amount_requested_cents)} for ${
              HAPPINESS_INCIDENT_LABELS[existing.incident_type as HappinessIncidentType] ?? 'this loss'
            }.`}
          </Text>
          {existing.amount_approved_cents != null && existing.status === 'paid' ? (
            <Text style={styles.body}>{`Goodwill recorded: ${formatUsdFromCents(existing.amount_approved_cents)}.`}</Text>
          ) : null}
          {existing.decision_notes ? <Text style={styles.body}>{existing.decision_notes}</Text> : null}
          <Text style={styles.body}>{HAPPINESS_COPY.distinctFromRefunds}</Text>
        </ScrollView>
      ) : eligibility && !eligibility.ok ? (
        <Text style={styles.error}>{eligibility.reason}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.body}>{HAPPINESS_COPY.secondary}</Text>
          <Text style={styles.section}>What happened</Text>
          <View style={styles.typeRow}>
            {HAPPINESS_INCIDENT_TYPES.map((type) => {
              const selected = type === incidentType;
              return (
                <Pressable
                  key={type}
                  style={[styles.typeChip, selected && styles.typeChipSelected]}
                  onPress={() => setIncidentType(type)}
                >
                  <Text style={[styles.typeChipText, selected && styles.typeChipTextSelected]}>
                    {HAPPINESS_INCIDENT_LABELS[type]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.label}>{`Amount requested (up to ${formatPledgeCap()})`}</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="250"
            placeholderTextColor="#8a8172"
            style={styles.input}
          />
          <Text style={styles.label}>What happened</Text>
          <TextInput
            value={narrative}
            onChangeText={setNarrative}
            multiline
            placeholder="Where, when, and how the loss happened during this job."
            placeholderTextColor="#8a8172"
            style={[styles.input, styles.multiline]}
          />
          <Text style={styles.label}>Evidence</Text>
          <TextInput
            value={evidenceNotes}
            onChangeText={setEvidenceNotes}
            multiline
            placeholder="What the photos show, or the receipts and proof you have."
            placeholderTextColor="#8a8172"
            style={[styles.input, styles.multiline]}
          />
          <Pressable style={styles.secondaryButton} onPress={addPhoto}>
            <Text style={styles.secondaryButtonText}>
              {photos.length === 0 ? 'Add a photo' : `Add another photo (${photos.length}/4)`}
            </Text>
          </Pressable>
          {photos.map((photo) => (
            <Text key={photo.uri} style={styles.photoName}>{photo.name}</Text>
          ))}

          <Text style={styles.section}>Your own insurance</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>I already asked my homeowner's or renter's insurer</Text>
            <Switch value={ownCoveragePursued} onValueChange={setOwnCoveragePursued} />
          </View>
          <TextInput
            value={ownCoverageNotes}
            onChangeText={setOwnCoverageNotes}
            multiline
            placeholder="What your insurer said, or why that policy does not apply."
            placeholderTextColor="#8a8172"
            style={[styles.input, styles.multiline]}
          />

          <Text style={styles.section}>Not included</Text>
          {HAPPINESS_EXCLUSIONS.map((item) => (
            <Text key={item.id} style={styles.bullet}>{`• ${item.summary}`}</Text>
          ))}

          <AckRow label={HAPPINESS_COPY.ackNotInsurance} value={ackNotInsurance} onChange={setAckNotInsurance} />
          <AckRow label={HAPPINESS_COPY.ackSecondary} value={ackSecondary} onChange={setAckSecondary} />
          <AckRow label={HAPPINESS_COPY.ackExclusions} value={ackExclusions} onChange={setAckExclusions} />
          <AckRow label={HAPPINESS_COPY.ackNegligence} value={ackNegligence} onChange={setAckNegligence} />

          {formError ? <Text style={styles.errorInline}>{formError}</Text> : null}
          <Pressable
            style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
            onPress={submit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Submit request</Text>
            )}
          </Pressable>
          <Text style={styles.footnote}>{HAPPINESS_COPY.decision}</Text>
        </ScrollView>
      )}
    </View>
  );
}

function AckRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8E8',
  },
  header: {
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  back: {
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    marginTop: 12,
    color: '#0c4309',
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 6,
    color: '#1d3a16',
    fontSize: 14,
    lineHeight: 20,
  },
  loader: {
    marginTop: 48,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  section: {
    marginTop: 18,
    color: '#0c4309',
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    marginTop: 8,
    color: '#1d3a16',
    fontSize: 15,
    lineHeight: 21,
  },
  label: {
    marginTop: 14,
    marginBottom: 6,
    color: '#0c4309',
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5DCC9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#1d3a16',
    fontSize: 15,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  typeChip: {
    borderWidth: 1,
    borderColor: '#0c4309',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  typeChipSelected: {
    backgroundColor: '#0c4309',
  },
  typeChipText: {
    color: '#0c4309',
    fontSize: 13,
    fontWeight: '600',
  },
  typeChipTextSelected: {
    color: '#FFFFFF',
  },
  secondaryButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#0c4309',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#0c4309',
    fontWeight: '600',
  },
  photoName: {
    marginTop: 4,
    color: '#4d5c45',
    fontSize: 12,
  },
  bullet: {
    marginTop: 4,
    color: '#1d3a16',
    fontSize: 14,
    lineHeight: 20,
  },
  switchRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchLabel: {
    flex: 1,
    color: '#1d3a16',
    fontSize: 14,
    lineHeight: 19,
  },
  primaryButton: {
    marginTop: 20,
    backgroundColor: '#0c4309',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 14,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  footnote: {
    marginTop: 12,
    color: '#4d5c45',
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    margin: 20,
    color: '#8a2b12',
    fontSize: 15,
    lineHeight: 21,
  },
  errorInline: {
    marginTop: 12,
    color: '#8a2b12',
    fontSize: 14,
    lineHeight: 19,
  },
});
