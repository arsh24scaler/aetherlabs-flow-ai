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
exports.analyzePolicyText = analyzePolicyText;
exports.queryPolicy = queryPolicy;
var generative_ai_1 = require("@google/generative-ai");
var redis_rate_limit_1 = require("./redis-rate-limit");
var _genAI = null;
var _model = null;
function getGeminiModel() {
    if (_model)
        return _model;
    var API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY)
        throw new Error("Missing Gemini key.");
    _genAI = new generative_ai_1.GoogleGenerativeAI(API_KEY);
    // We use 1.5-pro or 1.5-flash. Flash is great for speed and cost.
    _model = _genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    return _model;
}
/**
 * Extracts strictly JSON metadata from unstructured text.
 * Calculates approximate token cost and logs it using Redis kill switch.
 */
function analyzePolicyText(text) {
    return __awaiter(this, void 0, void 0, function () {
        var systemPrompt, prompt, result, responseText, rawJson, parsed, tokenEstimate, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    systemPrompt = "\nYou are an expert insurance policy evaluator. Extract the following JSON schema from this text.\nSchema:\n{\n  \"policyHolderName\": \"string\",\n  \"policyNumber\": \"string\",\n  \"policyType\": \"Health|Motor|Life|Term|ULIP|Property|Other\",\n  \"insurerName\": \"string\",\n  \"startDate\": \"YYYY-MM-DD\",\n  \"expiryDate\": \"YYYY-MM-DD\",\n  \"premiumAmount\": number,\n  \"sumInsured\": number,\n  \"deductibles\": \"string\",\n  \"riders\": [\"string\"],\n  \"taxes\": number,\n  \"noClaimBonus\": \"string\"\n}\n\nAlso calculate a \"riskScore\" (0-100) where 100 means high risk (e.g. many waiting periods, copays, high deductibles, ambiguous wording).\nAlso list top 5 \"flags\" (string array) describing hidden exclusions or limits.\n\nRespond ONLY with valid JSON exactly matching this structure (no markdown wrappers like ```json):\n{\n  \"metadata\": { ... },\n  \"riskScore\": 85,\n  \"flags\": [\"Flag 1\", \"Flag 2\", \"Flag 3\", \"Flag 4\", \"Flag 5\"]\n}\n";
                    prompt = "".concat(systemPrompt, "\n\nDOCUMENT TEXT:\n").concat(text);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, getGeminiModel().generateContent(prompt)];
                case 2:
                    result = _a.sent();
                    responseText = result.response.text().trim();
                    rawJson = responseText;
                    if (rawJson.startsWith('```json')) {
                        rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
                    }
                    parsed = JSON.parse(rawJson);
                    tokenEstimate = Math.ceil((prompt.length + responseText.length) / 4);
                    return [4 /*yield*/, (0, redis_rate_limit_1.incrementGlobalTokens)(tokenEstimate)];
                case 3:
                    _a.sent();
                    return [2 /*return*/, {
                            metadata: parsed.metadata,
                            riskScore: parsed.riskScore,
                            flags: parsed.flags,
                            tokensUsed: tokenEstimate
                        }];
                case 4:
                    e_1 = _a.sent();
                    throw new Error("Gemini Parsing Error: ".concat(e_1.message));
                case 5: return [2 /*return*/];
            }
        });
    });
}
function queryPolicy(jobId, docText, message) {
    return __awaiter(this, void 0, void 0, function () {
        var prompt, result, text, tokenEstimate;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    prompt = "You are a helpful AI assistant answering questions ONLY about the insurance policy provided below. \nDo not hallucinate external laws or facts. If it is not in the text, say \"Not found in your document.\"\nQuestion: ".concat(message, "\n\nDocument:\n").concat(docText, "\n");
                    return [4 /*yield*/, getGeminiModel().generateContent(prompt)];
                case 1:
                    result = _a.sent();
                    text = result.response.text();
                    tokenEstimate = Math.ceil((prompt.length + text.length) / 4);
                    return [4 /*yield*/, (0, redis_rate_limit_1.incrementGlobalTokens)(tokenEstimate)];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { response: text, tokens: tokenEstimate }];
            }
        });
    });
}
