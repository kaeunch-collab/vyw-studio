/**
 * 비밀번호 → PASSWORD_HASH(형식 saltHex:hashHex) 생성기.
 * 사용: node functions/hash-password.js '원하는_비밀번호'
 * 출력값을 시크릿으로 등록:  firebase functions:secrets:set PASSWORD_HASH
 *   (프롬프트에 이 값을 붙여넣기)
 */
const crypto = require('node:crypto');
const pw = process.argv[2];
if (!pw) {
  console.error("사용법: node functions/hash-password.js '비밀번호'");
  process.exit(1);
}
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(pw, salt, 32);
console.log(salt.toString('hex') + ':' + hash.toString('hex'));
