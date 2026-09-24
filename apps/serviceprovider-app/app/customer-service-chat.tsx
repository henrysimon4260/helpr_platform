import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../src/lib/supabase';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const SUPPORT_INBOX = 'henry@helprservices.co';

function readPayload(data: unknown):
  | { kind: 'reply'; reply: string; escalate: boolean }
  | { kind: 'error'; message: string }
  | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as { reply?: unknown; escalate?: unknown; error?: unknown; message?: unknown };
  if (record.error !== undefined) {
    return {
      kind: 'error',
      message:
        typeof record.message === 'string' && record.message.trim()
          ? record.message.trim()
          : 'Support chat did not return a reply. Nothing was answered.',
    };
  }
  if (typeof record.reply === 'string' && record.reply.trim()) {
    return { kind: 'reply', reply: record.reply.trim(), escalate: record.escalate === true };
  }
  if (typeof record.message === 'string' && record.message.trim()) {
    return { kind: 'error', message: record.message.trim() };
  }
  return null;
}

async function readInvokeError(error: unknown) {
  const fallback = 'Support chat could not be reached. Nothing was answered.';
  if (!error || typeof error !== 'object') return fallback;

  const context = (error as { context?: unknown }).context;
  const messageFrom = (body: unknown) => {
    if (!body || typeof body !== 'object') return null;
    const message = (body as { message?: unknown }).message;
    return typeof message === 'string' && message.trim() ? message.trim() : null;
  };

  if (context && typeof context === 'object' && typeof (context as { json?: unknown }).json === 'function') {
    try {
      const message = messageFrom(await (context as { json: () => Promise<unknown> }).json());
      if (message) return message;
    } catch {
      // The error body was not JSON.
    }
  } else {
    const message = messageFrom(context);
    if (message) return message;
  }

  const name = (error as { name?: string }).name;
  if (name === 'FunctionsFetchError' || name === 'FunctionsRelayError') {
    return 'Support chat could not be reached. The support-chat function may not be deployed yet. Nothing was answered.';
  }

  return fallback;
}

export default function CustomerServiceChat() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPerson, setNeedsPerson] = useState(false);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, error, needsPerson]);

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content }];
    setSending(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('support-chat', {
        body: {
          audience: 'provider',
          channel: 'app',
          messages: nextMessages,
        },
      });

      const parsed = readPayload(data);
      if (parsed?.kind === 'reply') {
        setMessages([...nextMessages, { role: 'assistant', content: parsed.reply }]);
        setNeedsPerson(parsed.escalate);
        setDraft('');
        return;
      }
      if (parsed?.kind === 'error') {
        setError(parsed.message);
        return;
      }
      if (invokeError) {
        setError(await readInvokeError(invokeError));
        return;
      }
      setError('Support chat did not return a reply. Nothing was answered.');
    } catch {
      setError('Support chat could not be reached. Nothing was answered.');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Image source={require('../assets/icons/backButton.png')} style={styles.backButtonIcon} />
        </Pressable>
        <Text style={styles.title}>Helpr Support</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.intro}>
        Questions about jobs, payouts, and how Helpr works. This is not a chat with a customer.
      </Text>

      <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={styles.messagesContent}>
        {messages.length === 0 ? (
          <Text style={styles.empty}>
            Ask a question. A reply shows up here only after support chat responds.
          </Text>
        ) : (
          messages.map((message, index) => (
            <View
              key={`${message.role}-${index}`}
              style={[styles.bubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}
            >
              <Text style={message.role === 'user' ? styles.userText : styles.assistantText}>{message.content}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {needsPerson ? (
        <View style={styles.escalateBox}>
          <Text style={styles.escalateText}>
            A person needs to follow up. This chat did not email anyone. Write {SUPPORT_INBOX} and include what you asked.
          </Text>
        </View>
      ) : null}

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask Helpr support"
          placeholderTextColor="#7d8a78"
          style={styles.input}
          editable={!sending}
          multiline
          maxLength={1500}
          accessibilityLabel="Message to Helpr support"
        />
        <Pressable
          style={[styles.sendButton, (sending || draft.trim().length === 0) && styles.sendButtonDisabled]}
          onPress={send}
          disabled={sending || draft.trim().length === 0}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          {sending ? <ActivityIndicator color="#f1f7ed" /> : <Text style={styles.sendText}>Send</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFF8E8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backButton: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonIcon: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0c4309',
  },
  headerSpacer: {
    width: 56,
  },
  intro: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    fontSize: 14,
    lineHeight: 20,
    color: '#3d5340',
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  empty: {
    fontSize: 15,
    lineHeight: 22,
    color: '#5c6d58',
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  bubble: {
    maxWidth: '88%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#1f4d2c',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#e7f2e8',
  },
  userText: {
    color: '#f1f7ed',
    fontSize: 15,
    lineHeight: 21,
  },
  assistantText: {
    color: '#1c3f23',
    fontSize: 15,
    lineHeight: 21,
  },
  errorBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: '#fdecec',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: '#8a2a2a',
    fontSize: 14,
    lineHeight: 20,
  },
  escalateBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: '#e7f2e8',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  escalateText: {
    color: '#1c3f23',
    fontSize: 14,
    lineHeight: 20,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c5d6c6',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1c3f23',
  },
  sendButton: {
    minWidth: 76,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1f4d2c',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  sendButtonDisabled: {
    opacity: 0.55,
  },
  sendText: {
    color: '#f1f7ed',
    fontSize: 15,
    fontWeight: '700',
  },
});
