# 연구 설문 (숨김 페이지) 운영 문서

VYW 룩북 연구용 **숨김 설문 페이지**의 운영 가이드. 이 페이지는 사이트 메뉴·사이트맵
어디에도 링크되지 않으며, 연구자가 참여자에게 직접 링크를 보내는 방식으로만 접근한다.

- 설문 페이지: `dist/r-xiyedm7aw0l.html` → 배포 URL `https://vyw-studio.web.app/r-xiyedm7aw0l`
- 문항·자극 설정: `dist/r-xiyedm7aw0l/config.json`
- 서버 검증 스키마(정본): `functions/survey-schema.js`
- 조건 매핑(서버 전용): `functions/survey-private.json` — Hosting 공개 폴더에 복사하지 않는다.
- 서버 문항 사본: `functions/survey-config.json` — 배포 훅이 공개 config를 검증한 뒤 동기화한다.
- 저장: Firestore `surveyResponses` (클라이언트 접근 전면 차단, 서버 함수만 사용)
- 검색 노출 차단: 페이지 `<meta name="robots" content="noindex,nofollow">` +
  호스팅 `X-Robots-Tag: noindex, nofollow` (`firebase.json`)

---

## 1. 링크 형식

링크에는 `role` 과 `code` 두 파라미터가 반드시 있어야 한다.

| 대상 | 형식 | 예시 |
|---|---|---|
| 사용자 실험 참여자 | `/r-xiyedm7aw0l?role=user&code=P07-AB` | `P07-AB`, `P12-BA` |
| 전문가 평가자 | `/r-xiyedm7aw0l?role=expert&code=E03` | `E03`, `E11` |

- `role`·`code` 가 없거나 형식이 틀리면 **"연구자에게 받은 링크로 접속해 주세요"** 만 보이고
  아무것도 진행되지 않는다(fail-closed).
- 참여자에게는 URL을 그대로 복사해 전달한다(문자·메신저·메일 등).

---

## 2. 참여자 코드 규칙

### 사용자 실험 참여자 — `^P\d{2}-(AB|BA)$`

- 앞 두 자리 `P` + 두 자리 숫자(예: `P07`) = 참여자 번호.
- 뒤 두 글자는 **과업 순서**를 뜻한다.
  - `AB` = 참조 조건 먼저, 승계 조건 나중.
  - `BA` = 승계 조건 먼저, 참조 조건 나중.
- 조건 이름(**참조/승계**)과 자극 조건 매핑은 화면·HTML·공개 config·네트워크 응답에 노출하지 않는다. 화면에는 "첫 번째 과업 / 두 번째 과업"만
  보이고, 서버가 코드에서 `t1_cond` / `t2_cond` 를 파생해 `A` / `B` 로 저장한다. 클라이언트가 이 키를 보내면 거부한다.
- `A`/`B` 의미와 세트별 조건은 `functions/survey-private.json` 에만 둔다.

### 전문가 평가자 — `^E\d{2}$`

- `E` + 두 자리 숫자(예: `E03`).

### 중복 제출

- Firestore 문서 id 는 `role_code` (예: `user_P07-AB`, `expert_E03`).
- 서버는 Firestore `DocumentReference.create()` 로 저장한다. 같은 코드의 동시 요청도 한 건만 저장되고 나머지는 **409** 를 반환한다. 참여자 번호를 재사용하지 말 것.

---

## 3. 문항 문구 바꾸는 법 (코드 수정 없이)

`dist/r-xiyedm7aw0l/config.json` 만 고치면 문구·라벨·동의문을 바꿀 수 있다.

- `notes`: 최상단 연구자 메모. **CSI 관련 "원문 확인 필요" 경고가 들어 있으니 배포 전 반드시 확인.**
- `consent.user` / `consent.expert`: 첫 화면 안내·동의 문구(목적·소요 시간·수집 항목·익명 처리·
  연구 목적 외 미사용·언제든 중단). 동의 체크 전에는 진행 불가.
- `background.user` / `background.expert`: 배경 문항.
- `userTasks.blocks`: 조건별 설문 4블록(일관성 4 · NASA-TLX 6 · SUS 10 · CSI 12).
- `final`: 사용자 마지막 문항(선호 + 주관식 4개).
- `expert.rubric` / `expert.framework`: 전문가 평가 루브릭·프레임워크 문항.

> ⚠️ **문항 개수나 척도 범위를 바꾸면** `functions/survey-schema.js` 의 정규식·범위도 함께 고쳐야
> 서버 검증을 통과한다. 배포 훅이 키·척도·선택값 불일치를 감지하면 배포를 중단한다. 문구·라벨만 바꾸는 것은 config 만으로 충분하다.
> 로컬 검증이나 에뮬레이터 실행 전에도 `node functions/sync-survey-config.js` 를 실행한다. 자극 추가·삭제 후에는 Functions와 Hosting을 함께 배포한다.

### 문항 텍스트 주의

- SUS·NASA-TLX·CSI 는 영문 원문을 `en`, 국문 번역을 `ko` 에 둔다.
- `notes[0]` 에 **"ko 번역은 검증된 국문판 확인 전 임시 번역 — 주저자 검토 필요"** 가 있다.
- **CSI 12문항은 원문 확인 전이라 `en`/`ko` 가 모두 `[원문 확인 필요]`** 로 비어 있다.
  Cherry & Latulipe(2014) 원척도를 확인해 채우기 전에는 전문가/사용자 설문에 CSI가
  자리표시자로 보인다. 절대 기억으로 지어내지 말 것.
- NASA-TLX 6개 정의는 Hart(1986) 원문 정의를 사용했다.

---

## 4. 자극 이미지 넣는 법

`config.json` 의 `stimuli` 배열을 채운다.

```json
"stimuli": [
  {
    "id": "S1",
    "label": "세트 1",
    "images": [
      "/r-xiyedm7aw0l/stimuli/S1_1.jpg",
      "/r-xiyedm7aw0l/stimuli/S1_2.jpg",
      "/r-xiyedm7aw0l/stimuli/S1_3.jpg"
    ]
  }
]
```

1. 이미지 파일을 `dist/r-xiyedm7aw0l/stimuli/` 에 넣는다(폴더가 없으면 생성).
2. URL은 **사이트 루트 기준 절대 경로**(`/r-xiyedm7aw0l/stimuli/...`)를 권장한다.
3. 활성 세트는 반드시 이미지 3~4장으로 구성한다. ID는 `S1`처럼 S + 1~3자리 숫자, 파일명은 `S1_1.jpg`처럼 S번호 + `_1`~`_4` + jpg/jpeg/png/webp만 허용한다. 조건을 암시하는 파일명을 쓰지 않는다.
4. 공개 `stimuli` 항목은 `id`, `label`, `images` 만 허용한다. `condition` 을 넣으면 배포 검증이 실패한다. `label` 에 조건을 암시하는 단어를 넣지 말 것.
   세트별 조건은 서버 전용 `functions/survey-private.json` 의 `stimulusConditions` 에 `{"S1":"A","S2":"B"}` 형태로 관리하고, 공개 config의 모든 세트 ID와 일치시킨다.
5. `images` 가 빈 배열(`[]`)이거나 `stimuli` 가 비어 있으면 전문가 자극 평가 단계를 건너뛰고
   **"평가 이미지 준비 중"** 을 표시한다.
6. 전문가에게 보이는 세트 순서는 `code` 를 시드로 한 **결정적 무작위 순서**다(같은 코드는 항상 같은
   순서, 코드마다 다름).

프레임워크 도식은 `expert.framework.image` 에 URL을 넣으면 텍스트 설명 대신 이미지로 보인다
(비워 두면 `description` 텍스트가 표시됨).

---

## 5. CSV 내보내기

로그인 토큰(Bearer)이 필요하다. 먼저 기존 로그인 엔드포인트로 토큰을 받는다.

```bash
# 1) 토큰 받기 (비밀번호는 연구자만 앎)
TOKEN=$(curl -s -X POST https://vyw-studio.web.app/api/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"<연구자 비밀번호>"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

# 2) 사용자 응답 CSV
curl -s -H "Authorization: Bearer $TOKEN" \
  'https://vyw-studio.web.app/api/survey/export?role=user' -o survey_user.csv

# 3) 전문가 응답 CSV
curl -s -H "Authorization: Bearer $TOKEN" \
  'https://vyw-studio.web.app/api/survey/export?role=expert' -o survey_expert.csv
```

- 형식: UTF-8 BOM 포함 CSV, **한 응답 한 행**, 항목별 열.
- 열: `role, code, clientStartedAt, createdAt,` + `answers` 의 모든 키(사전순).
- 브라우저에 주소를 직접 쳐도 토큰이 없으면 401 이다(개인정보 보호).
- CSV 수식 접두사 `=`, `+`, `-`, `@` (앞 공백·제어문자 포함)는 작은따옴표를 앞에 붙여 텍스트로 내보낸다. 내보내기 응답은 `Cache-Control: no-store` 이다.

---

## 6. 배포 전 필요한 일 (중요)

Firestore를 아직 활성화하지 않았다면 **반드시 먼저 활성화**해야 한다. 그렇지 않으면
`/api/survey` 제출이 실패한다.

1. **Firestore 활성화** — Firebase 콘솔 → Build → Firestore Database → "데이터베이스 만들기".
   - 모드: **프로덕션 모드** 선택(모든 클라이언트 접근은 rules 로 차단되며, 서버만 접근).
   - 위치(리전)는 Functions 리전(`us-central1`)과 가까운 곳으로.
   - 참고: https://console.firebase.google.com/project/vyw-studio/firestore
2. **함수 의존성 설치** — `functions/` 에서 `npm install` (firebase-admin 포함, lock 갱신).
3. **배포** — 루트에서:
   ```bash
   firebase deploy --only firestore:rules,functions,hosting
   ```
   - `firestore.rules` 는 클라이언트 read/write 전면 거부.
   - 기존 시크릿(`GEMINI_API_KEY`, `PASSWORD_HASH`, `TOKEN_SECRET`)은 그대로 사용한다.
4. **동작 확인**
   - 정상 링크로 페이지가 뜨고 동의 체크 후 진행되는지.
   - `/api/survey` 제출 후 Firestore `surveyResponses` 에 문서가 생기는지(콘솔에서 확인).
   - 같은 코드 재제출 시 409 인지.
   - 잘못된 링크(`?role=user` 없이 등)에서 안내 문구만 보이는지.
   - `curl -I https://vyw-studio.web.app/r-xiyedm7aw0l` 로 `X-Robots-Tag` 헤더 확인.

---

## 7. 보안·개인정보 원칙

- 이름·이메일·전화·학번 등 **개인 식별 정보 입력칸을 만들지 않았다.** 모든 주관식 아래에
  "이름·연락처 등 개인정보를 적지 마세요" 안내를 표시한다.
- **userAgent·IP 를 저장하지 않는다.**
- 브라우저 코드에 `console.*` 를 쓰지 않는다.
- Firestore 클라이언트 SDK 를 페이지에 넣지 않는다(서버 함수만 사용).
- 비밀값은 페이지·저장소에 두지 않는다(서버 시크릿만).
- 진행 상태는 `sessionStorage` 에만 저장하고(try/catch), **제출 성공 시 삭제**한다.
  같은 탭에서 중간 이탈 후 다시 열면 이어서 진행된다.
- 서버는 제출 본문을 재검증한다: role·code 정규식, `consent===true`, 허용 키만(리커트 범위,
  슬라이더 0~100 5단위, 주관식 1000자), 실제 원본 본문 64KB 제한. 추가 본문 키·등록되지 않은 자극 키·빈 필수 주관식도 거부한다. 활성 자극의 모든 평점은 필수이며, 의견만 선택이다. `clientStartedAt` 은 유효한 UTC ISO 시각(`YYYY-MM-DDTHH:mm:ss.sssZ`)이어야 한다. 위반 시 400/413.
- 오류 응답은 기존 `send()` JSON 형식을 따르며 스택·내부 메시지를 노출하지 않는다.
