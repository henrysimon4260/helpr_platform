#!/usr/bin/env node

/**
 * Test script to simulate the signup flow and identify where the error occurs
 */

const testSignupData = {
  email: 'test@example.com',
  password: 'password123',
  firstName: 'John',
  lastName: 'Doe',
  phone: '555-123-4567',
  idDocumentType: 'drivers_license',
  idDocumentNumber: 'D1234567',
  idDocumentState: 'CA'
};

async function testSignupFlow() {
  console.log('🧪 Testing signup flow...\n');

  try {
    // Step 1: Test Stripe account creation
    console.log('Step 1: Testing Stripe account creation...');
    const supabaseUrl = 'https://hecikcopbdhhiilhgmrd.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlY2lrY29wYmRoaGlpbGhnbXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NDMwNDksImV4cCI6MjA3NDMxOTA0OX0.bns9CFQEU-OtL9jRVqcqqKWN5xaFkEqgWn0UzLaO8Oo';

    const functionUrl = `${supabaseUrl}/functions/v1/create-connect-account`;
    const stripeResponse = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({
        email: testSignupData.email,
        firstName: testSignupData.firstName,
        lastName: testSignupData.lastName,
        first_name: testSignupData.firstName,
        last_name: testSignupData.lastName,
        id_document_type: testSignupData.idDocumentType,
        id_document_number: testSignupData.idDocumentNumber,
        id_document_state: testSignupData.idDocumentState,
      }),
    });

    if (!stripeResponse.ok) {
      const errorText = await stripeResponse.text();
      console.error('❌ Stripe account creation failed:', stripeResponse.status, errorText);
      return;
    }

    const stripeData = await stripeResponse.json();
    console.log('✅ Stripe account created successfully:', stripeData.accountId);

    // Step 2: Test Supabase auth signup (simulated)
    console.log('\nStep 2: Supabase auth signup would happen here...');
    console.log('✅ Auth signup simulation complete');

    console.log('\n🎉 Signup flow test completed successfully!');

  } catch (error) {
    console.error('❌ Signup flow test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testSignupFlow();




