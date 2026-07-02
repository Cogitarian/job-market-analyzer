#!/bin/bash

# Job Market Analyzer - Deployment Setup Script
# This script helps set up Railway and Cloudflare Pages deployment

set -e

echo "================================"
echo "Job Market Analyzer - Deploy Setup"
echo "================================"
echo ""

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check prerequisites
echo -e "${BLUE}Step 1: Checking prerequisites...${NC}"
command -v git >/dev/null 2>&1 || { echo "Git is required but not installed. Aborting." >&2; exit 1; }
echo -e "${GREEN}✓ Git found${NC}"

# Check if we're in a git repo
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${YELLOW}Warning: Not in a git repository${NC}"
fi

echo ""
echo -e "${BLUE}Step 2: Verifying deployment files...${NC}"
files=("railway.json" "wrangler.toml" ".github/workflows/deploy.yml" "DEPLOYMENT.md")
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓ $file found${NC}"
    else
        echo -e "${YELLOW}⚠ $file not found - may need to create${NC}"
    fi
done

echo ""
echo -e "${BLUE}Step 3: Project information${NC}"
echo "Project: Job Market Analyzer"
echo "Backend: FastAPI (Python 3.11)"
echo "Frontend: React + TypeScript + Vite"
echo "Backend Framework: uvicorn"
echo "Build output: frontend/dist"

echo ""
echo "================================"
echo -e "${BLUE}Next Steps:${NC}"
echo "================================"
echo ""
echo "1. ${BLUE}Set up Railway Backend:${NC}"
echo "   - Visit: https://railway.app/dashboard"
echo "   - Create a new project"
echo "   - Connect your GitHub repository"
echo "   - Set ANTHROPIC_API_KEY in Railway environment variables"
echo "   - Note your Railway URL"
echo ""
echo "2. ${BLUE}Set up Cloudflare Pages Frontend:${NC}"
echo "   - Visit: https://dash.cloudflare.com/pages"
echo "   - Create a new project from Git"
echo "   - Select your GitHub repository"
echo "   - Build command: cd frontend && npm install && npm run build"
echo "   - Build output directory: frontend/dist"
echo "   - Add env var: VITE_API_URL=<your-railway-url>"
echo ""
echo "3. ${BLUE}(Optional) Set up GitHub Actions:${NC}"
echo "   - Go to GitHub repo > Settings > Secrets"
echo "   - Add secrets from DEPLOYMENT.md"
echo "   - Workflow will auto-deploy on push to main"
echo ""
echo "4. ${BLUE}Update backend CORS:${NC}"
echo "   - In Railway dashboard, set ALLOWED_ORIGINS environment variable"
echo "   - Example: https://job-market-analyzer.pages.dev"
echo ""
echo "5. ${BLUE}Test deployment:${NC}"
echo "   - Push to main branch: git push origin main"
echo "   - Check deployment status in Railway and Cloudflare dashboards"
echo ""
echo -e "${GREEN}For detailed instructions, see DEPLOYMENT.md${NC}"
