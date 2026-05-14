# Production Deployment

## Runtime layout

- `api`: NestJS HTTP API
- `payments-worker`: BullMQ worker for MPESA payment jobs
- `events-worker`: outbox dispatcher plus domain event consumer
- PostgreSQL: primary system of record
- Redis / Upstash: BullMQ transport and distributed coordination

The API and workers must run as separate processes in production.

## Environment files

1. Copy [.env.production.example](/C:/Users/user/Desktop/PROJECTS/Shule%20hub/.env.production.example) to `.env.production`.
2. Fill in real values for:
   - `DATABASE_URL`
   - `REDIS_URL`
   - `JWT_SECRET` or both JWT token secrets
   - `SECURITY_PII_ENCRYPTION_KEY`
   - MPESA credentials and callback settings

## Docker

Build the production image:

```bash
docker build -t shule-hub:latest .
```

Run the API container:

```bash
docker run --rm -p 3000:3000 --env-file .env.production shule-hub:latest
```

Run the workers from the same image:

```bash
docker run --rm --env-file .env.production shule-hub:latest node dist/apps/api/src/payments-worker.js
docker run --rm --env-file .env.production shule-hub:latest node dist/apps/api/src/events-worker.js
```

## Docker Compose

For a full local production-style stack:

```bash
cp .env.production.example .env.production
docker compose up --build
```

Services:

- API: `http://localhost:3000`
- Liveness: `GET /health`
- Readiness: `GET /health/ready`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## Railway

Create three Railway services in the same project:

1. `api`
2. `payments-worker`
3. `events-worker`

Attach the same repository to all three services.

### API service

- Config file: `/deploy/railway/api.railway.json`
- Build command: `npm run build`
- Start command: `node dist/main.js`
- Healthcheck path: `/health/ready`

### Payments worker service

- Config file: `/deploy/railway/payments-worker.railway.json`
- Build command: `npm run build`
- Start command: `node dist/apps/api/src/payments-worker.js`

### Events worker service

- Config file: `/deploy/railway/events-worker.railway.json`
- Build command: `npm run build`
- Start command: `node dist/apps/api/src/events-worker.js`

### Shared Railway variables

Set these on all three services:

- `NODE_ENV=production`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET` or both JWT token secrets
- `SECURITY_PII_ENCRYPTION_KEY`
- `MPESA_*`
- `MPESA_LEDGER_DEBIT_ACCOUNT_CODE`
- `MPESA_LEDGER_CREDIT_ACCOUNT_CODE`

Set service-specific variables:

- API:
  - `APP_RUNTIME=server`
  - `EVENTS_DISPATCHER_ENABLED=false`
  - `EVENTS_WORKER_ENABLED=false`
  - `OBSERVABILITY_SLO_BACKGROUND_ENABLED=false`
- Payments worker:
  - `APP_RUNTIME=worker`
  - `EVENTS_DISPATCHER_ENABLED=false`
  - `EVENTS_WORKER_ENABLED=false`
  - `OBSERVABILITY_SLO_BACKGROUND_ENABLED=false`
- Events worker:
  - `APP_RUNTIME=worker`
  - `EVENTS_DISPATCHER_ENABLED=true`
  - `EVENTS_WORKER_ENABLED=true`
  - `OBSERVABILITY_SLO_BACKGROUND_ENABLED=false`

## CI/CD

The GitHub Actions workflow in [.github/workflows/ci-cd.yml](/C:/Users/user/Desktop/PROJECTS/Shule%20hub/.github/workflows/ci-cd.yml):

- builds on push and pull request
- runs `npm test`
- deploys all three Railway services on pushes to `main` when these secrets exist:
  - `RAILWAY_API_TOKEN`
  - `RAILWAY_PROJECT_ID`
  - `RAILWAY_ENVIRONMENT_NAME`

The deploy job copies the correct Railway config into a temporary root `railway.json` before calling `railway up`.

## Health verification

API liveness:

```bash
curl http://localhost:3000/health
```

API readiness:

```bash
curl http://localhost:3000/health/ready
```

## Release validation

Before promoting a release, run the local verification suite and the read-safe scale probes:

```bash
npm test
npm run release:readiness
npm run fixture:pilot-school
npm run load:high-volume-workflows
```

`fixture:pilot-school` refuses remote mutation unless `ALLOW_REMOTE_FIXTURE_MUTATION=true`. Keep it pointed at sandbox data unless a release manager explicitly approves a non-production remote target.

## Queue verification

Enqueue a test payment job:

```bash
npm run queue:payments:enqueue:test
```

Verify worker processing:

```bash
npm run queue:payments:verify:test
```
