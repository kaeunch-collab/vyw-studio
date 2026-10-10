/**
 * VYW 연구 설문 — 서버측 검증 스키마 (canonical)
 *
 * 이 파일은 서버가 신뢰하는 유일한 문항 스키마 정본이다.
 * dist/r-xiyedm7aw0l/config.json 의 문항 문구(ko/en)는 여기 값과 "짝"을 이루도록
 * 연구자가 수정하되, 문항 개수/허용 값이 바뀌면 이 파일도 함께 고쳐야 한다.
 *
 * answers 는 평평한(flat) 키-값 객체이며, 여기서 허용한 키만 통과시킨다.
 *   user   : 배경 3 + 과업2×(일관성4 + TLX6 + SUS10 + CSI12) + 마무리 5
 *   expert : 배경 2 + 자극(가변: st_<setId>_p1..p5 / _opinion) + 프레임워크 5
 *
 * firebase-admin 구버전 API 는 쓰지 않는다. 이 파일은 순수 검증 로직만 담는다.
 */
'use strict';

const CODE_PATTERNS = {
  user: /^P\d{2}-(AB|BA)$/,
  expert: /^E\d{2}$/,
};

// 선택형 문항의 허용 값(코드). 라벨 문구는 config 에서 바꾼다.
const ENUMS = {
  bg_major: ['major', 'nonmajor'],
  bg_career_user: ['none', 'lt1y', '1to3y', 'gte3y'],
  bg_career_expert: ['lt3y', '3to5y', '5to10y', 'gte10y'],
  bg_field: ['fashion', 'photo', 'md_branding', 'etc'],
  final_pref: ['first', 'second', 'same'],
};

const MAX_TEXT = 1000; // 주관식 최대 1000자
const MAX_KEYS = 200; // 비정상적으로 큰 answers 거부
const MAX_BODY_BYTES = 64 * 1024; // 본문 64KB 제한
const BODY_KEYS = ['role', 'code', 'consent', 'answers', 'clientStartedAt'];
let config;
function surveyConfig() {
  if (!config) {
    const candidate = require('./survey-config.json'); // 배포 훅으로 공개 config와 동기화
    assertConfigMatchesSchema(candidate);
    config = candidate;
  }
  return config;
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
}
function isInt(v) {
  return typeof v === 'number' && Number.isInteger(v);
}
function inRange(v, min, max) {
  return isInt(v) && v >= min && v <= max;
}
function validText(v) {
  return typeof v === 'string' && v.length <= MAX_TEXT;
}

// ---------- role=user 허용 키 ----------
function checkUser(key, val) {
  if (key === 'bg_major') return ENUMS.bg_major.indexOf(val) >= 0;
  if (key === 'bg_career') return ENUMS.bg_career_user.indexOf(val) >= 0;
  if (key === 'bg_ai_freq') return inRange(val, 1, 5);
  if (key === 'final_pref') return ENUMS.final_pref.indexOf(val) >= 0;
  if (/^final_(pref_reason|open_[123])$/.test(key)) return validText(val);
  if (/^t[12]_consist_[1-4]$/.test(key)) return inRange(val, 1, 7); // 7점 리커트
  if (/^t[12]_tlx_[1-6]$/.test(key)) return isInt(val) && val >= 0 && val <= 100 && val % 5 === 0; // 0~100, 5단위
  if (/^t[12]_sus_([1-9]|10)$/.test(key)) return inRange(val, 1, 5); // 5점 리커트
  if (/^t[12]_csi_([1-9]|1[0-2])$/.test(key)) return inRange(val, 0, 10); // 0~10
  return false;
}

// ---------- role=expert 허용 키 ----------
function checkExpert(key, val, cfg = surveyConfig()) {
  if (key === 'bg_field') return ENUMS.bg_field.indexOf(val) >= 0;
  if (key === 'bg_career') return ENUMS.bg_career_expert.indexOf(val) >= 0;
  if (/^fw_[1-3]$/.test(key)) return inRange(val, 1, 5);
  if (/^fw_open_[12]$/.test(key)) return validText(val);
  const match = /^st_(S[0-9]{1,3})_(p[1-5]|opinion)$/.exec(key);
  if (match && cfg.stimuli.some((s) => s.id === match[1] && s.images.length > 0)) {
    if (/_opinion$/.test(key)) return validText(val);
    return inRange(val, 1, 5);
  }
  return false;
}

// 활성 자극의 모든 평점은 필수, 자극 의견만 선택이다.
function requiredKeys(role, cfg = surveyConfig()) {
  const keys = [];
  if (role === 'user') {
    keys.push(
      'bg_major', 'bg_career', 'bg_ai_freq',
      'final_pref', 'final_pref_reason', 'final_open_1', 'final_open_2', 'final_open_3'
    );
    for (let t = 1; t <= 2; t++) {
      for (let i = 1; i <= 4; i++) keys.push('t' + t + '_consist_' + i);
      for (let i = 1; i <= 6; i++) keys.push('t' + t + '_tlx_' + i);
      for (let i = 1; i <= 10; i++) keys.push('t' + t + '_sus_' + i);
      for (let i = 1; i <= 12; i++) keys.push('t' + t + '_csi_' + i);
    }
  } else {
    keys.push('bg_field', 'bg_career', 'fw_1', 'fw_2', 'fw_3', 'fw_open_1', 'fw_open_2');
    cfg.stimuli.filter((s) => s.images.length > 0).forEach((s) => {
      for (let i = 1; i <= 5; i++) keys.push('st_' + s.id + '_p' + i);
    });
  }
  return keys;
}

/**
 * 제출 본문을 검증하고 저장용 정제 문서를 반환한다.
 * 실패 시 { ok:false } (내부 사유는 클라이언트로 내보내지 않는다).
 */
function validateSubmission(body) {
  if (!isPlainObject(body)) return { ok: false };
  const bodyKeys = Object.keys(body);
  if (bodyKeys.length !== BODY_KEYS.length || bodyKeys.some((k) => !BODY_KEYS.includes(k))) return { ok: false };
  const role = body.role;
  if (role !== 'user' && role !== 'expert') return { ok: false };
  const code = body.code;
  if (typeof code !== 'string' || code.length !== (role === 'user' ? 6 : 3) || !CODE_PATTERNS[role].test(code)) return { ok: false };
  if (body.consent !== true) return { ok: false, reason: 'consent' };

  const answers = body.answers;
  if (!isPlainObject(answers)) return { ok: false };
  const keys = Object.keys(answers);
  if (keys.length === 0 || keys.length > MAX_KEYS) return { ok: false };

  const req = requiredKeys(role);
  const allowed = new Set(req);
  if (role === 'expert') {
    surveyConfig().stimuli.filter((s) => s.images.length > 0).forEach((s) => allowed.add('st_' + s.id + '_opinion'));
  }
  const checker = role === 'user' ? checkUser : checkExpert;
  for (let i = 0; i < keys.length; i++) {
    if (!allowed.has(keys[i]) || !checker(keys[i], answers[keys[i]])) return { ok: false };
  }

  for (let i = 0; i < req.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(answers, req[i])) return { ok: false };
    if (typeof answers[req[i]] === 'string' && !answers[req[i]].trim()) return { ok: false };
  }

  const clean = {};
  for (let i = 0; i < keys.length; i++) clean[keys[i]] = answers[keys[i]];

  const csa = body.clientStartedAt;
  if (typeof csa !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(csa)) return { ok: false };
  const parsed = new Date(csa);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== csa) return { ok: false };
  if (role === 'user') {
    const order = code.slice(-2);
    clean.t1_cond = order[0];
    clean.t2_cond = order[1];
  }

  return {
    ok: true,
    doc: { role: role, code: code, answers: clean, clientStartedAt: csa },
  };
}

// 공개 문항과 서버 스키마가 어긋나면 배포를 중단한다.
function assertConfigMatchesSchema(cfg) {
  function assert(ok) { if (!ok) throw new Error('Survey config/schema mismatch'); }
  function same(actual, expected) {
    assert(Array.isArray(actual) && actual.length === expected.length && new Set(actual).size === actual.length);
    assert(actual.every((v) => expected.includes(v)));
  }
  function choice(q, id, options) {
    assert(q && q.id === id && q.type === 'single' && q.required === true);
    same(q.options.map((o) => o.value), options);
  }
  function texts(items, ids) {
    same(items.map((q) => q.id), ids);
    items.forEach((q) => assert(q.maxLength === MAX_TEXT && q.required === true));
  }
  assert(isPlainObject(cfg) && !('conditions' in cfg));
  assert(!/참조|승계|stimuli\[\]\.condition/.test(JSON.stringify(cfg)));
  const u = cfg.background.user, e = cfg.background.expert;
  same(u.map((q) => q.id), ['bg_major', 'bg_career', 'bg_ai_freq']);
  same(e.map((q) => q.id), ['bg_field', 'bg_career']);
  choice(u.find((q) => q.id === 'bg_major'), 'bg_major', ENUMS.bg_major);
  choice(u.find((q) => q.id === 'bg_career'), 'bg_career', ENUMS.bg_career_user);
  choice(e.find((q) => q.id === 'bg_field'), 'bg_field', ENUMS.bg_field);
  choice(e.find((q) => q.id === 'bg_career'), 'bg_career', ENUMS.bg_career_expert);
  const ai = u.find((q) => q.id === 'bg_ai_freq');
  assert(ai.type === 'scale' && ai.min === 1 && ai.max === 5 && ai.required === true);
  const blocks = cfg.userTasks.blocks;
  same(blocks.map((b) => b.id), ['consistency', 'tlx', 'sus', 'csi']);
  const scales = { consistency: ['consist', 4, 1, 7], tlx: ['tlx', 6, 0, 100], sus: ['sus', 10, 1, 5], csi: ['csi', 12, 0, 10] };
  blocks.forEach((b) => {
    const [prefix, count, min, max] = scales[b.id];
    assert(b.min === min && b.max === max && b.kind === (b.id === 'tlx' ? 'slider' : b.id === 'csi' ? 'scale' : 'likert'));
    if (b.id === 'tlx') assert(b.step === 5);
    same(b.items.map((q) => q.id), Array.from({ length: count }, (_, i) => prefix + '_' + (i + 1)));
  });
  choice(cfg.final.preference, 'final_pref', ENUMS.final_pref);
  texts(cfg.final.open, ['final_pref_reason', 'final_open_1', 'final_open_2', 'final_open_3']);
  const rubric = cfg.expert.rubric, fw = cfg.expert.framework;
  assert(rubric.min === 1 && rubric.max === 5 && fw.min === 1 && fw.max === 5);
  same(rubric.items.map((q) => q.id), ['p1', 'p2', 'p3', 'p4', 'p5']);
  same(fw.items.map((q) => q.id), ['fw_1', 'fw_2', 'fw_3']);
  texts(fw.open, ['fw_open_1', 'fw_open_2']);
  assert(Array.isArray(cfg.stimuli) && cfg.stimuli.length <= 30);
  same(cfg.stimuli.map((s) => s.id), [...new Set(cfg.stimuli.map((s) => s.id))]);
  cfg.stimuli.forEach((s) => {
    assert(/^S[0-9]{1,3}$/.test(s.id) && s.id.length <= 4);
    assert(Object.keys(s).every((k) => ['id', 'label', 'images'].includes(k)));
    assert(typeof s.label === 'string' && Array.isArray(s.images));
    assert(s.images.length === 0 || s.images.length === 3 || s.images.length === 4);
    s.images.forEach((url) => assert(typeof url === 'string' && !/[\r\n]/.test(url) && /^\/r-xiyedm7aw0l\/stimuli\/S[0-9]{1,3}_[1-4]\.(jpg|jpeg|png|webp)$/.test(url)));
  });
}

module.exports = {
  CODE_PATTERNS: CODE_PATTERNS,
  ENUMS: ENUMS,
  MAX_TEXT: MAX_TEXT,
  MAX_KEYS: MAX_KEYS,
  MAX_BODY_BYTES: MAX_BODY_BYTES,
  requiredKeys: requiredKeys,
  validateSubmission: validateSubmission,
  assertConfigMatchesSchema: assertConfigMatchesSchema,
};
