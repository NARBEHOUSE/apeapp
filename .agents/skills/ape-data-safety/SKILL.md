---
name: ape-data-safety
description: Protect APE user data and privacy while changing profiles, IndexedDB schemas or queries, localStorage, backup/export/import, Google Drive sync, coach sharing, clear/delete flows, or API-key handling. Use for any change under fitness-app/src/db or relevant fitness-app/src/utils modules, and for reviews or fixes involving migrations, profile isolation, data loss, sync compatibility, or secrets.
---

# APE Data Safety

Treat persisted user data as irreplaceable. Preserve compatibility and privacy across local storage, backups, sync, and coach sharing.

## Start with the current map

Read [`references/data-map.md`](references/data-map.md), then verify every relevant detail against the current source. Treat the reference as a navigation map, not a substitute for reading implementation code.

## Trace the whole lifecycle

Before editing, identify all affected paths:

1. Type or schema definition.
2. Create, read, update, and delete operations.
3. Profile selection and filtering.
4. Local backup export, validation, merge/replace import, and profile-only import.
5. Google Drive gather and restore.
6. Coach package or shared-file serialization when applicable.
7. Clear-profile and clear-all behavior.

Search by field name, store name, and localStorage key. A field is not safely added until every applicable lifecycle path has an intentional behavior.

## Preserve these invariants

- Keep profile-owned records explicitly keyed and filtered by `profileId`. Test with at least two profiles.
- Never export, sync, share, log, or commit API keys, OAuth tokens, auth caches, or device-specific state.
- Make IndexedDB upgrades additive and idempotent. Increase the database version when changing schema, guard creation with existence checks, and never delete a store or field without an explicit migration and user approval.
- Keep old backups and sync payloads readable. Treat imported JSON as untrusted, validate its marker and shape, tolerate missing newly added fields, and preserve documented merge versus replace semantics.
- Version serialized formats when their meaning changes. Do not bump a version for a purely internal refactor.
- Keep destructive operations narrowly scoped. Confirm which profile, account, file, store, and localStorage keys are affected.
- Preserve local calendar dates for workout, nutrition, measurement, step, and water records.
- Avoid overwriting newer or unrelated local data during restore or sync. Make conflict behavior explicit.

## Implement and verify

1. Prefer small pure conversion or validation functions when they make compatibility behavior testable.
2. Use anonymized synthetic records only; never use files from `MF exports/` as fixtures or expose their contents.
3. Run `npm run lint` and `npm run build` from `fitness-app/`.
4. Manually verify the relevant matrix: fresh data, existing data from the previous format, two profiles, merge and replace where supported, offline behavior, and a failed or partial remote request.
5. Inspect serialized output to confirm secrets and unrelated profiles are absent.
6. Review the final diff for accidental store deletion, unscoped `getAll` use, missing restore logic, and silent data resets.

Stop and ask for a product decision before a destructive migration, a change to the privacy model, a lossy conflict policy, or a compatibility break. State exactly what data could be lost or exposed.
