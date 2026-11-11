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
