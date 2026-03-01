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
exports.parsePdfWithFallback = parsePdfWithFallback;
var pdfParse = require('pdf-parse');
function parsePdfWithFallback(pdfBuffer) {
    return __awaiter(this, void 0, void 0, function () {
        var data, extract, ocrText, error_1, ocrText;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 5]);
                    return [4 /*yield*/, pdfParse(pdfBuffer)];
                case 1:
                    data = _a.sent();
                    extract = data.text.trim();
                    // 2. CHECK IF COMPREHENSIVE TEXT WAS FOUND
                    if (extract.length > 500) {
                        return [2 /*return*/, { text: extract, usedOCR: false }];
                    }
                    console.warn("Extracted less than 500 characters. Likely scanned document. Triggering OCR fallbacks.");
                    return [4 /*yield*/, runAzureOCR(pdfBuffer)];
                case 2:
                    ocrText = _a.sent();
                    return [2 /*return*/, { text: ocrText, usedOCR: true }];
                case 3:
                    error_1 = _a.sent();
                    console.error('Initial PDF Parser crashed:', error_1);
                    return [4 /*yield*/, runAzureOCR(pdfBuffer)];
                case 4:
                    ocrText = _a.sent();
                    return [2 /*return*/, { text: ocrText, usedOCR: true }];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Mocking out Azure OCR in Next environment.
 * Note: If implementing `@azure/ai-vision-image-analysis` to read all pages of PDF, it usually involves hitting the Azure Document Intelligence Endpoint via 'Analyze Document'.
 */
function runAzureOCR(pdfBuffer) {
    return __awaiter(this, void 0, void 0, function () {
        var endpoint, key, response, _a, _b, _c, operationLocation, ocrCompleted, extractContent, statusRes, json, err_1;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    endpoint = process.env.AZURE_VISION_ENDPOINT;
                    key = process.env.AZURE_VISION_KEY;
                    if (!endpoint || !key) {
                        console.error('AZURE_VISION_ENDPOINT or KEY missing - skipping OCR and returning empty string limit.');
                        return [2 /*return*/, 'No extractable text found and OCR API keys missing.'];
                    }
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 10, , 11]);
                    return [4 /*yield*/, fetch("".concat(endpoint, "/documentModels/prebuilt-layout:analyze?api-version=2023-07-31"), {
                            method: 'POST',
                            headers: {
                                'Ocp-Apim-Subscription-Key': key,
                                'Content-Type': 'application/pdf'
                            },
                            body: new Blob([pdfBuffer], { type: 'application/pdf' })
                        })];
                case 2:
                    response = _d.sent();
                    if (!!response.ok) return [3 /*break*/, 4];
                    _a = Error.bind;
                    _c = (_b = "Azure Vision API returned ".concat(response.status, ": ")).concat;
                    return [4 /*yield*/, response.text()];
                case 3: throw new (_a.apply(Error, [void 0, _c.apply(_b, [_d.sent()])]))();
                case 4:
                    operationLocation = response.headers.get('Operation-Location');
                    if (!operationLocation)
                        throw new Error("No operation location returned by OCR");
                    ocrCompleted = false;
                    extractContent = '';
                    _d.label = 5;
                case 5:
                    if (!!ocrCompleted) return [3 /*break*/, 9];
                    return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 2000); })];
                case 6:
                    _d.sent();
                    return [4 /*yield*/, fetch(operationLocation, {
                            headers: { 'Ocp-Apim-Subscription-Key': key }
                        })];
                case 7:
                    statusRes = _d.sent();
                    return [4 /*yield*/, statusRes.json()];
                case 8:
                    json = _d.sent();
                    if (json.status === 'succeeded') {
                        ocrCompleted = true;
                        extractContent = json.analyzeResult.content;
                    }
                    else if (json.status === 'failed') {
                        throw new Error('Azure OCR Job Failed');
                    }
                    return [3 /*break*/, 5];
                case 9: return [2 /*return*/, extractContent];
                case 10:
                    err_1 = _d.sent();
                    console.error("Azure OCR completely failed:", err_1);
                    return [2 /*return*/, 'Failed to execute OCR on document.'];
                case 11: return [2 /*return*/];
            }
        });
    });
}
