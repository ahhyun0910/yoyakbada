import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { all, get, run, transaction } from "./db.js";
import { config } from "./config.js";
import { analyzeWithGemini, SUMMARY_LENGTHS, validateContent } from "./ai/gemini.js";
import { AnalysisError, publicAnalysisError } from "./ai/errors.js";
import { createPreviewStore } from "./ai/preview-store.js";
import { pathToFileURL } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import dns from "node:dns/promises";
import net from "node:net";

await fs.mkdir(config.uploadDir, { recursive: true });
const upload = multer({
  dest: config.uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const app = express();
const PORT = config.port;
const JWT_SECRET = config.jwtSecret;
const previews = createPreviewStore({ ttlMs: config.previewTtlMs });
const analyzingUsers = new Set();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ==============================
// JWT 토큰 생성
// ==============================
function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: "2h" }
  );
}

// ==============================
// JWT 인증 미들웨어
// ==============================
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      message: "로그인이 필요합니다."
    });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      message: "토큰이 유효하지 않습니다."
    });
  }
}

// ==============================
// 키워드 문자열을 배열로 변환
// ==============================
function parseKeywords(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === "string");
  } catch { /* 기존 쉼표 구분 데이터 */ }
  return value.split(",").map((keyword) => keyword.trim()).filter(Boolean);
}

// ==============================
// 할 일 데이터 형식 변환
// ==============================
function formatTask(row) {
  return {
    id: row.id,
    title: row.title,
    dueDate: row.due_date,
    kind: row.kind,
    isDone: row.is_done === 1
  };
}

// ==============================
// 문서 상세 정보 조회
// 사용자 ID를 확인하여 본인 문서만 조회
// ==============================
async function buildDocumentDetail(id, userId) {
  const document = await get(
    "SELECT * FROM documents WHERE id = ? AND user_id = ?",
    [id, userId]
  );

  if (!document) {
    return null;
  }

  const summary = await get(
    "SELECT * FROM summaries WHERE document_id = ?",
    [id]
  );

  const tasks = await all(
    "SELECT * FROM tasks WHERE document_id = ? ORDER BY id ASC",
    [id]
  );

  return {
    id: document.id,
    title: document.title,
    type: document.type,
    source: document.source,
    content: document.content,
    createdAt: document.created_at,
    dday: document.dday,
    summary: summary?.summary_text ?? "",
    keywords: parseKeywords(summary?.keywords),
    tasks: tasks.map(formatTask)
  };
}

// ==============================
// 기존 데이터를 유지하면서 필요한 테이블과 열을 준비
// ==============================
async function prepareDatabase() {
  await transaction(async ({ run: txRun, all: txAll }) => {
    await txRun(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    await txRun(`CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      type TEXT,
      source TEXT,
      content TEXT,
      dday INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
    await txRun(`CREATE TABLE IF NOT EXISTS summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      summary_text TEXT NOT NULL,
      keywords TEXT,
      FOREIGN KEY (document_id) REFERENCES documents(id)
    )`);
    await txRun(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      due_date TEXT,
      is_done INTEGER DEFAULT 0,
      FOREIGN KEY (document_id) REFERENCES documents(id)
    )`);
    const columns = await txAll("PRAGMA table_info(tasks)");
    if (!columns.some((column) => column.name === "kind")) {
      await txRun("ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'action'");
    }
  });
  await run(`CREATE TABLE IF NOT EXISTS settings (
    user_id INTEGER PRIMARY KEY,
    summary_length TEXT NOT NULL DEFAULT '3줄'
  )`);
  await run("INSERT OR IGNORE INTO settings (user_id, summary_length) SELECT id, '3줄' FROM users");
}

// ==============================
// 텍스트 정리 / 요약 / 키워드 추출
// ==============================
function cleanText(text = "") {
  return text.replace(/\s+/g, " ").trim();
}

async function analyzePreview(req, document, requestedLength) {
  const content = validateContent(document.content);
  if (requestedLength !== undefined && !SUMMARY_LENGTHS.includes(requestedLength)) {
    throw new AnalysisError(400, "INVALID_SUMMARY_LENGTH", "요약 길이는 1줄, 3줄, 5줄 중 선택하세요.");
  }
  const preference = await get("SELECT summary_length FROM settings WHERE user_id = ?", [req.user.id]);
  const summaryLength = requestedLength || (SUMMARY_LENGTHS.includes(preference?.summary_length) ? preference.summary_length : "3줄");
  const result = await analyzeWithGemini(content, summaryLength);
  return previews.add(req.user.id, { ...document, content, ...result });
}

function guardAnalysis(req, res, next) {
  if (analyzingUsers.has(req.user.id)) {
    return res.status(429).json({ code: "AI_BUSY", message: "분석이 진행 중입니다. 잠시 기다려 주세요." });
  }
  analyzingUsers.add(req.user.id);
  res.once("finish", () => analyzingUsers.delete(req.user.id));
  next();
}

// ==============================
// 업로드된 파일에서 텍스트 추출
// ==============================
async function extractTextFromUpload(file) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === ".pdf") {
    const buffer = await fs.readFile(file.path);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text;
  }

  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ path: file.path });
    return result.value;
  }

  return fs.readFile(file.path, "utf8");
}

// ==============================
// 링크(URL) 본문 가져오기
// ==============================
const MAX_URL_BYTES = 5 * 1024 * 1024;
const URL_TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 5;
const MAX_URL_CONTENT_LENGTH = 20000;

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// 내부망 / 로컬 주소 여부 확인 (서버가 내부 주소에 접속하지 못하게 막음)
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);

    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();

    if (lower === "::1" || lower === "::") return true;

    if (lower.startsWith("::ffff:")) {
      const mapped = lower.slice(7);
      return net.isIPv4(mapped) ? isPrivateIp(mapped) : true;
    }

    return (
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      /^fe[89ab]/.test(lower)
    );
  }

  return true;
}

// 링크 주소 검사: http/https만 허용, 내부 주소는 차단
async function assertPublicUrl(rawUrl) {
  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    throw createHttpError(400, "올바른 링크 주소가 아닙니다.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw createHttpError(400, "http 또는 https 링크만 사용할 수 있습니다.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let addresses;

  if (net.isIP(hostname)) {
    addresses = [{ address: hostname }];
  } else {
    try {
      addresses = await dns.lookup(hostname, { all: true });
    } catch {
      throw createHttpError(400, "링크 주소를 찾을 수 없습니다.");
    }
  }

  if (
    addresses.length === 0 ||
    addresses.some((item) => isPrivateIp(item.address))
  ) {
    throw createHttpError(400, "이 주소는 사용할 수 없습니다.");
  }

  return url;
}

// 응답 본문을 최대 크기까지만 읽기
async function readLimited(response, maxBytes) {
  const declared = Number(response.headers.get("content-length"));

  if (declared > maxBytes) {
    throw createHttpError(413, "문서가 너무 커서 가져올 수 없습니다. (최대 5MB)");
  }

  if (!response.body) return Buffer.alloc(0);

  const chunks = [];
  let total = 0;

  for await (const chunk of response.body) {
    total += chunk.length;

    if (total > maxBytes) {
      throw createHttpError(413, "문서가 너무 커서 가져올 수 없습니다. (최대 5MB)");
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

// 링크에 접속해서 본문 데이터 가져오기 (이동 주소도 매번 검사)
async function fetchPublicUrl(rawUrl) {
  let currentUrl = rawUrl;

  for (let count = 0; count <= MAX_REDIRECTS; count += 1) {
    const url = await assertPublicUrl(currentUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), URL_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; YoyakbadaBot/1.0)",
          Accept:
            "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.5"
        }
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");

        if (!location) {
          throw createHttpError(502, "링크 이동 정보를 확인하지 못했습니다.");
        }

        currentUrl = new URL(location, url).toString();
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        throw createHttpError(
          502,
          "접근이 제한된 페이지라 본문을 가져올 수 없습니다."
        );
      }

      if (!response.ok) {
        throw createHttpError(
          502,
          `링크에서 문서를 가져오지 못했습니다. (응답 코드 ${response.status})`
        );
      }

      const buffer = await readLimited(response, MAX_URL_BYTES);

      return {
        url,
        contentType: response.headers.get("content-type") ?? "",
        buffer
      };
    } catch (error) {
      if (error.status) throw error;

      throw createHttpError(
        502,
        error.name === "AbortError"
          ? "링크 응답이 너무 늦어 가져오지 못했습니다."
          : "링크에 접속하지 못했습니다."
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw createHttpError(502, "링크가 너무 많이 이동합니다.");
}

function safeFromCodePoint(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function safeDecodeURI(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

// HTML 특수문자(&amp; 등) 변환
function decodeHtmlEntities(text) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      safeFromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) => safeFromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

// 글자 인코딩(UTF-8, EUC-KR 등)에 맞게 HTML 문자열로 변환
function decodeHtmlBuffer(buffer, contentType) {
  let charset = /charset=([^;\s]+)/i.exec(contentType)?.[1];

  if (!charset) {
    const head = buffer.subarray(0, 2048).toString("latin1");
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }

  try {
    return new TextDecoder((charset || "utf-8").replace(/["']/g, "")).decode(
      buffer
    );
  } catch {
    return buffer.toString("utf8");
  }
}

function stripHtmlTags(html) {
  return html
    .replace(/<\/?(p|div|br|li|h[1-6]|tr|section|blockquote)[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

// 웹 페이지에서 제목과 본문 텍스트 추출
function extractFromHtml(html) {
  const metaTitle =
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(
      html
    )?.[1];
  const tagTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const title = cleanText(decodeHtmlEntities(metaTitle || tagTitle || ""));

  let body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|noscript|svg|nav|header|footer|aside|form|iframe)[\s\S]*?<\/\1>/gi,
      " "
    );

  // article 또는 main 영역이 충분히 길면 그 부분만 사용
  const main =
    /<article[\s\S]*?<\/article>/i.exec(body)?.[0] ??
    /<main[\s\S]*?<\/main>/i.exec(body)?.[0];

  if (main && cleanText(stripHtmlTags(main)).length >= 200) {
    body = main;
  }

  const content = cleanText(decodeHtmlEntities(stripHtmlTags(body)));

  return { title, content };
}

// 링크 하나에서 제목과 본문 가져오기 (웹 페이지, PDF, 텍스트 지원)
async function fetchUrlContent(rawUrl) {
  const { url, contentType, buffer } = await fetchPublicUrl(rawUrl);
  const type = contentType.toLowerCase();

  // PDF 링크 (논문 등)
  if (buffer.subarray(0, 4).toString() === "%PDF") {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const fileName = safeDecodeURI(path.basename(url.pathname, ".pdf"));

    return {
      title: fileName || url.hostname,
      content: cleanText(result.text)
    };
  }

  // 웹 페이지
  if (type === "" || type.includes("html")) {
    return extractFromHtml(decodeHtmlBuffer(buffer, contentType));
  }

  // 일반 텍스트
  if (type.startsWith("text/")) {
    return {
      title: url.hostname,
      content: cleanText(decodeHtmlBuffer(buffer, contentType))
    };
  }

  throw createHttpError(
    415,
    "지원하지 않는 링크 형식입니다. (웹 페이지, PDF 링크만 가능)"
  );
}

// ==============================
// 회원가입
// ==============================
app.post("/auth/register", async (req, res) => {
  try {
    const { email, name, password } = req.body;

    // 입력값 확인
    if (
      typeof email !== "string" ||
      typeof name !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !name.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "이메일, 이름, 비밀번호를 모두 입력해주세요."
      });
    }

    const cleanEmail = email.trim();
    const cleanName = name.trim();

    if (password.length < 4) {
      return res.status(400).json({
        message: "비밀번호는 4자 이상 입력해주세요."
      });
    }

    // 이메일 중복 확인
    const existingUser = await get(
      "SELECT id FROM users WHERE email = ?",
      [cleanEmail]
    );

    if (existingUser) {
      return res.status(409).json({
        message: "이미 가입된 이메일입니다."
      });
    }

    // 비밀번호 해시 처리
    const passwordHash = await bcrypt.hash(password, 10);

    // 사용자 등록
    const result = await run(
      `INSERT INTO users (email, name, password_hash)
       VALUES (?, ?, ?)`,
      [cleanEmail, cleanName, passwordHash]
    );

    return res.status(201).json({
      id: result.id,
      email: cleanEmail,
      name: cleanName,
      message: "회원가입이 완료되었습니다."
    });
  } catch (error) {
    if (error.message?.includes("UNIQUE")) {
      return res.status(409).json({
        message: "이미 가입된 이메일입니다."
      });
    }

    console.error("회원가입 오류:", error);

    return res.status(500).json({
      message: "회원가입 중 오류가 발생했습니다."
    });
  }
});

// ==============================
// 로그인 및 JWT 발급
// ==============================
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
      return res.status(400).json({
        message: "이메일과 비밀번호를 입력해주세요."
      });
    }

    const user = await get(
      "SELECT * FROM users WHERE email = ?",
      [email.trim()]
    );

    if (!user) {
      return res.status(401).json({
        message: "로그인 정보가 올바르지 않습니다."
      });
    }

    const isValid = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!isValid) {
      return res.status(401).json({
        message: "로그인 정보가 올바르지 않습니다."
      });
    }

    const token = createToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error("로그인 오류:", error);

    res.status(500).json({
      message: "로그인 중 오류가 발생했습니다."
    });
  }
});

// ==============================
// 문서 API
// ==============================

// 문서 목록 조회
app.get("/documents", authenticate, async (req, res) => {
  try {
    const q = req.query.q ?? "";

    let rows;

    if (q.trim() !== "") {
      const keyword = `%${q}%`;

      rows = await all(
        `SELECT * FROM documents
        WHERE user_id = ?
        AND (
        title LIKE ?
        OR source LIKE ?
        OR content LIKE ?
        )
        ORDER BY id DESC`,
        [
          req.user.id,
          keyword,
          keyword,
          keyword
        ]
      );
    } else {
      rows = await all(
        `SELECT * FROM documents
        WHERE user_id = ?
        ORDER BY id DESC`,
        [req.user.id]
      );
    }

    const documents = [];

    for (const row of rows) {
      const document = await buildDocumentDetail(
        row.id,
        req.user.id
      );

      if (document) {
        documents.push(document);
      }
    }

    res.json(documents);
  } catch (error) {
    console.error("문서 목록 조회 오류:", error);

    res.status(500).json({
      message: "문서 목록을 불러오는 중 오류가 발생했습니다.",
      error: error.message
    });
  }
});

// 파일 업로드 후 텍스트 추출 / 요약 / 키워드 분석
app.post(
  "/documents/analyze-file",
  authenticate,
  upload.single("document"),
  guardAnalysis,
  async (req, res, next) => {
    if (!req.file) return res.status(400).json({ message: "파일을 첨부하세요." });
    try {
      const content = await extractTextFromUpload(req.file);
      const title = path.parse(req.file.originalname).name;
      const ext = path.extname(req.file.originalname).slice(1).toUpperCase() || "TXT";
      res.json(await analyzePreview(req, { title, type: ext, source: req.file.originalname, content }, req.query.summaryLength));
    } catch (error) { next(error); }
    finally { await fs.unlink(req.file.path).catch(() => {}); }
  }
);

app.post("/documents/analyze-text", authenticate, guardAnalysis, async (req, res, next) => {
  try {
    const content = validateContent(req.body?.content);
    res.json(await analyzePreview(req, {
      title: content.replace(/\s+/g, " ").slice(0, 40),
      type: "TXT", source: "직접 입력", content,
    }, req.body?.summaryLength));
  } catch (error) { next(error); }
});

// 링크(URL)에서 본문 가져오기 / 요약 / 키워드 분석
app.post("/documents/analyze-url", authenticate, guardAnalysis, async (req, res, next) => {
  try {
    const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";

    if (!url) {
      return res.status(400).json({
        message: "요약할 링크를 입력하세요."
      });
    }

    const result = await fetchUrlContent(url);
    const content = result.content.slice(0, MAX_URL_CONTENT_LENGTH);

    if (content.length < 50) {
      return res.status(422).json({
        message:
          "페이지에서 요약할 본문을 찾지 못했습니다. 접근이 제한되었거나 자바스크립트로 내용을 불러오는 페이지일 수 있습니다."
      });
    }

    res.json(await analyzePreview(req, {
      title: result.title || new URL(url).hostname,
      type: "LINK", source: url, content,
    }, req.body?.summaryLength));
  } catch (error) {
    if (error instanceof AnalysisError) return next(error);
    if (!error.status) console.error("링크 분석 오류:", error);
    res.status(error.status ?? 500).json({
      message: error.status ? error.message : "링크를 분석하는 중 오류가 발생했습니다."
    });
  }
});

// 문서 상세 조회
app.get("/documents/:id", authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const document = await buildDocumentDetail(
      id,
      req.user.id
    );

    if (!document) {
      return res.status(404).json({
        message: "문서를 찾을 수 없습니다."
      });
    }

    res.json(document);
  } catch (error) {
    console.error("문서 상세 조회 오류:", error);

    res.status(500).json({
      message: "문서 상세 정보를 불러오는 중 오류가 발생했습니다.",
      error: error.message
    });
  }
});

// 문서 등록
app.post("/documents", authenticate, async (req, res, next) => {
  const { analysisId, title, dday } = req.body ?? {};
  if (typeof analysisId !== "string" || !analysisId) {
    return res.status(400).json({ message: "먼저 원문을 분석하세요." });
  }

  const ddayNumber = dday === "" || dday == null ? 7 : Number(dday);
  const ddayValue = Number.isFinite(ddayNumber) ? ddayNumber : 7;
  let preview;
  try {
    preview = previews.acquire(analysisId, req.user.id);
    const { result } = preview;
    preview.documentId ??= await transaction(async ({ run: txRun }) => {
      const document = await txRun(
        `INSERT INTO documents (user_id, title, type, source, content, dday) VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.id, cleanText(title || "") || result.title, result.type, result.source, result.content, ddayValue]
      );
      await txRun("INSERT INTO summaries (document_id, summary_text, keywords) VALUES (?, ?, ?)",
        [document.id, result.summary, JSON.stringify(result.keywords)]);
      for (const task of result.tasks) {
        await txRun("INSERT INTO tasks (document_id, title, due_date, kind, is_done) VALUES (?, ?, ?, ?, 0)",
          [document.id, task.title, task.dueDate, task.kind]);
      }
      return document.id;
    });
    const savedDocument = await buildDocumentDetail(preview.documentId, req.user.id);
    previews.delete(analysisId);
    res.status(201).json(savedDocument);
  } catch (error) { next(error); }
  finally { if (preview) preview.saving = false; }
});

// 문서 수정
app.patch("/documents/:id", authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const document = await buildDocumentDetail(
      id,
      req.user.id
    );

    if (!document) {
      return res.status(404).json({
        message: "문서를 찾을 수 없습니다."
      });
    }

    const { title, dday } = req.body;

    await run(
      `UPDATE documents
      SET title = COALESCE(?, title),
      dday = COALESCE(?, dday)
      WHERE id = ? AND user_id = ?`,
      [
        title,
        dday,
        id,
        req.user.id
      ]
    );

    const updatedDocument = await buildDocumentDetail(
      id,
      req.user.id
    );

    res.json(updatedDocument);
  } catch (error) {
    console.error("문서 수정 오류:", error);

    res.status(500).json({
      message: "문서를 수정하는 중 오류가 발생했습니다.",
      error: error.message
    });
  }
});

// 문서 삭제
app.delete("/documents/:id", authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const document = await buildDocumentDetail(
      id,
      req.user.id
    );

    if (!document) {
      return res.status(404).json({
        message: "문서를 찾을 수 없습니다."
      });
    }

    await run(
      `DELETE FROM tasks
      WHERE document_id = ?`,
      [id]
    );

    await run(
      `DELETE FROM summaries
      WHERE document_id = ?`,
      [id]
    );

    await run(
      `DELETE FROM documents
      WHERE id = ? AND user_id = ?`,
      [
        id,
        req.user.id
      ]
    );

    res.status(204).send();
  } catch (error) {
    console.error("문서 삭제 오류:", error);

    res.status(500).json({
      message: "문서를 삭제하는 중 오류가 발생했습니다.",
      error: error.message
    });
  }
});

// ==============================
// 할 일 API
// ==============================

// 할 일 추가
app.post("/documents/:id/tasks", authenticate, async (req, res) => {
  try {
    const documentId = Number(req.params.id);

    const document = await buildDocumentDetail(
      documentId,
      req.user.id
    );

    if (!document) {
      return res.status(404).json({
        message: "문서를 찾을 수 없습니다."
      });
    }

    const { title, dueDate } = req.body;

    if (!title || title.trim() === "") {
      return res.status(400).json({
        message: "title은 필수입니다."
      });
    }

    const result = await run(
      `INSERT INTO tasks
      (document_id, title, due_date, is_done)
      VALUES (?, ?, ?, 0)`,
      [
        documentId,
        title.trim(),
        dueDate ?? ""
      ]
    );

    res.status(201).json({
      id: result.id,
      title: title.trim(),
      dueDate: dueDate ?? "",
      isDone: false
    });
  } catch (error) {
    console.error("할 일 추가 오류:", error);

    res.status(500).json({
      message: "할 일을 추가하는 중 오류가 발생했습니다.",
      error: error.message
    });
  }
});

// 할 일 수정
app.patch("/tasks/:id", authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const task = await get(
      `SELECT tasks.*
      FROM tasks
      JOIN documents ON documents.id = tasks.document_id
      WHERE tasks.id = ?
      AND documents.user_id = ?`,
      [
        id,
        req.user.id
      ]
    );

    if (!task) {
      return res.status(404).json({
        message: "할 일을 찾을 수 없습니다."
      });
    }

    const { title, dueDate, isDone } = req.body;

    const doneValue =
      typeof isDone === "boolean"
        ? (isDone ? 1 : 0)
        : null;

    await run(
      `UPDATE tasks
      SET title = COALESCE(?, title),
      due_date = COALESCE(?, due_date),
      is_done = COALESCE(?, is_done)
      WHERE id = ?
      AND document_id IN (
      SELECT id FROM documents WHERE user_id = ?
      )`,
      [
        title,
        dueDate,
        doneValue,
        id,
        req.user.id
      ]
    );

    const updatedTask = await get(
      `SELECT tasks.*
      FROM tasks
      JOIN documents ON documents.id = tasks.document_id
      WHERE tasks.id = ?
      AND documents.user_id = ?`,
      [
        id,
        req.user.id
      ]
    );

    res.json(formatTask(updatedTask));
  } catch (error) {
    console.error("할 일 수정 오류:", error);

    res.status(500).json({
      message: "할 일을 수정하는 중 오류가 발생했습니다.",
      error: error.message
    });
  }
});

// 할 일 삭제
app.delete("/tasks/:id", authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const task = await get(
      `SELECT tasks.*
      FROM tasks
      JOIN documents ON documents.id = tasks.document_id
      WHERE tasks.id = ?
      AND documents.user_id = ?`,
      [
        id,
        req.user.id
      ]
    );

    if (!task) {
      return res.status(404).json({
        message: "할 일을 찾을 수 없습니다."
      });
    }

    await run(
      `DELETE FROM tasks
      WHERE id = ?
      AND document_id IN (
      SELECT id FROM documents WHERE user_id = ?
      )`,
      [
        id,
        req.user.id
      ]
    );

    res.status(204).send();
  } catch (error) {
    console.error("할 일 삭제 오류:", error);

    res.status(500).json({
      message: "할 일을 삭제하는 중 오류가 발생했습니다.",
      error: error.message
    });
  }
});

// ==============================
// DB 테스트 API
// ==============================
app.get("/test", authenticate, async (req, res) => {
  try {
    const documents = await all(
      "SELECT * FROM documents WHERE user_id = ?",
      [req.user.id]
    );

    const summaries = await all(
      `SELECT * FROM summaries
      WHERE document_id IN (
      SELECT id FROM documents WHERE user_id = ?
      )`,
      [req.user.id]
    );

    const tasks = await all(
      `SELECT * FROM tasks
      WHERE document_id IN (
      SELECT id FROM documents WHERE user_id = ?
      )`,
      [req.user.id]
    );

    res.json({
      documents,
      summaries,
      tasks
    });
  } catch (error) {
    console.error("DB 확인 오류:", error);

    res.status(500).json({
      error: error.message
    });
  }
});

// ==============================
// 공통 오류 처리
// ==============================

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof AnalysisError) {
    const result = publicAnalysisError(error);
    const { status, ...body } = result;
    return res.status(status).json(body);
  }
  if (error instanceof multer.MulterError) {
    return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      message: error.code === "LIMIT_FILE_SIZE" ? "파일은 10MB 이하만 첨부할 수 있습니다." : "파일 업로드를 처리하지 못했습니다."
    });
  }
  console.error(error);
  res.status(500).json({ message: "서버 내부 오류가 발생했습니다." });
});

// ==============================
// 서버 실행
// ==============================
export async function startServer(port = PORT) {
  await prepareDatabase();
  return app.listen(port, () => {
    console.log(`Gemini 요약 API 서버 실행: http://localhost:${port}`);
    if (!config.geminiApiKey) console.warn("server/.env에 GEMINI_API_KEY를 설정하세요.");
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startServer().catch((error) => {
    console.error("서버 시작 실패:", error);
    process.exitCode = 1;
  });
}
