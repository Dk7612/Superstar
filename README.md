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

## Persistent login history and bans

The service stores the latest 500 successful logins and device/IP bans in `data/service-data.json`. Set the `DATA_DIR` environment variable to the path of a persistent disk to keep this data across restarts. On Render, attach a persistent disk to the web service and set `DATA_DIR` to its mount path (for example, `/var/data`). Without a persistent disk, Render may erase the data when the service restarts or is redeployed.

## Login code configuration

Set distinct `SUPERADMIN_CODE` and `USER_CODE` environment variables in the hosting service before starting the app. Do not put their values in source files or commit messages.
