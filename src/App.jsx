import { useMemo, useRef, useState } from "react";
import "./App.css";

import { login } from "./api/authApi.js";
import { register } from "./api/registerApi.js";

import DocumentCard from "./components/DocumentCard.jsx";
import TaskItem from "./components/TaskItem.jsx";
import DdayBadge from "./components/DdayBadge.jsx";

import {
  createDocument,
  deleteDocument,
  getDocuments,
  analyzeDocumentText,
} from "./api/documentsApi.js";
import {
  analyzeDocumentFile,
  analyzeDocumentUrl,
} from "./api/analyzeApi.js";

import { API_BASE } from "./api/baseUrl.js";

// 문서 등록 폼 초기값
const emptyDocumentForm = {
  title: "",
  type: "TXT",
  source: "",
  content: "",
  summary: "",
  summaryLength: "3줄",
  keywords: [],
  tasks: [],
  analysisId: "",
  dday: 7,
};

const defaultProfilePhoto = `${import.meta.env.BASE_URL}default-profile.png`;

const defaultSettings = {
  name: "",
  photo: "",
  darkMode: false,
  taskAlerts: true,
};

function App() {
  // ==============================
  // 로그인 상태
  // ==============================
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("yoyakbada-settings") || "{}");
      return { ...defaultSettings, darkMode: saved.darkMode ?? false, taskAlerts: saved.taskAlerts ?? true };
    } catch {
      return defaultSettings;
    }
  });
  const [settingsMessage, setSettingsMessage] = useState("");
  const [email, setEmail] = useState("student@yoyakbada.com");
  const [password, setPassword] = useState("1234");

  // ==============================
  // 문서 상태
  // ==============================
  const [documents, setDocuments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  // ==============================
  // 문서 등록 상태
  // ==============================
  const [documentInputMode, setDocumentInputMode] = useState("file");
  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);
  const [documentForm, setDocumentForm] = useState(() => ({
    ...emptyDocumentForm,
  }));
  const analysisRequest = useRef(0);
  const [documentUrl, setDocumentUrl] = useState("");

  // ==============================
  // 검색 및 할 일 상태
  // ==============================
  const [keyword, setKeyword] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");

  // ==============================
  // 화면 전환 상태
  // ==============================
  const [isRegister, setIsRegister] = useState(false);
  const [activePage, setActivePage] = useState("documents");

  // ==============================
  // 회원가입 입력 상태
  // ==============================
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // ==============================
  // 화면 상태
  // ==============================
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function changeSetting(key, value) {
    setSettings((previous) => {
      const next = { ...previous, [key]: value };
      if (key === "name" || key === "photo") {
        localStorage.setItem(`yoyakbada-profile-${user.id}`, JSON.stringify({ name: next.name, photo: next.photo }));
      } else {
        localStorage.setItem("yoyakbada-settings", JSON.stringify({ darkMode: next.darkMode, taskAlerts: next.taskAlerts }));
      }
      return next;
    });
  }

  function saveProfile(event) {
    event.preventDefault();
    const updatedUser = { ...user, name: settings.name.trim() || user?.name || "사용자" };
    setUser(updatedUser);
    localStorage.setItem("user", JSON.stringify(updatedUser));
    changeSetting("name", updatedUser.name);
    setSettingsMessage("프로필을 저장했어요.");
  }

  function handleProfilePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSettingsMessage("이미지 파일을 선택해 주세요.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      changeSetting("photo", reader.result);
      setSettingsMessage("프로필 사진을 바꿨어요.");
    };
    reader.readAsDataURL(file);
  }

  // ==============================
  // 로그인
  // ==============================
  async function handleLogin(event) {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");

      const data = await login(email, password);

      if (!data || !data.token) {
        throw new Error("로그인 토큰을 받지 못했습니다.");
      }

      const docs = await getDocuments(data.token);

      setToken(data.token);
      setUser(data.user);
      let profile = {};
      try {
        profile = JSON.parse(localStorage.getItem(`yoyakbada-profile-${data.user.id}`) || "{}") || {};
      } catch {
        // 읽을 수 없는 프로필 설정은 가입 정보로 대체합니다.
      }
      setSettings((previous) => ({ ...previous, name: profile.name || data.user.name, photo: profile.photo || "" }));
      setSettingsMessage("");
      setDocuments(docs);
      setSelectedId(docs[0]?.id ?? null);
      setActivePage("documents");
    } catch (err) {
      setError(err.message || "이메일 또는 비밀번호를 확인하세요.");
    } finally {
      setLoading(false);
    }
  }

  // ==============================
  // 회원가입
  // ==============================
  async function handleRegister(event) {
    event.preventDefault();
    setError("");

    if (registerPassword !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    try {
      setLoading(true);

      await register(registerEmail, registerName, registerPassword);

      setEmail(registerEmail);
      setPassword("");

      setIsRegister(false);

      setRegisterName("");
      setRegisterEmail("");
      setRegisterPassword("");
      setConfirmPassword("");

      alert("회원가입이 완료되었습니다. 로그인해주세요.");
    } catch (err) {
      setError(err.message || "회원가입 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  // ==============================
  // 로그아웃
  // ==============================
  function handleLogout() {
    resetDocumentForm();
    setNewTaskTitle("");
    setNewTaskDueDate("");
    setError("");
    setToken("");
    setUser(null);
    setDocuments([]);
    setSelectedId(null);
    setActivePage("documents");
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }

  // ==============================
  // 로그인 만료(토큰 오류) 처리
  // ==============================
  function isAuthError(apiError) {
    const message = String(apiError?.message ?? "");

    return message.includes("토큰") || message.includes("로그인");
  }

  function handleAuthError(apiError) {
    if (!isAuthError(apiError)) return false;

    handleLogout();
    setError("로그인이 만료되었습니다. 다시 로그인하세요.");
    return true;
  }

  // ==============================
  // 문서 등록: 입력 방식 변경 (파일 / 직접 입력)
  // ==============================
  function changeDocumentInputMode(mode) {
    analysisRequest.current += 1;
    setIsAnalyzingFile(false);
    setDocumentInputMode(mode);
    setDocumentUrl("");
    setDocumentForm((prev) => ({
      ...prev,
      source: "",
      content: "",
      summary: "",
      keywords: [],
      tasks: [],
      analysisId: "",
    }));
  }

  // ==============================
  // 문서 등록: 파일 선택 시 분석
  // ==============================
  async function handleDocumentFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const requestId = ++analysisRequest.current;
    setDocumentForm((prev) => ({ ...prev, summary: "", keywords: [], tasks: [], analysisId: "" }));
    try {
      setIsAnalyzingFile(true);
      setError("");
      const result = await analyzeDocumentFile(token, file, documentForm.summaryLength);
      if (requestId !== analysisRequest.current) return;
      setDocumentForm((prev) => ({ ...prev, ...result, summaryLength: result.summaryLength || prev.summaryLength, title: prev.title, source: result.source || result.filename }));
    } catch (err) {
      if (requestId === analysisRequest.current) setError(err.message || "파일을 분석하는 중 오류가 발생했습니다.");
    } finally {
      if (requestId === analysisRequest.current) setIsAnalyzingFile(false);
    }
  }

  // ==============================
  // 문서 등록: 링크(URL) 붙여넣기 → 본문 가져와서 요약
  // ==============================
  async function handleAnalyzeUrl() {
    const url = documentUrl.trim();

    if (!url) {
      setError("요약할 링크를 입력하세요.");
      return;
    }

    const requestId = ++analysisRequest.current;
    setDocumentForm((prev) => ({ ...prev, summary: "", keywords: [], tasks: [], analysisId: "" }));
    try {
      setIsAnalyzingFile(true);
      setError("");
      const result = await analyzeDocumentUrl(token, url, documentForm.summaryLength);
      if (requestId !== analysisRequest.current) return;
      setDocumentForm((prev) => ({ ...prev, ...result, summaryLength: result.summaryLength || prev.summaryLength, title: prev.title }));
    } catch (apiError) {
      if (requestId === analysisRequest.current && !handleAuthError(apiError)) setError(apiError.message || "링크를 분석하는 중 오류가 발생했습니다.");
    } finally {
      if (requestId === analysisRequest.current) setIsAnalyzingFile(false);
    }
  }

  // ==============================
  // 문서 등록: 폼 초기화
  // ==============================
  function resetDocumentForm() {
    analysisRequest.current++;
    setIsAnalyzingFile(false);
    setDocumentForm(emptyDocumentForm);
    setDocumentUrl("");
  }

  // ==============================
  // 문서 등록: 입력값 변경 (title, content, dday 등)
  // ==============================
  function changeDocumentForm(field, value) {
    setDocumentForm((prev) => ({
      ...prev,
      [field]: value,
      ...(["content", "summaryLength"].includes(field) ? { summary: "", keywords: [], tasks: [], analysisId: "" } : {}),
    }));
    if (field === "content") setError("");
  }

  async function handleAnalyzeText() {
    const requestId = ++analysisRequest.current;
    try {
      setIsAnalyzingFile(true);
      setError("");
      setDocumentForm((prev) => ({ ...prev, summary: "", keywords: [], tasks: [], analysisId: "" }));
      const result = await analyzeDocumentText(token, documentForm.content, documentForm.summaryLength);
      if (requestId === analysisRequest.current) setDocumentForm((prev) => ({ ...prev, ...result, summaryLength: result.summaryLength || prev.summaryLength, title: prev.title }));
    } catch (apiError) {
      if (requestId === analysisRequest.current && !handleAuthError(apiError)) setError(apiError.message || "원문 분석 중 오류가 발생했습니다.");
    } finally {
      if (requestId === analysisRequest.current) setIsAnalyzingFile(false);
    }
  }

  // ==============================
  // 문서 등록: 취소하고 문서 목록으로 돌아가기
  // ==============================
  function goBackToList() {
    resetDocumentForm();
    setError("");
    setActivePage("documents");
  }

  // ==============================
  // 문서 등록 (7주차 슬라이드: 등록 함수에 추가할 처리)
  // ==============================
  async function handleCreateDocument(event) {
    if (event) event.preventDefault();

    if (!documentForm.analysisId) {
      setError("파일을 첨부하거나 원문을 입력한 뒤 AI 분석을 실행하세요.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const createdDocument = await createDocument(token, {
        analysisId: documentForm.analysisId,
        title: documentForm.title,
        dday: Number(documentForm.dday),
      });

      // 등록 성공 응답을 목록 맨 앞에 넣는다
      setDocuments((prev) => [createdDocument, ...prev]);

      // 상세 화면으로 이동해 요약 결과를 보여준다
      setSelectedId(createdDocument.id);
      setActivePage("documents");

      resetDocumentForm();
    } catch (apiError) {
      if (!handleAuthError(apiError)) {
        setError(apiError.message || "문서 등록 중 오류가 발생했습니다.");
      }
    } finally {
      setLoading(false);
    }
  }

  // ==============================
  // 문서 삭제
  // ==============================
  async function handleDeleteDocument(doc) {
    const confirmed = window.confirm(
      `"${doc.title}" 문서를 삭제할까요?\n문서의 요약과 할 일도 함께 삭제됩니다.`
    );

    if (!confirmed) return;

    try {
      setLoading(true);
      setError("");

      await deleteDocument(token, doc.id);

      // 목록에서 삭제한 문서를 빼고, 선택된 문서가 삭제됐다면 첫 문서를 선택
      const remainingDocuments = documents.filter(
        (item) => item.id !== doc.id
      );

      setDocuments(remainingDocuments);

      if (selectedId === doc.id) {
        setSelectedId(remainingDocuments[0]?.id ?? null);
      }
    } catch (apiError) {
      if (!handleAuthError(apiError)) {
        setError(apiError.message || "문서 삭제 중 오류가 발생했습니다.");
      }
    } finally {
      setLoading(false);
    }
  }

  // ==============================
  // 문서 불러오기
  // ==============================
  async function loadDocuments() {
    if (!token) return;

    try {
      setLoading(true);
      setError("");

      const docs = await getDocuments(token);
      setDocuments(docs);

      if (docs.length === 0) {
        setSelectedId(null);
      } else {
        const selectedExists = docs.some((doc) => doc.id === selectedId);

        if (selectedId === null || !selectedExists) {
          setSelectedId(docs[0].id);
        }
      }
    } catch (apiError) {
      if (!handleAuthError(apiError)) {
        setError(apiError.message || "문서를 불러오는 중 오류가 발생했습니다.");
      }
    } finally {
      setLoading(false);
    }
  }

  // ==============================
  // 선택된 문서
  // ==============================
  const selectedDocument = documents.find((doc) => doc.id === selectedId);

  // ==============================
  // 문서 검색
  // ==============================
  const filteredDocuments = documents.filter((doc) => {
    const text = `${doc.title || ""} ${doc.summary || ""} ${
      doc.source || ""
    }`;

    return text.toLowerCase().includes(keyword.toLowerCase());
  });

  // ==============================
  // 전체 할 일
  // ==============================
  const allTasks = documents.flatMap((doc) => doc.tasks || []);

  const doneCount = allTasks.filter((task) => task.isDone).length;

  const urgentCount = documents.filter(
    (doc) => typeof doc.dday === "number" && doc.dday <= 3
  ).length;

  const progress = useMemo(() => {
    if (allTasks.length === 0) return 0;

    return Math.round((doneCount / allTasks.length) * 100);
  }, [allTasks.length, doneCount]);

  // ==============================
  // 할 일 완료 상태 변경
  // ==============================
  async function toggleTask(taskId) {
    const task = allTasks.find((item) => item.id === taskId);

    if (!task) return;

    try {
      setError("");

      const response = await fetch(`${API_BASE}/tasks/${task.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          isDone: !task.isDone,
        }),
      });

      if (!response.ok) {
        throw new Error("할 일 상태를 변경하지 못했습니다.");
      }

      await loadDocuments();
    } catch (err) {
      setError(err.message || "할 일 상태 변경 중 오류가 발생했습니다.");
    }
  }

  // ==============================
  // 할 일 삭제
  // ==============================
  async function handleDeleteTask(taskId) {
    try {
      setError("");

      const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("할 일을 삭제하지 못했습니다.");
      }

      await loadDocuments();
    } catch (err) {
      setError(err.message || "할 일을 삭제하는 중 오류가 발생했습니다.");
    }
  }

  // ==============================
  // 할 일 추가
  // ==============================
  async function handleAddTask(event) {
    event.preventDefault();

    if (newTaskTitle.trim() === "") return;

    if (selectedId === null) {
      setError("먼저 문서를 선택해 주세요.");
      return;
    }

    try {
      setError("");

      const response = await fetch(
        `${API_BASE}/documents/${selectedId}/tasks`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: newTaskTitle.trim(),
            dueDate: newTaskDueDate,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("할 일을 추가하지 못했습니다.");
      }

      setNewTaskTitle("");
      setNewTaskDueDate("");
      await loadDocuments();
    } catch (err) {
      setError(err.message || "할 일을 추가하는 중 오류가 발생했습니다.");
    }
  }

  // ==============================
  // 로그인 / 회원가입 화면
  // ==============================
  if (!token) {
    return (
      <main className={settings.darkMode ? "auth-page dark-mode" : "auth-page"}>
        <section className="auth-card">
          <div className="auth-tabs">
            <button
              type="button"
              className={!isRegister ? "auth-tab active" : "auth-tab"}
              onClick={() => {
                setIsRegister(false);
                setError("");
              }}
            >
              로그인
            </button>

            <button
              type="button"
              className={isRegister ? "auth-tab active" : "auth-tab"}
              onClick={() => {
                setIsRegister(true);
                setError("");
              }}
            >
              회원가입
            </button>
          </div>

          {!isRegister ? (
            <form className="auth-form" onSubmit={handleLogin}>
              <div className="auth-field">
                <label htmlFor="email">이메일</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="이메일을 입력하세요"
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="password">비밀번호</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  required
                />
              </div>

              <button
                className="auth-submit"
                type="submit"
                disabled={loading}
              >
                {loading ? "로그인 중..." : "로그인"}
              </button>

              {error && <p className="auth-error">{error}</p>}

              <p className="auth-footer">
                계정이 없으신가요?{" "}
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => {
                    setIsRegister(true);
                    setError("");
                  }}
                >
                  회원가입
                </button>
              </p>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleRegister}>
              <div className="auth-field">
                <label htmlFor="register-name">이름</label>
                <input
                  id="register-name"
                  type="text"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  placeholder="이름을 입력하세요"
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="register-email">이메일</label>
                <input
                  id="register-email"
                  type="email"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  placeholder="이메일을 입력하세요"
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="register-password">비밀번호</label>
                <input
                  id="register-password"
                  type="password"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  minLength={4}
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="confirm-password">비밀번호 확인</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="비밀번호를 다시 입력하세요"
                  minLength={4}
                  required
                />
              </div>

              <button
                className="auth-submit"
                type="submit"
                disabled={loading}
              >
                {loading ? "가입 중..." : "회원가입"}
              </button>

              {error && <p className="auth-error">{error}</p>}

              <p className="auth-footer">
                이미 계정이 있으신가요?{" "}
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => {
                    setIsRegister(false);
                    setError("");
                  }}
                >
                  로그인
                </button>
              </p>
            </form>
          )}
        </section>
      </main>
    );
  }

  // ==============================
  // 로그인 후 메인 화면
  // ==============================
  return (
    <div className={settings.darkMode ? "app dark-mode" : "app"}>
      <aside className="sidebar">
        <div className="logo">
          <img src={`${import.meta.env.BASE_URL}yoyakbada-logo.png`} alt="" />
          <span>요약바다</span>
        </div>

        <div className="sidebar-profile">
          <img className="sidebar-profile-photo" src={settings.photo || defaultProfilePhoto} alt="프로필 사진" />
          <span>{settings.name || user?.name || "내 프로필"}</span>
        </div>

        <p className="welcome-message">
          {(settings.name || user?.name)
            ? `${settings.name || user.name}님 환영합니다.`
            : "로그인되었습니다."}
        </p>

        <button
          className="new-doc"
          type="button"
          onClick={() => {
            setActivePage("create");
            setError("");
          }}
        >
          + 새 문서 등록
        </button>

        <nav className="side-nav">
          <button
            type="button"
            className={activePage === "documents" ? "active" : ""}
            onClick={() => setActivePage("documents")}
          >
            문서 목록
          </button>

          <button
            type="button"
            className={activePage === "tasks" ? "active" : ""}
            onClick={() => setActivePage("tasks")}
          >
            전체 할 일
          </button>

          <button
            type="button"
            className={activePage === "settings" ? "active" : ""}
            onClick={() => setActivePage("settings")}
          >
            설정
          </button>
        </nav>

        <button
          type="button"
          className="logout-btn"
          onClick={handleLogout}
        >
          <svg
            className="logout-icon"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 17l5-5-5-5" />
            <path d="M15 12H3" />
            <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
          </svg>

          <span>로그아웃</span>
        </button>
      </aside>

      <main className="workspace">
        {/* ==============================
            문서 목록 화면
        ============================== */}
        {activePage === "documents" && (
          <section className="page-content">
            <header className="topbar">
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="문서 제목, 요약, 기관 검색"
              />

              <button type="button" onClick={loadDocuments}>
                검색
              </button>
            </header>

            {loading && (
              <p className="notice">문서를 불러오는 중입니다.</p>
            )}

            {error && <p className="error">{error}</p>}

            <section className="stats">
              <div>
                <strong>{documents.length}</strong>
                <span>전체 문서</span>
              </div>

              <div>
                <strong>{allTasks.length}</strong>
                <span>전체 할 일</span>
              </div>

              <div>
                <strong>{urgentCount}</strong>
                <span>D-day 임박</span>
              </div>

              <div>
                <strong>{progress}%</strong>
                <span>완료 진행률</span>
              </div>
            </section>

            <div className="content-grid">
              <section className="document-list">
                <h1>문서 목록</h1>

                {filteredDocuments.length === 0 ? (
                  <p className="empty">문서가 없습니다.</p>
                ) : (
                  filteredDocuments.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      document={doc}
                      isSelected={doc.id === selectedId}
                      onSelect={setSelectedId}
                    />
                  ))
                )}
              </section>

              {selectedDocument && (
                <section className="detail-panel">
                  <div className="detail-head">
                    <div>
                      <p className="eyebrow">AI 요약 완료</p>
                      <h2>{selectedDocument.title}</h2>
                    </div>

                    <div className="detail-head-side">
                      <DdayBadge dday={selectedDocument.dday} />

                      <button
                        type="button"
                        className="delete-doc-btn"
                        onClick={() => handleDeleteDocument(selectedDocument)}
                        disabled={loading}
                      >
                        삭제
                      </button>
                    </div>
                  </div>

                  <div className="summary-box">
                    <h3>3줄 핵심 요약</h3>
                    <p>{selectedDocument.summary}</p>
                  </div>

                  <div className="keywords">
                    {(selectedDocument.keywords || []).map(
                      (item, index) => (
                        <span key={`${item}-${index}`}>{item}</span>
                      )
                    )}
                  </div>

                  <h3>추출된 할 일</h3>

                  <ul className="task-list">
                    {(selectedDocument.tasks || []).map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        onToggle={toggleTask}
                        onDelete={handleDeleteTask}
                      />
                    ))}
                  </ul>

                  <form className="add-task" onSubmit={handleAddTask}>
                    <input
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="새 할 일을 입력하세요"
                    />

                    <label>
                      기한
                      <input type="date" value={newTaskDueDate}
                        onChange={(event) => setNewTaskDueDate(event.target.value)} />
                    </label>
                    <button type="submit">추가</button>
                  </form>
                </section>
              )}
            </div>
          </section>
        )}

        {/* ==============================
            전체 할 일 화면
        ============================== */}
        {activePage === "tasks" && (
          <section className="all-tasks-page">
            <div className="tasks-heading">
              <h1>전체 할 일</h1>
              <p>모든 문서의 할 일을 한 번에 확인하세요.</p>
            </div>

            <div className="all-tasks-card">
              {allTasks.length === 0 ? (
                <p className="empty">등록된 할 일이 없습니다.</p>
              ) : (
                documents.map((doc) => {
                  const docTasks = doc.tasks || [];

                  if (docTasks.length === 0) return null;

                  return (
                    <section className="task-document-group" key={doc.id}>
                      <h3>{doc.title}</h3>

                      {docTasks.map((task) => (
                        <div
                          className={`all-task-row ${
                            task.isDone ? "completed" : ""
                          }`}
                          key={task.id}
                        >
                          <label>
                            <input
                              type="checkbox"
                              checked={task.isDone}
                              onChange={() => toggleTask(task.id)}
                            />

                            <span>{task.title}</span>
                          </label>

                          {task.dueDate && <small>{task.dueDate}</small>}
                        </div>
                      ))}
                    </section>
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* ==============================
            새 문서 등록 화면
        ============================== */}
        {activePage === "create" && (
          <section className="create-page">
            <h1>새 문서 등록</h1>

            {error && <p className="error" role="alert">{error}</p>}

            <form className="document-form" onSubmit={handleCreateDocument}>
              <label className="summary-length-field">요약 길이
                <select disabled={isAnalyzingFile || loading} value={documentForm.summaryLength} onChange={(event) => changeDocumentForm("summaryLength", event.target.value)}>
                  <option value="1줄">1줄 요약</option><option value="3줄">3줄 요약</option><option value="5줄">5줄 요약</option>
                </select><small>길이를 바꾸면 파일을 다시 선택하거나 원문을 다시 분석하세요.</small>
              </label>
              {/* 슬라이드 14: 옵션 버튼 JSX (form 내부의 첫 번째 요소) */}
              <div className="input-mode-options">
                <button
                  type="button"
                  className={documentInputMode === "file" ? "active" : ""}
                  onClick={() => changeDocumentInputMode("file")}
                >
                  파일 첨부
                </button>

                <button
                  type="button"
                  className={documentInputMode === "link" ? "active" : ""}
                  onClick={() => changeDocumentInputMode("link")}
                >
                  링크 붙여넣기
                </button>

                <button
                  type="button"
                  className={documentInputMode === "text" ? "active" : ""}
                  onClick={() => changeDocumentInputMode("text")}
                >
                  원문 직접 입력
                </button>
              </div>

              {/* 슬라이드 15: 파일 첨부 JSX (옵션 버튼 아래) */}
              {documentInputMode === "file" && (
                <label className="wide file-upload">
                  요약할 문서 파일
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,.md,.csv,.json,.html,.htm"
                    onChange={handleDocumentFileChange}
                    disabled={isAnalyzingFile}
                  />
                  <small>
                    {isAnalyzingFile
                      ? "문서를 읽고 요약하는 중입니다."
                      : "PDF, DOCX, TXT 파일을 첨부하면 요약이 자동으로 준비됩니다."}
                  </small>
                </label>
              )}

              {/* 링크(URL) 붙여넣기: 뉴스 기사, 블로그 글, 논문 링크 */}
              {documentInputMode === "link" && (
                <div className="wide link-box">
                  <label htmlFor="document-url">요약할 링크 주소</label>

                  <div className="link-row">
                    <input
                      id="document-url"
                      type="url"
                      value={documentUrl}
                      onChange={(event) => setDocumentUrl(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleAnalyzeUrl();
                        }
                      }}
                      placeholder="https://"
                      disabled={isAnalyzingFile}
                    />

                    <button
                      type="button"
                      onClick={handleAnalyzeUrl}
                      disabled={isAnalyzingFile || !documentUrl.trim()}
                    >
                      {isAnalyzingFile ? "요약 중..." : "링크 요약하기"}
                    </button>
                  </div>

                  <small>
                    뉴스 기사, 블로그 글, 논문(PDF) 링크를 붙여넣으면 본문을 가져와
                    요약합니다.
                  </small>
                </div>
              )}

              {/* 슬라이드 16: 원문 입력과 선택 입력 JSX (파일 첨부 JSX 아래) */}
              {documentInputMode === "text" && (
                <label className="wide">
                  요약할 원문 내용
                  <textarea
                    value={documentForm.content}
                    onChange={(event) =>
                      changeDocumentForm("content", event.target.value)
                    }
                    placeholder="요약할 내용을 붙여넣습니다."
                    disabled={isAnalyzingFile}
                  />
                </label>
              )}

              {documentInputMode === "text" && (
                <div className="form-actions">
                  <button type="button" onClick={handleAnalyzeText}
                    disabled={isAnalyzingFile || loading || !documentForm.content.trim()}>
                    {isAnalyzingFile ? "AI 분석 중..." : documentForm.analysisId ? "AI 다시 분석" : "AI로 요약·할 일·키워드 추출"}
                  </button>
                </div>
              )}

              {isAnalyzingFile && <p role="status">Gemini가 원문을 분석하고 있습니다.</p>}
              {documentForm.analysisId && (
                <section className="analysis-preview" aria-label="AI 분석 결과 미리보기">
                  <h2>AI 분석 결과</h2>
                  <div className="summary-box">
                    <h3>{documentForm.summaryLength || "3줄"} 핵심 요약</h3>
                    <p>{documentForm.summary}</p>
                  </div>
                  <h3>키워드</h3>
                  <div className="keywords">
                    {(documentForm.keywords || []).map((word) => <span key={word}>{word}</span>)}
                  </div>
                  <h3>추출된 할 일 ({(documentForm.tasks || []).length}개)</h3>
                  {(documentForm.tasks || []).length ? (
                    <ul className="preview-tasks">
                      {documentForm.tasks.map((task, index) => (
                        <li key={`${task.title}-${index}`}>
                          <span>{task.title}</span>
                          <small>{task.dueDate || "기한 미정"}</small>
                        </li>
                      ))}
                    </ul>
                  ) : <p>추출된 할 일이 없습니다.</p>}
                </section>
              )}

              <div className="optional-fields">
                <label>
                  제목 선택 입력
                  <input
                    value={documentForm.title}
                    onChange={(event) =>
                      changeDocumentForm("title", event.target.value)
                    }
                  />
                </label>

                <label>
                  D-Day 선택 입력
                  <input
                    type="number"
                    min="0"
                    value={documentForm.dday}
                    onChange={(event) =>
                      changeDocumentForm("dday", event.target.value)
                    }
                  />
                </label>
              </div>

              {/* 슬라이드 17: 버튼 문구와 안내 문구 JSX (form 하단) */}
              <p className="form-help">
                분석 결과를 확인한 뒤 저장하면 상세 화면에서 요약·키워드·할 일을 볼 수 있습니다.
              </p>

              <div className="form-actions">
                <button type="button" onClick={goBackToList}>
                  취소
                </button>
                <button type="submit" disabled={!documentForm.analysisId || loading || isAnalyzingFile}>
                  {loading ? "저장 중..." : "분석 결과 저장"}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* ==============================
            설정 화면
        ============================== */}
        {activePage === "settings" && (
          <section className="settings-page">
            <header className="settings-header">
              <div>
                <h1>설정</h1>
                <p>요약바다를 내게 맞게 바꿔 보세요.</p>
              </div>
            </header>

            <form className="settings-card" onSubmit={saveProfile}>
              <div className="settings-card-heading">
                <div><h2>프로필</h2><p>계정에 표시되는 이름과 사진을 관리해요.</p></div>
              </div>
              <div className="profile-editor">
                <div className="profile-avatar">
                  <img src={settings.photo || defaultProfilePhoto} alt="내 프로필 사진" />
                </div>
                <label className="photo-button">
                  사진 바꾸기
                  <input type="file" accept="image/*" onChange={handleProfilePhoto} />
                </label>
              </div>
              <label className="settings-field">
                <span>이름</span>
                <input value={settings.name} onChange={(event) => changeSetting("name", event.target.value)} placeholder="이름을 입력하세요" maxLength={30} />
              </label>
              <div className="settings-actions">
                <button type="submit" className="settings-save">프로필 저장</button>
                {settingsMessage && <span role="status">{settingsMessage}</span>}
              </div>
            </form>

            <section className="settings-card">
              <div className="settings-card-heading"><div><h2>화면 및 알림</h2></div></div>
              <label className="settings-option">
                <span><strong>다크 모드</strong></span>
                <input type="checkbox" checked={settings.darkMode} onChange={(event) => changeSetting("darkMode", event.target.checked)} />
              </label>
              <label className="settings-option">
                <span><strong>할 일 알림</strong><small>할 일과 마감일 관련 알림을 사용해요.</small></span>
                <input type="checkbox" checked={settings.taskAlerts} onChange={(event) => changeSetting("taskAlerts", event.target.checked)} />
              </label>
            </section>

            <section className="settings-card account-card">
              <div className="settings-card-heading"><div><h2>계정</h2><p>현재 로그인한 계정</p></div></div>
              <p className="account-email">{user?.email || "이메일 정보가 없습니다."}</p>
              <button type="button" className="account-logout" onClick={handleLogout}>로그아웃</button>
            </section>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
