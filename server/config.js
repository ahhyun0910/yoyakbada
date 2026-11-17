import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";

export const serverDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(serverDir, ".env");
if (fs.existsSync(envPath)) loadEnvFile(envPath);

function positiveInteger(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name}에는 양의 정수를 설정하세요.`);
  }
  return value;
}

export const config = {
  port: positiveInteger("PORT", 4000),
  jwtSecret: process.env.JWT_SECRET || "yoyakbada-jwt-secret",
  dbPath: process.env.DB_PATH || path.join(serverDir, "yoyakbada.db"),
  uploadDir: process.env.UPLOAD_DIR || path.join(serverDir, "uploads"),
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || "",
  geminiModel: process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite",
  timeoutMs: positiveInteger("GEMINI_TIMEOUT_MS", 60000),
  maxInputChars: positiveInteger("AI_MAX_INPUT_CHARS", 30000),
};
