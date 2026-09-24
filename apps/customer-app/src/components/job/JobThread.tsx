import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  listJobMessages,
  loadJobForChat,
  markJobAlertsRead,
  sendJobMessage,
  type JobMessage,
} from '../../lib/jobChat';
import { isJobChatUnlocked } from '../../lib/jobNotifyPolicy';
import { supabase } from '../../lib/supabase';
import { useJobParty } from './useJobParty';

type Props = {
  serviceId: string;
};

export function JobThread({ serviceId }: Props) {
  const router = useRouter();
  const { ownerId, ready, role } = useJobParty();
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<JobMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const listRef = useRef<FlatList<JobMessage>>(null);

  const refresh = useCallback(async () => {
    if (!serviceId || !ownerId) {
      setChatOpen(false);
      setMessages([]);
      setLoading(false);
      return;
    }

    const job = await loadJobForChat(serviceId);
    const open = Boolean(
      job
      && isJobChatUnlocked(job.status, job.providerId)
      && ((role === 'customer' && job.customerId === ownerId) || (role === 'provider' && job.providerId === ownerId)),
    );
    setChatOpen(open);
    setProviderId(job?.providerId ?? null);
    setCustomerId(job?.customerId ?? null);
    if (!open) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setMessages(await listJobMessages(serviceId));
    setLoading(false);
  }, [ownerId, role, serviceId]);

  useFocusEffect(
    useCallback(() => {
      if (!ready) {
        return undefined;
      }
      refresh();
      if (ownerId && serviceId) {
        markJobAlertsRead(role, ownerId, serviceId);
      }
      const timer = setInterval(refresh, 5000);
      return () => clearInterval(timer);
    }, [ownerId, ready, refresh, role, serviceId]),
  );

  useEffect(() => {
    if (!serviceId || !chatOpen) {
      return undefined;
    }
    const channel = supabase
      .channel(`job-messages-${serviceId}-${role}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'job_messages',
          filter: `service_id=eq.${serviceId}`,
        },
        () => {
          refresh();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatOpen, refresh, role, serviceId]);

  const onSend = useCallback(async () => {
    if (!chatOpen || !ownerId || !providerId || !customerId || sending) {
      return;
    }
    const recipientId = role === 'customer' ? providerId : customerId;
    const recipientRole = role === 'customer' ? 'provider' : 'customer';
    setSending(true);
    setErrorText(null);
    const result = await sendJobMessage({
      serviceId,
      providerId,
      senderRole: role,
      senderId: ownerId,
      recipientRole,
      recipientId,
      body: draft,
    });
    setSending(false);
    if (!result.message) {
      setErrorText(result.error ?? 'Message was not saved.');
      return;
    }
    setDraft('');
    if (!result.notice?.inApp) {
      setErrorText('Message saved. The other person was not alerted.');
    }
    await refresh();
    listRef.current?.scrollToEnd({ animated: true });
  }, [chatOpen, customerId, draft, ownerId, providerId, refresh, role, sending, serviceId]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.back}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Job chat</Text>
      </View>
      {loading || !ready ? (
        <ActivityIndicator color="#0c4309" style={styles.loader} />
      ) : !chatOpen ? (
        <View style={styles.locked}>
          <Text style={styles.lockedTitle}>No chat for this job</Text>
          <Text style={styles.lockedBody}>
            Messages open after a Helpr is confirmed. Unassigned jobs stay closed.
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={<Text style={styles.empty}>No messages yet.</Text>}
            renderItem={({ item }) => {
              const mine = item.sender_role === role;
              return (
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  <Text style={[styles.bubbleText, mine ? styles.mineText : styles.theirsText]}>{item.body}</Text>
                </View>
              );
            }}
          />
          {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Message"
              placeholderTextColor="#8a8172"
              editable={!sending}
              maxLength={2000}
            />
            <Pressable
              style={[styles.send, (!draft.trim() || sending) ? styles.sendDisabled : null]}
              onPress={onSend}
              disabled={!draft.trim() || sending}
            >
              <Text style={styles.sendText}>{sending ? '...' : 'Send'}</Text>
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFF8E8' },
  header: { paddingTop: 64, paddingHorizontal: 20, paddingBottom: 12 },
  back: { color: '#0c4309', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  title: { color: '#0c4309', fontSize: 24, fontWeight: '700' },
  loader: { marginTop: 40 },
  locked: { paddingHorizontal: 24, paddingTop: 24 },
  lockedTitle: { color: '#0c4309', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  lockedBody: { color: '#49454F', fontSize: 15, lineHeight: 22 },
  list: { paddingHorizontal: 16, paddingBottom: 12 },
  empty: { color: '#49454F', textAlign: 'center', marginTop: 24 },
  bubble: { maxWidth: '80%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, marginVertical: 4 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#0c4309' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#E5DCC9' },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  mineText: { color: '#FFF8E8' },
  theirsText: { color: '#0c4309' },
  error: { color: '#8a3b12', paddingHorizontal: 16, paddingBottom: 4, fontSize: 13 },
  composer: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingBottom: 24 },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D9C6A5',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0c4309',
  },
  send: { marginLeft: 8, backgroundColor: '#0c4309', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: '#FFF8E8', fontWeight: '700' },
});
