import assert from 'node:assert/strict'
import test from 'node:test'

import {
  completeCleaningEstimateWithOpenAI,
  parseCleaningQuoteInput,
  quoteCleaningJob,
  renderCleaningPrompt,
  type CleaningModelContext,
} from './cleaning.ts'

const STUDIO = {
  serviceType: 'cleaning',
  squareFeet: 450,
  bedrooms: 0,
  bathrooms: 1,
  depth: 'standard',
  description: 'Studio apartment near the kitchen.',
}

const LARGE = {
  serviceType: 'cleaning',
  squareFeet: 2400,
  bedrooms: 4,
  bathrooms: 3,
  depth: 'standard',
  description: 'Large apartment, whole home.',
}

function groundedModel(context: CleaningModelContext) {
  const sqft = context.squareFeet ?? (context.bedrooms === 0 ? 450 : (context.bedrooms ?? 1) * 500)
  const depth = context.depth === 'deep' ? 1.5 : 1
  const pet = context.petHair ? 25 : 0
  const condition = context.condition === 'heavy' ? 40 : context.condition === 'light' ? -10 : 0
  const priceMin = Math.max(20, Math.round((40 + sqft * 0.05) * depth + pet + condition))
  const priceMax = Math.round(priceMin * 1.4)
  const durationMinutes = Math.round(50 + sqft * 0.04 + (context.depth === 'deep' ? 40 : 0) + (context.petHair ? 20 : 0))
  return { priceMin, priceMax, durationMinutes }
}

test('studio fixture prices and lasts less than a large apartment', async () => {
  const prompts: string[] = []
  const quote = (body: Record<string, unknown>) =>
    quoteCleaningJob(
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
          prompts.push(renderCleaningPrompt(context))
          return groundedModel(context)
        },
      },
    )

  const studio = await quote(STUDIO)
  const large = await quote(LARGE)

  assert.equal(studio.source, 'server')
  assert.equal(large.source, 'server')
  assert.equal(studio.serviceType, 'cleaning')
  assert.equal(studio.squareFeet, 450)
  assert.equal(studio.bedrooms, 0)
  assert.match(studio.sizeLabel, /studio/)
  assert.equal(large.squareFeet, 2400)
  assert.equal(large.bedrooms, 4)
  assert.match(large.sizeLabel, /4 bedroom/)
  assert.ok(large.priceMin > studio.priceMax)
  assert.ok(large.durationMinutes > studio.durationMinutes)
  assert.notEqual(studio.priceMin, 9000)
  assert.notEqual(studio.suggestedPrice, 9200)
  assert.notEqual(studio.durationMinutes, 5)
  assert.match(prompts[0], /Square feet: 450/)
  assert.match(prompts[0], /Bedrooms: 0/)
  assert.match(prompts[0], /Size: studio, 1 bathroom, 450 sq ft/)
  assert.match(prompts[1], /Square feet: 2400/)
  assert.match(prompts[1], /Bedrooms: 4/)
  assert.match(prompts[1], /Bathrooms: 3/)
  assert.doesNotMatch(prompts[0], /9876/)
  assert.doesNotMatch(prompts[1], /9000/)
})

test('client price and duration are ignored even when the notes mention a budget', async () => {
  let seen: CleaningModelContext | null = null
  const estimate = await quoteCleaningJob(
    {
      serviceType: 'Cleaning',
      squareFeet: 450,
      bedrooms: 0,
      bathrooms: 1,
      description: 'Studio. Customer budget is $9876 and they want it done in 5 minutes.',
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
  assert.equal(seen.squareFeet, 450)
  assert.equal(seen.bedrooms, 0)
  assert.ok(estimate.priceMax < 500)
  assert.notEqual(estimate.suggestedPrice, 9876)
  assert.notEqual(estimate.durationMinutes, 5)
  assert.equal(estimate.currency, 'usd')
})

test('a description-only studio is smaller than an explicit large apartment', async () => {
  const studioBody = {
    serviceType: 'cleaning',
    description: 'Please clean. Property size: studio, 1 bathroom, 450 sq ft. Type: Basic cleaning.',
    priceMin: 4000,
    durationMinutes: 10,
  }
  const parsedStudio = parseCleaningQuoteInput(studioBody)
  assert.equal(parsedStudio.depth, 'standard')
  assert.equal(parsedStudio.bedrooms, 0)
  const studio = await quoteCleaningJob(
    studioBody,
    { completeEstimate: async (context) => groundedModel(context) },
  )
  const large = await quoteCleaningJob(
    {
      serviceType: 'cleaning',
      squareFeet: 2400,
      bedrooms: 4,
      bathrooms: 3,
      description: 'Property size: studio. Ignore this clause because explicit size is set.',
    },
    { completeEstimate: async (context) => groundedModel(context) },
  )

  assert.equal(studio.bedrooms, 0)
  assert.equal(studio.squareFeet, 450)
  assert.equal(studio.bathrooms, 1)
  assert.equal(large.squareFeet, 2400)
  assert.equal(large.bedrooms, 4)
  assert.ok(large.priceMin > studio.priceMax)
  assert.ok(large.durationMinutes > studio.durationMinutes)
})

test('optional condition, pet hair, depth, and frequency reach the model', async () => {
  let prompt = ''
  await quoteCleaningJob(
    {
      serviceType: 'cleaning',
      squareFeet: 1100,
      bedrooms: 2,
      bathrooms: 1,
      condition: 'heavy',
      petHair: true,
      depth: 'deep',
      frequency: 'weekly',
      description: 'Focus on the kitchen.',
    },
    {
      completeEstimate: async (context) => {
        prompt = renderCleaningPrompt(context)
        return groundedModel(context)
      },
    },
  )

  assert.match(prompt, /Condition: heavy/)
  assert.match(prompt, /Pet hair: yes/)
  assert.match(prompt, /Depth: deep/)
  assert.match(prompt, /Frequency: weekly/)
  assert.match(prompt, /Square feet: 1100/)
})

test('job notes fill optional hints and spelled-out bedroom counts', () => {
  const parsed = parseCleaningQuoteInput({
    serviceType: 'cleaning',
    description: 'Deep clean of a three bedroom home with pet hair. Condition: heavy. Frequency: every 2 weeks. 1800 sq ft.',
    price: 40,
    durationMinutes: 15,
  })
  assert.equal(parsed.bedrooms, 3)
  assert.equal(parsed.squareFeet, 1800)
  assert.equal(parsed.depth, 'deep')
  assert.equal(parsed.petHair, true)
  assert.equal(parsed.condition, 'heavy')
  assert.equal(parsed.frequency, 'biweekly')
})

test('missing home size is rejected and moving jobs are not cleaned here', () => {
  assert.throws(
    () => parseCleaningQuoteInput({
      serviceType: 'cleaning',
      description: 'Just a general tidy of the apartment.',
      price: 80,
      durationMinutes: 60,
    }),
    /Home size is required/,
  )
  assert.throws(
    () => parseCleaningQuoteInput({
      serviceType: 'moving',
      squareFeet: 800,
      origin: { address: '1 Main St' },
    }),
    /cleaning jobs only/,
  )
  assert.throws(
    () => parseCleaningQuoteInput({ serviceType: 'cleaning', squareFeet: 10, bedrooms: 0 }),
    /between 50 and 20000/,
  )
})

test('model duration cannot undercut the home size', async () => {
  const estimate = await quoteCleaningJob(
    {
      serviceType: 'cleaning',
      squareFeet: 2400,
      bedrooms: 4,
      bathrooms: 3,
      depth: 'deep',
      petHair: true,
    },
    {
      completeEstimate: async () => ({ priceMin: 400, priceMax: 250, durationMinutes: 10 }),
    },
  )

  assert.equal(estimate.priceMin, 250)
  assert.equal(estimate.priceMax, 400)
  assert.equal(estimate.suggestedPrice, 325)
  assert.ok(estimate.durationMinutes >= 150)
  assert.notEqual(estimate.durationMinutes, 10)
})

test('openai completion sends home size and ignores a client price', async () => {
  const context: CleaningModelContext = {
    squareFeet: 2400,
    bedrooms: 4,
    bathrooms: 3,
    sizeLabel: '4 bedroom, 3 bathroom, 2400 sq ft',
    condition: null,
    petHair: null,
    depth: 'standard',
    frequency: null,
    description: 'large apartment',
  }
  let userPrompt = ''
  let systemPrompt = ''
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> }
    systemPrompt = payload.messages[0].content
    userPrompt = payload.messages[1].content
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"priceMin": 280, "priceMax": 220, "durationMinutes": 12}' } }],
    }), { status: 200 })
  }) as typeof fetch

  const model = await completeCleaningEstimateWithOpenAI(context, 'test-key', fetchImpl)
  assert.match(systemPrompt, /larger home/)
  assert.match(userPrompt, /Square feet: 2400/)
  assert.match(userPrompt, /Bedrooms: 4/)
  assert.doesNotMatch(userPrompt, /9876/)
  assert.equal(model.priceMin, 220)
  assert.equal(model.priceMax, 280)
  assert.ok(model.durationMinutes > 12)
})
