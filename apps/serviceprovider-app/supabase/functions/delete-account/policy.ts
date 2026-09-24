// Pure delete-account rules. No Stripe, Deno, or database imports.

export const LIVE_JOB_STATUSES = ['confirmed', 'helpr_otw', 'in_progress'] as const
export const OPEN_JOB_STATUSES = ['finding_pros', 'pending', 'scheduled', 'select_service_provider'] as const

export type ServiceSignal = {
  service_id: string
  status?: string | null
  payment_intent_id?: string | null
  payment_status?: string | null
}

export type JobBlockerCode = 'open_jobs' | 'unpaid_obligation' | 'unresolved_job'

export type JobBlocker = {
  code: JobBlockerCode
  message: string
  serviceIds: string[]
}

const LIVE = new Set<string>(LIVE_JOB_STATUSES)
const OPEN = new Set<string>(OPEN_JOB_STATUSES)

export function hasPaymentSignal(service: ServiceSignal): boolean {
  if ((service.payment_intent_id ?? '').trim().length > 0) {
    return true
  }
  return (service.payment_status ?? '').trim().toLowerCase() === 'paid'
}

export function isOpenServiceDeletable(service: ServiceSignal): boolean {
  return OPEN.has(service.status ?? '') && !hasPaymentSignal(service)
}

export function findJobBlockers(services: ServiceSignal[]): JobBlocker | null {
  const live = services.filter((service) => LIVE.has(service.status ?? ''))
  if (live.length > 0) {
    return {
      code: 'open_jobs',
      serviceIds: live.map((service) => service.service_id),
      message:
        'This account has a job that is confirmed, on the way, or in progress. Finish or cancel that job in the app before deleting the account. Helpr will not capture or refund a payment from this screen.',
    }
  }

  const unpaid = services.filter((service) => (service.status ?? '') !== 'completed' && hasPaymentSignal(service))
  if (unpaid.length > 0) {
    return {
      code: 'unpaid_obligation',
      serviceIds: unpaid.map((service) => service.service_id),
      message:
        'This account has a job with a payment that has not been completed. Resolve that job before deleting the account. Helpr will not capture or refund a payment from this screen.',
    }
  }

  const unresolved = services.filter((service) => {
    const status = service.status ?? ''
    return !LIVE.has(status) && !OPEN.has(status) && status !== 'completed'
  })
  if (unresolved.length > 0) {
    return {
      code: 'unresolved_job',
      serviceIds: unresolved.map((service) => service.service_id),
      message:
        'This account has a job in a state that cannot be deleted automatically. Contact support before deleting the account.',
    }
  }

  return null
}

export function hasOutstandingProviderBalance(balance: number | null | undefined): boolean {
  if (balance == null) {
    return false
  }
  if (!Number.isFinite(balance)) {
    return true
  }
  return Math.abs(balance) >= 0.005
}

export function stripeBalanceIsOutstanding(
  available: Array<{ amount?: number | null }> | null | undefined,
  pending: Array<{ amount?: number | null }> | null | undefined,
): boolean {
  const sum = (rows: Array<{ amount?: number | null }> | null | undefined) =>
    (rows ?? []).reduce((total, row) => total + (typeof row.amount === 'number' ? row.amount : 0), 0)
  return sum(available) !== 0 || sum(pending) !== 0
}

export function shouldSoftDeleteProfile(services: ServiceSignal[], transactionCount: number): boolean {
  if (transactionCount > 0) {
    return true
  }
  return services.some((service) => (service.status ?? '') === 'completed')
}

export function anonymizedEmail(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9]/g, '')
  return `deleted+${safe}@users.invalid`
}

export function mergeServices(lists: ServiceSignal[][]): ServiceSignal[] {
  const byId = new Map<string, ServiceSignal>()
  for (const list of lists) {
    for (const service of list) {
      byId.set(service.service_id, service)
    }
  }
  return [...byId.values()]
}
