// Deletes the signed-in Helpr account. Does not capture, refund, transfer, or pay out.
// Deploy: supabase functions deploy delete-account
// Contract: JOB_CONTRACT.md (`delete-account`).

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import {
  anonymizedEmail,
  findJobBlockers,
  hasOutstandingProviderBalance,
  isOpenServiceDeletable,
  mergeServices,
  shouldSoftDeleteProfile,
  stripeBalanceIsOutstanding,
  type ServiceSignal,
} from './policy.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://hecikcopbdhhiilhgmrd.supabase.co'
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const SERVICE_COLUMNS = 'service_id, status, payment_intent_id, payment_status'

type ProfileDisposition = 'deleted' | 'anonymized' | 'none'

type CustomerRow = {
  customer_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  phone_number: string | null
}

type ProviderRow = {
  service_provider_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  phone: string | number | null
  profile_picture_url: string | null
  balance: number | null
  stripe_account_id: string | null
}

type PaymentMethodRow = {
  id: string
  user_id: string
  stripe_pm_id: string | null
}

class DeleteAccountError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

type DbError = { code?: string; message?: string; details?: string } | null

const json = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const stripeErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return undefined
  }
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

const isMissingStripeResource = (error: unknown) => {
  const code = stripeErrorCode(error)
  return code === 'resource_missing' || code === 'account_invalid'
}

const isBenignDetach = (error: unknown) => {
  const code = stripeErrorCode(error)
  return code === 'resource_missing' || code === 'payment_method_unexpected_state'
}

const isForeignKeyError = (error: DbError) => {
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase()
  return error?.code === '23503' || message.includes('foreign key')
}

const throwDb = (error: DbError, message: string): never => {
  console.error('delete-account database error', error?.code ?? '', error?.message ?? '')
  throw new DeleteAccountError(500, 'delete_failed', message)
}

const assertNoDbError = (error: DbError, message: string) => {
  if (error) {
    throwDb(error, message)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed.', code: 'method_not_allowed' }, 405)
  }

  try {
    const result = await deleteAccount(req)
    return json(result, 200)
  } catch (error) {
    if (error instanceof DeleteAccountError) {
      return json({ success: false, error: error.message, code: error.code }, error.status)
    }
    console.error('delete-account failed', error instanceof Error ? error.message : 'unknown')
    return json(
      {
        success: false,
        error: 'We could not delete your account. Sign in and try again.',
        code: 'delete_failed',
      },
      500,
    )
  }
})

async function deleteAccount(req: Request) {
  if (!supabaseServiceKey) {
    throw new DeleteAccountError(500, 'not_configured', 'Account deletion is not configured.')
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    throw new DeleteAccountError(401, 'unauthorized', 'You must be signed in to delete your account.')
  }

  const body = await readBody(req)
  if (body.confirm !== true) {
    throw new DeleteAccountError(400, 'confirmation_required', 'Confirmation is required.')
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userData, error: userError } = await admin.auth.getUser(token)
  const user = userData?.user
  if (userError || !user?.id) {
    throw new DeleteAccountError(401, 'unauthorized', 'You must be signed in to delete your account.')
  }
  if (!user.email?.trim()) {
    throw new DeleteAccountError(
      409,
      'no_email',
      'This login has no email, so the profile cannot be matched safely.',
    )
  }

  const email = user.email.trim()
  const customer = await loadCustomer(admin, email)
  const provider = await loadProvider(admin, user.id, email)

  if (hasOutstandingProviderBalance(provider?.balance)) {
    throw new DeleteAccountError(
      409,
      'provider_balance',
      'This account still has a Helpr balance. Withdraw it before deleting the account. Helpr will not move those funds from this screen.',
    )
  }

  const customerServices = customer ? await loadServices(admin, 'customer_id', customer.customer_id) : []
  const providerServices = provider
    ? await loadServices(admin, 'service_provider_id', provider.service_provider_id)
    : []
  const blocker = findJobBlockers(mergeServices([customerServices, providerServices]))
  if (blocker) {
    throw new DeleteAccountError(409, blocker.code, blocker.message)
  }

  const paymentMethods = await loadPaymentMethods(admin, [
    user.id,
    customer?.customer_id,
    provider?.service_provider_id,
  ])

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!stripeSecretKey) {
    throw new DeleteAccountError(500, 'not_configured', 'Account deletion is not configured.')
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
  })

  const connectResult = await deleteConnectAccount(stripe, provider?.stripe_account_id ?? null)
  const stripeCustomerCount = await deleteStripeCustomers(stripe, emailsFor(email, customer, provider))
  await detachStoredPaymentMethods(stripe, paymentMethods)

  const openServiceIds = customerServices.filter(isOpenServiceDeletable).map((service) => service.service_id)
  await scrubCompletedServices(
    admin,
    customerServices.filter((service) => service.status === 'completed').map((service) => service.service_id),
  )
  await deleteRatingRows(admin, customer?.customer_id ?? null, provider?.service_provider_id ?? null)
  await deleteOpenServices(admin, openServiceIds)
  if (provider) {
    const { error } = await admin
      .from('service_fill_request')
      .delete()
      .eq('service_provider_id', provider.service_provider_id)
    assertNoDbError(error, 'We could not remove open bids. Sign in and try again.')
  }
  await deletePaymentMethodRows(admin, paymentMethods.map((row) => row.id))
  if (provider) {
    await removeProviderPhotos(admin, provider.service_provider_id, Boolean(provider.profile_picture_url))
  }

  const customerProfile = await removeOrAnonymizeCustomer(admin, customer, customerServices)
  const providerProfile = await removeOrAnonymizeProvider(admin, provider, providerServices)

  const { error: signOutError } = await admin.auth.admin.signOut(token, 'global')
  if (signOutError) {
    console.error('delete-account signOut failed', signOutError.message)
  }

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id, false)
  if (deleteUserError) {
    console.error('delete-account auth delete failed', deleteUserError.message)
    throw new DeleteAccountError(
      500,
      'delete_failed',
      'We could not remove the login. Sign in and try again.',
    )
  }

  return {
    success: true,
    deleted: {
      auth_user: 'deleted',
      customer_profile: customerProfile,
      provider_profile: providerProfile,
      payment_method_rows: paymentMethods.length,
      stripe_customers: stripeCustomerCount,
      stripe_connect_account: connectResult,
      open_services: openServiceIds.length,
    },
  }
}

async function readBody(req: Request): Promise<{ confirm?: unknown }> {
  const text = await req.text()
  if (!text.trim()) {
    return {}
  }
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object') {
      return {}
    }
    return parsed as { confirm?: unknown }
  } catch {
    throw new DeleteAccountError(400, 'confirmation_required', 'Confirmation is required.')
  }
}

function emailsFor(authEmail: string, customer: CustomerRow | null, provider: ProviderRow | null): string[] {
  const emails = new Set<string>()
  const add = (value: string | null | undefined) => {
    const trimmed = value?.trim()
    if (trimmed) {
      emails.add(trimmed)
    }
  }
  add(authEmail)
  add(customer?.email)
  add(provider?.email)
  return [...emails]
}

async function loadCustomer(admin: SupabaseClient, email: string): Promise<CustomerRow | null> {
  const { data, error } = await admin
    .from('customer')
    .select('customer_id, email, first_name, last_name, phone_number')
    .ilike('email', email)
  assertNoDbError(error, 'We could not load the customer profile. Sign in and try again.')
  const rows = (data ?? []) as CustomerRow[]
  if (rows.length > 1) {
    throw new DeleteAccountError(
      409,
      'profile_conflict',
      'More than one customer profile uses this email. Contact support before deleting the account.',
    )
  }
  return rows[0] ?? null
}

async function loadProvider(admin: SupabaseClient, userId: string, email: string): Promise<ProviderRow | null> {
  const columns =
    'service_provider_id, email, first_name, last_name, phone, profile_picture_url, balance, stripe_account_id'
  const { data: byId, error: byIdError } = await admin
    .from('service_provider')
    .select(columns)
    .eq('service_provider_id', userId)
    .maybeSingle()
  assertNoDbError(byIdError, 'We could not load the provider profile. Sign in and try again.')
  if (byId) {
    return byId as ProviderRow
  }

  const { data, error } = await admin.from('service_provider').select(columns).ilike('email', email)
  assertNoDbError(error, 'We could not load the provider profile. Sign in and try again.')
  const rows = (data ?? []) as ProviderRow[]
  if (rows.length === 0) {
    return null
  }
  throw new DeleteAccountError(
    409,
    'profile_conflict',
    'A provider profile with this email belongs to a different login. Contact support before deleting the account.',
  )
}

async function loadServices(
  admin: SupabaseClient,
  column: 'customer_id' | 'service_provider_id',
  id: string,
): Promise<ServiceSignal[]> {
  const { data, error } = await admin.from('service').select(SERVICE_COLUMNS).eq(column, id)
  assertNoDbError(error, 'We could not check open jobs. Sign in and try again.')
  return (data ?? []) as ServiceSignal[]
}

async function loadPaymentMethods(admin: SupabaseClient, ids: Array<string | null | undefined>) {
  const userIds = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (userIds.length === 0) {
    return [] as PaymentMethodRow[]
  }
  const { data, error } = await admin
    .from('payment_methods')
    .select('id, user_id, stripe_pm_id')
    .in('user_id', userIds)
  assertNoDbError(error, 'We could not load saved payment methods. Sign in and try again.')
  return (data ?? []) as PaymentMethodRow[]
}

async function deleteConnectAccount(stripe: Stripe, accountId: string | null): Promise<'deleted' | 'none'> {
  if (!accountId) {
    return 'none'
  }

  try {
    const balance = await stripe.balance.retrieve({}, { stripeAccount: accountId })
    if (stripeBalanceIsOutstanding(balance.available, balance.pending)) {
      throw new DeleteAccountError(
        409,
        'provider_balance',
        'This payout account still has a Stripe balance. It has to reach zero before the account can be deleted. Helpr will not create a payout from this screen.',
      )
    }
  } catch (error) {
    if (error instanceof DeleteAccountError) {
      throw error
    }
    if (!isMissingStripeResource(error)) {
      console.error('delete-account balance check failed', stripeErrorCode(error) ?? 'unknown')
      throw new DeleteAccountError(
        409,
        'stripe_connect',
        'The payout account could not be checked. Nothing else was deleted. Try again or contact support.',
      )
    }
  }

  try {
    await stripe.accounts.del(accountId)
  } catch (error) {
    if (!isMissingStripeResource(error)) {
      console.error('delete-account connect delete failed', stripeErrorCode(error) ?? 'unknown')
      throw new DeleteAccountError(
        409,
        'stripe_connect',
        'Stripe did not allow the payout account to be deleted. The Helpr login was not removed.',
      )
    }
  }

  return 'deleted'
}

async function deleteStripeCustomers(stripe: Stripe, emails: string[]): Promise<number> {
  const deleted = new Set<string>()
  const allowed = new Set(emails.map((value) => value.toLowerCase()))

  for (const email of emails) {
    let startingAfter: string | undefined
    for (let page = 0; page < 20; page += 1) {
      const listed = await stripe.customers.list({
        email,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      })
      for (const customer of listed.data) {
        if (customer.deleted || !customer.email || !allowed.has(customer.email.toLowerCase())) {
          continue
        }
        if (deleted.has(customer.id)) {
          continue
        }
        await detachCustomerPaymentMethods(stripe, customer.id)
        try {
          await stripe.customers.del(customer.id)
          deleted.add(customer.id)
        } catch (error) {
          if (!isMissingStripeResource(error)) {
            console.error('delete-account customer delete failed', stripeErrorCode(error) ?? 'unknown')
            throw new DeleteAccountError(
              500,
              'delete_failed',
              'We could not remove the Stripe customer. Sign in and try again.',
            )
          }
          deleted.add(customer.id)
        }
      }
      if (!listed.has_more || listed.data.length === 0) {
        break
      }
      startingAfter = listed.data[listed.data.length - 1]?.id
      if (!startingAfter) {
        break
      }
    }
  }

  return deleted.size
}

async function detachCustomerPaymentMethods(stripe: Stripe, customerId: string) {
  let startingAfter: string | undefined
  for (let page = 0; page < 20; page += 1) {
    const listed = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    for (const method of listed.data) {
      try {
        await stripe.paymentMethods.detach(method.id)
      } catch (error) {
        if (!isBenignDetach(error)) {
          // Customer deletion removes saved cards. Keep going so a single detach
          // refusal does not leave the Stripe customer in place.
          console.error('delete-account detach failed', stripeErrorCode(error) ?? 'unknown')
        }
      }
    }
    if (!listed.has_more || listed.data.length === 0) {
      break
    }
    startingAfter = listed.data[listed.data.length - 1]?.id
    if (!startingAfter) {
      break
    }
  }
}

async function detachStoredPaymentMethods(stripe: Stripe, rows: PaymentMethodRow[]) {
  for (const row of rows) {
    if (!row.stripe_pm_id) {
      continue
    }
    try {
      await stripe.paymentMethods.detach(row.stripe_pm_id)
    } catch (error) {
      if (!isBenignDetach(error)) {
        console.error('delete-account stored detach failed', stripeErrorCode(error) ?? 'unknown')
        throw new DeleteAccountError(
          500,
          'delete_failed',
          'We could not detach a saved card. Sign in and try again.',
        )
      }
    }
  }
}

async function scrubCompletedServices(admin: SupabaseClient, serviceIds: string[]) {
  if (serviceIds.length === 0) {
    return
  }
  const attempts: Record<string, string | null>[] = [
    { description: null, start_location: null, end_location: null, location: null },
    { description: null, start_location: null, end_location: null },
    { description: '', start_location: '', end_location: '', location: '' },
    { description: '', start_location: '', end_location: '' },
  ]
  let last: DbError = null
  for (const payload of attempts) {
    const { error } = await admin.from('service').update(payload).in('service_id', serviceIds)
    if (!error) {
      return
    }
    last = error
    const message = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
    const missingColumn = message.includes('schema cache') || message.includes('could not find')
    const nullBlocked = error.code === '23502' || message.includes('null value')
    if (!missingColumn && !nullBlocked) {
      throwDb(error, 'We could not remove saved job details. Sign in and try again.')
    }
  }
  throwDb(last, 'We could not remove saved job details. Sign in and try again.')
}

async function deleteRatingRows(
  admin: SupabaseClient,
  customerId: string | null,
  providerId: string | null,
) {
  const tables = ['service_provider_ratings', 'customer_ratings']
  for (const table of tables) {
    if (customerId) {
      const { error } = await admin.from(table).delete().eq('customer_id', customerId)
      assertNoDbError(error, 'We could not remove ratings. Sign in and try again.')
    }
    if (providerId) {
      const { error } = await admin.from(table).delete().eq('service_provider_id', providerId)
      assertNoDbError(error, 'We could not remove ratings. Sign in and try again.')
    }
  }
}

async function deleteOpenServices(admin: SupabaseClient, serviceIds: string[]) {
  if (serviceIds.length === 0) {
    return
  }
  const { error: fillError } = await admin.from('service_fill_request').delete().in('service_id', serviceIds)
  assertNoDbError(fillError, 'We could not remove open requests. Sign in and try again.')
  const { error: providerRatingError } = await admin
    .from('service_provider_ratings')
    .delete()
    .in('service_id', serviceIds)
  assertNoDbError(providerRatingError, 'We could not remove open requests. Sign in and try again.')
  const { error: customerRatingError } = await admin.from('customer_ratings').delete().in('service_id', serviceIds)
  assertNoDbError(customerRatingError, 'We could not remove open requests. Sign in and try again.')
  const { error } = await admin.from('service').delete().in('service_id', serviceIds)
  assertNoDbError(error, 'We could not remove open requests. Sign in and try again.')
}

async function deletePaymentMethodRows(admin: SupabaseClient, ids: string[]) {
  if (ids.length === 0) {
    return
  }
  const { error } = await admin.from('payment_methods').delete().in('id', ids)
  assertNoDbError(error, 'We could not remove saved payment methods. Sign in and try again.')
}

async function removeProviderPhotos(admin: SupabaseClient, providerId: string, hadPhoto: boolean) {
  const bucket = admin.storage.from('profile-pictures')
  const folder = `providers/${providerId}`
  const { data: files, error } = await bucket.list(folder, { limit: 100 })
  if (error) {
    if (!hadPhoto) {
      console.error('delete-account photo list failed', error.message)
      return
    }
    throw new DeleteAccountError(500, 'delete_failed', 'We could not remove the profile photo. Sign in and try again.')
  }
  const paths = (files ?? [])
    .filter((file) => file.name && file.id)
    .map((file) => `${folder}/${file.name}`)
  if (paths.length === 0) {
    return
  }
  const { error: removeError } = await bucket.remove(paths)
  if (removeError) {
    throw new DeleteAccountError(500, 'delete_failed', 'We could not remove the profile photo. Sign in and try again.')
  }
}

async function transactionCount(
  admin: SupabaseClient,
  column: 'customer_id' | 'provider_id',
  id: string,
): Promise<number> {
  const { count, error } = await admin
    .from('platform_transactions')
    .select('transaction_id', { count: 'exact', head: true })
    .eq(column, id)
  assertNoDbError(error, 'We could not check payment history. Sign in and try again.')
  return count ?? 0
}

async function removeOrAnonymizeCustomer(
  admin: SupabaseClient,
  customer: CustomerRow | null,
  services: ServiceSignal[],
): Promise<ProfileDisposition> {
  if (!customer) {
    return 'none'
  }
  const transactions = await transactionCount(admin, 'customer_id', customer.customer_id)
  if (shouldSoftDeleteProfile(services, transactions)) {
    await anonymizeCustomer(admin, customer.customer_id)
    return 'anonymized'
  }
  const { error } = await admin.from('customer').delete().eq('customer_id', customer.customer_id)
  if (!error) {
    return 'deleted'
  }
  if (isForeignKeyError(error)) {
    await anonymizeCustomer(admin, customer.customer_id)
    return 'anonymized'
  }
  throwDb(error, 'We could not remove the customer profile. Sign in and try again.')
}

async function anonymizeCustomer(admin: SupabaseClient, customerId: string) {
  const { error } = await admin
    .from('customer')
    .update({
      first_name: 'Deleted',
      last_name: 'Account',
      email: anonymizedEmail(customerId),
      phone_number: null,
    })
    .eq('customer_id', customerId)
  assertNoDbError(error, 'We could not remove the customer profile. Sign in and try again.')
}

async function removeOrAnonymizeProvider(
  admin: SupabaseClient,
  provider: ProviderRow | null,
  services: ServiceSignal[],
): Promise<ProfileDisposition> {
  if (!provider) {
    return 'none'
  }
  const transactions = await transactionCount(admin, 'provider_id', provider.service_provider_id)
  if (shouldSoftDeleteProfile(services, transactions)) {
    await anonymizeProvider(admin, provider.service_provider_id)
    return 'anonymized'
  }
  const { error } = await admin
    .from('service_provider')
    .delete()
    .eq('service_provider_id', provider.service_provider_id)
  if (!error) {
    return 'deleted'
  }
  if (isForeignKeyError(error)) {
    await anonymizeProvider(admin, provider.service_provider_id)
    return 'anonymized'
  }
  throwDb(error, 'We could not remove the provider profile. Sign in and try again.')
}

async function anonymizeProvider(admin: SupabaseClient, providerId: string) {
  const { error } = await admin
    .from('service_provider')
    .update({
      first_name: 'Deleted',
      last_name: 'Account',
      email: anonymizedEmail(providerId),
      phone: null,
      profile_picture_url: null,
      stripe_account_id: null,
    })
    .eq('service_provider_id', providerId)
  assertNoDbError(error, 'We could not remove the provider profile. Sign in and try again.')
}
