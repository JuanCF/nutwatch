# Frontend UI Improvement Plan

**Status legend:** ✓ Done &nbsp;|&nbsp; 📋 Planned

## Current State

Single-page React app (Vite 6 + React 18), no router, no CSS framework, no state management beyond React context. ~1393 lines of CSS in one file. Dark-first cyber/terminal aesthetic with indigo accent.

## Phase 1 — Foundation

### ✓ 1. Add react-router-dom for URL-based routing

**Current:** State-driven navigation (`section` state in `App.jsx`). Refresh resets to dashboard. No browser back/forward.

**Changes:**
- `npm install react-router-dom`
- `App.jsx`: Replace section state with `<Routes>/<Route>`:
  - `/` → Dashboard
  - `/ups` → UpsDevices
  - `/ups/:name` → UpsDetail
  - `/ups/:name/hooks` → HooksSection
  - `/users` → Users
  - `/notifications` → Notifications
  - `/logs` → Logs
  - `/config` → ConfigFiles
- `Sidebar.jsx`: Replace `onClick` handlers with `<NavLink>` components (active class handled by router)
- `UpsCard.jsx`: Replace `onViewDetail`/`onViewHooks` callbacks with `useNavigate()`
- `App.jsx`: Remove `currentDetailUps`, `currentHooksUps` state and related callbacks

### ✓ 2. Error Boundary

- New file: `src/components/ErrorBoundary.jsx`
- Wrap `<main>` content in `App.jsx`
- Fallback: "Something went wrong" card with a "Reload" button

### ✓ 3. `<meta name="theme-color">`

- `index.html`: Add static `<meta name="theme-color" content="#0a0c10">` to `<head>`
- `theme.jsx`: `useEffect` updates the meta tag content dynamically when theme changes

## Phase 2 — UX Improvements

### ✓ 4. Loading skeletons

- Add skeleton CSS animation (pulse/shimmer) to stylesheets
- Replace bare "Loading..." text in:
  - `Dashboard.jsx` — skeleton stat cards & list rows
  - `UpsDevices.jsx` — skeleton card grid
  - `UpsDetail.jsx` — skeleton detail sections
  - `HooksSection.jsx` — TODO: add skeleton rows (currently renders directly from hookEvents, no loading state)

### ✓ 5. Auto-refresh on UPS Detail

- `UpsDetail.jsx`: Add `useEffect` with `setInterval(10s)` polling for telemetry
- Add "Pause / Live" toggle button
- Clean up interval on unmount

### ✓ 6. Sidebar hamburger accessibility

- Replace raw `&#9776;` with inline SVG icon
- Add `aria-label="Toggle navigation"` and `aria-expanded={sidebarOpen}`

### ✓ 7. Focus management on Modal

- `Modal.jsx`: After opening, focus first focusable element or the modal wrapper
- Return focus to trigger element on close

### ✓ 8. Extract inline styles to CSS classes

- `UpsModal.jsx`: Move inline styles (e.g. `style={{ height: '80px', fontFamily: 'var(--mono)' }}`) to named CSS classes
- Any other inline styles in other components

## Phase 3 — Polish & Maintainability

### ✓ 9. Split monolithic `index.css`

Split into multiple files:
- `src/styles/variables.css` — `:root` and `[data-theme="light"]` CSS custom properties
- `src/styles/base.css` — reset, body, typography, scrollbar, keyframes
- `src/styles/components.css` — all component styles (cards, buttons, badges, modals, sidebar, tables, forms, etc.)

Import all three in `main.jsx`.

### 📋 10. Scroll-shadow indicators on overflow tables

- Add subtle gradient overlay at the right edge of table wrappers when content overflows
- Pure CSS approach using `overflow: auto` + `background-attachment`

### ✓ 11. Retry logic in `api.js`

- Wrap `fetch` with automatic retry on network errors (2 retries, 1s exponential backoff)
- Only for GET requests (mutations should not retry automatically)

### ✓ 12. Remove empty `App.css`

- Delete file + remove import from `App.jsx`
