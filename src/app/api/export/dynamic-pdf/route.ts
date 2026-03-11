import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
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

        // Call Gemini to get a detailed explanation for the PDF
        const API_KEY = process.env.GEMINI_API_KEY;
        if (!API_KEY) throw new Error("Missing Gemini key");
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `You are an expert insurance policy writer and analyst. Based on the provided policy document, the user has requested a custom PDF report detailing: "${query}".

CRITICAL INSTRUCTIONS:
1. Provide a comprehensive, structured text covering exactly what the user asked for.
2. Format your response into clear sections using standard Markdown text conventions but STRICTLY limit styling to basic text structure (Sections, Subsections, Bullet Points). 
3. Do NOT use complicated markdown elements like tables or code blocks.
4. If there are clauses, explain each clause clearly.
5. If at least some context is found but it's sparse, construct a brief report anyway.
6. STRICT RULE: DO NOT use any emojis, icons, or special unicode characters under any circumstances, as they will crash the PDF generator.

DOCUMENT:
${docText}`;

        const result = await model.generateContent(prompt);
        const rawContent = result.response.text().trim();

        const doc = new jsPDF();

        // ── Styling & Content ──

        // Header
        doc.setFontSize(20);
        doc.setTextColor('#1d4ed8');
        doc.text('Flow AI Policy Report', 105, 20, { align: 'center' });

        doc.setFontSize(16);
        doc.setTextColor('#111827');
        const titleLines = doc.splitTextToSize(`Custom Report: ${query}`, 170);
        doc.text(titleLines, 105, 30, { align: 'center' });

        doc.setFontSize(10);
        doc.setTextColor('#6b7280');
        doc.text(`Policy: ${report?.metadataJSON?.policyNumber || 'Export'}`, 105, 30 + (titleLines.length * 6), { align: 'center' });

        // Content
        let yPos = 45 + (titleLines.length * 6);

        // Very basic parsing for rendering text
        const blocks = rawContent.split('\n');

        blocks.forEach((line) => {
            let processedLine = line;
            let isHeader = false;

            if (line.startsWith('### ')) {
                processedLine = line.replace('### ', '');
                doc.setFontSize(14);
                doc.setTextColor('#111827');
                isHeader = true;
                yPos += 4;
            } else if (line.startsWith('## ')) {
                processedLine = line.replace('## ', '');
                doc.setFontSize(16);
                doc.setTextColor('#1f2937');
                isHeader = true;
                yPos += 6;
            } else if (line.startsWith('# ')) {
                processedLine = line.replace('# ', '');
                doc.setFontSize(18);
                doc.setTextColor('#1e3a8a');
                isHeader = true;
                yPos += 8;
            } else {
                doc.setFontSize(11);
                doc.setTextColor('#374151');
            }

            // Clean bold/italics markers
            processedLine = processedLine.replace(/\*\*/g, '').replace(/\*/g, '').trim();

            if (processedLine) {
                const textLines = doc.splitTextToSize(processedLine, 170);

                // Add page break if needed
                if (yPos + (textLines.length * 6) > 280) {
                    doc.addPage();
                    yPos = 20;
                }

                doc.text(textLines, 20, yPos);
                yPos += (textLines.length * 6) + (isHeader ? 2 : 1);
            }
        });

        // Footer
        const finalPage = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
        for (let i = 1; i <= finalPage; i++) {
            doc.setPage(i);
            doc.setFontSize(9);
            doc.setTextColor('#9ca3af');
            doc.text('This is an AI generated summary. Please refer to the original policy document for legal terms.', 105, 285, { align: 'center' });
        }

        const pdfBuffer = doc.output('arraybuffer');

        return new Response(pdfBuffer as BodyInit, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="Flow_AI_Custom_PDF.pdf"`
            }
        });

    } catch (error: unknown) {
        const err = error as Error;
        console.error("Dynamic PDF Generation Error", err);
        return NextResponse.json({ error: 'Generate failed', details: err.message }, { status: 500 });
    }
}
