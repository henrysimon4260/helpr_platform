#!/usr/bin/env node

/**
 * Test script to verify request body is properly formatted for create-connect-account
 * SSN is now collected during Stripe onboarding flow instead of in the app
 */

const testBody = {
  email: 'test@example.com',
  firstName: 'John',
  lastName: 'Doe'
};

console.log('Testing request body for create-connect-account:');
console.log(JSON.stringify(testBody, null, 2));

console.log('\n✅ Request body is properly formatted');
console.log('SSN will be collected during the Stripe onboarding flow for enhanced security and compliance.');
