#!/usr/bin/env node

/**
 * Script to delete ALL Stripe connected accounts directly from Stripe
 * This is a destructive operation - use with extreme caution!
 * This deletes accounts regardless of database state (for orphaned accounts)
 *
 * Usage: node scripts/delete-all-stripe-accounts-direct.js
 */

const readline = require('readline');

// Initialize readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to prompt user
function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

// Helper function to delay execution
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function deleteAllStripeAccounts() {
  try {
    console.log('🗑️  Direct Stripe Connected Account Deletion Tool');
    console.log('==============================================\n');

    // Get Stripe secret key
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      console.error('❌ Error: STRIPE_SECRET_KEY environment variable is required');
      rl.close();
      return;
    }

    console.log('🔑 Using Stripe key from environment variable');

    console.log('\n🔄 Initializing Stripe connection...');

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

    // List all connected accounts (standard and express)
    const accounts = await stripe.accounts.list({
      limit: 100
    });

    // Filter out the platform's own account (if any) - typically doesn't have business_type
    const connectedAccounts = accounts.data.filter(account => account.business_type);

    if (connectedAccounts.length === 0) {
      console.log('✅ No Stripe connected accounts found.');
      rl.close();
      return;
    }

    console.log(`📊 Found ${connectedAccounts.length} Stripe connected accounts:\n`);

    connectedAccounts.forEach((account, index) => {
      console.log(`${index + 1}. Account ID: ${account.id}`);
      console.log(`   Email: ${account.email || 'Not provided'}`);
      console.log(`   Type: ${account.type}`);
      console.log(`   Business Type: ${account.business_type}`);
      console.log(`   Created: ${new Date(account.created * 1000).toLocaleDateString()}`);
      console.log(`   Charges Enabled: ${account.charges_enabled ? 'Yes' : 'No'}`);
      console.log(`   Payouts Enabled: ${account.payouts_enabled ? 'Yes' : 'No'}\n`);
    });

    console.log('⚠️  WARNING: This will permanently delete ALL listed Stripe connected accounts!');
    console.log('   This action cannot be undone.');
    console.log('   All accounts will be closed and all associated data will be removed.');
    console.log('   Users will need to create new accounts to receive payments.\n');

    // Auto-confirm for non-interactive mode (set SKIP_CONFIRMATIONS=true)
    const skipConfirmations = process.env.SKIP_CONFIRMATIONS === 'true';

    if (!skipConfirmations) {
      // Get confirmation
      const confirmation = await question('Are you absolutely sure you want to delete ALL connected accounts? Type "DELETE ALL CONNECTED" to confirm: ');

      if (confirmation !== 'DELETE ALL CONNECTED') {
        console.log('❌ Deletion cancelled. You must type "DELETE ALL CONNECTED" exactly to proceed.');
        rl.close();
        return;
      }

      // Final confirmation
      const finalConfirmation = await question('This is your LAST CHANCE. Type "YES, DELETE ALL CONNECTED ACCOUNTS" to permanently delete them: ');

      if (finalConfirmation !== 'YES, DELETE ALL CONNECTED ACCOUNTS') {
        console.log('❌ Deletion cancelled.');
        rl.close();
        return;
      }
    } else {
      console.log('🚨 SKIP_CONFIRMATIONS=true - Auto-confirming deletion...');
    }

    console.log('\n🔄 Starting bulk deletion process...\n');

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Process each account
    for (let i = 0; i < connectedAccounts.length; i++) {
      const account = connectedAccounts[i];
      const accountId = account.id;

      console.log(`[${i + 1}/${connectedAccounts.length}] Processing account: ${accountId} (${account.email || 'N/A'})`);

      try {
        // Delete the account
        console.log(`   🗑️  Deleting account...`);
        const deletedAccount = await stripe.accounts.del(accountId);
        console.log(`   ✅ SUCCESS: Account ${deletedAccount.id} deleted`);

        successCount++;

        // Add small delay to avoid rate limiting
        if (i < connectedAccounts.length - 1) {
          await delay(1000);
        }

      } catch (error) {
        console.error(`   ❌ ERROR deleting account ${accountId}: ${error.message}`);
        if (error.type) {
          console.error(`       Type: ${error.type}`);
        }
        if (error.code) {
          console.error(`       Code: ${error.code}`);
        }
        errors.push(`Account ${accountId}: ${error.message}`);
        errorCount++;
      }
    }

    console.log('\n🎉 Direct deletion process completed!');
    console.log(`   ✅ Successfully deleted: ${successCount} accounts`);
    console.log(`   ❌ Failed to delete: ${errorCount} accounts`);

    if (errors.length > 0) {
      console.log('\n📋 Error details:');
      errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }

    console.log('\n🔍 Next steps:');
    console.log('- Users can now create new Stripe Connect accounts');
    console.log('- The duplicate prevention system will prevent multiple accounts per email');

  } catch (error) {
    console.error('\n❌ CRITICAL ERROR: Direct deletion failed');
    console.error('Error details:', error.message);

    if (error.type) {
      console.error('Error type:', error.type);
    }

    if (error.code) {
      console.error('Error code:', error.code);
    }
  } finally {
    rl.close();
  }
}

// Main execution
async function main() {
  await deleteAllStripeAccounts();
}

main();