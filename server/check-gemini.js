import { analyzeWithGemini } from "./ai/gemini.js";

try {
  const result = await analyzeWithGemini(
    "2026년 10월 23일까지 동아리 신청서를 담임 선생님께 제출하세요. " +
    "동아리 설명회는 2026년 10월 22일 오후 3시에 강당에서 열립니다. " +
    "설명회에 참석할 학생은 필기도구를 준비하세요.",
    "3줄",
  );
  console.log("Gemini 실제 연결 성공 (API 1회 호출)");
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`[${error.code || "ERROR"}] ${error.message}`);
  process.exitCode = 1;
}
