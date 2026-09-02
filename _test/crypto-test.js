/* Verify the pure-JS PBKDF2-HMAC-SHA256 against a known-good reference. */

var K = [
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
];

function sha256(bytes) {
  var h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  var len = bytes.length;
  var withPad = new Uint8Array((((len + 8) >> 6) + 1) * 64);
  withPad.set(bytes);
  withPad[len] = 0x80;
  var bits = len * 8;
  var dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 4, bits >>> 0, false);
  dv.setUint32(withPad.length - 8, Math.floor(bits / 4294967296), false);

  var w = new Int32Array(64);
  for (var offset = 0; offset < withPad.length; offset += 64) {
    for (var i = 0; i < 16; i++) w[i] = dv.getInt32(offset + i * 4, false);
    for (i = 16; i < 64; i++) {
      var g0 = w[i-15], g1 = w[i-2];
      var s0 = ((g0 >>> 7)|(g0 << 25)) ^ ((g0 >>> 18)|(g0 << 14)) ^ (g0 >>> 3);
      var s1 = ((g1 >>> 17)|(g1 << 15)) ^ ((g1 >>> 19)|(g1 << 13)) ^ (g1 >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
    }
    var a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
    for (i = 0; i < 64; i++) {
      var S1 = ((e >>> 6)|(e << 26)) ^ ((e >>> 11)|(e << 21)) ^ ((e >>> 25)|(e << 7));
      var ch = (e & f) ^ (~e & g);
      var t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      var S0 = ((a >>> 2)|(a << 30)) ^ ((a >>> 13)|(a << 19)) ^ ((a >>> 22)|(a << 10));
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var t2 = (S0 + maj) | 0;
      hh=g; g=f; f=e; e=(d + t1)|0; d=c; c=b; b=a; a=(t1 + t2)|0;
    }
    h[0]=(h[0]+a)|0; h[1]=(h[1]+b)|0; h[2]=(h[2]+c)|0; h[3]=(h[3]+d)|0;
    h[4]=(h[4]+e)|0; h[5]=(h[5]+f)|0; h[6]=(h[6]+g)|0; h[7]=(h[7]+hh)|0;
  }
  var out = new Uint8Array(32);
  var ov = new DataView(out.buffer);
  for (i = 0; i < 8; i++) ov.setInt32(i * 4, h[i], false);
  return out;
}

function hmacSha256(key, message) {
  var block = new Uint8Array(64);
  if (key.length > 64) block.set(sha256(key)); else block.set(key);
  var inner = new Uint8Array(64), outer = new Uint8Array(64);
  for (var i = 0; i < 64; i++) { inner[i] = block[i] ^ 0x36; outer[i] = block[i] ^ 0x5c; }
  var a = new Uint8Array(64 + message.length);
  a.set(inner); a.set(message, 64);
  var innerHash = sha256(a);
  var b = new Uint8Array(96);
  b.set(outer); b.set(innerHash, 64);
  return sha256(b);
}

function pbkdf2(passwordBytes, saltBytes, iterations, dkLen) {
  var out = new Uint8Array(dkLen);
  var blocks = Math.ceil(dkLen / 32);
  for (var block = 1; block <= blocks; block++) {
    var input = new Uint8Array(saltBytes.length + 4);
    input.set(saltBytes);
    input[saltBytes.length]     = (block >>> 24) & 0xff;
    input[saltBytes.length + 1] = (block >>> 16) & 0xff;
    input[saltBytes.length + 2] = (block >>> 8) & 0xff;
    input[saltBytes.length + 3] = block & 0xff;
    var u = hmacSha256(passwordBytes, input);
    var acc = u.slice();
    for (var i = 1; i < iterations; i++) {
      u = hmacSha256(passwordBytes, u);
      for (var j = 0; j < 32; j++) acc[j] ^= u[j];
    }
    out.set(acc.subarray(0, Math.min(32, dkLen - (block - 1) * 32)), (block - 1) * 32);
  }
  return out;
}

function utf8(str) { return new TextEncoder().encode(str); }
function hex(bytes) {
  return Array.prototype.map.call(bytes, function (b) {
    return ('0' + b.toString(16)).slice(-2);
  }).join('');
}

// --- checks ---
var nodeCrypto = require('crypto');
console.log('sha256("abc") =', hex(sha256(utf8('abc'))));
console.log('expected       = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

var cases = [
  ['rajdip@10', 'kycc.admin.v2', 100000],
  ['rajdip@2007', 'kycc.super.v2', 100000],
  ['password', 'salt', 1000],
  ['pässwörd ✓', 'sält', 5000]
];
var allOk = true;
cases.forEach(function (c) {
  var mine = hex(pbkdf2(utf8(c[0]), utf8(c[1]), c[2], 32));
  var ref = nodeCrypto.pbkdf2Sync(c[0], c[1], c[2], 32, 'sha256').toString('hex');
  var ok = mine === ref;
  if (!ok) allOk = false;
  console.log((ok ? 'OK  ' : 'FAIL') + '  ' + c[0] + ' / ' + c[1] + ' x' + c[2]);
  if (!ok) console.log('   mine=' + mine + '\n   ref =' + ref);
});

var t0 = Date.now();
pbkdf2(utf8('rajdip@10'), utf8('kycc.admin.v2'), 100000, 32);
console.log('100k iterations took ' + (Date.now() - t0) + ' ms');
console.log(allOk ? '\nALL PASS' : '\nFAILURES');
