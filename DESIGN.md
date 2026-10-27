---
name: DevPulse
description: Developer Reliability Console — Operational API Monitoring & Incident Management Design System
colors:
  background: "#090d16"
  surface: "#0f172a"
  surface-hover: "#131d35"
  surface-active: "#1e293b"
  border: "#1e293b"
  border-subtle: "#162032"
  border-focus: "#3b82f6"
  text-primary: "#f1f5f9"
  text-secondary: "#94a3b8"
  text-muted: "#64748b"
  text-dim: "#475569"
  primary: "#3b82f6"
  primary-hover: "#2563eb"
  primary-foreground: "#ffffff"
  status-healthy: "#10b981"
  status-healthy-bg: "#064e3b"
  status-degraded: "#f59e0b"
  status-degraded-bg: "#78350f"
  status-down: "#ef4444"
  status-down-bg: "#7f1d1d"
  status-warning: "#f97316"
  status-warning-bg: "#7c2d12"
  status-info: "#06b6d4"
  status-info-bg: "#164e63"
  status-disabled: "#64748b"
  status-disabled-bg: "#1e293b"
typography:
  display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: "1.2"
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "1.3"
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: "1.4"
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5"
    letterSpacing: "0em"
  caption:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1.4"
    letterSpacing: "0.01em"
  mono:
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: "1.4"
    letterSpacing: "-0.01em"
  numeric-metric:
    fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, monospace"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "1.1"
    letterSpacing: "-0.03em"
rounded:
  xs: "2px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "9999px"
spacing:
  2xs: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  badge-healthy:
    backgroundColor: "{colors.status-healthy-bg}"
    textColor: "{colors.status-healthy}"
    rounded: "{rounded.xs}"
    padding: "2px 6px"
  badge-down:
    backgroundColor: "{colors.status-down-bg}"
    textColor: "{colors.status-down}"
    rounded: "{rounded.xs}"
    padding: "2px 6px"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.sm}"
    padding: "6px 14px"
  button-secondary:
    backgroundColor: "{colors.surface-active}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "6px 14px"
  card-operational:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Design System: Developer Reliability Console

## Overview

DevPulse is a high-density, developer-first reliability console designed for backend engineers, platform teams, and technical founders monitoring mission-critical APIs and services. The interface prioritizes **immediate operational clarity**, **dense scannability**, and **calm technical precision**.

The visual language models serious developer infrastructure (such as terminal consoles, tracing dashboards, and network telemetry analyzers). It avoids consumer SaaS tropes, excessive decoration, and artificial visual stimulation.

### Core Visual Principles
1. **Calm by Default**: A dark neutral canvas (`#090d16` background, `#0f172a` surface) establishes a stable, low-fatigue operational environment. Healthy systems hum quietly without green overload.
2. **Targeted Severity Signal**: Incidents, degraded states, and delivery failures stand out with surgical precision. Color is reserved for status and telemetry; the interface never paints large areas in alarming red.
3. **Hierarchy of Truth**: Real-time status and active failures outrank metrics; metrics outrank configuration metadata. Visual weight maps directly to operational urgency.
4. **Dense, Tabular Scannability**: Engineers diagnose problems through structured tables, compact rows, aligned metrics, and monospace technical values rather than loosely floating marketing-style cards.

---

## Colors

### The Role of Color
Color in DevPulse is strictly **semantic and informational**, never decorative. The interface is dominated by deep slate neutrals, allowing status colors to act as unambiguous indicators.

### Palette Architecture
- **Canvas & Surface Neutrals**:
  - `background`: `#090d16` — Deep void canvas that maximizes contrast for data visualizations.
  - `surface`: `#0f172a` — Primary operational container surface (tables, toolbars, inspector drawers).
  - `surface-hover`: `#131d35` — Interactive row hover and subtle elevation.
  - `surface-active`: `#1e293b` — Selected states, pressed tabs, and secondary buttons.
  - `border`: `#1e293b` — Crisp, hairline division between operational panels.
  - `border-subtle`: `#162032` — Table row dividers and inner cell boundaries.
- **Typography Neutrals**:
  - `text-primary`: `#f1f5f9` — Titles, active metrics, table headers, critical values.
  - `text-secondary`: `#94a3b8` — Body copy, field labels, secondary metrics, relative timestamps.
  - `text-muted`: `#64748b` — Table column headers, descriptive captions, static metadata.
  - `text-dim`: `#475569` — Disabled items, trailing delimiters, placeholder text.
- **Semantic Status Spectrum**:
  - **Healthy (Green)**: `#10b981` (foreground) / `#064e3b` (tint background). Signifies 100% check success, clean recovery, and active scheduled monitoring.
  - **Degraded (Amber)**: `#f59e0b` (foreground) / `#78350f` (tint background). Signifies elevated latency, threshold warnings, or partial check failures.
  - **Down (Red)**: `#ef4444` (foreground) / `#7f1d1d` (tint background). Signifies active outages, consecutive failed health checks, and unhandled 5xx responses.
  - **Warning (Orange)**: `#f97316` (foreground) / `#7c2d12` (tint background). Signifies retry exhaustion, rate limit approach, or expiring credentials.
  - **Informational (Cyan)**: `#06b6d4` (foreground) / `#164e63` (tint background). Signifies manual test executions, replay dispatches, and configuration events.
  - **Disabled / Paused (Slate)**: `#64748b` (foreground) / `#1e293b` (tint background). Signifies paused monitors, archived endpoints, or inactive notification channels.

---

## Typography

### Typefaces
- **Primary Interface Font**: `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
  - Crisp geometry, tall x-height, and neutral character designed for dense UI scanning.
- **Technical Monospace Font**: `'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Consolas, monospace`
  - Applied intentionally to technical tokens: URLs, HTTP method tokens (`GET`, `POST`), HTTP status codes (`200 OK`, `503`), check latency (`42ms`), UUIDs, event IDs, cron schedules, and timestamps.

### Typographic Hierarchy
| Level | Font / Weight | Size | Line Height | Tracking | Purpose |
|---|---|---|---|---|---|
| **Display / Page** | Inter Semibold (600) | `1.75rem` (28px) | `1.2` | `-0.02em` | Page titles (`Dashboard`, `Monitors`, `Incidents`) |
| **Section Heading** | Inter Semibold (600) | `1.25rem` (20px) | `1.3` | `-0.015em` | Panel titles, incident headers, drawer titles |
| **Subheading / Group** | Inter Medium (500) | `0.9375rem` (15px) | `1.4` | `-0.005em` | Form group titles, table section dividers |
| **Body Standard** | Inter Regular (400) | `0.875rem` (14px) | `1.5` | `0em` | Explanatory copy, notification text, descriptions |
| **Table / Dense UI** | Inter Regular (400) | `0.8125rem` (13px) | `1.4` | `0em` | Table data cells, compact list items |
| **Caption / Meta** | Inter Regular (400) | `0.75rem` (12px) | `1.4` | `0.01em` | Field help text, secondary timestamps, tags |
| **Metric Value** | Mono Semibold (600) | `1.5rem` (24px) | `1.1` | `-0.03em` | Uptime percentage (`99.98%`), p95 latency (`128ms`) |
| **Technical Token** | Mono Regular (400) | `0.8125rem` (13px) | `1.4` | `-0.01em` | URLs, HTTP codes, headers, IDs, delivery attempts |

*Rule*: Never use font size alone to convey hierarchy; pair with weight, color contrast (`text-primary` vs `text-muted`), and spatial proximity.

---

## Layout

### Structural Grid & Rhythm
- **Page Layout**: Fixed sidebar/navigation header with full-bleed or max-width content container (`max-w-7xl` or fluid `w-full` for dense consoles).
- **Vertical Rhythm**: Built on a strict `4px` / `8px` baseline. Standard spacing jumps: `8px` (compact gap), `16px` (item spacing), `24px` (section spacing), `32px` (page section boundaries).
- **Surface Allocation**:
  - Operational views (`/monitors`, `/dashboard`, `/incidents`) prioritize wide, multi-column tabular presentations.
  - Configuration views (`/settings`, `/monitors/new`) use structured single-column or split 2-column forms with quiet visual weight.

### Information Priority
1. **Tier 1 (Instant Scan)**: Current overall health banner, active incident banner, failing monitor rows, degraded service alerts.
2. **Tier 2 (Operational Assessment)**: Aggregated uptime percentages, p50/p95/p99 latency charts, incident duration timers, recent check timeline.
3. **Tier 3 (Forensic Detail)**: Check IDs, request headers, raw response bodies, certificate expiration dates, attempt replay logs.

---

## Elevation & Depth

### Flat Tonal Layering
DevPulse uses **flat tonal layering** rather than heavy drop shadows:
- **Canvas (Base 0)**: `#090d16`
- **Surface (Base 1)**: `#0f172a` with `1px` border of `#1e293b`.
- **Raised Interactive (Base 2)**: `#131d35` on table row hover, dropdown menus, and popovers.
- **Overlay Panels (Base 3)**: `#0f172a` modal dialogs and side inspection sheets with subtle hairline borders (`#3b82f6` accent or `#334155`) and minimal backdrop dimming (`rgba(0, 0, 0, 0.75)`).
- **No Glassmorphism**: Never use frosted glass, blurry translucent cards, or rainbow edge glows.

---

## Shapes

### Form Language & Radius
- **Philosophy**: Architectural, compact, and industrial. Soft, friendly pill shapes and giant rounded bubbles are strictly prohibited.
- **Radius Scale**:
  - `xs (2px)`: Monospace badges, status indicators, check result pips, micro tags.
  - `sm (4px)`: Primary/secondary buttons, input fields, select menus, code chips.
  - `md (6px)`: Operational panels, chart containers, table containers.
  - `lg (8px)`: Modals and full-page overlay sheets.
  - `full (9999px)`: Status dot indicators ONLY (e.g. 6px green/red pulsing indicator dot). Never for large button containers.

---

## Components

### 1. Data Tables
- The core workstation of DevPulse.
- **Density**: Compact row heights (`36px`–`42px`) to maximize data density per viewport.
- **Dividers**: Hairline subtle borders (`#162032`) between rows; zebra striping is avoided in favor of subtle hover highlighting (`#131d35`).
- **Alignment**:
  - Text and URLs: Left-aligned.
  - Status badges and pills: Center-aligned or left-aligned with status dot.
  - Metrics, latency, and dates: Right-aligned with tabular figures (`font-variant-numeric: tabular-nums`).

### 2. Status Badges & Indicators
- Micro badges (`2px` border-radius, `0.75rem` monospace or uppercase condensed font, `2px 6px` padding).
- Colors use dark, muted tint backgrounds with bright text (e.g. dark red `#7f1d1d` background with `#ef4444` text for `DOWN`).
- Paired with a `6px` solid status circle for instant chromatic scanning.

### 3. Metric KPI Cards
- Compact, quiet containers.
- Monospace bold metric values (`numeric-metric`) with concise, uppercase muted labels above or below.
- Avoid giant decorative icon tiles inside KPI cards; metrics speak for themselves.

### 4. Interactive Charts
- Timeseries latency and uptime charts use dark analytical styling:
  - Background: Transparent or `#0f172a`.
  - Grid lines: Subtle `#1e293b` dashed or hairline solid lines.
  - Series line: Sharp `1.5px` stroke with no heavy drop shadows or gradient fills.
  - Incident overlays: Vertical shaded regions in translucent red (`rgba(239, 68, 68, 0.15)`) indicating downtime windows.
  - Crosshair & Tooltip: High-contrast monospace tooltip rendering exact timestamp, HTTP code, and latency in milliseconds.

### 5. Buttons & Controls
- **Primary**: Solid blue `#3b82f6` with white text, crisp 4px radius.
- **Secondary / Ghost**: Muted border `#1e293b` with `#f1f5f9` text, elevating to `#1e293b` on hover.
- **Destructive**: Hairline red border with `#ef4444` text, shifting to solid red only on explicit confirmation.

---

## Do's and Don'ts

### Do's
- **DO** use tabular numbers (`tabular-nums`) and monospace font for all latency values, status codes, timestamps, and IDs.
- **DO** keep healthy states visually calm so when a monitor goes DOWN, the alert immediately draws attention.
- **DO** provide complete technical context (full URL, HTTP method, exact check error message) on monitor inspection.
- **DO** maintain compact, efficient data-table density that lets on-call engineers view 15–20 monitors without endless scrolling.
- **DO** preserve visible focus outlines (`focus-visible:ring-2 focus-visible:ring-blue-500`) for all keyboard navigation.
- **DO** ensure all text and status badges meet WCAG AA contrast standards against their background.

### Don'ts
- **DON'T** use purple/blue decorative gradients, mesh gradients, or blurry background blobs.
- **DON'T** nest cards inside cards inside cards with identical rounded corners.
- **DON'T** make the entire interface monospace; use monospace purposefully for technical tokens and data values.
- **DON'T** use giant bubbly border radii (`rounded-2xl`, `rounded-3xl`, or pill buttons).
- **DON'T** paint entire table rows or screens in solid saturated red or green; use restrained badges, indicator dots, and subtle borders.
- **DON'T** use decorative illustrations, cartoon mascots, or floating 3D icons.
- **DON'T** introduce slow, springy, or bouncy animations; transitions must be instant or crisp (<=150ms ease-out).
- **DON'T** sacrifice information density for artificial whitespace.
