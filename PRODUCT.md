# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary Users**: Indie developers, small SaaS teams, backend engineers, platform engineers, technical founders, and agencies managing client infrastructure.
- **User Situation & Job**: Operators and developers responsible for production service health who must detect, diagnose, and resolve API outages and performance degradations before customers are impacted.

## Product Purpose

DevPulse is a developer-focused API reliability, uptime monitoring, incident management, and integration-delivery platform.

It reduces the critical time gap between **something breaks** and **the right person understands what happened**, answering immediately:
1. *Is my service healthy?*
2. *What is currently failing?*
3. *When did the failure begin?*
4. *How severe is it?*
5. *What happened during the incident?*
6. *Has the service recovered?*
7. *Were alerts and webhooks delivered successfully?*

## Positioning

A developer reliability console prioritizing operational transparency, technical precision, and zero-fluff workflows. Unlike generic website monitors or consumer-grade dashboards, DevPulse provides full delivery pipeline inspection: durable transactional webhook outboxes, socket-pinned SSRF protection, HMAC signing verification, manual delivery replay with idempotency keys, and granular incident timelines.

## Operating Context

- **Primary Operating Scene**: Developer desktop and laptop workstations during active monitoring, on-call triaging, deployment verification, and post-incident reviews; responsive on-call access on mobile/tablet devices.
- **Key Workflows**:
  - Continuous automated uptime polling (GET/HEAD checks, configurable intervals, network timeouts, custom headers).
  - Incident lifecycle management (threshold-triggered opening, automatic recovery, manual incident acknowledgement/resolution).
  - Webhook endpoint integration with AES-256-GCM encrypted secrets, attempt history, response inspections, and manual replay.
  - Multi-channel notification delivery (in-app notifications, email notifications with retry outbox).
  - Manual health check execution and metrics analysis (p50, p90, p95, p99 latency percentiles, error rates).

## Capabilities and Constraints

- **Confirmed Stack & Architecture**:
  - Frontend: Next.js 16 (App Router), React, Tailwind CSS v4, Lucide icons, shadcn UI component primitives.
  - Backend: NestJS, TypeScript, Prisma ORM with PostgreSQL 16 driver adapter.
  - Infrastructure: Redis 7 + BullMQ for queues and workers, distributed sliding-window rate limiting.
- **Confirmed Capabilities**:
  - Full monitor CRUD and scheduled HTTP/HTTPS polling.
  - Automated incident state transitions with duration tracking.
  - Secure webhook delivery pipeline with SSRF socket pinning, exponential retry backoff, and idempotency guarantees.
  - In-app notification center and SMTP email outbox.
  - Scoped API key management with least-privilege permissions.
- **Technical Constraints**:
  - Must maintain strict documentation and architectural integrity across monorepo packages (`apps/api`, `apps/web`, `packages/shared`).
  - No decorative frontend bloat; every visual element must serve operational scanning and comprehension.

## Brand Commitments

- **Product Name**: DevPulse
- **Brand Archetype**: Developer Reliability Console
- **Personality**: Precise, Operational, Calm, Technical, Trustworthy, Fast, Focused.
- **Explicit Anti-Personalities**:
  - NOT playful or whimsical.
  - NOT consumer-oriented or marketing-heavy.
  - NOT decorative-futuristic, crypto-inspired, or gaming-inspired.
  - NOT overly animated or bouncy.

## Evidence on Hand

- Fully operational full-stack codebase in `D:\devpulse` with 49 test suites (487 passing tests).
- 10 verified PostgreSQL migrations (`devpulse` and `devpulse_test`).
- Incumbent Next.js web application at `apps/web/src/app` with routes:
  - `/` (Landing/Home)
  - `/dashboard` (Service health overview, KPI cards, recent incidents, monitor list)
  - `/monitors` (Monitor inventory and health tables)
  - `/monitors/[id]` (Monitor detail, timeseries latency charts, check logs)
  - `/monitors/[id]/edit` and `/monitors/new` (Monitor configuration forms)
  - `/incidents` (Incident history, duration, severity, and resolution statuses)
  - `/notifications` (In-app alert feed and preference settings)
  - `/settings` (API key management, webhook registration, alert channels)
  - `/login` and `/register` (Authentication forms)

## Product Principles

1. **Operational Truth Over Decoration**: Every visual element exists to help engineers make swift, accurate operational decisions.
2. **Immediate Health Visibility**: Overall system health, failing targets, and active incident severity must be instantly readable at a single glance.
3. **Calm Baseline, Restrained Alerts**: Normal operation is calm, dark, and muted. Failure states become visually prominent without painting the entire screen red.
4. **Deep Technical Traceability**: Expose raw, unambiguous technical values (HTTP status codes, URLs, latency in milliseconds, error messages, delivery attempt IDs) without hiding behind over-simplified abstractions.
5. **Predictable and Consistent Affordances**: Consistent keyboard shortcuts, focus rings, table structures, and inspection drawers across all surfaces.

## Accessibility & Inclusion

- Adherence to WCAG 2.1 AA standards for color contrast across dark and light surfaces.
- Comprehensive keyboard navigation with unambiguous focus rings on all interactive elements.
- Semantic HTML markup (`main`, `nav`, `section`, `table`, `thead`, `tbody`) for screen readers.
- Respect for `prefers-reduced-motion` media queries; transitions must be purposeful, crisp (<=150ms), and non-distracting.
- Responsive accessibility across mobile, tablet, desktop, and ultra-wide monitor views.
