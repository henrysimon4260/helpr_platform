# helpr
a tasking app that determines a flat rate and provides a service provider to customer matching service

# install and run
run pnpm install from customer-app and service-provider directories
run npx expo run:ios (may need to rerun if there are port conflicts)

# Open Issues

- add functionality for all job types after moving is complete
- ratings flow
- add ratings to request card
- cancellation flow at all stages including warnings
- flow for editing request after job has already been accepted (send request to helpr for changes)
- estimated start and finish time flow (add to service details)
- change default popups to stylized and make new popups where needed (check each step in job flow to see if popup is needed)
- menuButton redo for serviceprovider-app replace booked services with 'in progress'
- change border for containers to match dropdown border 
- are you sure you want to cancel button and are you sure you want to cancel request button
- switch cancel button and select a pro / add cancel to edit request text after job has been confirmed
- finish past services page
- filters for landing page in serviceprovider app 
- delete account functionality for both apps
- safe area / tap to close on all keyboard inputs
- fix glitchy text (try on device first to see if this is a simulator-only issue)
- change verification to phone instead of email and add autofill
- continue w google/apple buttons on login (add phone num for that)
- make everything compatible across different devices
- no styles inline
- sep style file?
- banner/home screen/ etc notification flow 
- make sure supabase can handle requests
- reviews flow for app store
- messaging between customer and service provider flow
- build customer support chatbot with openAI integration
- payment method / direct deposit flow
- determine pricing strategy for services vs competitors
- background check / auth flow for serviceprovider app200 gre

production checklist

- RLS on sql table
- website with qr codes
- dedicated email for help and verification emails
- financial model w 6 month projections
- remove logs?
- API keys restricted






