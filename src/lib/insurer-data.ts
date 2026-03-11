// ─────────────── IRDAI FY 2024–25 Insurer Reputation Data ───────────────
// Source: IRDAI Annual Reports FY 2024–25

export interface InsurerRecord {
  name: string;
  sector: 'public-general' | 'private-general' | 'health' | 'life';
  csr: number; // Claim Settlement Ratio (%)
  complaints?: number; // Per 10,000 claims
  complaintZone?: 'green' | 'yellow' | 'red';
  solvency?: string; // e.g. "2.12×"
  goldenCombo?: boolean;
}

export const insurerData: InsurerRecord[] = [
  // ─── Public Sector General Insurers ───
  { name: 'United India Insurance', sector: 'public-general', csr: 95.26, complaints: 20, complaintZone: 'yellow' },
  { name: 'National Insurance Co', sector: 'public-general', csr: 91.79 },
  { name: 'New India Assurance', sector: 'public-general', csr: 91.75, complaints: 5, complaintZone: 'green' },
  { name: 'Oriental Insurance', sector: 'public-general', csr: 90.17 },

  // ─── Private Sector General Insurers ───
  { name: 'Acko General Insurance', sector: 'private-general', csr: 99.98, complaints: 16, complaintZone: 'green', solvency: 'Above 2.0×', goldenCombo: true },
  { name: 'Reliance General Insurance', sector: 'private-general', csr: 99.32, complaints: 5, complaintZone: 'green', solvency: 'Strong', goldenCombo: true },
  { name: 'HDFC ERGO General Insurance', sector: 'private-general', csr: 98.85, complaints: 15, complaintZone: 'green', solvency: 'Above 1.5×', goldenCombo: true },
  { name: 'ICICI Lombard General Insurance', sector: 'private-general', csr: 98.45, complaints: 14, complaintZone: 'green' },
  { name: 'Bajaj Allianz General Insurance', sector: 'private-general', csr: 96.0, complaints: 3, complaintZone: 'green', solvency: 'Strong', goldenCombo: true },
  { name: 'IFFCO Tokio General Insurance', sector: 'private-general', csr: 85.27, complaints: 41, complaintZone: 'red' },
  { name: 'Kshema General Insurance', sector: 'private-general', csr: 26.88 },
  { name: 'Tata AIG General Insurance', sector: 'private-general', csr: 95.0, complaints: 10, complaintZone: 'green' },
  { name: 'SBI General Insurance', sector: 'private-general', csr: 94.0, complaints: 15, complaintZone: 'green' },
  { name: 'Future Generali India Insurance', sector: 'private-general', csr: 93.0, complaints: 11, complaintZone: 'green' },
  { name: 'Go Digit General Insurance', sector: 'private-general', csr: 92.0, complaints: 19, complaintZone: 'green' },
  { name: 'Liberty General Insurance', sector: 'private-general', csr: 91.0, complaints: 14, complaintZone: 'green' },
  { name: 'Navi General Insurance', sector: 'private-general', csr: 90.0, complaints: 285, complaintZone: 'red' },
  { name: 'Raheja QBE General Insurance', sector: 'private-general', csr: 88.0, complaints: 134, complaintZone: 'red' },

  // ─── Standalone Health Insurers ───
  { name: 'Aditya Birla Health Insurance', sector: 'health', csr: 100, complaints: 16, complaintZone: 'green' },
  { name: 'Galaxy Health Insurance', sector: 'health', csr: 100 },
  { name: 'Narayana Health Insurance', sector: 'health', csr: 100 },
  { name: 'Niva Bupa Health Insurance', sector: 'health', csr: 100 },
  { name: 'Star Health Insurance', sector: 'health', csr: 88.0, complaints: 52, complaintZone: 'red', solvency: '~1.6×' },
  { name: 'Care Health Insurance', sector: 'health', csr: 92.0, complaints: 47, complaintZone: 'red' },
  { name: 'ManipalCigna Health Insurance', sector: 'health', csr: 94.0, complaints: 25, complaintZone: 'yellow' },

  // ─── Life Insurers ───
  { name: 'Bandhan Life Insurance', sector: 'life', csr: 99.66 },
  { name: 'Axis Max Life Insurance', sector: 'life', csr: 99.65, solvency: '~2.0×' },
  { name: 'HDFC Life Insurance', sector: 'life', csr: 99.50, solvency: '1.92×' },
  { name: 'ICICI Prudential Life Insurance', sector: 'life', csr: 98.0, solvency: '2.12×' },
  { name: 'LIC', sector: 'life', csr: 96.82, solvency: '~1.6×' },
  { name: 'Ageas Federal Life Insurance', sector: 'life', csr: 97.0, solvency: '3.1×' },
  { name: 'Pramerica Life Insurance', sector: 'life', csr: 96.0, solvency: '2.8×' },
];

/**
 * Fuzzy match insurer name from policy text to our dataset.
 * Returns the best match or null.
 */
export function findInsurer(insurerNameFromPolicy: string): InsurerRecord | null {
  if (!insurerNameFromPolicy) return null;
  const normalised = insurerNameFromPolicy.toLowerCase().replace(/[^a-z0-9\s]/g, '');

  // Exact substring match first
  for (const rec of insurerData) {
    const recNorm = rec.name.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    if (normalised.includes(recNorm) || recNorm.includes(normalised)) return rec;
  }

  // Token-based partial match
  const tokens = normalised.split(/\s+/).filter(t => t.length > 2);
  let bestMatch: InsurerRecord | null = null;
  let bestScore = 0;

  for (const rec of insurerData) {
    const recTokens = rec.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    const score = tokens.filter(t => recTokens.some(rt => rt.includes(t) || t.includes(rt))).length;
    if (score > bestScore && score >= 2) {
      bestScore = score;
      bestMatch = rec;
    }
  }

  return bestMatch;
}

/**
 * Get all insurers by sector.
 */
export function getInsurersBySector(sector: InsurerRecord['sector']): InsurerRecord[] {
  return insurerData.filter(i => i.sector === sector);
}

/**
 * Get the "Golden Combo" insurers — high CSR, low complaints, strong solvency.
 */
export function getGoldenComboInsurers(): InsurerRecord[] {
  return insurerData.filter(i => i.goldenCombo);
}
