# Azure Static Web Apps Deployment

This project is configured for automatic deployment to Azure Static Web Apps.

## Setup Instructions

### 1. Create Azure Static Web App

1. Go to [Azure Portal](https://portal.azure.com)
2. Click "Create a resource" → Search for "Static Web Apps"
3. Click "Create"
4. Configure:
   - **Subscription**: Select your subscription
   - **Resource Group**: Create new or select existing
   - **Name**: `wasm-dj-controller` (or your preferred name)
   - **Plan type**: Free
   - **Region**: Choose closest to you (e.g., West Europe, East US 2)
   - **Source**: GitHub
   - **GitHub account**: Sign in and authorize
   - **Organization**: Select your GitHub org/user
   - **Repository**: `wasm-dj-controller`
   - **Branch**: `main`
5. Click "Review + create" → "Create"

### 2. Get Deployment Token

After creating the Static Web App:

1. Go to your Static Web App resource in Azure Portal
2. Navigate to **Settings** → **Configuration**
3. Copy the **Deployment token**

### 3. Add GitHub Secret

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
5. Value: Paste the deployment token from Azure
6. Click **Add secret**

### 4. Deploy

The workflow will automatically trigger when you:
- Push to the `main` branch
- Create/update a pull request to `main`

## Build Process

The GitHub Actions workflow:

1. **Builds Rust WASM module**
   - Compiles the audio engine to WebAssembly
   - Generates JavaScript bindings with wasm-bindgen
   - Copies WASM files to the Angular app

2. **Builds Angular app**
   - Installs npm dependencies
   - Builds production Angular bundle
   - Optimizes assets

3. **Deploys to Azure**
   - Uploads build artifacts to Azure Static Web Apps
   - Automatically provides a preview URL for pull requests
   - Updates production site on merge to main

## URLs

- **Production**: `https://<your-app-name>.azurestaticapps.net`
- **PR Previews**: Automatically generated for each pull request

## Free Tier Limits

Azure Static Web Apps Free tier includes:
- ✅ 100 GB bandwidth per month
- ✅ Custom domains
- ✅ Free SSL certificates
- ✅ Global CDN
- ✅ Staging environments for PRs
- ✅ Built-in authentication

Perfect for this DJ controller application!
