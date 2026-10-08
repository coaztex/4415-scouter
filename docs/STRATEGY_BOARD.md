# Strategy Board

## Match workflow

Match Prep and Match Details link to `/events/[eventKey]/matches/[canonicalMatchKey]/strategy-board`. The same authenticated query loads the event, match, shared canonical stations and saved document. Teams are never reselected or invented. R1/R2/R3 and B1/B2/B3 retain actual team numbers. Incomplete cached lineups show a warning.

Active strategy/admin accounts may read boards within the existing event-access rules and edit boards for active events, including completed matches. Archived events retain the existing admin-only access and are read-only. No new accounts, roles or service credentials are introduced.

## Game configuration and document

The current game module defines `features.strategyBoard.phases` and `field`. REBUILT uses Auto, Transition, Active HUB 1, Inactive HUB 1, Active HUB 2, Inactive HUB 2, Endgame. Phase IDs are stable document keys; changing persisted phase semantics requires an explicit board schema compatibility change. The board schema is separate from scouting payload schema version 2.

Schema version 1 stores game slug and phase-specific drawing objects, normalized robot positions, station/team identities and notes. Typed objects support freehand, line, arrow, circle and text. Every drawing has a stable UUID, phase ID and nullable station/team owner. Duplication generates new drawing IDs and changes phase ownership while preserving team ownership. Each phase supports up to 300 objects, each stroke up to 2,000 points, each note up to 4,000 characters. The document has a 750,000-byte application bound to leave room within server action and JSONB limits.

The approved field background is `/fields/2026-field-gray.png`, a byte-identical copy of the supplied `2026_Field_Gray.png` (7992 × 3240, ratio 37:15). The source image is not edited or redrawn. It fills the board width, centered with its exact aspect ratio, with red left and blue right. The temporary SVG field depiction is removed. The image is underneath all drawing/marker layers, does not receive pointer events, and shares their pan/zoom group.

Stored version-1 points are normalized fractions of the field image, not pixel coordinates. The renderer keeps 1,000 horizontal drawing units and computes height as `1000 * 3240 / 7992`. This maps existing positions, paths, zones and labels to the displayed image without changing saved documents, IDs, phases or revisions. Circle radii remain fractions of width. Pointer input uses the SVG screen transform before reversing pan/zoom; changing viewport size does not alter saved coordinates.

## Editor

Planning Mode provides phase navigation, real-team selection, marker dragging and position nudge buttons, select/move/delete drawing, pen, line, arrow, zone/circle, text, eraser, undo/redo and clear. Pointer gestures support touch and mouse; visible controls need no hover. Pan is an explicit tool and cannot create drawings. Zoom buttons and Fit field work in both modes.

Expanded field navigation locks background scrolling, contains keyboard focus, closes with Escape and returns focus to the expansion control. Text options close before the expanded field when Escape is used.

Duplicate previous phase copies markers and drawings into the current phase, retaining its notes. Replacing an edited phase requires confirmation. Clear current phase requires confirmation and resets only that phase's drawings, markers and notes. Undo/redo covers the current board editing session (up to 50 states), including edits across phases, and resets on reload.

Start Match enters Live Mode at the first game phase (Auto). Previous/Next Phase advance manually; no guessed timer switches HUB phases. Live Mode hides the editor toolbar and shows the field, current phase, team legend and notes. Exit Live Mode returns to planning without modifying any phase.

## Persistence and conflicts

Additive migration `20261023000000_strategy_boards.sql` creates one `strategy_boards` record per match, constrained by the existing `(match_id, event_id)` foreign key. The document lives in JSONB; pointer movement creates no database rows. Metadata includes creators, updaters, timestamps, schema version and monotonic revision.

Authenticated writes go through `save_strategy_board`, which validates role, active event, match/event identity and envelope, locks by match and compares the expected revision. Direct authenticated table writes are revoked. A stale revision fails without overwriting another editor. The server action also validates the typed document and exact official marker/team ownership. Existing RLS helpers scope saved reads to strategy/admin users. Migration/RLS behavior is tested against disposable PostgreSQL; no hosted migration is performed by the test suite.

The editor reuses `useDeviceDraft` and the existing IndexedDB `drafts` store, keyed by account, event and match. Committed gestures and debounced notes are checkpointed locally; pointer previews are temporary. Save board writes a device checkpoint before making the server action and stores the accepted revision afterward. Offline edits remain visibly unsynced. Reconnect and use Save board to retry. The scouting submission queue is specific to match/pit captures and is not repurposed for strategy documents; no second offline database or background sync service is introduced.

Older local revisions preserve their draft but block server saves until reconciled. Export device draft provides a JSON backup. Load saved board requires confirmation, discards the local copy and reloads. A second tab changing the same device draft is caught by the existing store revision check. A lost server response may produce a conflict on retry; the draft remains available for export and comparison. There is no simultaneous collaborative merging.

Confirmed Load saved board blocks pending edit checkpoints during removal and navigation, so pagehide/unmount cannot restore the discarded draft. Failed removal preserves the current editor and recovery message.

An already loaded editor supports offline editing. Opening a never-loaded board route while offline is not guaranteed; no new service-worker route cache is added. Device-storage failures keep the editor locked on initial load and surface errors, preserving the prior copy.

## Validation

Unit, server, UI and SQL tests cover document identity, phases, duplication, notes, marker/team ordering, typed geometry, manual Live Mode, save/reload, stale revisions, account/event/match isolation, shared device draft storage, touch drawing and viewport gestures, authorization and archive boundaries. Apply the additive migration to the target database before using the deployed board route. No new environment variables are required.

The linked project's missing Strategy Board migration caused the initial `Strategy Board unavailable` runtime error. `20261023000000_strategy_boards.sql` was applied after a linked dry run confirmed it was the only pending migration. Generated database types now include the installed table/RPC, replacing the temporary type overlay. Missing-table errors identify this migration explicitly; other failures still preserve existing data instead of returning an empty replacement board. Field tests also verify the supplied PNG hash, intrinsic aspect ratio, overlay layering, old normalized coordinates and zoomed gestures at desktop/tablet/phone sizes.

## Team drawing identities

`station-palette.ts` centralizes six distinct station colors (orange, pink, gold, cyan, purple and lime). The same palette colors the team controls, robot markers, drawing geometry, arrowheads, text and field station team labels. Dark marker text has at least 4.5:1 contrast against every palette fill. Station/team labels accompany color; selectors show Red/Blue alliance separately and remain visible in Live Mode.

The selector always reserves R1/R2/R3/B1/B2/B3 in that order. Missing cached assignments show a disabled Unknown slot, and never move another team into its place. Game configuration supplies normalized image label anchors; on the approved 2026 image Blue station locations run B3/B2/B1 from top to bottom. Overlays use actual cached team numbers, share image pan/zoom and cannot intercept gestures. The source PNG remains untouched.

Existing version-1 `ownerStation`, `ownerTeamNumber` and `phaseId` fields are authoritative. Alliance is unambiguously encoded by the official station (R = red, B = blue), so no redundant alliance or color column is introduced. Server validation checks station/team pairs against the canonical match. Colors are derived from the stable station palette, not inferred to recover ownership. Legacy unassigned drawings render neutral and remain unassigned; new drawings require a known active team. A gesture captures its owner on pointer-down. Selecting/moving/erasing an object or changing the active team never reassigns its owner. Existing undo, redo, duplication, device drafts and saves preserve identity without a schema migration or coordinate rewrite.

## Import and scout viewing

The More disclosure below Save board stacks Load saved board, Export device draft and Import device draft in that order. Import accepts the existing JSON export envelope, validates its byte size, event/match identity, game, schema version, phases, geometry and station/team owners, then asks before replacing all phases on this device. Every phase's drawings, marker positions and notes is restored. The import becomes a local unsynced edit with undo support; Save board publishes it through the existing revision-checked action. Exported revision numbers are not reused as authority on another device. Invalid or canceled imports preserve the current board. Export/import works between different accounts/devices viewing the same canonical event and match.

Active scouts can enter through Match Details and receive a map-only view with a discreet View only label. They receive no editor, team selector, phase controls, phase notes, Live Mode or draft controls. Their map supports pan, zoom and expansion. It displays the initial game phase (Auto in 2026). Only the server-saved plan is shared; another device's unsaved draft is not visible.

Migration `20261024000000_strategy_board_map_read.sql` adds a scoped, authenticated `read_strategy_board_map` RPC that returns drawings/markers for all phases with notes removed. Existing table RLS continues to restrict complete documents to strategy/admin, and the save RPC/action still require strategy/admin. Scout access does not initialize the device draft/editor session. Archived event access retains existing event rules. No document migration or new environment variables are needed.

The October 7, 2026 integration audit verified both Strategy Board migrations are applied to the linked project and match their recorded SQL. The audit made no hosted database changes.
