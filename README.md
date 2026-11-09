# Daylight

An iPhone-first personal planner for tasks, projects, ideas, time blocks, and reviews. Use it on one device or sign in with Google to keep a private workspace across devices.

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
npm run test:accounts
```

The browser tests use Microsoft Edge on Windows. On other platforms, run `npx playwright install chromium` first. The production suite serves the compiled app under a repository subpath. The account suite simulates OAuth and Supabase responses. The database policy test runs the migration against PostgreSQL locally.

Use `npm run preview` to try the production build and its offline behavior. Development and preview run at different origins and have separate workspaces. Export and restore a backup to move data between origins.

## Publish to GitHub Pages

1. Push the project to your GitHub repository.
2. In the repository, open **Settings → Pages** and choose **GitHub Actions** as the source.
3. In **Actions**, run **Deploy Daylight to GitHub Pages**. It builds the site, runs the tests, and publishes `dist/`. Later pushes to `main` also run the workflow.
4. On your iPhone, open the Pages URL in Safari. Tap **Share → Add to Home Screen**, then open Daylight from the icon.

If Pages serves a blank screen or stays on “Opening your planner,” check the publishing source. Publishing the repository's source branch sends raw TypeScript to the browser. The GitHub Actions workflow publishes the compiled bundle.

See [Google account setup](docs/ACCOUNTS.md) to enable sign-in and private workspaces. The separate [Google Calendar setup](docs/GOOGLE-CALENDAR.md) enables calendar viewing and publishing time blocks.

## Data and exports

- **Settings & backup** downloads full workspace backups. Restore accepts Phase 1 and current backups and asks before replacing the workspace.
- **Reviews** offers an analytics export by date and project and a single-project handoff. It also provides a companion prompt for the receiving chatbot.
- Keep backups in Files or another location you control. The source repository contains app code and test fixtures. Keep personal exports out of Git.

[Build phases](docs/BUILD-PLAN.md) · [Export field guide](docs/EXPORTS.md) · [Release acceptance checklist](docs/MANUAL-CHECKS.md)
