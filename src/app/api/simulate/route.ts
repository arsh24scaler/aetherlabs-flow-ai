import { NextRequest, NextResponse } from 'next/server';
import { checkGlobalTokenLimit, redis } from '@/lib/redis-rate-limit';
import { connectToDatabase, Report, UsageRecord } from '@/lib/db';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { incrementGlobalTokens } from '@/lib/redis-rate-limit';

let _genAI: GoogleGenerativeAI | null = null;
let _model: GenerativeModel | null = null;

function getGeminiModel() {
    if (_model) return _model;
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) throw new Error("Missing Gemini key.");

    _genAI = new GoogleGenerativeAI(API_KEY);
    _model = _genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    return _model;
}

export async function POST(req: NextRequest) {
    try {
        const allowedTokens = await checkGlobalTokenLimit();
        if (!allowedTokens) return NextResponse.json({ error: 'Global daily AI quota reached' }, { status: 503 });

        const { jobId, scenario } = await req.json();
        if (!jobId || !scenario) return NextResponse.json({ error: 'Missing jobId or scenario' }, { status: 400 });

        const contextText = await redis.get(`chat:context:${jobId}`);
        if (!contextText) {
            return NextResponse.json({ error: 'Policy context expired. Please re-upload.' }, { status: 404 });
        }

        const systemPrompt = `
You are a highly analytical insurance claims simulator for the Indian market.
Only return valid JSON predicting the outcome of the user's scenario based EXACTLY on the document below.

CRITICAL RULES:
- DOCUMENT TYPE: Insurance documents can be QUOTES (no clauses) or POLICIES (contain clauses).
- IF DOCUMENT IS A QUOTE: A quote only shows premiums. It does NOT have legal clauses. If the document is a QUOTE, the "clauseReference" should state "N/A - This is a Quote, not a Policy" and you should provide general guidance on how a typical Indian policy handles this scenario in "covered".
- IF DOCUMENT IS A POLICY/SCHEDULE: Use exact text.
- DO NOT HALLUCINATE OUTSIDE THE DOCUMENT.

Scenario: "${scenario}"

Return strictly this JSON (no markdown wrappers):
{
    "covered": "Yes|No|Conditional",
    "estimatedPayout": "number or text",
    "outOfPocket": "number or text",
    "clauseReference": "Quote exact clause OR 'N/A - Quote Document'"
}

Document:
${contextText}
`;

        const model = getGeminiModel();
        const result = await model.generateContent(systemPrompt);
        const text = result.response.text().trim();

        let rawJson = text;
        if (rawJson.startsWith('```json')) {
            rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
        }

        const parsed = JSON.parse(rawJson);
        const tokenEstimate = Math.ceil((systemPrompt.length + text.length) / 4);

        await incrementGlobalTokens(tokenEstimate);

        await connectToDatabase();
        await Report.findOneAndUpdate({ jobId }, { $inc: { tokensUsed: tokenEstimate } });

        // Log granular usage
        const ip = req.headers.get('x-forwarded-for') || 'unknown';
        await UsageRecord.create({
            jobId,
            type: 'SIMULATION',
            tokensUsed: tokenEstimate,
            ip
        });

        return NextResponse.json(parsed);

    } catch (error: unknown) {
        const err = error as Error;
        console.error("Simulation Error", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
