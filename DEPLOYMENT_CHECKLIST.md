# Deployment Checklist: Railway + Cloudflare Pages

Use this checklist to track your deployment progress.

## Pre-Deployment

- [ ] Repository is clean (no uncommitted changes)
- [ ] All tests pass locally
- [ ] Have Anthropic API key ready
- [ ] Railway account created
- [ ] Cloudflare account created
- [ ] GitHub repository is public (or paid Railway/Cloudflare plan)

## Railway Backend Setup

- [ ] Visit https://railway.app/dashboard
- [ ] Create a new project
- [ ] Select "Deploy from GitHub repo"
- [ ] Connect to GitHub and select `job-market-analyzer` repository
- [ ] Railway auto-detects Python backend
- [ ] Set environment variables:
  - [ ] `ANTHROPIC_API_KEY` = your API key
  - [ ] `DEBUG` = False (recommended for production)
- [ ] Wait for initial deployment to complete
- [ ] Note your Railway URL (e.g., `https://app-production-xxxx.railway.app`)
- [ ] Test backend: Open `{railway-url}/docs` in browser
- [ ] Verify `/health` endpoint returns `{"status": "ok"}`

## Cloudflare Pages Frontend Setup

- [ ] Visit https://dash.cloudflare.com/pages
- [ ] Create a new project
- [ ] Select "Connect to Git"
- [ ] Authorize GitHub and select `job-market-analyzer` repository
- [ ] Configure build settings:
  - [ ] **Framework**: None (custom)
  - [ ] **Build command**: `cd frontend && npm install && npm run build`
  - [ ] **Build output directory**: `frontend/dist`
  - [ ] **Root directory**: . (leave as default)
- [ ] Set environment variables:
  - [ ] `VITE_API_URL` = `https://your-railway-url.railway.app`
  - [ ] Replace with actual Railway URL from previous step
- [ ] Save and deploy
- [ ] Wait for build to complete
- [ ] Note your Cloudflare URL (e.g., `https://job-market-analyzer.pages.dev`)
- [ ] Test frontend: Open Cloudflare URL in browser
- [ ] Verify page loads without console errors

## Backend CORS Configuration

- [ ] Go back to Railway dashboard
- [ ] Add environment variable `ALLOWED_ORIGINS`:
  - [ ] Value: `https://job-market-analyzer.pages.dev` (or your custom domain)
  - [ ] Separate multiple domains with commas
- [ ] Trigger a redeploy in Railway
- [ ] Wait for backend to restart

## GitHub Actions Setup (Optional)

- [ ] Go to GitHub repo > **Settings** > **Secrets and variables** > **Actions**
- [ ] Add secret `RAILWAY_TOKEN`:
  - [ ] Get from https://railway.app/settings (API Tokens)
- [ ] Add secret `CLOUDFLARE_ACCOUNT_ID`:
  - [ ] Get from https://dash.cloudflare.com (Profile > Account Settings)
- [ ] Add secret `CLOUDFLARE_API_TOKEN`:
  - [ ] Create at https://dash.cloudflare.com/profile/api-tokens
  - [ ] Use "Cloudflare Pages – Edit" template
- [ ] Add secret `VITE_API_URL`:
  - [ ] Value: `https://your-railway-url.railway.app`
- [ ] Verify `.github/workflows/deploy.yml` exists and is correct
- [ ] Make a test commit and push to verify workflow triggers

## Verification Tests

### Frontend
- [ ] Page loads without 404 or error
- [ ] Navigation works
- [ ] Try loading demo data
- [ ] Check browser console (F12) for errors
- [ ] Network tab shows successful API calls to Railway backend

### Backend
- [ ] API docs available at `{railway-url}/docs`
- [ ] Health check passes: `curl {railway-url}/health`
- [ ] Sample API call works: `curl {railway-url}/api/data/demo`
- [ ] Response contains expected job market data

### Integration
- [ ] Frontend can load demo data from backend
- [ ] Dashboard displays charts correctly
- [ ] Chat feature (if enabled) communicates with API
- [ ] No CORS errors in browser console

## Custom Domain (Optional)

### For Railway Backend
- [ ] Purchase or verify domain ownership
- [ ] In Railway: Project > Service > Settings > Domains
- [ ] Add custom domain
- [ ] Update DNS records as instructed
- [ ] Test: `curl https://api.yourdomain.com/health`

### For Cloudflare Pages Frontend
- [ ] Verify domain is on Cloudflare nameservers
- [ ] In Pages: Project > Custom domains
- [ ] Add domain
- [ ] Verify DNS records
- [ ] Test: `https://yourdomain.com`

## Monitoring & Maintenance

- [ ] Set up Railway alerts (CPU, memory, errors)
- [ ] Check Cloudflare Pages analytics monthly
- [ ] Monitor error logs in both platforms
- [ ] Plan for database setup (if needed in future)

## Troubleshooting Notes

If deployment fails, document issues here:
- Issue: ________________
  Solution: ________________

- Issue: ________________
  Solution: ________________

## Deployment Complete! ✅

Once all checks pass:
- [ ] Update README.md with deployed URLs
- [ ] Share deployment links with team
- [ ] Document any custom configuration
- [ ] Set up monitoring dashboard
- [ ] Schedule regular security updates

---

**Deployed URLs:**
- Frontend: _________________________
- Backend API: _________________________
- API Docs: _________________________/docs

**Deployment Date:** ___________

**Notes:**
