import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { incrementGlobalTokens } from './redis-rate-limit';

let _genAI: GoogleGenerativeAI | null = null;
let _model: GenerativeModel | null = null;

function getGeminiModel() {
    if (_model) return _model;
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) throw new Error("Missing Gemini key.");
    
    _genAI = new GoogleGenerativeAI(API_KEY);
    // We use gemini-2.0-flash. Flash is great for speed and cost.
    _model = _genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    return _model;
}

export interface PolicyMetadata {
    policyHolderName: string;
    policyNumber: string;
    policyType: string;
    insurerName: string;
    startDate: string;
    expiryDate: string;
    premiumAmount: number;
    sumInsured: number;
    deductibles: string;
    riders: string[];
    taxes: number;
    noClaimBonus: string;
}

/**
 * Extracts strictly JSON metadata from unstructured text.
 * Calculates approximate token cost and logs it using Redis kill switch.
 */
export async function analyzePolicyText(text: string): Promise<{
    metadata: PolicyMetadata; 
    riskScore: number;
    flags: string[];
    tokensUsed: number;
}> {
    const systemPrompt = `
You are an expert insurance policy evaluator. Extract the following JSON schema from this text.
Schema:
{
  "policyHolderName": "string",
  "policyNumber": "string",
  "policyType": "Health|Motor|Life|Term|ULIP|Property|Other",
  "insurerName": "string",
  "startDate": "YYYY-MM-DD",
  "expiryDate": "YYYY-MM-DD",
  "premiumAmount": number,
  "sumInsured": number,
  "deductibles": "string",
  "riders": ["string"],
  "taxes": number,
  "noClaimBonus": "string"
}

Also calculate a "riskScore" (0-100) where 100 means high risk (e.g. many waiting periods, copays, high deductibles, ambiguous wording).
Also list top 5 "flags" (string array) describing hidden exclusions or limits.

Respond ONLY with valid JSON exactly matching this structure (no markdown wrappers like \`\`\`json):
{
  "metadata": { ... },
  "riskScore": 85,
  "flags": ["Flag 1", "Flag 2", "Flag 3", "Flag 4", "Flag 5"]
}
`;

    // Prompt 
    const prompt = `${systemPrompt}\n\nDOCUMENT TEXT:\n${text}`;

    try {
        const result = await getGeminiModel().generateContent(prompt);
        const responseText = result.response.text().trim();
        
        let rawJson = responseText;
        if (rawJson.startsWith('```json')) {
            rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
        }

        const parsed = JSON.parse(rawJson);
        
        // Count approximate tokens (since 1.5 doesn't always throw it natively without streaming options)
        const tokenEstimate = Math.ceil((prompt.length + responseText.length) / 4);

        await incrementGlobalTokens(tokenEstimate);

        return {
            metadata: parsed.metadata,
            riskScore: parsed.riskScore,
            flags: parsed.flags,
            tokensUsed: tokenEstimate
        };

    } catch (e: unknown) {
        const error = e as Error;
        throw new Error(`Gemini Parsing Error: ${error.message}`);
    }
}


export async function queryPolicy(jobId: string, docText: string, message: string): Promise<{response: string, tokens: number}> {
     const prompt = `You are a helpful AI assistant answering questions ONLY about the insurance policy provided below. 
Do not hallucinate external laws or facts. If it is not in the text, say "Not found in your document."
Question: ${message}

Document:
${docText}
`;

    const result = await getGeminiModel().generateContent(prompt);
    const text = result.response.text();

    const tokenEstimate = Math.ceil((prompt.length + text.length) / 4);
    await incrementGlobalTokens(tokenEstimate);

    return { response: text, tokens: tokenEstimate };
}
