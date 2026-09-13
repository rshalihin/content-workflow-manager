# Content Workflow Manager — Build Plan Index

Step-by-step implementation plan for **Free v1.0**, derived from
`Content Workflow Manager — Development Plan.md` and constrained by `CLAUDE.md`.

Read `01-decisions-and-conventions.md` before writing any code — it freezes the
naming, class-style, and data-shape decisions that every later step assumes.

## How to use this plan

- Work the steps **in numeric order**. Each step file lists: goal, prerequisites,
  files touched, detailed tasks, the public contract (method/route signatures),
  acceptance criteria, tests, and the commit message to use.
- One step ≈ one commit (or a small series). Do not start a step whose
  prerequisites are unchecked.
- Every step ends green: `composer lint` (phpcs, zero errors), `composer test`
  (PHPUnit), and `npm run lint:js` where JS exists.
- If a step forces a deviation from `01-decisions-and-conventions.md`, update
  that file in the same commit — it is the single source of truth.

## Build order (mirrors the dev plan's "Actual Build Order")

| # | Step | Layer | Depends on |
|---|---|---|---|
| 02 | [Repo scaffold and tooling](02-repo-scaffold-and-tooling.md) | infra | — |
| 03 | [Plugin bootstrap / Core](03-plugin-bootstrap-core.md) | PHP core | 02 |
| 04 | [Data model + activation](04-data-model-and-activation.md) | DB | 03 |
| 05 | [StatusManager](05-status-manager.md) | workflow | 03 |
| 06 | [TransitionManager](06-transition-engine.md) | workflow | 05 |
| 07 | [Capabilities + PermissionManager](07-capabilities-and-permissions.md) | workflow | 05, 06 |
| 08 | [PostMeta + PostRepository](08-post-meta-and-repository.md) | content | 04, 05 |
| 09 | [ActivityLogger](09-activity-logger.md) | activity | 04 |
| 10 | [WorkflowManager (orchestrator)](10-workflow-manager.md) | workflow | 06, 07, 08, 09 |
| 11 | [REST: WorkflowController](11-rest-workflow-controller.md) | REST | 10 |
| 12 | [REST: Activity + Users + collection](12-rest-activity-and-users.md) | REST | 10, 11 |
| 13 | [JS build setup](13-js-build-setup.md) | infra | 02 |
| 14 | [Gutenberg sidebar](14-gutenberg-sidebar.md) | React | 11, 12, 13 |
| 15 | [Activity timeline UI](15-activity-timeline-ui.md) | React | 12, 14 |
| 16 | [Admin dashboard (DataViews)](16-admin-dashboard-dataviews.md) | React | 12, 13 |
| 17 | [Filters + bulk actions](17-filters-and-bulk-actions.md) | React + REST | 16 |
| 18 | [Settings page](18-settings-page.md) | admin | 08 |
| 19 | [Testing sweep](19-testing.md) | quality | all |
| 20 | [Security hardening review](20-security-hardening-review.md) | quality | all |
| 21 | [Performance pass (N+1)](21-performance-pass.md) | quality | 16, 17 |
| 22 | [UX polish + i18n](22-ux-polish-i18n.md) | UX | 14–18 |
| 23 | [Docs + release](23-docs-and-release.md) | release | all |
| 24 | [Pro extension points audit](24-pro-extension-points.md) | architecture | all |

## Progress tracker

Tick a box only when that step's acceptance criteria all pass.

- [x] 02 Repo scaffold and tooling  _(activation check run on local Laragon WP 7.1, not wp-env)_
- [ ] 03 Plugin bootstrap / Core
- [ ] 04 Data model + activation
- [ ] 05 StatusManager
- [ ] 06 TransitionManager
- [ ] 07 Capabilities + PermissionManager
- [ ] 08 PostMeta + PostRepository
- [ ] 09 ActivityLogger
- [ ] 10 WorkflowManager
- [ ] 11 REST: WorkflowController
- [ ] 12 REST: Activity + Users + collection
- [ ] 13 JS build setup
- [ ] 14 Gutenberg sidebar
- [ ] 15 Activity timeline UI
- [ ] 16 Admin dashboard (DataViews)
- [ ] 17 Filters + bulk actions
- [ ] 18 Settings page
- [ ] 19 Testing sweep
- [ ] 20 Security hardening review
- [ ] 21 Performance pass
- [ ] 22 UX polish + i18n
- [ ] 23 Docs + release
- [ ] 24 Pro extension points audit

## Out of scope for v1.0 (do not build)

Email, Slack, editorial calendar, multiple workflows, role-configurable
workflows, checklist gating, rules engine, AI, team management, a custom post
type for managed content. Step 24 verifies that the hooks exist so these land
as add-ons later — it does **not** implement them.

## Milestones

- **M1 — Headless engine (steps 02–10).** Workflow transitions, permissions,
  meta, and activity work with zero UI; provable by PHPUnit alone.
- **M2 — API (steps 11–12).** A complete backend application usable from
  `wp-cli`/curl without React.
- **M3 — Editor UX (steps 13–15).** Gutenberg sidebar + timeline.
- **M4 — Dashboard (steps 16–18).** DataViews table, filters, bulk actions,
  settings.
- **M5 — Ship (steps 19–24).** Tests, security, performance, polish, docs.
