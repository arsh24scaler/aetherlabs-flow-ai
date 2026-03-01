# Production Deployment Guide: Flow AI - Policy Intelligence Engine

This document summarizes the progress made so far and provides the final step-by-step instructions to get the **Flow AI** application deployed into production on Microsoft Azure.

---

## 🚀 Progress Summary: What Has Been Done

1. **Fixed Production Build Errors**: Updated the Gemini API initialization step to be "lazy-loaded". Previously, static rendering during the Next.js `npm run build` process was causing crashes because it was looking for API keys that were missing at build time.
2. **Created Isolated Dockerfiles**: 
    - `Dockerfile`: Multi-stage Docker build for the Next.js Frontend & API routes.
    - `Dockerfile.queue`: Multi-stage Docker build for the Azure Service Bus queue worker.
3. **Provisioned Core Azure Infrastructure**: Created a dedicated Resource Group (`aether-flow-free-tool-rg`) in `eastus` to keep this project completely isolated from the main AetherLabs infrastructure.
    - **Azure Container Apps Env**: `aether-aca-env` - Created the isolated hosting environment.
    - **Azure Service Bus**: `aetherflowfreeservicebus` - Provisioned with a queue named `pdf-processing-queue`.
    - **Redis Cache**: Provisioned an Azure Redis instance (`aetherflowfreeredis`).

---

## 🛠️ Next Steps: What You Need to Do

Here is the final guide to link your codebase and secrets to your Azure Container Apps directly via GitHub Actions.

### Step 1: Provision Cosmos DB (MongoDB API)
To ensure cost efficiency, we will use the Serverless capacity mode for Cosmos DB.
1. Go to the Azure Portal and search for **Azure Cosmos DB**.
2. Click **Create** and select **Azure Cosmos DB for MongoDB (vCore)** or **Request Unit (RU) model** (RU model is generally easier for simple setups). We recommend **Azure Cosmos DB for MongoDB (RU)**.
3. **Basics Tab**:
   - Subscription: Your Azure Subscription
   - Resource Group: Select `aether-flow-free-tool-rg`
   - Account Name: e.g., `aether-flow-free-db` (must be globally unique)
   - Location: `East US` (to match your other resources)
   - Capacity mode: **Serverless** (critical to avoid fixed minimum monthly costs)
   - Version: 4.2 or higher
4. **Networking Tab**:
   - Connectivity method: **All networks** (since ACA relies on standard outbound IPs unless you setup complex VNet integration). You can lock this down later if required.
5. Click **Review + create** and then **Create**.
6. Once deployment is complete, go to the resource.
7. Under **Settings** on the left menu, click **Connection strings**.
8. Copy the **PRIMARY CONNECTION STRING**. You'll need this shortly.

### Step 2: Grab Your Credentials and Setup GitHub Secrets
You will need to pass these secrets into your GitHub Repository > **Settings** > **Secrets and variables** > **Actions** > **New repository secret**.

You will need the following repository secrets:
- `AZURE_CREDENTIALS`: Use `az ad sp create-for-rbac` to generate credentials for GitHub Actions, scoped to the `aether-flow-free-tool-rg` resource group. (See typical Aether setup).
- `AZURE_RESOURCE_GROUP`: `aether-flow-free-tool-rg`
- *(Optional but recommended)* Provide the App secrets via Github actions, or set these directly on the Azure Container Apps in the portal later.

For the Application itself to run, the following Env Variables need to be available to the Container Apps:
- `MONGODB_URI`: The connection string from Step 1.
- `REDIS_URL`: The access key/connection string from `aetherflowfreeredis`.
- `GEMINI_API_KEY`: Your Google Gemini API Key.
- `AZURE_VISION_ENDPOINT`: Your Azure Computer Vision API Endpoint.
- `AZURE_VISION_KEY`: Your Azure Computer Vision API Key.
- `SERVICE_BUS_CONNECTION_STRING`: The Service bus connection string. 
- `MAX_UPLOADS_PER_IP_HR`: `2`
- `GLOBAL_DAILY_TOKEN_LIMIT`: `5000000`
- `MAX_CHAT_PER_POLICY`: `10`

### Step 3: Create The Azure Container Apps Manually (First Time)
Because the GitHub Actions use `az containerapp update`, the apps must exist in Azure first.
1. Navigate to your Resource Group (`aether-flow-free-tool-rg`) and click **Create -> Container App**.
2. **Basics**:
   - Container App Name: `flow-ai-web`
   - Container Apps Environment: Select `aether-aca-env`.
3. **Container**:
   - (For the first deployment just use the default Quickstart image).
   - **Environment Variables**: Add all the variables listed in Step 2.
4. **Ingress**:
   - Enable Ingress.
   - Traffic: **Accepting traffic from anywhere**.
   - Target Port: `3000`.
5. **Review & Create**.

Repeat this process for the background worker:
- Name: `flow-ai-worker`
- **Environment Variables**: You only need `MONGODB_URI`, `REDIS_URL`, `GEMINI_API_KEY`, `AZURE_VISION_ENDPOINT`, `AZURE_VISION_KEY`, and `SERVICE_BUS_CONNECTION_STRING`.
- Scale: Set Min Replicas to `0` and Max Replicas to `5`.
- **Ingress**: Disable Ingress.

### Step 4: Commit GitHub Actions Workflows
I am about to write two GitHub Actions workflow files into your `.github/workflows` directory:
- `deploy-flow-ai-web.yml`
- `deploy-flow-ai-worker.yml`

Commit and push these files to the `main` branch. GitHub Actions will intercept the push, build the Docker images directly into your GitHub repository's GHCR (GitHub Container Registry), and then use your `AZURE_CREDENTIALS` to deploy the updated image into your waiting `flow-ai-web` and `flow-ai-worker` container apps on Azure!

---

### Step 5: (Optional but Recommended) Setup KEDA Auto-Scaling for the Worker
Once the `flow-ai-worker` is created, you want it to trigger only when a PDF is uploaded.
1. Go to the `flow-ai-worker` Container App in the Portal.
2. Click **Scale** -> **Edit and Deploy** -> **Scale Rules**.
3. Add a **Custom** rule:
   - Name: `service-bus-scale-rule`
   - Type: `azure-servicebus`
   - Metadata: `queueName=pdf-processing-queue`, `messageCount=5`
   - Authentication: Link it to a secret containing your Service Bus connection string.

**That's it!** Once the web app finishes deploying, it will generate a public Application URL where users can drag, drop, and process documents successfully!
