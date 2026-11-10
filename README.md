# Superstar
Great proxy but only for my friends so dont click
If you do click theres no point cause its password protected
If i told you about this
CONGRATS🎉🎉
You are not dumb and made it to the right place
If i didnt tell you the password, HAHA get scammed
and this isnt meant to be ran on github it is a website which i have coded on github for easy access 
Anyways if i told you the password and didnt give you the link and told you to search "Superstar" on github here is the link for the proxy:
https://superstar-oa7t.onrender.com
NOTE: this is a work in progress and if it is the first time it runs in 10 mins the cloud server has to restart to it might take around 1 min to load
NOTE 2.0: if you share your code with anyone i will block ur ip address and u will not be able to use this again and i wont give whatever you gave me back, and trust me i will know if you gave anyone the password
NOTE 3.0: if you ask me to make changes to the proxy or something and i say yes dont expect it to be done in a day or somthing, i have a life and it takes a while to code this 

## Persistent service state

The service stores login history, generated login codes, account names, device locks, device/IP bans, trusted admin devices, and per-login-code game progress in `data/service-data.json`. Set the `DATA_DIR` environment variable to a persistent disk path to keep this state across restarts and redeploys. On Render, attach a persistent disk to the web service and set `DATA_DIR` to its mount path (for example, `/var/data`). Without a persistent disk, Render may erase data stored on the service filesystem when it restarts or is redeployed. The admin login code is configured through `ADMIN_CODE` (or the legacy `SUPERADMIN_CODE` variable). A previously configured `USER_CODE` is ignored, so that login is disabled.

## Render deployments

The `Deploy to Render` GitHub Actions workflow triggers a Render deployment for every push to `main`. To enable it, add the service's Deploy Hook URL as the `RENDER_DEPLOY_HOOK` repository secret in GitHub under **Settings → Secrets and variables → Actions**. Keep the URL secret. Disable Render's built-in Auto-Deploy after adding the hook to avoid duplicate deployments.

## Login code configuration

Set `ADMIN_CODE` in the hosting service before starting the app. Existing deployments can keep using `SUPERADMIN_CODE`; it remains supported as a fallback. `USER_CODE` is no longer needed and is ignored if still configured. Do not put code values in source files or commit messages. Admins can generate random guest codes or choose a custom code of 4-32 letters, numbers, hyphens, or underscores. Newly generated accounts have the `guest` role; only the configured admin account can manage login history, bans, and generated account names. Previously generated accounts are migrated to guest access when persistent state is loaded.

## Game progress

The Drop and Skyfall 3D progress is synchronized to the login code after sign-in. Existing browser progress is merged into the account save the first time each game loads, preserving the highest unlocked level and best time for each level. Account saves use the same persistent disk as other service state.

Admins can assign or change a display name for any login code in the user list. Players can reset each game's account progress separately with that game's Reset progress button.

## Trusted admin devices

The cookie-consent popup lets visitors allow or reject the optional trusted-device cookie. Allowing it enables password-free Admin restoration for 30 days; the choice is remembered by the browser, and each subsequent admin sign-in or trusted-session restore renews the expiry. Visitors can change this choice later through **Cookie settings**. Rejecting it revokes the browser's trusted-device cookie while regular access-code login remains available. The cookie is random and HttpOnly; only its hash, expiry, admin code, and associated device ID are stored by the server. Device IDs alone never grant access. Trusted-device records persist across restarts only when `DATA_DIR` points to persistent storage.
