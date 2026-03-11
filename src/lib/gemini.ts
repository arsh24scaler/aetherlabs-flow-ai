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

export interface InsuredMember {
  name: string;
  relationship: string;
  ped: string[]; // Pre-existing diseases
  riskScore: number;
}

export interface PolicyMetadata {
  policyHolderName: string;
  policyNumber: string;
  policyType: string;
  insurerName: string;
  startDate: string;
  expiryDate: string;
  premiumAmount: string;
  sumInsured: string;
  deductibles: string;
  riders: string[];
  taxes: number;
  noClaimBonus: string;
  suggestedQuestions: string[];
  documentType: 'QUOTE' | 'SCHEDULE' | 'POLICY_WORDING' | 'OTHER';
  insuredMembers?: InsuredMember[];
}

export interface AnalysisResult {
  metadata: PolicyMetadata;
  riskScore: number;
  riskScoreRationale: string;
  flags: string[];
  visualizations: {
    sections: Array<{
      id: string;
      label: string;
      risk: "none" | "warning" | "critical";
      clauses: Array<{
        id: string;
        label: string;
        summary: string;
        risk: "low" | "medium" | "high";
        ref: string;
      }>;
    }>;
    relationships: Array<{
      from: string;
      to: string;
      type: "dependency" | "exclusion" | "reference" | "override";
    }>;
  };
}

/**
 * Extracts strictly JSON metadata from unstructured text.
 */
export async function analyzePolicyText(text: string): Promise<AnalysisResult & { tokensUsed: number }> {
  const systemPrompt = `
You are an expert insurance policy analyst for the Indian market. Extract structured data from the document below.

CRITICAL RULES:
- NEVER return "N/A" or null. Search the ENTIRE document.
- Return ONLY valid JSON (no markdown wrappers).
- DOCUMENT TYPE DETECTION: Identify if this is a QUOTE (premium estimate), a SCHEDULE (policy summary with insured details but minimal clauses), or a POLICY_WORDING (full terms and conditions).
- HEALTH POLICY NUANCE: For family floaters, extract "insuredMembers" with their specific PED (Pre-existing diseases) like "Piles", "Diabetes", etc.

{
  "metadata": {
    "policyHolderName": "...",
    "policyNumber": "...",
    "policyType": "Health|Motor|Life|Term|ULIP|Property|Fire|Marine|Liability|Commercial|Other",
    "insurerName": "...",
    "startDate": "...",
    "expiryDate": "...",
    "premiumAmount": "...",
    "sumInsured": "...",
    "deductibles": "...",
    "riders": ["..."],
    "noClaimBonus": "...",
    "documentType": "QUOTE|SCHEDULE|POLICY_WORDING|OTHER",
    "insuredMembers": [
      { "name": "Name", "relationship": "Self|Spouse|Son|Daughter", "ped": ["..."], "riskScore": "0-100 based on age/PED" }
    ],
    "suggestedQuestions": ["Question 1", "Question 2", "Question 3"]
  },
  "riskScore": 65,
  "riskScoreRationale": "Overall risk calculation, mentioning if the schedule is missing full wording/exclusions (very important for health schedules).",
  "flags": ["Flag 1", "Flag 2"],
  "visualizations": {
    "sections": [
      {
        "id": "sec_1",
        "label": "Section Label (e.g. Coverage Scope)",
        "risk": "none",
        "clauses": [
          {
            "id": "c_1",
            "label": "Clause Label (e.g. Inpatient Hospitalization)",
            "summary": "Brief 1-sentence summary",
            "risk": "low",
            "ref": "Section/Page reference"
          }
        ]
      }
    ],
    "relationships": [
      { "from": "c_1", "to": "sec_1", "type": "dependency" }
    ]
  }
}

VISUALIZATION TOPOLOGY RULES:
- Extract at least 5-8 major sections and 10-15 clauses from the policy.
- Sections should be high-level categories (Coverage, Exclusions, Conditions, Limits, Renewals).
- Clauses should be specific benefits or restrictions.
- Map relationships (e.g. an exclusion link to a coverage section).
- Risk levels: Section risk (none/warning/critical), Clause risk (low/medium/high).
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
      riskScoreRationale: parsed.riskScoreRationale,
      flags: parsed.flags,
      visualizations: parsed.visualizations,
      tokensUsed: tokenEstimate
    };

  } catch (e: unknown) {
    const error = e as Error;
    throw new Error(`Gemini Parsing Error: ${error.message}`);
  }
}


export async function queryPolicy(jobId: string, docText: string, message: string, chatHistory: { role: string; text: string }[] = []): Promise<{ response: string, tokens: number }> {
  const historyText = chatHistory.length > 0
    ? "PREVIOUS CONVERSATION CONTEXT:\n" + chatHistory.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n') + "\n\n"
    : "";

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
- NEVER repeat an [ACTION:...] marker from the conversation history unless the user explicitly requests another report in the CURRENT question. If the user says "thanks", do NOT generate a report marker.

Question: ${message}

${historyText}
Document:
${docText}
`;

  const result = await getGeminiModel().generateContent(prompt);
  const text = result.response.text();

  const tokenEstimate = Math.ceil((prompt.length + text.length) / 4);
  await incrementGlobalTokens(tokenEstimate);

  return { response: text, tokens: tokenEstimate };
}

// ─────────────── Consumer-Oriented Functions ───────────────

export interface ConsumerSummary {
  policyOverview: {
    policyType: string;
    premium: string;
    coverageAmount: string;
    deductible: string;
    policyDuration: string;
    insurerName: string;
    policyNumber: string;
    startDate: string;
    expiryDate: string;
  };
  whatIsCovered: string[];
  whatIsNotCovered: string[];
  importantConditions: string[];
  questionsToAskAgent: string[];
  renewalInfo: {
    expiryDate: string;
    daysUntilExpiry: number | null;
  };
}

export interface FinePrintAlert {
  severity: 'warning' | 'critical';
  clause: string;
  explanation: string;
  whyItMatters: string;
}

export interface CoverageGap {
  gap: string;
  icon: string;
  whyItMatters: string;
  suggestedAddOn: string;
}

/**
 * Generate a consumer-friendly policy summary with plain language.
 */
export async function generateConsumerSummary(text: string): Promise<{
  summary: ConsumerSummary;
  finePrintAlerts: FinePrintAlert[];
  coverageGaps: CoverageGap[];
  visualizations: any;
  tokensUsed: number;
}> {
  const prompt = `You are an expert insurance advisor helping a regular consumer understand their insurance policy. Your job is to explain everything in simple, clear language that anyone can understand.

Analyze the insurance document below and return ONLY valid JSON (no markdown wrappers):
{
  "summary": {
    "policyOverview": {
      "policyType": "e.g. Health, Motor, Life, Home",
      "premium": "exact amount with currency",
      "coverageAmount": "sum insured with currency",
      "deductible": "deductible details",
      "policyDuration": "e.g. 1 year",
      "insurerName": "full insurer name as in document",
      "policyNumber": "policy number",
      "startDate": "YYYY-MM-DD",
      "expiryDate": "YYYY-MM-DD"
    },
    "insuredMembers": [
      { "name": "Name", "relationship": "Self|Spouse|Son|Daughter", "ped": ["e.g. Piles", "Diabetes"], "riskScore": 0-100 }
    ],
    "whatIsCovered": ["List each covered item in simple language, e.g. 'Damage to your car in an accident'"],
    "whatIsNotCovered": ["List each exclusion in simple language, e.g. 'Flood damage to your car is NOT covered'"],
    "importantConditions": ["List conditions in simple language, e.g. 'You must report any accident within 24 hours'"],
    "questionsToAskAgent": ["Generate 5-7 specific questions the consumer should ask before buying, based on THIS policy's gaps"],
    "renewalInfo": {
      "expiryDate": "YYYY-MM-DD or exact date",
      "daysUntilExpiry": null
    }
  },
  "finePrintAlerts": [
    {
      "severity": "warning or critical",
      "clause": "Quote the exact clause text from the document",
      "explanation": "What this clause actually means in simple English",
      "whyItMatters": "Real-world scenario where this clause could hurt the consumer"
    }
  ],
  "coverageGaps": [
    {
      "gap": "What protection is missing, e.g. 'No flood coverage'",
      "icon": "emoji representing the gap, e.g. 🌊",
      "whyItMatters": "Why this gap could be problematic",
      "suggestedAddOn": "What add-on or rider can fix this"
    }
  ],
  "visualizations": {
    "sections": [
      {
        "id": "sec_1",
        "label": "Section Label (e.g. Coverage Scope)",
        "risk": "none",
        "clauses": [
          {
            "id": "c_1",
            "label": "Clause Label (e.g. Inpatient Hospitalization)",
            "summary": "Brief 1-sentence summary",
            "risk": "low",
            "ref": "Section/Page reference"
          }
        ]
      }
    ],
    "relationships": [
      { "from": "c_1", "to": "sec_1", "type": "dependency" }
    ]
  }
}

RULES:
- Use simple, everyday language. No legal jargon.
- DOCUMENT TYPE DETECTION: If this is only a "Schedule" and not the full "Policy Wording", explicitly add a finePrintAlert (critical) stating that the full exclusions are likely missing and were not analyzed.
- For fine print alerts, focus on clauses that could cause claim rejection or surprise costs. Mark truly dangerous ones as "critical".
- For coverage gaps, identify common protections that are MISSING from this policy.
- Always provide at least 3 fine print alerts and 3 coverage gaps if they exist.
- VISUALIZATION TOPOLOGY RULES:
  - Extract at least 5-8 major sections and 10-15 clauses from the policy.
  - Sections should be high-level categories (Coverage, Exclusions, Conditions, Limits, Renewals).
  - Clauses should be specific benefits or restrictions.
  - Map relationships (e.g. an exclusion link to a coverage section).
  - Risk levels: Section risk (none/warning/critical), Clause risk (low/medium/high).
  - Relationship types: dependency, exclusion, reference, override.

DOCUMENT TEXT:
${text}`;

  try {
    const result = await getGeminiModel().generateContent(prompt);
    const responseText = result.response.text().trim();
    let rawJson = responseText;
    if (rawJson.startsWith('```json')) {
      rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
    }
    const parsed = JSON.parse(rawJson);
    const tokenEstimate = Math.ceil((prompt.length + responseText.length) / 4);
    await incrementGlobalTokens(tokenEstimate);

    return {
      summary: parsed.summary,
      finePrintAlerts: parsed.finePrintAlerts || [],
      coverageGaps: parsed.coverageGaps || [],
      visualizations: parsed.visualizations || null,
      tokensUsed: tokenEstimate,
    };
  } catch (e: unknown) {
    throw new Error(`Consumer Summary Error: ${(e as Error).message}`);
  }
}

/**
 * Compare multiple insurance quotes side by side.
 */
export async function compareQuotes(texts: string[]): Promise<{
  comparison: {
    dimensions: string[];
    policies: Array<{
      insurerName: string;
      policyType: string;
      values: Record<string, string>;
    }>;
    aiJudgment: string;
    winner: string;
    winnerReason: string;
  };
  tokensUsed: number;
}> {
  const policySections = texts.map((t, i) => `--- QUOTE ${i + 1} ---\n${t}`).join('\n\n');

  const prompt = `You are an expert insurance comparison advisor. Compare the following ${texts.length} insurance quotes and return a structured comparison.

Return ONLY valid JSON (no markdown wrappers):
{
  "comparison": {
    "dimensions": ["Premium (Total) incl. GST", "Coverage Amount (IDV)", "NCB Applied & Rate (%)", "Deductible", "Claim Limits per Add-on", "Riders/Add-ons", "Claim Process Complexity", "Waiting Periods (for Health)"],
    "policies": [
      {
        "insurerName": "Name of insurer for Quote 1",
        "policyType": "Type of quote",
        "values": {
          "Premium (Total) incl. GST": "value",
          "Coverage Amount (IDV)": "value",
          "NCB Applied & Rate (%)": "e.g. 67.5% - critical for motor! If 0%, highlight it.",
          "Deductible": "value",
          "Claim Limits per Add-on": "e.g. Unlimited vs Capped per year",
          "Riders/Add-ons": "brief list or None",
          "Claim Process Complexity": "Simple/Moderate/Complex",
          "Waiting Periods (for Health)": "details or None"
        }
      }
    ],
    "aiJudgment": "A 2-3 sentence recommendation. EXPOSE specifically any massive Premium differences caused by NCB discrepancies (No Claim Bonus) or hidden limits in add-ons.",
    "winner": "Name of the recommended insurer",
    "winnerReason": "One-line reason"
  }
}

RULES:
- Use simple language
- Be objective and factual
- If one quote is clearly better, say so with specific reasons
- Use exact values from the documents

${policySections}`;

  try {
    const result = await getGeminiModel().generateContent(prompt);
    const responseText = result.response.text().trim();
    let rawJson = responseText;
    if (rawJson.startsWith('```json')) {
      rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
    }
    const parsed = JSON.parse(rawJson);
    const tokenEstimate = Math.ceil((prompt.length + responseText.length) / 4);
    await incrementGlobalTokens(tokenEstimate);

    return { comparison: parsed.comparison, tokensUsed: tokenEstimate };
  } catch (e: unknown) {
    throw new Error(`Quote Comparison Error: ${(e as Error).message}`);
  }
}

/**
 * Consumer-friendly chat — explains in simple language.
 */
export async function queryConsumerPolicy(
  jobId: string, docText: string, message: string, chatHistory: { role: string; text: string }[] = []
): Promise<{ response: string; tokens: number }> {
  const historyText = chatHistory.length > 0
    ? "PREVIOUS CONVERSATION CONTEXT:\n" + chatHistory.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n') + "\n\n"
    : "";

  const prompt = `You are Flow AI, a friendly insurance advisor built by AetherLabs. You help everyday people understand their insurance policies.

YOUR PERSONALITY:
- Warm, clear, and patient
- Explain everything in simple language that anyone can understand
- Use analogies and real-world examples
- Never use legal jargon without explaining it
- If asked to "explain simply" or "explain like I'm new", use even simpler language

RULES:
- Answer questions based on the insurance policy document provided below
- Cite specific sections when possible, but always explain what they mean in plain English
- If information isn't in the document, use your general insurance knowledge but clearly say "This isn't in your policy, but generally..."
- For coverage questions, always clarify: what IS covered, what ISN'T, and any conditions
- For claim questions, provide step-by-step guidance

Question: ${message}

${historyText}
Document:
${docText}`;

  const result = await getGeminiModel().generateContent(prompt);
  const text = result.response.text();
  const tokenEstimate = Math.ceil((prompt.length + text.length) / 4);
  await incrementGlobalTokens(tokenEstimate);

  return { response: text, tokens: tokenEstimate };
}

export async function queryCompareChat(
  texts: string[], message: string, chatHistory: { role: string; text: string }[] = []
): Promise<{ response: string; tokens: number }> {
  const historyText = chatHistory.length > 0
    ? "PREVIOUS CONVERSATION CONTEXT:\n" + chatHistory.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n') + "\n\n"
    : "";

  const policySections = texts.map((t, i) => `--- QUOTE ${i + 1} ---\n${t}`).join('\n\n');
  const prompt = `You are Flow AI, a friendly insurance advisor built by AetherLabs. You are currently helping a user compare multiple insurance quotes.

YOUR PERSONALITY:
- Warm, clear, and patient
- Explain everything in simple language that anyone can understand
- Use analogies and real-world examples
- Never use legal jargon without explaining it

RULES:
- Answer questions based on the insurance quotes provided below
- When comparing, be objective and state facts from the documents
- Clarify which quote offers what specifically
- If information isn't in the documents, use your general insurance knowledge but clearly say "This isn't in the quotes, but generally..."

Question: ${message}

${historyText}
Quotes:
${policySections}`;

  const result = await getGeminiModel().generateContent(prompt);
  const text = result.response.text();
  const tokenEstimate = Math.ceil((prompt.length + text.length) / 4);
  await incrementGlobalTokens(tokenEstimate);

  return { response: text, tokens: tokenEstimate };
}
