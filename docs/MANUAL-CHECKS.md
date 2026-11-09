# Release acceptance

The automated suite checks date handling, recurrence, backup migration, export schemas, and Google event ownership and retry logic. The production browser suite runs at a GitHub Pages-style subpath. It checks mobile task and export flows, concurrent tabs, offline storage, a service-worker update, and Google Calendar using a simulated service.

## On the deployed URL

1. Open the Pages URL. Confirm Today loads and the app can create a task, a project, a brainstorm, and a scheduled block.
2. Export a local backup and restore it on the Pages URL if moving an existing workspace. Confirm task dates, links, notes, and reviews survived.
3. Use [Google Calendar setup](GOOGLE-CALENDAR.md) with your account. Select a calendar, check a known timed event and an all-day event, and create the Personal Planner calendar.
4. Publish a test block, then edit it locally and choose **Update Google event**. Confirm Google shows one event at the new time. Remove its Google copy and verify it disappears while the local block remains. Use **Disconnect**, then reconnect and confirm calendar selection.
5. In Safari on your iPhone, use **Share → Add to Home Screen**. Confirm Daylight's icon, navigation, and scrolling. Open a task or block and verify the keyboard, date/time controls, and save buttons are usable.
6. After the first connected launch, close and reopen the installed app offline. Add a test task, close it, reopen it, and confirm the task is still there. Check the backup download in Files.
7. Save any open edits before applying a new version. Confirm the installed app opens the updated site with the same workspace.

Keep a JSON backup before switching origins or clearing data on a device.
