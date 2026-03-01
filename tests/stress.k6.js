import http from 'k6/http';
import { check, sleep } from 'k6';
import { FormData } from 'https://jslib.k6.io/formdata/0.0.2/index.js';

// Load a dummy lightweight PDF for massive upload testing safely.
const pdfFile = open('./dummy-policy.pdf', 'b');

export const options = {
    stages: [
        { duration: '30s', target: 50 }, // Ramp-up to 50 concurrent virtual users over 30 seconds
        { duration: '1m', target: 50 },  // Maintain 50 concurrent VUs for 1 minute
        { duration: '30s', target: 200 }, // Spike to 200 VUs to verify Service Bus queue depth and Redis IP Blockers
        { duration: '1m', target: 200 }, 
        { duration: '30s', target: 0 },  // Ramp-down
    ],
    thresholds: {
        http_req_duration: ['p(95)<2000'], // 95% of requests must complete synchronously (queue drop) below 2s
        http_req_failed: ['rate<0.1'], // Less than 10% errors (due to strict IP blocking, we expect some 429s intentionally)
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function stressTest() {
    const fd = new FormData();
    // Emulate 1-page health policy
    fd.append('file', http.file(pdfFile, 'dummy-policy.pdf', 'application/pdf'));

    const uploadRes = http.post(`${BASE_URL}/api/upload`, fd.body(), {
        headers: { 'Content-Type': `multipart/form-data; boundary=${fd.boundary}` },
        tags: { endpoint: 'api/upload' },
    });

    // Check successful queuing OR intentional heavy-traffic 429 / 503 fallback limits
    check(uploadRes, {
        'uploaded successfully to Service Bus': (r) => r.status === 202,
        'rate limit blocked (expected max 2/hr)': (r) => r.status === 429,
        'global limits triggered (failsafe)': (r) => r.status === 503,
    });

    // Extract Job ID
    if (uploadRes.status === 202) {
        const jobId = uploadRes.json('jobId');

        // Simulate a rapid poll testing the read database connection pooling limits
        let isDone = false;
        let p = 0;
        while (!isDone && p < 10) {
            sleep(2); // Wait 2 seconds before polling
            const pollRes = http.get(`${BASE_URL}/api/status/${jobId}`);
            if (pollRes.status === 200 && pollRes.json('status') === 'COMPLETED') {
                isDone = true;
            }
            p++;
        }
        
        check(isDone, {
            'job finished within timeout': (v) => v === true,
        });
    } else {
        sleep(2); // delay even if we got 429 to avoid crushing internal logs
    }
}
