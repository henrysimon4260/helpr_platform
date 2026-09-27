import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  HAPPINESS_COPY,
  HAPPINESS_EXCLUSIONS,
  HELPR_HAPPINESS_PROGRAM_NAME,
  formatPledgeCap,
} from '../../lib/helprHappiness/policy';

export default function HelprHappinessScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.back}>Back</Text>
        </Pressable>
        <Text style={styles.title}>{HELPR_HAPPINESS_PROGRAM_NAME}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lead}>{HAPPINESS_COPY.notInsurance}</Text>
        <Text style={styles.body}>{HAPPINESS_COPY.shortNotice}</Text>
        <Text style={styles.body}>{HAPPINESS_COPY.secondary}</Text>

        <Text style={styles.section}>Goodwill ceiling</Text>
        <Text style={styles.body}>
          {`Helpr may pay up to ${formatPledgeCap()} for a request that fits this program. That figure is a ceiling on goodwill. It is not insurance.`}
        </Text>

        <Text style={styles.section}>When a request can be filed</Text>
        <Text style={styles.body}>{HAPPINESS_COPY.eligibilityIntro}</Text>
        {HAPPINESS_COPY.eligibility.map((line) => (
          <Text key={line} style={styles.bullet}>{`• ${line}`}</Text>
        ))}

        <Text style={styles.section}>What is not included</Text>
        {HAPPINESS_EXCLUSIONS.map((item) => (
          <Text key={item.id} style={styles.bullet}>{`• ${item.summary}`}</Text>
        ))}

        <Text style={styles.section}>How a decision is made</Text>
        <Text style={styles.body}>{HAPPINESS_COPY.decision}</Text>
        <Text style={styles.body}>{HAPPINESS_COPY.distinctFromRefunds}</Text>
        <Text style={styles.body}>
          Open a completed paid job and choose Request Helpr Happiness. You will be asked what happened, what it cost, and for photos or a written account of your evidence.
        </Text>
      </ScrollView>
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
    paddingBottom: 12,
    backgroundColor: '#FFF8E8',
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
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  lead: {
    color: '#0c4309',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  section: {
    marginTop: 22,
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
  bullet: {
    marginTop: 6,
    color: '#1d3a16',
    fontSize: 15,
    lineHeight: 21,
  },
});
