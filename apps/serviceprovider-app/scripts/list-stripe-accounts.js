#!/usr/bin/env node

/**
 * Script to list all Stripe connected accounts (Express accounts)
 * This helps identify accounts that need to be cleaned up
 *
 * Usage: node scripts/list-stripe-accounts.js
 */

const readline = require('readline');

// Initialize readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function listStripeAccounts() {
  try {
    console.log('📋 Stripe Connected Accounts Listing Tool');
    console.log('=========================================\n');

    // Get Stripe secret key
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      console.error('❌ Error: STRIPE_SECRET_KEY environment variable is required');
      rl.close();
      return;
    }

    console.log('🔄 Initializing Stripe connection...');

    // Initialize Stripe client
    let stripe;
    try {
      const stripeModule = await import('stripe');
      stripe = new stripeModule.default(stripeSecretKey);
    } catch (error) {
      console.error('❌ Failed to load Stripe SDK. Please install it: npm install stripe');
      rl.close();
      return;
    }

    console.log('🔍 Fetching all Stripe connected accounts...\n');

    try {
      // List all connected accounts (limit to 100 for safety)
      const accounts = await stripe.accounts.list({
        limit: 100
      });

      // Filter for Express accounts only
      const expressAccounts = accounts.data.filter(account => account.type === 'express');

      if (expressAccounts.length === 0) {
        console.log('✅ No Stripe Express accounts found.');
        rl.close();
        return;
      }

      console.log(`📊 Found ${expressAccounts.length} Stripe Express accounts:\n`);

      expressAccounts.forEach((account, index) => {
        console.log(`${index + 1}. Account ID: ${account.id}`);
        console.log(`   Email: ${account.email || 'Not provided'}`);
        console.log(`   Business Type: ${account.business_type || 'Not specified'}`);
        console.log(`   Created: ${new Date(account.created * 1000).toLocaleDateString()}`);
        console.log(`   Charges Enabled: ${account.charges_enabled ? '✅ Yes' : '❌ No'}`);
        console.log(`   Payouts Enabled: ${account.payouts_enabled ? '✅ Yes' : '❌ No'}`);
        console.log(`   Requirements: ${account.requirements ? (account.requirements.currently_due.length > 0 ? '⚠️  Has due requirements' : '✅ Complete') : 'Unknown'}`);
        console.log('');
      });

      console.log('💡 Actions:');
      console.log('- To delete these accounts, run: node scripts/delete-all-stripe-accounts.js');
      console.log('- To delete specific accounts, use: node scripts/delete-stripe-account.js');

    } catch (error) {
      console.error('❌ Error fetching accounts:', error.message);
      if (error.type) {
        console.error('Error type:', error.type);
      }
    }

  } catch (error) {
    console.error('❌ CRITICAL ERROR:', error.message);
  } finally {
    rl.close();
  }
}

// Main execution
async function main() {
  await listStripeAccounts();
}

main();
