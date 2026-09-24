import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { bearerToken } from './paymentPolicy.ts'

export async function requireUser(req: Request): Promise<{ user: User } | { error: string }> {
  const token = bearerToken(req.headers.get('Authorization'))
  if (!token) {
    return { error: 'Missing authorization token' }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: 'Auth is not configured on the server' }
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) {
    return { error: 'Invalid or expired session' }
  }

  return { user: data.user }
}

export function serviceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Database is not configured on the server')
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
