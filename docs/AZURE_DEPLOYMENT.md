# Azure Static Web Apps Deployment

This project is configured for automatic deployment to Azure Static Web Apps with complete infrastructure as code.

## Setup Instructions

### 1. Create Azure Service Principal

1. Open Azure Cloud Shell or Azure CLI locally
2. Run the following command:

```bash
az ad sp create-for-rbac --name "wasm-dj-controller-github" \
  --role contributor \
  --scopes /subscriptions/{subscription-id} \
  --sdk-auth
```

3. Copy the entire JSON output

### 2. Add GitHub Secret

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `AZURE_CREDENTIALS`
5. Value: Paste the entire JSON from step 1
6. Click **Add secret**

### 3. Deploy

The workflow will automatically:
- Create the resource group `wasm-dj-controller` in West Europe
- Deploy the Azure Static Web App using Bicep
- Retrieve the deployment token dynamically
- Build the Rust WASM module
- Build the Angular application
- Deploy to Azure Static Web Apps

Simply push to `main` or create a pull request to trigger deployment!

## Infrastructure

The Bicep template (`infrastructure/resources.bicep`) creates:
- **Resource Group**: `wasm-dj-controller`
- **Static Web App**: Free tier with staging environments enabled

## Build Process

The GitHub Actions workflow:

1. **Creates Azure Infrastructure**
   - Resource group
   - Static Web App (Free tier)

2. **Retrieves Deployment Token**
   - Automatically fetches token from Azure
   - No manual secret management needed

3. **Builds Rust WASM module**
   - Compiles the audio engine to WebAssembly
   - Generates JavaScript bindings with wasm-bindgen
   - Copies WASM files to the Angular app

4. **Builds Angular app**
   - Installs npm dependencies
   - Builds production Angular bundle
   - Optimizes assets

5. **Deploys to Azure**
   - Uploads build artifacts to Azure Static Web Apps
   - Automatically provides a preview URL for pull requests
   - Updates production site on merge to main

## URLs

- **Production**: `https://wasm-dj-controller-swa.azurestaticapps.net`
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
