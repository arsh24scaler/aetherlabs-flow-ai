import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/free-tool-analytics';

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env');
}

/**
 * Global is used here to maintain a cached connection across hot reloads in development.
 * This prevents connections growing exponentially during API Route usage.
 */
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

let cached: MongooseCache = (global as unknown as { mongoose: MongooseCache }).mongoose;

if (!cached) {
  cached = (global as unknown as { mongoose: MongooseCache }).mongoose = { conn: null, promise: null };
}

export async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 50,
      minPoolSize: 5,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

/**
 * Report Schema
 * Crucially, NEVER stores the raw PDF to prevent Cosmos DB bloat.
 */
const reportSchema = new mongoose.Schema({
  jobId: { type: String, required: true, unique: true },
  status: { type: String, enum: ['QUEUED', 'PROCESSING', 'COMPLETED', 'ERROR'], default: 'QUEUED' },
  policyHash: { type: String }, // To connect with Redis Cache
  metadataJSON: { type: Object },
  riskScore: { type: Number },
  flags: { type: Array },
  tokensUsed: { type: Number, default: 0 },
  agentConversionClicked: { type: Boolean, default: false },
  usedOCR: { type: Boolean, default: false }, // To track whether Computer Vision was fired
  errorLog: { type: String }
}, {
  timestamps: true
});

/**
 * UsageRecord Schema
 * Granular tracking for every AI interaction.
 */
const usageRecordSchema = new mongoose.Schema({
  jobId: { type: String, required: true, index: true },
  type: { type: String, enum: ['ANALYSIS', 'CHAT', 'SIMULATION'], required: true },
  model: { type: String, default: 'gemini-2.0-flash' },
  tokensUsed: { type: Number, required: true },
  ip: { type: String }, // Optional for identifying hotspots
}, {
  timestamps: true
});

// Lead Schema for captured emails
const leadSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  capturedAt: { type: Date, default: Date.now },
  ip: { type: String },
}, { timestamps: true });

// Avoid 'OverwriteModelError' warning internally in Next.js development
export const Lead = mongoose.models.Lead || mongoose.model('Lead', leadSchema);
export const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);
export const UsageRecord = mongoose.models.UsageRecord || mongoose.model('UsageRecord', usageRecordSchema);
