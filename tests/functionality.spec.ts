import { test, expect } from '@playwright/test';

test.describe('Flow AI - Backend E2E Functionality', () => {

    test('Should upload a raw text PDF successfully', async ({ request }) => {
        const dummyPdf = Buffer.from('PDF-1.4\n1 0 obj\n...', 'utf8'); // Valid PDF raw block simulated 
        const response = await request.post('/api/upload', {
            multipart: { file: { name: 'test.pdf', mimeType: 'application/pdf', buffer: dummyPdf } },
            headers: { 'X-Simulated-IP': '127.0.0.2' }, 
        });

        expect(response.status()).toBe(202);
        const json = await response.json();
        expect(json).toHaveProperty('jobId');

        // Simulated Polling
        let isDone = false;
        let p = 0;
        let finalStatus;

        while(!isDone && p < 15) {
            await new Promise((r) => setTimeout(r, 2000));
            const statusRes = await request.get(`/api/status/${json.jobId}`);
            finalStatus = await statusRes.json();
            
            if (finalStatus.status === 'COMPLETED' || finalStatus.status === 'ERROR') {
                isDone = true; 
            }
            p++;
        }

        expect(finalStatus.status).toBe('COMPLETED');
        expect(finalStatus.metadata).toHaveProperty('policyType');
        expect(finalStatus.riskScore).toBeDefined();

        // Chat limit test
        for (let i = 0; i <= 10; i++) {
            const chatRes = await request.post('/api/chat', {
                data: { jobId: json.jobId, message: `Mock question ${i}` },
                headers: { 'X-Simulated-IP': '127.0.0.2'} 
            });

            if (i < 10) {
                expect(chatRes.status()).toBe(200);
            } else {
                expect(chatRes.status()).toBe(429); // Max 10 messages reached limit
            }
        }
    });

    test('Should trigger Azure OCR when PDF has no extractable text', async ({ request }) => {
        const imagePdf = Buffer.from('PDF-1.4\n1 0 obj <image data placeholder>', 'utf8'); // no text block

        const response = await request.post('/api/upload', {
             multipart: { file: { name: 'scanned-image.pdf', mimeType: 'application/pdf', buffer: imagePdf } },
             headers: { 'X-Simulated-IP': '127.0.0.3' }, 
        });

        expect(response.status()).toBe(202);
        const json = await response.json();

        // Verify later via status that OCR flag was logged
        let finalStatus;
        for(let p=0; p<5; p++){
            await new Promise(r => setTimeout(r, 3000)); 
            const statusRes = await request.get(`/api/status/${json.jobId}`);
            finalStatus = await statusRes.json();
            if (finalStatus.status === 'COMPLETED') break;
        }

        // Must explicitly log OCR usage 
        expect(finalStatus).toHaveProperty('usedOCR', true);
    });

    test('Should enforce max 2 uploads strictly per 1 hour window', async ({ request }) => {
        const testIP = '1.2.3.4'; // Different mock IP

        // Setup uploads
        const resA = await request.post('/api/upload', { multipart: { file: { name:'a.pdf', mimeType: 'application/pdf', buffer:Buffer.from('a') } }, headers:{'X-Simulated-IP':testIP} });
        expect(resA.status()).toBe(202);

        const resB = await request.post('/api/upload', { multipart: { file: { name:'b.pdf', mimeType: 'application/pdf', buffer:Buffer.from('a') } }, headers:{'X-Simulated-IP':testIP} });
        expect(resB.status()).toBe(202);

        const resC = await request.post('/api/upload', { multipart: { file: { name:'c.pdf', mimeType: 'application/pdf', buffer:Buffer.from('a') } }, headers:{'X-Simulated-IP':testIP} });
        expect(resC.status()).toBe(429); // Abuse shield rejects immediately.
    });

});
