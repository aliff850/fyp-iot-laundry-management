# SpinSense — smart laundry monorepo

The operator web app uses Next.js and a local FastAPI business API. Supabase Auth and PostgreSQL are hosted in the existing Supabase project. See the [PRD](docs/PRD.md) for the target system and [development guide](AGENTS.md) for repository rules.

## Run the operator web app locally

From the repository root, run one command:

```powershell
npm run dev
```

This starts FastAPI on `http://127.0.0.1:8000` and Next.js on `http://localhost:3000`. Open [localhost:3000](http://localhost:3000). Both services log to the same terminal; **Ctrl+C stops both**. The command refuses to start if port 8000 or 3000 is already in use. It does not start the Raspberry Pi/MQTT services, which are not needed to test the current authentication and Branches flow.

### One-time prerequisites

- Node.js 22.12+ and npm; install web dependencies with `npm --prefix frontend-web ci`.
- A working Python 3.11+ virtual environment at `backend/.venv-phase2`. Install backend dependencies with `backend/.venv-phase2/Scripts/python.exe -m pip install -r backend/requirements.txt` on Windows. On Linux/macOS use the environment's `bin/python` instead.
- Ignored `backend/.env` and `frontend-web/.env.local`, based on their placeholder `.env.example` files. The web file needs the Supabase URL, publishable key and `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000`; server-only database and Supabase administrative credentials belong only in `backend/.env`. Never commit or paste these secrets.
- The existing Supabase project with onboarding and branch migrations `001_onboarding.sql` and `002_branches.sql` applied. Supabase must be reachable while testing sign-in and branch data.

After signup, confirm the email and log in. FastAPI completes owner onboarding if needed, then the owner lands on Branches. With no branches, the page shows a genuine empty state. Pending or unassigned personnel see their account status instead. The protected `/dashboard` prototype remains gated.

If startup reports a port conflict, stop the existing workspace server first. Check that its process command line belongs to this repository before stopping it; do not kill unrelated services by process name. When running services separately, stop them after testing as described in [AGENTS.md](AGENTS.md).

## Pi gateway rollout

The repository contains gateway pairing, discovery and sync code, but this checkout is not proof that it is installed on the Pi or Render. Follow the [gateway blueprint](docs/GATEWAY_DEVICE_ONBOARDING_PLAN.md) and the [Pi deployment runbook](pi5/DEPLOYMENT.md) for backups, staged MariaDB/Mosquitto cutover, and pairing. Install the Pi's declared Python packages from [pi5/requirements.txt](pi5/requirements.txt) in its own environment; keep populated secrets outside the repository. Gateway migration 004 was applied and its RLS/browser grants checked on Supabase on 2026-11-01; the matching Render code and Pi worker cutover remain pending. The current machine/LPG operational screens still need persistent read providers before they display paired telemetry as live.

### Render API preparation

The cloud API entry point is `backend/main.py`. A proposed [Render Blueprint](render.yaml) is ready for review; it does not create a service until explicitly connected in Render. It uses `backend` as the root directory, `pip install -r requirements.txt` as the build command, and `uvicorn main:app --host 0.0.0.0 --port $PORT` as the start command. Enter `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, and `OPERATOR_ORIGINS` only in Render environment settings. Set `OPERATOR_ORIGINS` to the actual trusted operator web origins. Update the web API URL and Pi HTTPS cloud base to the created service URL only after `/api/status`, protected routes, and gateway authentication checks pass. No Render service has been created by this checkout.
