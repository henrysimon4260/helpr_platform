import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://hecikcopbdhhiilhgmrd.supabase.co'
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
  'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
  'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI',
  'WY',
])

type ProviderRow = {
  service_provider_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | number | null
  checkr_candidate_id: string | null
  checkr_invitation_id: string | null
  checkr_invitation_url: string | null
  checkr_invitation_expires_at: string | null
  checkr_status: string | null
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const checkrErrorMessage = (body: unknown, fallback: string) => {
  if (!body || typeof body !== 'object') {
    return fallback
  }
  const record = body as Record<string, unknown>
  if (typeof record.error === 'string' && record.error.trim()) {
    return record.error
  }
  if (Array.isArray(record.error) && record.error.length > 0) {
    const first = record.error[0]
    if (typeof first === 'string') {
      return first
    }
    if (first && typeof first === 'object' && typeof (first as { message?: unknown }).message === 'string') {
      return (first as { message: string }).message
    }
  }
  if (Array.isArray(record.errors) && typeof record.errors[0] === 'string') {
    return record.errors[0]
  }
  return fallback
}

const phoneDigits = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return null
  }
  const digits = String(value).replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json(405, { success: false, error: 'Method not allowed' })
  }

  try {
    const apiKey = Deno.env.get('CHECKR_API_KEY')
    const packageSlug = Deno.env.get('CHECKR_PACKAGE')
    const apiBase = (Deno.env.get('CHECKR_API_BASE_URL') || 'https://api.checkr.com/v1').replace(/\/+$/, '')

    if (!apiKey || !packageSlug) {
      return json(503, {
        success: false,
        error: 'Checkr is not configured. Set CHECKR_API_KEY and CHECKR_PACKAGE.',
      })
    }

    if (!supabaseServiceKey) {
      return json(500, { success: false, error: 'Supabase service role is not configured.' })
    }

    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return json(401, { success: false, error: 'Sign in before starting a background check.' })
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey)
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) {
      return json(401, { success: false, error: 'Sign in before starting a background check.' })
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const workState = String(body.work_state ?? body.workState ?? '').trim().toUpperCase()
    const workCity = String(body.work_city ?? body.workCity ?? '').trim()

    const { data: provider, error: providerError } = await admin
      .from('service_provider')
      .select('service_provider_id, first_name, last_name, email, phone, checkr_candidate_id, checkr_invitation_id, checkr_invitation_url, checkr_invitation_expires_at, checkr_status')
      .eq('service_provider_id', userData.user.id)
      .maybeSingle()

    if (providerError) {
      console.error('Failed to load provider for Checkr:', providerError.message)
      return json(500, { success: false, error: 'Unable to load your provider profile.' })
    }

    if (!provider) {
      return json(404, { success: false, error: 'Finish signup before starting a background check.' })
    }

    const row = provider as ProviderRow
    const status = (row.checkr_status ?? 'not_started').toLowerCase()

    if (status === 'clear') {
      return json(200, { success: true, checkr_status: 'clear', invitation_url: null })
    }

    if (status === 'consider' || status === 'suspended') {
      return json(409, {
        success: false,
        error: status === 'consider'
          ? 'Checkr returned a consider result. Helpr does not allow consider results to accept jobs. Contact support.'
          : 'Checkr suspended this background check. Contact support before trying again.',
      })
    }

    const expiresAt = row.checkr_invitation_expires_at ? Date.parse(row.checkr_invitation_expires_at) : NaN
    const invitationStillOpen = status === 'pending'
      && Boolean(row.checkr_invitation_url)
      && Number.isFinite(expiresAt)
      && expiresAt > Date.now()

    if (invitationStillOpen) {
      return json(200, {
        success: true,
        checkr_status: 'pending',
        invitation_url: row.checkr_invitation_url,
        invitation_id: row.checkr_invitation_id,
        candidate_id: row.checkr_candidate_id,
        expires_at: row.checkr_invitation_expires_at,
      })
    }

    if (!US_STATE_CODES.has(workState)) {
      return json(400, { success: false, error: 'Enter the two-letter US state where you will work.' })
    }

    if (!row.email) {
      return json(400, { success: false, error: 'Add an email to your profile before starting Checkr.' })
    }

    const authorization = `Basic ${btoa(`${apiKey}:`)}`
    const workLocation: Record<string, string> = { country: 'US', state: workState }
    if (workCity) {
      workLocation.city = workCity
    }

    const checkrFetch = async (path: string, init: RequestInit) => {
      const response = await fetch(`${apiBase}${path}`, {
        ...init,
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      })
      const raw = await response.text()
      let parsed: unknown = null
      if (raw) {
        try {
          parsed = JSON.parse(raw)
        } catch {
          parsed = { error: raw }
        }
      }
      return { ok: response.ok, status: response.status, body: parsed }
    }

    let candidateId = row.checkr_candidate_id
    if (!candidateId) {
      const candidatePayload: Record<string, unknown> = {
        email: row.email,
        custom_id: row.service_provider_id,
        no_middle_name: true,
        work_locations: [workLocation],
      }
      if (row.first_name) candidatePayload.first_name = row.first_name
      if (row.last_name) candidatePayload.last_name = row.last_name
      const phone = phoneDigits(row.phone)
      if (phone) candidatePayload.phone = phone

      const created = await checkrFetch('/candidates', {
        method: 'POST',
        body: JSON.stringify(candidatePayload),
      })
      if (!created.ok || !created.body || typeof created.body !== 'object' || typeof (created.body as { id?: unknown }).id !== 'string') {
        console.error('Checkr candidate create failed:', created.status)
        return json(502, {
          success: false,
          error: checkrErrorMessage(created.body, 'Checkr could not create a candidate.'),
        })
      }
      candidateId = (created.body as { id: string }).id
      const { error: candidateSaveError } = await admin
        .from('service_provider')
        .update({
          checkr_candidate_id: candidateId,
          checkr_work_state: workState,
          checkr_last_event: 'candidate.created',
        })
        .eq('service_provider_id', row.service_provider_id)
      if (candidateSaveError) {
        console.error('Failed to persist Checkr candidate:', candidateSaveError.message)
        return json(500, { success: false, error: 'Checkr created a candidate, but Helpr could not save it. Contact support.' })
      }
    } else {
      await checkrFetch(`/candidates/${candidateId}`, {
        method: 'POST',
        body: JSON.stringify({
          email: row.email,
          custom_id: row.service_provider_id,
          work_locations: [workLocation],
          ...(row.first_name ? { first_name: row.first_name } : {}),
          ...(row.last_name ? { last_name: row.last_name } : {}),
        }),
      })
    }

    const invitation = await checkrFetch('/invitations', {
      method: 'POST',
      body: JSON.stringify({
        candidate_id: candidateId,
        package: packageSlug,
        work_locations: [workLocation],
      }),
    })

    if (!invitation.ok || !invitation.body || typeof invitation.body !== 'object') {
      console.error('Checkr invitation create failed:', invitation.status)
      return json(502, {
        success: false,
        error: checkrErrorMessage(invitation.body, 'Checkr could not create an invitation.'),
      })
    }

    const invitationBody = invitation.body as {
      id?: string
      invitation_url?: string
      expires_at?: string
    }
    if (!invitationBody.id || !invitationBody.invitation_url) {
      return json(502, { success: false, error: 'Checkr did not return an invitation URL.' })
    }

    const updatedAt = new Date().toISOString()
    const { error: updateError } = await admin
      .from('service_provider')
      .update({
        checkr_candidate_id: candidateId,
        checkr_invitation_id: invitationBody.id,
        checkr_invitation_url: invitationBody.invitation_url,
        checkr_invitation_expires_at: invitationBody.expires_at ?? null,
        checkr_package: packageSlug,
        checkr_work_state: workState,
        checkr_status: 'pending',
        checkr_last_event: 'invitation.created',
        checkr_status_updated_at: updatedAt,
      })
      .eq('service_provider_id', row.service_provider_id)

    if (updateError) {
      console.error('Failed to persist Checkr invitation:', updateError.message)
      return json(500, { success: false, error: 'Checkr created an invitation, but Helpr could not save it. Contact support.' })
    }

    return json(200, {
      success: true,
      checkr_status: 'pending',
      invitation_url: invitationBody.invitation_url,
      invitation_id: invitationBody.id,
      candidate_id: candidateId,
      expires_at: invitationBody.expires_at ?? null,
    })
  } catch (error) {
    console.error('create-checkr-invitation failed:', error instanceof Error ? error.message : 'unknown')
    return json(500, { success: false, error: 'Unable to start the Checkr background check.' })
  }
})
