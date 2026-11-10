# Superstar
Website for custom games
https://superstar-oa7t.onrender.com
NOTE: this is a work in progress and if it is the first time it runs in 10 mins the cloud server has to restart to it might take around 1 min to load
NOTE 3.0: if you ask me to make changes to the proxy or something and i say yes dont expect it to be done in a day or somthing, i have a life and it takes a while to code this 

## Persistent service state

The service stores login history, generated login codes, account names, device locks, device/IP bans, trusted admin devices, per-login-code game progress, and hashed active login-session tokens in `data/service-data.json`. Login sessions last 30 days and survive server restarts and redeploys when `DATA_DIR` points to persistent storage. On Render, attach a persistent disk to the web service and set `DATA_DIR` to its mount path (for example, `/var/data`). Without a persistent disk, Render may erase data stored on the service filesystem when it restarts or is redeployed. The admin login code is configured through `ADMIN_CODE` (or the legacy `SUPERADMIN_CODE` variable). A previously configured `USER_CODE` is ignored, so that login is disabled.

## Render deployments

The `Deploy to Render` GitHub Actions workflow triggers a Render deployment for every push to `main`. To enable it, add the service's Deploy Hook URL as the `RENDER_DEPLOY_HOOK` repository secret in GitHub under **Settings → Secrets and variables → Actions**. Keep the URL secret. Disable Render's built-in Auto-Deploy after adding the hook to avoid duplicate deployments.

## Login code configuration

Set `ADMIN_CODE` in the hosting service before starting the app. Existing deployments can keep using `SUPERADMIN_CODE`; it remains supported as a fallback. `USER_CODE` is no longer needed and is ignored if still configured. Do not put code values in source files or commit messages. Admins can generate random guest codes or choose a custom code of 4-32 letters, numbers, hyphens, or underscores. Newly generated accounts have the `guest` role; only the configured admin account can manage login history, bans, and generated account names. Previously generated accounts are migrated to guest access when persistent state is loaded.

## Game progress

The Games page shows a preview gallery for The Drop and Skyfall 3D; both games have 50 levels with progressively harder obstacle courses. Skyfall 3D uses WebGL for a vertical 3D shaft, keyboard/touch steering, and mouse or touch dragging to look around. Each game can be played in fullscreen on browsers that support the Fullscreen API.

Game progress is synchronized to the login code after sign-in. Existing browser progress is merged into the account save the first time each game loads, preserving the highest unlocked level and best time for each level. Account saves use the same persistent disk as other service state.

Admins can assign or change a display name for any login code in the user list. Players can reset each game's account progress separately with that game's Reset progress button.

## Trusted admin devices

After an Admin signs in, a bottom-left slide-in lets them allow or reject the optional trusted-device cookie. Allowing it immediately enables password-free Admin restoration for 30 days; the choice is remembered by the browser, and each subsequent admin sign-in or trusted-session restore renews the expiry. Admins can change this choice later through **Cookie settings**. Rejecting it revokes the browser's trusted-device cookie while regular access-code login remains available. The cookie is random and HttpOnly; only its hash, expiry, admin code, and associated device ID are stored by the server. Device IDs alone never grant access. Trusted-device records persist across restarts only when `DATA_DIR` points to persistent storage.
