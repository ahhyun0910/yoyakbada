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
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "API 요청에 실패했습니다.");
  }

  return data;
}

export async function getSettings(token) {
  const response = await request(`${BASE_URL}/settings`, {
    headers: authHeaders(token),
  });
  return readJson(response);
}

export async function saveSettings(token, settings) {
  const response = await request(`${BASE_URL}/settings`, {
    method: "PATCH",
    headers: authHeaders(token, true),
    body: JSON.stringify(settings),
  });
  return readJson(response);
}
