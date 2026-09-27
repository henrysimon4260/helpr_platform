import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  HAPPINESS_COPY,
  HAPPINESS_EXCLUSIONS,
  HELPR_HAPPINESS_PROGRAM_NAME,
} from '../../lib/helprHappiness/policy';

type HelprHappinessNoticeProps = {
  variant: 'banner' | 'checkout';
};

export function HelprHappinessNotice({ variant }: HelprHappinessNoticeProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (variant === 'banner') {
    return (
      <Pressable
        style={styles.banner}
        onPress={() => router.push('/(booking-flow)/helpr-happiness' as never)}
        accessibilityRole="button"
        accessibilityLabel={`${HELPR_HAPPINESS_PROGRAM_NAME} details`}
      >
        <Text style={styles.bannerKicker}>{HELPR_HAPPINESS_PROGRAM_NAME}</Text>
        <Text style={styles.bannerBody}>{HAPPINESS_COPY.shortNotice}</Text>
        <Text style={styles.bannerLink}>Eligibility and exclusions</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.checkout}>
      <Text style={styles.checkoutTitle}>{HELPR_HAPPINESS_PROGRAM_NAME}</Text>
      <Text style={styles.checkoutBody}>{HAPPINESS_COPY.checkoutHint}</Text>
      <Text style={styles.checkoutBody}>{HAPPINESS_COPY.secondary}</Text>
      <Pressable
        onPress={() => setOpen((current) => !current)}
        accessibilityRole="button"
        accessibilityLabel="Show eligibility and exclusions"
      >
        <Text style={styles.checkoutLink}>{open ? 'Hide eligibility and exclusions' : 'Eligibility and exclusions'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.detail}>
          {HAPPINESS_COPY.eligibility.map((line) => (
            <Text key={line} style={styles.detailLine}>{`• ${line}`}</Text>
          ))}
          <Text style={styles.detailHeading}>Not included</Text>
          {HAPPINESS_EXCLUSIONS.map((item) => (
            <Text key={item.id} style={styles.detailLine}>{`• ${item.summary}`}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#FFF8E8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0c4309',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bannerKicker: {
    color: '#0c4309',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  bannerBody: {
    marginTop: 6,
    color: '#1d3a16',
    fontSize: 13,
    lineHeight: 18,
  },
  bannerLink: {
    marginTop: 8,
    color: '#0c4309',
    fontSize: 13,
    fontWeight: '700',
  },
  checkout: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5DCC9',
    padding: 12,
    marginBottom: 16,
  },
  checkoutTitle: {
    color: '#0c4309',
    fontSize: 13,
    fontWeight: '700',
  },
  checkoutBody: {
    marginTop: 6,
    color: '#1d3a16',
    fontSize: 12,
    lineHeight: 17,
  },
  checkoutLink: {
    marginTop: 8,
    color: '#0c4309',
    fontSize: 12,
    fontWeight: '700',
  },
  detail: {
    marginTop: 8,
  },
  detailHeading: {
    marginTop: 8,
    color: '#0c4309',
    fontSize: 12,
    fontWeight: '700',
  },
  detailLine: {
    marginTop: 4,
    color: '#1d3a16',
    fontSize: 12,
    lineHeight: 17,
  },
});
