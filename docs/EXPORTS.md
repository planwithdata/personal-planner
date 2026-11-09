# Daylight JSON exports

Daylight offers three exports. The full backup uses workspace schema version 2. Analytics and project handoff use a separate version 1 schema with a stable field set for chatbot analysis.

| Export | Use it for | Included |
| --- | --- | --- |
| Backup | Restore a device or move to the deployed URL | All local records, trash, history, settings, and published block links. Accepts Phase 1 backups on restore. |
| Analytics | Analyze a date range across all projects or one project | Filtered task snapshots, blocks, activity, and review metadata. Notes and brainstorm text are excluded by default. |
| Project handoff | Give a chatbot context for one project | Project tasks, blocks, activity, and linked decisions. The form includes context by default and lets you exclude it. |

The [JSON Schema](daylight-analytics.schema.json) covers the two share formats. Select **Download companion prompt** in Reviews to get analysis instructions alongside the JSON. Share formats exclude OAuth credentials, selected Google events, and published event links. Task, project, subtask, and time block titles are included even when private text is off.

## Field guide

| Field | Meaning |
| --- | --- |
| `kind`, `schemaVersion` | Identify the export contract. Only `backup` can be restored. |
| `timezone`, `scope.from`, `scope.through` | Exporter's timezone and inclusive local calendar dates. Handoffs have no date filter. |
| `scope.sampleWorkspace` | The source workspace contains starter data unless it has been cleared. |
| `id`, `projectId`, `taskId`, `ideaId`, `entityId` | Stable identifiers and references. History may refer to a record outside the export scope or no longer present. |
| `plannedDate`, `dueDate`, `start`, `end` | Intended work day, deadline, and scheduled block boundaries. Block times are absolute timestamps. |
| `estimatedMinutes`, `plannedMinutes`, `actualMinutes` | Task estimate, block duration, and manually entered measured effort. Unrecorded estimates and measurements are null. A recorded zero actual is meaningful. |
| `repeat.seriesId`, `repeat.occurrenceDate` | Group repeating tasks and anchor each occurrence. Moving its planned day preserves its anchor. |
| `status`, `workState`, `completedAt`, `removedAt` | Current task state and the timestamps of current completion and removal. Reopening clears current completion and adds an activity record. |
| `activity.action`, `at`, `plannedDateBefore`, `plannedDateAfter` | Recorded actions and dates. A blank planned date means unscheduled. Missing history before Phase 2 cannot be reconstructed. |
| `reviews.periodStart` | Day or Monday of the review week. Workspace-wide reviews appear in unfiltered project exports by date. |

Analytics selects tasks by planned day, due day, creation, completion, matching activity, or linked block within the window. A block can qualify by overlapping the date window or by an activity in the window. Its reported duration covers the whole block. Project filtering uses current project assignments for snapshots and recorded assignments for activity when available. Global reviews are included only when exporting across all projects.

History and recoverable trash stay in the local workspace until it is cleared or replaced. A review is editable and stores the latest saved text for its period. A completion or date change adds an event but does not store a full historical copy of the task. The analytics export is a partial record of the work you captured in Daylight.
