import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { listJobAlerts, markJobAlertsRead, type JobNotification } from '../../lib/jobChat';
import { JOB_CHAT_PATH, useJobParty } from './useJobParty';

export function JobAlertsList() {
  const router = useRouter();
  const { ownerId, ready, role } = useJobParty();
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<JobNotification[]>([]);

  const refresh = useCallback(async () => {
    if (!ownerId) {
      setAlerts([]);
      setLoading(false);
      return;
    }
    setAlerts(await listJobAlerts(role, ownerId));
    setLoading(false);
  }, [ownerId, role]);

  useFocusEffect(
    useCallback(() => {
      if (!ready) {
        return undefined;
      }
      refresh();
      return undefined;
    }, [ready, refresh]),
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.back}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Alerts</Text>
        <Text style={styles.subtitle}>Messages, cancellations, and job status. Push appears here when it cannot be delivered.</Text>
      </View>
      {loading || !ready ? (
        <ActivityIndicator color="#0c4309" style={styles.loader} />
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No alerts yet.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.card, item.read_at ? styles.read : null]}
              onPress={async () => {
                if (ownerId) {
                  await markJobAlertsRead(role, ownerId, item.service_id);
                }
                if (item.kind === 'cancel') {
                  refresh();
                  return;
                }
                router.push({ pathname: JOB_CHAT_PATH as never, params: { serviceId: item.service_id } });
              }}
            >
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardBody}>{item.body}</Text>
              <Text style={styles.meta}>
                {item.push_status === 'sent' ? 'Push sent' : 'In app only'}
                {item.read_at ? '' : ' · Unread'}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFF8E8' },
  header: { paddingTop: 64, paddingHorizontal: 20, paddingBottom: 12 },
  back: { color: '#0c4309', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  title: { color: '#0c4309', fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#49454F', marginTop: 6, lineHeight: 20 },
  loader: { marginTop: 32 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  empty: { color: '#49454F', textAlign: 'center', marginTop: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#0c4309',
  },
  read: { borderColor: '#E5DCC9' },
  cardTitle: { color: '#0c4309', fontWeight: '700', marginBottom: 4 },
  cardBody: { color: '#49454F', lineHeight: 20 },
  meta: { color: '#74684F', marginTop: 8, fontSize: 12, fontWeight: '600' },
});
