import { API_BASE as BASE_URL } from "./baseUrl.js";

// 파일 첨부 → 텍스트 추출 / 요약 / 키워드 분석
export async function analyzeDocumentFile(token, file, summaryLength = "3줄") {
  const formData = new FormData();
  formData.append("document", file);

  let response;

  try {
    response = await fetch(`${BASE_URL}/documents/analyze-file?summaryLength=${encodeURIComponent(summaryLength)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });
  } catch {
    throw new Error("서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.");
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "파일을 분석하지 못했습니다.");
  }

  return data;
}

// 링크(URL) 붙여넣기 → 본문 가져오기 / 요약 / 키워드 분석
export async function analyzeDocumentUrl(token, url, summaryLength = "3줄") {
  let response;

  try {
    response = await fetch(`${BASE_URL}/documents/analyze-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ url, summaryLength })
    });
  } catch {
    throw new Error("서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.");
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "링크를 분석하지 못했습니다.");
  }

  return data;
}