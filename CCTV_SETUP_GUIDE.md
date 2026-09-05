# CCTV Setup Guide

How to connect a physical CCTV camera to FloodSight so it shows up as a live snapshot on the dashboard and as a colored pin on the Map View — plus what's needed (and what's still missing) for the mobile app to see the same feed.

This guide documents the pipeline as it exists in code today. Every claim below is traceable to a specific file, cited inline, so it stays accurate as the code changes.

## 1. Overview

A camera becomes "a dot on the dashboard" through three pieces working together:

1. **MongoDB Atlas** holds one document per camera (status, water level, GPS location, and — once configured — its network connection details).
2. **The website's server** (`src/server.ts`) exposes `/api/cameras/*` routes that read/write those documents and proxy live JPEG snapshots from the camera itself, via `src/lib/camera-stream.server.ts`.
3. **The dashboard UI** (`/`, `/map-view`, `/config`) polls `/api/cameras` for the camera list and renders it — cards, map pins, and the notification sidebar all read from the same data.

There is no separate "camera driver install" step — a camera only needs to expose an HTTP snapshot endpoint (see §3) that the server can reach.

## 2. Prerequisites

- **Network reachability**: whatever machine runs the FloodSight server (your `npm run dev` machine, or the deployed host) must be able to reach the camera's IP over plain HTTP. If the camera is on a different subnet/VLAN or behind NAT, open/forward the relevant port first — the server-side proxy is what talks to the camera, not the browser.
- **Camera type**: the pipeline expects a Dahua/Hikvision-style CGI snapshot endpoint (a single JPEG served from a URL like `/cgi-bin/snapshot.cgi?...`). RTSP streams, ONVIF, and ANMS/NVR-only cameras are not supported by the current code (see §10).
- **MongoDB Atlas access**: the project already has a cluster wired up; you just need the connection string. See `PROMPTS/mongoDB.md` for how it was originally provisioned.
- **`.env` populated**: copy `.env.example` to `.env` and fill in `MONGODB_URI`, `MONGODB_DB`, `MONGODB_COLLECTION`, and the `VITE_FIREBASE_*` values (needed for Google sign-in, unrelated to cameras but required to load the app at all).

## 3. Step 1 — Get the camera's connection details

You need four things from the camera (check its label, admin web UI, or vendor manual):

| Field | Default if omitted | Notes |
| --- | --- | --- |
| IP address | *(required, no default)* | Must be reachable from the server. |
| Port | `80` | Only used if the camera serves HTTP on a non-standard port. |
| Snapshot path | `/cgi-bin/snapshot.cgi?channel=1&subtype=0` | The classic Dahua CGI path. Hikvision cameras commonly use `/ISAPI/Streaming/channels/101/picture` instead — check your camera's docs if the default 404s. |
| Username / Password | *(optional)* | Only needed if the camera requires auth to view snapshots. |

Source: `buildUrl()` in [`src/lib/camera-stream.server.ts`](src/lib/camera-stream.server.ts) builds the final URL as `http://{ip}:{port}{snapshotPath}` — HTTP only, no HTTPS.

**Sanity-check before touching the dashboard.** Try the URL directly in a browser or with curl from the same machine that will run the server:

```
curl -v "http://<ip>:<port><snapshotPath>" -o test.jpg
```

If that doesn't return a JPEG, the dashboard won't be able to either — fix connectivity/credentials at this level first (see §8 for what each failure mode looks like once it does reach the app).

## 4. Step 2 — Add the camera to MongoDB

At minimum, a camera document needs a status/level and a location so it shows up at all. The known-good shape (from `PROMPTS/mongoDB.md`, matched by `RawCameraDoc`/`mapCamera` in [`src/lib/db.server.ts`](src/lib/db.server.ts)):

```json
{
  "status": "danger",
  "water_level": 1.345,
  "location": {
    "type": "Point",
    "coordinates": [124.6433, 8.4822]
  },
  "timestamp": "2026-07-15T07:30:00Z"
}
```

Notes:
- `location.coordinates` is `[longitude, latitude]` — GeoJSON order, **not** `[lat, lng]`. Get this backwards and the pin lands in the wrong place (or falls back to the default Cagayan de Oro coordinate if `location` isn't a valid `Point`).
- `status` is optional — if omitted or not `"danger"`/`"alert"`, the app derives it from `water_level` via `statusFromLevel()` (`>=1.5` → DANGER, `>=0.5` → ALERT, else NORMAL).
- You do **not** need to set `stream_config` by hand — that's what Step 3 does through the UI, which is easier to get right (it validates the connection live before saving).
- You can insert this directly in Atlas/Compass, or leave it minimal and let an admin fill in the rest via `/config`.

### Template: same document, with `stream_config` added

If you're editing Mongo directly instead of going through `/config` (e.g. for a quick test), this is the full shape once a camera is connected. Replace the placeholders in `<ANGLE_BRACKETS>` with the camera's real values — `ipAddress` is the only required subfield; drop `username`/`password` entirely if the camera needs no auth, and drop `port`/`snapshotPath` to use their defaults (`80` and `/cgi-bin/snapshot.cgi?channel=1&subtype=0`).

```js
// Compass / mongosh shell syntax
{
  _id: ObjectId('6a5739e3639645ea3345c895'),
  status: 'danger',
  water_level: Double('1.345'),
  location: {
    type: 'Point',
    coordinates: [
      Double('124.6433'),
      Double('8.4822')
    ]
  },
  timestamp: '2026-07-15T07:30:00Z',
  stream_config: {
    ipAddress: '<CAMERA_LAN_IP>',
    port: 80,
    snapshotPath: '/cgi-bin/snapshot.cgi?channel=1&subtype=0',
    username: '<CAMERA_USERNAME>',
    password: '<CAMERA_PASSWORD>'
  }
}
```

To avoid retyping the whole document (and risk overwriting fields you didn't mean to touch), prefer a targeted update instead of replacing the document wholesale:

```js
db.getCollection("cctv data").updateOne(
  { _id: ObjectId('6a5739e3639645ea3345c895') },
  {
    $set: {
      stream_config: {
        ipAddress: "<CAMERA_LAN_IP>",
        port: 80,
        snapshotPath: "/cgi-bin/snapshot.cgi?channel=1&subtype=0",
        username: "<CAMERA_USERNAME>",
        password: "<CAMERA_PASSWORD>"
      }
    }
  }
)
```

This directly edits Mongo, so it skips the live validation `/config`'s "Fetch snapshot" button gives you — a typo in `ipAddress` or `snapshotPath` won't surface until the dashboard tries to load the snapshot. Prefer Step 3 below when you can.

## 5. Step 3 — Configure the camera in the dashboard

Go to `/config` (Camera Configuration tab, admin-only) and pick the camera from the grid picker (use the filter box if you have many cameras).

1. **Camera Connection** section — enter the IP address, port, snapshot path, and username/password from Step 1.
2. **"Fetch snapshot"** — click this to test the connection *before saving*. This posts your in-progress form values to `POST /api/cameras/:id/snapshot/test`, which calls `fetchCameraSnapshot()` directly against what you typed — it does **not** touch MongoDB yet, so you can iterate freely. A successful fetch replaces the placeholder image in the editor with the real live snapshot.
3. **Region of Interest** — drag a box over the now-live snapshot to mark the water-level detection zone, then confirm it.
4. **"Save configuration"** — this does two things: (a) updates the local dashboard state immediately, and (b) sends `PATCH /api/cameras/:id` to persist everything to MongoDB. **Watch for the toast** — if the MongoDB sync fails, you'll see "Camera configuration could not be synced to MongoDB" with the error, but the local view will still show your change (see the known limitation in §10). Don't consider a camera "saved" until the success toast appears.

## 6. Step 4 — Verify it end-to-end

- **Dashboard (`/`)**: the camera's carousel card and detail panel should now show the live snapshot instead of the generic placeholder photo. (The placeholder — a `picsum.photos` stock image — is what every camera shows by default until `streamConfig.ipAddress` is actually set and saved; if you still see a stock photo after saving, the connection likely wasn't persisted.)
- **Map View (`/map-view`)**: the camera should appear as a colored pin at its `location` coordinates — green/amber/red matching its current status. Click the pin to confirm the popup shows the right location name and water level.
- **Notification sidebar**: the camera should appear in the list, sorted by severity, and clicking it should jump to and focus that pin on `/map-view`.

If any of these don't reflect your change, re-check §8 below and confirm the `/config` save actually succeeded (not just the local UI).

## 7. Scaling to many cameras

- **Bulk setup**: for a handful of cameras, use the `/config` UI per-camera as in Step 3. For many cameras at once, it's faster to bulk-insert documents directly into MongoDB (Atlas UI, Compass, or a script) with the base shape from §4, then go back through `/config` just for the `stream_config`/ROI per device — the UI already handles those safely (live-tests before saving) where a scripted `stream_config` write would not.
- **Collection auto-detection**: `getCameraFeeds()` first queries `MONGODB_COLLECTION`; if that's empty, it scans every collection in the database for one containing `water_level`, `status`, or a GeoJSON `location.type: "Point"` field, and uses the first match (`findCameraCollection()` in `src/lib/db.server.ts`). This is a convenience fallback for collection-name mismatches, not a substitute for keeping `MONGODB_COLLECTION` set correctly — relying on it with multiple ambiguous collections in the same database is unpredictable.
- **Per-camera detection tuning**: `roiConfig` and `hsvThresholds` are currently the same hardcoded defaults for every camera (not read from or written to distinct fields per device beyond what `/config`'s ROI editor saves). If different cameras need different HSV thresholds for their physical flood markers, that's not wired up yet — see `FloodTestGIT_v0.5.py` for the marker-detection logic these fields are meant to eventually drive per camera.

## 8. Troubleshooting

All snapshot failures surface as an HTTP status + JSON `{"error": "..."}` from `/api/cameras/:id/snapshot` or `/api/cameras/:id/snapshot/test`, and as a toast in the `/config` UI when using "Fetch snapshot".

| Symptom / error | Cause | Fix |
| --- | --- | --- |
| `CameraTimeoutError` (HTTP 504) | Camera didn't respond within 8 seconds. | Check the camera is powered on and network-reachable; check firewalls between the server and the camera's subnet. |
| `CameraUnreachableError` (HTTP 502) | Connection refused / DNS failure / non-OK HTTP status from the camera. | Double-check IP and port; confirm the camera's HTTP service (not just its web UI on a different port) is on. |
| `CameraAuthError` (HTTP 401) | Wrong username/password, or the camera's auth scheme isn't Digest or Basic. | Re-enter credentials; confirm in the camera's own admin UI which auth scheme it uses — only Digest and Basic are supported. |
| `CameraResponseError` (HTTP 502) | Snapshot path is wrong, IP/path combo is malformed, or the camera responded with something that isn't an `image/*` (e.g. an HTML login page). | Verify the exact snapshot CGI path against your camera model's documentation (see the Hikvision note in §3); try the curl sanity-check from §3 again. |
| Dashboard shows a generic stock photo instead of your camera | `streamConfig.ipAddress` was never saved for that camera. | Re-do Step 3 and confirm the "Camera configuration saved" toast (not the sync-failure one) appears. |
| "MongoDB connection failed" banner on the dashboard | `MONGODB_URI` invalid or unreachable. | Check `.env` against `.env.example`; confirm the Atlas cluster allows connections from your IP (Network Access list). |
| Pin appears at the wrong place on the map / at the default CDO location | `location` in the Mongo doc isn't a valid `{type:"Point", coordinates:[lng,lat]}`, or the coordinates are swapped. | Fix the document per §4 — remember `[lng, lat]` order. |

## 9. Mobile application status

The Flutter mobile app (`subay_app`, a separate project) has its **own** Express backend (`subay_app/backend/server.js`) that reads the same MongoDB collection, but it only exposes raw read endpoints (`GET /api/cctv`, `GET /api/alerts`) — it has **no snapshot-fetching logic at all**. Configuring a camera through this website's `/config` page will make its live snapshot visible on the website, but the mobile app currently cannot display that same live image; it can only show the status/water-level fields already in MongoDB.

**Recommendation for later work** (not implemented as part of this guide, since it's a separate, unopened codebase): mirror the website's `GET /api/cameras/:id/snapshot` proxy pattern in `subay_app/backend/server.js`, reusing the same `stream_config` document field and the same typed-error-to-HTTP-status mapping from §8, so a camera configured once via this dashboard works for both surfaces without duplicating the Digest/Basic auth logic.

## 10. Known limitations

- **HTTP only** — no HTTPS, RTSP, or ONVIF support. Cameras that only serve snapshots over HTTPS, or that only expose an RTSP stream (no CGI snapshot endpoint), won't work with this pipeline as-is.
- **Local/DB state can silently diverge** — "Save configuration" updates the local dashboard state unconditionally, even if the MongoDB `PATCH` fails. Always confirm the success toast, not just that the UI updated.
- **ROI/HSV thresholds aren't per-camera yet** — every camera shares the same default detection zone and color thresholds; see §7.
- **`SPEC.md` is stale on this point** — §10 of `SPEC.md` still lists "Live integration with real CCTV streams or external camera APIs" as out of scope for this version, even though the pipeline described in this guide already exists and works. Worth a follow-up update to `SPEC.md` once live camera testing is confirmed successful.
