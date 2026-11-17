import { useState } from "react";
import { register } from "./api/registerApi.js";

function Register({ onRegisterSuccess, onGoToLogin }) {
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    async function handleRegister(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (password !== confirmPassword) {
        setError("비밀번호가 일치하지 않습니다.");
        return;
    }

    try {
        setLoading(true);

        const data = await register(email, name, password);

        setMessage(data.message || "회원가입이 완료되었습니다.");

        onRegisterSuccess(email);
    } catch (error) {
        setError(error.message);
    } finally {
        setLoading(false);
    }
}

return (
    <main className="login-page">
    <form className="login-form" onSubmit={handleRegister}>
        <h1>요약바다 회원가입</h1>

        <div className="login-field">
        <label htmlFor="register-email">이메일</label>
        <input
            id="register-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="이메일을 입력하세요"
            required
        />
        </div>

        <div className="login-field">
        <label htmlFor="register-name">이름</label>
        <input
            id="register-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="이름을 입력하세요"
            required
        />
        </div>

        <div className="login-field">
        <label htmlFor="register-password">비밀번호</label>
        <input
            id="register-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="비밀번호를 입력하세요"
            required
        />
        </div>

        <div className="login-field">
        <label htmlFor="confirm-password">비밀번호 확인</label>
        <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="비밀번호를 다시 입력하세요"
            required
        />
        </div>

        <button type="submit" disabled={loading}>
        {loading ? "가입 중..." : "회원가입"}
        </button>

        {error && <p className="error">{error}</p>}
        {message && <p>{message}</p>}

        <p>
        이미 계정이 있나요?{" "}
        <button type="button" onClick={onGoToLogin}>
            로그인
        </button>
        </p>
    </form>
    </main>
);
}

export default Register;