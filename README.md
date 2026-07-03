# 스마트폰 과의존 예방 서비스 — Backend API

Express + TypeScript + Supabase + Google Gemini 기반 백엔드 서버

---

## 기능 목록

### 회원 인증 (Auth)
- Supabase Auth 기반 회원가입 · 로그인 · 로그아웃
- JWT 인증 미들웨어 — `/auth/signup`, `/auth/login` 외 모든 API에 자동 적용
- 회원가입 시 `public.users` 프로필 테이블 자동 생성 (DB 트리거)

### 감정 기록 (Emotion)
- 이모지 + 메모 형식의 감정 기록 저장
- 유저별 전체 감정 이력 조회 (최신순)

### 스마트폰 사용시간 (Usage)
- 앱별 사용시간(분) 저장
- 날짜별 총 사용시간 + 당일 감정 이력 통합 조회

### 우울 자가진단 — CES-D (CESD)
- 20문항 설문 응답 저장 및 자동 점수 계산
- 역채점 문항(4·8·12·16번) 서버 자동 처리
- 점수 등급 자동 분류: 정상 / 경증 우울 / 중증 우울
- 문항 목록 조회 API 제공
- 최근 결과 1건 조회

### AI 챗봇 (Chat)
- Google Gemini 1.5 Flash 기반 대화
- 이전 대화 이력(최근 20개) 컨텍스트 포함 → 멀티턴 대화 지원
- 대화 이력 전체 조회 (limit 파라미터 지원)

### 경각심 문구 알림 (Notice)
- 스마트폰 과의존 관련 경각심 문구 랜덤 조회
- 명언 11개 사전 등록 (저자 포함)

### 개인정보 수집 동의 (Consent)
- 데이터 수집 · 알림 수신 · 챗봇 옵트인 3가지 항목 동의 저장
- upsert 방식 — 재제출 시 덮어쓰기
- 동의 정보 조회

### 카드 노출 판단 (Status)
- CES-D 점수 기반 카드 노출 여부 자동 판단
  - `showCESDCard` : 최근 점수 ≥ 16
  - `showChatbotCard` : 점수 ≥ 16 + 챗봇 옵트인 + 닫은 지 7일 초과
- 챗봇 카드 닫기 API — 7일간 비노출 처리

---

## 초기 세팅

### 1. 필수 도구 확인

| 도구 | 버전 | 확인 명령어 |
|------|------|------------|
| Node.js | 18 이상 | `node -v` |
| npm | 9 이상 | `npm -v` |

### 2. 패키지 설치

```bash
npm install
```

설치되는 주요 패키지:

| 패키지 | 용도 |
|--------|------|
| `express` | 웹 서버 |
| `@supabase/supabase-js` | DB · Auth |
| `@google/generative-ai` | Gemini AI 챗봇 |
| `swagger-ui-express` / `swagger-jsdoc` | API 문서화 |
| `dotenv` | 환경변수 |
| `cors` | CORS 허용 |
| `typescript` / `ts-node` | TypeScript 실행 |

### 3. 환경변수 설정

프로젝트 루트의 `.env` 파일을 열어 아래 값을 채웁니다.

```env
PORT=3000
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
GEMINI_API_KEY=AIza...
```

**Supabase 키 확인 위치**
- Supabase Dashboard → 프로젝트 선택 → Settings → API
- `SUPABASE_URL` : Project URL
- `SUPABASE_SECRET_KEY` : `service_role` 키 (Secret)

**Gemini 키 발급**
- https://aistudio.google.com/app/apikey 에서 무료 발급

### 4. Supabase DB 테이블 생성

Supabase Dashboard → SQL Editor에서 아래 SQL을 순서대로 실행합니다.

```sql
-- users (프로필)
CREATE TABLE public.users (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  nickname   TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email) VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 감정 기록
CREATE TABLE emotion_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  emoji      TEXT NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_emotion_logs_user_id ON emotion_logs(user_id);

-- 사용시간
CREATE TABLE usage_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL,
  app_name         TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  logged_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_usage_logs_user_id   ON usage_logs(user_id);
CREATE INDEX idx_usage_logs_logged_at ON usage_logs(logged_at);

-- CES-D 문항
CREATE TABLE cesd_questions (
  no      INTEGER PRIMARY KEY,
  text    TEXT NOT NULL,
  reverse BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO cesd_questions (no, text, reverse) VALUES
  (1,  '평소에는 아무렇지도 않던 일들이 귀찮고 신경 쓰였다.',          FALSE),
  (2,  '먹고 싶지 않았다; 식욕이 없었다.',                            FALSE),
  (3,  '가족이나 친구가 도와주더라도 울적한 기분을 떨쳐버릴 수 없었다.', FALSE),
  (4,  '다른 사람들만큼 능력이 있다고 느꼈다.',                         TRUE),
  (5,  '무슨 일을 하든 정신을 집중하기가 힘들었다.',                    FALSE),
  (6,  '우울했다.',                                                   FALSE),
  (7,  '하는 일마다 힘들게 느껴졌다.',                                 FALSE),
  (8,  '앞일이 희망적으로 느껴졌다.',                                  TRUE),
  (9,  '내 인생은 실패작이라는 생각이 들었다.',                         FALSE),
  (10, '두려움을 느꼈다.',                                             FALSE),
  (11, '잠을 설쳤다 (잠을 잘 이루지 못했다).',                         FALSE),
  (12, '행복했다.',                                                   TRUE),
  (13, '평소보다 말을 적게 했다.',                                     FALSE),
  (14, '외로움을 느꼈다.',                                             FALSE),
  (15, '사람들이 불친절하다고 느꼈다.',                                FALSE),
  (16, '생활이 즐거웠다.',                                             TRUE),
  (17, '울었다.',                                                     FALSE),
  (18, '슬픔을 느꼈다.',                                              FALSE),
  (19, '사람들이 나를 싫어하는 것 같은 느낌이 들었다.',                FALSE),
  (20, '도무지 무슨 일이든 시작하기가 힘들었다.',                       FALSE);

-- CES-D 결과
CREATE TABLE cesd_results (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  answers    INTEGER[] NOT NULL,
  score      INTEGER NOT NULL,
  level      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cesd_results_user_id ON cesd_results(user_id);

-- 챗봇 대화 이력
CREATE TABLE chat_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('user', 'model')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_chat_history_user_id    ON chat_history(user_id);
CREATE INDEX idx_chat_history_created_at ON chat_history(created_at);

-- 경각심 문구
CREATE TABLE notices (
  id      SERIAL PRIMARY KEY,
  message TEXT NOT NULL,
  author  TEXT
);
INSERT INTO notices (message, author) VALUES
  ('스마트폰은 편리함을 주는 도구이지만, 과도하게 붙잡으면 우리 삶을 오히려 좁히는 족쇄가 될 수 있다.', NULL),
  ('스마트폰은 창문처럼 세상을 보여주지만, 창문만 바라보다 보면 정작 내 삶의 풍경을 놓치게 된다.', NULL),
  ('스마트폰은 때로는 등불이 되지만, 과하게 쓰면 눈부심 때문에 길을 잃게 한다.', NULL),
  ('우리는 도구를 만든다. 그리고 그 도구가 결국 우리를 만든다.', '마셜 맥루언'),
  ('현대인은 기계를 더 편리하게 만들지만, 그만큼 스스로는 불편해지고 있다.', '알베르트 아인슈타인'),
  ('기술은 훌륭한 종이 될 수 있지만, 끔찍한 주인이 될 수도 있다.', '크리스티안 루이스 랑게'),
  ('어떤 쾌락에 대한 생각이 당신의 상상력을 자극할 때, 특히 경계해야 하며, 거친 급류에 휩쓸리지 않도록 해야 한다.', '스토아 학파'),
  ('기술이 인간의 소통을 넘어서는 순간, 우리는 기계의 노예가 된다.', NULL),
  ('고개를 들면 더 넓은 세상이 보인다.', NULL),
  ('생각하는 대로 살지 않으면 사는 대로 생각하게 된다.', '폴 발레리'),
  ('지식의 발달은 인간을 행복하게 하지만, 기계에 대한 맹신은 인류의 가장 큰 재앙이 될 것이다.', '알베르트 아인슈타인');

-- 동의 정보
CREATE TABLE consents (
  user_id                    TEXT PRIMARY KEY,
  data_collection            BOOLEAN NOT NULL DEFAULT FALSE,
  notification               BOOLEAN NOT NULL DEFAULT FALSE,
  chatbot_optin              BOOLEAN NOT NULL DEFAULT FALSE,
  chatbot_card_dismissed_at  TIMESTAMPTZ DEFAULT NULL,
  updated_at                 TIMESTAMPTZ DEFAULT NOW()
);
```

### 5. 서버 실행

```bash
npm run dev
```

정상 실행 시 터미널에 아래 메시지가 출력됩니다.

```
Server listening on port 3000
Swagger docs: http://localhost:3000/api-docs
```

---

## 실행 명령어

```bash
npm run dev      # 개발 서버 (ts-node, 코드 변경 즉시 반영)
npm run build    # 프로덕션 빌드 → dist/ 생성
npm start        # 빌드 결과 실행
```

**Swagger UI:** http://localhost:3000/api-docs

---

## 환경변수 (.env)

| 키 | 설명 |
|----|------|
| `PORT` | 서버 포트 (기본 3000) |
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SECRET_KEY` | Supabase Service Role Key |
| `GEMINI_API_KEY` | Google Gemini API Key |

---

## 인증 방식

Supabase Auth 기반 JWT 인증입니다.  
로그인 후 발급된 `access_token`을 모든 요청 헤더에 포함합니다.

```
Authorization: Bearer <access_token>
```

| 경로 | 인증 필요 |
|------|:--------:|
| POST /api/auth/signup | ✗ |
| POST /api/auth/login | ✗ |
| 나머지 모든 /api/* | ✓ |

---

## 에러 코드

| HTTP | 의미 | 예시 상황 |
|------|------|-----------|
| `400` | Bad Request | 필수 파라미터 누락, 타입 오류 |
| `401` | Unauthorized | 토큰 없음·만료·유효하지 않음 |
| `404` | Not Found | 조회 결과 없음 |
| `500` | Internal Server Error | Supabase / Gemini API 오류 |

```json
{ "error": "에러 메시지" }
```

---

## 전체 엔드포인트

### Auth `/api/auth`

| Method | 경로 | 인증 | 설명 |
|--------|------|:----:|------|
| POST | `/api/auth/signup` | ✗ | 회원가입 |
| POST | `/api/auth/login` | ✗ | 로그인 |
| POST | `/api/auth/logout` | ✓ | 로그아웃 |

#### POST /api/auth/signup
```json
// Request
{ "email": "user@example.com", "password": "password123" }

// Response 201
{ "message": "회원가입 성공", "user_id": "uuid-..." }
```

#### POST /api/auth/login
```json
// Request
{ "email": "user@example.com", "password": "password123" }

// Response 200
{ "access_token": "eyJ...", "user_id": "uuid-..." }
```

#### POST /api/auth/logout
```
Authorization: Bearer <access_token>

// Response 200
{ "message": "로그아웃 완료" }
```

---

### Emotion `/api/emotion`

| Method | 경로 | 설명 |
|--------|------|------|
| POST | `/api/emotion/log` | 이모지 감정기록 저장 |
| GET | `/api/emotion/history` | 감정 이력 전체 조회 |

#### POST /api/emotion/log
```json
// Request
{ "user_id": "user123", "emoji": "😊", "note": "오늘 기분 좋음" }

// Response 201
{
  "message": "감정 기록 저장 완료",
  "data": { "id": "uuid", "user_id": "user123", "emoji": "😊", "note": "오늘 기분 좋음", "created_at": "..." }
}
```

#### GET /api/emotion/history?user_id=user123
```json
// Response 200
{ "data": [{ "id": "uuid", "emoji": "😊", "note": "오늘 기분 좋음", "created_at": "..." }] }
```

---

### Usage `/api/usage`

| Method | 경로 | 설명 |
|--------|------|------|
| POST | `/api/usage/log` | 스마트폰 사용시간 저장 |
| GET | `/api/usage/summary` | 사용시간 + 감정 통합 조회 |

#### POST /api/usage/log
```json
// Request
{ "user_id": "user123", "app_name": "YouTube", "duration_minutes": 45, "logged_at": "2026-07-02T14:00:00.000Z" }

// Response 201
{ "message": "사용시간 저장 완료", "data": { ... } }
```

#### GET /api/usage/summary?user_id=user123&date=2026-07-02
> `date` 생략 시 오늘 기준 (형식: `YYYY-MM-DD`)

```json
// Response 200
{
  "data": {
    "date": "2026-07-02",
    "total_usage_minutes": 120,
    "usage_logs": [{ "app_name": "YouTube", "duration_minutes": 45, "logged_at": "..." }],
    "emotion_logs": [{ "emoji": "😊", "note": "기분 좋음", "created_at": "..." }]
  }
}
```

---

### CES-D `/api/cesd`

| Method | 경로 | 설명 |
|--------|------|------|
| GET | `/api/cesd/questions` | 20문항 목록 조회 |
| POST | `/api/cesd/submit` | 설문 제출 + 점수 계산 |
| GET | `/api/cesd/result` | 최근 결과 조회 |

**점수 등급**

| 점수 | 등급 |
|------|------|
| 0 ~ 15 | 정상 |
| 16 ~ 24 | 경증 우울 |
| 25 ~ 60 | 중증 우울 |

> 4·8·12·16번 문항은 역채점 (서버 자동 처리, DB에는 원본 저장)

#### GET /api/cesd/questions
```json
// Response 200
{ "data": [{ "no": 1, "text": "평소에는 아무렇지도 않던 일들이 귀찮고 신경 쓰였다.", "reverse": false }] }
```

#### POST /api/cesd/submit
```json
// Request (0~3 정수 20개 배열)
{ "user_id": "user123", "answers": [1,0,2,3,1,2,0,3,1,0,2,3,0,1,2,3,1,2,0,1] }

// Response 201
{ "message": "CES-D 제출 완료", "data": { "score": 22, "level": "경증 우울", "created_at": "..." } }
```

#### GET /api/cesd/result?user_id=user123
```json
// Response 200
{ "data": { "score": 22, "level": "경증 우울", "created_at": "..." } }
```

---

### Chat `/api/chat`

| Method | 경로 | 설명 |
|--------|------|------|
| POST | `/api/chat/message` | AI 챗봇 메시지 전송 |
| GET | `/api/chat/history` | 대화 이력 조회 |

> Google Gemini 1.5 Flash 사용. 이전 대화 이력(최근 20개)을 컨텍스트로 포함한 멀티턴 대화 지원.

#### POST /api/chat/message
```json
// Request
{ "user_id": "user123", "message": "오늘 기분이 너무 우울해" }

// Response 200
{ "reply": "많이 힘드시겠어요. 어떤 일이 있으셨나요?" }
```

#### GET /api/chat/history?user_id=user123&limit=50
> `limit` 기본값: 50

```json
// Response 200
{
  "data": [
    { "role": "user",  "content": "오늘 기분이 너무 우울해", "created_at": "..." },
    { "role": "model", "content": "많이 힘드시겠어요...",    "created_at": "..." }
  ]
}
```

---

### Notice `/api/notice`

| Method | 경로 | 설명 |
|--------|------|------|
| GET | `/api/notice/random` | 경각심 문구 랜덤 조회 |

#### GET /api/notice/random
```json
// Response 200
{ "data": { "id": 4, "message": "우리는 도구를 만든다. 그리고 그 도구가 결국 우리를 만든다.", "author": "마셜 맥루언" } }
```

> `author` 없는 문구는 `null` 반환

---

### Consent `/api/consent`

| Method | 경로 | 설명 |
|--------|------|------|
| POST | `/api/consent` | 동의 여부 저장 (upsert) |
| GET | `/api/consent` | 동의 여부 조회 |

#### POST /api/consent
```json
// Request
{ "user_id": "user123", "data_collection": true, "notification": true, "chatbot_optin": false }

// Response 200
{ "message": "동의 정보 저장 완료", "data": { "user_id": "user123", "data_collection": true, "notification": true, "chatbot_optin": false, "updated_at": "..." } }
```

#### GET /api/consent?user_id=user123
```json
// Response 200
{ "data": { "user_id": "user123", "data_collection": true, "notification": true, "chatbot_optin": false, "updated_at": "..." } }
```

---

### Status `/api/status`

| Method | 경로 | 설명 |
|--------|------|------|
| GET | `/api/status/cards` | 카드 노출 여부 판단 |
| POST | `/api/status/cards/dismiss` | 챗봇 카드 닫기 (7일간 비노출) |

**카드 노출 조건**

| 카드 | 조건 |
|------|------|
| `showCESDCard` | CES-D 최근 점수 ≥ 16 |
| `showChatbotCard` | CES-D 점수 ≥ 16 AND `chatbot_optin = true` AND 닫은 지 7일 초과 |

#### GET /api/status/cards?user_id=user123
```json
// Response 200
{ "showCESDCard": true, "showChatbotCard": false }
```

#### POST /api/status/cards/dismiss
```json
// Request
{ "user_id": "user123" }

// Response 200
{ "message": "챗봇 카드가 7일간 숨겨집니다." }
```

---

## Supabase 테이블

| 테이블 | 용도 |
|--------|------|
| `auth.users` | Supabase 자동 생성 (회원 인증 정보) |
| `public.users` | 프로필 확장 테이블 (회원가입 시 트리거로 자동 생성) |
| `emotion_logs` | 이모지 감정기록 |
| `usage_logs` | 앱별 사용시간 |
| `cesd_questions` | CES-D 20문항 고정 데이터 |
| `cesd_results` | CES-D 응답 및 점수 |
| `chat_history` | AI 챗봇 대화 이력 |
| `notices` | 경각심 문구 |
| `consents` | 개인정보 수집 동의 + 챗봇 카드 dismiss 시각 |

---

## 프로젝트 구조

```
src/
├── index.ts                  # 서버 진입점, 인증 미들웨어 전역 적용
├── swagger.ts                # OpenAPI 3.0 명세
├── routes/
│   ├── index.ts
│   ├── auth.ts
│   ├── emotion.ts
│   ├── usage.ts
│   ├── cesd.ts
│   ├── chat.ts
│   ├── notice.ts
│   ├── consent.ts
│   └── status.ts
├── controllers/
│   ├── authController.ts
│   ├── emotionController.ts
│   ├── usageController.ts
│   ├── cesdController.ts
│   ├── chatController.ts
│   ├── noticeController.ts
│   ├── consentController.ts
│   └── statusController.ts
├── services/
│   ├── supabase.ts           # Supabase 클라이언트
│   ├── authService.ts
│   ├── emotionService.ts
│   ├── usageService.ts
│   ├── cesdService.ts
│   ├── chatService.ts
│   ├── noticeService.ts
│   ├── consentService.ts
│   └── statusService.ts
├── middlewares/
│   ├── authMiddleware.ts     # JWT 검증 (signup·login 제외)
│   └── errorHandler.ts
└── types/
    └── express.d.ts          # req.user 타입 확장
```