import Redis from 'ioredis';
import crypto from 'crypto';

// Initialize Redis 
let redisClient: Redis;

if (process.env.REDIS_URL) {
    if (process.env.REDIS_URL.includes(',')) {
        // Parse Azure Cache for Redis connection string format
        const parts = process.env.REDIS_URL.split(',');
        const hostPort = parts[0].split(':');
        const passwordPart = parts.find(p => p.startsWith('password='));
        const isSsl = parts.some(p => p.toLowerCase() === 'ssl=true');
        
        redisClient = new Redis({
            host: hostPort[0],
            port: parseInt(hostPort[1], 10) || 6380,
            password: passwordPart ? passwordPart.substring(9) : undefined,
            tls: isSsl ? {} : undefined
        });
    } else {
        // Standard Redis URI format
        redisClient = new Redis(process.env.REDIS_URL);
    }
} else {
    // Fallback or memory mock if needed
    redisClient = new Redis({
        host: 'localhost',
        port: 6379
    });
}

redisClient.on('error', (err) => console.error('Redis Client Error', err));

export const redis = redisClient;

// Abuse Shields Configuratio
const MAX_UPLOADS_PER_IP_HR = parseInt(process.env.MAX_UPLOADS_PER_IP_HR || '2', 10);
const GLOBAL_DAILY_TOKEN_LIMIT = parseInt(process.env.GLOBAL_DAILY_TOKEN_LIMIT || '50000000', 10);
const MAX_CHAT_PER_POLICY = parseInt(process.env.MAX_CHAT_PER_POLICY || '10', 10);

/**
 * Validates if the IP has exceeded 2 uploads per hour.
 * @param ip string
 * @returns boolean true if allowed, false if rejected (429)
 */
export async function checkIpRateLimit(ip: string): Promise<boolean> {
    const key = `rate-limit:upload:${ip}`;
    const requests = await redis.incr(key);
    
    if (requests === 1) {
        // Expire in 1 hour
        await redis.expire(key, 3600);
    }

    if (requests > MAX_UPLOADS_PER_IP_HR) {
        return false;
    }
    return true;
}

/**
 * Checks the global kill switch to prevent runaway billing.
 * @returns boolean true if allowed to proceed.
 */
export async function checkGlobalTokenLimit(): Promise<boolean> {
    const key = `global:tokens:daily`;
    const tokens = await redis.get(key);
    if (tokens && parseInt(tokens, 10) > GLOBAL_DAILY_TOKEN_LIMIT) {
        return false; 
    }
    return true;
}

/**
 * Adds tokens to the global daily counter.
 */
export async function incrementGlobalTokens(tokenCount: number): Promise<void> {
    const key = `global:tokens:daily`;
    await redis.incrby(key, tokenCount);
    // Note: To automatically reset daily, we'd need an expiry set on midnight.
    // Simplifying: Set 24h expiry only if it's new.
    const ttl = await redis.ttl(key);
    if (ttl === -1) {
       await redis.expire(key, 86400); 
    }
}

/**
 * Hashes a PDF buffer to prevent re-processing identical documents.
 */
export function hashDocument(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Cache and Retrieve previous Gemini Analysis by Document Hash.
 */
export async function getCachedAnalysis(hash: string): Promise<any | null> {
    const res = await redis.get(`cache:analysis:${hash}`);
    if (res) return JSON.parse(res);
    return null;
}

export async function setCachedAnalysis(hash: string, analysis: any): Promise<void> {
    // Cache for 30 days
    await redis.set(`cache:analysis:${hash}`, JSON.stringify(analysis), 'EX', 2592000);
}

/**
 * Check chat message limit for a specific policy (by Job ID)
 */
export async function checkChatLimit(jobId: string): Promise<boolean> {
    const key = `rate-limit:chat:${jobId}`;
    const msgCount = await redis.incr(key);
    if (msgCount === 1) {
        await redis.expire(key, 2592000); // 30 days
    }
    if (msgCount > MAX_CHAT_PER_POLICY) return false;
    return true;
}
