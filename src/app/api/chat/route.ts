import { NextRequest, NextResponse } from 'next/server';
import { checkChatLimit, checkGlobalTokenLimit, redis } from '@/lib/redis-rate-limit';
import { queryPolicy } from '@/lib/gemini';
import { connectToDatabase, Report, UsageRecord } from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        const allowedTokens = await checkGlobalTokenLimit();
        if (!allowedTokens) return NextResponse.json({ error: 'Global daily AI quota reached' }, { status: 503 });

        const { jobId, message } = await req.json();
        if (!jobId || !message) return NextResponse.json({ error: 'Missing jobId or message' }, { status: 400 });

        // Enforce max 10 messages per policy to avoid abuse
        const allowedChat = await checkChatLimit(jobId);
        if (!allowedChat) return NextResponse.json({ error: 'Maximum chat limit (10) reached for this policy' }, { status: 429 });

        // Retrieve raw text from Redis
        const contextText = await redis.get(`chat:context:${jobId}`);
        if (!contextText) {
            return NextResponse.json({ error: 'Policy context expired or not found. Please re-upload.' }, { status: 404 });
        }

        // Call Gemini
        const result = await queryPolicy(jobId, contextText, message);

        // Update database with slightly higher token footprint
        await connectToDatabase();
        await Report.findOneAndUpdate({ jobId }, { $inc: { tokensUsed: result.tokens } });

        // Log granular usage
        const ip = req.headers.get('x-forwarded-for') || 'unknown';
        await UsageRecord.create({
            jobId,
            type: 'CHAT',
            tokensUsed: result.tokens,
            ip
        });

        return NextResponse.json({ reply: result.response });

    } catch (error: unknown) {
        const err = error as Error;
        console.error("Chat API Error", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
