import { NextRequest, NextResponse } from 'next/server';
import { checkGlobalTokenLimit, redis } from '@/lib/redis-rate-limit';
import { connectToDatabase, Report, UsageRecord } from '@/lib/db';
import { generateConsumerSummary } from '@/lib/gemini';
import { findInsurer } from '@/lib/insurer-data';

export async function POST(req: NextRequest) {
    try {
        const allowedTokens = await checkGlobalTokenLimit();
        if (!allowedTokens) return NextResponse.json({ error: 'Global daily AI quota reached' }, { status: 503 });

        const { jobId } = await req.json();
        if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });

        // Get policy text from Redis
        const contextText = await redis.get(`chat:context:${jobId}`);
        if (!contextText) {
            return NextResponse.json({ error: 'Policy context expired or not found. Please re-upload.' }, { status: 404 });
        }

        // Generate consumer summary + fine print + coverage gaps
        const result = await generateConsumerSummary(contextText);

        // Look up insurer reputation
        const insurerName = result.summary?.policyOverview?.insurerName || '';
        const insurerReputation = findInsurer(insurerName);

        // Update database
        await connectToDatabase();
        await Report.findOneAndUpdate({ jobId }, { $inc: { tokensUsed: result.tokensUsed } });

        const ip = req.headers.get('x-forwarded-for') || 'unknown';
        await UsageRecord.create({
            jobId,
            type: 'ANALYSIS',
            tokensUsed: result.tokensUsed,
            ip
        });

        return NextResponse.json({
            summary: result.summary,
            finePrintAlerts: result.finePrintAlerts,
            coverageGaps: result.coverageGaps,
            visualizations: result.visualizations,
            insurerReputation: insurerReputation || null,
        });

    } catch (error: unknown) {
        const err = error as Error;
        console.error('Consumer Analyze Error', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
