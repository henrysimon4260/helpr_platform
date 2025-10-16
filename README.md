# helpr
a tasking app that determines a flat rate and provides a service provider to customer matching service

# install and run
run pnpm install from customer-app and service-provider directories
run npx expo run:ios (may need to rerun if there are port conflicts)


# Open Issues

- ratings flow
- cancellation flow
- flow for editing request after job has already been accepted (send request to helpr)
- autofill flow
- change default popups to stylized and make new popups where needed (check each step in job flow to see if popup is needed)
- decide on an asap job scheduling flow
- notification flow 
- estimated start and finish time flow
- finish past services page
- demand login when scheduling if user not logged in
- continue w google/apple buttons on login
- add profile picture to request card
- add ratings to request card
- fix glitchy text (check binary test first to see if this is a simulator-only issue)
- ask to reschedule if no helpr found within 3 hrs of job and again when job time hits
- voice mode / follow-up prompts if certain things are not answered for moving and for other service types. 
- check if account already exists flow
- demand specific address in location search
- geofencing for maps 
- add service provider profile picture once service confirmed (remove job confirmed banner?)
- if service is scheduled same day, needs to be at least 2 hours out
- resize moving banner post-confirmation
- add flow for canceling if helpr is already on the way
- reviews flow
- add service date and time to service details page
- menuButton redo w/ routing redo: replace booked services with 'in progress'
- add past services page 
- add profile picture to profiles
- add ratings to profile
- filters for landing page
- add job type and location(s) to full description page
- check if account already exists flow 
- are you sure you want to cancel button and are you sure you want to cancel request button
- show current lowest bid for jobs
- add service date and time to service details
- messaging between customer and service provider flow
- build customer support chatbot with openAI integration
- no styles inline
- sep style file?
- safe area / tap to close on all keyboard inputs
- make everything compatible across different devices
- make sure supabase can handle requests
- payment method / direct deposit flow
- basic monetization flow (1% capped at 5$ to start)
- switch cancel button and select a pro / add cancel to edit request text
- background check / auth flow for serviceprovider app
- change autofill description to 'Give me the first available helpr at this price' and custom to 'choose from available helprs. 
- recommend to new helprs that they set their price at the bottom of the range
- set 33% +- range to chatgpt calculated prices
- get sample size of 50 people for each vertical to say whether a price is too high or low for the job
- change verification to phone 

production checklist

- RLS on sql table
- website with qr codes
- dedicated email for help and verification emails
- financial model w 6 month projections
- remove logs?
- keys restricted






