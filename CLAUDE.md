# VYW Studio — Project Guide

VYW(비비)의 브랜드 홈페이지 + AI 룩북 생성기. 일본 빈티지 서브컬처 룩북 프로젝트
"Beyond the fragment / 위태로운 연약함".

**Live:** https://vyw-studio.web.app
**Firebase project:** `vyw-studio` · console: https://console.firebase.google.com/project/vyw-studio/overview

---

## 구조

```
vyw-studio/
├── dist/                  ← Firebase Hosting 배포 폴더 (이것만 공개됨)
│   ├── index.html         ← 랜딩 / 브랜드 아이덴티티 페이지
│   ├── lookbook.html      ← Gemini 룩북 생성기 (= 원본 vyw.html 복사본 + 네비 링크)
│   ├── brand-bible.html   ← 브랜드 바이블 (= VYW_Brand_Bible.html 복사본 + 네비 링크)
│   ├── brand.css          ← 디자인 시스템 (랜딩 페이지 스타일)
│   ├── env.js             ← Gemini API 키 (git-ignored, 현재 placeholder)
│   ├── env.example.js     ← env.js 템플릿 + 키 노출 경고
│   └── assets/            ← 웹 최적화 브랜드 이미지 (CSS/ 원본을 sips로 리사이즈)
│       ├── logo-white|pink|purple.png  ← 워드마크 "W"+스파클 로고 (760px, 투명)
│       ├── favicon.png                 ← 핑크 로고 160px
│       ├── main-mood.jpg               ← 히어로 아래 뮤즈 키비주얼
│       ├── mood1~4.jpg                  ← 무드 화보 (mood2=룩북카드, mood4=바이블카드)
│       ├── mood-bg-1~3.jpg             ← 배경 텍스처 (mood-bg-3=.cosmic-bg 네뷸라)
│       ├── icon-cloth|model|bg.png     ← 룩북 "세 개의 문" 카드 네온 아이콘 (512px, 투명)
│       └── fonts/Hahmlet-SemiBold.woff2 ← 제목용 명조 세리프 (woff2)
├── firebase.json          ← hosting 설정 (public=dist, cleanUrls=true)
├── .firebaserc            ← default project = vyw-studio
│
├── vyw.html               ← 원본 (dist/lookbook.html의 소스)
├── VYW_Brand_Bible.html   ← 원본 (dist/brand-bible.html의 소스)
├── server.js              ← Express 백엔드 (Wardrobe 도구 — 로컬 전용, 미배포)
├── public/                ← Wardrobe v0.3 프론트 (pollinations, 백엔드 필요)
├── config/concepts.json   ← Wardrobe 설정 데이터
├── images/                ← Wardrobe 생성물 (git-ignored)
└── CSS/                   ← (이름과 달리) 브랜드 이미지 원본 마스터. 고해상도 PNG.
    ├── Palette.png  logo/  mood/  mood_bg/  font/(Hahmlet otf)
    └── 아이콘/             ← "세 개의 문" 카드용 네온 아이콘 원본 (옷 생성·모델 착장·배경 삽입.png)
```

> 📦 **에셋 파이프라인:** `CSS/`(원본 마스터, 수 MB~16MB) → macOS `sips`로 리사이즈/압축 →
> `dist/assets/`(웹 사이즈, 로고는 투명 PNG 760px / 사진은 JPEG q80-82, 최대 1800px).
> 새 화보 추가 시 같은 방식으로 변환 후 배포. webp 도구(cwebp/magick)는 미설치.

> ⚠️ `dist/`는 원본(`vyw.html`, `VYW_Brand_Bible.html`)의 **복사본**이다. 원본을 고쳤으면
> `cp vyw.html dist/lookbook.html` 후 dist 전용 요소를 다시 넣고 재배포해야 한다.
> (lookbook 소스↔배포 차이는 정확히 ① `<link rel=icon favicon>` ② 헤더 브랜드바이블 링크
> — 이 **2곳뿐**. 헤더 로고는 `assets/logo-pink.png` → `#home` 내부 링크라 양쪽 동일.
> brand-bible은 cover-bottom에 홈/룩북 링크가 추가돼 있음.)
> 단, lookbook은 헤더 로고·홈 히어로(`assets/logo-white.png`, `main-mood.jpg`)가 본문에
> `assets/` 경로로 박혀 있어 **dist 컨텍스트에서만 렌더**된다. 소스 `vyw.html`을 루트에서
> 직접 열면 이 이미지들은 깨진다(배포 소스 용도).

---

## 세 개의 페이지

1. **랜딩 (`index.html`)** — 다크 코스믹 무드. "Beyond the fragment" 히어로, 3-shard 로고(Figma
   3-vector 마크 근사치), 5색 팔레트, 룩북·바이블 진입 카드. `brand.css`로 스타일링.
2. **Lookbook Studio (`lookbook.html`)** — 브라우저에서 직접 Gemini 호출하는 단일 파일 SPA.
   해시 라우터로 4개 뷰(`#home`/`#cloth`/`#model`/`#bg`) 전환. ("파이프라인"이라 부르지 않음 —
   실제 웹사이트처럼 연출.) 세 단계 생성 흐름:
   - **`#home`**: 가장 먼저 보이는 화면 = `main-mood.jpg` 풀블리드 히어로 위 `logo-white.png` +
     "Beyond the fragment" + "스튜디오 들어가기" 버튼(클릭 시 `#enter` 카드 섹션으로 스크롤).
     아래 "세 개의 문" 3개 진입 카드(`icon-cloth|model|bg.png` 네온 아이콘) + 브랜드 규격 보드.
   - **① 옷 생성** (`#cloth`): Fragment 주제 + 장르 선택 → (무료)Pollinations flux / (Google AI)
     `gemini-2.5-flash-image` 텍스트→이미지로 흰 배경 플랫레이 콜라주(옷_ref 스타일, 모델 없음)
     생성, 카드로 누적. ※ Imagen 4.0은 무료 키로 접근 불가(유료 전용 400)라 옷 생성도 모델·배경과
     같은 `gemini-2.5-flash-image`로 통일함(`imagenGenerate`는 미사용). Fragment·장르 데이터는
     `config/concepts.json`(fragments 3종 + genres 12종)을 lookbook의 `fragments`/`genres`
     객체에 임베드(dist에서 concepts.json을 직접 못 읽으므로 하드코딩).
     - Fragment 3종: 01 Afar/먼 곳, 02 Elsewhere/여기가 아닌 어딘가, 03 Faraway/멀리 있는.
       각자 mood·palette를 생성 프롬프트에 주입. (brand-bible.html 본문은 아직 Afar만 상세 기술.)
     - **Fragment→장르 연동:** Fragment 선택 시 그 Fragment의 `allowed_genres`(각 4종)만 노출.
     - **Fragment 무드 비주얼:** 선택 시 레퍼런스 무드 사진(Afar=mood2, Elsewhere=mood3,
       Faraway=mood4)에 팔레트 틴트 + 컬러 점 + 키워드 칩을 얹어 분위기를 보여줌
       (`renderFragmentMood()`). 단순 텍스트만으로 톤을 알기 어려운 문제 해결용.
     - **생성 엔진 토글(`state.engine`, 3단계 공통):** 🆓 **무료(Pollinations/flux)** = API 키 불필요,
       기본값(`pollinationsGenerate()`, 브라우저에서 직접 fetch→base64, CORS 허용). ✨ **Google AI** =
       Gemini/Imagen 키 필요. 토글 UI는 `.engine-selectors`/`.engine-note` 클래스로 세 단계에 공통
       렌더(`renderEngineSelectors()`). Pollinations 무료 티어는 IP당 동시 1건 제한이라 혼잡 시 402 →
       백오프 재시도. **엔진 기본값은 키 유무로 자동 결정**: 키 있으면 Gemini(연속성), 없으면 무료
       (`initApiKey` + `userPickedEngine` 플래그 — 사용자가 토글을 누르면 자동 전환 중단).
   - **② 모델 착장** (`#model`): 옷 카드 선택 + 모델 사진 업로드(선택) + 포즈. **Google AI** =
     `gemini-2.5-flash-image:generateContent`(정식 모델, `-preview`는 deprecated) 이미지→이미지로
     **생성한 옷 콜라주를 그대로 입힘**(+모델사진 반영). **무료** = 장르·Fragment를 텍스트로 새로
     생성(`buildDressPromptText()`, 옷·인물 정합 미보장).
   - **③ 배경 삽입** (`#bg`): 기본 스튜디오 배경/업로드(선택). **Google AI** = Gemini로 **착장 컷의
     인물·옷·포즈를 그대로 두고 배경만 교체**. **무료** = 전체 컷 재생성(`buildFinalPromptText()`).
   - **종횡비:** 전 단계 세로 3:4 고정 — 무료 768×1024, Gemini는 `generationConfig.imageConfig.aspectRatio:"3:4"`
     (미지정 시 1:1로 나와 비율 깨짐). 프롬프트도 "full-length head-to-toe 3:4"로 전신·비율 강제.
   - ⚠️ 키 없는 *진짜* 이미지→이미지는 불가(Pollinations 편집 모델 `kontext`는 유료 전용, 무료는
     `sana` text→image만). **무료 모드는 단계마다 새로 생성돼 옷·모델이 달라짐(연속성은 Gemini 전용).**
   - 단계 간 생성 이미지는 JS 메모리(`state`)로 전달. 설계: `docs/superpowers/specs/2026-06-15-lookbook-3step-pipeline-design.md`.
   - 키 우선순위: `window.ENV_API_KEY`(env.js) → localStorage → 인앱 "API 설정" 모달
   - **폰트:** 본문/UI = Pretendard, **제목(모든 헤딩) = Hahmlet SemiBold(명조 세리프, 한글+라틴)**.
     원본 `.otf`는 루트 `font/`에 보관, 웹용은 fonttools로 woff2 변환해 `dist/assets/fonts/Hahmlet-SemiBold.woff2`
     (277KB)로 자체 호스팅 → `@font-face`. Tailwind `serif`/`playfair` 토큰이 Hahmlet을 가리킴.
3. **Brand Bible (`brand-bible.html`)** — **다크 코스믹**(2026-07 룩북과 동일 디자인 시스템으로
   전면 리디자인: Tailwind + Hahmlet 제목 + `.cosmic-bg`/`.vyw-stars` + `magazine-card` 패널 +
   커버 히어로 + 스티키 목차). 코어/세계관/팔레트/뮤즈/장르/원칙(+연출 규격)/룩북 운영/운영 +
   Fragment 01 「Afar」 + AI 프롬프트 가이드. 원본 `VYW_Brand_Bible.html`은 `dist/brand-bible.html`와
   **완전 동일 복사본**(리디자인으로 이전의 favicon·커버링크 diff는 사라짐 → `cp`만 하면 됨).

Wardrobe(`public/`, `server.js`)는 Express 백엔드가 필요해 **정적 호스팅에 미배포**. 로컬에서
`npm start` 후 http://localhost:3000.

---

## 브랜드 팔레트 (brand.css 토큰)

| 색 | HEX | 의미 |
|---|---|---|
| 파우더 핑크 `--pink` | `#EAC6D5` | 메인, 일상적 따뜻함 |
| 글래스 라일락 `--glass` | `#D4CCDD` | 파편의 빛, 유리 너머 |
| 차가운 라일락 `--cool` | `#9B8FB0` | 공기의 색, 아련함의 핵심 |
| 딥 라일락 `--deep` | `#4A3F5C` | 그림자, 포인트 어둠 |
| 회보라 `--dawn` | `#5D5573` | 텍스트/로고 |
| 입김 화이트 `--white` | `#F3ECEE` | 여백, 피부, 빛 |
| 흐르는 크롬 `--chrome` | `#C1C1CD` | 액체 금속, 브랜드 서명 |

폰트: Pretendard(본문/UI), **Hahmlet SemiBold**(디스플레이/워드마크/제목 — 명조 세리프,
한글+라틴 지원), JetBrains Mono(라벨). `--ff-display: 'Hahmlet', 'Pretendard Variable', …serif`.
**세 페이지(랜딩·룩북·바이블) 제목 폰트가 Hahmlet으로 통일됨**(2026-07). `brand.css`에도 Hahmlet
`@font-face`(`assets/fonts/Hahmlet-SemiBold.woff2`) 추가, 히어로·뮤즈 제목 italic 해제.
> 히스토리: Figma 태그라인 `Oriya MN`(macOS 전용) → Playfair Display → `Telugu MN` → **Mulish**
> (산세리프, 랜딩 전용)로 갔다가, 2026-07 룩북 제목 폰트 **Hahmlet**(명조)으로 전 페이지 일원화.

---

## 배포 (deploy)

```bash
cd ~/Documents/vyw-studio
firebase deploy --only hosting        # .firebaserc 덕에 --project 불필요
```

### firebase CLI 환경 메모
- CLI는 `~/.npm-global/bin/firebase` (v15.19.0). sudo 글로벌 설치가 npm prefix
  `~/.npm-global`로 들어감 (`/usr/local/bin`에는 없음).
- `~/.local/bin/firebase` 심볼릭 링크 + `~/.zshenv`에 PATH 추가로 `firebase` 명령 사용 가능.
- 로그인 계정: Firebase 콘솔 소유자 계정(개인 Google 계정).
- 함정: `firebase use --add`는 **기존** 프로젝트 선택용. 프로젝트가 없으면
  "No selectable choices" 에러 → `firebase projects:create <id>`로 먼저 생성할 것.

---

## 🔐 인증 + Gemini 키 은닉 (Functions 프록시)

> 무료 엔진(Pollinations)은 키·로그인 없이 동작. 아래는 **Google AI(Gemini)** 엔진 전용.
> ⚠️ Gemini 이미지 생성은 결제(Google Cloud Paid Tier 1) 필요(무료 할당량 0).

**구조(2026-07 도입):** 브라우저가 Gemini를 직접 호출하지 않는다. 대신:
- `functions/`(Firebase Functions v2, Node 22, 내장 crypto만) = `POST /api/login`(scrypt 비번 검증
  → HMAC 토큰 7일) + `POST /api/gemini`(Bearer 토큰 검증 → 서버 시크릿 키로 Gemini 호출).
- `firebase.json`: hosting `rewrites` `/api/** → function api`(동일 출처).
- 프론트(`lookbook.html`): "로그인" 모달(비번) → 토큰을 `localStorage(vyw_auth)`에 저장 →
  `geminiEdit()`가 `/api/gemini` 호출. **키는 서버 시크릿에만, 브라우저에 절대 안 나감.**
  설계: `docs/superpowers/specs/2026-07-03-functions-auth-proxy-design.md`.
- 시크릿 3개: `GEMINI_API_KEY`, `PASSWORD_HASH`(=`saltHex:hashHex`, scrypt), `TOKEN_SECRET`.

**셋업/배포 (Blaze 필요):**
```bash
# 1) 비밀번호 해시 생성 → 출력값 복사
node functions/hash-password.js '원하는_비밀번호'
# 2) 시크릿 등록 (프롬프트에 값 붙여넣기)
firebase functions:secrets:set GEMINI_API_KEY     # Gemini 키
firebase functions:secrets:set PASSWORD_HASH      # 위 해시값
firebase functions:secrets:set TOKEN_SECRET       # 랜덤: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 3) 배포 (hosting + functions)
firebase deploy
```
**로컬 테스트:** `functions/.secret.local`(dotenv: 위 3개 KEY=값) 작성 → `cd functions && npm install`
→ 루트에서 `firebase emulators:start` (hosting+functions 로컬). `file://`로 직접 열면 `/api/*` 없어 로그인 불가.

- `dist/env.js`(옛 클라이언트 키 placeholder)는 이제 미사용(무해하게 남겨둠).

---

## TODO / 다음 작업 후보
- [x] 실제 브랜드 이미지를 `dist/assets/`에 넣고 `.cosmic-bg`를 실제 네뷸라 화보로 교체
      (2026-06, `CSS/` 원본 → sips 최적화)
- [x] 실제 로고로 교체 (3-shard 근사치 → `logo-white.png` 워드마크 "W"+스파클).
      히어로 + 파비콘(3페이지 전부) 적용. 랜딩에 뮤즈 키비주얼 + 카드 무드 배경 추가.
- [ ] 커스텀 도메인 연결 (Firebase Hosting → custom domain)
- [x] `lookbook.html`에 실제 로고/무드 적용 (2026-06, 헤더 logo-pink + 홈 히어로 main-mood/logo-white).
      `brand-bible.html`은 아직 미적용.
- [ ] (선택) `mood-bg-2.jpg`(597KB)가 가장 큼 — 더 줄이거나 webp 도입 검토
