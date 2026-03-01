import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { connectToDatabase, Report } from '@/lib/db';

export async function GET(req: NextRequest) {
    const jobId = req.nextUrl.searchParams.get('jobId');
    if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });

    try {
        await connectToDatabase();
        const report = await Report.findOne({ jobId });
        if (!report || report.status !== 'COMPLETED') {
             return NextResponse.json({ error: 'Report not ready' }, { status: 404 });
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Flow AI - AetherLabs';
        const sheet = workbook.addWorksheet('Policy Overview');

        sheet.columns = [
            { header: 'Metric', key: 'metric', width: 30 },
            { header: 'Value', key: 'value', width: 50 }
        ];

        // Ensure the header styling looks professional
        sheet.getRow(1).font = { bold: true };

        const m = report.metadataJSON || {};
        sheet.addRow({ metric: 'Policy Holder', value: m.policyHolderName });
        sheet.addRow({ metric: 'Policy Type', value: m.policyType });
        sheet.addRow({ metric: 'Insurer', value: m.insurerName });
        sheet.addRow({ metric: 'Start Date', value: m.startDate });
        sheet.addRow({ metric: 'Expiry Date', value: m.expiryDate });
        sheet.addRow({ metric: 'Premium', value: m.premiumAmount });
        sheet.addRow({ metric: 'Sum Insured', value: m.sumInsured });
        sheet.addRow({ metric: 'Deductibles', value: m.deductibles });
        sheet.addRow({ metric: 'Risk Score', value: report.riskScore });

        const flagsSheet = workbook.addWorksheet('Risk Flags');
        flagsSheet.columns = [{ header: 'Flag', key: 'flag', width: 80 }];
        flagsSheet.getRow(1).font = { bold: true };
        
        const flags = report.flags || [];
        flags.forEach((f: string) => flagsSheet.addRow({ flag: f }));

        const buffer = await workbook.xlsx.writeBuffer();
        return new NextResponse(buffer as unknown as BodyInit, {
             headers: {
                 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                 'Content-Disposition': `attachment; filename="Flow_AI_Policy_Report_${m.policyNumber || 'Export'}.xlsx"`
             }
        });

    } catch (error: any) {
        console.error("Excel Generation Error", error);
        return NextResponse.json({ error: 'Generate failed' }, { status: 500 });
    }
}
