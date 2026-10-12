# Connected pilot handoff — 2026-10-12

The `/kozos-proba/` client is now packaged for the existing Supabase staging project. The `/bemutato/`, `/harom-nezet/`, root app and existing work records are unchanged. Only a public publishable key is in client configuration. There are no embedded passwords, Auth tokens or service keys.

## Verified progress

- The seven previous reviewed migrations are present in the target project; 39 norms remain loaded.
- `team-workbook` Edge Function deployed ACTIVE, version 1, platform JWT verification ON. It validates the caller with Auth and the RLS-protected profile before any privileged export. Full download uses `read_team_workbook` with the caller's token and is manager-only. The generator is pinned to this repository's `9f8ca31b8598f889a4cb4be14bb78847cab43aef` commit, `harom-nezet/shared-workbook.mjs`, not a floating branch. Pilot files receive demo marking.
- Added the reviewed pilot client and durable outbox based on the latest source ZIP. 134 local Node regression tests rerun successfully. This count is not a real two-device or live-Auth test.
- Public-route imports reuse existing reviewed blobs; an import map maps parent team-core/excel-export imports into the isolated pilot directory for the static offline shell.

## Concrete blockers — do not hide or circumvent

- The `run-workbooks` deployment was blocked by the tool security check. No runner is deployed and no Cron schedule was enabled. Do not claim background refresh when all apps are closed. The manager foreground client can request the authenticated `team-workbook` refresh.
- The automated `pilot-provision` invocation was blocked by the tool security check. A fresh read showed zero Auth users, profiles, workspaces and HTTP response records. No test login was created.
- The temporary setup endpoint was replaced with a JWT-protected 410 response (version 2). Both private service proof records are disabled. No secret value was read into chat or committed to GitHub. Do not re-enable/retry the blocked invocation through another mechanism.
- Two manually created, confirmed Auth test identities are needed before employee/manager assignment and real Auth/HTTP testing. Use reserved synthetic emails, not actual coworkers. No public signup-to-manager trigger is allowed.
- Final company names/passwords remain deferred until boss approval.

## Owner-side next step

In the Supabase project's Authentication / Users page, add two synthetic users using the official Add user / Create new user form, with email confirmation enabled and two different passwords chosen by the owner: `proba01@muszaknaplo.invalid` and `fonokproba@muszaknaplo.invalid`. The owner keeps the passwords and does not paste them into chat.

After the owner confirms creation, read the actual Auth IDs and assign PROBA01 -> employee and FONOKPROBA -> manager in the same staging workspace. Do not hardcode guessed IDs or grant a role based on an unconfirmed public signup. Then perform the live save/submit/approve/reopen/export checks and remove the pending-account notice.

## Remaining acceptance

Actual Supabase Auth + REST session checks, Edge runtime XLSX generation, current-generation master replacement, separate-device role isolation, Android/Messenger behavior and a native local file-write trial. Local network DNS was unavailable for GitHub/Supabase HTTP testing in this environment; no browser/device success is asserted.

A downloaded Excel is a snapshot. Rewriting the same local file is separately permissioned, conflict checked, and requires an open manager app. The pilot's actual employee tabs reflect its test profiles; the previously released 20-tab demo remains separate.
