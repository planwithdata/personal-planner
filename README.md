# Daylight

An iPhone-first personal planner for tasks, projects, ideas, time blocks, and reviews. Daylight saves the workspace in IndexedDB on your device.

## Run locally

Use Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. The sample workspace shows how the app works. Use **Start fresh** to clear it, or restore an existing backup in **Settings & backup**.

## Check the release

```sh
npm test
npm run build
npm run test:browser
```

The browser tests use Microsoft Edge on Windows. On other platforms, run `npx playwright install chromium` first. They serve the production build under a repository subpath and use a simulated Google Calendar service.

Use `npm run preview` to try the production build and its offline behavior. Development and preview run at different origins and have separate workspaces. Export and restore a backup to move data between origins.

## Publish to GitHub Pages

1. Push the project to your GitHub repository.
2. In the repository, open **Settings → Pages** and choose **GitHub Actions** as the source.
3. In **Actions**, run **Deploy Daylight to GitHub Pages**. It builds the site, runs the tests, and publishes `dist/`.
4. On your iPhone, open the Pages URL in Safari. Tap **Share → Add to Home Screen**, then open Daylight from the icon.

See [Google Calendar setup](docs/GOOGLE-CALENDAR.md) to connect your account. The optional repository variable `DAYLIGHT_GOOGLE_CLIENT_ID` prepopulates the OAuth client ID on the deployed site.

## Data and exports

- **Settings & backup** downloads full workspace backups. Restore accepts Phase 1 and current backups and asks before replacing the workspace.
- **Reviews** offers an analytics export by date and project and a single-project handoff. It also provides a companion prompt for the receiving chatbot.
- Keep backups in Files or another location you control. The source repository contains app code and test fixtures. Keep personal exports out of Git.

[Build phases](docs/BUILD-PLAN.md) · [Export field guide](docs/EXPORTS.md) · [Release acceptance checklist](docs/MANUAL-CHECKS.md)
