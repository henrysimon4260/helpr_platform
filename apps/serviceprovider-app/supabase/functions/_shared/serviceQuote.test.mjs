import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildQuoteUserPrompt,
  clientMayWriteServicePrice,
  finalizeServicePrice,
  jwtRole,
  parseBearerToken,
  parseModelAssessment,
  quoteBookingFees,
  quoteFingerprint,
  readQuoteRequest,
} from './serviceQuote.ts'

test('checkout fees are 3% processing plus 1% platform', () => {
  const fees = quoteBookingFees(100)
  assert.equal(fees.processingFee, 3)
  assert.equal(fees.platformFee, 1)
  assert.equal(fees.customerTotal, 104)
  assert.equal(fees.customerTotalCents, 10400)
})

test('fee rounding matches the checkout cent rule', () => {
  const fees = quoteBookingFees(33.33)
  assert.equal(fees.processingFee, 1)
  assert.equal(fees.platformFee, 0.33)
  assert.equal(fees.customerTotal, 34.66)
  assert.equal(fees.customerTotalCents, 3466)
})

test('discounted quotes apply the 15% client adjustment on the server', () => {
  const priced = finalizeServicePrice({
    serviceType: 'cleaning',
    llmPrice: 100,
    needsTruck: false,
    driving: null,
  })
  assert.deepEqual(priced, { price: 85, note: null })
})

test('custom quotes round the model price without the discount', () => {
  const priced = finalizeServicePrice({
    serviceType: 'customService',
    llmPrice: 120.4,
    needsTruck: false,
    driving: null,
  })
  assert.equal(priced?.price, 120)
})

test('moving truck multiplier still applies after the short-trip formula', () => {
  const priced = finalizeServicePrice({
    serviceType: 'Moving',
    llmPrice: 999,
    needsTruck: true,
    driving: { distanceMiles: 0.2, durationMinutes: 8.2 },
  })
  assert.equal(priced?.price, Math.round((350 + 8) * 1.6))
  assert.match(priced?.note ?? '', /Short distance rate/)
})

test('a client cannot force the short-trip price without a server route', () => {
  const priced = finalizeServicePrice({
    serviceType: 'Moving',
    llmPrice: 400,
    needsTruck: false,
    driving: null,
  })
  assert.equal(priced?.price, 400)
  assert.equal(priced?.note, null)
})

test('truck wording in the description overrides a false client flag', () => {
  const fingerprint = quoteFingerprint({
    serviceType: 'Moving',
    description: 'Studio move. Moving truck is needed.',
    startLocation: '1 Main St',
    endLocation: '2 Main St',
    needsTruck: false,
  })
  assert.equal(fingerprint?.needsTruck, true)
})

test('readQuoteRequest ignores a client price and amount', () => {
  const parsed = readQuoteRequest({
    service_type: 'cleaning',
    description: 'Deep clean a studio',
    location: '10 Broadway',
    price: 1,
    amount: 1,
    customer_total: 1,
  })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(parsed.fingerprint.serviceType, 'cleaning')
  assert.equal(parsed.fingerprint.location, '10 Broadway')
  assert.equal('price' in parsed.fingerprint, false)
  assert.equal(JSON.stringify(parsed.fingerprint).includes('"price"'), false)
})

test('unknown service types are rejected', () => {
  const parsed = readQuoteRequest({ service_type: 'babysitting', description: 'help' })
  assert.deepEqual(parsed, { ok: false, error: 'Unknown service type' })
})

test('model safety and clarification are not prices', () => {
  assert.equal(parseModelAssessment('{"safety_concern":true,"safety_message":"No"}').kind, 'safety')
  assert.equal(parseModelAssessment('{"needs_clarification":true,"clarification_prompt":"Size?"}').kind, 'clarification')
  assert.deepEqual(parseModelAssessment('{"price":"80"}'), { kind: 'price', price: 80 })
  assert.equal(parseModelAssessment('not json').kind, 'invalid')
})

test('moving prompt includes the server route and not a client price', () => {
  const fingerprint = quoteFingerprint({
    serviceType: 'moving',
    description: 'Move a studio. No moving truck needed.',
    startLocation: '1 Main',
    endLocation: '2 Main',
  })
  assert.ok(fingerprint)
  const prompt = buildQuoteUserPrompt(fingerprint, { distanceMiles: 1.5, durationMinutes: 12 })
  assert.match(prompt, /1\.50 miles/)
  assert.doesNotMatch(prompt, /price/i)
})

test('bearer parsing and jwt role do not read a client price claim as authority', () => {
  assert.equal(parseBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi')
  assert.equal(parseBearerToken('Token abc'), null)
  const payload = Buffer.from(JSON.stringify({ role: 'anon', price: 1 })).toString('base64url')
  assert.equal(jwtRole(`x.${payload}.y`), 'anon')
})

const openJob = {
  status: 'finding_pros',
  serviceProviderId: null,
  paymentStatus: null,
  price: 85,
  serviceType: 'cleaning',
  description: 'Deep clean',
  location: '10 Broadway',
}

test('insert of an arbitrary price is rejected and a matching quote is allowed', () => {
  assert.equal(clientMayWriteServicePrice({
    op: 'insert',
    next: { ...openJob, price: 1 },
    quoteMatches: false,
    acceptedBidMatches: false,
  }), false)
  assert.equal(clientMayWriteServicePrice({
    op: 'insert',
    next: openJob,
    quoteMatches: true,
    acceptedBidMatches: false,
  }), true)
  assert.equal(clientMayWriteServicePrice({
    op: 'insert',
    next: { ...openJob, price: null },
    quoteMatches: false,
    acceptedBidMatches: false,
  }), true)
})

test('open jobs can change price only to a new server quote', () => {
  assert.equal(clientMayWriteServicePrice({
    op: 'update',
    previous: openJob,
    next: { ...openJob, price: 1 },
    quoteMatches: false,
    acceptedBidMatches: false,
  }), false)
  assert.equal(clientMayWriteServicePrice({
    op: 'update',
    previous: openJob,
    next: { ...openJob, price: 90 },
    quoteMatches: true,
    acceptedBidMatches: false,
  }), true)
})

test('changing the description without a quote for the new text is rejected', () => {
  assert.equal(clientMayWriteServicePrice({
    op: 'update',
    previous: openJob,
    next: { ...openJob, description: 'Whole house' },
    quoteMatches: false,
    acceptedBidMatches: false,
  }), false)
})

test('confirm may copy the accepted bid and later price writes are frozen', () => {
  assert.equal(clientMayWriteServicePrice({
    op: 'update',
    previous: openJob,
    next: { ...openJob, status: 'confirmed', serviceProviderId: 'pro-1', price: 140 },
    quoteMatches: false,
    acceptedBidMatches: true,
  }), true)
  assert.equal(clientMayWriteServicePrice({
    op: 'update',
    previous: openJob,
    next: { ...openJob, status: 'confirmed', serviceProviderId: 'pro-1', price: 1 },
    quoteMatches: false,
    acceptedBidMatches: false,
  }), false)
  assert.equal(clientMayWriteServicePrice({
    op: 'update',
    previous: { ...openJob, status: 'confirmed', serviceProviderId: 'pro-1', price: 140, paymentStatus: 'paid' },
    next: { ...openJob, status: 'confirmed', serviceProviderId: 'pro-1', price: 1, paymentStatus: 'paid' },
    quoteMatches: true,
    acceptedBidMatches: true,
  }), false)
})
