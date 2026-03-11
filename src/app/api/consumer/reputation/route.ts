import { NextResponse } from 'next/server';
import { insurerData, getGoldenComboInsurers } from '@/lib/insurer-data';

export async function GET() {
    try {
        return NextResponse.json({
            insurers: insurerData,
            goldenCombo: getGoldenComboInsurers(),
            source: 'IRDAI FY 2024-25',
            lastUpdated: '2025-03-01',
        });
    } catch (error: unknown) {
        const err = error as Error;
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
