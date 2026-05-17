The path I’d recommend

Completed 2026-05-17

* Added `manifest.webmanifest` for installable PWA behavior.
* Added 192px, 512px, and maskable PWA icons.
* Added standalone/iOS mobile web app meta tags.
* Added a conservative service worker that caches static shell assets and avoids private API/upload caching.
* Added service worker registration and an offline banner.
* Added app-like navigation feedback with a top loading strip.
* Added offline guards for API, image upload, backup import, and meal image scan actions.
* Made the coach daily macro breakdown use two columns on mobile to reduce scrolling.
* Tightened the inner labels in the coach daily macro tiles.
* Added local phone/browser data caching for Log, Coach, and Menu page-load data with offline/last-updated notes.
* Added Account-page local cache clearing.
* Added offline disabling for known network-only actions.
* Added an install prompt/banner with iOS home-screen guidance.
* Added `CAPACITOR_READY.md` for the mobile wrapper checklist.
* Created the Capacitor iOS wrapper pointed at the live Taverai URL.
* Lowered the mobile bottom nav and added a solid safe-area underlay so content does not show beneath it.
* Reduced the bottom nav underlay so more user data remains visible above the menu.
* Reworked short-height landscape navigation into a compact top bar and hid the bottom nav to preserve vertical space.
* Added App Store icon assets, branded launch screen, export compliance key, and App Store Connect checklist notes.
* Set dark HTML/native bridge backgrounds to prevent white flashes during iOS page navigation.
* Added a custom Capacitor bridge view controller that forces the WKWebView layer to dark during page navigation.
* Added an inline first-paint dark background before the external stylesheet loads.
* Set the iOS/App Store marketing version to `2.0`.

Phase 1 → Turn it into a true installable app experience

Do this FIRST.

You likely want:

* proper PWA behavior
* splash screen
* offline caching
* app icon support
* smooth transitions
* full-screen feel
* native-like navigation polish

A really polished PWA already gets you surprisingly close.

⸻

Phase 2 → Wrap it for iPhone using Capacitor

This is probably your best move.

Use:
Capacitor

Official site:
Capacitor￼

Why Capacitor is ideal for you:

* your app already exists
* your UI is already web-based
* it supports PWAs beautifully
* easier than React Native rewrite
* easier than Swift rewrite
* native App Store packaging
* access to camera, notifications, storage, biometrics later

And importantly:
it feels MUCH more native than old Cordova-style apps.
