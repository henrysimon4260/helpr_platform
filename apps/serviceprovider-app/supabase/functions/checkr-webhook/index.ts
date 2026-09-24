import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { checkrSignatureMatches, reduceCheckrEvent, type CheckrEventObject } from '../_shared/checkr.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://hecikcopbdhhiilhgmrd.supabase.co'
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { received: false, error: 'Method not allowed' })
  }

  const rawBody = await req.text()
  const signature = req.headers.get('x-checkr-signature')
  const webhookSecret = Deno.env.get('CHECKR_WEBHOOK_SECRET') ?? ''
  const apiKey = Deno.env.get('CHECKR_API_KEY') ?? ''
  const secretMatched = webhookSecret
    ? await checkrSignatureMatches(webhookSecret, rawBody, signature)
    : false
  const keyMatched = !secretMatched && apiKey && apiKey !== webhookSecret
    ? await checkrSignatureMatches(apiKey, rawBody, signature)
    : false

  if (!secretMatched && !keyMatched) {
    return json(401, { received: false, error: 'Invalid Checkr signature' })
  }

  if (!supabaseServiceKey) {
    return json(500, { received: false, error: 'Supabase service role is not configured.' })
  }

  let event: { type?: string; data?: { object?: CheckrEventObject } }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return json(400, { received: false, error: 'Invalid JSON' })
  }

  const eventType = typeof event.type === 'string' ? event.type : ''
  const object = event.data?.object ?? {}
  const candidateId = typeof object.candidate_id === 'string' ? object.candidate_id : null
  const customId = typeof object.custom_id === 'string' ? object.custom_id : null
  const reportId = typeof object.id === 'string' && object.object === 'report'
    ? object.id
    : (typeof object.report_id === 'string' ? object.report_id : null)

  const admin = createClient(supabaseUrl, supabaseServiceKey)

  const loadProvider = async () => {
    if (candidateId) {
      const byCandidate = await admin
        .from('service_provider')
        .select('service_provider_id, checkr_status')
        .eq('checkr_candidate_id', candidateId)
        .maybeSingle()
      if (byCandidate.data) {
        return byCandidate.data
      }
    }
    if (customId) {
      const byProvider = await admin
        .from('service_provider')
        .select('service_provider_id, checkr_status')
        .eq('service_provider_id', customId)
        .maybeSingle()
      if (byProvider.data) {
        return byProvider.data
      }
    }
    if (reportId) {
      const byReport = await admin
        .from('service_provider')
        .select('service_provider_id, checkr_status')
        .eq('checkr_report_id', reportId)
        .maybeSingle()
      if (byReport.data) {
        return byReport.data
      }
    }
    return null
  }

  const provider = await loadProvider()
  if (!provider) {
    console.log('Checkr webhook matched no provider', eventType, candidateId, reportId)
    return json(200, { received: true, matched: false })
  }

  const update = reduceCheckrEvent(provider.checkr_status, eventType, object)
  const patch: Record<string, string | null> = {
    checkr_last_event: update.eventType || eventType,
  }
  if (update.changed) {
    patch.checkr_status = update.status
    patch.checkr_status_updated_at = new Date().toISOString()
  }
  if (update.candidateId) patch.checkr_candidate_id = update.candidateId
  if (update.reportId) patch.checkr_report_id = update.reportId
  if (update.invitationId) patch.checkr_invitation_id = update.invitationId
  if (update.invitationUrl) patch.checkr_invitation_url = update.invitationUrl
  if (update.invitationExpiresAt) patch.checkr_invitation_expires_at = update.invitationExpiresAt

  const { error } = await admin
    .from('service_provider')
    .update(patch)
    .eq('service_provider_id', provider.service_provider_id)

  if (error) {
    console.error('Checkr webhook persist failed:', error.message)
    return json(500, { received: false, error: 'Unable to store Checkr status' })
  }

  console.log('Checkr webhook applied', update.eventType, update.status, provider.service_provider_id)
  return json(200, { received: true, matched: true, checkr_status: update.status })
})
