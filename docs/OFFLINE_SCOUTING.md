# Offline scouting

Match and pit forms save drafts to IndexedDB after edits. The small runtime dependency [idb](https://github.com/jakearchibald/idb) supplies the promise-based IndexedDB API; it is not a state-management framework. `fake-indexeddb` is a development-only dependency for storage tests. The installable PWA service worker caches only public icons and versioned Next.js static assets; it does not store forms, routes, authenticated data, API responses, or submissions. IndexedDB remains the only durable offline submission path.

Final Submit first validates the season payload and commits it to the device queue. The form then displays **Saved on this device — waiting to sync** and locks that snapshot against edits. A successful enqueue is never presented as a server submission. After the server confirms its transaction, the form returns to the schedule or pit list. The assignment becomes submitted only inside the existing database transaction. A lost response is retried with the original client UUID and content.

## Storage and recovery

The versioned `frc-scout-device` database contains `drafts` and `queue` stores. Drafts use account-specific keys, timestamps, and revision checks to reject stale writes from another tab. Match drafts retain phase, fuel history, activity transitions, issue events, timing, and identity. Pit drafts retain incomplete numeric text, optional notes, routines, client UUID, and the server revision of any earlier draft. Pit Save draft now saves locally; the final report is sent through the queue. Existing server pit drafts remain readable. Existing localStorage match drafts are copied to IndexedDB before their legacy copy is removed.

Queue records contain the client submission UUID, match/pit type, actor, event key/ID, assignment/match/team references, validated submission payload, local creation/update times, pending/syncing/synced/error state, retry count, safe error category, next attempt time, and a short worker lease. Queue data is scoped to its author in the UI. The server checks the actual signed-in account against that author; changing accounts never submits someone else's queued data.

Pending and failed records do not expire. Success removes the draft and payload atomically from device storage, retaining a small confirmation for seven days. Cleanup deletes only expired synced confirmations. Signing out does not erase pending work. Clearing site data, using private browsing, or losing the device can remove browser storage; use the draft/queue export control when a backup or lead review is needed.

## Retry and conflicts

The global sync indicator shows connection, pending count, active sync, or an error. It includes Retry sync and per-record exports. An open page checks due records every two seconds and on connectivity changes. Each request has a 20-second timeout. Automatic attempts use exponential backoff and stop after five attempts. Manual Retry sync starts a new bounded batch for connection/session failures. IndexedDB transaction leases prevent simultaneous workers from processing the same row; an interrupted worker's lease becomes available after 60 seconds.

An expired session pauses the record until the original scout signs in and retries. Assignment changes, another final submission, a changed pit claim, or stale server draft revisions produce a conflict. Conflicts remain locked and exportable; ordinary retries cannot overwrite them. Strategy/admin must review the device export and server record through the deliberate correction workflow when that workflow is available. The app does not currently provide a correction editor.

Offline pit work can begin on an already loaded team page. Its claim cannot be advertised to other scouts while disconnected. On sync, the server checks the current claim; it never performs an automatic takeover. Deliberate online takeover still uses the existing confirmation flow.

## Current limits and checks

An already loaded form works offline, but a cold page load/reload or navigation needs connectivity to authorize the route and retrieve current data. Cached public scripts do not make an authenticated page available offline. Stored drafts and queued submissions survive a failed reload and resume when the app can load again. Background sync runs only while an app page is open. Use the same browser profile and origin: localhost ports and production domains have separate device storage.

`tests/offline.test.ts` checks durable queue records, draft revisions, concurrent worker claims, lease recovery, validation, simulated fetch failures, bounded backoff, session errors, conflict preservation, confirmation retention, and cleanup. Existing disposable PostgreSQL match/pit capture suites verify UUID idempotency, final-record protection, and atomic completion. No credentials or new migration are required.
