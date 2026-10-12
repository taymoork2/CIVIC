# Private phone access

Rehearsal is available at https://your-machine.your-tailnet.ts.net:10445/review while this Mac is awake, connected to Tailscale and running the review preview on 3010. Enable Tailscale on the phone and open that address. No review key is required.

The existing Serve routes on 443, 8443, 10443 and 10444 remain unchanged. The new background route is private Tailscale Serve, not Funnel:

```sh
tailscale serve --bg --https=10445 http://127.0.0.1:3010
```

The ignored `.review-data/application.json` contains the linked Laundry checkout and `publicOrigin: "https://your-machine.your-tailnet.ts.net:10445"`. `REHEARSAL_PUBLIC_ORIGIN` overrides that origin. Restart `pnpm --dir apps/web run review` after changing it. Only one explicitly configured HTTPS `.ts.net` origin is accepted, via loopback; other remote hosts and mismatched write origins fail. Proxy sessions use Secure, HttpOnly, SameSite=Strict cookies. Captures stay on loopback, while review handoff links use the requesting HTTPS origin.

Access follows existing tailnet permissions; anyone permitted to reach this service can use its synthetic review workspace. No tailnet ACL, production application authentication or household data was changed. Local and phone browser drafts remain separate. This adds remote access, not multiplayer identity or simultaneous-editor authorization.

To disable this route without changing the others:

```sh
tailscale serve --https=10445 off
```

Verified October 11, 2026: private HTTPS entry and authenticated index/coverage returned 200; a 393×852 Chromium touch viewport opened the real towel Fabric screen through Play with no page errors and a Secure session cookie. All 21 focused review Node/API checks passed, including exact host/origin restrictions, local capture origin and HTTPS handoff links. A physical iPhone session and sleep/wake recovery were not checked. The Mac preview is not an automatically launched background service.
