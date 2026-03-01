import { ServiceBusClient, delay } from "@azure/service-bus";
import { parsePdfWithFallback } from "./pdf-parser";
import { analyzePolicyText } from "./gemini";
import { connectToDatabase, Report } from "./db";
import { hashDocument, getCachedAnalysis, setCachedAnalysis, redis } from "./redis-rate-limit";
import http from "http";

// Minimal HTTP server for Azure Container App health probes
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
const deadLetterQueue = "pdf-deadletter-queue";

export async function processQueue() {
  if (!connectionString) {
      console.warn('Queue disabled (missing connection string). Running synchronously or skipping.');
      return;
  }

  const sbClient = new ServiceBusClient(connectionString);
  const receiver = sbClient.createReceiver(queueName);
  
  await connectToDatabase();

  const handleMessage = async (message: any) => {
    try {
      const jobId = message.body.jobId;
      console.log(`[QueueWorker] Received job: ${jobId}`);

      const pdfBuffer = Buffer.from(message.body.file, 'base64');
      const hash = hashDocument(pdfBuffer);
      console.log(`[QueueWorker] Job ${jobId} document hash: ${hash}`);

      // Check redis cache first
      let analysisResult = await getCachedAnalysis(hash);
      let usedOCR = false;
      let text = ""; // Actually needed to be saved temporarily for chat (we can store in Redis)

      if (analysisResult) {
          console.log(`[QueueWorker] Job ${jobId} found in cache. Skipping AI analysis.`);
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
      await redis.set(`chat:context:${jobId}`, text, 'EX', 86400); // Expires 24hr

      // Update Database
      console.log(`[QueueWorker] Job ${jobId} updating Cosmos DB...`);
      await Report.findOneAndUpdate({ jobId }, {
          status: 'COMPLETED',
          policyHash: hash,
          metadataJSON: analysisResult.metadata,
          riskScore: analysisResult.riskScore,
          flags: analysisResult.flags,
          tokensUsed: analysisResult.tokensUsed || 0,
          usedOCR: usedOCR
      });

      // We complete the message from the queue on success
      await receiver.completeMessage(message);
      console.log(`[QueueWorker] Job ${jobId} finalized and removed from queue.`);

    } catch (err: any) {
        console.error(`[QueueWorker] Processing Error for job ${message.body?.jobId || 'UNKNOWN'}:`, err);
        // If it blows up, we deadletter it or mark as Error
        if (message.body?.jobId) {
            await Report.findOneAndUpdate({ jobId: message.body.jobId }, {
                status: 'ERROR',
                errorLog: err.message
            });
        }

        await receiver.deadLetterMessage(message, {
            deadLetterReason: "Processing Crashed",
            deadLetterErrorDescription: err.message,
        });
        console.log(`[QueueWorker] Job ${message.body?.jobId || 'UNKNOWN'} deadlettered.`);
    }
  };

  const handleError = async (args: any) => {
    console.error(`Error processing queue: ${args.error.message}`);
  };

  // Keep it listening
  receiver.subscribe({
    processMessage: handleMessage,
    processError: handleError
  });
}
