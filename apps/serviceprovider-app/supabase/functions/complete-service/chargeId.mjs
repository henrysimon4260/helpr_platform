// Stripe API 2023-10-16 (stripe-node 14) puts the charge on PaymentIntent.latest_charge.
// It is a charge id string, or a Charge object when expanded. The old charges list is gone.

export function chargeIdFromLatestCharge(latestCharge) {
  if (!latestCharge) {
    return null
  }
  if (typeof latestCharge === 'string') {
    return latestCharge
  }
  if (typeof latestCharge.id === 'string' && latestCharge.id.length > 0) {
    return latestCharge.id
  }
  return null
}
