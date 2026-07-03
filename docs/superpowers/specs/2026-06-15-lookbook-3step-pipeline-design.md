# lookbook.html — 3단계 룩북 파이프라인 설계

날짜: 2026-06-15
대상 파일: `vyw.html`(소스) → `dist/lookbook.html`(배포)

## 목표

기존 단일 페이지 프롬프트 빌더/생성기를 **옷 생성 → 모델 착장 → 배경 삽입**의 3단계
파이프라인으로 재구성한다. 진입은 3카드 랜딩(모듈_ref 레이아웃)이며 카드를 누르면
각 단계 화면으로 이동한다. 단계 간 생성 이미지는 메모리로 전달한다.

## 아키텍처

- **단일 파일 SPA**: 한 HTML 안에 4개 뷰(`home`/`cloth`/`model`/`bg`)를 두고 JS 해시
  라우터로 전환. 한 번에 한 뷰만 표시(`hidden`). URL은 `#home`/`#cloth`/`#model`/`#bg`로
  직접 접근 가능.
- **전역 상태(메모리)**:
  ```js
  state = {
    fragment,                              // 'afar'
    genre,                                 // 'lolita' | 'jirai' | 'yosanke' | 'gyaru' | 'punk'
    clothes: [{id, dataUrl, genreKey, genreLabel}],  // 생성된 콜라주 카드
    selectedClothId,
    modelRefDataUrl,                       // 업로드 모델 사진(선택)
    poseDesc,
    dressedDataUrl,                        // 착장 결과
    bgChoice,                              // 'default'|'indoor'|'studio'|'upload'
    bgRefDataUrl,                          // 업로드 배경(선택)
    finalDataUrl                           // 최종 합성
  }
  ```
- **기존 인프라 재사용**: API 키 관리(env.js→localStorage→모달), `fetchWithBackoff`,
  Gemini 호출, 토스트, 드롭존, 다운로드, 브랜드 마스터 프롬프트 상수.

## 뷰별 사양

### `#home` — 3카드 랜딩
`index.html` 카드 톤을 차용한 가로 3카드(①옷 생성 ②모델 착장 ③배경 삽입). 단계 번호·
아이콘·제목·설명. 클릭 → 해당 뷰. 이전 단계 결과가 있으면 카드에 썸네일/"준비됨" 배지.
브랜드 규격 보드(팔레트·코어 연출·금지 조항)는 home 하단에 유지.

### `#cloth` — 옷 생성
- 입력: Fragment 선택(현재 Afar = 팔레트/무드), 장르 프리셋 5종(의상 종류).
- 생성: **Imagen 4.0 텍스트→이미지**, 플랫레이 콜라주 전용 프롬프트(모델 없음). 흰 배경에
  의상+액세서리+신발+가방 + 리퀴드 크롬/아메시스트 소품을 가지런히 배치. 옷_ref 스타일.
  종횡비 3:4.
- 결과: 콜라주 카드가 그리드로 누적(여러 번 생성), 카드 선택 가능 → `state.clothes`.

### `#model` — 모델 착장
- 옷 카드 목록(`state.clothes`)에서 한 벌 선택. 비어 있으면 #cloth로 유도.
- 모델 사진 업로드(선택) 드롭존. 없으면 브랜드 기본 뮤즈로 생성.
- 포즈 선택(기존 3종).
- 생성: **Gemini 2.5 Flash 이미지→이미지** = 선택 콜라주(필수) + 모델 사진(선택) +
  브랜드 subject/pose 프롬프트. 배경은 중립 톤(다음 단계 교체용). → `state.dressedDataUrl`.

### `#bg` — 배경 삽입
- 착장 결과 표시. 옷 카드 미선택/착장 미완료면 #model로 유도.
- 기본 스튜디오 배경 칩 3종(코스믹/아날로그 룸/미니멀 스튜디오 월) + 배경 업로드(선택) 드롭존.
- 생성: **Gemini 2.5 Flash** = 착장 결과 + 배경(업로드 시 참조, 기본은 텍스트). 인물을
  배경에 합성·조명/팔레트 조화. 인물/의상/포즈/얼굴 유지. → `state.finalDataUrl`, 다운로드.

## 데이터 흐름

home → cloth(콜라주 N장 생성) → model(콜라주 1장 선택 + 모델 선택 + 착장) →
bg(배경 선택/업로드 + 합성) → 최종 다운로드. 상태는 메모리 유지, 해시 이동 시 보존.

## 공통/재사용

- `requireKey()` 게이트로 각 생성 진입 시 키 확인.
- `imagenGenerate(prompt, aspect)` / `geminiEdit(promptText, images[])` 헬퍼.
- `setupDropzone(zoneId, inputId, onLoad)` / `readFile()` 로 업로드 일원화.
- 전역 로딩 오버레이 `setLoading(bool, subtext)`.
- base64는 dataURL로 저장, Gemini 전송 시 prefix 제거.

## 배포 동기화 규칙 (CLAUDE.md)

`vyw.html`(소스)와 `dist/lookbook.html`(배포)의 차이는 3곳뿐:
1) `<link rel=icon favicon>` 2) VYW 워드마크를 `<a href=index.html>` 3) 헤더 홈/브랜드바이블 링크.
소스 수정 후 dist에 이 3개를 유지한 채 복사. `firebase deploy --only hosting`.

## 범위 밖 (YAGNI)

- ~~Fragment 2개 이상~~ → 2026-06-15 `config/concepts.json` 기준 3종(Afar/Elsewhere/Faraway) 반영.
- 단계별 결과 영구 저장/세션 복원.
- Functions 프록시(키 서버화).
