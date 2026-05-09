# rose-concretecms

Concrete CMS site management for ProjectRose. Connect one or more self-hosted Concrete CMS v9 sites via OAuth API integrations; both the AI agent and the user-facing UI can browse and operate on pages, files, users, groups, and topic trees.

## Setup

1. In your Concrete CMS site (v9+), open **System & Settings → API → Integrations** and create a new API Integration.
2. Grant the scopes you want the extension to use, e.g. `system_info`, `page_read`, `page_write`, `file_read`, `file_write`, `user_read`, `user_write`, `group_read`, `group_write`, `topic_read`, `topic_write`.
3. Copy the generated **Client ID** and **Client Secret**.
4. In Rose, open the Concrete CMS extension's Settings page.
5. Add a site: friendly name, base URL (must be `https://` unless `localhost`), client ID, client secret, and the chosen scopes.
6. Click **Test Connection** — the extension performs a token grant and discovers page types, page templates, attribute keys, and topic trees.

## Permissions

The granted scopes on the API Integration determine what the extension can do. If a tool returns `Missing scope: <name>`, edit the integration in the CCMS dashboard, add the scope, and refresh discovery in Rose.

## Caveats

- **Self-hosted Concrete CMS v9 only.** Older versions and concrete5 5.7 are not supported.
- **Page content (Areas/Blocks) is not editable via this extension.** v1 covers metadata, lifecycle, attributes, and structural moves — not block-level editing.
- **No package/theme management.** v9 REST does not expose those endpoints.
- **Tokens are short-lived.** The extension caches OAuth bearer tokens in memory and re-grants when expired; tokens are never persisted to disk.
- **HTTPS only.** The extension rejects `http://` URLs except when the host is `localhost`.

## Storage

- Site metadata (`ccmsSites`) lives in the project's `.projectrose/config.json` — safe to commit. Includes the non-secret `clientId` and the requested scope list.
- Client secrets (`ccmsCreds`) live in the user's `userData/settings.json` — never committed.
- Bearer tokens live only in main-process memory; they are dropped on app restart.

Removing a site removes both records.
