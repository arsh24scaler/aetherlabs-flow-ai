import { NextRequest, NextResponse } from 'next/server';
import { Document, Packer, Paragraph, HeadingLevel } from 'docx';
import { connectToDatabase, Report } from '@/lib/db';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { redis } from '@/lib/redis-rate-limit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    const jobId = req.nextUrl.searchParams.get('jobId');
    const query = req.nextUrl.searchParams.get('query');

    if (!jobId || !query) return NextResponse.json({ error: 'Missing jobId or query' }, { status: 400 });

    try {
        await connectToDatabase();
        const report = await Report.findOne({ jobId });
        if (!report || report.status !== 'COMPLETED') {
            return NextResponse.json({ error: 'Report not ready' }, { status: 404 });
        }

        let docText = await redis.get(`chat:context:${jobId}`);
        if (!docText) docText = "Policy document text missing.";

        // Call Gemini to get a detailed explanation for the Word Document
        const API_KEY = process.env.GEMINI_API_KEY;
        if (!API_KEY) throw new Error("Missing Gemini key");
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `You are Flow AI, an expert insurance policy writer and analyst by AetherLabs. Based on the provided policy document, the user has requested a custom Word report detailing: "${query}".

CRITICAL INSTRUCTIONS:
1. Provide a comprehensive, structured text covering exactly what the user asked for.
2. Format your response into clear sections using standard Markdown text conventions but STRICTLY limit styling to basic text structure. Use '# ' for main title, '## ' for sections, and '### ' for subsections. Use '- ' for bullet points.
3. Do NOT use complicated markdown elements like tables or code blocks.
4. If there are clauses, explain each clause clearly.
5. If at least some context is found but it's sparse, construct a brief report anyway.

DOCUMENT:
${docText}`;

        const result = await model.generateContent(prompt);
        const rawContent = result.response.text().trim();

        // Parse very basic markdown for Word Document
        const blocks = rawContent.split('\n');

        const children = [];

        // Add Title
        children.push(
            new Paragraph({
                text: `Custom Report: ${query}`,
                heading: HeadingLevel.TITLE,
            })
        );
        const policyNum = report?.metadata?.policyNumber || report?.metadataJSON?.policyNumber || 'Export';
        children.push(
            new Paragraph({
                text: `Policy: ${policyNum}`,
                heading: HeadingLevel.HEADING_2,
            })
        );
        children.push(new Paragraph({ text: "" })); // spacer

        blocks.forEach((line) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) {
                children.push(new Paragraph({ text: "" }));
                return;
            }

            if (trimmedLine.startsWith('### ')) {
                children.push(new Paragraph({ text: trimmedLine.replace('### ', ''), heading: HeadingLevel.HEADING_3 }));
            } else if (trimmedLine.startsWith('## ')) {
                children.push(new Paragraph({ text: trimmedLine.replace('## ', ''), heading: HeadingLevel.HEADING_2 }));
            } else if (trimmedLine.startsWith('# ')) {
                children.push(new Paragraph({ text: trimmedLine.replace('# ', ''), heading: HeadingLevel.HEADING_1 }));
            } else if (trimmedLine.startsWith('- ')) {
                children.push(new Paragraph({ text: trimmedLine.replace('- ', ''), bullet: { level: 0 } }));
            } else if (trimmedLine.startsWith('* ')) {
                children.push(new Paragraph({ text: trimmedLine.replace('* ', ''), bullet: { level: 0 } }));
            } else {
                // remove bold/italic markers
                const cleanText = trimmedLine.replace(/\*\*/g, '').replace(/\*/g, '');
                children.push(new Paragraph({ text: cleanText }));
            }
        });

        children.push(new Paragraph({ text: "" }));
        children.push(new Paragraph({ text: "This is an AI generated summary by Flow AI. Please refer to the original policy document for legal terms." }));

        const doc = new Document({
            creator: "Flow AI",
            title: `Custom Report: ${query}`,
            sections: [{
                properties: {},
                children: children,
            }],
        });

        const buffer = await Packer.toBuffer(doc);

        return new Response(buffer as BodyInit, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename="Flow_AI_Custom_Word.docx"`
            }
        });

    } catch (error: unknown) {
        const err = error as Error;
        console.error("Dynamic Word Generation Error", err);
        return NextResponse.json({ error: 'Generate failed', details: err.message }, { status: 500 });
    }
}
