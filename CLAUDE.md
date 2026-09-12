# CLAUDE.md

This file guides Claude Code (and any other AI assistant) when working on the **Content Workflow Manager** WordPress plugin. Follow these rules for every file created or edited in this repository, without exception, unless the user explicitly overrides one in the moment.

## Project overview

Content Workflow Manager (CWM) is a WordPress plugin that adds an editorial approval workflow on top of normal posts/pages/CPTs: **Draft → Writing → Review → Needs Changes → Approved → Published**. Each managed post gets a workflow status, an assigned reviewer, a due date, workflow comments, and an activity history. Full architecture and phased build order live in `Content Workflow Manager — Development Plan.md` in this repo — read it before proposing structure for any new feature.

- **Free v1.0 scope**: workflow statuses, transition validation, permissions, reviewer assignment, due dates, comments, activity history, REST API, Gutenberg sidebar, admin dashboard (DataViews).
- **Pro scope (do not build into Free core)**: multiple workflows, role-based workflow configuration, email notifications, Slack integration, editorial calendar, checklist gating, workflow rules engine, advanced audit logs.
- Do not build Pro features prematurely, but **do** structure Free code (hooks/filters, isolated classes) so Pro can extend it later without rewrites. See "Extensibility" below.

## Naming conventions — always use these, never invent new ones

The plugin author's WordPress identity is "Shappire IT" → prefix `sit_cwm`. Consistency here matters more than any single choice, so never deviate mid-codebase.

| Element | Convention | Example |
|---|---|---|
| PHP functions / hooks / actions / filters | `sit_cwm_` | `sit_cwm_get_workflow_status()`, `do_action( 'sit_cwm_status_changed', ... )` |
| PHP classes | `Sit_Cwm_` prefix or `Sit_Cwm\` namespace | `Sit_Cwm_Workflow_Manager`, `Sit_Cwm\Workflow\WorkflowManager` |
| Constants | `SIT_CWM_` | `SIT_CWM_VERSION`, `SIT_CWM_PLUGIN_DIR` |
| Text domain / plugin slug / asset handles | `sit-cwm` | `sit-cwm`, `sit-cwm-sidebar-js` |
| REST namespace | `sit-cwm/v1` | `/wp-json/sit-cwm/v1/posts/125/workflow` |
| Custom DB tables | `{$wpdb->prefix}sit_cwm_*` | `wp_sit_cwm_activity` |
| Post meta keys | `_sit_cwm_*` | `_sit_cwm_status`, `_sit_cwm_reviewer_id`, `_sit_cwm_due_date` |
| Custom capabilities | `sit_cwm_*` | `sit_cwm_manage_workflows`, `sit_cwm_change_workflow`, `sit_cwm_assign_reviewer`, `sit_cwm_review_content`, `sit_cwm_approve_content`, `sit_cwm_view_activity` |
| Options | `sit_cwm_*` | `sit_cwm_settings` |
| Nonce actions | `sit_cwm_*` | `sit_cwm_workflow_action` |

## WordPress Coding Standards — mandatory

All PHP must pass `phpcs` with the **WordPress** ruleset (WordPress-Extra recommended) with zero errors before being considered done.

- Tabs for indentation in PHP, not spaces; one space inside parentheses `if ( $x ) {`.
- Yoda conditions: `if ( true === $value )`.
- Full docblocks on every class, method, and function (`@since`, `@param`, `@return`).
- File header guard: every PHP file must start with `if ( ! defined( 'ABSPATH' ) ) { exit; }` immediately after the opening `<?php`.
- Use `snake_case` for functions/variables, `Sit_Cwm_Class_Name` (underscores between words) for classes, matching WP core conventions.
- All strings shown to users must be translatable: `__()`, `_e()`, `esc_html__()`, etc., with text domain `sit-cwm`.
- Target PHP 7.4+ syntax by default unless the user specifies a higher minimum; declare `Requires PHP` and `Requires at least` (WP version) in the main plugin file header.
- JS/React code (Gutenberg sidebar, dashboard) follows the `@wordpress/scripts` ESLint config (`@wordpress/eslint-plugin`) — no ad hoc formatting.

## Security — non-negotiable, this plugin controls editorial permissions

This plugin changes who can approve/publish content, so treat every input as hostile.

- **Never trust client-supplied state.** A REST payload like `{"status": "approved"}` must never be applied directly — the server (`WorkflowManager`) independently re-derives whether the current user may make that transition on that post.
- Every REST route must define a `permission_callback` (never `__return_true` for anything that mutates data) that checks: authentication, the relevant custom capability, access to the specific post, and workflow-transition validity — in that order, all server-side.
- Every admin-post/AJAX handler verifies a nonce (`check_ajax_referer()` / `wp_verify_nonce()`) and a capability (`current_user_can()`) before doing anything.
- Sanitize all input at the boundary: `sanitize_text_field()`, `absint()`, `sanitize_key()`, `wp_unslash()` before sanitizing, `wp_kses_post()` for rich text — matched to the actual data type, not blanket string casting.
- Escape all output at the point of rendering: `esc_html()`, `esc_attr()`, `esc_url()`, `wp_kses()` — never echo raw user or DB data.
- All custom SQL must use `$wpdb->prepare()`; never concatenate variables into a query string.
- No `eval()`, no dynamic `include`/`require` built from user input, no unserialize of untrusted data.
- Capability checks belong in the `PermissionManager` / `WorkflowManager` layer, not scattered inline in REST controllers or templates — controllers call into that layer, they don't reimplement authorization logic.

## Architecture rules — keep this extensible

Mirror the structure from the development plan; don't flatten it for convenience:

```
includes/
  Core/            Plugin, Activator, Deactivator
  Workflow/        WorkflowManager, StatusManager, TransitionManager, PermissionManager
  Content/         PostMeta, PostRepository
  Activity/         ActivityLogger
  REST/            WorkflowController, ActivityController, UserController
admin/             Dashboard, Settings
src/               Gutenberg sidebar + admin dashboard React source
assets/            compiled JS/CSS (build output)
```

- **The UI never decides whether a transition is allowed.** All transition/permission logic lives in PHP (`WorkflowManager::can_transition()`, `::transition()`); REST controllers and React are thin clients over it.
- Keep **workflow status** (`_sit_cwm_status`, custom concept) conceptually and structurally separate from **native WP post status** (`draft`/`publish`/`future`). Don't collapse them into one field even when they seem to overlap (e.g. scheduled publishing).
- Register post meta via `register_post_meta()` with proper `type`, `sanitize_callback`, `auth_callback`, and `show_in_rest` — don't hand-roll meta get/update without going through the registered schema.
- Store activity history in a dedicated table (`wp_sit_cwm_activity`), never as a growing serialized array in post meta.
- Fire WordPress actions at key lifecycle points (e.g. `sit_cwm_status_changed`, `sit_cwm_reviewer_assigned`, `sit_cwm_activity_logged`) so Pro add-ons and future features (notifications, Slack, rules engine) can hook in without editing Free core files.
- Use dependency injection / simple service composition over static calls and globals where practical, so classes stay testable.
- Watch for N+1 queries in the dashboard (reviewer lookups, activity lookups per row) — batch-load where the dev plan's Phase 22 flags this.

## Do / Don't

**Do:**
- Follow the phased build order in the development plan (data model → transition engine → permissions → post meta → activity table → REST → Gutenberg sidebar → admin dashboard) rather than building UI-first.
- Use `@wordpress/dataviews`/`DataForm` for the admin dashboard table rather than a hand-rolled table.
- Add PHPUnit tests for workflow transitions/permissions as they're built, not at the end.

**Don't (Free v1.0):**
- Slack, email notifications, calendar view, multiple workflows, role-configurable workflows, complex automation/rules engine, AI features, team management.
- Custom post type for workflow content — CWM must work with existing `post`/`page`/CPTs via post meta, not a new CPT.
- Hard-coded role checks (`current_user_can( 'editor' )` style) — always go through the `sit_cwm_*` capability layer so Pro can later make roles/permissions configurable.
