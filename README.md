# VYW Studio

> **Beyond the fragment** · 위태로운 연약함
> VYW(비비) 브랜드 홈페이지 + AI 룩북 생성기 — 일본 빈티지 서브컬처 룩북 프로젝트.

🔗 **Live:** https://vyw-studio.web.app

---

## 페이지 구성

| 페이지 | 설명 |
|---|---|
| **랜딩** (`dist/index.html`) | 다크 코스믹 무드의 브랜드 아이덴티티 · 팔레트 · 진입 카드 |
| **Lookbook Studio** (`dist/lookbook.html`) | 브라우저에서 Gemini/Pollinations로 3단계(옷 생성 → 모델 착장 → 배경 삽입) 룩북 생성 |
| **Brand Bible** (`dist/brand-bible.html`) | 코어·세계관·팔레트·뮤즈·장르·원칙·연출 규격 등 브랜드 문서 |

## 기술 스택

- 정적 사이트 (Firebase Hosting, `dist/`) — Tailwind(CDN) · Pretendard · Hahmlet(제목)
- AI 엔진: **무료** Pollinations(flux, 키 불필요) / **Google AI** Gemini `gemini-2.5-flash-image`
- 인증 프록시: Firebase Functions v2 (`functions/`) — 공용 비밀번호 로그인 → HMAC 토큰 → 서버 시크릿으로 Gemini 호출 (**API 키는 브라우저에 노출되지 않음**)

## 로컬 실행

```bash
# 정적 사이트 + Functions 에뮬레이터
firebase emulators:start        # http://localhost:5000

# Wardrobe 로컬 도구(별도, 미배포)
npm install && npm start        # http://localhost:3000
```

## 배포

```bash
firebase deploy --only hosting          # 사이트만
firebase deploy                         # 사이트 + Functions
```

## 🔐 시크릿 (리포지토리에 없음)

민감 정보는 **git에 커밋되지 않습니다**. 아래는 로컬/서버에만 존재:

- `.env`, `dist/env.js`, `functions/.secret.local` — **git-ignored** (템플릿: `.env.example`, `dist/env.example.js`)
- Gemini 키 · 비밀번호 해시(scrypt) · 토큰 시크릿 — **Google Secret Manager**(서버 전용)

설정 방법은 [`CLAUDE.md`](./CLAUDE.md)의 "인증 + Gemini 키 은닉" 섹션 참고.

## 브랜드 팔레트

| 색 | HEX |
|---|---|
| 파우더 핑크 | `#EAC6D5` |
| 글래스 라일락 | `#D4CCDD` |
| 차가운 라일락 | `#9B8FB0` |
| 딥 라일락 | `#4A3F5C` |
| 입김 화이트 | `#F3ECEE` |

---

프로젝트 상세 구조·에셋 파이프라인·배포 메모는 [`CLAUDE.md`](./CLAUDE.md)에 정리되어 있습니다.
