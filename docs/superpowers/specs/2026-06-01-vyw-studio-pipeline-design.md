# VYW Studio — 연계형 룩북 생성 모듈 (설계)

- **날짜:** 2026-06-01 (개정 2026-06-02)
- **상태:** 설계 확정 (구현 계획 대기)
- **대체 대상:** 기존 올인원 `dist/lookbook.html` → 단일 Studio 모듈로 대체

---

## 1. 목표 / 배경

기존 `lookbook.html`은 모든 기능을 한 화면에 뒤섞은 올인원 생성기다. 이를 **하나의 Studio
모듈 안에서 연계적으로 흐르는 단계들**로 재구성한다. (별도 파일 4개로 흩어놓지 않는다.)

```
[ STUDIO 모듈 ]  1 옷 › 2 모델 › 3 착장 › 4 배경 › ★ 내 룩북
```

각 단계는 **집중된 한 화면**(몰아넣기 아님)이고, 한 앱 안에서 단계가 전환되며 앞 단계 결과가
자동으로 다음으로 이어진다. 결과 컷은 **개인별 룩북 폴더**에 저장한다.

### 성공 기준
- fragment 하나로 옷 → 모델 → 착장 → 배경을 단계대로 거치면 파일 이동 없이 VYW 톤의
  최종 룩북 컷이 나온다.
- 착장·배경 컷을 원하는 **룩북 폴더에 저장**(미선택 시 기본 폴더)하고, 룩북에서 모아 본다.
- 백엔드 없이 기존처럼 Firebase 정적 호스팅에 배포된다.

## 2. 비목표 (YAGNI / 이번 범위 밖)
- 서버 / DB / 계정·로그인 없음 — 전부 브라우저 로컬(IndexedDB).
- 클라우드 동기화·다기기 유지·사람 간 온라인 공유 없음 (공유는 export 다운로드로만).
- 룩북 **매거진 스프레드 자동 배치 / PDF export**는 이번 범위 밖 — 향후 확장(§8).
- Wardrobe(`public/`, `server.js`)는 변경 없음, 미배포 유지.

## 3. 아키텍처 / 기술

- **단일 모듈, 클라이언트 사이드.** 한 개의 앱(`dist/studio.html` + `dist/studio.js`)에서
  내부 뷰 전환으로 단계를 오간다. 브라우저에서 Gemini REST 직접 호출. **Firebase 정적 호스팅
  그대로 배포** (백엔드 없음).
- **뷰 전환:** 해시 라우팅(`#garment`, `#model`, `#tryon`, `#scene`, `#lookbook`) 또는
  단순 show/hide. 상단 진행 바가 단계 이동 UI.
- **엔진**
  - `imagen-4.0-generate-001:predict` — 텍스트→이미지 (옷 콜라주).
  - `gemini-2.5-flash-image-preview:generateContent` — 이미지(+이미지)→이미지
    (모델 정리, 착장 합성, 배경 합성). `inlineData`(base64)로 1~N장 입력.
- **API 키:** 기존 우선순위 재사용 — `window.ENV_API_KEY`(env.js) → `localStorage('vyw_gemini_api_key')`
  → 인앱 "API 설정" 모달.
- **데이터:** `config/concepts.json` → `dist/concepts.json` 복사 후 `fetch`.
- **상태/저장:** 전부 **IndexedDB**(§5).

## 4. 데이터 모델 (concepts.json)

`fragments`가 컨셉을 잠근다. 각 fragment:
`{ name, korean, mood, mood_prompt_en, allowed_genres[4], default_colors{main,sub} }`
- **afar** (먼 곳): sweet/casual lolita, yosanke, lovely_gyaru_toned · powder_pink/breath_white
- **elsewhere** (여기가 아닌 어딘가): sunakei, jirai_kei, dark_lolita, lovely_punk_toned · grey_purple/charcoal
- **faraway** (멀리 있는): classic_lolita, fairy_grunge, lovely_gyaru_vintage, country_lolita · cream/dusty_rose

genre는 `prompt_en`, color는 `hex`, `items`/`items_translation`은 아이템 선택지.

## 5. 상태 / 저장 (IndexedDB, 전부 로컬)

DB `vywStudio`, 두 영역:
- **작업 세션(working)** — 진행 중 단계 데이터:
  `{ fragment, garment{blob,genre,colors,items}, model{blob}, tryon{blob}, scene{blob} }`.
  단계 완료 시 자동 저장, 다음 단계 진입 시 자동 로드. "전체 초기화"로 리셋.
- **룩북(lookbooks)** — 개인별 영구 보관:
  - `folders: [{ id, name, createdAt }]` — 항상 **기본 폴더(default)** 1개 존재.
  - `looks: [{ id, folderId, blob, meta{fragment,genre,stage}, savedAt }]`.

**핸드오프 (C안: 자동 + 수동):** 각 단계는 이전 결과를 자동 로드(썸네일 표시)하되,
"다른 파일 업로드" 버튼으로 덮어쓸 수 있다.

## 6. 단계(뷰)

공통: 상단 진행 바, 각 결과는 미리보기 + **다운로드(PNG)** + 작업 세션 자동 저장.

### 6.1 옷 (`#garment`)
- fragment 선택(3택) → 그 fragment의 **허용 장르 4개만** 노출 → 색은 **default_colors(main/sub)
  기본 선택**, 변경 시 **그 fragment 톤에 맞는 색만** 노출(전체 39색 자유 ✗, 컨셉 잠금) →
  아이템 다중 선택(`items_translation`) → 생성.
- 프롬프트: `fragment.mood_prompt_en` + `genre.prompt_en` + 색 + 아이템 + 고정 스타일
  ("flat-lay coordinated outfit collage on clean white background, multiple garments and
  accessories arranged, 1990s Japanese fashion magazine editorial, analog film grain").
  옷_ref(블랙 고딕 / 화이트) 콜라주가 톤 레퍼런스.
- 엔진 `imagen-4.0-generate-001`. 출력: 흰 배경 코디 콜라주 → `garment`.

### 6.2 모델 (`#model`)
- 사진 업로드 + **선택적 AI 정리 버튼**(배경 정리 / 전신 프레임 / 조명·톤 VYW화).
  얼굴·정체성 유지, 주변·톤만 다듬음. 정리 안 하면 원본 그대로.
- 엔진(정리 시) `gemini-2.5-flash-image-preview`. 출력: 모델 베이스 → `model`.

### 6.3 착장 (`#tryon`)
- 모델(2)·옷(1) 자동 로드(각각 수동 교체 가능). "착장 생성"/"재생성".
- 엔진 `gemini-2.5-flash-image-preview`, **입력 2장**(model+garment) + 프롬프트
  ("dress the person in the provided outfit, preserve face and identity, realistic fit").
- 출력: 착장 모델 → `tryon`. **"룩북에 저장" 버튼**(§6.6).

### 6.4 배경 (`#scene`)
- 착장 모델(3) 자동 로드. 배경 소스 3택: ① 프롬프트, ② 배경 이미지 업로드,
  ③ **fragment 무드 프리셋**(기존 `dist/assets/mood-bg-*.jpg`). "합성 생성"/"재생성".
- 엔진 `gemini-2.5-flash-image-preview`(착장 모델 [+배경] + 프롬프트).
- 출력: 최종 룩북 컷 → `scene`. **"룩북에 저장" 버튼**(§6.6).

### 6.5 내 룩북 (`#lookbook`)
- **폴더 목록** + 기본 폴더(항상 존재). 폴더 만들기 / 이름변경 / 삭제.
- 폴더 클릭 → 그 안의 저장된 컷 **그리드(갤러리)**. 컷 개별 다운로드 / 삭제,
  **폴더 전체 export(이미지 일괄 다운로드)**.
- 방문자마다 자기 브라우저(IndexedDB)에 독립 보관.

### 6.6 "룩북에 저장" 동작 (착장·배경 공통)
- 버튼 누르면 **폴더 선택 드롭다운**(+ "새 폴더") 표시. 선택 안 하면 **기본 폴더**에 저장.
- `looks`에 `{folderId, blob, meta}` 추가. 토스트로 "○○ 룩북에 저장됨".

## 7. 기존 페이지/내비 변경
- `dist/lookbook.html` **제거** → Studio 모듈로 대체.
- `dist/index.html` 스튜디오 카드: "Lookbook Generator" → **"Studio" 진입 카드**(→ `studio.html`).
  "Brand Bible" 유지, Wardrobe(로컬 전용) 유지.
- 헤더 내비 "Lookbook" → "Studio"(`studio.html`). 모듈 헤더/푸터에 홈·브랜드바이블 링크.

## 8. 위험 / 향후
- `gemini-2.5-flash-image-preview`는 프리뷰 모델 — 호출부를 모듈 한 곳(`studio.js`)에 모아 대응.
- 정체성 보존(착장·합성)은 프롬프트 의존, 재생성으로 완화.
- IndexedDB 용량(룩북 누적 blob) — 폴더/컷 삭제로 관리.
- **향후 확장:** 룩북 매거진 스프레드 자동 배치 + PDF export, (필요 시) 계정+클라우드 동기화(Blaze).

## 9. 산출물 (파일)
- 신규: `dist/studio.html`(단일 모듈, 내부 뷰), `dist/studio.js`(상태·IndexedDB·Gemini 호출·뷰
  전환), `dist/studio.css`(brand.css 토큰 재사용, 스튜디오 전용 스타일), `dist/concepts.json`(복사).
- 수정: `dist/index.html`(카드·내비), `CLAUDE.md`(구조 갱신).
- 제거: `dist/lookbook.html`.
