# Installable PWA

The app has a manifest, standalone display metadata, and 192px/512px PNG icons. The 180px Apple touch icon and other icons are placeholders generated from `src/app/icon.svg`; replace all three with final team artwork before branding a production installation. Keep the sizes and opaque, readable background.

On a secure deployed origin, use the browser's **Install app** menu where offered. On iPad/iPhone Safari, use **Share → Add to Home Screen**. Browser support varies; no custom install prompt is required. Localhost is also treated as a secure context by modern browsers. The installed app opens `/events` and still requires sign-in.

`public/sw.js` registers only in production. It caches public icons and same-origin `/_next/static/` files. It never intercepts page navigation, RSC requests, API routes, Supabase traffic, authentication, or submissions. A cold offline launch cannot authorize or render an authenticated page. Open a form while online to work through a connection drop; the form saves to IndexedDB and the existing queue syncs when the app is open and connected. Do not clear site data while submissions are pending.

The global offline banner and sync menu show the pending count. Match scouting also shows an offline warning over its full-screen capture view. Counter taps use large targets and `touch-action: manipulation`; each intentional tap counts immediately and Undo reverses the last increment. The app does not suppress rapid repeated taps because repeated increments are a normal scouting action. Match and pit submissions have a synchronous in-flight guard to ignore duplicate taps.

Check installability and layout on a real iPad/phone after deployment. Inspect the browser Application panel for manifest/icons and service-worker scope. In Network offline mode, confirm an already open form remains editable, queue count rises after submitting, and a cold reload requests the network rather than showing stale private content. Lighthouse PWA checks may be run against a deployed secure origin; authenticated flows need a signed-in browser session.
