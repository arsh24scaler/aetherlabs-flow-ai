// @ts-nocheck
import { ServiceBusClient, ServiceBusReceivedMessage, ProcessErrorArgs } from "@azure/service-bus";
import { parsePdfWithFallback } from "./pdf-parser";
import { analyzePolicyText } from "./gemini";
import { connectToDatabase, Report, UsageRecord } from "./db";
import { hashDocument, getCachedAnalysis, setCachedAnalysis, redis } from "./redis-rate-limit";
import { BlobServiceClient } from "@azure/storage-blob";
import http from "http";

// Minimal HTTP server for Azure Container App health probe
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200);
        res.end('OK');
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Health check server listening on port ${PORT}`);
});

const connectionString = process.env.SERVICE_BUS_CONNECTION_STRING;
const queueName = "pdf-processing-queue";

export async function processQueue() {
    if (!connectionString) {
        console.warn('Queue disabled (missing connection string). Running synchronously or skipping.');
        return;
    }

    const sbClient = new ServiceBusClient(connectionString);
    const receiver = sbClient.createReceiver(queueName);

    await connectToDatabase();

    const handleMessage = async (message: ServiceBusReceivedMessage) => {
        try {
            const jobId = message.body.jobId;
            const blobName = message.body.blobName;
            console.log(`[QueueWorker] Received job: ${jobId}, blob: ${blobName}`);

            const storageConn = process.env.AZURE_STORAGE_CONNECTION_STRING;
            if (!storageConn) throw new Error("Missing AZURE_STORAGE_CONNECTION_STRING");

            const blobServiceClient = BlobServiceClient.fromConnectionString(storageConn);
            const containerClient = blobServiceClient.getContainerClient("policy-uploads");
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);

            console.log(`[QueueWorker] Downloading ${blobName} from Blob Storage...`);
            const pdfBuffer = await blockBlobClient.downloadToBuffer();
            const hash = hashDocument(pdfBuffer);
            console.log(`[QueueWorker] Job ${jobId} document hash: ${hash}`);

            // Check redis cache first
            interface AIResult {
                metadata: unknown;
                riskScore: number;
                flags: string[];
                tokensUsed: number;
            }
            let analysisResult: AIResult | null = (await getCachedAnalysis(hash)) as AIResult | null;
            let usedOCR = false;
            let text = "";

            if (analysisResult) {
                console.log(`[QueueWorker] Job ${jobId} found in cache. Skipping AI analysis.`);
                // Still need to load text from Redis if possible or just rely on cache
                // If it's a cache hit, the text should already be in Redis from a previous run or we don't need it if results are there
                const cachedText = await redis.get(`chat:context:${jobId}`);
                if (cachedText) text = cachedText;
            } else {
                console.log(`[QueueWorker] Job ${jobId} cache miss. Processing PDF...`);
                // Parse PDF
                const { text: parsedText, usedOCR: isOCR } = await parsePdfWithFallback(pdfBuffer);
                text = parsedText;
                usedOCR = isOCR;

                console.log(`[QueueWorker] Job ${jobId} extracted ${text.length} characters (OCR: ${isOCR}).`);
                if (!text || text.length === 0) throw new Error("Could not extract any text, document may be a corrupted image.");

                // Gemini Call
                console.log(`[QueueWorker] Job ${jobId} calling Gemini AI...`);
                analysisResult = await analyzePolicyText(text);
                console.log(`[QueueWorker] Job ${jobId} Gemini AI analysis complete.`);

                // Cache for the future identical PDFs
                await setCachedAnalysis(hash, analysisResult);
                console.log(`[QueueWorker] Job ${jobId} result cached.`);
            }

            // Save extracted text temporarily into Redis for the Chat bot module
            if (text) {
                await redis.set(`chat:context:${jobId}`, text, 'EX', 86400); // Expires 24hr
            }

            // Update Database
            console.log(`[QueueWorker] Job ${jobId} updating Cosmos DB...`);
            const metadata = (analysisResult as { metadata?: unknown }).metadata || {};
            const suggestedQuestions = metadata.suggestedQuestions || (analysisResult as { suggestedQuestions?: string[] }).suggestedQuestions || [];
            await Report.findOneAndUpdate({ jobId }, {
                status: 'COMPLETED',
                policyHash: hash,
                metadataJSON: { ...(metadata || {}), suggestedQuestions },
                riskScore: (analysisResult as { riskScore: number }).riskScore,
                flags: (analysisResult as { flags: string[] }).flags,
                tokensUsed: (analysisResult as { tokensUsed: number }).tokensUsed || 0,
                usedOCR: usedOCR
            }, {});

            // Log granular usage
            await UsageRecord.create({
                jobId,
                type: 'ANALYSIS',
                tokensUsed: (analysisResult as { tokensUsed: number }).tokensUsed || 0
            });

            // We complete the message from the queue on success
            await receiver.completeMessage(message);
            console.log(`[QueueWorker] Job ${jobId} finalized and removed from queue.`);

        } catch (err: unknown) {
            const error = err as Error;
            console.error(`[QueueWorker] Processing Error for job ${message.body?.jobId || 'UNKNOWN'}:`, error);
            // If it blows up, we deadletter it or mark as Error
            if (message.body?.jobId) {
                await Report.findOneAndUpdate({ jobId: message.body.jobId }, {
                    status: 'ERROR',
                    errorLog: error.message
                }, {});
            }

            await receiver.deadLetterMessage(message, {
                deadLetterReason: "Processing Crashed",
                deadLetterErrorDescription: error.message,
            });
            console.log(`[QueueWorker] Job ${message.body?.jobId || 'UNKNOWN'} deadlettered.`);
        }
    };

    const handleError = async (args: ProcessErrorArgs) => {
        console.error(`Error processing queue: ${args.error.message}`);
    };

    // Keep it listening
    receiver.subscribe({
        processMessage: handleMessage,
        processError: handleError
    });
}

// Start the queue listener
processQueue().catch(console.error);
