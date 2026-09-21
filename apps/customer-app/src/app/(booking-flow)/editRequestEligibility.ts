/**
 * When the customer may reopen a request composer.
 *
 * Open and unassigned only. Spellings match JOB_CONTRACT.md.
 * A provider is assigned when `service_provider_id` is set, which happens
 * at `confirmed` (customer select-a-pro or AutoFill). Later statuses and
 * any other status, including a cancelled job, stay closed.
 */

export const CUSTOMER_EDITABLE_STATUSES = new Set([
  'finding_pros',
  'pending',
  'scheduled',
  'select_service_provider',
]);

export type EditRequestService = {
  status?: string | null;
  service_provider_id?: string | null;
};

export function canEditRequest(service: EditRequestService): boolean {
  const status = (service.status ?? '').trim().toLowerCase();
  if (!CUSTOMER_EDITABLE_STATUSES.has(status)) {
    return false;
  }

  const providerId = (service.service_provider_id ?? '').trim();
  return providerId.length === 0;
}
