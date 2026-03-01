# Flow AI – Policy Intelligence Engine

Flow AI is a high-performance, event-driven policy analysis tool built with Next.js and Google Gemini. It automates the extraction of risks, flags, and metadata from complex insurance and compliance documents, providing a premium fintech-style dashboard for analysis and interactive Q&A.

---

## 🏗️ Technical Stack

- **Frontend**: [Next.js 16](https://nextjs.org/) (App Router, Turbopack), [Framer Motion](https://www.framer.com/motion/) (Animations).
- **Backend / API**: Next.js Server Actions & API Routes.
- **AI Engine**: [Google Gemini 1.5 Flash](https://ai.google.dev/models/gemini).
- **OCR Fallback**: [Azure Computer Vision v3.2](https://azure.microsoft.com/en-us/services/cognitive-services/computer-vision/).
- **Database**: [MongoDB](https://www.mongodb.com/) (Mongoose).
- **Caching & Rate Limiting**: [Azure Cache for Redis](https://azure.microsoft.com/en-us/products/cache/).
- **Processing Queue**: [Azure Service Bus](https://azure.microsoft.com/en-us/products/service-bus/).
- **Development Tools**: [Concurrently](https://www.npmjs.com/package/concurrently), [tsx](https://www.npmjs.com/package/tsx), [Husky](https://typicode.github.io/husky/).

---

## 🛠️ Local Development Setup

### 1. Prerequisites
Ensure you have the following installed:
- [Node.js 20+](https://nodejs.org/)
- [Docker](https://www.docker.com/) (Optional, for local image verification)

### 2. Environment Variables
Create a `.env` or `.env.local` file in the root directory. You can use the provided keys or your own.

```env
# Database & Cache
MONGODB_URI="your_mongodb_connection_string"
REDIS_URL="your_redis_connection_string"

# AI Integrations
GEMINI_API_KEY="your_google_ai_key"
AZURE_VISION_ENDPOINT="your_azure_vision_endpoint"
AZURE_VISION_KEY="your_azure_vision_key"

# Queues
SERVICE_BUS_CONNECTION_STRING="your_service_bus_connection_string"

# Failsafes & Thresholds
MAX_UPLOADS_PER_IP_HR=2
GLOBAL_DAILY_TOKEN_LIMIT=50000000
MAX_CHAT_PER_POLICY=10
```

### 3. Installation
```bash
npm install
```

### 4. Running the Application
To start both the **Next.js Frontend** and the **Background Queue Worker** simultaneously:
```bash
npm run dev
```

If you only need to run one service:
- `next dev`: Starts only the web frontend.
- `npm run dev:worker`: Starts only the background queue processor (with hot-reloading).

---

## 🧪 Testing

### Automated E2E Tests (Playwright)
```bash
npx playwright test
```

### Stress Testing (K6)
```bash
npx k6 run tests/stress.k6.js
```

---

## 🔐 System Failsafes

1. **Global Cost Kill Switch**: Redis-backed daily tracking of aggregate Gemini token usage (Prevents billing shocks).
2. **IP Rate Limiter**: 2 uploads/hour limit enforced at the API level via Redis.
3. **Queue Redundancy**: If the worker crashes, the PDF job remains in the Azure Service Bus queue for retry or moves to the dead-letter queue.

---

## 📚 Documentation
- [Technical Architecture Guide](TECHNICAL_GUIDE.md)
- [Operations & Testing Guide](OPERATIONS_AND_TESTING_GUIDE.md)
- [Production Deployment Plan](deployment.md)

