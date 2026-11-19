# Superstar Project Handoff

This file is a project guide for future AI assistants working on Superstar. Treat the current source code and Render/GitHub configuration as authoritative if they differ from this summary. Do not put access codes, session tokens, deploy-hook URLs, or other secrets in this file.

## Project and deployment

- Superstar is a Node.js/Express website in the `Dk7612/Superstar` GitHub repository.
- The production site is `https://superstar-oa7t.onrender.com`.
- Production deploys from the `main` branch. A GitHub Actions workflow at `.github/workflows/render-deploy.yml` calls Render's deploy hook when `main` changes. The hook URL is stored as the repository Actions secret `RENDER_DEPLOY_HOOK`; never print or commit it.
- The user has explicitly asked that when they request a push, the work should be committed, pushed to `main`, and redeployed to Render. Verify the GitHub Actions run and the live site afterward. Do not push or deploy when they have not asked for that.
- Render needs a persistent disk mounted at a stable path and `DATA_DIR` set to that mount (for example, `/var/data`) to retain server data between restarts and deploys. This repo has no `render.yaml`; do not assume the disk or environment variable is configured just because code supports it.
- The server requires `ADMIN_CODE`; `SUPERADMIN_CODE` is accepted as a legacy fallback. Do not put access-code values in source or documentation.

## User requests and delivered behavior

The following captures the known requests and decisions from the project history:

1. **Login and site appearance**
   - Before sign-in, show a plain, boring white login screen.
   - After sign-in, reveal the Superstar dashboard, stars, theme, and navigation.
   - Keep `/games` behind the sign-in flow and maintain a usable experience on mobile.
   - Show the Superstar logo/favicon in the site navigation.

2. **Starfield**
   - The shared starfield settings are available on the dashboard and Games page and should continue to work consistently.
   - The requested default settings are **Down-left**, **Fast**, and **Dark**.
   - Preserve user-selectable direction, speed, and theme settings.

3. **Roles and login codes**
   - The configured administrator is called **Admin** (not Superadmin) and is the only account with admin management privileges.
   - Do not offer generation of Admin accounts. Generated login codes are Guest accounts.
   - Admins can choose a custom Guest code using 4–32 letters, numbers, hyphens, or underscores; an empty field generates a random code. Reject duplicates and invalid values.
   - Keep generated codes and their creation order persistent; newly generated codes appear at the bottom of the list.
   - The previously configured `USER_CODE` login is disabled. Preserve compatibility with existing deployments as implemented in the current server code.

4. **The Drop**
   - The first game is a vertical dropper: fall down through obstacles, steer through openings, and make all 50 levels progressively harder.
   - Retain controls, progress indicators, retry/level-complete/pause states, unlocked-level progression, and best times.

5. **Skyfall 3D and Games page**
   - Skyfall should be a real 3D game, not a 2D perspective effect, and the fall must travel down rather than forward.
   - Skyfall uses native WebGL (no external game assets or rendering dependency), keyboard/touch steering, and drag-to-look-around controls. It also has 50 progressively harder levels.
   - Skyfall's reusable `physics3d.js` engine is dependency-free and Roblox-inspired: it uses fixed-step gravity, rigid bodies, box/sphere/plane colliders, rotation, collision response, collision groups, sensors, and raycasts. It is an original small engine, not a port or replica of Roblox's proprietary engine.
   - Skyfall builds its start platform, shaft walls, gate obstacles, and player from those physics primitives; its orbit camera raycasts against colliders to stay on the near side of walls.
   - Skyfall controls are camera-relative: W/S move forward/back in the view's horizontal facing direction, A/D strafe, and the avatar turns to face the camera yaw in a Roblox shift-lock style. The character starts on a short runway over the platform opening and walks forward into the drop.
   - The avatar has animated arm/leg gait while walking and a spread-limb falling pose while airborne. Keep the model heading, camera heading, and camera-relative movement basis synchronized when changing controls.
   - Present the real games together on one Games page as a gallery with preview art and each game's title beneath it. Selecting a tile opens its game, and players can return to the gallery.
   - Provide a fullscreen option for every game.
   - Do not add fake game tiles or external assets/dependencies without asking.

6. **Progress and accounts**
   - Save game unlocks and best times per login code on the server, with browser-local progress as a fallback and a one-time merge of existing local progress.
   - Keep separate reset-progress controls for each game and make resets explicit/confirmed.
   - Admins can set or change an account's display name.

7. **Trusted Admin device and cookie consent**
   - Never grant Admin access based on a client-supplied device ID alone; it can be copied or spoofed.
   - The user chose a safer opt-in trusted-device flow after one normal Admin login. The consent popup is Admin-only, appears after login, slides in from the bottom-left, and offers allow or reject.
   - When allowed, use an opaque random HttpOnly cookie bound to the browser's device ID, store only its hash/expiry on the server, and renew its 30-day expiry on subsequent Admin login or trusted-session restore. Respect rejection and allow changing the setting later.
   - Trusted-device records only survive server restarts/redeploys when the Render `DATA_DIR` is backed by persistent storage.

8. **Admin-session persistence across redeploys**
   - The Admin dashboard's users, login-history, and bans requests share the same server-issued authentication session. A previous version kept session tokens only in process memory, so a deploy invalidated them and made all three views fail together.
   - The current implementation persists a SHA-256 hash of each active login token plus its account code and expiry in `DATA_DIR/service-data.json`. It does not write the raw bearer token to disk. Sessions expire after 30 days.
   - On an Admin API 401/403, the dashboard attempts trusted-cookie restoration. If that is not available, it clears the stale session and reloads to the login screen.
   - A token issued before hashed-session persistence was deployed cannot be recovered from disk; sign in once after deploying the new version (or let a valid trusted-device cookie restore it). Future session hashes survive deploys only if `DATA_DIR` points to the same persistent disk.

9. **Deployment preference**
   - The user repeatedly asked for changes to be committed/pushed and for Render to redeploy afterward, and explicitly set this as their preference whenever they ask to push.
   - GitHub Actions deployment requires the `RENDER_DEPLOY_HOOK` Actions secret. Render's built-in Auto-Deploy may need to be disabled if it causes duplicate deploys. Never reveal the hook value.

## Main implementation files

- `server.js`: Express routes, login/session authorization, Admin API, account/game saves, persistent state, trusted-device cookies, and static page/script routes.
- `index.html`: white logged-out state, dashboard, login, Admin user/code/history/ban panels, cookie consent, and star settings.
- `games.html`: game gallery, game UI, account-save client, fullscreen controls, and shared star settings.
- `dropper.js`: The Drop gameplay and level progression.
- `dropper3d.js`: Skyfall's WebGL renderer and gameplay.
- `physics3d.js`: reusable fixed-step 3D rigid-body physics shared by Skyfall and future browser games. It exposes `window.SuperstarPhysics3D` and a CommonJS export for tests.
- `test/physics3d.test.js`: built-in Node tests for gravity, collisions, rotation, sensors, masks, and raycasts.
- `starfield.js`: shared starfield behavior and settings.
- `data/service-data.json`: default server data location when `DATA_DIR` is not set. Do not commit live state or secrets.
- `.github/workflows/render-deploy.yml`: Render deploy-hook workflow for pushes to `main`.

## Development and verification

- Install dependencies only if needed; the project uses Express and existing dependencies are recorded in `package.json`/`package-lock.json`.
- Run `node --check server.js`, `node --check dropper.js`, and `node --check dropper3d.js` after JavaScript changes. For inline page scripts, parse/exercise the embedded scripts or verify the affected flow in a browser.
- Run `node --check physics3d.js` and `node --test test/physics3d.test.js` to validate the reusable physics engine.
- Use an isolated temporary `DATA_DIR` for local server tests so the user's or repository's persistent data is not altered.
- For session-persistence changes, test login, confirm only a token hash is stored, restart the server using the same `DATA_DIR`, and verify the same session still authorizes Admin and game-save endpoints.
- For game changes, verify both games, all 50 levels/progression surfaces, gallery selection/back behavior, touch/keyboard controls, fullscreen where supported, and shared star settings.
- After an explicitly requested deploy, confirm the workflow succeeded for the new `main` SHA and check the live site's relevant page/assets.

## Working preferences and safety notes

- Implement the requested behavior rather than only describing a plan when the request is clear.
- Preserve existing working features and avoid unrelated changes. Ask before making significant behavior/design choices that are not established above.
- Keep secrets out of source, documentation, logs, and chat; never expose Render deploy-hook values or admin credentials.
- Use the actual Render persistent disk for durable state. A local `data/` directory or an ephemeral Render filesystem is not a guarantee of persistence.
- Do not push or commit unless requested. When the user says “push,” they mean **commit, push to `main`, and redeploy Render**.


## Superstar floating mini-window extension

- The replacement for the old Tampermonkey userscript is a Manifest V3 browser extension in `browser-extension/`. It is intended for Opera GX (Chromium) and can also be loaded unpacked in compatible Chromium browsers.
- `browser-extension/manifest.json`: extension metadata, storage permission, production-site host permission, and a content bridge limited to the exact production origin.
- `browser-extension/service-worker.js`: stores the selected mini-window mode in `chrome.storage.local`, opens a separate popup window from the toolbar action, and handles allowlisted requests from the Superstar dashboard.
- `browser-extension/content-bridge.js`: bridges only `GET_MINI_MODE`, `SET_MINI_MODE`, and `OPEN_MINI_WINDOW` messages from the exact production origin. It does not inspect Gimkit or other pages.
- `browser-extension/global-player.js`: a discreet, bottom-left launcher using the existing Superstar favicon/logo. Clicking it expands a compact conversational AI chat panel; the panel keeps the current page-load conversation in memory and sends only user-entered chat messages to `POST /api/ai/chat`. It does not inspect page content or interact with host-page controls.
- `browser-extension/helper.html` and `helper.js`: retained as a legacy standalone helper page for compatibility; the global on-page widget is the primary AI experience.
- The AI helper does not read page content, inspect hidden answers, or click answers. The former `superstar-gimkit.user.js` userscript is retired and removed from the repository. Existing installed Tampermonkey copies are not remotely uninstalled; the user must remove/disable the old script manually after testing the extension.
- Dashboard setting in `index.html`: authenticated users can choose **AI Helper** or **Full Superstar Website**, save the preference to extension storage, and open the selected popup. The extension toolbar icon uses the same saved preference.
- The Full Superstar Website mode opens the production site in a separate browser popup window. It shares the normal browser profile's website storage/cookies, subject to the browser's usual same-origin rules.
- Installation (Opera GX): open `opera://extensions`; enable **Developer mode**; choose **Load unpacked**; select the repository's `browser-extension` folder. Keep the extension enabled. Then reload the Superstar dashboard, sign in, and use its **Superstar Mini Window** settings card. The toolbar icon opens the selected mode.
- This is a locally loaded unpacked extension, not a published Opera Add-ons listing. The user must keep the folder on disk; do not move or delete it after loading.
- Extension permissions are intentionally narrow: `storage` plus host access to `https://superstar-oa7t.onrender.com/*`. No Gimkit host access, page-reading permission, or answer-click permission is requested.
- AI backend: `POST /api/ai/answer` accepts JSON `{ "question": "...", "choices": ["...", "..."] }` and returns `{ "answer", "explanation", "confidence" }`. Gemini 2.5 Flash is called server-side using `GEMINI_API_KEY`; never put that key in extension files or Git. The route currently limits requests to 20 per IP per minute.
- Testing checklist: validate the extension manifest JSON; run `node --check browser-extension/service-worker.js`, `node --check browser-extension/content-bridge.js`, and `node --check browser-extension/helper.js`; load the unpacked extension; verify the dashboard detects it; save each mode and verify both the dashboard Open button and toolbar icon create a separate popup; submit a manual question with 2+ choices and verify success/error handling; confirm no Gimkit content is read or clicked.
- Deployment: dashboard settings are served by `index.html` and require a Render deploy to become available on the live site. Extension files are loaded locally from the repository folder and do not need to be hosted by Render. Do not claim production is updated until the branch is merged/deployed and the relevant live flow is smoke-tested.

## Latest change set — floating mini-window extension migration

- Added a Manifest V3 Opera GX / Chromium extension with a separate popup window and two saved modes: standalone AI Helper and Full Superstar Website.
- Added an authenticated-dashboard settings card in `index.html` to save the mode and open the mini-window through a tightly scoped extension message bridge.
- Added a manual-only AI helper UI using the existing server-side Gemini endpoint. No API key is exposed to the extension.
- Removed the old Tampermonkey userscript from the repository. This does not uninstall a copy already installed in the user's browser; user must manually remove it after the extension is installed and tested.
- Updated this handoff file alongside the implementation. The work is on branch `superstar-floating-mini-window`; it is not live until merged into `main` and deployed through the existing Render workflow.


## Global mini-player and inline AI (v1.1.0)

- Added `browser-extension/global-player.js`, injected into ordinary web pages via the `<all_urls>` content-script match. It creates a compact, fixed-bottom-right Spotify-inspired Superstar bar inside a closed Shadow DOM so host-page CSS does not style the widget.
- The collapsed bar has **AI**, **Open**, and **−** controls. AI expands a manual question-and-choices panel directly on the current website; it submits only the text the user enters to the existing `POST /api/ai/answer` endpoint. It does not scrape page content, read hidden answers, or click anything.
- The Open link opens the Superstar site in a new tab. The minus control dismisses the widget for the current page load.
- The extension now requests broad site access (`<all_urls>`) so the user can see the mini-player on websites other than Superstar. Opera may show a sensitive “read and change your data on all websites” permission prompt. This permission is required for the requested cross-site overlay; the script itself does not inspect page content.
- The extension still requires the Superstar API host permission to call the AI endpoint. The Gemini key remains server-side.
- Updated installation: after pulling the new extension files, open `opera://extensions` and press Reload on Superstar Mini Window. If Opera asks for broader website access, grant it to enable the global player. Existing loaded folders update only when the files on disk are replaced and the extension is reloaded.
- Verification checklist: parse `manifest.json`; run `node --check browser-extension/global-player.js`, `node --check browser-extension/service-worker.js`, `node --check browser-extension/content-bridge.js`, and `node --check browser-extension/helper.js`; test on a normal HTTPS page and on Superstar; test collapsed/expanded state, AI validation, API success/error, mobile width, and confirm the widget never reads or modifies host-page content.


## Self-hosted signed extension updates

- The extension manifest declares `update_url` as the update XML asset on the latest GitHub Release: `https://github.com/Dk7612/Superstar/releases/latest/download/updates.xml`.
- `.github/workflows/publish-extension.yml` builds a CRX3 package whenever extension files change on `main` (or by manual workflow dispatch), then publishes `Superstar.crx` and `updates.xml` to a versioned GitHub Release. The update XML points at the stable latest-release CRX URL.
- Every release must use the same private signing key. The workflow reads only the base64-encoded PEM from the repository Actions secret `EXTENSION_PRIVATE_KEY_B64`; never commit the PEM, print it, or put it in this README. Losing/changing this key changes the extension identity and breaks in-place updates.
- Before the first publish, the repository owner must create a persistent RSA private key locally and add its base64 encoding as the GitHub Actions repository secret `EXTENSION_PRIVATE_KEY_B64`. The setup instructions must explain that this is a one-time operation and that the key must be backed up securely offline.
- Bump `browser-extension/manifest.json` `version` for every extension release. The workflow rejects a duplicate release tag rather than silently replacing a published package.
- A currently unpacked Developer Mode installation is not automatically migrated by adding `update_url`; users must perform a one-time install of the signed package. Whether Opera GX on a particular Windows installation accepts externally hosted CRX auto-updates depends on its Chromium/Opera distribution policy. Verify the actual Opera installation path before promising unattended updates; a store install or managed-install policy may be required by the browser.
- The extension's broad `<all_urls>` access remains intentional for the global overlay. The updater does not add page-reading or answer-clicking behavior.
- Verification: parse the manifest, validate the workflow YAML, run the CRX build with a disposable test key in CI/local testing, inspect the generated XML for the exact version and stable CRX URL, and verify the CRX is signed with the persistent public key. Do not test with or replace the production signing key.


## Conversational left-side AI launcher (v1.1.2)

- Replaced the wide floating mini-player bar with a single circular launcher at the bottom-left, displaying the same `/favicon.png` Superstar logo used by the website.
- Clicking the logo opens a compact chat panel above it; clicking the logo again or the close control collapses the panel. The widget stays on the left and is responsive on narrow screens.
- Replaced the multiple-choice-only widget with a general conversational chat UI: free-form messages, Enter to send, Shift+Enter for a newline, user/assistant bubbles, and an in-memory conversation history for the current page load. There is intentionally no new-chat/reset button.
- Added `POST /api/ai/chat`, using the existing server-side Gemini 2.5 Flash integration. It accepts up to 12 recent messages, validates roles and lengths, applies the existing 20-requests-per-IP-per-minute limit, and never exposes `GEMINI_API_KEY` to the extension.
- The legacy `/api/ai/answer` endpoint and helper page remain available for compatibility; the global launcher now uses only the conversational endpoint.
- Bumped the extension version to 1.1.2 so the signed-release workflow can publish the update. Keep the persistent extension signing key unchanged.
- Verification: run `node --check server.js` and `node --check browser-extension/global-player.js`; validate `browser-extension/manifest.json`; exercise chat with multi-turn messages, empty input, rate limiting, provider errors, and mobile-width layout. Do not claim the live extension changed until the branch is merged and the extension release workflow succeeds.


## Public feature suggestions and private admin idea inbox

- The main dashboard footer links to the public \`/ideas\` submission page. Visitors submit a title and description; the page does not expose stored submissions.
- \`POST /api/ideas\` validates lengths, limits each IP to five submissions per hour, and asks Gemini 2.5 Flash for a short title, concise actionable summary, and fixed category.
- The original title and description are retained beside the AI summary. Gemini output is schema-constrained and validated before storage.
- Ideas are atomically saved to \`DATA_DIR/ideas.json\` (default local \`data/\`). On Render, \`DATA_DIR\` must point to a mounted persistent disk path or submissions may be lost on restart/redeploy. Submissions are not committed to Git.
- \`GET /admin/ideas\` is protected by \`requireAdmin\`; the inbox appears only in the authenticated admin dashboard. It displays summaries, category, date, and original text, using \`textContent\` to avoid HTML injection.
- Admins can copy the summary and original submission to bring selected ideas into a ChatGPT conversation. There is no public read endpoint.
- Verification: syntax-check \`server.js\`; validate the ideas page script; test valid/invalid/oversized submissions, Gemini failures, rate limits, public 403 access to \`/admin/ideas\`, admin access, and persistence across restarts on the configured Render disk.


## Hover launcher and mini-app menu (extension v1.2.0)

- Replaced the always-visible AI chat launcher with a minimal bottom-left Superstar logo. The launcher button itself has a transparent background, no border, and no panel while idle.
- Hovering the logo opens a compact translucent menu. The menu and logo share one hover/focus boundary; leaving that area hides the menu. Keyboard Escape closes it, and keyboard focus leaving the widget also closes it. On touch devices, tapping the logo opens the menu and the close control dismisses it.
- The menu currently offers Games, AI Assistant, Subway Surfers Focus, and Full website. The website option opens the full Superstar site, which retains the complete website experience and game library.
- The extension Games view intentionally contains only the built-in Flappy Bird mini-game. The full Games page on the website is not restricted by this extension-only selection.
- The AI view uses the existing server-side `POST /api/ai/chat` endpoint and keeps a short in-memory conversation for the current page load. No API key is included in extension code.
- Subway Surfers Focus is currently a lightweight 25-minute focus timer; it does not embed or reproduce Subway Surfers gameplay or video. The timer continues when the hover menu closes and is reset only by its Reset control.
- Flappy Bird is a small original canvas mini-game with pointer/tap and Space controls, scoring, collision detection, and restart. It runs only while its Games view is active.
- The launcher is rendered in a closed Shadow DOM. It does not inspect page text, hidden content, or host-page controls. It remains injected on pages covered by the manifest's existing content-script match patterns.
- Bumped `browser-extension/manifest.json` to 1.2.0. Keep the existing persistent CRX signing key unchanged for future signed releases.
- Verification checklist: parse manifest JSON; run `node --check browser-extension/global-player.js`; manually load/reload the extension in Opera GX; verify idle state shows only the transparent star; hover opens the menu; moving the pointer away closes it; test AI multi-turn chat, Flappy Bird pointer/Space/restart, focus timer continuing after the menu hides, and Full website navigation. Verify the website's complete Games page remains unchanged.
- Do not claim the change is live until this branch is merged and the Render/extension publishing workflows have succeeded.

## Extension v1.2.0 startup hotfix — escaped template literals

- Fixed a release-blocking JavaScript syntax error in `browser-extension/global-player.js`: template-literal delimiters for the injected stylesheet and menu markup were incorrectly written with preceding backslashes (`\\``), which made the content script fail to parse before creating the launcher.
- Restored ordinary JavaScript backtick delimiters in both template literals. No launcher behavior, permissions, or host-page access was changed.
- Regression verification: run `node --check browser-extension/global-player.js` and inspect the published extension package before release. The same syntax error can affect every tab because the same content script is injected into each matching page.
- Bump the extension version and publish a newly signed CRX using the existing persistent signing key; do not change the extension identity.


## Extension v1.2.2 hover-boundary and logo-background fix

- Fixed the hover-to-menu transition that could dismiss the popup while the pointer moved from the bottom-left launcher up into the menu. The launcher, menu, and tool view now each manage pointer entry/exit, with a 1,000 ms delayed close so the pointer can cross the small visual gap.
- Replaced immediate focus-loss dismissal with the same delayed close. Clicking a menu option or moving focus between controls no longer instantly hides the menu; an active pointer over the widget keeps it open.
  - Focusout dismissal is suppressed while the mouse pointer is still inside the widget, including the moment an option click replaces the menu contents with a tool view.
- Touch interaction remains click-based; the hover dismissal timer is only driven by mouse pointer events.
- The shared `/favicon.png` asset has a dark navy square background baked into the image. Removed blend-mode styling. Both logo instances now use an SVG luminance-to-alpha filter that makes the dark pixels baked into the favicon transparent while retaining the bright multicolor star; the launcher button itself remains transparent and has no border or shadow.
- No new permissions, page-reading behavior, or host-page interaction was added.
- Bumped the extension version to 1.2.2. Publish with the existing persistent CRX signing key and do not change the extension identity.
- Regression checklist: run `node --check browser-extension/global-player.js`; validate manifest JSON; test moving the mouse from the star to each menu option, clicking Games/AI/Focus/Full website, moving between menu and launcher, waiting outside the widget for dismissal, keyboard focus/Tab/Escape, and touch tap behavior. Confirm the favicon's dark square is actually transparent, not blended against the webpage, on both light and dark page backgrounds.
- Runtime browser verification is still required; source changes and a successful packaging workflow alone do not prove the visual result in Opera GX.


## Extension launcher hit-area sizing refinement

- Keep the closed launcher shell at exactly the 46×46 px launcher width so the transparent, otherwise-empty portion of the extension does not intercept clicks across the bottom-left of the host webpage.
- Add the `open` class only while the menu/tool GUI is visible. That state expands the shell to the menu's responsive width (up to 310 px); closing the GUI removes the class and restores the compact hit area.
- The launcher itself remains 46×46 px in both states. Only the surrounding widget area expands when the GUI needs room for its controls.
- Regression checks: with the menu closed, click and drag across the area to the right of the star and confirm the webpage receives those interactions; open the menu and confirm all menu options and tool controls remain clickable; close it and confirm the hit area shrinks again. Re-run `node --check browser-extension/global-player.js` and validate the manifest before publishing.


## Extension menu dismissal behavior refinement

- The launcher still opens the menu on mouse hover and on click/tap.
- Moving the pointer away from the launcher, menu, or tool view no longer dismisses the GUI. Removed pointer-leave timers and focus-loss dismissal.
- The GUI now closes only when the user clicks outside the extension host. The document-level click listener runs in capture phase and checks the composed event path, so clicks inside the closed Shadow DOM (menu options, AI input/send, game, focus controls, back/close) are treated as inside and do not accidentally dismiss the GUI.
- The explicit × close control and Escape key continue to close the GUI. Clicking the launcher while already open does not force-close it; an outside click is the dismissal gesture.
- Regression checks: open the launcher, move the pointer anywhere outside without clicking (GUI must remain open), click outside (GUI must close), then verify all internal controls remain usable and do not trigger outside dismissal. Confirm closed hit area remains 46×46 px and open hit area expands with the GUI.


## Subway Surfers Focus view persistence

- When the Subway Surfers Focus tool is open, clicks outside the extension host do not dismiss the GUI; the focus timer remains visible while the user interacts elsewhere on the page.
- Clicking the Superstar launcher star closes the Focus view. The launcher hover handler must not switch away from Focus while the GUI is already open.
- Other extension menu/tool views retain the normal click-outside-to-dismiss behavior; the explicit × and Escape close controls remain available.
- Regression checks: open Focus, click outside (must remain open), click the launcher (must close), then verify outside clicks still dismiss other views.


## Guest-code permissions and click-only launcher (work in progress)

- Added an admin-only default permission editor for newly generated guest codes and an individual **Permissions** button beside every generated access code.
- Permission categories: Dashboard, Games, Extension, AI Assistant, and Feature Ideas. Changing defaults does not overwrite existing guest-code settings; each code can be customized independently.
- Permission settings are persisted in `DATA_DIR/service-data.json`. Existing guest codes default to full access for backwards compatibility. Admin access and the existing ban system remain unchanged.
- The game-save API checks the guest's Games permission server-side; this is not just a hidden navigation link.
- The extension launcher now opens only when the star is clicked. Hover no longer opens it, and clicking the star toggles the menu.
- The favicon transparency filter uses a low luminance threshold to retain darker star colors while suppressing the dark navy tile. Verify the star and background visually in Opera GX on both light and dark pages.
- Verification still required: `node --check server.js`, `node --check browser-extension/global-player.js`, manifest JSON validation, default inheritance and per-code override tests, Games API 403 test, and manual click-only launcher testing.


## Extension account binding and per-guest access

- The authenticated Superstar dashboard sends its current session token only to the extension content bridge on the exact Superstar production origin. The bridge forwards it to the extension service worker, which stores it in extension-local storage.
- The floating launcher remains hidden unless the stored session token is valid and the server reports the guest's Extension permission enabled. Permission checks are performed against `GET /account/permissions`; the extension does not rely on a page-supplied permission flag.
- The extension AI chat sends the stored session token to `POST /api/ai/chat`. The server enforces the AI permission with session authentication. The launcher requires a signed-in Superstar account; after first sign-in, reload tabs to initialize the content script.
- The AI endpoint and game-save endpoints are permission-gated server-side. The existing ban system is unchanged.


## Permission enforcement coverage and release notes

- Existing guest accounts are migrated to a snapshot of the current default permissions on first startup, so changing defaults later does not silently change older accounts.
- Admin accounts always receive all permissions regardless of guest defaults.
- Guest permissions are checked for the Dashboard, Games page, Extension launcher/toolbar popup, AI Assistant endpoints, and signed-in Feature Ideas page. Anonymous public idea submissions remain public as before.
- The AI chat and legacy AI answer endpoints require a valid Superstar session and the guest's AI permission. Both extension AI clients attach the session token from extension-local storage.
- Extension v1.2.3 contains the click-only launcher and permission-aware menu. The star's dark-background alpha filter has a lower threshold to preserve more of the original star artwork.


## Account-backed extension preferences, ban revocation, and installer

- Extension settings live in `chrome.storage.local` and sync to the signed-in Superstar account through `GET/PUT /account/extension-preferences`. The server stores them in `service-data.json`, alongside access codes, bans, permissions, and game progress, so a future app can reuse the same account preferences.
- Only accounts with the **Extension** permission can read or write extension preferences. The dashboard saves settings only when the extension responds; if the extension is not installed/connected, the preference controls remain unavailable. Disabling Extension permission blocks preference sync server-side.
- Preferences include mini-window mode and a concise quiz-answer setting (default on). Quick Reply is only applied to quiz-question suggestions; general AI chat remains normally conversational.
- Authentication sessions now retain originating device ID and IP. Adding a device/IP ban revokes matching active sessions; subsequent authenticated requests also check the ban list. Older sessions fall back to their latest login record.
- The admin dashboard polls login history while open so new logins appear without manual refresh.
- Admin storage status displays the active `DATA_DIR` and whether the environment variable is configured. This does not prove a Render disk is attached: Render must mount a persistent disk at that exact path. Without that, access codes, bans, preferences, game progress, and ideas can be lost when the instance is replaced.
- Public installer: `/install`, linking to the signed latest CRX at `https://github.com/Dk7612/Superstar/releases/latest/download/Superstar.crx`. Signed CRX installations can use the existing update XML; an unpacked Developer Mode installation must be replaced once by the signed package to enter the auto-update channel.
- Extension version is 1.2.4. Keep the existing persistent CRX signing key.


## Ban enforcement and admin live login monitor

- Every account/admin API request validates the session's originating device and IP against the current ban lists. A new ban also removes matching live sessions immediately; legacy sessions use the account's latest login-history record as a migration fallback.
- The dashboard checks its active session every five seconds so a newly banned user is redirected out instead of remaining on a stale authenticated page. Extension content scripts re-check Extension permission periodically, and toolbar popup opens always validate against the server.
- The admin login-history panel refreshes every four seconds while the tab is visible and displays how many new logins were detected since the previous poll.
- The ban confirmation result reports how many active sessions were revoked.


## Quick-reply preference behavior

- The saved Quick replies preference is used only by the quiz-question answer endpoint (`POST /api/ai/answer`). When enabled, question explanations are concise; when disabled, they can teach the reasoning in more detail.
- General conversational AI (`POST /api/ai/chat`) ignores this setting and answers naturally with appropriate detail. The extension chat and website AI tab do not send a Quick Reply flag.
- The extension's mini-window mode and quiz Quick Reply preference are synchronized to the account and retained in local extension storage.


## Client-side ban session refresh

- The main dashboard and Games page periodically validate the signed-in session against the server. If a device/IP ban revokes the session, the affected page redirects to the login screen within approximately five seconds.
- The dashboard waits for the extension's session-token handoff response before requesting synced extension preferences, avoiding a race on first login.


- The optional Gimkit/Blooket helper sends the account's Quick replies preference with each suggestion request; the backend uses it to choose concise or fuller explanations. The helper only suggests an answer and does not click or submit quiz answers.


## Dashboard permission-overlay login hotfix

- Fixed the access-denied overlay in `index.html`: removed the inline `display:grid` declaration that overrode the browser's built-in `[hidden]` behavior. The overlay now stays hidden on initial page load and only appears when the authenticated guest account actually lacks Dashboard permission.
- This restores visibility of the login form for signed-out visitors and users who need to sign in with an admin access code to repair a guest permission setting.
- Verification: inspect the overlay markup and confirm it has the HTML `hidden` attribute without an inline `display` override; run a browser smoke test for logged-out, admin, dashboard-enabled guest, and dashboard-disabled guest states before release.


## Extension launcher visibility hotfix

- Fixed a startup-order bug in `browser-extension/global-player.js`: the first extension-permission check ran before the closed Shadow DOM variable `root` was initialized. Accessing `root` triggered a temporal-dead-zone ReferenceError, which the catch block interpreted as an access failure and hid the launcher.
- Permission polling and storage-change listeners now start only after the Shadow DOM and launcher/menu elements are created. The launcher remains hidden until a valid signed-in session has Extension permission, then becomes visible and applies per-feature menu permissions.
- Verification: run `node --check browser-extension/global-player.js`, validate the manifest, and manually test signed-out, signed-in admin, Extension-enabled guest, and Extension-disabled guest states in Opera GX. Reload the Superstar tab after signing in so the content script can receive the session token.


## Extension v1.2.5 launcher startup hotfix release

- Publishes the launcher initialization fix from the dashboard/extension startup hotfix. Version 1.2.5 is required because GitHub Releases cannot publish a second release using the already-published `extension-v1.2.4` tag.
- No signing identity or update URL changes: retain the existing persistent `EXTENSION_PRIVATE_KEY_B64` secret and stable update feed.
- The v1.2.5 CRX includes the corrected permission-check startup order; the signed extension release workflow must complete successfully before asking users to update.
- Verification: confirm the workflow publishes `extension-v1.2.5`, `Superstar.crx`, and `updates.xml`; then test the star in Opera GX after the signed update and a reload of the Superstar website tab.


## Gimkit and Blooket question helper

- The extension shows a Question Helper option only on Gimkit and Blooket tabs.
- The helper is opt-in: the user clicks Capture visible text, reviews/edits the question and choices, then clicks Suggest answer.
- Capture reads visible rendered page text and visible answer-like controls only; it does not inspect hidden state, network traffic, private APIs, or answer keys.
- Suggestions use the existing authenticated `POST /api/ai/answer` endpoint, which enforces the user's AI feature permission and server-side Gemini configuration/rate limit.
- The helper displays the suggested choice, explanation, and confidence. It never auto-clicks an answer, submits a response, changes game state, or interacts with other players.
- The saved Quick replies preference is sent to the answer endpoint.
- Verification: run `node --check browser-extension/global-player.js`, parse `browser-extension/manifest.json`, test the helper appears only on `gimkit.com` / `blooket.com`, test capture/edit/analyze with a signed-in account, test missing session and disabled AI permission, and confirm no answer is clicked or submitted.


## Question helper reliability update — extension v1.2.7

- The Gimkit/Blooket helper now displays the actual request failure in both its status line and result panel instead of replacing every failure with the unhelpful text "No suggestion yet". A diagnostic is also written to the extension console.
- The server normalizes AI-returned choices before matching, tolerating harmless punctuation, whitespace, and leading option labels; it also maps standalone A-H or 1-8 labels to the corresponding supplied choice when unambiguous.
- The helper remains opt-in and never clicks or submits a game answer.
- Verification: run `node --check server.js`, `node --check browser-extension/global-player.js`, parse the manifest JSON, and manually test a successful request plus missing session, disabled AI permission, provider errors, and non-exact answer formatting.


## Screenshot-based quiz questions — extension v1.2.8

- The Gimkit/Blooket helper captures only the currently visible tab viewport after temporarily hiding the Superstar overlay, so the overlay does not cover the question.
- Screenshot capture is user-initiated and handled by the extension service worker using `chrome.tabs.captureVisibleTab`; the existing `<all_urls>` host permission authorizes capture; no new broad permission is added.
- The helper previews the screenshot and sends it to the authenticated `/api/ai/answer` endpoint. Gemini receives the image as inline image data and is instructed to read only the main question and answer choices, ignoring unrelated page text and UI.
- Manual question and answer-choice text is optional when a screenshot is attached. The old whole-page `document.body.innerText` capture was removed.
- The server accepts JPEG, PNG, or WebP data URLs under 1.8 MB and uses a 3 MB JSON request limit. Images are sent to Gemini through the server; the Gemini API key is never exposed to the extension.
- Verification: syntax-check the changed JavaScript, parse the manifest, then manually test screenshot capture, screenshot preview, image-based analysis, and a manual-text-only request.


## Auto Fast Answer — extension v1.2.9

- The Gimkit/Blooket Question Helper includes an opt-in Auto Fast Answer toggle, persisted in extension local storage.
- When enabled, a MutationObserver watches for page UI changes without reading page text. After a debounce, the extension captures the visible tab screenshot and computes a small visual fingerprint; only materially changed screenshots are sent to Gemini, with a minimum capture interval to reduce duplicate requests.
- The screenshot is captured with the Superstar overlay hidden. Gemini is instructed to read only the question and answer choices. The answer is shown in the helper; the extension does not click, select, type into, or submit any game answer.
- Leaving the Question Helper stops its observer. Turning the toggle off stops automatic capture immediately.
- Verification: run syntax checks for `global-player.js` and `service-worker.js`, parse manifest JSON, then manually test toggle persistence, question-change detection, duplicate suppression, manual capture, and disabled mode on Gimkit and Blooket.


## Website AI tab and quiz-only Quick Reply scope

- The authenticated website navigation includes an **AI** tab at `/ai`. It provides a full-page, multi-turn Superstar AI chat using the existing authenticated `POST /api/ai/chat` endpoint and server-side Gemini key.
- The AI page reads the current same-tab Superstar session from sessionStorage, checks `GET /account/permissions`, and requires the account AI permission. It redirects signed-out visitors to the dashboard and displays an access-denied state when AI permission is disabled.
- The dashboard hides the AI navigation link when the signed-in account lacks AI permission. Server-side endpoint permission checks remain authoritative.
- Quick Reply is strictly a quiz-answer preference. It affects `POST /api/ai/answer` requests from the Gimkit/Blooket helper and standalone question helper only. It must never shorten general conversational chat in either the extension or website AI tab.
- Verification: run `node --check server.js`, `node --check browser-extension/global-player.js`, and `node --check browser-extension/helper.js`; parse inline dashboard JavaScript; manually test signed-in AI chat, signed-out redirect, AI-disabled guest, and both Quick Reply settings on quiz answers while confirming ordinary chat remains naturally detailed.


## Dashboard redesign, settings page, admin workspace, and performance

- The dashboard home is intentionally lightweight: a welcome panel and responsive tiles for AI, Games, Extension install, and Feature Ideas. Account and extension preferences are moved to the gear-icon **Settings** page at `/settings`.
- Settings include star direction/speed, light/dark theme, mini-window mode, quiz-only Quick Reply, and opening the extension mini-window. Appearance preferences are saved locally and apply across the dashboard.
- The **Admin** navigation item appears only for the admin role and opens `/admin`. It reuses the existing admin APIs and protected UI for guest code generation, per-code permissions, default guest permissions, device resets, login history, bans, storage status, and the private feature-idea inbox. Admin API middleware remains the security boundary; hiding navigation is not authorization.
- The admin workspace loads its large datasets only on `/admin`, not on every dashboard visit. Login monitoring runs only while the admin page is visible and now polls every 20 seconds. Session permission heartbeats run every 30 seconds and skip background tabs.
- Starfield animation now runs only one animation-frame loop (removing a duplicate loop), pauses while the tab is hidden, resumes on visibility, and respects reduced-motion settings. Canvas resize handling is passive.
- The extension version is bumped to 1.3.0 so the release pipeline can publish the extension changes already included in the pending AI-tab work.
- Verification: run Node syntax checks, parse extension manifest JSON, parse inline browser scripts, and manually test admin-vs-guest routing, settings synchronization with Chrome/Opera, theme persistence, reduced motion, background-tab CPU use, and admin polling behavior.

- Admin quality-of-life: newly generated guest codes have a one-click copy action; resetting device locks and removing bans require confirmation, and reset failures are reported instead of silently refreshing the list.
- Admin navigation and workspace visibility are gated by the verified admin session role. The `/admin` route keeps the login form available when signed out and does not render admin panels for guests.
