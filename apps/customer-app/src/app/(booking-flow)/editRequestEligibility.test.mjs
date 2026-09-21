import { readFileSync } from 'node:fs';
import { canEditRequest } from './editRequestEligibility.ts';

const openStatuses = ['finding_pros', 'pending', 'scheduled', 'select_service_provider'];
const closedStatuses = [
  'confirmed',
  'helpr_otw',
  'in_progress',
  'completed',
  'cancelled',
  'on_the_way',
  '',
];

let passed = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
  passed += 1;
}

for (const status of openStatuses) {
  assert(canEditRequest({ status, service_provider_id: null }), `${status} with no provider should be editable`);
  assert(canEditRequest({ status, service_provider_id: undefined }), `${status} with missing provider should be editable`);
  assert(canEditRequest({ status, service_provider_id: '' }), `${status} with blank provider should be editable`);
  assert(canEditRequest({ status, service_provider_id: '   ' }), `${status} with whitespace provider should be editable`);
  assert(
    canEditRequest({ status: status.toUpperCase(), service_provider_id: null }),
    `${status} should be editable regardless of status casing`,
  );
  assert(
    !canEditRequest({ status, service_provider_id: 'pro-1' }),
    `${status} with a provider id should be blocked`,
  );
}

for (const status of closedStatuses) {
  assert(!canEditRequest({ status, service_provider_id: null }), `${JSON.stringify(status)} without a provider should be blocked`);
  assert(!canEditRequest({ status, service_provider_id: 'pro-1' }), `${JSON.stringify(status)} with a provider should be blocked`);
}

assert(!canEditRequest({ status: null, service_provider_id: null }), 'null status should be blocked');
assert(!canEditRequest({ status: '  Confirmed  ', service_provider_id: null }), 'padded confirmed should be blocked');
assert(canEditRequest({ status: '  Finding_Pros  ', service_provider_id: null }), 'padded finding_pros should be editable');
assert(!canEditRequest({ status: 'helpr_otw', service_provider_id: null }), 'helpr_otw should be blocked');

const bookedServices = readFileSync(new URL('./booked-services.tsx', import.meta.url), 'utf8');
assert(bookedServices.includes('const canEdit = canEditRequest(service);'), 'booked list must hide Edit Request from the same rule');
assert(bookedServices.includes('{canEdit ? ('), 'Edit Request button must be conditional');
const handlerStart = bookedServices.indexOf('const handleEditRequest');
const handler = bookedServices.slice(handlerStart, bookedServices.indexOf('const updateServiceRow'));
const guardAt = handler.indexOf('if (!canEditRequest(service))');
const pushAt = handler.indexOf('router.push');
assert(guardAt !== -1 && pushAt !== -1 && guardAt < pushAt, 'edit handler must refuse before navigation');

console.log(`edit request eligibility: ${passed} checks ok`);
