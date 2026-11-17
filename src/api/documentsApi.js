import { API_BASE as BASE_URL } from "./baseUrl.js";

async function request(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(
      "API 서버에 연결할 수 없습니다. server 폴더에서 npm run dev를 실행했는지 확인하세요.",
    );
  }
}

function authHeaders(token, json = false) {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    Authorization: `Bearer ${token}`,
  };
}

async function readJson(response) {
  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw new Error(data?.message ?? "API 응답을 읽을 수 없습니다. 서버가 실행 중인지 확인하세요.");
  }

  return data;
}

export async function getDocuments(token, keyword = "") {
  const query = keyword ? `?q=${encodeURIComponent(keyword)}` : "";
  const response = await request(`${BASE_URL}/documents${query}`, {
    headers: authHeaders(token),
  });
  return readJson(response);
}

export async function getDocument(token, id) {
  const response = await request(`${BASE_URL}/documents/${id}`, {
    headers: authHeaders(token),
  });
  return readJson(response);
}

export async function createDocument(token, document) {
  const response = await request(`${BASE_URL}/documents`, {
    method: "POST",
    headers: authHeaders(token, true),
    body: JSON.stringify(document),
  });
  return readJson(response);
}

export async function analyzeDocumentFile(token, file) {
  const formData = new FormData();
  formData.append("document", file);

  const response = await request(`${BASE_URL}/documents/analyze-file`, {
    method: "POST",
    headers: authHeaders(token),
    body: formData,
  });
  return readJson(response);
}

export async function analyzeDocumentText(token, content, summaryLength = "3줄") {
  const response = await request(`${BASE_URL}/documents/analyze-text`, {
    method: "POST",
    headers: authHeaders(token, true),
    body: JSON.stringify({ content, summaryLength }),
  });
  return readJson(response);
}

export async function updateDocument(token, id, data) {
  const response = await request(`${BASE_URL}/documents/${id}`, {
    method: "PATCH",
    headers: authHeaders(token, true),
    body: JSON.stringify(data),
  });
  return readJson(response);
}

export async function deleteDocument(token, id) {
  const response = await request(`${BASE_URL}/documents/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return readJson(response);
}

export async function addTask(token, documentId, task) {
  const response = await request(`${BASE_URL}/documents/${documentId}/tasks`, {
    method: "POST",
    headers: authHeaders(token, true),
    body: JSON.stringify(task),
  });
  return readJson(response);
}

export async function updateTask(token, id, data) {
  const response = await request(`${BASE_URL}/tasks/${id}`, {
    method: "PATCH",
    headers: authHeaders(token, true),
    body: JSON.stringify(data),
  });
  return readJson(response);
}

export async function deleteTask(token, id) {
  const response = await request(`${BASE_URL}/tasks/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return readJson(response);
}
