import { NextRequest, NextResponse } from 'next/server';
import { checkChatLimit, checkGlobalTokenLimit, redis } from '@/lib/redis-rate-limit';
import { queryConsumerPolicy } from '@/lib/gemini';
import { connectToDatabase, Report, UsageRecord } from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        const allowedTokens = await checkGlobalTokenLimit();
        if (!allowedTokens) return NextResponse.json({ error: 'Global daily AI quota reached' }, { status: 503 });

        const { jobId, message, history } = await req.json();
        if (!jobId || !message) return NextResponse.json({ error: 'Missing jobId or message' }, { status: 400 });

        // Enforce chat limit (configurable via .env MAX_CHAT_PER_POLICY)
        const allowedChat = await checkChatLimit(jobId);
        if (!allowedChat) return NextResponse.json({ error: 'Maximum chat limit reached for this policy' }, { status: 429 });

        const contextText = await redis.get(`chat:context:${jobId}`);
        if (!contextText) {
            return NextResponse.json({ error: 'Policy context expired or not found. Please re-upload.' }, { status: 404 });
        }

        // Use consumer-friendly Gemini prompt
        const result = await queryConsumerPolicy(jobId, contextText, message, history);

        await connectToDatabase();
        await Report.findOneAndUpdate({ jobId }, { $inc: { tokensUsed: result.tokens } });

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
        console.error('Consumer Chat Error', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
