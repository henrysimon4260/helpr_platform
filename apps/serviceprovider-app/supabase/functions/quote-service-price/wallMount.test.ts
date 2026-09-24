import assert from 'node:assert/strict'
import test from 'node:test'

import { QuoteError } from './estimate.ts'
import {
  completeWallMountEstimateWithOpenAI,
  mountWorkScore,
  parseWallMountQuoteInput,
  quoteWallMountJob,
  renderWallMountPrompt,
  type WallMountModelContext,
} from './wallMount.ts'

const PICTURE = {
  serviceType: 'wall-mounting',
  item: 'picture frame',
  itemType: 'picture',
  sizeInches: 16,
  wallType: 'drywall',
  heightFeet: 5,
  studFinding: false,
  hardwareIncluded: true,
  description: 'Hang a picture frame.',
}

const TV = {
  serviceType: 'Wall Mounting',
  item: '65 inch TV',
  itemType: 'tv',
  sizeInches: 65,
  wallType: 'drywall',
  heightFeet: 5,
  studFinding: true,
  hardwareIncluded: false,
  description: 'Mount a 65 inch TV.',
}

function groundedModel(context: WallMountModelContext) {
  const score = context.workScore
  const priceMin = Math.max(35, Math.round(40 + score * 22))
  const priceMax = Math.round(priceMin * 1.35)
  const durationMinutes = Math.round(25 + score * 12)
  return { priceMin, priceMax, durationMinutes }
}

test('a picture prices and lasts less than a 65 inch TV', async () => {
  const prompts: string[] = []
  const quote = (body: Record<string, unknown>) =>
    quoteWallMountJob(
      {
        ...body,
        price: 9876,
        priceMin: 9000,
        priceMax: 9500,
        suggestedPrice: 9200,
        durationMinutes: 5,
        weightClass: 'heavy',
      },
      {
        completeEstimate: async (context) => {
          prompts.push(renderWallMountPrompt(context))
          return groundedModel(context)
        },
      },
    )

  const picture = await quote(PICTURE)
  const tv = await quote(TV)

  assert.equal(picture.source, 'server')
  assert.equal(tv.source, 'server')
  assert.equal(picture.serviceType, 'wall-mounting')
  assert.equal(tv.serviceType, 'wall-mounting')
  assert.equal(picture.item.type, 'picture')
  assert.equal(picture.item.weightClass, 'light')
  assert.equal(picture.item.sizeInches, 16)
  assert.equal(tv.item.type, 'tv')
  assert.equal(tv.item.weightClass, 'heavy')
  assert.equal(tv.item.sizeInches, 65)
  assert.match(picture.itemLabel, /picture frame/)
  assert.match(picture.itemLabel, /light/)
  assert.match(tv.itemLabel, /65 inch TV/)
  assert.match(tv.itemLabel, /heavy/)
  assert.match(tv.itemLabel, /65 in/)
  assert.ok(mountWorkScore(tv) > mountWorkScore(picture))
  assert.ok(tv.priceMin > picture.priceMax)
  assert.ok(tv.durationMinutes > picture.durationMinutes)
  assert.notEqual(picture.priceMin, 9000)
  assert.notEqual(picture.suggestedPrice, 9200)
  assert.notEqual(picture.durationMinutes, 5)
  assert.equal(picture.taxableLineItem.service_type, 'wall-mounting')
  assert.equal(picture.taxableLineItem.amount, picture.suggestedPrice)
  assert.equal(picture.taxableLineItem.amount_cents, Math.round(picture.suggestedPrice * 100))
  assert.equal(tv.taxableLineItem.service_type, 'wall-mounting')
  assert.match(picture.taxableLineItem.description, /picture frame/)
  assert.match(prompts[0], /Type: picture/)
  assert.match(prompts[0], /Size: 16 in/)
  assert.match(prompts[0], /Weight class: light/)
  assert.match(prompts[0], /Hardware included: yes/)
  assert.match(prompts[0], /Stud finding: no/)
  assert.match(prompts[1], /Type: tv/)
  assert.match(prompts[1], /Size: 65 in/)
  assert.match(prompts[1], /Weight class: heavy/)
  assert.match(prompts[1], /Stud finding: yes/)
  assert.match(prompts[1], /Hardware included: no/)
  assert.doesNotMatch(prompts[0], /9876/)
  assert.doesNotMatch(prompts[0], /9000/)
  assert.doesNotMatch(prompts[1], /9200/)
})

test('client price and duration are ignored even when the notes mention a budget', async () => {
  let seen: WallMountModelContext | null = null
  const estimate = await quoteWallMountJob(
    {
      serviceType: 'wall-mounting',
      item: 'picture frame',
      itemType: 'picture',
      sizeInches: 16,
      description: 'Picture frame. Customer budget is $9876 and they want it done in 5 minutes.',
      price: 9876,
      priceMin: 9000,
      priceMax: 9500,
      durationMinutes: 5,
      suggestedPrice: 9200,
      weightClass: 'heavy',
    },
    {
      completeEstimate: async (context) => {
        seen = context
        return groundedModel(context)
      },
    },
  )

  assert.ok(seen)
  assert.equal(seen.item.type, 'picture')
  assert.equal(seen.item.weightClass, 'light')
  assert.ok(estimate.priceMax < 200)
  assert.notEqual(estimate.suggestedPrice, 9876)
  assert.notEqual(estimate.durationMinutes, 5)
  assert.equal(estimate.currency, 'usd')
})

test('a description-only picture is smaller than a description-only 65 inch TV', async () => {
  const quote = (description: string, serviceType = 'wall-mounting') =>
    quoteWallMountJob(
      { serviceType, description, price: 5000, durationMinutes: 5, weightClass: 'heavy' },
      { completeEstimate: async (context) => groundedModel(context) },
    )

  const picture = await quote('Hang a picture frame.')
  const tv = await quote('Mount a 65 inch TV.', 'wall mounting')

  assert.equal(picture.item.type, 'picture')
  assert.equal(picture.item.weightClass, 'light')
  assert.equal(picture.item.sizeInches, null)
  assert.equal(tv.item.type, 'tv')
  assert.equal(tv.item.sizeInches, 65)
  assert.equal(tv.item.weightClass, 'heavy')
  assert.ok(tv.priceMin > picture.priceMax)
  assert.ok(tv.durationMinutes > picture.durationMinutes)
  assert.notEqual(picture.durationMinutes, 5)
  assert.notEqual(tv.durationMinutes, 5)
})

test('structured description keeps the item, wall, height, studs, and hardware', () => {
  const parsed = parseWallMountQuoteInput({
    serviceType: 'wall_mounting',
    priceMin: 400,
    durationMinutes: 10,
    weightClass: 'heavy',
    description: [
      'Please hang this.',
      'Mount item: picture frame | type: picture | size: 16 in.',
      'Wall type: brick.',
      'Mount height: 8 ft.',
      'Stud finding: yes.',
      'Hardware included: no.',
    ].join(' '),
  })

  assert.equal(parsed.serviceType, 'wall-mounting')
  assert.equal(parsed.item.name, 'picture frame')
  assert.equal(parsed.item.type, 'picture')
  assert.equal(parsed.item.sizeInches, 16)
  assert.equal(parsed.item.weightClass, 'light')
  assert.equal(parsed.wallType, 'brick')
  assert.equal(parsed.heightFeet, 8)
  assert.equal(parsed.studFinding, true)
  assert.equal(parsed.hardwareIncluded, false)
  assert.ok(mountWorkScore(parsed) > mountWorkScore({
    item: parsed.item,
    wallType: 'drywall',
    heightFeet: 5,
    studFinding: false,
    hardwareIncluded: true,
  }))
})

test('duration floor grows from a picture to a 65 inch TV', async () => {
  const flat = async () => ({ priceMin: 40, priceMax: 55, durationMinutes: 1 })
  const picture = await quoteWallMountJob(PICTURE, { completeEstimate: flat })
  const tv = await quoteWallMountJob(TV, { completeEstimate: flat })
  assert.equal(picture.priceMin, 40)
  assert.equal(tv.priceMin, 40)
  assert.ok(picture.durationMinutes > 1)
  assert.ok(tv.durationMinutes > picture.durationMinutes)
})

test('a quote without an item is rejected', async () => {
  await assert.rejects(
    () => quoteWallMountJob({ serviceType: 'wall-mounting', description: 'Please help today.', price: 80 }),
    (error: unknown) => error instanceof QuoteError && /mounted item is required/i.test(error.message),
  )
})

test('openai wall mount estimate posts the item and drops client price fields', async () => {
  let requestBody = ''
  const context: WallMountModelContext = {
    item: {
      name: '65 inch TV',
      type: 'tv',
      sizeInches: 65,
      weightClass: 'heavy',
    },
    itemLabel: '65 inch TV (heavy, 65 in)',
    wallType: 'drywall',
    heightFeet: 5,
    studFinding: true,
    hardwareIncluded: false,
    workScore: mountWorkScore({
      item: {
        name: '65 inch TV',
        type: 'tv',
        sizeInches: 65,
        weightClass: 'heavy',
      },
      wallType: 'drywall',
      heightFeet: 5,
      studFinding: true,
      hardwareIncluded: false,
    }),
    description: 'Customer budget is $9876.',
  }
  const estimate = await completeWallMountEstimateWithOpenAI(
    context,
    'test-key',
    (async (_url: string, init?: RequestInit) => {
      requestBody = String(init?.body ?? '')
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"priceMin":180,"priceMax":260,"durationMinutes":4}' } }],
      }), { status: 200 })
    }) as typeof fetch,
  )

  assert.match(requestBody, /Type: tv/)
  assert.match(requestBody, /Size: 65 in/)
  assert.match(requestBody, /Weight class: heavy/)
  assert.match(requestBody, /Stud finding: yes/)
  assert.doesNotMatch(requestBody, /priceMin":180/)
  assert.equal(estimate.priceMin, 180)
  assert.equal(estimate.priceMax, 260)
  assert.ok(estimate.durationMinutes > 4)
})
