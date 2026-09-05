Date: 07/18/2026                   Time: 10:40 AM
Changes Made:
- Added MongoDB support and helper to read camera documents (`src/lib/db.server.ts`).
- Added a backend API endpoint `/api/cameras` in `src/server.ts` to return normalized camera feeds.
- Implemented `getCameraFeedsApi()` wrapper in `src/lib/api/camera.functions.ts` to call the DB helper.
- Updated `.env` values to point to the correct database: `MONGODB_DB="CCTVs"` and collection name.
Failures Flag:
- Initial `.env` pointed to the wrong DB/collection (fixed by updating to the cluster that contains `cctv data`).
- MongoDB collection naming varied ("cctv data" vs `cctv_data`) — mapping and detection logic added in `db.server.ts` to find the best collection.

Date: 07/19/2026                   Time: 11:05 AM
Changes Made:
- Fixed a React route bug that caused an infinite "Redirecting to sign in…" loop by patching `src/routes/_auth.tsx`:
  - Added `useLocation()` check and an `isLoginRoute` guard so the layout does not redirect when already on `/login`.
  - Ensured the login route is rendered via `<Outlet />` for unauthenticated users on `/login`.
- Removed an invalid dependency from a `useEffect` in `src/routes/_auth.index.tsx` (removed `fetchCameraFeeds` from the dependency array) to avoid referencing a non-existent identifier during refresh logic.
- Confirmed `/api/cameras` returns valid JSON (verified via local HTTP request).
Failures Flag:
- There was a runtime error from TanStack Start complaining about an "Invalid server function ID" (plugin validation). This was caused by leftover server-function IDs from earlier code-generation; the project was migrated to use a direct `/api/cameras` handler to bypass the broken server function. The error surfaced during dev HMR but the API endpoint itself is reachable.
- Some dev-server / terminal command invocations failed due to PowerShell vs bash quoting differences when running inline Node commands; these are environmental and not code regressions.

Date: 07/19/2026                   Time: 11:40 AM
Changes Made:
- Miscellaneous edits to ensure HMR and route updates pick up correctly (multiple hot-reload cycles while testing the auth fix).
Failures Flag:
- Remaining items to watch:
  - TanStack Start server-function leftover warnings: if you still see `Invalid server function ID` during development, consider cleaning any generated server-fn artifacts or disabling the server-fn CSRF warning as documented by the plugin.
  - Verify final mapping of the Divisoria camera to the intended mock feed once you approve showing live DB data for that camera.

Notes:
- If you want this LOG to include diffs per-file (git-style) or the full chronological transcript of terminal outputs, I can append those sections — tell me which format you prefer.

Date: 07/19/2026                   Time: 11:55 AM
Changes Made:
- Added a Vite dev-only auth fallback to `src/context/AuthContext.jsx` that reads `localStorage.floodsight-state-v1` and simulates an authenticated user for local testing without Google sign-in.
- Ensured the dev fallback user includes a `name` property to avoid avatar rendering errors in `src/components/floodsight/AppShell.tsx`.
- Reworked the DB-to-mock-camera mapping in `src/routes/_auth.index.tsx` to map each DB document to the nearest mock camera by squared distance (with a tighter acceptance threshold) so the Divisoria DB record correctly updates the intended `cam_002` feed.
- Restarted the dev server and verified `/api/cameras` returns the normalized DB document and that the dashboard UI shows the DB-fed water level in the camera carousel and details pane.

Failures Flag:
- The TanStack Start server-function warnings remain in dev HMR logs ("Invalid server function ID"). These are non-blocking for the `/api/cameras` endpoint but should be cleaned separately by removing leftover server-fn artifacts or adjusting plugin settings.

Verification:
- Confirmed via HTTP: `GET /api/cameras` returns the expected JSON document from MongoDB (sample id: "6a5739e3639645ea3345c895").
- Confirmed in running app: Dashboard loads under `http://localhost:8081/` and the Divisoria camera feed displays the DB water level after the mapping change.

Next Steps (optional):
- The Divisoria camera feed is now synchronized and working with the MongoDB payload.
- The remaining two camera feeds are still under development and were not changed in this pass.
- If you prefer deterministic mapping later, add explicit camera ids in the DB documents and match by id instead of spatial proximity.

Date: 07/19/2026                   Time: 11:20 PM
Changes Made:
- Added server-side camera snapshot proxy support in `src/server.ts` with two routes:
  - `POST /api/cameras/:id/snapshot/test` for previewing a new camera IP before saving.
  - `GET /api/cameras/:id/snapshot` for dashboard proxying of persisted camera snapshots.
- Added `StreamConfig` support to camera data and MongoDB persistence in `src/lib/floodsight/types.ts` and `src/lib/db.server.ts`.
- Implemented digest/basic camera auth and image validation in `src/lib/camera-stream.server.ts`.
- Added camera connection settings and snapshot preview to `src/routes/_auth.config.tsx`.
- Updated dashboard snapshot sources in `src/routes/_auth.index.tsx` to use the live proxy when `streamConfig.ipAddress` is configured.
- Fixed SSR module resolution by importing `./lib/camera-stream.server.ts` explicitly in `src/server.ts`.
Failures Flag:
- No failures observed after rebuild; the fix was required because the SSR bundler could not resolve the implicit `.server` module path.
Verification:
- Successfully rebuilt the app with `npm run build` after the server import fix.
- Clean up leftover TanStack server-fn artifacts or silence the CSRF/server-fn warnings per plugin guidance when time allows.

Date: 07/19/2026                   Time: 09:20 PM
Changes Made:
- Replaced the old admin-mode toggle flow with a dedicated admin account rule keyed off the email `langgamen.carlsyker@gmail.com` in `src/context/AuthContext.jsx` and `src/lib/floodsight/store.ts`.
- Removed the profile-page admin-mode switch and made the profile avatar fall back to the signed-in Google profile photo when available in `src/pages/ProfilePage.jsx`.
- Wired the header profile avatar and profile page image rendering to use `user.photoURL` so Google profile pictures appear consistently in the dashboard UI.
- Reworked the User Access page to use the persisted user roster for real account-role management instead of the previous mock-only role view in `src/routes/_auth.users.tsx`.
- Enabled admin camera changes to update the local dashboard state immediately and push the update to the MongoDB-backed API endpoint via `src/routes/_auth.config.tsx`, `src/lib/db.server.ts`, and `src/server.ts`.
- Added store helpers to upsert users from authenticated Google accounts and retain role updates across sessions.
Failures Flag:
- The prior local auth flow relied on a manual admin toggle and local mock roles; those have been removed in favor of email-based role resolution and persisted auth-backed user records.
Verification:
- Built the app successfully with `npm run build` after the changes.

Date: 07/19/2026                   Time: 10:05 PM
Changes Made:
- Added runtime debug logging of `firebaseConfig` and exported it from `src/services/firebase.js` to capture the effective `authDomain` at sign-in time.
- Updated `src/context/AuthContext.jsx` to use the service `loginWithGoogle` helper (which now logs config) instead of calling `signInWithPopup` directly.
- Cleaned `.env` Firebase variables by removing surrounding quotes so Vite injects correct values at build time.
- Rebuilt the project to ensure the client bundle reflects the corrected `authDomain`.
Failures Flag:
- In the VS Code built-in browser the Firebase popup fails: the handler URL resolves to `https://localhost/__/auth/handler?...` and the popup reports `auth/popup-closed-by-user` due to COOP/COEP and origin isolation in the webview (connection refused). This does not occur in external browsers.

Verification:
- DevTools console shows `[firebase] loginWithGoogle error: FirebaseError: Firebase: Error (auth/popup-closed-by-user).` and a Cross-Origin-Opener-Policy warning when running inside the VS Code webview.
- Signing in via an external browser (Chrome/Firefox) succeeds once `localhost` is authorized in the Firebase Console and the dev bundle is uncached.

Next Steps:
- Recommended: use an external browser for interactive Google sign-in during development.
- Optional: implement an automatic fallback to `signInWithRedirect` when popup-based sign-in fails, or show a UI prompt instructing users to open the page externally. Tell me which you prefer and I will implement it.

Date: 08/13/2026                   Time: 03:16 PM
Changes Made:
- Extracted the dashboard's live-camera polling logic into a shared hook (`src/lib/floodsight/useLiveCameras.ts`), fixing a bug where the previous merge logic only ever updated a hardcoded `cam_002` id regardless of the real MongoDB document id; the live `/api/cameras` result is now used directly as the camera list (falling back to local seed cameras only if the fetch fails or is empty).
- Moved the "Map overview" section out of the main dashboard into its own route/tab, `/map-view` (`src/routes/_auth.map-view.tsx`), visible to both admins and regular users via a new "Map View" entry in `src/components/floodsight/AppShell.tsx`.
- Added a `focusId` prop to `src/components/floodsight/CameraMap.tsx` so the map can fly to and open the popup for a specific camera (used for deep-linking from notifications via a `?camera=<id>` search param).
- Extracted the color legend into a shared `src/components/floodsight/DangerLegend.tsx` component.
- Added an interactive notification sidebar (`src/components/floodsight/NotificationSidebar.tsx`) on the right side of the dashboard, listing cameras sorted by severity (Danger/Alert/Normal) with status-colored indicators; persistent column on desktop, collapses to a bell-triggered slide-over (shadcn `Sheet`) on narrower screens. Clicking a notification navigates to the Map View tab and locates that camera.
- Reworked `src/routes/_auth.index.tsx` to use the shared hook and new two-column (content + sidebar) layout.
- Removed the "HSV Thresholds" section from the Camera Configuration tab (`src/routes/_auth.config.tsx`) and adjusted the panel layout (`lg:self-start`) so the now-shorter form column no longer stretches into empty space next to the taller snapshot editor.
- Replaced the Camera Configuration tab's camera picker (21 full-text pills wrapping across 4 rows) with a compact numbered grid, each showing a flood-status-colored dot and the full location as a tooltip, plus a filter/search box and a "Selected: <location>" caption.
Failures Flag:
- None observed; `npx tsc --noEmit` and `eslint` show no new errors beyond pre-existing issues in untouched files (`.jsx` modules without type declarations, `src/server.ts`, `src/lib/db.server.ts`, existing `StreamConfig` typing in `_auth.config.tsx`).
Verification:
- Confirmed `/`, `/map-view`, and `/config` all return HTTP 200 on the local dev server (`http://localhost:8081`).
- Could not click through the authenticated UI end-to-end in this session (Google sign-in required); recommend a manual pass to confirm the Map View tab, sidebar notification-click navigation, the mobile drawer at narrow widths, and the new camera picker grid/filter.
