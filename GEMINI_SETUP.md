# 요약바다 Gemini 적용본

## 포함된 변경

- 서버 전용 `.env` 설정과 Gemini 호출 모듈 추가
- 파일, 링크, 직접 입력 분석을 Gemini 분석으로 연결
- 요약·키워드·할 일 결과 미리보기와 analysisId 기반 저장 구현
- 문서, 요약, 할 일을 SQLite 트랜잭션으로 저장
- 기존 쉼표 구분 키워드와 새 JSON 키워드 모두 읽도록 호환
- 실행 및 Gemini 연결 확인 스크립트 추가

## 최초 실행

1. 압축을 푼 프로젝트 폴더에서 의존성을 설치합니다.

   ```sh
   npm ci
   npm --prefix server ci
   ```

2. 서버 환경 파일을 만듭니다.

   ```sh
   cp server/.env.example server/.env
   ```

3. `server/.env`를 열어 `GEMINI_API_KEY`에 본인의 키를 넣습니다. API 키는 서버에서만 사용합니다. 필요하면 `GEMINI_MODEL`도 Google AI Studio에서 이용 가능한 모델명으로 설정합니다.

4. 서버와 화면을 각각 터미널에서 실행합니다.

   ```sh
   npm run server:dev
   ```

   ```sh
   npm run dev
   ```

5. 실제 Gemini API 연결을 한 번 확인할 때 실행합니다.

   ```sh
   npm run ai:check
   ```

화면 주소는 `http://localhost:5173`, API 주소는 `http://localhost:4000`입니다.

## 중요

- `server/.env`는 개인 키를 넣는 파일이라 압축본에 포함하지 않았습니다. `.env.example`을 복사해 직접 만드세요.
- 기존 데이터베이스를 보존하기 위해 `npm run server:init`은 실행하지 마세요. 이 명령은 기존 테이블을 삭제하고 데모 데이터를 다시 만듭니다.
- 기본 요약 길이는 3줄입니다. 사용자별 설정 테이블은 기존 DB를 초기화하지 않고 서버 시작 때 생성됩니다.
- Gemini API 연결은 개인 API 키와 Google 측 모델 권한·사용 한도에 따라 달라집니다.
