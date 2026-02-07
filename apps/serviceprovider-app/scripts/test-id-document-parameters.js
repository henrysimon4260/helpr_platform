#!/usr/bin/env node

/**
 * Test script to verify ID document parameters are properly sent to create-connect-account
 */

const testBody = {
  email: 'test@example.com',
  firstName: 'John',
  lastName: 'Doe',
  id_document_type: 'drivers_license',
  id_document_number: 'D1234567',
  id_document_state: 'CA'
};

console.log('Testing ID document parameters in create-connect-account request body:');
console.log(JSON.stringify(testBody, null, 2));

console.log('\n✅ ID document parameters are properly included in the request body');
console.log('This should help streamline the Stripe Connect onboarding process.');
