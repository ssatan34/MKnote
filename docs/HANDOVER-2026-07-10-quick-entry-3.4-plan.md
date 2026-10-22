# v3.4.0 Quick Entry Safe Rollout Plan

## Current Baseline

- Branch: `codex/quick-entry-rebuild-3.3`
- Base tag: `v3.3-before-quick-entry`
- Base commit: `abc5051`
- Stable app version at base: `3.2.0`
- Target version: `3.4.0`

## Goal

Rebuild Quick Entry from the last accepted stable version, without starting from
desktop-attached or independent-window behavior.

The v3.4.0 goal is to add:

- Quick Todo: fastest possible in-app todo capture.
- Quick Pocket: fast in-app capture, copy, reorder, and delete for reusable
  Markdown-backed blocks.

## Safety Principles

- Start with in-app buttons only.
- Do not add independent windows in the early stages.
- Do not add desktop top docking in the early stages.
- Do not reuse the old v3.3 independent Quick Entry window code.
- Keep every phase separately buildable and testable.
- Commit each accepted phase as a rollback node.
- Preserve the existing capsule and popout window behavior.

## Phase 0: Version And Baseline

- Bump app version from `3.2.0` to `3.4.0`.
- Keep this file as the execution plan for the rebuilt feature.
- Verify the clean baseline before adding feature code.

Validation:

- `npm.cmd run build`
- `cargo check --manifest-path src-tauri\Cargo.toml`

## Phase 1: In-App Quick Todo Minimum Entry

- Add one icon-only button inside the main app UI.
- Clicking the button opens a small in-app popover.
- The popover supports writing one todo quickly.
- Submitting writes into the existing note/capsule workflow.
- No independent window.
- No desktop docking.
- No changes to capsule switching logic.

Acceptance:

- The button is visible but small.
- The button can be clicked reliably.
- A todo can be written and saved.
- Existing note editing still works.
- Capsule and popout switching remain unchanged.
- Screenshot and topmost behavior remain unchanged.

## Phase 2: Quick Pocket Data Model

- Store Quick Pocket data in one Markdown file.
- Treat each pocket item as a managed block.
- Support structured block metadata:
  - `id`
  - `type`
  - `hidden`
  - `title`
  - `content`
  - `createdAt`
  - `updatedAt`
- Implement parsing and serialization as pure functions first.
- Add focused model tests before connecting UI.

Acceptance:

- Add block.
- Delete block.
- Reorder blocks.
- Preserve hidden content.
- Markdown remains understandable in normal editors.

## Phase 3: In-App Quick Pocket Panel

- Add a second icon-only button inside the main app UI.
- Clicking it opens an in-app pocket panel or popover.
- Do not add search in this phase.
- Each block should expose:
  - type icon
  - title
  - visible preview or hidden mask
  - copy icon
  - delete icon
  - reorder handle
- Use icons only for actions and status labels.

Acceptance:

- Add item.
- Copy item.
- Delete item.
- Reorder item.
- Hidden content remains copyable.
- No Chinese action labels such as copy/type/privacy/today in the panel.
- Main window click behavior remains normal.

## Phase 4: In-App UX Refinement

- Align visual design with `DESIGN.md`.
- Keep entrances compact.
- Keep the panel light and non-dominant.
- Avoid blocking the editor surface.
- Keep all action/status controls icon-only.

Acceptance:

- UI does not feel heavy.
- Text does not overflow.
- Buttons are icon-only.
- The feature feels like a quick utility, not a new main module.

## Phase 5: Optional Desktop Docking Later

Only after phases 0-4 are accepted:

- Open a separate branch for desktop docking.
- Add top-attached icon entry.
- Add hover expansion.
- Handle click-through.
- Handle focus behavior.
- Handle screen boundaries.
- Handle YASB/top-bar avoidance.

This phase must not be mixed into the in-app implementation branch.

## Recommended New-Window Prompt

```text
从 C:\Projects\MKnote 当前分支 codex/quick-entry-rebuild-3.3 开始，按 docs/HANDOVER-2026-07-10-quick-entry-3.4-plan.md 执行。先做阶段 0 和阶段 1：版本升到 3.4.0，并实现程序内 Quick Todo 最小 icon 入口，不做独立窗口、不做桌面吸附。
```
