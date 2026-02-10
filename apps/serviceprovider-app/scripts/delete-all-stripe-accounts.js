#!/usr/bin/env node

/**
 * Script to delete ALL existing Stripe connected accounts
 * This is a destructive operation - use with extreme caution!
 *
 * Usage: node scripts/delete-all-stripe-accounts.js
 *
 * The script requires the STRIPE_SECRET_KEY environment variable.
 *
 * Example:
 * export STRIPE_SECRET_KEY="your_stripe_secret_key"
 */

const readline = require('readline');

const createPrompt = () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise((resolve) => {
    rl.question(prompt, resolve);
  });

  return { rl, question };
};

// Helper function to delay execution
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function deleteAllStripeAccounts() {
  try {
    console.log('🗑️  Bulk Stripe Connected Account Deletion Tool');
    console.log('===============================================\n');

    // Get environment variables
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const supabaseUrl = process.env.SUPABASE_URL || 'https://hecikcopbdhhiilhgmrd.supabase.co';
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlY2lrY29wYmRoaGlpbGhnbXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NDMwNDksImV4cCI6MjA3NDMxOTA0OX0.bns9CFQEU-OtL9jRVqcqqKWN5xaFkEqgWn0UzLaO8Oo';

    if (!stripeSecretKey) {
      console.error('❌ Error: No Stripe secret key available');
      console.log('Please set the STRIPE_SECRET_KEY environment variable or update the script with your key.');
      return;
    }

    console.log('🔑 Using Stripe key from environment variable');

    console.log('🔄 Initializing connections...');

    // Initialize Supabase client
    let supabase;
    try {
      const { createClient } = await import('@supabase/supabase-js');
      supabase = createClient(supabaseUrl, supabaseAnonKey);
    } catch (error) {
      console.error('❌ Failed to load Supabase SDK. Please install it: npm install @supabase/supabase-js');
      return;
    }

    // Initialize Stripe client
    let stripe;
    try {
      const stripeModule = await import('stripe');
      stripe = new stripeModule.default(stripeSecretKey);
    } catch (error) {
      console.error('❌ Failed to load Stripe SDK. Please install it: npm install stripe');
      return;
    }

    console.log('🔍 Fetching all Stripe account IDs from database...');

    // Get all stripe_account_id values from service_provider table
    const { data: providers, error: dbError } = await supabase
      .from('service_provider')
      .select('service_provider_id, stripe_account_id, email')
      .not('stripe_account_id', 'is', null);

    if (dbError) {
      console.error('❌ Database error:', dbError.message);
      return;
    }

    if (!providers || providers.length === 0) {
      console.log('✅ No Stripe accounts found in database. Nothing to delete.');
      return;
    }

    console.log(`📊 Found ${providers.length} Stripe accounts in database:`);
    providers.forEach((provider, index) => {
      console.log(`   ${index + 1}. ID: ${provider.stripe_account_id}, Email: ${provider.email || 'N/A'}`);
    });

    console.log('\n⚠️  WARNING: This will permanently delete ALL listed Stripe connected accounts!');
    console.log('   This action cannot be undone.');
    console.log('   All accounts will be closed and all associated data will be removed.');
    console.log('   Users will need to create new accounts to receive payments.\n');

    const forceDelete = process.argv.includes('--force') || process.env.STRIPE_DELETE_ALL_FORCE === 'true';
    const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    if (!forceDelete && !isInteractive) {
      console.error('❌ Cannot prompt for confirmation in a non-interactive shell.');
      console.error('   Re-run with --force or STRIPE_DELETE_ALL_FORCE=true to proceed.');
      return;
    }

    let confirmation = '';
    let finalConfirmation = '';

    if (!forceDelete) {
      const { rl, question } = createPrompt();
      try {
        // Get confirmation
        confirmation = await question('Are you absolutely sure you want to delete ALL accounts? Type "DELETE ALL" to confirm: ');

        if (confirmation !== 'DELETE ALL') {
          console.log('❌ Bulk deletion cancelled. You must type "DELETE ALL" exactly to proceed.');
          return;
        }

        // Final confirmation
        finalConfirmation = await question('This is your LAST CHANCE. Type "YES, DELETE ALL ACCOUNTS" to permanently delete them: ');
      } finally {
        rl.close();
      }

      if (finalConfirmation !== 'YES, DELETE ALL ACCOUNTS') {
        console.log('❌ Bulk deletion cancelled.');
        return;
      }
    }

    console.log('\n🔄 Starting bulk deletion process...');

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Process each account
    for (let i = 0; i < providers.length; i++) {
      const provider = providers[i];
      const accountId = provider.stripe_account_id;

      console.log(`\n[${i + 1}/${providers.length}] Processing account: ${accountId} (${provider.email || 'N/A'})`);

      try {
        // Verify account exists before deleting
        try {
          const account = await stripe.accounts.retrieve(accountId);
          console.log(`   ✅ Account exists - Email: ${account.email || 'N/A'}, Created: ${new Date(account.created * 1000).toLocaleDateString()}`);
        } catch (verifyError) {
          if (verifyError.type === 'StripeInvalidRequestError' && verifyError.code === 'account_invalid') {
            console.log(`   ⚠️  Account ${accountId} not found in Stripe (may already be deleted)`);
            // Update database to remove the invalid account ID
            const { error: updateError } = await supabase
              .from('service_provider')
              .update({ stripe_account_id: null })
              .eq('service_provider_id', provider.service_provider_id);

            if (updateError) {
              console.log(`   ❌ Failed to update database for provider ${provider.service_provider_id}: ${updateError.message}`);
            } else {
              console.log(`   ✅ Updated database to remove invalid account ID`);
            }
            continue;
          }
          throw verifyError;
        }

        // Delete the account
        console.log(`   🗑️  Deleting account...`);
        const deletedAccount = await stripe.accounts.del(accountId);
        console.log(`   ✅ SUCCESS: Account ${deletedAccount.id} deleted`);

        // Update database to remove the account ID
        const { error: updateError } = await supabase
          .from('service_provider')
          .update({ stripe_account_id: null })
          .eq('service_provider_id', provider.service_provider_id);

        if (updateError) {
          console.log(`   ❌ Failed to update database: ${updateError.message}`);
          errors.push(`Database update failed for ${provider.service_provider_id}: ${updateError.message}`);
        } else {
          console.log(`   ✅ Database updated to remove account ID`);
        }

        successCount++;

        // Add small delay to avoid rate limiting
        if (i < providers.length - 1) {
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

    console.log('\n🎉 Bulk deletion process completed!');
    console.log(`   ✅ Successfully deleted: ${successCount} accounts`);
    console.log(`   ❌ Failed to delete: ${errorCount} accounts`);

    if (errors.length > 0) {
      console.log('\n📋 Error details:');
      errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }

    console.log('\n🔍 Next steps:');
    console.log('- Users will need to create new Stripe Connect accounts');
    console.log('- Consider running a database cleanup to remove null stripe_account_id records if needed');

  } catch (error) {
    console.error('\n❌ CRITICAL ERROR: Bulk deletion failed');
    console.error('Error details:', error.message);

    if (error.type) {
      console.error('Error type:', error.type);
    }

    if (error.code) {
      console.error('Error code:', error.code);
    }
  } finally {
    // No-op: readline interface is created only when prompting.
  }
}

// Check if required packages are installed
async function checkDependencies() {
  try {
    await import('@supabase/supabase-js');
    await import('stripe');
    return true;
  } catch (error) {
    return false;
  }
}

// Main execution
async function main() {
  const dependenciesInstalled = await checkDependencies();

  if (!dependenciesInstalled) {
    console.log('📦 Installing required dependencies...');
    console.log('Run: npm install @supabase/supabase-js stripe');
    console.log('Then run this script again.\n');
    return;
  }

  await deleteAllStripeAccounts();
}

main();
