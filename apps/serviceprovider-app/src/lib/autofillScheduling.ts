export type AutoFillSchedulingPatch = {
  scheduling_type?: string;
};

/**
 * Customer's scheduling_type, unchanged. Blank values are omitted so a claim
 * does not invent `scheduled` for an ASAP (or untyped) job.
 */
export function preservedSchedulingType(
  existing: string | null | undefined,
): string | undefined {
  if (typeof existing !== 'string') {
    return undefined;
  }

  const trimmed = existing.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function schedulingPatchForAutoFillClaim(
  existing: string | null | undefined,
): AutoFillSchedulingPatch {
  const schedulingType = preservedSchedulingType(existing);
  return schedulingType ? { scheduling_type: schedulingType } : {};
}

/**
 * AutoFill claim write. Drops any forced `scheduling_type` on the payload and
 * puts the job's existing type back. Every other field (including
 * `payment_intent_id` and `payment_status` when a charge already set them)
 * is copied through.
 */
export function applyPreservedSchedulingType<T extends object>(
  claimUpdate: T,
  existingSchedulingType: string | null | undefined,
): Omit<T, 'scheduling_type'> & AutoFillSchedulingPatch {
  const { scheduling_type: _forced, ...rest } = claimUpdate as T & {
    scheduling_type?: unknown;
  };

  return {
    ...rest,
    ...schedulingPatchForAutoFillClaim(existingSchedulingType),
  };
}
