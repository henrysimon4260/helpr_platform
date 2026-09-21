import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  firstSearchParam,
  parseEditServicePayload,
  resolveServiceIdForSubmit,
} from './moving.edit.ts';

describe('moving edit service id', () => {
  it('reads the first search param from a string or array', () => {
    assert.equal(firstSearchParam('  abc  '), 'abc');
    assert.equal(firstSearchParam(['svc-1', 'svc-2']), 'svc-1');
    assert.equal(firstSearchParam('   '), null);
    assert.equal(firstSearchParam(undefined), null);
  });

  it('parses an encoded edit payload and a raw JSON payload', () => {
    const payload = {
      service_id: 'svc-existing',
      start_location: '1 Main St',
      end_location: '2 Oak Ave',
      description: 'Move the couch',
      price: 240,
    };

    const encoded = parseEditServicePayload(encodeURIComponent(JSON.stringify(payload)));
    const raw = parseEditServicePayload(JSON.stringify(payload));

    assert.equal(encoded?.service_id, 'svc-existing');
    assert.equal(encoded?.start_location, '1 Main St');
    assert.equal(raw?.end_location, '2 Oak Ave');
    assert.equal(parseEditServicePayload('not-json'), null);
    assert.equal(parseEditServicePayload(JSON.stringify({ description: 'missing id' })), null);
  });

  it('keeps the existing service id when editing', () => {
    let created = 0;
    const resolved = resolveServiceIdForSubmit('svc-existing', () => {
      created += 1;
      return 'svc-new';
    });

    assert.deepEqual(resolved, { serviceId: 'svc-existing', isEditing: true });
    assert.equal(created, 0);
  });

  it('mints a service id only for a new job', () => {
    const resolved = resolveServiceIdForSubmit(null, () => 'svc-new');
    assert.deepEqual(resolved, { serviceId: 'svc-new', isEditing: false });
  });
});
