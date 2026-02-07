#!/usr/bin/env node

/**
 * Script to delete a Stripe connected account directly
 * This is a destructive operation - use with caution!
 *
 * Usage: node scripts/delete-stripe-account.js
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

async function deleteStripeAccount() {
  try {
    console.log('🗑️  Stripe Connected Account Deletion Tool');
    console.log('==========================================\n');

    // Get Stripe secret key
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      console.error('❌ Error: STRIPE_SECRET_KEY environment variable not set');
      console.log('Please set your Stripe secret key:');
      console.log('export STRIPE_SECRET_KEY="sk_test_..."');
      rl.close();
      return;
    }

    // Get account ID from user
    const accountId = await question('Enter the Stripe connected account ID to delete (e.g., acct_1SQwbY2L9MPiMxf1): ');

    if (!accountId || !accountId.trim()) {
      console.log('❌ No account ID provided. Exiting...');
      rl.close();
      return;
    }

    const trimmedAccountId = accountId.trim();

    // Validate account ID format
    if (!trimmedAccountId.startsWith('acct_')) {
      console.log('❌ Invalid account ID format. Account IDs should start with "acct_"');
      rl.close();
      return;
    }

    console.log(`\n🎯 Target Account ID: ${trimmedAccountId}`);
    console.log('⚠️  WARNING: This will permanently delete the Stripe connected account!');
    console.log('   This action cannot be undone.');
    console.log('   The account will be closed and all associated data will be removed.\n');

    // Get confirmation
    const confirmation = await question('Are you absolutely sure you want to delete this account? Type "DELETE" to confirm: ');

    if (confirmation !== 'DELETE') {
      console.log('❌ Deletion cancelled. You must type "DELETE" exactly to proceed.');
      rl.close();
      return;
    }

    console.log('\n🔄 Initializing Stripe connection...');

    // Dynamically import Stripe to avoid requiring it if not installed
    let stripe;
    try {
      const stripeModule = await import('stripe');
      stripe = new stripeModule.default(stripeSecretKey);
    } catch (error) {
      console.error('❌ Failed to load Stripe SDK. Please install it: npm install stripe');
      rl.close();
      return;
    }

    console.log('🔍 Checking if account exists...');

    // First, let's try to retrieve the account to verify it exists
    try {
      const account = await stripe.accounts.retrieve(trimmedAccountId);
      console.log('✅ Account found:');
      console.log(`   - ID: ${account.id}`);
      console.log(`   - Email: ${account.email || 'Not provided'}`);
      console.log(`   - Business Type: ${account.business_type || 'Not specified'}`);
      console.log(`   - Created: ${new Date(account.created * 1000).toLocaleDateString()}`);
      console.log(`   - Charges Enabled: ${account.charges_enabled ? 'Yes' : 'No'}`);
      console.log(`   - Payouts Enabled: ${account.payouts_enabled ? 'Yes' : 'No'}\n`);
    } catch (error) {
      if (error.type === 'StripeInvalidRequestError' && error.code === 'account_invalid') {
        console.log('❌ Account not found or invalid account ID');
        rl.close();
        return;
      }
      throw error;
    }

    // Final confirmation with account details shown
    const finalConfirmation = await question('This is your LAST CHANCE. Type "YES, DELETE THIS ACCOUNT" to permanently delete it: ');

    if (finalConfirmation !== 'YES, DELETE THIS ACCOUNT') {
      console.log('❌ Deletion cancelled.');
      rl.close();
      return;
    }

    console.log('\n🔄 Deleting Stripe connected account...');

    // Delete the account
    const deletedAccount = await stripe.accounts.del(trimmedAccountId);

    console.log('✅ SUCCESS: Stripe connected account has been deleted!');
    console.log(`   - Account ID: ${deletedAccount.id}`);
    console.log(`   - Deleted: ${deletedAccount.deleted ? 'Yes' : 'No'}`);
    console.log(`   - Object Type: ${deletedAccount.object}`);

    console.log('\n🎉 Account deletion completed successfully!');

  } catch (error) {
    console.error('\n❌ ERROR: Failed to delete Stripe account');
    console.error('Error details:', error.message);

    if (error.type) {
      console.error('Error type:', error.type);
    }

    if (error.code) {
      console.error('Error code:', error.code);
    }

    console.log('\n🔍 Common issues:');
    console.log('- Make sure STRIPE_SECRET_KEY is correct');
    console.log('- Verify the account ID is valid');
    console.log('- Check if the account is already deleted');
    console.log('- Ensure you have permission to delete this account');
  } finally {
    rl.close();
  }
}

// Check if stripe is installed
async function checkStripeInstallation() {
  try {
    await import('stripe');
    return true;
  } catch (error) {
    return false;
  }
}

// Main execution
async function main() {
  const stripeInstalled = await checkStripeInstallation();

  if (!stripeInstalled) {
    console.log('📦 Installing Stripe SDK...');
    console.log('Run: npm install stripe');
    console.log('Then run this script again.\n');
    return;
  }

  await deleteStripeAccount();
}

main();


