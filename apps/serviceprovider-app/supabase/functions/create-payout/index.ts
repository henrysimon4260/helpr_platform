import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { requireUser, serviceClient } from '../_shared/auth.ts'
import { buildStripeRedirectUrl, sanitizeDeepLink } from '../_shared/connectRedirect.ts'
import { json, corsHeaders } from '../_shared/http.ts'
import { decidePayout, dollarsToCents, ledgerAfterPayout } from '../_shared/paymentPolicy.ts'

type BalanceEntry = {
  amount: number
  currency: string
  source_types?: { card?: number; bank_account?: number }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const auth = await requireUser(req)
    if ('error' in auth) {
      return json({ success: false, error: auth.error }, 401)
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      return json({ success: false, error: 'Stripe is not configured on the server' }, 500)
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const body = await req.json().catch(() => ({}))
    const requestedCents = readRequestedCents(body?.amount_cents)
    if (requestedCents === 'invalid') {
      return json({
        success: false,
        code: 'amount_invalid',
        error: 'Amount must be a positive number of cents.',
      })
    }

    const admin = serviceClient()
    const provider = await findProvider(admin, auth.user.id, auth.user.email ?? null)
    if (!provider) {
      return json({
        success: false,
        code: 'provider_not_found',
        error: 'No provider account is linked to this sign-in.',
      })
    }

    if (!provider.stripe_account_id) {
      return json({
        success: false,
        code: 'connect_account_missing',
        error: 'Finish Stripe Connect setup before withdrawing. This provider has no connected account yet.',
      })
    }

    const accountId = provider.stripe_account_id
    let account: Stripe.Account
    try {
      account = await stripe.accounts.retrieve(accountId)
    } catch (stripeError) {
      console.error('Failed to retrieve Connect account:', stripeError)
      return json({
        success: false,
        code: 'connect_account_missing',
        error: 'The saved Stripe account could not be found. Finish Connect setup before withdrawing.',
      })
    }

    const banks = await stripe.accounts.listExternalAccounts(accountId, {
      object: 'bank_account',
      limit: 1,
    })
    const hasBank = banks.data.length > 0

    if (!account.payouts_enabled || !hasBank) {
      const onboardingUrl = await createAccountUpdateLink(stripe, account, body)
      return json({
        success: false,
        code: 'bank_account_missing',
        error: hasBank
          ? 'Payouts are not enabled on this Stripe account yet. Finish verification to withdraw to your bank.'
          : 'Add a bank account in Stripe before withdrawing. No payout was created.',
        ...(onboardingUrl ? { onboarding_url: onboardingUrl } : {}),
      })
    }

    const balance = await stripe.balance.retrieve({}, { stripeAccount: accountId })
    const available = readUsd(balance.available as BalanceEntry[])
    const pending = readUsd(balance.pending as BalanceEntry[])
    const decision = decidePayout({
      requestedCents,
      availableCardCents: available.card,
      availableBankCents: available.bank,
      pendingCents: pending.amount,
    })

    if (!decision.ok) {
      return json({ success: false, code: decision.code, error: decision.error })
    }

    const payout = await stripe.payouts.create(
      {
        amount: decision.amountCents,
        currency: 'usd',
        method: 'standard',
        source_type: decision.sourceType,
        description: 'Helpr withdrawal',
        metadata: {
          provider_id: provider.service_provider_id,
        },
      },
      {
        stripeAccount: accountId,
        idempotencyKey: crypto.randomUUID(),
      },
    )

    const ledgerCents = dollarsToCents(provider.balance)
    const newBalance = ledgerAfterPayout(ledgerCents, decision.amountCents)
    const { error: balanceError } = await admin
      .from('service_provider')
      .update({ balance: newBalance })
      .eq('service_provider_id', provider.service_provider_id)

    if (balanceError) {
      console.error('Payout created but balance update failed:', balanceError)
      return json({
        success: true,
        payout_id: payout.id,
        amount: decision.amountCents / 100,
        amount_cents: decision.amountCents,
        currency: 'usd',
        status: payout.status,
        arrival_date: payout.arrival_date ?? null,
        balance_update_failed: true,
        message: `Payout ${formatDollars(decision.amountCents)} was sent to your bank, but the displayed balance could not be updated. Refresh your account.`,
      })
    }

    const arrival = payout.arrival_date
      ? new Date(payout.arrival_date * 1000).toISOString().slice(0, 10)
      : null

    return json({
      success: true,
      payout_id: payout.id,
      amount: decision.amountCents / 100,
      amount_cents: decision.amountCents,
      currency: 'usd',
      status: payout.status,
      arrival_date: payout.arrival_date ?? null,
      new_balance: newBalance,
      message: arrival
        ? `${formatDollars(decision.amountCents)} is on the way to your bank. Estimated arrival ${arrival}.`
        : `${formatDollars(decision.amountCents)} is on the way to your bank.`,
    })
  } catch (error) {
    console.error('create-payout error:', error)
    const message = error instanceof Error ? error.message : 'Failed to create payout'
    return json({ success: false, error: message })
  }
})

function readRequestedCents(value: unknown): number | null | 'invalid' {
  if (value == null || value === '') return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return 'invalid'
  return value
}

function readUsd(entries: BalanceEntry[] | undefined): { amount: number; card: number; bank: number } {
  const usd = entries?.find((entry) => entry.currency === 'usd')
  const amount = usd?.amount ?? 0
  const card = usd?.source_types?.card ?? 0
  const bank = usd?.source_types?.bank_account ?? 0
  if (!usd?.source_types || (card === 0 && bank === 0 && amount > 0)) {
    return { amount, card: amount, bank: 0 }
  }
  return { amount, card, bank }
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

async function findProvider(
  admin: ReturnType<typeof serviceClient>,
  userId: string,
  email: string | null,
): Promise<{
  service_provider_id: string
  stripe_account_id: string | null
  balance: number | string | null
} | null> {
  const columns = 'service_provider_id, stripe_account_id, balance'
  if (email) {
    const { data, error } = await admin
      .from('service_provider')
      .select(columns)
      .eq('email', email)
      .maybeSingle()
    if (error) {
      console.error('Provider lookup by email failed:', error)
      throw new Error('Could not load the provider account.')
    }
    if (data) return data
  }

  const { data, error } = await admin
    .from('service_provider')
    .select(columns)
    .eq('service_provider_id', userId)
    .maybeSingle()
  if (error) {
    console.error('Provider lookup by id failed:', error)
    throw new Error('Could not load the provider account.')
  }
  return data
}

async function createAccountUpdateLink(
  stripe: Stripe,
  account: Stripe.Account,
  body: { refresh_url?: unknown; return_url?: unknown; refreshUrl?: unknown; returnUrl?: unknown },
): Promise<string | null> {
  const refreshDeepLink = sanitizeDeepLink(
    typeof body.refresh_url === 'string' ? body.refresh_url : typeof body.refreshUrl === 'string' ? body.refreshUrl : null,
  )
  const returnDeepLink = sanitizeDeepLink(
    typeof body.return_url === 'string' ? body.return_url : typeof body.returnUrl === 'string' ? body.returnUrl : null,
  )
  const linkType = account.details_submitted ? 'account_update' : 'account_onboarding'
  try {
    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: buildStripeRedirectUrl('refresh', refreshDeepLink),
      return_url: buildStripeRedirectUrl('complete', returnDeepLink),
      type: linkType,
    })
    return link.url
  } catch (linkError) {
    console.error('Failed to create Stripe account link:', linkError)
    if (linkType === 'account_update') {
      try {
        const link = await stripe.accountLinks.create({
          account: account.id,
          refresh_url: buildStripeRedirectUrl('refresh', refreshDeepLink),
          return_url: buildStripeRedirectUrl('complete', returnDeepLink),
          type: 'account_onboarding',
        })
        return link.url
      } catch (fallbackError) {
        console.error('Failed to create onboarding link:', fallbackError)
      }
    }
    return null
  }
}
