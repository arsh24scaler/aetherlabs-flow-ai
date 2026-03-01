# Flow AI – Technical Architecture & Developer Guide

This document serves as a comprehensive guide to the architecture, deployment, and core functions of the Flow AI Policy Intelligence Engine.

## 🏗 System Architecture

Flow AI follows a decoupled, event-driven architecture designed for high availability and strict usage control.

### 1. High-Level Flow
1.  **User Upload**: Next.js Frontend performs initial validation and uploads to `/api/upload`.
2.  **Rate Limiting**: `redis-rate-limit.ts` checks IP-based limits (2/hour) and the global daily token quota.
3.  **Queuing**: The API pushes a message to **Azure Service Bus** (decoding heavy processing from user wait time).
4.  **Worker (The Brain)**: An independent Node.js process (`src/lib/queue-worker.ts`) pulls jobs from the queue.
5.  **Intelligence Pipeline**:
    - **OCR/Parsing**: `pdf-parser.ts` uses Azure Computer Vision v3.2 (Read API) with a `pdf-parse` fallback for digital PDFs.
    - **AI Extraction**: `gemini.ts` sends structured prompts to Google Gemini 1.5 Flash.
6.  **Persistence**: Final reports and metadata are saved to **MongoDB**.
7.  **Delivery**: Frontend polls `/api/status/[jobId]` to render the `AnalysisDashboard`.

---

## 🔐 Usage Tracking & Guard Rails (High Priority)

Usage tracking is critical to maintaining cost-effectiveness and preventing API abuse.

### **Redis Layer**
- **Global Kill Switch**: Tracks total tokens consumed daily across all users. Once exceeded, the system returns a 503 error.
- **IP Rate Limiter**: Strictly enforces `2 uploads per hour` per IP address.
- **Chat Context Cache**: Stores raw PDF text in Redis for 1 hour to enable the Policy Q&A chat without re-parsing the PDF.

### **Database Layer**
- **Report Document**: Every job in MongoDB tracks its own `tokensUsed`.
- **Analytics**: Reports include source tracking (`usedOCR`, `agentConversionClicked`).

> [!IMPORTANT]
> **Developer Instruction**: Any new AI features or API endpoints **MUST** integrate with `incrementGlobalTokens` or `checkGlobalTokenLimit` in `src/lib/redis-rate-limit.ts`.

---

## 🚀 Deployment & DevOps

The project is fully containerized and uses Azure-native services.

### **Containerization**
-   **Web App**: [Dockerfile](file:///home/flow-admin/aetherlabs-free-tool/Dockerfile) (Next.js Standalone mode for optimized size).
-   **Worker**: [Dockerfile.queue](file:///home/flow-admin/aetherlabs-free-tool/Dockerfile.queue) (Lightweight Node.js instance).

### **CI/CD Pipeline**
Automated deployments via GitHub Actions:
- **Web**: Deploys to Azure Container App (Frontend).
- **Worker**: [deploy-flow-ai-worker.yml](file:///home/flow-admin/aetherlabs-free-tool/.github/workflows/deploy-flow-ai-worker.yml) handles the logic for the background processor.

### **Infrastructure**
- **Hosting**: Azure Container Apps (Serverless).
- **Messaging**: Azure Service Bus (Standard Tier).
- **OCR**: Azure Computer Vision v3.2.
- **Database**: MongoDB Atlas.
- **Cache**: Azure Cache for Redis.

---

## 🛠 Core Internal Functions

### `pdf-parser.ts`
Handles complex PDF extraction. It prioritizes Azure OCR for scanned documents/images and falls back to local parsing for digital text.

### `gemini.ts`
Contains the logic for structured output. It uses Zod-like schema enforcement within the prompt to ensure the `AnalysisDashboard` always receives correct JSON keys (`riskScore`, `flags`, `metadataJSON`).

### `redis-rate-limit.ts`
The projects security gatekeeper. It handles the `FixedWindow` rate limiting algorithm.

---

## 🧪 Testing & Quality
- **Husky Pre-commit**: Automatically runs `npm run build` and `npm run lint` before every commit to ensure code quality.
- **Playwright**: E2E tests for the upload and analysis flow (`tests/functionality.spec.ts`).
- **K6**: Stress testing for queue depth and rate-limit verification (`tests/stress.k6.js`).

---

## 📝 Further Development
- **Priority**: Maintain the high aesthetic standards (Fintech-premium look).
- **Scaling**: If queue depth increases, scale the `flow-ai-worker` replica count in Azure.
- **Models**: Currently using Gemini 1.5 Flash; can be upgraded to 1.5 Pro in `src/lib/gemini.ts` if higher reasoning is needed for complex exclusions.
