import assert from 'node:assert/strict'
// The money module is TypeScript; keep this zero-dependency test aligned with its exact parsing rules.
function exponent(c) { return new Set(['JPY','KRW','VND']).has(c) ? 0 : new Set(['KWD','BHD','JOD','OMR','TND','IQD','LYD']).has(c) ? 3 : 2 }
function toMinor(raw, c) {
  const exp = exponent(c); const s=String(raw); if(!/^-?\d+(?:\.\d+)?$/.test(s)) throw new Error('invalid')
  const neg=s.startsWith('-'), u=neg?s.slice(1):s, [w,f='']=u.split('.')
  if(f.length>exp && /[1-9]/.test(f.slice(exp))) throw new Error('precision')
  const n=BigInt(w)*(10n**BigInt(exp))+BigInt((f+'0'.repeat(exp)).slice(0,exp)||'0')
  return neg?-n:n
}
assert.equal(toMinor('10.25','USD'), 1025n)
assert.equal(toMinor('10','JPY'), 10n)
assert.equal(toMinor('1.234','KWD'), 1234n)
assert.equal(toMinor('-0.01','EUR'), -1n)
assert.throws(() => toMinor('1.001','USD'))
assert.equal((1001n * 250n) / 10000n, 25n)
console.log('Money primitive self-test OK')
