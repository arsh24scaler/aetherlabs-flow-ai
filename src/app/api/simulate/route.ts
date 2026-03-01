import { NextRequest, NextResponse } from 'next/server';
import { checkGlobalTokenLimit, redis } from '@/lib/redis-rate-limit';
import { connectToDatabase, Report } from '@/lib/db';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { incrementGlobalTokens } from '@/lib/redis-rate-limit';

let _genAI: GoogleGenerativeAI | null = null;
let _model: GenerativeModel | null = null;

function getGeminiModel() {
    if (_model) return _model;
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) throw new Error("Missing Gemini key.");
    
    _genAI = new GoogleGenerativeAI(API_KEY);
    _model = _genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
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
You are a highly analytical insurance claims simulator. Only return valid JSON predicting the outcome of the user's scenario based EXACTLY on the uploaded policy below. DO NOT HALLUCINATE OUTSIDE THE DOCUMENT.

Scenario: "${scenario}"

Return strictly this JSON (no markdown wrappers):
{
    "covered": "Yes|No|Conditional",
    "estimatedPayout": "number or text",
    "outOfPocket": "number or text",
    "clauseReference": "Quote the exact clause handling this"
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

        return NextResponse.json(parsed);

    } catch (error: unknown) {
        const err = error as Error;
        console.error("Simulation Error", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
