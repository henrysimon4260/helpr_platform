#!/usr/bin/env node

/**
 * Test script to directly test the create-connect-account edge function
 */

const testData = {
  email: 'test@example.com',
  firstName: 'John',
  lastName: 'Doe',
  id_document_type: 'drivers_license',
  id_document_number: 'D1234567',
  id_document_state: 'CA'
};

async function testEdgeFunction() {
  try {
    console.log('🧪 Testing create-connect-account edge function...');
    console.log('Request body:', JSON.stringify(testData, null, 2));

    const response = await fetch('https://hecikcopbdhhiilhgmrd.supabase.co/functions/v1/create-connect-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlY2lrY29wYmRoaGlpbGhnbXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NDMwNDksImV4cCI6MjA3NDMxOTA0OX0.bns9CFQEU-OtL9jRVqcqqKWN5xaFkEqgWn0UzLaO8Oo'
      },
      body: JSON.stringify(testData)
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log('Response body:', responseText);

    if (response.ok) {
      console.log('✅ Function call successful');
    } else {
      console.log('❌ Function call failed');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testEdgeFunction();
