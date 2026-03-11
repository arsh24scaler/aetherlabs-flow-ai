import { NextRequest, NextResponse } from 'next/server';
import { checkGlobalTokenLimit, redis } from '@/lib/redis-rate-limit';
import { connectToDatabase, Report, UsageRecord } from '@/lib/db';
import { compareQuotes } from '@/lib/gemini';

export async function POST(req: NextRequest) {
    try {
        const allowedTokens = await checkGlobalTokenLimit();
        if (!allowedTokens) return NextResponse.json({ error: 'Global daily AI quota reached' }, { status: 503 });

        const { jobIds } = await req.json();
        if (!jobIds || !Array.isArray(jobIds) || jobIds.length < 2) {
            return NextResponse.json({ error: 'Provide at least 2 jobIds to compare' }, { status: 400 });
        }
        if (jobIds.length > 4) {
            return NextResponse.json({ error: 'Maximum 4 policies can be compared at once' }, { status: 400 });
        }

        // Retrieve policy texts from Redis
        const texts: string[] = [];
        for (const jid of jobIds) {
            const text = await redis.get(`chat:context:${jid}`);
            if (!text) {
                return NextResponse.json({ error: `Policy context for ${jid} expired or not found. Please re-upload.` }, { status: 404 });
            }
            texts.push(text);
        }

        // Compare
        const result = await compareQuotes(texts);

        // Update token usage for all jobs
        await connectToDatabase();
        const tokensPerJob = Math.ceil(result.tokensUsed / jobIds.length);
        const ip = req.headers.get('x-forwarded-for') || 'unknown';

        for (const jid of jobIds) {
            await Report.findOneAndUpdate({ jobId: jid }, { $inc: { tokensUsed: tokensPerJob } });
            await UsageRecord.create({
                jobId: jid,
                type: 'ANALYSIS',
                tokensUsed: tokensPerJob,
                ip
            });
        }

        return NextResponse.json(result);

    } catch (error: unknown) {
        const err = error as Error;
        console.error('Consumer Compare Error', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
