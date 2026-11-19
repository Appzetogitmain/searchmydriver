# TURN server for in-app calls

Without TURN, many calls on mobile data (Jio/Airtel CGNAT, strict Wi-Fi) show
"Connected" with no audio. This sets up a self-hosted coturn server.

## 1. Install (on the server, ~2 minutes)

```bash
scp deploy/coturn/setup-coturn.sh user@SERVER:/tmp/
ssh user@SERVER 'sudo bash /tmp/setup-coturn.sh'
# With a domain + TLS (recommended; point turn.<domain> DNS at the server first):
#   sudo certbot certonly --standalone -d turn.searchmydrivers.com
#   sudo TURN_DOMAIN=turn.searchmydrivers.com bash /tmp/setup-coturn.sh
```

Open in the cloud firewall / security group: **3478 TCP+UDP**, **49160–49999 UDP**
(and **5349 TCP** if TLS is on).

## 2. Configure the backend

Add the two lines the script prints to the production `backend/.env`:

```
TURN_URLS=turn:<host>:3478?transport=udp,turn:<host>:3478?transport=tcp
TURN_SECRET=<secret>
```

then `pm2 restart searchmydrivers-api`. The backend hands each caller
short-lived credentials (see `buildIceServers` in
`backend/src/controllers/callSocket.controller.js`); the secret never reaches
the browser.

## 3. Verify

Generate a test credential on the server:

```bash
cd backend && node --env-file=.env -e "import('./src/controllers/callSocket.controller.js').then(m=>{console.log(m.buildIceServers({type:'user',id:'test'})[1]);process.exit(0)})"
```

Paste the URL, username and credential into
<https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/> and
click "Gather candidates". A `relay` candidate means TURN works.
