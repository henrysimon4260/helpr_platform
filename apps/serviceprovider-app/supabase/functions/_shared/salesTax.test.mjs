import assert from 'node:assert/strict'
import test from 'node:test'
import {
  NYC_COMBINED_RATE_PARTS,
  WESTCHESTER_COMBINED_RATE_PARTS,
  applySalesTaxToCheckout,
  bundledTaxableCodes,
  computeSalesTax,
  normalizeServiceType,
  preTaxCheckoutCents,
  readSalesTaxRequest,
  salesTaxMetadata,
  serviceTaxAddress,
  taxCentsForBase,
} from './salesTax.ts'

const NYC = '10 Broadway, New York, NY 10004'

test('cleaning-only is taxable at the NYC combined rate', () => {
  const result = computeSalesTax({
    lines: [{ serviceType: 'cleaning', amountCents: 10_000, description: 'Home cleaning' }],
    address: NYC,
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.quote.jurisdiction, 'nyc')
  assert.equal(result.quote.rate.combined_parts, NYC_COMBINED_RATE_PARTS)
  assert.equal(result.quote.rate.combined_rate, '0.08875')
  assert.equal(result.quote.taxable_base_cents, 10_000)
  assert.equal(result.quote.nontaxable_base_cents, 0)
  assert.equal(result.quote.tax_cents, 888)
  assert.equal(result.quote.fail_closed, false)
  assert.equal(result.quote.resolution, 'single_type')
  assert.deepEqual(result.quote.job_type_codes, ['cleaning'])
  assert.equal(result.quote.line_items[0].taxable, true)
  assert.equal(result.quote.line_items[0].tax_cents, 888)
})

test('move-only pure transport is not taxable', () => {
  const result = computeSalesTax({
    lines: [{
      serviceType: 'Moving',
      amountCents: 20_000,
      description: 'Transport furniture from Brooklyn to Manhattan. Items are already packed.',
    }],
    address: '88 Pineapple St, Brooklyn, NY 11201',
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.quote.jurisdiction, 'nyc')
  assert.equal(result.quote.tax_cents, 0)
  assert.equal(result.quote.taxable_base_cents, 0)
  assert.equal(result.quote.nontaxable_base_cents, 20_000)
  assert.equal(result.quote.fail_closed, false)
  assert.equal(result.quote.line_items[0].taxable, false)
  assert.equal(result.quote.line_items[0].reason, 'pure_moving')
  assert.deepEqual(result.quote.job_type_codes, ['moving'])
})

test('move + assembly is unbundled and taxes only the assembly portion', () => {
  const result = computeSalesTax({
    lines: [
      { serviceType: 'moving', amountCents: 20_000, description: 'Transport household goods' },
      { serviceType: 'furniture-assembly', amountCents: 8_000, description: 'Assemble furniture after the move' },
    ],
    address: NYC,
  })
  assert.equal(result.ok, true)
  if (!result.ok) return

  const assemblyOnly = taxCentsForBase(8_000, NYC_COMBINED_RATE_PARTS)
  const blanket = taxCentsForBase(28_000, NYC_COMBINED_RATE_PARTS)
  assert.equal(assemblyOnly, 710)
  assert.notEqual(blanket, assemblyOnly)
  assert.equal(result.quote.tax_cents, assemblyOnly)
  assert.equal(result.quote.taxable_base_cents, 8_000)
  assert.equal(result.quote.nontaxable_base_cents, 20_000)
  assert.equal(result.quote.resolution, 'unbundled')
  assert.equal(result.quote.fail_closed, false)
  assert.equal(result.quote.line_items[0].service_type_code, 'moving')
  assert.equal(result.quote.line_items[0].tax_cents, 0)
  assert.equal(result.quote.line_items[0].taxable, false)
  assert.equal(result.quote.line_items[1].service_type_code, 'furniture-assembly')
  assert.equal(result.quote.line_items[1].tax_cents, 710)
  assert.equal(result.quote.line_items[1].taxable, true)
  assert.deepEqual(result.quote.job_type_codes, ['moving', 'furniture-assembly'])
})

test('desk disassemble + reassemble is taxable', () => {
  const result = computeSalesTax({
    lines: [{
      serviceType: 'desk disassemble + reassemble',
      amountCents: 12_000,
      description: 'Disassemble the desk and reassemble it in the new room',
    }],
    address: NYC,
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(normalizeServiceType('desk disassemble + reassemble'), 'furniture-assembly')
  assert.equal(result.quote.line_items[0].service_type_code, 'furniture-assembly')
  assert.equal(result.quote.taxable_base_cents, 12_000)
  assert.equal(result.quote.tax_cents, taxCentsForBase(12_000, NYC_COMBINED_RATE_PARTS))
  assert.ok(result.quote.tax_cents > 0)
  assert.equal(result.quote.fail_closed, false)
  assert.equal(result.quote.line_items[0].taxable, true)
})

test('assembly bundled under a moving SKU is not a silent zero', () => {
  const result = computeSalesTax({
    lines: [{
      serviceType: 'moving',
      amountCents: 18_000,
      description: 'Move, then disassemble and reassemble the desk',
    }],
    address: NYC,
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.quote.fail_closed, true)
  assert.equal(result.quote.resolution, 'fail_closed_taxable_share')
  assert.equal(result.quote.taxable_base_cents, 18_000)
  assert.equal(result.quote.nontaxable_base_cents, 0)
  assert.equal(result.quote.tax_cents, taxCentsForBase(18_000, NYC_COMBINED_RATE_PARTS))
  assert.ok(result.quote.tax_cents > 0)
  assert.equal(result.quote.line_items[0].reason, 'taxable_work_bundled_under_moving')
  assert.ok(result.quote.job_type_codes.includes('moving'))
  assert.ok(result.quote.job_type_codes.includes('furniture-assembly'))
})

test('historical service_type spellings normalize onto the matrix', () => {
  assert.equal(normalizeServiceType('Cleaning'), 'cleaning')
  assert.equal(normalizeServiceType('furniture assembly'), 'furniture-assembly')
  assert.equal(normalizeServiceType('furniture_assembly'), 'furniture-assembly')
  assert.equal(normalizeServiceType('wall-mounting'), 'wall-mounting')
  assert.equal(normalizeServiceType('wall mounting'), 'wall-mounting')
  assert.equal(normalizeServiceType('home-improvement'), 'home-improvement')
  assert.equal(normalizeServiceType('home_improvement'), 'home-improvement')
  assert.equal(normalizeServiceType('Moving'), 'moving')
  assert.equal(normalizeServiceType('customService'), 'custom')
  assert.equal(normalizeServiceType('custom-service'), 'custom')
  assert.equal(normalizeServiceType(''), 'unknown')
})

test('custom and unknown service types default taxable', () => {
  const custom = computeSalesTax({
    lines: [{ serviceType: 'customService', amountCents: 5_000 }],
    address: NYC,
  })
  const unknown = computeSalesTax({
    lines: [{ serviceType: 'dog-walking', amountCents: 5_000 }],
    address: NYC,
  })
  assert.equal(custom.ok && custom.quote.tax_cents, taxCentsForBase(5_000, NYC_COMBINED_RATE_PARTS))
  assert.equal(unknown.ok && unknown.quote.line_items[0].reason, 'custom_or_unknown_default_taxable')
  assert.equal(unknown.ok && unknown.quote.tax_cents > 0, true)
})

test('already-packed moving text is not treated as packing-as-service', () => {
  assert.deepEqual(
    bundledTaxableCodes('Transport furniture from Brooklyn to Manhattan. Items are already packed.'),
    [],
  )
  assert.deepEqual(bundledTaxableCodes('Need help packing items.'), ['custom'])
})

test('Westchester and Yonkers use their own combined rates', () => {
  const westchester = computeSalesTax({
    lines: [{ serviceType: 'home-improvement', amountCents: 10_000 }],
    address: '1 Martine Ave, White Plains, NY 10601',
  })
  const yonkers = computeSalesTax({
    lines: [{ serviceType: 'wall-mounting', amountCents: 10_000 }],
    address: '20 S Broadway, Yonkers, NY 10701',
  })
  assert.equal(westchester.ok, true)
  assert.equal(yonkers.ok, true)
  if (!westchester.ok || !yonkers.ok) return
  assert.equal(westchester.quote.jurisdiction, 'westchester')
  assert.equal(westchester.quote.rate.combined_parts, WESTCHESTER_COMBINED_RATE_PARTS)
  assert.equal(westchester.quote.tax_cents, 838)
  assert.equal(yonkers.quote.jurisdiction, 'yonkers')
  assert.equal(yonkers.quote.tax_cents, 888)
})

test('New Jersey destination tax is explicit and out of scope', () => {
  const result = computeSalesTax({
    lines: [{ serviceType: 'cleaning', amountCents: 10_000 }],
    address: '1 Newark Ave, Jersey City, NJ 07302',
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.quote.jurisdiction, 'nj_out_of_scope')
  assert.equal(result.quote.out_of_scope, true)
  assert.equal(result.quote.tax_cents, 0)
  assert.equal(result.quote.resolution, 'out_of_scope')
  assert.equal(result.quote.line_items[0].reason, 'jurisdiction_out_of_scope')
  assert.equal(result.quote.rate.combined_parts, 0)
})

test('a non-NY address is rejected instead of taxed as New York', () => {
  const result = computeSalesTax({
    lines: [{ serviceType: 'cleaning', amountCents: 10_000 }],
    address: '1 Market St, San Francisco, CA 94105',
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, 'unsupported_jurisdiction')
})

test('quote request reads mixed line items and ignores client tax math', () => {
  const parsed = readSalesTaxRequest({
    address: NYC,
    tax_cents: 0,
    line_items: [
      { service_type: 'moving', amount_cents: 20_000 },
      { service_type: 'furniture assembly', amount: 80 },
    ],
  })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(parsed.lines[1].amountCents, 8_000)
  const result = computeSalesTax(parsed)
  assert.equal(result.ok && result.quote.tax_cents, 710)
})

test('checkout adds server tax beside the existing 3% + 1% total', () => {
  const preTax = preTaxCheckoutCents(100)
  assert.equal(preTax, 10_400)
  const applied = applySalesTaxToCheckout({
    preTaxAmountCents: preTax,
    serviceType: 'cleaning',
    address: NYC,
    serverPricesDollars: [100],
    description: 'Apartment cleaning',
  })
  assert.equal(applied.ok, true)
  if (!applied.ok) return
  assert.equal(applied.baseCents, 10_000)
  assert.equal(applied.quote.tax_cents, 888)
  assert.equal(applied.chargeCents, preTax + 888)
  const metadata = salesTaxMetadata(applied.quote)
  assert.equal(metadata.sales_tax_cents, '888')
  assert.equal(metadata.taxable_base_cents, '10000')
  assert.equal(metadata.job_type_codes, 'cleaning')
})

test('checkout refuses a client total that does not match a stored price', () => {
  const applied = applySalesTaxToCheckout({
    preTaxAmountCents: 100,
    serviceType: 'cleaning',
    address: NYC,
    serverPricesDollars: [100],
  })
  assert.equal(applied.ok, false)
  if (applied.ok) return
  assert.equal(applied.code, 'checkout_base_unmatched')
})

test('checkout fail-closes assembly hidden on a moving job', () => {
  const preTax = preTaxCheckoutCents(250)
  const applied = applySalesTaxToCheckout({
    preTaxAmountCents: preTax,
    serviceType: 'Moving',
    description: 'Disassemble desk, move it, and reassemble',
    address: '88 Pineapple St, Brooklyn, NY 11201',
    serverPricesDollars: [180, 250],
  })
  assert.equal(applied.ok, true)
  if (!applied.ok) return
  assert.equal(applied.baseCents, 25_000)
  assert.equal(applied.quote.fail_closed, true)
  assert.ok(applied.quote.tax_cents > 0)
  assert.equal(applied.chargeCents, preTax + applied.quote.tax_cents)
  assert.equal(serviceTaxAddress({
    service_type: 'Moving',
    location: '1 Newark Ave, Jersey City, NJ 07302',
    start_location: '88 Pineapple St, Brooklyn, NY 11201',
  }), '88 Pineapple St, Brooklyn, NY 11201')
})
