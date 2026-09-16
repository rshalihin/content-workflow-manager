# Architecture

> Stub created in build step 07. The full document (layer diagram, data model,
> transition pipeline, trade-offs) is written in step 23.

## Authorization (`Sit_Cwm\Workflow\PermissionManager`)

Every workflow authorization question is answered by `PermissionManager`.
Nothing else calls `current_user_can()` for workflow decisions; all checks use
`user_can( $user_id, … )` so they work for arbitrary users and in bulk loops.

`PermissionManager` decides *who may reach a status*. It does **not** decide
whether `from → to` is a legal edge — that is `TransitionManager`.
`WorkflowManager` is the only class that combines the two, so neither can be
bypassed by the other.

### `can_change_status( $post_id, $to, $user_id )` — order of checks

1. The user exists (`0` / logged-out / unknown → deny). **Hard gate.**
2. The post exists and its type is workflow-enabled. **Hard gate.**
3. `edit_post` on this specific post (WordPress's own object-level check).
4. The capability mapped to `$to` (`sit_cwm_status_capability_map`; unknown
   statuses require `sit_cwm_manage_workflows`).
5. For `published`: also `publish_post` on this post.
6. The result of 3–5 passes through
   `sit_cwm_can_transition( $allowed, $post_id, $from, $to, $user_id )`.

### The `sit_cwm_can_transition` contract

- The filter runs **last**, so its return value is final for checks 3–5:
  returning `false` vetoes an allowed move (Pro can tighten rules), and
  returning `true` grants a move capabilities would deny (Pro can widen —
  deliberately; a filter that blindly returns `true` opens every status to every
  user who reaches it).
- It never runs for the hard gates 1–2: no filter can grant a logged-out user,
  a missing post, or a post whose type has no workflow. The filter is therefore
  never the *only* gate.
- Only boolean `true` allows; any other value denies.
- Structural validity (`TransitionManager`) is checked separately by
  `WorkflowManager` and cannot be widened through this filter.

### Other permission checks

All require an existing user, a managed post and `edit_post` on it, plus:

| Method | Capability |
|---|---|
| `can_read_post` | WP `read_post` instead of `edit_post` (visibility gate) |
| `can_edit_post` | — |
| `can_view_activity` | `sit_cwm_view_activity` |
| `can_comment` | `sit_cwm_view_activity` |
| `can_assign_reviewer` | `sit_cwm_assign_reviewer` |
| `can_set_due_date` | `sit_cwm_assign_reviewer` |
| `can_manage` (no post) | `sit_cwm_manage_workflows` |

Role grants live only in `Capabilities::role_map()` and are applied at
activation (`Capabilities::add_caps()`, idempotent) and removed on uninstall
(`Capabilities::remove_caps()`, every role).

## Orchestration (`Sit_Cwm\Workflow\WorkflowManager`)

The single entry point for every workflow mutation and for the REST-shaped
read model (`get_workflow()`). REST controllers, the sidebar, bulk actions and
Pro code call it; they never write meta or activity rows themselves.

### Post gate (every method)

A post that is missing, not workflow-enabled, **or not readable by the acting
user** (`PermissionManager::can_read_post`) yields the identical
`sit_cwm_not_managed` 404. A 403 is therefore only ever returned for a post the
user can already see. Read methods return `[]` / `false` in the same cases.

### `transition( $post_id, $from, $to, $user_id )` — order of checks

| # | Check | Error |
|---|---|---|
| 1 | Post gate | `sit_cwm_not_managed` 404 |
| 2 | `$from` equals the stored status (optimistic concurrency) | `sit_cwm_status_conflict` 409 |
| 3 | `$to` is a registered status | `sit_cwm_invalid_status` 400 |
| 4 | `$from → $to` is in the transition map | `sit_cwm_invalid_transition` 400 |
| 5 | `PermissionManager::can_change_status` | `sit_cwm_forbidden` 403 |

Then: persist → log one `status_changed` row → `sit_cwm_status_changed`.
`can_transition()` runs the same private validator without writing, and
`transition()` always re-validates, so there is no check-then-act gap between
the two. The 409 guard is application-level, not a database lock.

### Reviewer, due date, comment

Post gate (404) → capability (403) → input validation (400:
`sit_cwm_invalid_user`, `sit_cwm_invalid_date`, `sit_cwm_empty_comment`) →
persist → one activity row → D10 action. Authorization runs *before* input
validation so a user without the capability cannot use 400-vs-403 to probe
which user ids exist. Re-assigning the same reviewer or date is a no-op that
returns `true` and logs nothing. A persistence failure after all checks is
`sit_cwm_update_failed` 500.

Failing calls write no meta, no activity rows and fire no actions.

### `available_transitions` and `capabilities`

Courtesy data for the UI to hide controls; never trusted on the way back in.
`sit_cwm_available_transitions` may remove, reorder or relabel entries but
cannot add a slug the user was not already allowed.

### Reviewer eligibility

`assign_reviewer()` accepts only an existing user who holds
`sit_cwm_review_content` (`PermissionManager::can_be_reviewer()`); anyone else
is `sit_cwm_invalid_user` 400. The check runs after authorization, like the
existence check, and applies to single and bulk requests alike.

## Bulk actions (`Sit_Cwm\Workflow\BulkProcessor`)

`POST /sit-cwm/v1/posts/batch` takes `{ post_ids, action, payload }` with
`action` one of `change_status` (`{ status }`), `assign_reviewer`
(`{ reviewer_id }`) or `set_due_date` (`{ due_date }`).

- **The permission check only gates the attempt.**
  `PermissionManager::can_attempt_batch()` requires a logged-in user with
  `sit_cwm_manage_workflows` or `edit_posts`. It grants nothing on any post.
- **Every post re-runs the single-item path.** `BulkProcessor` loops over the
  unique ids and calls the same `WorkflowManager` method a single request
  uses. There is no bulk SQL and no permission check hoisted out of the loop,
  so a batch can never do more than the same requests sent one by one.
- `change_status` starts from each post's **own** current status; the client
  cannot supply one `from` for many posts. Posts whose status makes the move
  illegal fail with `sit_cwm_invalid_transition` instead of being forced.
- Missing, trashed, not workflow-enabled and unreadable posts all fail with the
  identical `sit_cwm_invalid_post` entry.
- The answer is HTTP 200 with `succeeded` (ids), `failed`
  (`{ post_id, code, message, status }`) and `items` (fresh workflow state of
  each success). Only a malformed request as a whole is a 400: 0 or more than
  100 ids, an unknown action, a payload that lacks the action's key or carries
  unknown keys, an invalid date.
- Each success logs its own activity row and fires its own D10 action. No
  aggregate event exists.
- Runtime is bounded by the 100-id cap. Batches over 50 ids raise the memory
  limit to the admin limit; the time limit is never lifted.

## Security review (step 20)

### Information-disclosure rules

1. A post that is missing, not workflow-enabled, or not readable by the user
   gets the **identical 404** (code, message, status): `sit_cwm_not_managed` on
   per-post routes, `sit_cwm_invalid_post` per batch item. A 403 is only
   returned when the user can read the post but may not perform the action.
   *(Fixed in step 20: `AbstractController::resolve_post()` used to answer
   missing ids with `sit_cwm_invalid_post` and hidden posts with
   `sit_cwm_not_managed`, which let anyone enumerate hidden post ids.)*
2. `/users` is gated by `can_list_reviewers()`, returns id, display name and
   avatar only, and searches display name and nicename, never login or email.
3. Activity and comments require `sit_cwm_view_activity` and `edit_post` on
   that post, behind the readable-post gate.
4. Error messages are generic and never include post titles or content.

### Checklist

| Area | Rule | Result |
|---|---|---|
| Authorization | No `permission_callback => '__return_true'` | ✅ grep empty; `NegativeSuiteTest` asserts every route |
| | Checks run login → capability → post access → transition validity | ✅ in every permission callback. WordPress validates the argument schema before calling `permission_callback`, so malformed input can answer 400 before 401/403 (core behaviour) |
| | No `current_user_can()` outside `PermissionManager` | ✅ exception E1 |
| | No role names outside `Capabilities::role_map()` | ✅ grep empty (settings help text names roles in translated prose only) |
| | Per-post decisions use `edit_post`/`publish_post`/`read_post` with the id | ✅ exception E3 for non-per-post gates |
| | Bulk paths re-check per post | ✅ `BulkProcessor` |
| Input | Every REST arg has `type` + `sanitize_callback` (+ `enum`/`validate_callback` for closed domains) | ✅ after adding `sanitize_key` to `orderby`/`order` on `GET /posts` (step 20 fix) |
| | `wp_unslash()` before sanitizing superglobals | ✅ n/a: plugin code never reads `$_GET`/`$_POST`/`$_REQUEST` (grep empty); the settings form goes through `options.php` |
| | `absint()` for ids, no `intval()` | ✅ grep empty; negative reviewer ids are rejected, not flipped |
| | Dates validated by round-trip parse | ✅ `PostRepository::sanitize_due_date()` |
| | Comments `wp_kses_post` + length cap | ✅ 5000 characters |
| | Unknown request fields ignored, never persisted | ✅ workflow route ignores them; batch payload rejects unknown keys; settings sanitize drops them |
| Output | Every echo in `admin/` escaped at output | ✅ `Dashboard`, `Settings` |
| | JSON to JS via `wp_json_encode()` | ✅ `Assets::add_bootstrap()` |
| | No `dangerouslySetInnerHTML` in `src/` | ✅ grep empty |
| | Errors never leak titles/content | ✅ |
| Database | `$wpdb->prepare()` everywhere; `IN ()` lists from `array_fill()` placeholders | ✅ |
| | `ORDER BY`/`LIMIT` from whitelists and `%d` | ✅ |
| | Table name only from `Database::table_name()` | ✅ |
| | Every DB `phpcs:ignore` has a why-comment | ✅ all reviewed |
| General | No `eval()`, variable `include`, `unserialize()` of stored data | ✅ exception E4 |
| | ABSPATH guard on every PHP file | ✅ 31 of 31 in `includes/`, `admin/`, main file, `uninstall.php` (generated `assets/build/*.asset.php` excluded as build output) |
| | `uninstall.php` guarded by `WP_UNINSTALL_PLUGIN` | ✅ |
| | Nonces on non-REST forms/AJAX | ✅ only the settings form (Settings API nonce, `option_page_capability_sit_cwm_settings_group` → `sit_cwm_manage_workflows`); no `admin_post_`/AJAX handlers |
| | No secrets in the bootstrap JS object | ✅ `restNamespace`, `statuses`, capability flags, `postTypes`, `adminUrl` |

### Exceptions (allowed deliberately)

- **E1** `current_user_can( 'activate_plugins' )` in
  `content-workflow-manager.php`: decides only whether to show the
  "PHP too old" notice, runs before the autoloader, not a workflow decision.
- **E2** `$wpdb->query()` in `Database::drop()` (`DROP TABLE` on the name from
  `table_name()`) and `uninstall.php` (prepared `LIKE` delete of `_sit_cwm_*`
  meta). Neither takes user input.
- **E3** The bare `edit_posts` primitive in
  `PermissionManager::can_view_statuses()` and `can_attempt_batch()`: neither
  is a per-post decision, and every post in a batch is authorized again.
- **E4** Computed `require` paths: the fallback autoloader maps a class name to
  a file under the plugin directory (checked with `is_readable()`), and
  `Assets` requires `*.asset.php` only for the hard-coded `ENTRIES`.

### Verification (2026-09-15)

- `composer lint` (WordPress, WordPress-Extra, WordPress-Docs,
  PHPCompatibilityWP): **0 errors, 0 warnings**.
- Grep suite over `includes/`, `admin/`, `src/`, the main file and
  `uninstall.php`:
  - `__return_true`, `dangerouslySetInnerHTML`, `intval(`,
    `$_(GET|POST|REQUEST)`, `unserialize(`, `eval(`: no matches.
  - `current_user_can(`: E1 only, plus two docblock mentions.
  - `$wpdb->query(`: E2 only.
- **Not run in this pass:** PHPUnit (including the 19.4 negative suite in
  `tests/php/integration/NegativeSuiteTest.php`), Jest and Playwright. They
  were written but not executed.
- **Subscriber probe:** not yet performed against a live site. Expected
  statuses, derived from the permission callbacks, to be confirmed and recorded
  in the PR:

  | Route | Method | Logged out | Subscriber |
  |---|---|---|---|
  | `/posts/{id}/workflow` | GET, POST | 401 | 404 if the post is not readable, else 403 |
  | `/posts/{id}/activity` | GET | 401 | 404 if the post is not readable, else 403 |
  | `/posts/{id}/comments` | POST | 401 | 404 if the post is not readable, else 403 |
  | `/posts` | GET | 401 | 403 |
  | `/posts/batch` | POST | 401 | 403 |
  | `/statuses` | GET | 401 | 403 |
  | `/users` | GET | 401 | 403 |
