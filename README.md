# DevPulse

DevPulse is a portfolio-quality full-stack SaaS platform for high-precision API uptime monitoring and incident management.

## Architecture

DevPulse is structured as an enterprise-grade monorepo managed with **pnpm workspaces**:

```
devpulse/
├── apps/
│   ├── web/               # Next.js 16 App Router (React 19, Tailwind CSS 4, shadcn/ui)
│   └── api/               # NestJS 11 REST API & Standalone Worker Process
├── packages/
│   └── shared/            # Shared TypeScript contracts, DTO interfaces, and constants
├── prisma/                # Prisma 7 schema, migrations, and generated client
├── prisma.config.ts       # Prisma 7 CLI configuration & migration datasource
├── docker-compose.yml     # PostgreSQL 16 & Redis 7 container orchestration
└── pnpm-workspace.yaml
```

## Technology Stack

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui primitives.
- **Backend**: NestJS 11 REST API with TypeScript strict mode.
- **Background Worker**: Dedicated standalone BullMQ worker process (`apps/api/src/worker.ts`).
- **Database & ORM**: PostgreSQL 16 with Prisma 7 (`provider = "prisma-client"`, `@prisma/adapter-pg` driver adapter).
- **Task Queue**: Redis 7 and BullMQ v6 using `JobScheduler` APIs.
- **Security**: Hardened SSRF defense (socket IP pinning, strict CIDR parsing), HttpOnly cookies, refresh token rotation with reuse detection.

## Prerequisites

- [Node.js](https://nodejs.org/) (v22+ or v24+)
- [pnpm](https://pnpm.io/) (v10+ or v12+)
- [Docker](https://www.docker.com/) and Docker Compose

## Quick Start (Local Development)

### 1. Clone & Install Dependencies

```bash
git clone <repo-url> devpulse
cd devpulse
pnpm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

### 3. Start Infrastructure Services

Start PostgreSQL 16 and Redis 7 using Docker Compose:

```bash
pnpm dev:services
```

### 4. Apply Database Migrations & Generate Prisma Client

```bash
pnpm db:migrate
```

### 5. Start the Application

Start all services (Web, API, and Worker) concurrently:

```bash
pnpm dev
```

Or run individual services:

- **Frontend**: `pnpm dev:web` (runs on [http://localhost:3000](http://localhost:3000))
- **API Server**: `pnpm dev:api` (runs on [http://localhost:4000](http://localhost:4000))
- **Background Worker**: `pnpm dev:worker` (runs standalone Node context)

## Project Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Runs Web, API, and Worker concurrently |
| `pnpm dev:web` | Starts Next.js 16 dev server |
| `pnpm dev:api` | Starts NestJS API in watch mode |
| `pnpm dev:worker` | Starts background worker in watch mode |
| `pnpm dev:services` | Starts PostgreSQL and Redis containers |
| `pnpm dev:services:down` | Stops infrastructure containers |
| `pnpm db:migrate` | Applies Prisma 7 migrations |
| `pnpm db:seed` | Seeds isolated demonstration data |
| `pnpm build` | Builds all packages and applications |
| `pnpm test` | Runs automated test suites across workspaces |

## Level 1 Scope

- User authentication with refresh session rotation and token revocation.
- Dashboard with live database-driven statistics.
- Create, view, edit, pause, resume, and delete API health monitors (GET & HEAD).
- Scheduled background health checks with BullMQ job schedulers.
- Multi-layer SSRF protection with socket-level IP validation.
- Append-only check results recording latency and status codes.
- Automated incident detection (3 consecutive failures) and recovery.
- Historical uptime and latency charts.
- Distinguishable demo data and isolated demo user account.
