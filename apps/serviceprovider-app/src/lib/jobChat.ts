import { Platform } from 'react-native';
import { supabase } from './supabase';
import {
  messageAlertCopy,
  type NoticeKind,
  type PartyRole,
  type PushStatus,
} from './jobNotifyPolicy';

export type NotifyResult = {
  inApp: boolean;
  pushDelivered: boolean;
  pushStatus: PushStatus;
  reason: string | null;
  notificationId: string | null;
};

export type JobMessage = {
  id: string;
  service_id: string;
  service_provider_id: string;
  sender_role: PartyRole;
  sender_id: string;
  body: string;
  created_at: string;
};

export type JobNotification = {
  id: string;
  service_id: string;
  recipient_role: PartyRole;
  recipient_id: string;
  actor_role: PartyRole;
  actor_id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  status_value: string | null;
  message_id: string | null;
  push_status: PushStatus;
  push_error: string | null;
  read_at: string | null;
  created_at: string;
};

export type JobChatSnapshot = {
  serviceId: string;
  status: string | null;
  customerId: string | null;
  providerId: string | null;
};

const failedNotice = (reason: string): NotifyResult => ({
  inApp: false,
  pushDelivered: false,
  pushStatus: 'failed',
  reason,
  notificationId: null,
});

export async function loadJobForChat(serviceId: string): Promise<JobChatSnapshot | null> {
  const { data, error } = await supabase
    .from('service')
    .select('service_id, status, customer_id, service_provider_id')
    .eq('service_id', serviceId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    serviceId: String(data.service_id),
    status: data.status ?? null,
    customerId: data.customer_id ? String(data.customer_id) : null,
    providerId: data.service_provider_id ? String(data.service_provider_id) : null,
  };
}

export async function listJobMessages(serviceId: string): Promise<JobMessage[]> {
  const { data, error } = await supabase
    .from('job_messages')
    .select('id, service_id, service_provider_id, sender_role, sender_id, body, created_at')
    .eq('service_id', serviceId)
    .order('created_at', { ascending: true });

  if (error || !data) {
    return [];
  }
  return data as JobMessage[];
}

export async function recordJobNotice(input: {
  serviceId: string;
  recipientRole: PartyRole;
  recipientId: string;
  actorRole: PartyRole;
  actorId: string;
  kind: NoticeKind;
  title: string;
  body: string;
  statusValue?: string | null;
  messageId?: string | null;
}): Promise<NotifyResult> {
  const { data, error } = await supabase
    .from('job_notifications')
    .insert({
      service_id: input.serviceId,
      recipient_role: input.recipientRole,
      recipient_id: input.recipientId,
      actor_role: input.actorRole,
      actor_id: input.actorId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      status_value: input.statusValue ?? null,
      message_id: input.messageId ?? null,
      push_status: 'pending',
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    return failedNotice(error?.message ?? 'alert_not_saved');
  }

  const notificationId = String(data.id);
  const { data: fnData, error: fnError } = await supabase.functions.invoke('notify-job', {
    body: { notificationId },
  });

  if (fnError || !fnData || fnData.pushDelivered !== true) {
    const reason = typeof fnData?.reason === 'string'
      ? fnData.reason
      : (fnError?.message ?? 'push_not_delivered');
    const pushStatus: PushStatus = fnData?.pushStatus === 'failed' ? 'failed' : 'degraded';
    return {
      inApp: true,
      pushDelivered: false,
      pushStatus,
      reason,
      notificationId,
    };
  }

  return {
    inApp: true,
    pushDelivered: true,
    pushStatus: 'sent',
    reason: null,
    notificationId,
  };
}

export async function retractJobNotice(notificationId: string): Promise<void> {
  await supabase.from('job_notifications').delete().eq('id', notificationId);
}

export async function sendJobMessage(input: {
  serviceId: string;
  providerId: string;
  senderRole: PartyRole;
  senderId: string;
  recipientRole: PartyRole;
  recipientId: string;
  body: string;
}): Promise<{ message: JobMessage | null; notice: NotifyResult | null; error: string | null }> {
  const body = input.body.trim();
  if (!body) {
    return { message: null, notice: null, error: 'Message is empty.' };
  }

  const { data, error } = await supabase
    .from('job_messages')
    .insert({
      service_id: input.serviceId,
      service_provider_id: input.providerId,
      sender_role: input.senderRole,
      sender_id: input.senderId,
      body,
    })
    .select('id, service_id, service_provider_id, sender_role, sender_id, body, created_at')
    .single();

  if (error || !data) {
    return { message: null, notice: null, error: error?.message ?? 'Message was not saved.' };
  }

  const message = data as JobMessage;
  const copy = messageAlertCopy(body);
  const notice = await recordJobNotice({
    serviceId: input.serviceId,
    recipientRole: input.recipientRole,
    recipientId: input.recipientId,
    actorRole: input.senderRole,
    actorId: input.senderId,
    kind: 'message',
    title: copy.title,
    body: copy.body,
    messageId: message.id,
  });

  return { message, notice, error: null };
}

export async function listJobAlerts(role: PartyRole, ownerId: string): Promise<JobNotification[]> {
  const { data, error } = await supabase
    .from('job_notifications')
    .select('id, service_id, recipient_role, recipient_id, actor_role, actor_id, kind, title, body, status_value, message_id, push_status, push_error, read_at, created_at')
    .eq('recipient_role', role)
    .eq('recipient_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) {
    return [];
  }
  return data as JobNotification[];
}

export async function unreadJobAlerts(role: PartyRole, ownerId: string): Promise<{ total: number; byService: Record<string, number> }> {
  const { data, error } = await supabase
    .from('job_notifications')
    .select('service_id')
    .eq('recipient_role', role)
    .eq('recipient_id', ownerId)
    .is('read_at', null)
    .limit(200);

  if (error || !data) {
    return { total: 0, byService: {} };
  }

  const byService: Record<string, number> = {};
  for (const row of data) {
    const serviceId = String(row.service_id);
    byService[serviceId] = (byService[serviceId] ?? 0) + 1;
  }
  return { total: data.length, byService };
}

export async function markJobAlertsRead(role: PartyRole, ownerId: string, serviceId?: string): Promise<void> {
  let query = supabase
    .from('job_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_role', role)
    .eq('recipient_id', ownerId)
    .is('read_at', null);

  if (serviceId) {
    query = query.eq('service_id', serviceId);
  }

  await query;
}

export async function registerDevicePushToken(
  role: PartyRole,
  ownerId: string,
): Promise<'registered' | 'skipped' | 'denied' | 'unavailable'> {
  if (Platform.OS === 'web') {
    return 'unavailable';
  }

  try {
    const notificationsName = 'expo-notifications';
    const deviceName = 'expo-device';
    const constantsName = 'expo-constants';
    const Notifications = await import(notificationsName);
    const Device = await import(deviceName);
    const constantsModule = await import(constantsName);
    const Constants = constantsModule.default ?? constantsModule;

    if (!Device.isDevice) {
      return 'unavailable';
    }

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('job-alerts', {
        name: 'Job alerts',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }
    if (!granted) {
      return 'denied';
    }

    const projectId = Constants.default.expoConfig?.extra?.eas?.projectId
      ?? Constants.default.easConfig?.projectId;
    if (!projectId) {
      return 'unavailable';
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResult.data;
    if (!token) {
      return 'unavailable';
    }

    const { error } = await supabase.from('device_push_tokens').upsert({
      owner_role: role,
      owner_id: ownerId,
      expo_push_token: token,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_role,owner_id,expo_push_token' });

    return error ? 'skipped' : 'registered';
  } catch {
    return 'unavailable';
  }
}
