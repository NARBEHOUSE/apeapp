---
name: ape-feature-work
description: Implement and verify feature, bug-fix, refactor, and UI changes in the APE React/TypeScript PWA. Use when changing fitness-app/src, Vite or PWA behavior, the landing page, or user-facing APE behavior. Pair with ape-data-safety when a change touches profiles, IndexedDB, localStorage, backup/import, Google Drive sync, coach sharing, deletion, or secrets.
---

# APE Feature Work

Make a focused, understandable change while preserving APE's local-first, privacy-first behavior.

## 1. Orient

1. Read `fitness-app/README.md`, the affected UI entry point, and the types, hooks, utilities, and database modules on the execution path.
2. Check the working tree before editing and preserve unrelated user changes.
3. Work from `fitness-app/` for npm commands.
4. Trace behavior end to end instead of patching only the visible component. A typical path is component -> hook -> utility or database module -> persisted state.

## 2. Define the change

1. State the intended user-visible outcome and the behaviors that must remain unchanged.
2. Prefer the smallest coherent diff. Reuse existing components, types, naming, Tailwind patterns, and utilities.
3. Avoid a new dependency unless it materially simplifies the implementation and the existing stack cannot do the job cleanly.
4. Invoke `ape-data-safety` as well when the change crosses a data-safety trigger named in this skill's description.

## 3. Implement

- Keep TypeScript types explicit at storage, network, and component boundaries.
- Preserve profile isolation. Never infer the active profile when the caller can pass a profile ID.
- Preserve local calendar dates for user logs; do not casually replace them with UTC-derived dates.
- Keep the core app usable offline. Treat remote AI, food lookup, and Drive features as optional integrations with clear failures.
- Never add secrets, API keys, tokens, or personal fitness data to source, logs, fixtures, or error reports.
- Match the existing responsive, dark, mobile-first interface and provide visible loading, empty, success, and error states where applicable.
- Keep health and AI output framed as informational, not medical advice.

## 4. Verify proportionally

1. Run `npm ci` first only when dependencies are absent or the lockfile changed.
2. Run `npm run lint` and `npm run build` from `fitness-app/`.
3. Exercise the changed path at mobile and desktop widths when a browser is available. Test the normal path plus the most relevant empty, invalid, offline, or failure state.
4. For an installable or offline behavior change, also verify the production build rather than relying only on the Vite dev server.
5. Review `git diff --check` and the final diff for accidental generated files, secrets, broad rewrites, and unrelated changes.
6. Do not claim tests that do not exist or checks that were not run. Explain any skipped check and the exact remaining manual verification.

## 5. Hand off clearly

Report the user-visible result, the important implementation choice, the checks that passed, and any residual risk or manual check. Explain unfamiliar terms briefly; assume the maintainer knows the product better than the tooling.
