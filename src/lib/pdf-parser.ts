// pdf-parse has ESM/CJS interop issues under tsx, so we use require directly
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');

export async function parsePdfWithFallback(pdfBuffer: Buffer): Promise<{ text: string, usedOCR: boolean }> {
  try {
    // 1. STANDARD EXTRACTION
    const data = await pdfParse(pdfBuffer);
    const extract = data.text.trim();

    // 2. CHECK IF COMPREHENSIVE TEXT WAS FOUND
    if (extract.length > 500) {
      return { text: extract, usedOCR: false };
    }

    console.warn(`Extracted less than 500 characters. Likely scanned document. Triggering OCR fallbacks.`);
    
    // 3. AZURE COMPUTER VISION FALLBACK
    const ocrText = await runAzureOCR(pdfBuffer);
    
    return { text: ocrText, usedOCR: true };

  } catch (error) {
    console.error('Initial PDF Parser crashed:', error);
    // If pdf-parse totally crashes on it, assume it's an image pdf and try OCR
    const ocrText = await runAzureOCR(pdfBuffer);
    return { text: ocrText, usedOCR: true };
  }
}

/**
 * Mocking out Azure OCR in Next environment. 
 * Note: If implementing `@azure/ai-vision-image-analysis` to read all pages of PDF, it usually involves hitting the Azure Document Intelligence Endpoint via 'Analyze Document'.
 */
async function runAzureOCR(pdfBuffer: Buffer): Promise<string> {
    const endpoint = process.env.AZURE_VISION_ENDPOINT;
    const key = process.env.AZURE_VISION_KEY;

    if (!endpoint || !key) {
        console.error('AZURE_VISION_ENDPOINT or KEY missing - skipping OCR and returning empty string limit.');
        return 'No extractable text found and OCR API keys missing.';
    }

    try {
      // Azure Computer Vision v3.2 Read API
      const response = await fetch(`${endpoint}/vision/v3.2/read/analyze`, {
        method: 'POST',
        headers: {
            'Ocp-Apim-Subscription-Key': key,
            'Content-Type': 'application/pdf'
        },
        body: new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' })
      });
  
      if (response.status !== 202) {
          throw new Error(`Azure Vision API returned ${response.status}: ${await response.text()}`);
      }
      
      const operationLocation = response.headers.get('Operation-Location');
      if (!operationLocation) throw new Error("No operation location returned by OCR");

      // Polling the completion of OCR.
      let ocrCompleted = false;
      let extractContent = '';
      let attempts = 0;
      
      while(!ocrCompleted && attempts < 30) {
        attempts++;
        await new Promise(r => setTimeout(r, 2000));
        const statusRes = await fetch(operationLocation, {
            headers: { 'Ocp-Apim-Subscription-Key': key }
        });
        
        const json = await statusRes.json();
        if (json.status === 'succeeded') {
            ocrCompleted = true;
            // Computer Vision v3.2 formatting:
            if (json.analyzeResult && json.analyzeResult.readResults) {
                const pages = json.analyzeResult.readResults;
                for (const page of pages) {
                    if (page.lines) {
                        for (const line of page.lines) {
                            extractContent += line.text + "\n";
                        }
                    }
                }
            }
        } else if (json.status === 'failed') {
            throw new Error('Azure OCR Job Failed');
        }
      }

      return extractContent || 'Failed to extract text via OCR';

    } catch(err: unknown) {
        console.error("Azure OCR completely failed:", err);
        return 'Failed to execute OCR on document.';
    }
}
