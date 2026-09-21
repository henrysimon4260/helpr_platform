import { emailsMatch } from './chargeAuthorization.ts'

export const COMPLETE_SIGN_IN = 'Sign in again before completing this service.'
export const COMPLETE_FORBIDDEN = 'Only the assigned provider can complete this service.'
export const COMPLETE_NOT_CONFIGURED = 'Service completion is not configured on the server.'
export const COMPLETE_UNAVAILABLE = 'Service completion could not be verified. Try again.'

export type ProviderAccountRef = {
  service_provider_id?: string | null
  email?: string | null
}

export type AssignedProviderDecision =
  | { ok: true }
  | { ok: false; status: 403 | 500; error: string }

function accountId(row: ProviderAccountRef | null | undefined): string | null {
  if (!row || typeof row.service_provider_id !== 'string') return null
  const id = row.service_provider_id.trim()
  return id.length > 0 ? id : null
}

/**
 * The signed-in provider may complete the job only when they are the assignee.
 * Assignment is service.service_provider_id. That id is the auth user id for
 * accounts created by the provider app. A legacy row can instead match the
 * auth email from getUser() when this auth user has no provider row of their
 * own. Email comes from getUser(), not user_metadata. A client-supplied
 * provider id is not an input.
 */
export function authorizeAssignedProvider(input: {
  authUserId: string | null | undefined
  authEmail?: string | null
  assignedProviderId?: string | null
  accountForAuthId?: ProviderAccountRef | null
  assignedAccount?: ProviderAccountRef | null
  accountLookupFailed?: boolean
  assignedLookupFailed?: boolean
}): AssignedProviderDecision {
  const authId = typeof input.authUserId === 'string' ? input.authUserId.trim() : ''
  const assignedId = typeof input.assignedProviderId === 'string' ? input.assignedProviderId.trim() : ''
  if (!authId || !assignedId) {
    return { ok: false, status: 403, error: COMPLETE_FORBIDDEN }
  }
  if (authId === assignedId) return { ok: true }

  if (input.accountLookupFailed) {
    return { ok: false, status: 500, error: COMPLETE_UNAVAILABLE }
  }

  const ownId = accountId(input.accountForAuthId)
  if (ownId) {
    return ownId === assignedId
      ? { ok: true }
      : { ok: false, status: 403, error: COMPLETE_FORBIDDEN }
  }

  if (input.assignedLookupFailed) {
    return { ok: false, status: 500, error: COMPLETE_UNAVAILABLE }
  }

  const mappedId = accountId(input.assignedAccount)
  if (mappedId === assignedId && emailsMatch(input.authEmail, input.assignedAccount?.email)) {
    return { ok: true }
  }
  return { ok: false, status: 403, error: COMPLETE_FORBIDDEN }
}
