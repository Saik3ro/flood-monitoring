---
title: Codebase Rules
subtitle: FloodSight Flood Monitoring Dashboard
---

# FloodSight Flood Monitoring Dashboard Codebase Rules

This document records the naming conventions, formatting practices, and implementation patterns used throughout the repository. New code should follow these rules unless an existing framework or external contract requires otherwise.

## 1. Project Structure and File Naming

- Keep application source code under `src/` and organize it by responsibility:
  - `components/auth` for authentication components.
  - `components/floodsight` for dashboard-specific components.
  - `components/ui` for reusable Radix and shadcn-style primitives.
  - `context` for React context providers.
  - `hooks` for reusable React hooks.
  - `lib` for shared utilities, stores, server modules, and API functions.
  - `pages` for page-level components that are not file-based routes.
  - `routes` for TanStack Router route modules.
  - `services` for external service clients such as Firebase.
- Use PascalCase for React component and page filenames, such as `AppShell.tsx`, `CameraMap.tsx`, `Login.jsx`, and `ProfilePage.jsx`.
- Use lowercase kebab-case for utility, hook, route-support, and server files, such as `use-mobile.tsx`, `error-page.ts`, and `error-capture.ts`.
- Use descriptive domain names. Prefer `camera.functions.ts`, `db.server.ts`, and `config.server.ts` over generic names such as `helpers.ts` when a module has a specific responsibility.
- Use `.server.ts` for modules that read server-only environment variables or contain server-only behavior.
- Keep generated files, including `src/routeTree.gen.ts`, under their existing locations and do not edit them by hand.
- Keep documentation files at the repository root or beside the feature they document. Use `SPEC.md` for product requirements, `LOGS.md` for chronological engineering notes, and `README.md` for concise reference material.

## 2. Identifiers and Naming

- Use `camelCase` for variables, functions, React props, object properties, and application data fields:
  - `waterLevel`
  - `floodStatus`
  - `snapshotUrl`
  - `addedAt`
- Use `PascalCase` for React components, TypeScript interfaces, and types:
  - `AppShell`
  - `StatusBadge`
  - `Camera`
  - `User`
- Use `UPPER_SNAKE_CASE` for module-level constants and fixed configuration values, such as `MOBILE_BREAKPOINT`, `ADMIN_EMAIL`, and `LS_KEY`.
- Use uppercase string values for flood statuses: `NORMAL`, `ALERT`, and `DANGER`.
- Use lowercase string values for user roles: `admin`, `authority`, and `viewer`.
- Preserve external naming contracts at integration boundaries. MongoDB fields may use `snake_case`, such as `water_level`, `roi_config`, and `hsv_thresholds`; map them to the application’s `camelCase` names at the boundary.
- Use names that describe behavior or intent. Avoid one-letter variables and unexplained abbreviations.
- Keep terminology aligned with the domain model. Use `camera`, `location`, `waterLevel`, `floodStatus`, `role`, and `user` consistently.

## 3. TypeScript and JavaScript

- Prefer TypeScript for new application code. Use `.ts` for non-React modules and `.tsx` for React components and routes.
- Use JavaScript or JSX only when extending the existing authentication and profile modules that are already written in `.js` or `.jsx`; migrate deliberately rather than mixing styles inside one module.
- TypeScript uses strict checking, ES2022, ES modules, bundler resolution, and the React JSX transform.
- Define explicit prop types for TypeScript components. Use interfaces or type aliases for domain objects and component props.
- Use the `@/*` path alias for application imports where it is supported:
  - `@/components/...`
  - `@/context/...`
  - `@/hooks/...`
  - `@/lib/...`
- Use type-only imports when importing types without runtime behavior: `import type { Camera } from "..."`.
- Prefer named exports in TypeScript modules. Preserve default exports in existing JavaScript page and authentication components unless the module is being intentionally refactored.
- Keep application data shapes consistent with `src/lib/floodsight/types.ts` and adapt external data before it reaches UI components.
- Do not rely on unused-variable checks for correctness. The project explicitly disables unused-local and unused-parameter errors, so remove unused code when it is identified.

## 4. React Components and State

- Use function components and hooks rather than class components.
- Use React hooks for local behavior, including `useState`, `useEffect`, `useMemo`, `useRef`, and `useSyncExternalStore` where appropriate.
- Use context providers for cross-cutting concerns such as authentication.
- Use the existing external store in `src/lib/floodsight/store.ts` for shared dashboard camera and user state instead of introducing a second state-management pattern.
- Keep side effects in effects, event handlers, store actions, or server modules rather than during render.
- Keep component responsibilities narrow. Put reusable visual primitives in `src/components/ui` and dashboard-specific behavior in `src/components/floodsight`.
- Follow the established Radix and shadcn-style primitive pattern: compose primitives, expose typed props, use `forwardRef` where the primitive needs ref forwarding, and merge classes with `cn()`.
- Prefer the existing `lucide-react` icons for interface actions and status indicators.
- Preserve responsive behavior with the existing Tailwind utility and mobile-navigation patterns.

## 5. Routing and Navigation

- Use TanStack Router file-based routing for route modules under `src/routes`.
- Follow the existing route naming convention:
  - `__root.tsx` for the root layout.
  - `_auth.tsx` for the authenticated layout.
  - `_auth.index.tsx` for the authenticated dashboard index route.
  - `login.tsx` and `profile.tsx` for root-level routes.
- Keep route-specific UI and loaders in the corresponding route module.
- Use the authenticated layout for protected dashboard routes and preserve its redirect behavior.
- Keep navigation declarations centralized in `AppShell.tsx` and apply role-based filtering there when appropriate.
- Do not edit `routeTree.gen.ts`; regenerate it through the project’s routing tooling when route files change.

## 6. Server, API, and Data Access

- Keep server-only configuration and database access in `.server.ts` modules.
- Read MongoDB configuration from environment variables and keep connection reuse behavior in `db.server.ts`.
- Use direct `Response` objects with JSON content-type headers for the existing custom API handlers in `server.ts`.
- Use the current API paths and methods consistently:
  - `GET /api/cameras` for camera data.
  - `PATCH /api/cameras/:id` for camera updates.
- Normalize database documents into the application `Camera` type before returning them to the UI.
- Derive flood status through the existing threshold logic and preserve the `NORMAL`, `ALERT`, and `DANGER` status values.
- Validate request bodies before writing to the database. Keep validation at the API boundary and return an appropriate JSON error response when input is invalid.
- Keep API and database failures observable through clear errors and user-facing status where the UI performs the request.
- Do not add new server-function patterns for camera data when the direct API handler is the active architecture.

## 7. State and Persistence

- Use the existing `useSyncExternalStore`-based store for shared camera and user state.
- Keep seeded demo data in the store when a production backend is not available.
- Persist prototype state through the existing `localStorage` key, `floodsight-state-v1`.
- Put state mutations behind store actions such as add, update, sync, role update, and removal rather than mutating state from components.
- Keep Firebase-authenticated user synchronization separate from local demo persistence while the prototype architecture remains in place.
- Preserve the distinction between local user-management behavior and MongoDB-backed camera configuration.

## 8. Styling and UI

- Prefer Tailwind utility classes and the shared UI primitives over new one-off CSS.
- Use semantic design-system classes such as `bg-background`, `bg-card`, `text-muted-foreground`, and `border-border`.
- Define shared colors and design tokens in `src/styles.css`, not in individual components.
- Use OKLCH for design-system color values and update both light and dark token blocks when adding a semantic color.
- Use the existing status tokens for flood states: `status-normal`, `status-alert`, and `status-danger`.
- Preserve the existing responsive dashboard layout, including constrained content containers, responsive grids, horizontal camera-feed overflow, cards, and mobile navigation.
- Use shared UI primitives for inputs, buttons, tables, dialogs, and other common controls when an appropriate primitive exists.
- Avoid hard-coded colors and inline styles for new shared or dashboard UI. Existing authentication and profile pages contain legacy hard-coded styling; new work should follow the token system.
- Keep inline styles limited to cases where a third-party library or a genuinely dynamic value requires them.
- Use icons with buttons for icon-based actions and provide accessible labels or tooltips for unfamiliar icons.

## 9. Formatting and Linting

- Run Prettier using the repository configuration before submitting changes.
- Follow the configured Prettier style:
  - 100-character print width.
  - Semicolons.
  - Double quotes.
  - Trailing commas where supported.
- Keep indentation and line breaks consistent with nearby code. Break long JSX, object literals, and function calls when they exceed the configured width.
- Run ESLint for TypeScript and TSX changes with `npm run lint`.
- Keep imports organized and remove imports that are no longer used.
- Do not add imports from the Next.js `server-only` package. Use the repository’s `.server.ts` convention or the TanStack Start server-only mechanism described by the lint rule.
- Keep generated and ignored output out of formatting and linting changes.

## 10. Error Handling and Logging

- Handle route-level errors through the shared root `ErrorComponent` and preserve router reset/invalidation behavior.
- Use the shared server error-page response for server-entry failures.
- Return structured JSON errors from API handlers and use suitable HTTP status codes.
- Surface recoverable fetch and authentication failures in the UI with clear messages.
- Log enough context to diagnose failures, but do not log credentials, tokens, or unnecessary configuration values.
- Avoid silently ignoring errors unless the operation is intentionally best-effort and the failure cannot affect user-visible correctness.
- Use comments to explain non-obvious error recovery, server-only behavior, or third-party integration constraints.

## 11. Comments and Documentation

- Keep comments sparse and purposeful. Explain why a non-obvious decision exists, not what an obvious line does.
- Prefer concise `//` comments for local implementation notes and structured block comments for larger configuration sections.
- Update nearby documentation when changing routes, API behavior, data shapes, environment requirements, or prototype limitations.
- Follow the repository’s documentation patterns:
  - YAML front matter and numbered sections for formal specifications and rules.
  - Tables and concise warnings for reference documentation.
  - Chronological entries with verification notes for engineering logs.
  - Acceptance criteria and implementation goals for task prompts.
- Document prototype behavior honestly, especially when data is simulated, stored locally, or backed by a development fallback.

## 12. Existing Inconsistencies to Resolve Gradually

The following patterns exist in the current repository but should not be expanded in new code:

- Both `.js`/`.jsx` and `.ts`/`.tsx` are used; new application modules should prefer TypeScript.
- Some JavaScript modules use single quotes and untyped props even though the repository formatter and typed layer use double quotes and explicit types.
- `firebase.js` and `firebase.ts` expose different Firebase implementations; reuse the active import path and consolidate them only as a deliberate change.
- Some application pages use hard-coded colors, custom gradients, raw HTML controls, or inline CSS instead of shared tokens and UI primitives.
- Legacy server-function examples remain alongside the direct camera API architecture; do not copy the legacy pattern for new camera features.
- Existing property and role aliases such as `photoURL`/`avatarUrl` and `authorities`/`authority` should be normalized only with a compatibility plan.
- Generated UI primitives may contain generator-specific markers or naming quirks. Preserve their public behavior when making focused fixes.

## 13. Change Checklist

- [ ] The file and symbol names follow the conventions in this document.
- [ ] New TypeScript code has explicit types for props and domain data.
- [ ] Local imports use the `@/*` alias where supported.
- [ ] Shared state uses the existing store or context pattern.
- [ ] New UI uses shared tokens, Tailwind utilities, and available primitives.
- [ ] Server-only code remains in `.server.ts` modules.
- [ ] API input is validated and failures are surfaced clearly.
- [ ] Prettier and ESLint pass for the changed code.
- [ ] Relevant documentation and route/data-model notes are updated.
