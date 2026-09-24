import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SERVICE_TYPES,
  canonicalizeServiceType,
  formatServiceTypeLabel,
  matchesServiceTypeFilter,
  serviceTypeEditPath,
  serviceTypesEqual,
  withCanonicalServiceType,
} from './service-type.ts';

describe('canonicalizeServiceType', () => {
  it('accepts the canonical kebab-case slugs', () => {
    for (const slug of SERVICE_TYPES) {
      assert.equal(canonicalizeServiceType(slug), slug);
    }
  });

  it('folds case, spaces, underscores, and camelCase into one slug', () => {
    assert.equal(canonicalizeServiceType('Moving'), 'moving');
    assert.equal(canonicalizeServiceType('MOVING'), 'moving');
    assert.equal(canonicalizeServiceType('  moving  '), 'moving');

    assert.equal(canonicalizeServiceType('furniture assembly'), 'furniture-assembly');
    assert.equal(canonicalizeServiceType('Furniture Assembly'), 'furniture-assembly');
    assert.equal(canonicalizeServiceType('furniture_assembly'), 'furniture-assembly');
    assert.equal(canonicalizeServiceType('furnitureAssembly'), 'furniture-assembly');
    assert.equal(canonicalizeServiceType('Furniture-Assembly'), 'furniture-assembly');

    assert.equal(canonicalizeServiceType('home improvement'), 'home-improvement');
    assert.equal(canonicalizeServiceType('homeImprovement'), 'home-improvement');
    assert.equal(canonicalizeServiceType('home_improvement'), 'home-improvement');

    assert.equal(canonicalizeServiceType('wall mounting'), 'wall-mounting');
    assert.equal(canonicalizeServiceType('WALL MOUNTING'), 'wall-mounting');
    assert.equal(canonicalizeServiceType('wall_mounting'), 'wall-mounting');
    assert.equal(canonicalizeServiceType('wallMounting'), 'wall-mounting');
    assert.equal(canonicalizeServiceType('Wall-Mounting'), 'wall-mounting');

    assert.equal(canonicalizeServiceType('customService'), 'custom-service');
    assert.equal(canonicalizeServiceType('custom service'), 'custom-service');
    assert.equal(canonicalizeServiceType('custom_service'), 'custom-service');
    assert.equal(canonicalizeServiceType('Custom-Service'), 'custom-service');
  });

  it('accepts known short and legacy aliases', () => {
    assert.equal(canonicalizeServiceType('furniture'), 'furniture-assembly');
    assert.equal(canonicalizeServiceType('home'), 'home-improvement');
    assert.equal(canonicalizeServiceType('wall'), 'wall-mounting');
    assert.equal(canonicalizeServiceType('custom'), 'custom-service');
    assert.equal(canonicalizeServiceType('customservice'), 'custom-service');
    assert.equal(canonicalizeServiceType('running errands'), 'custom-service');
    assert.equal(canonicalizeServiceType('running-errands'), 'custom-service');
    assert.equal(canonicalizeServiceType('runningErrands'), 'custom-service');
  });

  it('does not turn wall mounting into cleaning', () => {
    assert.equal(canonicalizeServiceType('wall-mounting'), 'wall-mounting');
    assert.equal(canonicalizeServiceType('wall mounting'), 'wall-mounting');
    assert.equal(canonicalizeServiceType('cleaning'), 'cleaning');
    assert.notEqual(canonicalizeServiceType('wall-mounting'), 'cleaning');
    assert.notEqual(canonicalizeServiceType('wall mounting'), canonicalizeServiceType('cleaning'));
  });

  it('returns null for empty or unknown values', () => {
    assert.equal(canonicalizeServiceType(null), null);
    assert.equal(canonicalizeServiceType(undefined), null);
    assert.equal(canonicalizeServiceType(''), null);
    assert.equal(canonicalizeServiceType('   '), null);
    assert.equal(canonicalizeServiceType('dog-walking'), null);
    assert.equal(canonicalizeServiceType('house cleaning'), null);
  });

  it('documents the product set and does not add categories', () => {
    assert.deepEqual(SERVICE_TYPES, [
      'moving',
      'cleaning',
      'furniture-assembly',
      'home-improvement',
      'wall-mounting',
      'custom-service',
    ]);
  });
});

describe('matchesServiceTypeFilter', () => {
  it('matches every canonical and aliased spelling to the same filter id', () => {
    const spellings = ['furniture-assembly', 'furniture assembly', 'furnitureAssembly', 'Furniture'];
    for (const spelling of spellings) {
      assert.equal(matchesServiceTypeFilter(spelling, 'furniture-assembly'), true);
      assert.equal(matchesServiceTypeFilter(spelling, 'cleaning'), false);
      assert.equal(matchesServiceTypeFilter(spelling, 'wall-mounting'), false);
    }
  });

  it('keeps wall mounting and cleaning on different filters', () => {
    assert.equal(matchesServiceTypeFilter('wall mounting', 'wall-mounting'), true);
    assert.equal(matchesServiceTypeFilter('wall-mounting', 'cleaning'), false);
    assert.equal(matchesServiceTypeFilter('cleaning', 'wall-mounting'), false);
    assert.equal(matchesServiceTypeFilter('cleaning', 'cleaning'), true);
  });

  it('treats all and empty filters as unrestricted', () => {
    assert.equal(matchesServiceTypeFilter('moving', 'all'), true);
    assert.equal(matchesServiceTypeFilter('customService', ''), true);
    assert.equal(matchesServiceTypeFilter(null, 'all'), true);
  });

  it('still understands the old short filter tokens', () => {
    assert.equal(matchesServiceTypeFilter('customService', 'custom'), true);
    assert.equal(matchesServiceTypeFilter('Moving', 'moving'), true);
    assert.equal(matchesServiceTypeFilter('home improvement', 'home'), true);
  });
});

describe('serviceTypeEditPath', () => {
  it('routes each known spelling to the matching composer', () => {
    assert.equal(serviceTypeEditPath('Moving'), '/(services)/moving');
    assert.equal(serviceTypeEditPath('cleaning'), '/(services)/cleaning');
    assert.equal(serviceTypeEditPath('furniture-assembly'), '/(services)/furniture-assembly');
    assert.equal(serviceTypeEditPath('furniture assembly'), '/(services)/furniture-assembly');
    assert.equal(serviceTypeEditPath('home-improvement'), '/(services)/home-improvement');
    assert.equal(serviceTypeEditPath('home improvement'), '/(services)/home-improvement');
    assert.equal(serviceTypeEditPath('wall-mounting'), '/(services)/wall-mounting');
    assert.equal(serviceTypeEditPath('wall mounting'), '/(services)/wall-mounting');
    assert.equal(serviceTypeEditPath('customService'), '/(services)/custom-service');
    assert.equal(serviceTypeEditPath('custom'), '/(services)/custom-service');
    assert.equal(serviceTypeEditPath('running errands'), '/(services)/custom-service');
  });

  it('falls back to custom-service only when the type is unknown', () => {
    assert.equal(serviceTypeEditPath(null), '/(services)/custom-service');
    assert.equal(serviceTypeEditPath('not-a-service'), '/(services)/custom-service');
    assert.notEqual(serviceTypeEditPath('wall mounting'), '/(services)/cleaning');
    assert.notEqual(serviceTypeEditPath('furniture-assembly'), '/(services)/custom-service');
  });
});

describe('formatServiceTypeLabel', () => {
  it('uses one display label per canonical type', () => {
    assert.equal(formatServiceTypeLabel('Moving'), 'Moving');
    assert.equal(formatServiceTypeLabel('cleaning'), 'Cleaning');
    assert.equal(formatServiceTypeLabel('furniture-assembly'), 'Furniture Assembly');
    assert.equal(formatServiceTypeLabel('home-improvement'), 'Home Improvement');
    assert.equal(formatServiceTypeLabel('wall mounting'), 'Wall Mounting');
    assert.equal(formatServiceTypeLabel('customService'), 'Custom Service');
  });

  it('title-cases unknown values and uses the fallback when empty', () => {
    assert.equal(formatServiceTypeLabel(null), 'Service');
    assert.equal(formatServiceTypeLabel('  '), 'Service');
    assert.equal(formatServiceTypeLabel('dog walking'), 'Dog Walking');
    assert.equal(formatServiceTypeLabel(null, ''), '');
  });
});

describe('serviceTypesEqual and withCanonicalServiceType', () => {
  it('treats aliases as the same type and refuses wall/cleaning equality', () => {
    assert.equal(serviceTypesEqual('Moving', 'moving'), true);
    assert.equal(serviceTypesEqual('customService', 'custom-service'), true);
    assert.equal(serviceTypesEqual('wall mounting', 'cleaning'), false);
    assert.equal(serviceTypesEqual('dog-walking', 'dog walking'), false);
  });

  it('rewrites known aliases on write and leaves unknown values untouched', () => {
    assert.deepEqual(withCanonicalServiceType({ service_type: 'Moving', service_id: '1' }), {
      service_type: 'moving',
      service_id: '1',
    });
    assert.deepEqual(withCanonicalServiceType({ service_type: 'customService' }), {
      service_type: 'custom-service',
    });
    assert.deepEqual(withCanonicalServiceType({ service_type: 'wall mounting' }), {
      service_type: 'wall-mounting',
    });
    const unknown = { service_type: 'dog-walking' };
    assert.equal(withCanonicalServiceType(unknown), unknown);
    assert.deepEqual(withCanonicalServiceType({ service_type: 'cleaning' }), {
      service_type: 'cleaning',
    });
  });
});
