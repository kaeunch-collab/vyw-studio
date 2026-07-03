// =====================================================
// VYW · Gemini API Key  (browser env variable)
// -----------------------------------------------------
// 1) Copy this file:   cp env.example.js env.js
// 2) Paste your Gemini API key into env.js
//
// env.js is git-ignored and read by lookbook.html as
// window.ENV_API_KEY (env.js → localStorage → in-app modal).
//
// ⚠️  PUBLIC DEPLOY NOTE
// On a static Firebase site this value is shipped to the
// browser and is therefore PUBLICLY VISIBLE. If you bake a
// real key in, lock it down in Google Cloud Console:
//   APIs & Services → Credentials → your key →
//   Application restrictions → "Websites (HTTP referrers)"
//   and add your Firebase domain (e.g. *.web.app/*).
// Otherwise leave the placeholder and let visitors enter
// their own key via the in-app "API 설정" modal.
// =====================================================
window.ENV_API_KEY = "여기에_GEMINI_API_KEY_입력";
