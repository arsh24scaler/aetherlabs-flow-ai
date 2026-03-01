# Flow AI – Policy Intelligence Engine
## Operations, Initialization & Testing Guide

This document outlines the self-serve initialization steps, monitoring strategies, hard boundaries (failsafes), and automated tests to ensure this product gracefully handles viral loads and zero-day abuse.

---

## 1. Initializing the Isolated Infrastructure

This platform must be 100% isolated from `aetherlabs-flow-vm`. You need to initialize the following Azure resources to enable the Next.js application to safely scale to thousands of users:

### Azure Resources to Provision:
1. **Azure Container Apps (ACA)**:
   - Must set minimum instances to `1` (prevents 15-20sec cold starts for the first user).
   - Configure scaling trigger using KEDA for `http` concurrent requests (e.g., scale up when pending requests > 10).
2. **Azure Cosmos DB for MongoDB (or Atlas)**:
   - Create a new, isolated cluster.
   - Purpose: Store JSON reports, global tokens, token usage, flag statistics. DO NOT store raw PDFs.
3. **Azure Cache for Redis**:
   - Create a basic tier isolated Redis cluster.
   - Purpose: IP Rate Limiting (2 policies/hr), Document Hashing (skip AI if PDF already parsed), and Token Kill Switch.
4. **Azure Service Bus**:
   - Create a standard tier namespace.
   - 2 queues required: `pdf-processing-queue` and `pdf-deadletter-queue`.
5. **Azure Computer Vision**:
   - Basic tier. Used strictly as fallback OCR when `pdf-parse` extracts fewer than 500 characters.

### Environment Secrets List (`.env.production`):
```env
# Database & Cache
MONGODB_URI="mongodb+srv://..."
REDIS_URL="redis://..."

# AI Integrations
GEMINI_API_KEY="AIza..."
AZURE_VISION_ENDPOINT="https://..."
AZURE_VISION_KEY="..."

# Queues
SERVICE_BUS_CONNECTION_STRING="..."

# Failsafes
MAX_UPLOADS_PER_IP_HR=2
MAX_CHAT_PER_POLICY=10
GLOBAL_DAILY_TOKEN_LIMIT=50000000
```

---

## 2. Monitoring Matrix

To run a high-volume free public tool, you cannot fly blind. Setup the following dashboards in **Azure Monitor / Application Insights** or Grafana:

| Metric | Threshold Alert | Cause & Action |
| --- | --- | --- |
| **HTTP 429 Too Many Requests** | > 50 / minute | The abuse shield is actively rejecting traffic. *Action: Validate IPs in logs; if targeted, block subnet or activate Cloudflare under Attack mode.* |
| **Global Daily Token Limit** | > 80% used | Viral spike consuming budget. *Action: Review costs vs flow pro conversions; manually increase limit if ROI is positive.* |
| **Redis Eviction Rate** | > 5% / hour | Memory full, document hashes being dropped resulting in repeat AI processing. *Action: Scale Redis up.* |
| **Dead Letter Queue Size** | > 5 jobs | Background workers are crashing on PDFs. *Action: Inspect AI parser error logs and exception traces.* |
| **Container Instances** | > 10 active | Heavy sustained traffic. Ensure database connections can handle instance pool scaling. |

---

## 3. Failsafes and Error Logs

### 🛡️ Hard Failsafes Built-In
1. **The Cost Kill Switch**: A Redis-backed global incrementer counts total Gemini tokens daily. Once the threshold is met, the `/api/upload` endpoint automatically throws a `503 Service Unavailable`, protecting your billing quota.
2. **IP Rate Limit**: Redis blocks an IP if it attempts more than 2 document uploads in an hour.
3. **Queue Fallback**: Uploading a 25MB standard PDF takes time. Synchronous HTTP would timeout and crash. The Service Bus Queue allows immediate HTTP `202 Accepted` while background threads parse the file safely without thread starvation.
4. **Dead-letter Queues**: If a malformed PDF kills the worker thread, it drops into a dead-letter queue rather than endlessly retrying and burning compute/vision API limits.

### 📝 Error Logging Strategy
- We will integrate an internal logger (e.g., `pino` or `winston`) paired with Application Insights.
- We must log Context IDs (e.g., `JobId`) rather than raw user PII.
- Store error logs tagged as `OCR_FAIL`, `AI_PARSE_FAIL`, or `RATE_LIMIT_BLOCK`.

---

## 4. Testing Plans

I have created automated functionality and stress testing scripts in the backend codebase (`/tests` folder).

### Step A: Load and Stress Tests (`scripts/stress.k6.js`)
We simulate traffic spikes to verify our queue logic and auto-scalers don't crash.
- Run locally via `npx k6 run tests/stress.k6.js`
- **What it tests**: 
  - Massive concurrent file uploads to hit the Service Bus Queue lock limits.
  - Redis token counting lock-contention.
  - Spiking the rate limiter endpoints.

### Step B: Functionality Tests (`tests/functionality.spec.ts`)
End-to-end API logic.
- Run via `npx playwright test tests/functionality.spec.ts` or `npm test`.
- **What it tests**: 
  - Submitting mock PDFs to endpoint.
  - Verifying if < 500 chars triggers Azure OCR workflow properly.
  - Validating structured data format from Gemini.
  - Chat limits (ensuring exactly the 11th chat message yields a 'Limit Reached' 402 Error).
  
> All testing files are written to `/home/flow-admin/aetherlabs-free-tool/tests/`.
