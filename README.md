# Shanikwanne Lashes — Studio App

A client-management app for a lash technician. Built as an **offline PWA** for
**iPhone and iPad**. No backend, no accounts, no subscription — everything lives
on the device.

---

## What it does

The loop it is built around is the one every good lash app has:

> **Today** (who's in, who's overdue) → **client card** → **Start fill**, pre-filled
> from her last set → adjust map + adhesive → **before/after photos** → save →
> **book the next fill**.

### Screens

| Screen | What's on it |
|---|---|
| **Today** | Patch-test problems first, then stats, today's appointments, and everyone due a rebook |
| **Clients** | Search by name, phone or Instagram; each row shows next-fill status and flags a bad patch test |
| **Client** | Four tabs — Overview, Health, Sessions, Photos |
| **Calendar** | 14-day strip, day list, booking with clash detection |
| **Settings** | Studio details, reminders, treatment rules, editable dropdown lists, backup, PIN, erase |

### The features that matter

- **Sessions pre-fill from the last one.** Set type, style, curl, diameter, the
  full lash map and the adhesive all carry forward. Retention, notes, duration and
  room conditions are deliberately blanked — those are measured each visit, not copied.
- **Lash map builder.** Seven zones per eye, inner → outer, in mm. The eye preview
  redraws live, so a cat eye actually looks like a cat eye. Six style presets, and
  a mirror L→R button.
- **Patch-test enforcement.** A test must be ≥48h old *and* unexpired *on the day of
  the appointment*. A recorded reaction overrides everything. Booking warns live;
  starting a session warns before it opens.
- **Consent with signature.** Signed on-screen with a finger or Apple Pencil.
  Editing the consent wording bumps the version, which correctly marks every client
  as unsigned — an old signature does not cover new terms.
- **Retention tracking.** Log "% still on" at each fill. Builds a per-client trend,
  and a studio-wide **average grouped by adhesive batch** — which is how you catch a
  bad bottle rather than blaming your own application.
- **Before/after photos** with a drag-compare slider, and a 9:16 share card for
  Reels/TikTok. The share card is **blocked unless that client ticked photo consent**.
- **Aftercare** card that can be texted straight to the client.

---

## Privacy / GDPR — read this bit

This app stores **health data** (allergies, eye conditions, medication, reactions)
and **photographs of clients**. Under GDPR that is *special-category* data and it is
treated as such:

- **Nothing is ever uploaded.** There is no server and no analytics. Records are in
  `localStorage`, photos in `IndexedDB`, both on the device only.
- **Per-client export** ("Export her record") satisfies a subject-access request.
- **Per-client erase** really erases — profile, appointments, sessions and photo blobs.
- **Photo consent is a separate tick** from treatment consent, and the share-card
  feature refuses to run without it.
- **PIN lock** is available and re-locks when the app is backgrounded.

**The flip side:** because it is device-only, *if the iPad is lost or wiped, the
records go with it.* Export a backup regularly (Settings → Backup). The backup is a
single JSON file including photos.

---

## Install (iPhone / iPad)

1. Open the site in **Safari** (it must be Safari — Chrome on iOS can't install PWAs).
2. Tap **Share** → **Add to Home Screen**.
3. Open it from the Home Screen icon, not from Safari.

It then runs full-screen and works with no signal.

### Notifications — what they actually do

Be straight with the client about this. There is no server, so there is **no true
background push**. The reminder is a **daily digest that appears when the app is
opened** — appointments, lapsed patch tests, clients due a rebook. It also requires:

- iOS **16.4+**, and
- the app **already added to the Home Screen** (iOS refuses the permission otherwise).

Real overnight push would need a backend and a push service. That's a separate quote.

---

## Tech notes

Plain HTML + CSS + vanilla JS. No build step, no dependencies.

```
index.html        shell + inline SVG icon sprite
css/app.css       design tokens + components
js/store.js       data layer (localStorage + IndexedDB), all business rules
js/ui.js          icons, toasts, sheets, forms, validation
js/lashmap.js     the lash map builder
js/photos.js      capture, downscale, compare slider, share card
js/app.js         boot, router, nav, notifications, Today + Clients
js/screens.js     client detail, health, consent, photos
js/sessions.js    session record sheet, booking, calendar
js/settings.js    settings, catalogue, backup, erase
sw.js             service worker — NETWORK-FIRST
```

### Gotchas already fixed — don't reintroduce them

- **Dates are local, never UTC.** `toISOString()` converts to UTC first; Malta is
  UTC+2, so every date rolled back a day and between midnight and 02:00 the app
  thought today was yesterday. Use `fmtDate()` in `store.js`. This was caught by the
  test suite, not by eye.
- **`.truncate` does nothing on an inline element.** `overflow` doesn't apply to
  non-replaced inline boxes, so `.item .title/.meta` must stay `display:block` or the
  rows push the page wider than the phone.
- **`color-mix` needs Safari 16.2+.** The sticky bars declare a solid background
  first and the `color-mix` second, so an older iPad still gets an opaque bar.
- **Service worker is network-first.** Cache-first serves stale files after an update
  and looks like a broken app. Bump `const CACHE` in `sw.js` on every deploy.
- **Photos go in IndexedDB, not localStorage** — the ~5MB quota dies instantly otherwise.
- Photos are downscaled to 1600px / JPEG 0.82 on capture.

### Testing

Serve and open on the tailnet:

```bash
cd shanikwanne-lashes && python3 -m http.server 8231
# http://100.96.95.99:8231
```

The interaction suite was a temporary `_t.html` harness (iframe + real dispatched
events, asserting into `document.title`), deleted after use per the workspace rules.
Last run: **74 cases, 0 failed**, covering the patch-test gate, consent versioning,
session pre-fill, overdue maths, retention grouping, the map builder, routing and
erasure.

---

## Hosting

Not yet deployed. It's a static folder — any static host works (GitHub Pages,
Netlify, Cloudflare Pages). For GitHub Pages: push to the repo, then
Settings → Pages → Deploy from a branch → `main` / `root`.

Because it targets iPhone/iPad, it installs via Safari's *Add to Home Screen* rather
than being packaged as an APK.
