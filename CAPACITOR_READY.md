# Capacitor Readiness

Use this checklist before wrapping Taverai in Capacitor.

## Current Status

- PWA manifest is present.
- Service worker caches static shell assets only.
- Private API responses are not cached by the service worker.
- Log, Coach, and Menu page-load data use controlled local browser caching.
- Offline state is visible to the user.
- Known network-only actions are disabled while offline.
- App shell uses safe-area viewport support.
- Capacitor dependencies are installed.
- iOS wrapper project has been generated.
- iOS camera/photo permission descriptions are present.
- App Store icon set is generated with an opaque 1024px marketing icon.
- Branded dark launch screen is present.
- Export compliance key is set for standard/non-exempt encryption handling.

## Pre-Wrap Checklist

- Test Log, Coach, Menu, Plans, Favorites, and Account inside a narrow mobile viewport.
- Confirm camera/file inputs work for meal photos, meal comparison images, avatar upload, and barcode photos.
- Confirm password reset email works on the live server.
- Confirm OpenAI, SMTP, database, uploads, and health checks pass on live.
- Confirm local cache can be cleared from Account.
- Confirm offline mode shows cached page-load data without allowing server-only actions.
- Confirm all navigation stays inside the app WebView unless intentionally external.
- Confirm no debug files are uploaded to production.
- In Xcode, set your Apple Developer Team under Signing & Capabilities.
- Confirm bundle ID availability for `com.taverai.app`.
- Confirm version/build before archive: version `2.0`, build `1`.
- Run on a physical iPhone before submitting to App Store Connect.

## App Store Connect To-Do

- App name: `Taverai`
- Subtitle: choose a short phrase such as `Track, Score, Improve`
- Category: Health & Fitness
- Age rating: complete Apple questionnaire
- Privacy nutrition labels: disclose account info, nutrition/health-style tracking data, photos/uploads, diagnostics if enabled
- Support URL: add a public support/contact page
- Marketing URL: optional
- Screenshots: iPhone 6.7", iPhone 6.5", and any iPad sizes if shipping universal
- Review notes: explain that the app requires an account and uses AI-assisted meal/diet tracking

## Likely Capacitor Settings

- App name: `Taverai`
- Web URL: `https://www.bromwichphotography.com/taverai_app/`
- App ID: `com.taverai.app`
- iOS orientation: portrait
- Status bar: dark background, light content
- Camera/file permissions: needed for image upload features

## Local Commands

```bash
npm install
npm run cap:sync
npm run cap:open:ios
```

After changing app wrapper files, run:

```bash
npm run cap:sync
```

## Later Native Enhancements

- Push notifications
- Camera plugin integration
- Biometric lock
- Health app integration
- Native share/export
