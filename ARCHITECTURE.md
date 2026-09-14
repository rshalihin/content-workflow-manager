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
