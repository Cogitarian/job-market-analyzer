Deploy the "job-market-analyzer" web app using Render (backend) and Cloudflare Pages (frontend). The GitHub repo is already set up and pushed: https://github.com/Cogitarian/job-market-analyzer (branch: main). The repo already contains a `render.yaml` blueprint at its root, so Render will auto-detect the service config.

Do the following steps in order:

## Step 1: Deploy backend on Render

1. Navigate to https://dashboard.render.com/blueprints
2. Click "New Blueprint Instance"
3. Connect/select the GitHub repo `Cogitarian/job-market-analyzer` (authorize GitHub access if prompted — this is expected and fine)
4. Render should auto-detect `render.yaml` and show one service: `job-market-analyzer-backend`
5. When prompted for environment variables, leave them blank / skip — they are optional (the app has a working demo mode and users can also supply their own LLM API key directly in the web UI, so no secrets are required for a basic deploy)
6. Click "Apply" / "Create"
7. Wait for the build and deploy to finish (this can take several minutes because it installs Python + spaCy models)
8. Once deployed, copy the resulting service URL — it will look like `https://job-market-analyzer-backend.onrender.com`
9. Verify it works by opening `<that-url>/health` in a new tab — it should return `{"status":"ok"}`

## Step 2: Deploy frontend on Cloudflare Pages

1. Navigate to https://dash.cloudflare.com/?to=/:account/pages
2. Click "Create a project" → "Connect to Git"
3. Authorize/select the GitHub repo `Cogitarian/job-market-analyzer`
4. Configure build settings:
   - Framework preset: None
   - Build command: `cd frontend && npm install && npm run build`
   - Build output directory: `frontend/dist`
   - Root directory: leave as default (`/`)
5. Under Environment Variables, add:
   - Name: `VITE_API_URL`
   - Value: the Render backend URL from Step 1 (e.g. `https://job-market-analyzer-backend.onrender.com`) — no trailing slash
6. Click "Save and Deploy"
7. Wait for the build to finish
8. Copy the resulting Cloudflare Pages URL — it will look like `https://job-market-analyzer.pages.dev`

## Step 3: Allow the frontend to call the backend (CORS)

1. Go back to the Render dashboard → the `job-market-analyzer-backend` service → "Environment"
2. Add a new environment variable:
   - Name: `ALLOWED_ORIGINS`
   - Value: the Cloudflare Pages URL from Step 2 (e.g. `https://job-market-analyzer.pages.dev`)
3. Save — this will trigger an automatic redeploy of the backend
4. Wait for the redeploy to finish

## Step 4: Verify everything works end to end

1. Open the Cloudflare Pages URL in a browser tab
2. Click "Wczytaj dane demo" (Load demo data) on the landing page and confirm it succeeds (shows "5000" rows loaded) — this proves the frontend can reach the backend
3. Click "Pulpit" (Dashboard) in the left nav and confirm charts render
4. Click "Czat" (Chat) in the left nav and confirm the page loads in "Tryb demo" (demo mode) without errors
5. Take a final screenshot of the working dashboard and chat pages

## Step 5: Report back

Reply with:
- The final Render backend URL
- The final Cloudflare Pages frontend URL
- Confirmation that demo data loads and dashboard/chat pages render without console errors
- Any errors encountered at any step, verbatim
