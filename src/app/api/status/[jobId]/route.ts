import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, Report } from '@/lib/db';

export async function GET(
    req: NextRequest, 
    { params }: { params: Promise<{ jobId: string }> }
) {
    try {
        const { jobId } = await params;
        
        await connectToDatabase();
        const report = await Report.findOne({ jobId });

        if (!report) {
            return NextResponse.json({ error: 'Job Not Found' }, { status: 404 });
        }

        if (report.status === 'ERROR') {
            return NextResponse.json({ error: report.errorLog }, { status: 500 });
        }

        if (report.status === 'COMPLETED') {
            return NextResponse.json({
                status: report.status,
                metadata: report.metadataJSON,
                riskScore: report.riskScore,
                flags: report.flags,
                policyHash: report.policyHash,
                usedOCR: report.usedOCR, // for tests
                agentConversionClicked: report.agentConversionClicked // for analytics
            }, { status: 200 });
        }

        // PENDING / QUEUED / PROCESSING
        return NextResponse.json({ status: report.status }, { status: 200 });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
