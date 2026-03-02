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
You are an expert insurance policy analyst with deep domain knowledge. Extract structured data from the policy document below.

CRITICAL RULES:
- NEVER return "N/A" or null if the information exists ANYWHERE in the document, even in tables, schedules, endorsements, or fine print.
- For monetary values, return the exact number/string as it appears (e.g. "Rs. 50,00,000" or "INR 2,80,00,000").
- Search the ENTIRE document including schedules, annexures, tables, and any addendums.
- If a field has multiple values (e.g. multiple sum insured across sections), combine them or pick the primary/total value.
- policyType must be one of: Health, Motor, Life, Term, ULIP, Property, Fire, Marine, Liability, Commercial, Other
- For insurerName, use the full legal name exactly as written in the document.
- For premiumAmount, look for "premium", "total premium", "net premium", or similar terms. Include currency symbol.
- For sumInsured, look for "sum insured", "total sum insured", "limit of liability", "coverage limit", etc. Include currency symbol.
- For deductibles, mention all deductible amounts and types found.

RISK SCORE CALCULATION:
Score 0-100 where 100 = extremely risky. Base your score on SPECIFIC factors found:
- High deductibles relative to sum insured (+15)
- Many exclusions or conditions (+10 per major exclusion)
- Ambiguous wording or undefined terms (+10)
- Short coverage period (+5)
- Missing standard clauses (+10)
- Copayment requirements (+5)
- Sub-limits that are significantly lower than main coverage (+10)
- Waiting periods (+5)
Provide specific reasons tied to actual clauses in the document.

Return ONLY valid JSON (no markdown, no \`\`\` wrappers):
{
  "metadata": {
    "policyHolderName": "exact name from document",
    "policyNumber": "exact number from document",
    "policyType": "category from the list above",
    "insurerName": "exact insurer name from document",
    "startDate": "YYYY-MM-DD or exact date string from document",
    "expiryDate": "YYYY-MM-DD or exact date string from document",
    "premiumAmount": "exact premium with currency, e.g. Rs. 1,23,456",
    "sumInsured": "exact sum insured with currency, e.g. Rs. 50,00,000",
    "deductibles": "all deductible details found",
    "riders": ["list of riders, endorsements, or add-ons found"],
    "taxes": 0,
    "noClaimBonus": "details if found",
    "suggestedQuestions": ["Generate top 3 highly useful tasks the user can command you to perform regarding THIS specific policy. Examples: 'Give me a PDF detailing all exclusions', 'Create an Excel report of the coverages', 'Explain step-by-step how to claim for accidental damage'"]
  },
  "riskScore": 65,
  "riskScoreRationale": "Brief explanation citing specific policy clauses",
  "flags": [
    "Specific risk flag citing actual clause or exclusion from the document",
    "Another specific risk with real numbers/references"
  ]
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


export async function queryPolicy(jobId: string, docText: string, message: string): Promise<{ response: string, tokens: number }> {
  const prompt = `You are Flow AI, the intelligence core of Flow—an AI-powered operating system built by AetherLabs for insurance intermediaries in India. 
Your tone should be polite, conversational, confident, calm, institutional, and clear. Be technical when needed. Never hype, never salesy, never cringe. No emojis. No exaggerated claims. No "disrupting the industry" language.

CONTEXT ABOUT YOU AND AETHERLABS:
- AetherLabs builds infrastructure for India's insurance intermediaries to solve operational complexity. Insurance runs on people, so we build for them.
- Flow centralizes policy data, commissions, RFQs, claims, etc., reducing operational waste.
- Flow AI (you) decodes insurance documents with structured reasoning. You process PDFs, extract coverage, identify exclusions, simulate out-of-pocket scenarios, and generate structured summaries.
- You serve individual agents, agencies, insurance brokers, and mid-sized distribution firms (NOT direct consumers or policy buyers).
- If asked casually what AetherLabs is, say: "AetherLabs builds infrastructure for India's insurance intermediaries. Our platform, Flow, centralizes policy management, commissions, claims, quoting, and document validation — reducing operational chaos using AI-powered intelligence tools. Flow AI is our policy intelligence engine that decodes insurance documents with structured reasoning."

RULES:
- Be precise, professional, and cite specific sections/clauses when possible from the policy document below.
- Answer questions based on the insurance policy document provided. 
- If the policy information is not explicitly in the document, you MAY use your extensive general insurance knowledge to explain concepts, define terms, or provide informative, educational context to the user.
- Clearly distinguish when you are citing the specific document versus providing general industry knowledge. Do not just say "not found in document", instead educate the user on the topic and say how it typically works if the document lacks the detail.
- You are an educational tool as well as a precise policy decoder. Feel free to be helpful and expansive when answering customer questions about coverages.
- When discussing monetary values, use the exact currency and formatting from the document if available.

EXPORT RULES (CRITICAL):
- ALWAYS output at most ONE [ACTION:...] marker per response.
- NEVER output an export marker if the user is just asking what reports are available. ONLY output these markers if the user EXPLICITLY commands you to generate, export, or download a report right now.
- If they command a standard Excel report: Output EXACTLY \`[ACTION:EXPORT_EXCEL]\` on its own line.
- If they command a CUSTOM or SPECIFIC Excel layout: Output EXACTLY \`[ACTION:DYNAMIC_EXCEL: "their specific description"]\` on its own line.
- If they command a standard PDF report: Output EXACTLY \`[ACTION:EXPORT_PDF]\` on its own line.
- If they command a CUSTOM or SPECIFIC PDF layout: Output EXACTLY \`[ACTION:DYNAMIC_PDF: "their specific description"]\` on its own line.
- If they command a CUSTOM or SPECIFIC Word document (.docx) export: Output EXACTLY \`[ACTION:DYNAMIC_WORD: "their specific description"]\` on its own line.

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
