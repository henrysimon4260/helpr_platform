import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { unreadJobAlerts } from '../../lib/jobChat';
import { JOB_ALERTS_PATH, useJobParty } from './useJobParty';

export function useJobAlertBadge() {
  const { ownerId, ready, role } = useJobParty();
  const [total, setTotal] = useState(0);
  const [byService, setByService] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    if (!ownerId) {
      setTotal(0);
      setByService({});
      return;
    }
    const next = await unreadJobAlerts(role, ownerId);
    setTotal(next.total);
    setByService(next.byService);
  }, [ownerId, role]);

  useFocusEffect(
    useCallback(() => {
      if (!ready) {
        return undefined;
      }
      refresh();
      const timer = setInterval(refresh, 20000);
      return () => clearInterval(timer);
    }, [ready, refresh]),
  );

  React.useEffect(() => {
    if (!ownerId) {
      return undefined;
    }
    const channel = supabase
      .channel(`job-alerts-${role}-${ownerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'job_notifications',
          filter: `recipient_id=eq.${ownerId}`,
        },
        () => {
          refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ownerId, refresh, role]);

  return { total, byService, ready, ownerId, role };
}

export function JobAlertButton({ total }: { total?: number }) {
  const router = useRouter();
  const badge = useJobAlertBadge();
  const count = total ?? badge.total;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Alerts, ${count} unread` : 'Alerts'}
      onPress={() => router.push(JOB_ALERTS_PATH as never)}
      style={styles.button}
    >
      <Text style={styles.text}>Alerts</Text>
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : String(count)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E8',
    borderColor: '#0c4309',
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  text: {
    color: '#0c4309',
    fontSize: 13,
    fontWeight: '700',
  },
  badge: {
    marginLeft: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#0c4309',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFF8E8',
    fontSize: 11,
    fontWeight: '700',
  },
});
