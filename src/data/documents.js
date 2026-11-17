const BASE_URL = "http://localhost:4000";

// ==============================
// 샘플 데이터 (기존 코드 유지)
// ==============================
export const initialDocuments = [
  {
    id: 1,
    title: "현장체험학습 안내서.pdf",
    type: "PDF",
    source: "대구소프트웨어마이스터고",
    createdAt: "2026.08.29",
    dday: 1,
    summary: "9월 18일 현장체험학습 참가 동의서와 비용 납부 안내입니다.",
    keywords: ["현장학습", "동의서", "납부"],
    tasks: [
      { id: 101, title: "참가 동의서 제출", dueDate: "2026-09-01", isDone: false },
      { id: 102, title: "체험학습 비용 납부", dueDate: "2026-09-03", isDone: true }
    ]
  },
  {
    id: 2,
    title: "여름방학 특강 신청 안내.docx",
    type: "DOCX",
    source: "교무부",
    createdAt: "2026.08.27",
    dday: 3,
    summary: "여름방학 특강 신청 기간과 수강 장소 안내입니다.",
    keywords: ["특강", "신청", "방학"],
    tasks: [
      { id: 201, title: "특강 신청서 제출", dueDate: "2026-09-03", isDone: false }
    ]
  },
  {
    id: 3,
    title: "건강검진 결과서 제출 안내.txt",
    type: "TXT",
    source: "보건실",
    createdAt: "2026.08.25",
    dday: 6,
    summary: "건강검진 결과서 제출 대상과 제출 장소 안내입니다.",
    keywords: ["건강검진", "결과서", "보건실"],
    tasks: [
      { id: 301, title: "검진 결과서 보건실 제출", dueDate: "2026-09-06", isDone: true },
      { id: 302, title: "미제출 학생 명단 확인", dueDate: "", isDone: false }
    ]
  }
];

// ==============================
// 공통 도우미 함수
// ==============================

// fetch 호출 (서버에 연결하지 못했을 때 안내 메시지)
async function request(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error("서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.");
  }
}

// 로그인 토큰 헤더 (Content-Type은 넣지 않음: 파일 업로드 때문)
function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`
  };
}

// 응답 처리: 실패하면 서버 message로 에러를 던지고, 204면 null 반환
async function readJson(response) {
  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "요청 처리 중 오류가 발생했습니다.");
  }

  return data;
}

// ==============================
// 문서 API
// ==============================

// 문서 목록 조회
export async function getDocuments(token, keyword = "") {
  const query = keyword.trim()
    ? `?q=${encodeURIComponent(keyword.trim())}`
    : "";

  const response = await request(`${BASE_URL}/documents${query}`, {
    headers: authHeaders(token)
  });

  return readJson(response);
}

// 문서 등록
export async function createDocument(token, documentData) {
  const response = await request(`${BASE_URL}/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token)
    },
    body: JSON.stringify(documentData)
  });

  return readJson(response);
}

// 문서 수정 (제목, D-Day)
export async function updateDocument(token, id, documentData) {
  const response = await request(`${BASE_URL}/documents/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token)
    },
    body: JSON.stringify(documentData)
  });

  return readJson(response);
}

// 문서 삭제
export async function deleteDocument(token, id) {
  const response = await request(`${BASE_URL}/documents/${id}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });

  return readJson(response);
}

// 파일 첨부 → 텍스트 추출 / 요약 / 키워드 분석
export async function analyzeDocumentFile(token, file) {
  const formData = new FormData();
  formData.append("document", file);

  const response = await request(`${BASE_URL}/documents/analyze-file`, {
    method: "POST",
    headers: authHeaders(token),
    body: formData
  });

  return readJson(response);
}