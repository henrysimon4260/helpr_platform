import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assemblyWorkScore,
  completeAssemblyEstimateWithOpenAI,
  parseAssemblyQuoteInput,
  quoteAssemblyJob,
  renderAssemblyPrompt,
  type AssemblyModelContext,
} from './assembly.ts'
import { QuoteError } from './estimate.ts'

const CHAIR = {
  serviceType: 'furniture-assembly',
  items: [
    {
      name: 'dining chair',
      sku: 'ADDE',
      type: 'chair',
      pieceCount: 1,
      complexity: 'simple',
      brand: 'IKEA',
      model: 'ADDE',
    },
  ],
  toolsNeeded: 'Allen key',
  photoCount: 1,
  description: 'Assemble one dining chair.',
}

const WARDROBE = {
  serviceType: 'Furniture Assembly',
  items: [
    {
      name: 'PAX wardrobe',
      sku: 'PAX',
      type: 'wardrobe',
      pieceCount: 8,
      complexity: 'complex',
      brand: 'IKEA',
      model: 'PAX',
    },
  ],
  toolsNeeded: 'Allen key and rubber mallet',
  photoCount: 3,
  description: 'Assemble an IKEA PAX wardrobe.',
}

function groundedModel(context: AssemblyModelContext) {
  const score = assemblyWorkScore(context.items)
  const tools = context.toolsNeeded ? 15 : 0
  const priceMin = Math.max(25, Math.round(30 + score * 18 + tools))
  const priceMax = Math.round(priceMin * 1.35)
  const durationMinutes = Math.round(30 + score * 14 + (context.toolsNeeded ? 10 : 0))
  return { priceMin, priceMax, durationMinutes }
}

test('a simple chair prices and lasts less than a multi-piece wardrobe', async () => {
  const prompts: string[] = []
  const quote = (body: Record<string, unknown>) =>
    quoteAssemblyJob(
      {
        ...body,
        price: 9876,
        priceMin: 9000,
        priceMax: 9500,
        suggestedPrice: 9200,
        durationMinutes: 5,
      },
      {
        completeEstimate: async (context) => {
          prompts.push(renderAssemblyPrompt(context))
          return groundedModel(context)
        },
      },
    )

  const chair = await quote(CHAIR)
  const wardrobe = await quote(WARDROBE)

  assert.equal(chair.source, 'server')
  assert.equal(wardrobe.source, 'server')
  assert.equal(chair.serviceType, 'furniture-assembly')
  assert.equal(wardrobe.serviceType, 'furniture-assembly')
  assert.equal(chair.pieceCount, 1)
  assert.equal(chair.complexity, 'simple')
  assert.equal(wardrobe.pieceCount, 8)
  assert.equal(wardrobe.complexity, 'complex')
  assert.match(chair.itemLabel, /dining chair/)
  assert.match(chair.itemLabel, /1 piece, simple/)
  assert.match(wardrobe.itemLabel, /PAX wardrobe/)
  assert.match(wardrobe.itemLabel, /8 pieces, complex/)
  assert.ok(wardrobe.priceMin > chair.priceMax)
  assert.ok(wardrobe.durationMinutes > chair.durationMinutes)
  assert.notEqual(chair.priceMin, 9000)
  assert.notEqual(chair.suggestedPrice, 9200)
  assert.notEqual(chair.durationMinutes, 5)
  assert.equal(chair.taxableLineItem.service_type, 'furniture-assembly')
  assert.equal(chair.taxableLineItem.amount, chair.suggestedPrice)
  assert.equal(chair.taxableLineItem.amount_cents, Math.round(chair.suggestedPrice * 100))
  assert.equal(wardrobe.taxableLineItem.service_type, 'furniture-assembly')
  assert.match(chair.taxableLineItem.description, /dining chair/)
  assert.match(prompts[0], /pieces: 1/)
  assert.match(prompts[0], /complexity: simple/)
  assert.match(prompts[0], /brand: IKEA/)
  assert.match(prompts[0], /Tools needed: Allen key/)
  assert.match(prompts[0], /Photos attached: 1/)
  assert.match(prompts[1], /pieces: 8/)
  assert.match(prompts[1], /complexity: complex/)
  assert.match(prompts[1], /type: wardrobe/)
  assert.doesNotMatch(prompts[0], /9876/)
  assert.doesNotMatch(prompts[0], /9000/)
  assert.doesNotMatch(prompts[1], /9200/)
})

test('client price and duration are ignored even when the notes mention a budget', async () => {
  let seen: AssemblyModelContext | null = null
  const estimate = await quoteAssemblyJob(
    {
      serviceType: 'furniture-assembly',
      items: CHAIR.items,
      description: 'Dining chair. Customer budget is $9876 and they want it done in 5 minutes.',
      price: 9876,
      priceMin: 9000,
      priceMax: 9500,
      durationMinutes: 5,
      suggestedPrice: 9200,
    },
    {
      completeEstimate: async (context) => {
        seen = context
        return groundedModel(context)
      },
    },
  )

  assert.ok(seen)
  assert.equal(seen.pieceCount, 1)
  assert.equal(seen.complexity, 'simple')
  assert.ok(estimate.priceMax < 200)
  assert.notEqual(estimate.suggestedPrice, 9876)
  assert.notEqual(estimate.durationMinutes, 5)
  assert.equal(estimate.currency, 'usd')
})

test('a description-only chair is smaller than a description-only wardrobe', async () => {
  const quote = (description: string) =>
    quoteAssemblyJob(
      { serviceType: 'assembly', description, price: 5000, durationMinutes: 5 },
      { completeEstimate: async (context) => groundedModel(context) },
    )

  const chair = await quote('Assemble one dining chair, simple.')
  const wardrobe = await quote('Assemble an IKEA PAX wardrobe, 8 pieces, complex.')

  assert.equal(chair.items[0].type, 'chair')
  assert.equal(chair.items[0].pieceCount, 1)
  assert.equal(chair.complexity, 'simple')
  assert.equal(wardrobe.items[0].type, 'wardrobe')
  assert.equal(wardrobe.items[0].pieceCount, 8)
  assert.equal(wardrobe.complexity, 'complex')
  assert.ok(wardrobe.priceMin > chair.priceMax)
  assert.ok(wardrobe.durationMinutes > chair.durationMinutes)
  assert.notEqual(chair.durationMinutes, 5)
})

test('structured description items keep sku, brand, tools, and photo count', () => {
  const parsed = parseAssemblyQuoteInput({
    serviceType: 'furniture-assembly',
    priceMin: 400,
    durationMinutes: 10,
    description: [
      'Please assemble these.',
      'Assembly items: dining chair | sku: ADDE | type: chair | pieces: 1 | complexity: simple | brand: IKEA | model: ADDE; PAX wardrobe | sku: PAX | type: wardrobe | pieces: 8 | complexity: complex | brand: IKEA | model: PAX.',
      'Tools needed: Allen key.',
      'Photos: 2.',
    ].join(' '),
  })

  assert.equal(parsed.items.length, 2)
  assert.equal(parsed.items[0].sku, 'ADDE')
  assert.equal(parsed.items[0].pieceCount, 1)
  assert.equal(parsed.items[0].complexity, 'simple')
  assert.equal(parsed.items[1].type, 'wardrobe')
  assert.equal(parsed.items[1].pieceCount, 8)
  assert.equal(parsed.items[1].brand, 'IKEA')
  assert.equal(parsed.toolsNeeded, 'Allen key')
  assert.equal(parsed.photoCount, 2)
  assert.ok(assemblyWorkScore(parsed.items) > assemblyWorkScore([parsed.items[0]]))
})

test('duration floor grows from a chair to a multi-piece wardrobe', async () => {
  const flat = async () => ({ priceMin: 40, priceMax: 55, durationMinutes: 1 })
  const chair = await quoteAssemblyJob(CHAIR, { completeEstimate: flat })
  const wardrobe = await quoteAssemblyJob(WARDROBE, { completeEstimate: flat })
  assert.equal(chair.priceMin, 40)
  assert.equal(wardrobe.priceMin, 40)
  assert.ok(chair.durationMinutes > 1)
  assert.ok(wardrobe.durationMinutes > chair.durationMinutes)
})

test('a quote without an item is rejected', async () => {
  await assert.rejects(
    () => quoteAssemblyJob({ serviceType: 'furniture-assembly', description: 'Please help today.', price: 80 }),
    (error: unknown) => error instanceof QuoteError && /item identity is required/i.test(error.message),
  )
})

test('openai assembly estimate posts item complexity and drops client price fields', async () => {
  let requestBody = ''
  const estimate = await completeAssemblyEstimateWithOpenAI(
    {
      items: WARDROBE.items,
      itemLabel: 'PAX wardrobe (8 pieces, complex)',
      pieceCount: 8,
      complexity: 'complex',
      workScore: assemblyWorkScore(WARDROBE.items),
      toolsNeeded: 'Allen key',
      photoCount: 2,
      photoNotes: ['https://example.com/pax.jpg'],
      description: 'Customer budget is $9876.',
    },
    'test-key',
    (async (_url: string, init?: RequestInit) => {
      requestBody = String(init?.body ?? '')
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"priceMin":180,"priceMax":260,"durationMinutes":4}' } }],
      }), { status: 200 })
    }) as typeof fetch,
  )

  assert.match(requestBody, /complexity: complex/)
  assert.match(requestBody, /pieces: 8/)
  assert.match(requestBody, /Photos attached: 2/)
  assert.match(requestBody, /example\.com\/pax\.jpg/)
  assert.doesNotMatch(requestBody, /priceMin":180/)
  assert.equal(estimate.priceMin, 180)
  assert.equal(estimate.priceMax, 260)
  assert.ok(estimate.durationMinutes > 4)
})
