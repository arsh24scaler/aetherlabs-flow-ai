"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processQueue = processQueue;
var service_bus_1 = require("@azure/service-bus");
var pdf_parser_1 = require("./pdf-parser");
var gemini_1 = require("./gemini");
var db_1 = require("./db");
var redis_rate_limit_1 = require("./redis-rate-limit");
var connectionString = process.env.SERVICE_BUS_CONNECTION_STRING;
var queueName = "pdf-processing-queue";
var deadLetterQueue = "pdf-deadletter-queue";
function processQueue() {
    return __awaiter(this, void 0, void 0, function () {
        var sbClient, receiver, handleMessage, handleError;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!connectionString) {
                        console.warn('Queue disabled (missing connection string). Running synchronously or skipping.');
                        return [2 /*return*/];
                    }
                    sbClient = new service_bus_1.ServiceBusClient(connectionString);
                    receiver = sbClient.createReceiver(queueName);
                    return [4 /*yield*/, (0, db_1.connectToDatabase)()];
                case 1:
                    _a.sent();
                    handleMessage = function (message) { return __awaiter(_this, void 0, void 0, function () {
                        var jobId, pdfBuffer, hash, analysisResult, usedOCR, text, _a, parsedText, isOCR, err_1;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    _b.trys.push([0, 9, , 12]);
                                    jobId = message.body.jobId;
                                    pdfBuffer = Buffer.from(message.body.file, 'base64');
                                    hash = (0, redis_rate_limit_1.hashDocument)(pdfBuffer);
                                    return [4 /*yield*/, (0, redis_rate_limit_1.getCachedAnalysis)(hash)];
                                case 1:
                                    analysisResult = _b.sent();
                                    usedOCR = false;
                                    text = "";
                                    if (!!analysisResult) return [3 /*break*/, 5];
                                    return [4 /*yield*/, (0, pdf_parser_1.parsePdfWithFallback)(pdfBuffer)];
                                case 2:
                                    _a = _b.sent(), parsedText = _a.text, isOCR = _a.usedOCR;
                                    text = parsedText;
                                    usedOCR = isOCR;
                                    if (!text || text.length === 0)
                                        throw new Error("Could not extract any text, document may be a corrupted image.");
                                    return [4 /*yield*/, (0, gemini_1.analyzePolicyText)(text)];
                                case 3:
                                    // Gemini Call
                                    analysisResult = _b.sent();
                                    // Cache for the future identical PDFs
                                    return [4 /*yield*/, (0, redis_rate_limit_1.setCachedAnalysis)(hash, analysisResult)];
                                case 4:
                                    // Cache for the future identical PDFs
                                    _b.sent();
                                    _b.label = 5;
                                case 5: 
                                // Save extracted text temporarily into Redis for the Chat bot module
                                return [4 /*yield*/, redis_rate_limit_1.redis.set("chat:context:".concat(jobId), text, 'EX', 86400)];
                                case 6:
                                    // Save extracted text temporarily into Redis for the Chat bot module
                                    _b.sent(); // Expires 24hr
                                    // Update Database
                                    return [4 /*yield*/, db_1.Report.findOneAndUpdate({ jobId: jobId }, {
                                            status: 'COMPLETED',
                                            policyHash: hash,
                                            metadataJSON: analysisResult.metadata,
                                            riskScore: analysisResult.riskScore,
                                            flags: analysisResult.flags,
                                            tokensUsed: analysisResult.tokensUsed || 0,
                                            usedOCR: usedOCR
                                        })];
                                case 7:
                                    // Update Database
                                    _b.sent();
                                    // We complete the message from the queue on success
                                    return [4 /*yield*/, receiver.completeMessage(message)];
                                case 8:
                                    // We complete the message from the queue on success
                                    _b.sent();
                                    return [3 /*break*/, 12];
                                case 9:
                                    err_1 = _b.sent();
                                    console.error("Queue Processing Error:", err_1);
                                    // If it blows up, we deadletter it or mark as Error
                                    return [4 /*yield*/, db_1.Report.findOneAndUpdate({ jobId: message.body.jobId }, {
                                            status: 'ERROR',
                                            errorLog: err_1.message
                                        })];
                                case 10:
                                    // If it blows up, we deadletter it or mark as Error
                                    _b.sent();
                                    return [4 /*yield*/, receiver.deadLetterMessage(message, {
                                            deadLetterReason: "Processing Crashed",
                                            deadLetterErrorDescription: err_1.message,
                                        })];
                                case 11:
                                    _b.sent();
                                    return [3 /*break*/, 12];
                                case 12: return [2 /*return*/];
                            }
                        });
                    }); };
                    handleError = function (args) { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            console.error("Error processing queue: ".concat(args.error.message));
                            return [2 /*return*/];
                        });
                    }); };
                    // Keep it listening
                    receiver.subscribe({
                        processMessage: handleMessage,
                        processError: handleError
                    });
                    return [2 /*return*/];
            }
        });
    });
}
