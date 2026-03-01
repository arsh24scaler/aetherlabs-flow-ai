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

    // Usually calls out to Azure Computer Vision "Read API" -> which handles multi-page PDFs
    // For this boilerplate, simulating the API structure that analyzes a layout.
    try {
      const response = await fetch(`${endpoint}/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`, {
        method: 'POST',
        headers: {
            'Ocp-Apim-Subscription-Key': key,
            'Content-Type': 'application/pdf'
        },
        body: new Blob([pdfBuffer as any], { type: 'application/pdf' })
      });
  
      if (!response.ok) {
          throw new Error(`Azure Vision API returned ${response.status}: ${await response.text()}`);
      }
      
      const operationLocation = response.headers.get('Operation-Location');
      if (!operationLocation) throw new Error("No operation location returned by OCR");

      // Polling the completion of OCR.
      let ocrCompleted = false;
      let extractContent = '';
      while(!ocrCompleted) {
        await new Promise(r => setTimeout(r, 2000));
        const statusRes = await fetch(operationLocation, {
            headers: { 'Ocp-Apim-Subscription-Key': key }
        });
        
        const json = await statusRes.json();
        if (json.status === 'succeeded') {
            ocrCompleted = true;
            extractContent = json.analyzeResult.content;
        } else if (json.status === 'failed') {
            throw new Error('Azure OCR Job Failed');
        }
      }

      return extractContent;

    } catch(err: any) {
        console.error("Azure OCR completely failed:", err);
        return 'Failed to execute OCR on document.';
    }
}
