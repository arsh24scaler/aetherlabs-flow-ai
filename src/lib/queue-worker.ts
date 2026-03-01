import { ServiceBusClient, delay } from "@azure/service-bus";
import { parsePdfWithFallback } from "./pdf-parser";
import { analyzePolicyText } from "./gemini";
import { connectToDatabase, Report } from "./db";
import { hashDocument, getCachedAnalysis, setCachedAnalysis, redis } from "./redis-rate-limit";

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
      const pdfBuffer = Buffer.from(message.body.file, 'base64');
      const hash = hashDocument(pdfBuffer);

      // Check redis cache first
      let analysisResult = await getCachedAnalysis(hash);
      let usedOCR = false;
      let text = ""; // Actually needed to be saved temporarily for chat (we can store in Redis)

      if (!analysisResult) {
          // Parse PDF
          const { text: parsedText, usedOCR: isOCR } = await parsePdfWithFallback(pdfBuffer);
          text = parsedText;
          usedOCR = isOCR;
          
          if (!text || text.length === 0) throw new Error("Could not extract any text, document may be a corrupted image.");
          
          // Gemini Call
          analysisResult = await analyzePolicyText(text);

          // Cache for the future identical PDFs
          await setCachedAnalysis(hash, analysisResult);
          
      }

      // Save extracted text temporarily into Redis for the Chat bot module
      await redis.set(`chat:context:${jobId}`, text, 'EX', 86400); // Expires 24hr

      // Update Database
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

    } catch (err: any) {
        console.error("Queue Processing Error:", err);
        // If it blows up, we deadletter it or mark as Error
        await Report.findOneAndUpdate({ jobId: message.body.jobId }, {
            status: 'ERROR',
            errorLog: err.message
        });

        await receiver.deadLetterMessage(message, {
            deadLetterReason: "Processing Crashed",
            deadLetterErrorDescription: err.message,
        });
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
