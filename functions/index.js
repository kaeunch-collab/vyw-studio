/**
 * VYW — 인증 + Gemini 프록시 (Firebase Functions v2)
 * 목적: Gemini API 키를 브라우저에 노출하지 않고, 공용 비밀번호 1개로 로그인한
 *       사용자만 이미지 생성을 쓰게 한다. 키는 서버 시크릿에만 존재한다.
 *
 * 라우트 (Hosting rewrite /api/** → 이 함수):
 *   POST /api/login   { password } → 비번(scrypt) 검증 → { token, exp }  (실패 401)
 *   POST /api/gemini  Bearer token, { prompt, images?, aspect? } → { b64 } (토큰만료/무효 401)
 */
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const crypto = require('node:crypto');

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const PASSWORD_HASH = defineSecret('PASSWORD_HASH'); // 형식: saltHex:hashHex
const TOKEN_SECRET = defineSecret('TOKEN_SECRET');

const TOKEN_TTL_SEC = 7 * 24 * 60 * 60; // 7일
const GEMINI_MODEL = 'gemini-2.5-flash-image';

// ---------- 유틸 ----------
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function fromB64url(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Buffer.from(s, 'base64'); }
const nowSec = () => Math.floor(Date.now() / 1000);

function makeToken(secret) {
  const p = b64url(JSON.stringify({ exp: nowSec() + TOKEN_TTL_SEC }));
  const sig = b64url(crypto.createHmac('sha256', secret).update(p).digest());
  return p + '.' + sig;
}
function verifyToken(token, secret) {
  if (!token || token.indexOf('.') < 0) return false;
  const [p, sig] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', secret).update(p).digest());
  const a = Buffer.from(sig || ''), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try { const { exp } = JSON.parse(fromB64url(p).toString()); return typeof exp === 'number' && exp > nowSec(); }
  catch { return false; }
}
function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored || '').split(':');
  if (!saltHex || !hashHex) return false;
  let derived;
  try { derived = crypto.scryptSync(String(password || ''), Buffer.from(saltHex, 'hex'), 32); }
  catch { return false; }
  const expected = Buffer.from(hashHex, 'hex');
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}
const send = (res, code, obj) => res.status(code).set('Content-Type', 'application/json').send(JSON.stringify(obj));

// ---------- 함수 ----------
exports.api = onRequest(
  { secrets: [GEMINI_API_KEY, PASSWORD_HASH, TOKEN_SECRET], region: 'us-central1', timeoutSeconds: 120, memory: '512MiB' },
  async (req, res) => {
    const path = String(req.path || '').replace(/\/+$/, '');
    try {
      // 로그인
      if (req.method === 'POST' && path.endsWith('/login')) {
        const password = (req.body || {}).password;
        if (!verifyPassword(password, PASSWORD_HASH.value())) {
          await new Promise((r) => setTimeout(r, 600)); // 무차별 대입 완화
          return send(res, 401, { error: '비밀번호가 올바르지 않습니다.' });
        }
        return send(res, 200, { token: makeToken(TOKEN_SECRET.value()), exp: nowSec() + TOKEN_TTL_SEC });
      }

      // Gemini 프록시
      if (req.method === 'POST' && path.endsWith('/gemini')) {
        const auth = req.get('Authorization') || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        if (!verifyToken(token, TOKEN_SECRET.value())) return send(res, 401, { error: '로그인이 필요합니다(토큰 만료/무효).' });

        const { prompt, images, aspect } = req.body || {};
        if (!prompt) return send(res, 400, { error: 'prompt required' });

        const parts = [{ text: String(prompt) }];
        (Array.isArray(images) ? images : []).forEach((d) => {
          if (typeof d !== 'string') return;
          const m = /^data:([^;]+);base64,(.*)$/.exec(d);
          if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
        });

        const payload = { contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect || '1:1' } } };
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY.value()}`;
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!r.ok) { const t = await r.text().catch(() => ''); return send(res, r.status, { error: `gemini ${r.status}`, detail: t.replace(/\s+/g, ' ').slice(0, 400) }); }
        const data = await r.json();
        const b64 = data && data.candidates && data.candidates[0] && data.candidates[0].content
          && (data.candidates[0].content.parts || []).find((p) => p.inlineData)?.inlineData?.data;
        if (!b64) return send(res, 502, { error: '이미지 데이터를 받지 못했습니다.' });
        return send(res, 200, { b64 });
      }

      return send(res, 404, { error: 'not found' });
    } catch (e) {
      return send(res, 500, { error: 'server error', detail: String((e && e.message) || e) });
    }
  }
);
