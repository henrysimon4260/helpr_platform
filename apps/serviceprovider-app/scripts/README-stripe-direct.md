# Direct Stripe Account Deletion

This script directly deletes Stripe connected accounts using the Stripe API, without involving Supabase.

## ⚠️ **DANGER**

This script permanently deletes Stripe connected accounts. This action cannot be undone and will remove all associated payment capabilities.

## Prerequisites

1. **Install Stripe SDK**: `npm install stripe`
2. **Stripe Secret Key**: You need your Stripe secret key (starts with `sk_test_` or `sk_live_`)

## Usage

```bash
# Set your Stripe secret key
export STRIPE_SECRET_KEY="sk_test_your_secret_key_here"

# Run the script
node scripts/delete-stripe-account.js
```

## What It Does

1. **Prompts for Account ID**: Asks you to enter the Stripe connected account ID (e.g., `acct_1SQwbY2L9MPiMxf1`)
2. **Validates Account**: Checks if the account exists and shows details
3. **Double Confirmation**: Requires you to type "DELETE" and then "YES, DELETE THIS ACCOUNT"
4. **Deletes Account**: Permanently removes the account from Stripe

## Safety Features

- **Account Verification**: Shows account details before deletion
- **Double Confirmation**: Two-step confirmation process
- **Validation**: Checks account ID format and existence
- **Detailed Logging**: Shows exactly what happens

## Example Output

```
🗑️  Stripe Connected Account Deletion Tool
==========================================

Enter the Stripe connected account ID to delete (e.g., acct_1SQwbY2L9MPiMxf1): acct_1SQwbY2L9MPiMxf1

🎯 Target Account ID: acct_1SQwbY2L9MPiMxf1
⚠️  WARNING: This will permanently delete the Stripe connected account!
   This action cannot be undone.
   The account will be closed and all associated data will be removed.

Are you absolutely sure you want to delete this account? Type "DELETE" to confirm: DELETE

🔄 Initializing Stripe connection...
🔍 Checking if account exists...
✅ Account found:
   - ID: acct_1SQwbY2L9MPiMxf1
   - Email: provider@example.com
   - Business Type: individual
   - Created: 12/15/2024
   - Charges Enabled: Yes
   - Payouts Enabled: No

This is your LAST CHANCE. Type "YES, DELETE THIS ACCOUNT" to permanently delete it: YES, DELETE THIS ACCOUNT

🔄 Deleting Stripe connected account...
✅ SUCCESS: Stripe connected account has been deleted!
   - Account ID: acct_1SQwbY2L9MPiMxf1
   - Deleted: true
   - Object Type: account

🎉 Account deletion completed successfully!
```

## Error Handling

The script handles common errors:
- Invalid account IDs
- Non-existent accounts
- Permission issues
- Network problems

## Environment Variables

- `STRIPE_SECRET_KEY`: Your Stripe secret key (required)

## Important Notes

- This script only deletes from Stripe, not from your database
- Make sure you've already cleaned up your database before running this
- Keep backups of important account information before deletion
- Test with a test Stripe account first if possible


