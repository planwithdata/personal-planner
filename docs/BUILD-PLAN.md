# Daylight — phased build plan

## Product agreement

An iPhone-first personal planner, published as a static website on GitHub Pages, with one-device storage first and cross-device sync later. The daily loop is capture → clarify → plan → do → review → export. Google Calendar viewing and planner-created time blocks belong in the first complete release; Gmail is later.

## Phase 1 — a usable planner

- Responsive Today dashboard, Inbox, Projects, Ideas, and task editor.
- Create, edit, complete, reopen, and delete tasks; project assignment, priority, estimated minutes, planned day, deadline, and explicit top-three focus.
- Create and edit projects with outcomes and states; inspect their tasks and progress.
- Structured brainstorming: context, options, decision, next steps. Convert a next step to a linked task without removing the note.
- Local IndexedDB persistence, activity history, search, and an honest storage/error indicator.
- Local calendar views for planned tasks and deadlines, independent from Google.
- Early versioned JSON export/restore, preview before replacement, and a sample workspace that can be cleared.
- Installable web manifest; offline shell caching in production.
- Phase document, setup instructions, and repeatable build/tests.

Exit: the app is recognizable immediately; real data survives reload; task completion, idea conversion, backup/restore, and mobile layout are checked. Google is visibly marked as not connected, with no simulated events.

## Phase 2 — dependable planning and recovery

- Subtasks, recurring task occurrences, blocked/waiting workflows, and someday capture.
- Separate task deadline, planned day, and time blocks, including multiple work sessions per task.
- Agenda, week, and month scheduling; time capacity and conflicts.
- Storage quota awareness, backup reminders, deletion recovery, and upgrade migrations.
- iPhone Home Screen icons, offline/update lifecycle and device checks.

Exit: rollover and recurrence preserve occurrence history; a production update and a backup round trip preserve records and relationships.

## Phase 3 — Google Calendar (required for complete v1)

- User-owned Google Cloud project, Calendar API enabled, consent configuration, and OAuth web client registered for the deployed origin.
- Selected calendar viewing, last-refreshed state, explicit reconnect and disconnect.
- Dedicated Personal Planner calendar; create/update/delete only planner-owned blocks.
- Keep local task IDs and remote event IDs mapped; idempotent retries, cancelled events, timezone/all-day handling, conflict and error states.
- Browser authorization first; no client secrets or refresh tokens in the public site. Expired access requires a user-driven reconnect.
- Use Google's own reminders initially. No promised background calendar synchronization on static hosting.

Exit: real Google events appear; a planner block can be created, edited and deleted without duplication; existing non-planner events stay unchanged. Requires the user's Google account authorization and OAuth configuration.

## Phase 4 — review and analytics handoff

- Daily review and weekly review with unfinished-work decisions, blockers, and next actions.
- Analytics export filtered by date/project, with private note content excluded by default.
- Project handoff export with decisions and supporting context.
- JSON Schema, field dictionary, history retention policy, and companion chatbot prompt.
- Estimated effort stays separate from actual tracked effort; absent measurements remain absent.

Exit: another chatbot can interpret exports without conversation context. Export/import tests cover IDs, dates, relationships, and history.

## Phase 5 — first release and GitHub Pages

- GitHub Actions build/test/deploy; correct repository base path and offline cache scope.
- Accessibility, touch/keyboard, timezone/date, reload, backup, and failure checks.
- Test Safari and installed Home Screen mode on the user's iPhone.
- Connect Google OAuth to the actual origin; keep all personal records out of Git.

Exit: deployed URL and installation instructions are available; offline relaunch and upgrades preserve data. Requires a GitHub repository and permission to push/deploy.

## Phase 6 — improvements after real use

Prioritize phone/laptop sync, account authentication and conflict resolution; Gmail-to-task capture; optional focus timer and attachments. Background push and unattended Google sync require separate backend services. Defer infinite canvas, AI scheduling, gamification, and elaborate dashboards until daily use demonstrates a need.

## Technical decisions

- React + TypeScript + Vite; static build, no application server required for the core.
- IndexedDB is the source of saved data. Writes are serialized. Storage errors remain visible; do not pretend an unsuccessful write was saved.
- Local calendar dates use YYYY-MM-DD; event timestamps use ISO 8601; exports carry an IANA timezone.
- Stable UUIDs connect tasks, projects, notes, and activity. Keep Google authentication data out of exports.
- Workspace backup schema is version 2. Restore migrates Phase 1 backups, then validates IDs, references, dates, and bounds before replacing data. Analytics and project handoff use a separate version 1 contract.
- GitHub Pages hosts code, never personal task data. Local storage is not a backup.

## Release checkpoint — 9 November 2026

Implementation is ready through Phase 5 locally. Phase 2 adds daily and weekly recurrence, subtasks, waiting/blocked/Someday lists, separate scheduled blocks, capacity, recovery, and migration. Phase 3 adds Google Calendar viewing and explicit publishing to a dedicated planner calendar. Phase 4 adds reviews, dated analytics, project handoff, and the chatbot prompt. Phase 5 adds the production offline/update flow, Home Screen icons, and the GitHub Pages workflow.

Local release checks cover browser reload and offline capture, cross-tab write conflicts, a service-worker update, mobile task and export flows, and Google Calendar create/update/remove against a simulated service. A live Google account check and a physical iPhone installation still depend on deployment and the user's account/device. The Git push and Pages workflow run follow the local handoff.

The current defaults are a four-hour planning capacity, Monday-start weeks, daily/weekly recurrence, and explicit publishing after saving a local block. Gmail, device sync, and unattended reminders remain Phase 6 work.

See [the release checklist](MANUAL-CHECKS.md), [Google Calendar setup](GOOGLE-CALENDAR.md), and [the export guide](EXPORTS.md).

## Implementation checkpoint — 8 November 2026

Phase 1 code is implemented. Production compilation and seven domain tests pass. Build checks verify asset availability, service-worker syntax and precache entries, cache cleanup, and GitHub Pages repository scope. The local development URL returned HTTP 200.

Browser inspection could not run because both browser and desktop inspection runtimes failed to initialize (`failed to write kernel assets`). Therefore rendered-layout, live IndexedDB interaction, download/restore UI, and physical iPhone checks remain unverified. Do not treat automated build checks as a substitute for these checks.

The Phase 5 browser suite now covers the local workflows above in headless Edge.

## Account rollout

Google sign-in and private workspaces extend the original device-only plan. The site can still open a guest planner. Signed-in workspaces sync through Supabase and are scoped to the current account in both the database and the local cache. See [account setup](ACCOUNTS.md) for the required project, Google provider, and deployment configuration.
