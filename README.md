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
