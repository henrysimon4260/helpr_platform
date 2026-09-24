import assert from 'node:assert/strict'
import test from 'node:test'

import {
  completeMovingEstimateWithOpenAI,
  extractMovingHints,
  fetchGoogleDrivingLeg,
  parseMovingQuoteInput,
  quoteMovingJob,
  renderMovingPrompt,
  type MovingModelContext,
} from './estimate.ts'

const SHORT_ORIGIN = { address: '10 Downing St, New York, NY', latitude: 40.7295, longitude: -73.9987 }
const SHORT_DESTINATION = { address: '20 Waverly Pl, New York, NY', latitude: 40.7302, longitude: -73.9951 }
const LONG_ORIGIN = { address: 'New York, NY', latitude: 40.7128, longitude: -74.006 }
const LONG_DESTINATION = { address: 'Boston, MA', latitude: 42.3601, longitude: -71.0589 }

function distanceMatrixBody(distanceMeters: number, durationSeconds: number) {
  return {
    status: 'OK',
    rows: [
      {
        elements: [
          {
            status: 'OK',
            distance: { value: distanceMeters, text: `${distanceMeters} m` },
            duration: { value: durationSeconds, text: `${durationSeconds} s` },
          },
        ],
      },
    ],
  }
}

const SHORT_METERS = 1931
const SHORT_SECONDS = 360
const LONG_METERS = 346010
const LONG_SECONDS = 14400

function mapsFetch(distanceMeters: number, durationSeconds: number): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    assert.equal(url.hostname, 'maps.googleapis.com')
    assert.equal(url.pathname, '/maps/api/distancematrix/json')
    assert.equal(url.searchParams.get('mode'), 'driving')
    assert.ok(url.searchParams.get('origins'))
    assert.ok(url.searchParams.get('destinations'))
    assert.equal(url.searchParams.has('distance'), false)
    return new Response(JSON.stringify(distanceMatrixBody(distanceMeters, durationSeconds)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
}

function groundedModel(context: MovingModelContext) {
  const miles = context.distanceMiles
  const perMile = context.needsTruck ? 4 : 2.5
  const priceMin = Math.round(160 + miles * perMile)
  const priceMax = Math.round(priceMin * 1.4)
  const durationMinutes = Math.round((2 * 60) + context.drivingDurationMinutes + (context.stairs ? 30 : 0))
  return { priceMin, priceMax, durationMinutes }
}

test('distance matrix fixtures distinguish a short haul from a long haul', async () => {
  const short = await fetchGoogleDrivingLeg('40.7295,-73.9987', '40.7302,-73.9951', 'test-key', mapsFetch(SHORT_METERS, SHORT_SECONDS))
  const long = await fetchGoogleDrivingLeg('40.7128,-74.0060', '42.3601,-71.0589', 'test-key', mapsFetch(LONG_METERS, LONG_SECONDS))

  assert.ok(short.distanceMeters < 5_000)
  assert.ok(long.distanceMeters > 300_000)
  assert.ok(long.durationSeconds > short.durationSeconds * 10)
})

test('short haul estimate stays below the long haul estimate', async () => {
  const prompts: string[] = []
  const quote = (origin: typeof SHORT_ORIGIN, destination: typeof SHORT_DESTINATION, meters: number, seconds: number) =>
    quoteMovingJob(
      {
        serviceType: 'moving',
        origin,
        destination,
        description: '2 bedroom apartment',
        needsTruck: false,
        distanceMiles: 1,
        priceMin: 10,
        priceMax: 20,
      },
      {
        fetchDrivingLeg: async () => ({ distanceMeters: meters, durationSeconds: seconds }),
        completeEstimate: async (context) => {
          prompts.push(renderMovingPrompt(context))
          return groundedModel(context)
        },
      },
    )

  const short = await quote(SHORT_ORIGIN, SHORT_DESTINATION, SHORT_METERS, SHORT_SECONDS)
  const long = await quote(LONG_ORIGIN, LONG_DESTINATION, LONG_METERS, LONG_SECONDS)

  assert.equal(short.source, 'server')
  assert.equal(long.source, 'server')
  assert.ok(short.distanceMiles < 5)
  assert.ok(long.distanceMiles > 150)
  assert.ok(long.priceMin > short.priceMax)
  assert.ok(long.durationMinutes > short.durationMinutes)
  assert.ok(long.drivingDurationMinutes > short.drivingDurationMinutes)
  assert.match(prompts[0], /Distance miles: 1\.2/)
  assert.match(prompts[1], /Distance miles: 215\.0/)
  assert.doesNotMatch(prompts[1], /Distance miles: 1\.0/)
})

test('client-supplied distance and price are ignored', async () => {
  let seen: MovingModelContext | null = null
  const estimate = await quoteMovingJob(
    {
      serviceType: 'Moving',
      origin: SHORT_ORIGIN,
      destination: SHORT_DESTINATION,
      distanceMiles: 900,
      distanceMeters: 1_400_000,
      price: 15,
      priceMin: 12,
      priceMax: 18,
      suggestedPrice: 15,
      durationMinutes: 20,
    },
    {
      fetchDrivingLeg: async (origin, destination) => {
        assert.match(origin, /40\.7295/)
        assert.match(destination, /40\.7302/)
        return { distanceMeters: LONG_METERS, durationSeconds: LONG_SECONDS }
      },
      completeEstimate: async (context) => {
        seen = context
        return groundedModel(context)
      },
    },
  )

  assert.ok(seen)
  assert.ok(seen.distanceMiles > 150)
  assert.equal(estimate.distanceMiles, seen.distanceMiles)
  assert.ok(estimate.priceMin > 500)
  assert.notEqual(estimate.priceMin, 12)
  assert.notEqual(estimate.suggestedPrice, 15)
  assert.equal(estimate.currency, 'usd')
})

test('optional stairs, floor, volume, weight, and crew size reach the model', async () => {
  let prompt = ''
  await quoteMovingJob(
    {
      serviceType: 'moving',
      origin: { address: '100 Main St, Hoboken, NJ' },
      destination: { address: '200 Main St, Hoboken, NJ' },
      stairs: true,
      elevator: false,
      floor: 4,
      volumeHint: '3 bedroom',
      weightHint: 'upright piano',
      crewSize: 3,
      needsTruck: true,
      description: 'Walk-up with a piano.',
    },
    {
      fetchDrivingLeg: async () => ({ distanceMeters: SHORT_METERS, durationSeconds: SHORT_SECONDS }),
      completeEstimate: async (context) => {
        prompt = renderMovingPrompt(context)
        return groundedModel(context)
      },
    },
  )

  assert.match(prompt, /Stairs: yes/)
  assert.match(prompt, /Elevator: no/)
  assert.match(prompt, /Floor: 4/)
  assert.match(prompt, /Volume: 3 bedroom/)
  assert.match(prompt, /Weight: upright piano/)
  assert.match(prompt, /Crew size: 3/)
  assert.match(prompt, /Truck needed: yes/)
})

test('job notes fill optional hints when the client does not send them', () => {
  const hints = extractMovingHints('3rd floor walk-up, no elevator, crew of 2, heavy sofa, 2 bedroom')
  assert.equal(hints.floor, 3)
  assert.equal(hints.stairs, true)
  assert.equal(hints.elevator, false)
  assert.equal(hints.crewSize, 2)
  assert.match(hints.volumeHint ?? '', /2 bedroom/)
  assert.match(hints.weightHint ?? '', /heavy sofa/)

  const parsed = parseMovingQuoteInput({
    serviceType: 'moving',
    origin: SHORT_ORIGIN,
    destination: SHORT_DESTINATION,
    description: '3rd floor walk-up, no elevator, crew of 2, heavy sofa, 2 bedroom',
    distanceMiles: 40,
  })
  assert.equal(parsed.floor, 3)
  assert.equal(parsed.stairs, true)
  assert.equal(parsed.elevator, false)
  assert.equal(parsed.crewSize, 2)
  assert.equal(parsed.volumeHint, '2 bedroom')
})

test('explicit metadata wins over notes, and non-moving jobs are rejected', () => {
  const parsed = parseMovingQuoteInput({
    serviceType: 'moving',
    origin: { address: '1 Broadway, New York, NY' },
    destination: { address: '2 Broadway, New York, NY' },
    description: 'studio, no stairs, elevator, crew of 4',
    stairs: true,
    crewSize: 2,
    volumeHint: '4 bedroom',
  })
  assert.equal(parsed.stairs, true)
  assert.equal(parsed.crewSize, 2)
  assert.equal(parsed.volumeHint, '4 bedroom')
  assert.equal(parsed.elevator, true)

  assert.throws(
    () => parseMovingQuoteInput({
      serviceType: 'cleaning',
      origin: SHORT_ORIGIN,
      destination: SHORT_DESTINATION,
    }),
    /moving jobs only/,
  )
  assert.throws(
    () => parseMovingQuoteInput({ serviceType: 'moving', origin: { address: 'only pickup' } }),
    /Destination is required/,
  )
})

test('model duration cannot be shorter than the drive', async () => {
  const estimate = await quoteMovingJob(
    {
      serviceType: 'moving',
      origin: LONG_ORIGIN,
      destination: LONG_DESTINATION,
    },
    {
      fetchDrivingLeg: async () => ({ distanceMeters: LONG_METERS, durationSeconds: LONG_SECONDS }),
      completeEstimate: async () => ({ priceMin: 900, priceMax: 700, durationMinutes: 10 }),
    },
  )

  assert.equal(estimate.priceMin, 700)
  assert.equal(estimate.priceMax, 900)
  assert.equal(estimate.suggestedPrice, 800)
  assert.ok(estimate.durationMinutes >= estimate.drivingDurationMinutes + 45)
})

test('openai completion uses the server prompt and ignores a missing live key in tests', async () => {
  const context: MovingModelContext = {
    distanceMiles: 215,
    drivingDurationMinutes: 240,
    originLabel: 'New York, NY',
    destinationLabel: 'Boston, MA',
    description: 'long haul',
    stairs: null,
    elevator: null,
    floor: null,
    volumeHint: null,
    weightHint: null,
    crewSize: null,
    needsTruck: true,
  }
  let requestedMiles = ''
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> }
    requestedMiles = payload.messages[1].content
    assert.match(payload.messages[0].content, /server maps API/)
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"priceMin": 1100, "priceMax": 1600, "durationMinutes": 400}' } }],
    }), { status: 200 })
  }) as typeof fetch

  const model = await completeMovingEstimateWithOpenAI(context, 'test-key', fetchImpl)
  assert.match(requestedMiles, /Distance miles: 215\.0/)
  assert.equal(model.priceMin, 1100)
  assert.equal(model.priceMax, 1600)
  assert.equal(model.durationMinutes, 400)
})
