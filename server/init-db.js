import { db } from "./db.js";
import bcrypt from "bcryptjs";

// 테스트 사용자 비밀번호 해시 생성
const passwordHash = bcrypt.hashSync("1234", 10);

db.serialize(() => {
  // 외래 키 제약 조건 활성화
  db.run("PRAGMA foreign_keys = ON");

  // 기존 테이블 삭제
  db.run("DROP TABLE IF EXISTS tasks");
  db.run("DROP TABLE IF EXISTS summaries");
  db.run("DROP TABLE IF EXISTS documents");
  db.run("DROP TABLE IF EXISTS users");

  // 사용자 테이블 생성
  db.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 문서 테이블 생성
  db.run(`
    CREATE TABLE documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      type TEXT,
      source TEXT,
      content TEXT,
      dday INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 요약 테이블 생성
  db.run(`
    CREATE TABLE summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      summary_text TEXT NOT NULL,
      keywords TEXT,
      FOREIGN KEY (document_id) REFERENCES documents(id)
    )
  `);

  // 할 일 테이블 생성
  db.run(`
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      due_date TEXT,
      is_done INTEGER DEFAULT 0,
      FOREIGN KEY (document_id) REFERENCES documents(id)
    )
  `);

  // 사용자 데이터 등록
  db.run(
    `
      INSERT INTO users (id, email, name, password_hash)
      VALUES (?, ?, ?, ?)
    `,
    [1, "student@yoyakbada.com", "나르샤", passwordHash]
  );

  // 문서 데이터 등록
  db.run(`
  INSERT INTO documents (user_id, title, type, source, content, dday)
  VALUES
  (1, '현장체험학습 안내서.pdf', 'PDF', '교무부',
      '9월 18일 현장체험학습 안내', 1),
  (1, '여름방학 특강 신청 안내.docx', 'DOCX', '방과후학교부',
      '특강 신청 기간과 장소 안내', 3),
  (1, '건강검진 결과서 제출 안내.txt', 'TXT', '보건실',
      '건강검진 결과서 제출 안내', 6)
`);

  // 요약 데이터 등록
  db.run(`
    INSERT INTO summaries (document_id, summary_text, keywords)
    VALUES
      (1, '참가 동의서와 비용 납부 안내입니다.', '현장학습,동의서,납부'),
      (2, '특강 신청 기간과 준비물 안내입니다.', '특강,신청,방학'),
      (3, '건강검진 결과서 제출 안내입니다.', '건강검진,결과서,보건실')
  `);

  // 할 일 데이터 등록
  db.run(`
    INSERT INTO tasks (document_id, title, due_date, is_done)
    VALUES
      (1, '참가 동의서 제출', '2026-09-01', 0),
      (1, '체험학습 비용 납부', '2026-09-03', 1),
      (2, '특강 신청서 제출', '2026-09-03', 0),
      (3, '검진 결과서 보건실 제출', '2026-09-06', 0)
  `);
});

// 모든 쿼리가 끝난 뒤 DB 연결 종료
db.close((error) => {
  if (error) {
    console.error("DB 종료 중 오류 발생:", error.message);
  } else {
    console.log("RESTful API 실습 DB 준비 완료");
  }
});