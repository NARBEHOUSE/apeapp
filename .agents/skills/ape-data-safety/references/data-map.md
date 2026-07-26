# APE data map

Use this file to find the current implementation quickly. Verify details in source before changing them.

## Architecture

- The app is browser-only and has no APE backend.
- IndexedDB database: `fitos-db`, currently opened in `fitness-app/src/db/index.ts`.
- Settings and smaller profile-scoped collections use `fitos-*` localStorage keys.
- Google Drive sync and coach sharing are optional browser-to-Google flows.
- AI provider calls are direct from the browser and use user-supplied keys.

## IndexedDB stores

`fitness-app/src/db/index.ts` defines:

- `workoutSessions`
- `foodEntries`
- `measurements`
- `progressPhotos`
- `programs`
- `checkIns`
- `steps`
- `water`

Most user records have `by-profile`, `by-date`, and compound profile/date or profile/pose indexes. `programs` is the notable shared store; inspect built-in versus custom-program behavior before deciding its scope.

## Main lifecycle files

- Types and serialized shapes: `fitness-app/src/types/index.ts`
- Database schema: `fitness-app/src/db/index.ts`
- Store-specific access: `fitness-app/src/db/*.ts`
- Local backup, program, food, coach package, clear, and import flows: `fitness-app/src/utils/exportImport.ts`
- Drive sync, restore, coach sharing, and photo upload: `fitness-app/src/utils/googleDrive.ts`
- Google authentication state: `fitness-app/src/utils/googleAuth.ts` and `fitness-app/src/contexts/GoogleAuthContext.tsx`
- AI key detection and storage: `fitness-app/src/utils/apiKeyManager.ts`
- Provider requests: `fitness-app/src/utils/aiAdapter.ts`

## Sensitive and device-specific state

The Drive serializer currently excludes keys including:

- `fitos-usda-key`
- `fitos-claude-key`
- `fitos-claude-enabled`
- `fitos-google-user`
- `fitos-active-profile`
- `fitos-last-synced`

Do not assume this list is complete. Search `fitness-app/src` for API key, token, auth, and `fitos-` whenever adding or changing persisted state. Keep exclusion logic symmetric in export and restore paths.

## Compatibility checkpoints

When adding a persisted field or store, inspect all of these independently:

- IndexedDB upgrade behavior and version.
- Local export marker/version and import modes.
- Drive sync marker/version and restore behavior.
- Coach share/package marker/version and pending-change behavior.
- Clear-profile and clear-all cleanup.
- Old payload behavior when the new field is absent.
