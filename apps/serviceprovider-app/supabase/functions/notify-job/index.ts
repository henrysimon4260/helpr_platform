import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decidePushAttempt, expoTicketList, interpretExpoTickets } from './policy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({
        inApp: true,
        pushDelivered: false,
        pushStatus: 'degraded',
        reason: 'supabase_env_missing',
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    const user = userData?.user;
    if (userError || !user) {
      return json({
        inApp: true,
        pushDelivered: false,
        pushStatus: 'failed',
        reason: 'not_signed_in',
      }, 401);
    }

    const payload = await req.json().catch(() => ({}));
    const notificationId = typeof payload?.notificationId === 'string' ? payload.notificationId : '';
    if (!notificationId) {
      return json({
        inApp: false,
        pushDelivered: false,
        pushStatus: 'failed',
        reason: 'notification_id_required',
      }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: notice, error: noticeError } = await admin
      .from('job_notifications')
      .select('id, recipient_role, recipient_id, actor_role, actor_id, title, body, push_status')
      .eq('id', notificationId)
      .maybeSingle();

    if (noticeError || !notice) {
      return json({
        inApp: false,
        pushDelivered: false,
        pushStatus: 'failed',
        reason: 'notification_not_found',
      }, 404);
    }

    const email = (user.email ?? '').trim();
    let callerCustomerId: string | null = null;
    if (email) {
      const { data: customer } = await admin
        .from('customer')
        .select('customer_id')
        .eq('email', email)
        .maybeSingle();
      callerCustomerId = customer?.customer_id ? String(customer.customer_id) : null;
    }

    const actorOk = notice.actor_role === 'provider'
      ? notice.actor_id === user.id
      : notice.actor_role === 'customer' && callerCustomerId !== null && notice.actor_id === callerCustomerId;

    if (!actorOk) {
      return json({
        inApp: true,
        pushDelivered: false,
        pushStatus: 'failed',
        reason: 'not_allowed',
      }, 403);
    }

    if (notice.push_status === 'sent') {
      return json({
        inApp: true,
        pushDelivered: true,
        pushStatus: 'sent',
        reason: null,
      });
    }

    const { data: tokenRows } = await admin
      .from('device_push_tokens')
      .select('expo_push_token')
      .eq('owner_role', notice.recipient_role)
      .eq('owner_id', notice.recipient_id);

    const decision = decidePushAttempt({
      expoAccessToken: Deno.env.get('EXPO_ACCESS_TOKEN'),
      tokens: (tokenRows ?? []).map(row => row.expo_push_token),
    });

    if (!decision.attempt) {
      await admin
        .from('job_notifications')
        .update({ push_status: 'degraded', push_error: decision.reason })
        .eq('id', notice.id);
      return json({
        inApp: true,
        pushDelivered: false,
        pushStatus: 'degraded',
        reason: decision.reason,
      });
    }

    const expoResponse = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}`,
      },
      body: JSON.stringify(decision.deliverableTokens.map(to => ({
        to,
        title: notice.title,
        body: notice.body,
        sound: 'default',
        data: { notificationId: notice.id, kind: 'job' },
      }))),
    });

    if (!expoResponse.ok) {
      const reason = `expo_http_${expoResponse.status}`;
      await admin
        .from('job_notifications')
        .update({ push_status: 'failed', push_error: reason })
        .eq('id', notice.id);
      return json({
        inApp: true,
        pushDelivered: false,
        pushStatus: 'failed',
        reason,
      });
    }

    const expoPayload = await expoResponse.json().catch(() => null);
    const interpreted = interpretExpoTickets(expoTicketList(expoPayload));
    await admin
      .from('job_notifications')
      .update({
        push_status: interpreted.pushStatus,
        push_error: interpreted.reason,
      })
      .eq('id', notice.id);

    return json({
      inApp: true,
      pushDelivered: interpreted.pushDelivered,
      pushStatus: interpreted.pushStatus,
      reason: interpreted.reason,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'notify_failed';
    return json({
      inApp: true,
      pushDelivered: false,
      pushStatus: 'failed',
      reason: message,
    }, 500);
  }
});
