import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { connectToDatabase, Report } from '@/lib/db';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { redis } from '@/lib/redis-rate-limit'; // Used for storing/retrieving context

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

        // Call Gemini to get structured JSON array for the excel
        const API_KEY = process.env.GEMINI_API_KEY;
        if (!API_KEY) throw new Error("Missing Gemini key");
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `You are an expert data analyst and insurance underwriter. Based on the provided policy document, the user has requested a custom Excel spreadsheet regarding: "${query}".

CRITICAL INSTRUCTIONS:
1. Synthesize all unstructured information related to the topic into a structured, tabular format. Do NOT just look for an existing table.
2. Even if the topic requires parsing paragraphs and clauses, extract each distinct rule/exclusion/coverage as a separate row. 
3. Output EXACTLY a valid JSON array of objects. 
4. The keys of the objects will be the column headers (e.g. "Clause Name", "Description", "Limit", "Wait Period", etc). Be descriptive with column names.
5. If at least some context is found but it's sparse, construct a table anyway with whatever is available.
6. Return ONLY the raw JSON array wrapped in a \`\`\`json block.

DOCUMENT:
${docText}`;

        const result = await model.generateContent(prompt);
        let rawContent = result.response.text().trim();

        // More robust JSON extraction
        const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            rawContent = jsonMatch[1].trim();
        } else {
            // try stripping manually if the block format is slightly off
            rawContent = rawContent.replace(/^```json/i, '').replace(/```$/, '').trim();
        }

        let dataRows: Record<string, any>[] = [];
        try {
            dataRows = JSON.parse(rawContent);
            if (!Array.isArray(dataRows)) {
                dataRows = [dataRows];
            }
        } catch (e) {
            console.error("Failed to parse Gemini JSON output for dynamic excel:", rawContent);
            dataRows = [{ "Error": "Failed to extract clean tabular data." }];
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Flow AI - AetherLabs';
        const sheet = workbook.addWorksheet('Custom Export');

        if (dataRows.length > 0) {
            const columns = Object.keys(dataRows[0]).map(key => ({
                header: key.charAt(0).toUpperCase() + key.slice(1),
                key: key,
                width: 30
            }));
            sheet.columns = columns;
            sheet.getRow(1).font = { bold: true };

            dataRows.forEach(row => {
                sheet.addRow(row);
            });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        return new NextResponse(buffer as unknown as BodyInit, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="Flow_AI_Custom_Export.xlsx"`
            }
        });

    } catch (error: unknown) {
        const err = error as Error;
        console.error("Dynamic Excel Generation Error", err);
        return NextResponse.json({ error: 'Generate failed' }, { status: 500 });
    }
}
