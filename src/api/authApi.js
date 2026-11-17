import { API_BASE } from "./baseUrl.js";

async function authenticate(action, fields, fallbackMessage) {
  let response;
  try {
    response = await fetch(`${API_BASE}/auth/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
  } catch {
    throw new Error("서버에 연결할 수 없습니다. npm run server:dev로 서버를 실행했는지 확인하세요.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.message || fallbackMessage);
  return data;
}

export function login(email, password) {
  return authenticate("login", { email, password }, "로그인에 실패했습니다.");
}

export function register({ email, name, password }) {
  return authenticate("register", { email, name, password }, "회원가입에 실패했습니다.");
}
