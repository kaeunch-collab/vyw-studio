# 비밀번호 로그인 + Functions Gemini 프록시 (API 키 은닉) 설계

날짜: 2026-07-03

## 목표
배포된 정적 사이트(vyw-studio.web.app)에서 **Gemini API 키를 브라우저에 노출하지 않고**,
공용 비밀번호 1개로 로그인한 사용자만 이미지 생성을 쓰게 한다. 키는 서버(Firebase Functions)
시크릿에만 두고, 프론트는 로그인 토큰으로 프록시를 호출한다.

## 아키텍처
```
브라우저(lookbook) ──password──► /api/login ──scrypt 검증──► HMAC 토큰(7일) 발급
      └── Bearer token ──► /api/gemini ──토큰검증──► Gemini(gemini-2.5-flash-image)
                                        (GEMINI_API_KEY = 서버 시크릿, 클라 노출 X)
```
- **Firebase Functions v2** (`functions/`, Node 22, 외부 의존성 없이 내장 `crypto`만).
- **Firebase Hosting rewrite**: `/api/**` → 함수 `api` (동일 출처 → CORS 불필요).
- **시크릿**(Secret Manager, Blaze 필요): `GEMINI_API_KEY`, `PASSWORD_HASH`, `TOKEN_SECRET`.
- 로컬 개발: `firebase emulators:start` + `functions/.secret.local`(dotenv)로 동일 동작.

## 엔드포인트 (함수 `api`, `/api/**` 수신)
- `POST /api/login` — body `{password}`.
  - `PASSWORD_HASH`(형식 `salt:hex`)와 scrypt 비교(timing-safe). 성공 시
    `{token, exp}` 반환. 실패 401.
- `POST /api/gemini` — header `Authorization: Bearer <token>`, body `{prompt, images?, aspect?}`.
  - 토큰 검증(HMAC+만료). `gemini-2.5-flash-image:generateContent` 호출
    (parts: text + inlineData 이미지들, `generationConfig.imageConfig.aspectRatio`).
  - 성공 시 `{b64}`(PNG base64) 반환. 토큰 무효/만료 401, 그 외 5xx + 에러문.

## 토큰
- payload `{exp: epochSec}` → `base64url(payload) + "." + base64url(HMAC_SHA256(payload, TOKEN_SECRET))`.
- 만료 7일. 검증: HMAC 재계산 timing-safe 비교 + exp 확인.

## 비밀번호 해시
- 내장 `crypto.scryptSync(password, salt, 32)` → `PASSWORD_HASH = saltHex + ":" + hashHex`.
- 생성 도우미: `functions/hash-password.js` (`node hash-password.js '내비번'` → 해시 출력).

## 프론트(lookbook.html) 변경
- Gemini 직접호출 제거: `geminiEdit(prompt, images, aspect)` → `POST /api/gemini`(Bearer 토큰) 후 b64 수신.
  `imagenGenerate`는 미사용(삭제).
- "API 설정(키)" 모달 → **"로그인(비밀번호)" 모달**. 성공 시 토큰을 `localStorage(vyw_token)`에 exp와 저장.
- `requireKey()` → `requireLogin()`(토큰 존재·미만료 확인, 없으면 로그인 모달). Google AI 단계에서만 필요.
- **무료(Pollinations)는 그대로 키·로그인 없이** 동작(변경 없음).
- 프록시가 401 반환 시 토큰 폐기 + 로그인 모달.

## 배포 동기화
- `dist/lookbook.html` 수정 → `vyw.html` 동기화(favicon·브랜드바이블 2곳 제외 규칙 유지).
- `firebase.json`에 `functions` + hosting `rewrites` 추가.
- 배포/시크릿 설정은 **Blaze 필요** — 사용자가 카드 등록 후: `firebase deploy`,
  `firebase functions:secrets:set ...`.

## 위협 모델 / 한계
- 키는 서버에만 → 브라우저/네트워크에서 추출 불가(핵심 목표 달성).
- 비밀번호는 공용 1개 → 아는 사람은 누구나 사용(의도된 범위). 무차별 대입 방지용
  간단한 rate-limit(로그인 실패 지연)만 고려.
- Pollinations 무료 경로는 인증 없이 사용 가능(키가 없으므로 노출 위험 없음).

## 범위 밖 (YAGNI)
- 다중 사용자 계정/역할, 비번 변경 UI, 리프레시 토큰, DB 세션.
