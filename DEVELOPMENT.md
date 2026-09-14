# Development

Notes for working on Content Workflow Manager. Step 23 expands this into the
full developer guide.

## JavaScript build

Tooling is `@wordpress/scripts` (Node 20+; developed on Node 24).

```sh
npm install
npm run build       # production build → assets/build/
npm run start       # watch mode
npm run lint:js     # ESLint (flat config, @wordpress/eslint-plugin)
npm run lint:css    # stylelint
npm run format      # wp-prettier
npm run test:unit   # Jest, tests/js/
npm run test:e2e    # Playwright (needs @playwright/test, added with the e2e step)
npm run env:start   # wp-env (WordPress 6.7, PHP 7.4)
npm run makepot     # needs wp-cli on PATH
```

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
