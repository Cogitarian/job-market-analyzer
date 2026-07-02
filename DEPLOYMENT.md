# Deployment Guide: Railway + Cloudflare Pages

This guide walks through deploying the Job Market Analyzer to Railway (backend) and Cloudflare Pages (frontend).

## Prerequisites

- GitHub account with the repository
- Railway account (https://railway.app)
- Cloudflare account (https://cloudflare.com)
- Anthropic API key

## Step 1: Set Up Railway Backend

### 1.1 Create Railway Account & Project
1. Go to https://railway.app and create an account
2. Create a new project
3. Add "Deploy from GitHub repo"
4. Select your job-market-analyzer repository

### 1.2 Configure Railway Service
1. In Railway dashboard, add a new service
2. Select "GitHub Repo" and connect to your repository
3. Set the following:
   - **Source**: GitHub repo (job-market-analyzer)
   - **Branch**: main
   - **Root Directory**: backend (if using monorepo)

### 1.3 Set Environment Variables
In Railway dashboard for the backend service:

```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
DEBUG=False
```

### 1.4 Deploy
- Railway will automatically deploy when you push to main
- Note your Railway backend URL: `https://your-railway-project.railway.app`

## Step 2: Set Up Cloudflare Pages Frontend

### 2.1 Create Cloudflare Pages Project
1. Go to https://dash.cloudflare.com and sign in
2. Navigate to **Pages** > **Create a project** > **Connect to Git**
3. Select your GitHub repository
4. Configure build settings:
   - **Framework**: None (custom)
   - **Build command**: `cd frontend && npm install && npm run build`
   - **Build output directory**: `frontend/dist`
   - **Root directory**: (leave empty or set to .)

### 2.2 Set Environment Variables
In Cloudflare Pages project settings > **Environment variables**:

Add for **Production**:
```
VITE_API_URL=https://your-railway-backend-url.railway.app
```

Replace `your-railway-backend-url` with your actual Railway URL from Step 1.4.

### 2.3 Deploy
- Connect your GitHub repository
- Cloudflare will automatically build and deploy on push to main

## Step 3: GitHub Actions Setup (Optional but Recommended)

For automated deployments via GitHub Actions:

### 3.1 Add GitHub Secrets
In your GitHub repository settings > **Secrets and variables** > **Actions**:

```
RAILWAY_TOKEN = your_railway_token
CLOUDFLARE_ACCOUNT_ID = your_cloudflare_account_id
CLOUDFLARE_API_TOKEN = your_cloudflare_api_token
VITE_API_URL = https://your-railway-backend-url.railway.app
```

**How to get these:**

**Railway Token:**
- Go to https://railway.app/dashboard/settings
- Generate an API token in "Access Tokens"

**Cloudflare Account ID & API Token:**
- Account ID: https://dash.cloudflare.com (profile > Account Settings)
- API Token: https://dash.cloudflare.com/profile/api-tokens
  - Create token with "Cloudflare Pages – Edit" permission

### 3.2 Workflow Triggers
The workflow in `.github/workflows/deploy.yml` will automatically:
- Deploy backend to Railway on push to main
- Deploy frontend to Cloudflare Pages on push to main

## Step 4: CORS Configuration

### 4.1 Update Backend CORS (if needed)
In `backend/app/main.py`, ensure CORS is configured for Cloudflare Pages domain:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://your-cloudflare-pages-domain.pages.dev",
        "https://your-custom-domain.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Step 5: Custom Domain (Optional)

### Railway Backend
1. In Railway dashboard > Project > Service
2. **Settings** > **Domain**
3. Add your custom domain (e.g., api.yourdomain.com)
4. Update DNS records as instructed

### Cloudflare Pages Frontend
1. In Cloudflare dashboard > Pages > Project
2. **Settings** > **Custom domains**
3. Add your domain and verify DNS

## Step 6: Verify Deployment

### Test Backend
```bash
curl https://your-railway-url/docs
```

### Test Frontend
Visit: `https://your-cloudflare-pages-url`

### Test API Connection
- Open the deployed frontend
- Check browser console for any API errors
- Try loading demo data

## Troubleshooting

### Frontend can't connect to backend
- Verify `VITE_API_URL` is set correctly in Cloudflare Pages env vars
- Check CORS configuration in backend
- Ensure Railway backend is running (check Railway dashboard)

### Railway deployment fails
- Check Railway build logs for errors
- Verify `requirements.txt` has all dependencies
- Ensure Python 3.11 is compatible with all packages

### Cloudflare Pages build fails
- Check build logs in Cloudflare dashboard
- Verify `npm install` and `npm run build` work locally
- Ensure Node.js version is 18+

## Monitoring

### Railway Monitoring
- Dashboard shows CPU, memory, disk usage
- Logs available in Railway dashboard
- Can view deployment history

### Cloudflare Pages Analytics
- Requests and performance metrics
- Errors and uptime monitoring
- Available in Cloudflare Pages dashboard

## Database (if needed in future)

For persistent data, consider:
- Railway's PostgreSQL add-on
- Or link to external database via environment variable

## CI/CD Flow

```
You push to main
    ↓
GitHub Actions triggered
    ↓
├─ Build & deploy backend to Railway
└─ Build & deploy frontend to Cloudflare Pages
    ↓
Frontend updated with latest API URL
    ↓
Deployment complete
```

## Rollback

### Railway
- In Railway dashboard, switch to previous deployment
- Click "Redeploy" on an older deployment

### Cloudflare Pages
- In Pages dashboard, view deployment history
- Click "Redeploy" on a previous deployment

---

For more details:
- [Railway Docs](https://docs.railway.app)
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages)
- [Railway Python Guide](https://docs.railway.app/guides/python)
