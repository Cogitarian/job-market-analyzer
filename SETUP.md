# Setup Instructions

## GitHub Setup

To push this repository to GitHub, follow these steps:

### Option 1: Using Web Interface (Easiest)

1. Go to https://github.com/new
2. Create a new repository named `job-market-analyzer`
3. Choose public (for sharing) or private
4. **DO NOT** initialize with README, .gitignore, or license (we already have these)
5. Click "Create repository"
6. Copy the SSH or HTTPS URL from the repository
7. In the terminal, run:

```bash
cd /Users/mini/WORK/job-market-analyzer
git remote add origin <YOUR_REPO_URL>
git push -u origin main
```

### Option 2: Using GitHub CLI

```bash
# Install GitHub CLI if not already installed
# brew install gh (macOS)
# apt-get install gh (Linux)

gh repo create job-market-analyzer --source=. --remote=origin --push --public
```

## Configuration

### 1. Environment Variables

Create `.env` file in the `backend` directory:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=your_api_key_here
```

### 2. Install Dependencies (Local Development)

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**Frontend:**
```bash
cd frontend
npm install
```

## Running the Application

### Using Docker (Recommended)

```bash
docker-compose up
```

Access:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Local Development

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate
python app/main.py
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Then open http://localhost:5173 for Vite dev server, or http://localhost:3000 if proxied.

## First Use

1. Start the application
2. Navigate to Data Loader tab
3. Load demo data
4. Explore Dashboard, Predictions, and Chat tabs
5. Try asking questions in the Chat to discuss results

## Troubleshooting

### Port Already in Use
If ports 3000 or 8000 are in use:

```bash
# Kill process on port 3000 (macOS/Linux)
lsof -ti:3000 | xargs kill -9

# Kill process on port 8000 (macOS/Linux)
lsof -ti:8000 | xargs kill -9
```

### API Connection Issues
Make sure backend is running at http://localhost:8000 and check CORS configuration in `backend/app/main.py`

### Missing Dependencies
```bash
# Backend
pip install -r backend/requirements.txt

# Frontend
npm install --prefix frontend
```

## Development Workflow

1. Create a branch for features:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes

3. Commit:
   ```bash
   git add .
   git commit -m "Add your feature description"
   ```

4. Push:
   ```bash
   git push origin feature/your-feature-name
   ```

5. Create Pull Request on GitHub

## Deployment

### Docker Image Build

```bash
docker build -t job-market-analyzer-backend:latest ./backend
docker build -t job-market-analyzer-frontend:latest ./frontend
```

### Deploy to Cloud

The Docker images can be deployed to:
- AWS ECS / Lambda
- Google Cloud Run
- Azure Container Instances
- Heroku (with modifications)
- Your own server

Example Heroku deployment would require:
- Procfile
- Environment variable configuration
- Port mapping adjustments
