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
exports.redis = void 0;
exports.checkIpRateLimit = checkIpRateLimit;
exports.checkGlobalTokenLimit = checkGlobalTokenLimit;
exports.incrementGlobalTokens = incrementGlobalTokens;
exports.hashDocument = hashDocument;
exports.getCachedAnalysis = getCachedAnalysis;
exports.setCachedAnalysis = setCachedAnalysis;
exports.checkChatLimit = checkChatLimit;
var ioredis_1 = require("ioredis");
var crypto_1 = require("crypto");
// Initialize Redis 
var redisClient = process.env.REDIS_URL
    ? new ioredis_1.default(process.env.REDIS_URL)
    // Fallback or memory mock if needed, but in production this strictly connects to Azure Cache for Redis
    : new ioredis_1.default({
        host: 'localhost',
        port: 6379
    });
redisClient.on('error', function (err) { return console.error('Redis Client Error', err); });
exports.redis = redisClient;
// Abuse Shields Configuration
var MAX_UPLOADS_PER_IP_HR = parseInt(process.env.MAX_UPLOADS_PER_IP_HR || '2', 10);
var GLOBAL_DAILY_TOKEN_LIMIT = parseInt(process.env.GLOBAL_DAILY_TOKEN_LIMIT || '50000000', 10);
var MAX_CHAT_PER_POLICY = parseInt(process.env.MAX_CHAT_PER_POLICY || '10', 10);
/**
 * Validates if the IP has exceeded 2 uploads per hour.
 * @param ip string
 * @returns boolean true if allowed, false if rejected (429)
 */
function checkIpRateLimit(ip) {
    return __awaiter(this, void 0, void 0, function () {
        var key, requests;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    key = "rate-limit:upload:".concat(ip);
                    return [4 /*yield*/, exports.redis.incr(key)];
                case 1:
                    requests = _a.sent();
                    if (!(requests === 1)) return [3 /*break*/, 3];
                    // Expire in 1 hour
                    return [4 /*yield*/, exports.redis.expire(key, 3600)];
                case 2:
                    // Expire in 1 hour
                    _a.sent();
                    _a.label = 3;
                case 3:
                    if (requests > MAX_UPLOADS_PER_IP_HR) {
                        return [2 /*return*/, false];
                    }
                    return [2 /*return*/, true];
            }
        });
    });
}
/**
 * Checks the global kill switch to prevent runaway billing.
 * @returns boolean true if allowed to proceed.
 */
function checkGlobalTokenLimit() {
    return __awaiter(this, void 0, void 0, function () {
        var key, tokens;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    key = "global:tokens:daily";
                    return [4 /*yield*/, exports.redis.get(key)];
                case 1:
                    tokens = _a.sent();
                    if (tokens && parseInt(tokens, 10) > GLOBAL_DAILY_TOKEN_LIMIT) {
                        return [2 /*return*/, false];
                    }
                    return [2 /*return*/, true];
            }
        });
    });
}
/**
 * Adds tokens to the global daily counter.
 */
function incrementGlobalTokens(tokenCount) {
    return __awaiter(this, void 0, void 0, function () {
        var key, ttl;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    key = "global:tokens:daily";
                    return [4 /*yield*/, exports.redis.incrby(key, tokenCount)];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, exports.redis.ttl(key)];
                case 2:
                    ttl = _a.sent();
                    if (!(ttl === -1)) return [3 /*break*/, 4];
                    return [4 /*yield*/, exports.redis.expire(key, 86400)];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Hashes a PDF buffer to prevent re-processing identical documents.
 */
function hashDocument(buffer) {
    return crypto_1.default.createHash('sha256').update(buffer).digest('hex');
}
/**
 * Cache and Retrieve previous Gemini Analysis by Document Hash.
 */
function getCachedAnalysis(hash) {
    return __awaiter(this, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, exports.redis.get("cache:analysis:".concat(hash))];
                case 1:
                    res = _a.sent();
                    if (res)
                        return [2 /*return*/, JSON.parse(res)];
                    return [2 /*return*/, null];
            }
        });
    });
}
function setCachedAnalysis(hash, analysis) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: 
                // Cache for 30 days
                return [4 /*yield*/, exports.redis.set("cache:analysis:".concat(hash), JSON.stringify(analysis), 'EX', 2592000)];
                case 1:
                    // Cache for 30 days
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Check chat message limit for a specific policy (by Job ID)
 */
function checkChatLimit(jobId) {
    return __awaiter(this, void 0, void 0, function () {
        var key, msgCount;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    key = "rate-limit:chat:".concat(jobId);
                    return [4 /*yield*/, exports.redis.incr(key)];
                case 1:
                    msgCount = _a.sent();
                    if (!(msgCount === 1)) return [3 /*break*/, 3];
                    return [4 /*yield*/, exports.redis.expire(key, 2592000)];
                case 2:
                    _a.sent(); // 30 days
                    _a.label = 3;
                case 3:
                    if (msgCount > MAX_CHAT_PER_POLICY)
                        return [2 /*return*/, false];
                    return [2 /*return*/, true];
            }
        });
    });
}
