# Connect Google Calendar

Daylight uses browser authorization to show events from selected calendars and publish individual time blocks to a dedicated **Personal Planner** calendar.

## One-time setup

1. Create or choose a Google Cloud project and enable the Google Calendar API.
2. Configure the Google Auth consent screen. For a personal external app in testing, add your Google account as a test user. Workspace accounts can also be subject to organization policy.
3. Create an OAuth client of type **Web application**. Under **Authorized JavaScript origins**, add the exact origin you open in the browser. For the deployed site, use `https://YOUR-OWNER.github.io` with no repository path. For local use, register the origin printed by Vite, or use `http://localhost:5173` and open that origin.
4. Configure these scopes in the consent screen. The first two enable calendar viewing. The last grants write access to calendars created by Daylight.

   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
   - `https://www.googleapis.com/auth/calendar.events.readonly`
   - `https://www.googleapis.com/auth/calendar.app.created`

5. In Daylight, open **Calendar → Google Calendar**. Paste the public web client ID, then select **Prepare Google sign-in** and **Connect Google Calendar**. To prefill the field, use `VITE_GOOGLE_CLIENT_ID` in a local `.env.local` or the GitHub Actions variable `DAYLIGHT_GOOGLE_CLIENT_ID`.
6. Choose the calendars to show. For publishing, choose **Create Personal Planner calendar** once. Daylight looks for its existing calendar when you reconnect.

Use the [Google JavaScript quickstart](https://developers.google.com/workspace/calendar/api/quickstart/js) for console setup and [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth) for the permission descriptions. Keep client secrets out of the site and repository.

## Publish and manage blocks

1. Save a local time block. Open it again and choose **Publish to Google**. The title and start/end times go to the selected planner calendar. Notes, estimates, and measured effort stay in Daylight.
2. To change it, save the local edit, then reopen and choose **Update Google event**. Repeating the publish uses the same event ID on that calendar.
3. Choose **Remove Google copy** from the block or the Calendar trash to remove a published event. Moving a block to local trash is recoverable and leaves its Google copy in place until you explicitly remove it.

Daylight verifies both the destination calendar and the event ownership marker before editing or deleting an event. Events with guests are managed in Google Calendar. If Google retains a deleted event ID and refuses a replacement, create a new local block to publish a new event.

Event views refresh when you change date ranges or select calendars. Use **Refresh events** to check for changes from Google. Session tokens stay in memory and expire. Use **Connect Google Calendar** to reconnect after an expiry or reload. If a Home Screen launch cannot open Google's popup, try the site in Safari. The live OAuth and Home Screen flows should be checked on your device after deployment. [Google token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
