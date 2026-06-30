#!/bin/bash

# GitHub Setup Script
# This script helps you set up the GitHub repository

echo "📦 Job Market Analyzer - GitHub Setup"
echo "======================================"
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "GitHub CLI not found. Please do one of the following:"
    echo ""
    echo "Option 1: Install GitHub CLI"
    echo "  macOS: brew install gh"
    echo "  Linux: apt-get install gh"
    echo "  Windows: choco install gh"
    echo ""
    echo "Option 2: Manual setup"
    echo "  1. Go to https://github.com/new"
    echo "  2. Create a new repository named 'job-market-analyzer'"
    echo "  3. Copy the repository URL"
    echo "  4. Run: git remote add origin <URL>"
    echo "  5. Run: git push -u origin main"
    echo ""
    exit 1
fi

echo "Using GitHub CLI..."
echo ""

# Create repository
echo "Creating GitHub repository..."
gh repo create job-market-analyzer \
    --source=. \
    --remote=origin \
    --push \
    --public \
    --description "AI-powered job market analysis with predictions, NLP analysis, and interactive dashboard"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Repository created successfully!"
    echo ""
    echo "Your repository is available at:"
    echo "https://github.com/$(gh api user --jq '.login')/job-market-analyzer"
    echo ""
    echo "Next steps:"
    echo "1. Add your Anthropic API key to backend/.env"
    echo "2. Run: docker-compose up"
    echo "3. Open: http://localhost:3000"
else
    echo "❌ Failed to create repository"
    exit 1
fi
