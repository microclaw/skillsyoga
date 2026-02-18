# AGENTS.md

## Scope

These instructions apply to the entire `skillsyoga` repository.

## Product Language

- Keep all in-app UI copy, labels, buttons, dialogs, and tooltips in **English only**.
- Do not introduce mixed-language UI text.

## UI/UX Expectations

- Prefer clear, professional desktop app UX.
- For destructive actions, always require confirmation.
- For unsaved editor changes, always provide explicit choices (`Save`, `Discard`, `Cancel`).
- Avoid duplicate entry points that perform the same action unless intentionally designed.

## Skills Editor Rules

- Support multi-file skills and nested folders.
- Keep file-tree operations stable: create, rename, delete, reveal in finder.
- Deletions should move to Trash (not hard delete).
- Respect current editor mode:
  - `View` mode: read-only behavior.
  - `Edit` mode: editing actions enabled.

## Settings Rules

- Keep settings actionable and minimal.
- Any external links shown in Settings must open correctly.
- Keep token guidance concise and practical.

## README Rules

- README should stay open-source friendly and professional.
- Keep installation and release instructions up to date (including Homebrew when supported).

## Code Quality

- Keep changes consistent with existing architecture (Tauri + React + TypeScript).
- Prefer maintainable, reusable UI components over ad-hoc event hacks.
- When fixing UI interactions, favor robust component primitives (Radix/shadcn patterns).

## Release Process

- Keep versioning and release scripts aligned with the repository conventions:
  - `inc_patch_version.sh`
  - `inc_minor_version.sh`
  - `inc_major_version.sh`
  - `scripts/release_homebrew.sh`
- Use clear, stable script names; avoid introducing duplicate scripts for the same job.
- Ensure Homebrew-related config stays in sync with actual release behavior.
- Before release:
  - Run frontend build (`bun run build`)
  - Run Rust checks (`cargo check` in `src-tauri`)
  - Verify README install/release instructions are still accurate.
