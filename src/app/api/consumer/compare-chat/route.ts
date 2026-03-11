import { NextRequest, NextResponse } from 'next/server';
import { checkGlobalTokenLimit, redis } from '@/lib/redis-rate-limit';
import { connectToDatabase, Report, UsageRecord } from '@/lib/db';
import { queryCompareChat } from '@/lib/gemini';

export async function POST(req: NextRequest) {
    try {
        const allowedTokens = await checkGlobalTokenLimit();
        if (!allowedTokens) return NextResponse.json({ error: 'Global daily AI quota reached' }, { status: 503 });

        const { jobIds, message, history } = await req.json();
        if (!jobIds || !Array.isArray(jobIds) || jobIds.length < 2) {
            return NextResponse.json({ error: 'Provide at least 2 jobIds for quote comparison context' }, { status: 400 });
        }
        if (!message) {
            return NextResponse.json({ error: 'Missing message' }, { status: 400 });
        }

        const texts: string[] = [];
        for (const jid of jobIds) {
            const text = await redis.get(`chat:context:${jid}`);
            if (!text) {
                return NextResponse.json({ error: `Context for ${jid} expired or not found. Please re-upload.` }, { status: 404 });
            }
            texts.push(text);
        }

        const result = await queryCompareChat(texts, message, history);

        await connectToDatabase();
        const tokensPerJob = Math.ceil(result.tokens / jobIds.length);
        const ip = req.headers.get('x-forwarded-for') || 'unknown';

        for (const jid of jobIds) {
            await Report.findOneAndUpdate({ jobId: jid }, { $inc: { tokensUsed: tokensPerJob } });
            await UsageRecord.create({
                jobId: jid,
                type: 'CHAT',
                tokensUsed: tokensPerJob,
                ip
            });
        }

        return NextResponse.json({ reply: result.response });

    } catch (error: unknown) {
        const err = error as Error;
        console.error('Consumer Compare Chat Error', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
