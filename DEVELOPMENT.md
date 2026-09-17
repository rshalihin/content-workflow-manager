# Development

Everything you need to work on Content Workflow Manager: environment, build,
tests, standards, performance budgets and the release process.

[ARCHITECTURE.md](ARCHITECTURE.md) explains how the code is shaped;
[CONTRIBUTING.md](CONTRIBUTING.md) explains what a change has to satisfy.

## Ten-minute start

From a clean clone, with Node 20+, PHP 7.4+ and Docker:

```sh
git clone https://github.com/shappire-it/content-workflow-manager.git
cd content-workflow-manager

composer install     # dev tooling: phpcs, phpunit
npm ci               # build + test toolchain
npm run build        # compile src/ → assets/build/
npm run env:start    # wp-env: WordPress on http://localhost:8888
```

Then:

1. Open <http://localhost:8888/wp-admin> (`admin` / `password`).
2. **Plugins** → activate **Content Workflow Manager**.
3. **Posts → Add New**, give it a title, save a draft.
4. Click the **Content Workflow** icon in the top-right toolbar — the sidebar
   shows **Draft** and one button, **Move to Writing**.
5. Move it to Writing, then Review; assign yourself as reviewer and a due date;
   then **Approve**.
6. **Content Workflow → Dashboard** shows the post with its new status.

If you cannot run Docker, the plugin already lives in a WordPress install here
(`wp-content/plugins/`) — activate it there and skip `env:start`. See
[Running everything without Docker](#running-everything-without-docker) for the
test suites.

### Every command

| Command | Does |
|---|---|
| `composer lint` / `composer lint:fix` | phpcs / phpcbf, WordPress ruleset |
| `composer test` | PHP unit tests (no WordPress, no database) |
| `composer test:setup` | Download core + create the test database, once |
| `composer test:integration` | PHP integration tests (**drops all tables** in its database) |
| `npm run build` / `npm run start` | Production build / watch mode |
| `npm run lint:js` / `npm run lint:css` / `npm run format` | ESLint / stylelint / wp-prettier |
| `npm run test:unit` | Jest |
| `npm run test:e2e` | Playwright against wp-env |
| `npm run test:e2e:local` | Playwright against a local site (no Docker) |
| `npm run env:start` | wp-env |
| `npm run makepot` | Regenerate `languages/sit-cwm.pot` (needs wp-cli) |
| `npm run screenshots` | Regenerate `docs/screenshots/` (**destructive**) |
| `npm run check:version` | Assert the version matches in all four files |
| `npm run build:zip` | Build the release zip into `dist/` |

## JavaScript build

Tooling is `@wordpress/scripts` (Node 20+; developed on Node 24). wp-env runs
WordPress 6.7 on PHP 7.4; `npm run makepot` needs wp-cli on `PATH`. The
commands are in the table above.

### Entry points

| Entry | Source | Output | Loaded by |
|---|---|---|---|
| `sidebar` | `src/sidebar/index.js` | `assets/build/sidebar.{js,asset.php}` | `Sit_Cwm\Editor\SidebarAssets` (block editor, enabled post types, users who can edit the post) |
| `dashboard` | `src/dashboard/index.js` | `assets/build/dashboard.{js,css,asset.php}` | `Sit_Cwm\Admin\Dashboard` (the "Content Workflow" admin page only, for users with `sit_cwm_view_activity` who can edit a workflow-enabled post type) |

A `.css` file is emitted per entry once it imports styles. Name the entry's
stylesheet after the entry (`src/sidebar/sidebar.scss`), not `style.scss`:
`@wordpress/scripts` splits any `style.scss` into a separate
`style-{entry}.css` chunk, which `Assets` does not load.

### Editor sidebar

`src/sidebar/` is a thin client over the REST API; `src/hooks/useWorkflow.js`
is its only data hook and `src/api/client.js` its only `apiFetch` caller
(errors normalized to `{ code, message, status }`). It never decides which
transitions are allowed — buttons come from `available_transitions`.

`PluginSidebar` / `PluginSidebarMoreMenuItem` are read from `@wordpress/editor`
(WordPress 6.6+) and fall back to `@wordpress/edit-post` on 6.5, so the bundle
depends on both `wp-editor` and `wp-edit-post`.

### Admin dashboard

`admin/Dashboard.php` (`Sit_Cwm\Admin\`, autoloaded from `admin/` by both
Composer and the fallback autoloader) registers the top-level page and prints
an empty React root. `src/dashboard/` renders `@wordpress/dataviews` over
`GET /sit-cwm/v1/posts`:

- `src/hooks/usePosts.js` holds `viewToQuery()`, the single view → REST
  mapping. Unknown sort fields, filter fields/operators and invalid values are
  dropped; `FILTER_OPERATORS` is derived from it, so fields cannot offer an
  operator it does not map. Pagination, sorting and filtering are server-side.
- `src/dashboard/urlState.js` mirrors the view in the query string with
  `history.replaceState`. Keys avoid `page` (the admin page slug) and
  `post_type` (read by `wp-admin/admin.php`): `paged`, `per_page`, `search`,
  `orderby`/`order`, `layout`, and per filter `status`, `reviewer`, `author`,
  `type`, `due` plus `{key}_op` when the operator is not the field's default.
- Row actions (`src/dashboard/actions.jsx`) use `isEligible` over each row's
  `available_transitions` and `capabilities` as a UX filter only; every
  request is re-authorized server-side. After a change the current page is
  refetched in place (`usePosts().refresh()`).
- DataViews' stylesheet is pulled in with `@use` from `dashboard.scss`, not
  imported from JS: it is named `style.css`, which `@wordpress/scripts` would
  split into an unloaded `style-dashboard.css` chunk.

### Bulk actions and filters

- Rows are selectable (`selection` / `onChangeSelection`). **Change status**,
  **Assign reviewer** and **Set due date** are `supportsBulk` actions from
  `src/dashboard/bulk/BulkActions.jsx`. With one row, reviewer and due date
  reuse the row modals (reviewers scoped to that post). With several rows,
  every action calls `POST /sit-cwm/v1/posts/batch` through
  `src/hooks/useBulkAction.js`.
- `useBulkAction()` reconciles the response with the ids it sent: an id the
  server did not account for counts as failed, so a partial batch is never
  reported as a success. Double submits are ignored. After every batch the
  page is refetched and the selection cleared, and a notice summarizes the
  result (`_n()`-pluralized) with an expandable list of failures and reasons.
- Moves to `published`, rollbacks, and clearing reviewers or due dates ask for
  a second click that names the item count.
- The modal components are module-level and read the runner from
  `BulkActionContext`, so disabling the actions while a batch runs never
  remounts an open modal.
- **Overdue only** is a filter-only DataViews field (`is_overdue`, URL key
  `overdue=true`) mapped to the `overdue` REST argument. The server computes it
  in the site timezone. **Clear all filters** resets search and filters.
- Saved views were skipped: not trivial with DataViews defaults, and custom
  saved views are Pro.

### Settings page

`admin/Settings.php` adds **Content Workflow → Settings** for users with
`sit_cwm_manage_workflows`. It uses the Settings API only: `options.php` checks
the nonce from `settings_fields()`, and
`option_page_capability_sit_cwm_settings_group` makes it require the plugin
capability instead of `manage_options`. `Settings::sanitize()` is the single
place input is trusted-ized. The setting is not exposed through
`/wp/v2/settings`.

Enabled post types come from `Core\Settings::available_post_types()` (post types
with an admin UI, minus `attachment`, `revision`, `nav_menu_item` and every
`wp_*` type). `Settings::update()` validates against the same list. Disabling a
post type keeps its meta and activity rows. `Dashboard` registers an explicit
"Dashboard" first submenu entry, so the top-level menu does not point at
Settings.

### Enqueueing

All PHP enqueues go through `Sit_Cwm\Core\Assets::enqueue( $entry )`:

- dependencies and version come from the generated `*.asset.php` file — never
  hand-maintain a dependency array;
- handles are `sit-cwm-{entry}-js` and `sit-cwm-{entry}-css`;
- translations are wired with `wp_set_script_translations()` (`sit-cwm`,
  `languages/`);
- `window.sitCwm` is printed before the script with `wp_add_inline_script()`:
  `{ restNamespace, statuses, capabilities, postTypes, adminUrl }`. It holds no
  nonces or secrets, and `capabilities` is a UI hint only; the server
  re-checks every action.

Generated `*.asset.php` files are build output. They only `return` an array,
have no ABSPATH guard, and are excluded from phpcs.

### Build output is committed

`assets/build/` is tracked in git (decision D11) so the plugin runs from a
clone or zip without a build step. Run `npm run build` and commit the output
with every `src/` change.

### Tooling notes

- **ESLint 10:** `@wordpress/scripts` 35 no longer reads `.eslintrc.*`; the
  config is `eslint.config.js`, spreading the scripts package's default.
- **Prettier:** `prettier` is aliased to `wp-prettier` in `package.json`.
  Without the alias, `@wordpress/eslint-plugin` hoists stock Prettier, which
  rejects WordPress' spaces-inside-parentheses style.

## Testing

| Suite | Command | Location |
|---|---|---|
| PHP unit (no WordPress) | `composer test` | `tests/php/unit/` |
| PHP integration | `composer test:setup` once, then `composer test:integration` (it **drops all tables** in its database) | `tests/php/integration/` |
| JS unit | `npm run test:unit` | `tests/js/` |
| End-to-end | `npm run env:start`, then `npm run test:e2e` | `tests/e2e/` |

### Running everything without Docker

Only the end-to-end suite ever needed wp-env; the other three suites are plain
PHP and Node. On a Laragon/MAMP/XAMPP machine the whole suite runs against the
local Apache and MySQL:

```sh
# 1. PHP unit — no WordPress, no database.
composer test

# 2. PHP integration — needs MySQL running.
composer test:setup          # php bin/install-wp-tests.php
composer test:integration

# 3. JS unit.
npm run test:unit

# 4. End-to-end — needs a local WordPress site serving the plugin.
php bin/setup-e2e-site.php
npm run test:e2e:local -- --base-url=http://flow-manager.test
```

- **PHP binary.** Use a PHP build with `mysqli`, `curl` and `zip`, for example
  `G:/laragon/bin/php/php-8.3.33-Win32-vs16-x64/php.exe`. Composer scripts use
  whichever PHP runs Composer.
- **`bin/install-wp-tests.php`** is the local mirror of the CI steps that
  download core and write `tests/php/wp-tests-config.php`. It downloads a core
  checkout into `%LOCALAPPDATA%/sit-cwm-wp-tests/wordpress-<version>` (cached),
  creates the `sit_cwm_tests` database, and generates the config. The default
  version is the major.minor of the installed `wp-phpunit/wp-phpunit`: the test
  library and core must come from the same release, so do **not** point ABSPATH
  at a dev site running a different WordPress version. Options: `--wp`, `--dir`,
  `--db`, `--user`, `--pass`, `--host`, `--prefix`, `--force`.
- **`bin/setup-e2e-site.php`** prepares an existing local site: activates the
  plugin, switches plain permalinks to post-name permalinks, writes the
  WordPress rewrite rules to `.htaccess` (the CLI cannot detect `mod_rewrite`,
  so WordPress skips that itself, and `/wp-json/` 404s without it), and makes
  sure the administrator the specs log in as exists (`--admin-user`,
  `--admin-pass`, `--reset-password`). `--path` selects the WordPress root; it
  defaults to the site this plugin lives in.
- **`--install`** provisions a scratch site instead: it downloads core, creates
  the database, writes `wp-config.php` (with `WP_HOME`/`WP_SITEURL` pinned to
  `--url`) and installs WordPress. It keeps any core files and `wp-config.php`
  that are already there, so delete them to start over.

  ```sh
  php bin/setup-e2e-site.php --install \
    --path=G:/laragon/www/cwm-e2e --url=http://127.0.0.1/cwm-e2e --db=cwm_e2e
  ```

  It links the plugin into the new site; when Windows refuses the symlink it
  prints the `New-Item -ItemType Junction` command to run instead and stops.
- **`npm run test:e2e:local`** sets `WP_BASE_URL`, `WP_USERNAME` and
  `WP_PASSWORD` and runs Playwright without wp-env — `playwright.config.js`
  starts wp-env only when `WP_BASE_URL` is unset. Extra arguments are passed
  through (`-- --headed`, a spec path, …).
- **The specs are destructive**: `deleteAllPosts()` and `deleteAllUsers()` run
  before and after each spec file. Point them at a scratch site. For an
  isolated one, install a second Laragon site and junction the plugin into it
  (junctions need no elevation):

  ```powershell
  New-Item -ItemType Junction `
    -Path   "G:\laragon\www\cwm-e2e\wp-content\plugins\content-workflow-manager" `
    -Target "G:\laragon\www\flow-manager\wp-content\plugins\content-workflow-manager"
  ```

- Use `127.0.0.1` or a `.test` hostname rather than `localhost` if requests
  hang: Laragon's Apache listens on IPv4 only, and `localhost` can resolve to
  `::1`.

- Order independence is a release criterion (step 19), so check it with
  `vendor/bin/phpunit --testsuite integration --order-by=random`. Two fixtures
  exist only to keep that true: `TestCase::set_up_before_class()` installs the
  activity table *after* `parent::set_up_before_class()`, whose
  `$wpdb->db_connect()` drops the previous class's temporary tables, and
  `DatabaseTest::tear_down_after_class()` drops its leftover temporary table
  before reinstalling the real one. Install before either, and `dbDelta()`
  finds the temporary table, creates nothing, and the reconnect leaves the
  class with no activity table.
- Run the unit suite **without** `WP_PHPUNIT__TESTS_CONFIG` set (`composer
  test` does this for you). With it set, the bootstrap loads WordPress and the
  two `test_not_memoised_before_init` tests fail, because `init` has run.
- `tests/php/TestCase.php` is the base for new integration tests: real
  activity table, default capabilities, a fresh REST server per test, and
  `create_user_with_caps()`, `create_managed_post()`,
  `assert_activity_count()`, `assert_status()`, `rest_request()`,
  `assert_error_response()`.
- `tests/php/Traits/CreatesWorkflowPosts.php` creates the six-user fixture
  (admin, editor, author, contributor, reviewer, subscriber) once per class.
- `tests/php/integration/NegativeSuiteTest.php` is the security regression
  suite (step 19.4); it must never be skipped or weakened.
- `playwright.config.js` reuses the `@wordpress/scripts` preset with specs in
  `tests/e2e/`. The specs delete the posts and users they create before and
  after running, so they can run repeatedly against the same wp-env.
- CI (`.github/workflows/ci.yml`) runs phpcs, PHP unit and integration tests
  on PHP 7.4 / 8.1 / 8.3 × WordPress 6.5 / latest, then JS lint, Jest and a
  build that must not change `assets/build/`, and E2E on a single leg with
  artifacts uploaded on failure.

### Coverage

Not measured yet: it needs Xdebug or PCOV and a run of
`vendor/bin/phpunit --testsuite integration --coverage-text`. Record the
numbers here against the release minimums:

| Area | Minimum | Measured |
|---|---|---|
| `includes/Workflow/` | 90 % lines, 100 % of branches in `can_transition` / `transition` | — |
| `includes/Activity/`, `includes/Content/` | 80 % lines | — |
| `includes/REST/` | every route: happy path, unauthenticated, unauthorized, invalid input | — |
| JS hooks | loading / success / error each | — |

## Performance

The dashboard and timeline must stay flat as content grows: no reviewer,
author or activity query per row.

### Measuring

```sh
npm run env:start                          # wp-env includes Query Monitor
npx wp-env run cli wp eval-file wp-content/plugins/content-workflow-manager/bin/seed.php 500 10 5000
```

`bin/seed.php` (dev only, export-ignored) creates reviewers, workflow posts
with random statuses, reviewers and due dates, and activity rows spread over
90 days. Seeded posts carry `_sit_cwm_seed`, so they can be deleted with
`wp post delete $(wp post list --post_type=any --post_status=any --meta_key=_sit_cwm_seed --format=ids) --force`.

Read REST numbers from Query Monitor's `x-qm-*` headers (log in and send the
`wp_rest` nonce) or its admin bar panel on the dashboard page.

### Budgets

| Path | Budget | Measured (500 posts / 5 000 activity rows) |
|---|---|---|
| `GET /sit-cwm/v1/posts?per_page=100` | ≤ 8 queries, < 300 ms | — |
| `GET /posts/<id>/workflow` | ≤ 5 queries | — |
| `GET /posts/<id>/activity?per_page=20` | ≤ 4 queries | — |
| `POST /posts/<id>/workflow` | ≤ 10 queries | — |
| `POST /posts/batch` (50 posts) | linear, no per-post user query | — |
| Dashboard first paint | < 1.5 s | — |

Not measured yet: fill the column in from a seeded wp-env run.
`tests/php/integration/PerformanceTest.php` enforces the query budgets (not
the timings) in CI with `$wpdb->num_queries` deltas. For the collection and
the batch it also checks that the query count does not grow with the number
of rows.

### How the hot paths stay flat

- **Collection:** `PostRepository::query_posts()` runs one ids-only
  `WP_Query` (`fields => ids`, meta and term caches off, `per_page` capped at
  100, never `-1`). `PostsController::prepare_rows()` then loads posts and meta
  with `_prime_post_caches()`, the last activity of every row with
  `ActivityLogger::get_for_posts()` and every author and reviewer with one
  `get_users()` field-list query (`UserSummaries::load()`).
- **Batch:** `BulkProcessor::prime_caches()` loads the posts, their meta and
  every author, reviewer, payload reviewer and the acting user
  (`cache_users()`) before the loop. Authorization still runs per post.
- **Meta filters:** `meta_query` keeps the most selective clause first and
  combines at most a few clauses. Postmeta joins grow with the data, so a
  dedicated index table (`{prefix}sit_cwm_index`: status, reviewer and due
  date per post) is the follow-up for Pro-scale sites. It is not built in
  v1.0.
- **Settings:** `sit_cwm_settings` is small and autoloaded. Do not add large
  options; the DB version option is not autoloaded.

### Timeline index

The timeline query must use the `post_created (post_id, created_at)` key:

```sql
EXPLAIN SELECT * FROM wp_sit_cwm_activity
WHERE post_id = 123 ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET 0;
```

Expect `type: ref`, `key: post_created`. The `id` tiebreak can add
`Using filesort` over one post's rows only, which stays small. Record the
output here after running it on the seeded site.

### Front end

- One page at a time: pagination, sorting and filtering are server-side
  (`viewToQuery()`); nothing loads every row.
- Search input is debounced by DataViews itself (`useDebouncedInput`, 250 ms)
  before `onChangeView` fires. We do not add a second debounce on top of it.
- `usePosts()` aborts the in-flight request (`AbortController`) whenever the
  query changes.
- `fields` and `actions` are memoized, and every cell renderer is a `memo`
  component, so selection and hover changes do not re-render unchanged cells.

## Bundle size and `@wordpress/dataviews`

`@wordpress/dataviews` is not a core script for every supported WordPress
version, so it is bundled from npm. The dependency extraction plugin treats it
as a bundled package: `dashboard.asset.php` has no `wp-dataviews` dependency,
and the bundle never reads a `wp.dataviews` global (the only `wp-dataviews`
strings are CSS custom properties).

Measured with the step 16 dashboard (`@wordpress/dataviews` 19.0.0):

| File | Minified | Gzipped |
|---|---|---|
| `dashboard.js` | 831 KiB | 192 KiB |
| `dashboard.css` (includes DataViews' styles) | 90.7 KiB | 9.5 KiB |
| `sidebar.js` | 23.7 KiB | 7.8 KiB |

The budget is < ~300 KB gzipped for the dashboard. Webpack's 244 KiB
"asset size limit" warning refers to the uncompressed size and is expected.

**Compatibility caveat:** DataViews 19 externalizes to `wp-theme` and
`wp-private-apis`, which must be registered by core for the dashboard script
to print. WordPress 7.1 registers both. **Still unverified** against the
minimum supported version (`Requires at least: 6.5`; wp-env runs 6.7): if
core does not register `wp-theme` there, the dashboard script is silently not
printed and the page stays empty. Fix by pinning an older
`@wordpress/dataviews` or raising the minimum.

## Screenshots

The images in `docs/screenshots/` are generated, not hand-taken:

```sh
npm run screenshots -- --base-url=http://127.0.0.1/cwm-e2e
```

`tests/e2e/screenshots.spec.js` seeds a small editorial queue, then photographs
the sidebar, the timeline, the dashboard, the bulk-action dialog and the
settings screen at a fixed 1440×900 viewport. It is skipped unless
`CWM_CAPTURE` is set, so the CI end-to-end job never runs it. **It deletes every
post on the target site** — point it at a scratch site.
See [docs/screenshots/README.md](docs/screenshots/README.md).

## Releasing

### 1. Bump the version in exactly four places

The plugin header, `SIT_CWM_VERSION`, `package.json` and `readme.txt`'s
`Stable tag`. A header that disagrees with `Stable tag` is the classic
WordPress release bug — the update users are offered is not the code that
ships — so it is checked mechanically:

```sh
npm run check:version          # all four must agree
php bin/check-version.php 1.1.0   # …and equal this version
```

`release.yml` runs the same check with the tag name, so a tag that does not
match the files fails the build before anything is published.

### 2. Build and regenerate

```sh
npm run build        # assets/build/ is committed (D11) — commit the diff
npm run makepot      # languages/sit-cwm.pot
```

CI fails if `npm run build` produces a diff against the committed output, so
this is not optional.

### 3. Update the changelog

`CHANGELOG.md`, Keep a Changelog format, with a dated heading:
`## [1.1.0] - 2026-11-04`, plus the matching entry in `readme.txt`'s Changelog
and Upgrade Notice sections.

### 4. Green CI on every leg

PHP 7.4 / 8.1 / 8.3 × WordPress 6.5 / latest, plus the JS and end-to-end jobs.
No exceptions, no "just this once".

### 5. Build and inspect the zip

```sh
npm run build:zip          # → dist/content-workflow-manager.zip
php bin/build-zip.php --list   # what would ship, without building
```

`bin/build-zip.php` reads `.distignore` and needs only PHP with `ZipArchive` —
no rsync, no zip binary. The release workflow runs the same script, so what you
inspect locally is what CI publishes. The zip must contain `assets/build/`,
`languages/`, `readme.txt` and `LICENSE`, and must **not** contain `tests/`,
`src/`, `bin/`, `vendor/`, `node_modules/`, `.github/`, `.claude/` or any
Markdown. CI asserts all of that, then runs `php -l` over every shipped file on
PHP 7.4.

### 6. Install it into a clean WordPress and use it

Upload the zip to a fresh site with `WP_DEBUG` and `WP_DEBUG_DISPLAY` on,
activate, and walk one post through the whole flow by hand: Draft → Writing →
Review, assign a reviewer and a due date, comment, send back, approve, mark
published. No notices, no warnings, no fatals. Automated end-to-end tests are
not a substitute for installing the artefact you are about to publish.

### 7. Tag and push

```sh
git tag v1.1.0
git push origin v1.1.0
```

`.github/workflows/release.yml` fires on `v*`: it re-checks the version against
the tag, rebuilds and compares `assets/build/`, builds the zip, verifies its
contents, lints every shipped file on PHP 7.4, and attaches the zip to a
**draft** GitHub release. Review the generated notes and publish it.

### 8. WordPress.org, when publishing there

Copy the tagged tree into SVN `trunk/`, tag it, and put
`docs/screenshots/*.png` into SVN `assets/` renamed `screenshot-1.png` …
`screenshot-5.png`, in the order `readme.txt` lists them (sidebar, dashboard,
timeline, bulk actions, settings). `Stable tag` is what controls which version
is served — it is already checked in step 1, but it is the one line worth
re-reading before committing.
