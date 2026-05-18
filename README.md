# News Central

News Central is a full-stack staff appraisal SaaS platform with a responsive React frontend and an Express/PostgreSQL backend.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, Recharts, React Router
- Backend: Node.js, Express, TypeScript, PostgreSQL, JWT, Zod
- Deployment target: Vercel + PostgreSQL

## Workspace

- `frontend` - SaaS web app UI
- `backend` - REST API and SQL schema

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Frontend:

```bash
npm run dev:frontend
```

3. Backend:

```bash
npm run dev:backend
```

## Environment files

- Frontend: `frontend/.env.example`
- Backend: `backend/.env.example`

## Production deployment notes

- Set a strong `JWT_SECRET` before deploying. The API now refuses to start with the default placeholder secret.
- Set `DATABASE_URL` to your production PostgreSQL connection string.
- Set `CLIENT_URL` to one or more allowed frontend origins. Separate multiple values with commas.
- In production, use HTTPS frontend origins in `CLIENT_URL`.

## Backend notes

- Uses JWT auth and RBAC middleware
- Applies business rules for KPI weight totals, locked approved KPIs, immutable sign-off, and final score requirements
- Includes pagination, rate limiting, request validation, and audit logging

## Database

Run the SQL in `backend/db/schema.sql` against PostgreSQL, then configure `DATABASE_URL`.
