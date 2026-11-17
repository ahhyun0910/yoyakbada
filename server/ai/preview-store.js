import { randomUUID } from "node:crypto";
import { AnalysisError } from "./errors.js";

// 서버가 만든 결과만 저장합니다. 미리보기는 30분 뒤 만료되며 재시작하면 사라집니다.
export function createPreviewStore({ ttlMs = 30 * 60 * 1000, maxEntries = 100, now = Date.now } = {}) {
  const entries = new Map();
  function prune() {
    for (const [id, entry] of entries) {
      if (entry.expiresAt <= now() && !entry.saving) entries.delete(id);
    }
  }
  return {
    add(userId, result) {
      prune();
      if (entries.size >= maxEntries) {
        throw new AnalysisError(503, "PREVIEW_CAPACITY", "분석 대기 결과가 많습니다. 잠시 후 다시 시도하세요.");
      }
      const analysisId = randomUUID();
      const entry = { userId, result, expiresAt: now() + ttlMs, saving: false, documentId: null };
      entries.set(analysisId, entry);
      return { ...result, analysisId, expiresAt: new Date(entry.expiresAt).toISOString() };
    },
    acquire(analysisId, userId) {
      prune();
      const entry = entries.get(analysisId);
      if (!entry || entry.userId !== userId) {
        throw new AnalysisError(409, "ANALYSIS_EXPIRED", "분석 결과가 만료되었습니다. AI 분석을 다시 실행하세요.");
      }
      if (entry.saving) {
        throw new AnalysisError(409, "SAVE_IN_PROGRESS", "문서를 저장 중입니다. 잠시 후 확인하세요.");
      }
      entry.saving = true;
      return entry;
    },
    get(analysisId, userId) {
      prune();
      const entry = entries.get(analysisId);
      if (!entry || entry.userId !== userId) return null;
      return entry.result;
    },
    delete(analysisId) {
      entries.delete(analysisId);
    },
  };
}
