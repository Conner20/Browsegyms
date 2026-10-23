const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
let email = null, valid = true, owners = [], reads = 0, writes = 0, transactionOwner = true;
const owner = { email: 'owner@example.test', emailVerified: new Date(), deletedAt: null };
const db = {
  gymConversionReviewLink: { findFirst: async query => {
    assert(query.where.expiresAt.gt instanceof Date);
    return valid ? { gymId: 'gym1', gym: { access: owners.map(user => ({ user })) } } : null;
  } },
  landingEvent: { findMany: async () => [{ id: 'click1', eventType: 'DAY_PASS_CLICKED', visitorId: 'v1', userId: 'customer1', metadata: { price: 10 }, createdAt: new Date() }] },
  $transaction: async callback => callback({ gymAccess: { findFirst: async () => transactionOwner ? { id: 'access1' } : null }, landingEvent: { deleteMany: async () => { writes++; }, create: async () => { writes++; } } }),
};
const original = Module._load;
Module._load = function(name, parent, isMain) {
  if (name === 'next-auth') return { getServerSession: async () => email ? { user: { email } } : null };
  if (name === '@/lib/auth') return { authOptions: {} };
  if (name === '@/prisma/client') return { db };
  if (name === '@/lib/conversion-review') return { getConversionReview: async () => { reads++; return { gymId: 'gym1', linkId: 'link1', rows: [{ id: 'click1', sourceClickId: 'click1', status: 'check_later', rowKind: 'referral', email: 'customer@example.test' }] }; } };
  if (name.startsWith('@/')) name = path.join(__dirname, '..', name.slice(2));
  return original.call(this, name, parent, isMain);
};
const { getReferralReviewAccess } = require('../lib/referral-review-access.ts');
const { PATCH } = require('../app/api/referrals/review/[token]/route.ts');
const submit = () => PATCH(new Request('https://example.test/api/referrals/review/token', { method: 'PATCH', body: JSON.stringify({ decisions: [{ clickId: 'click1', status: 'purchased' }] }) }), { params: Promise.resolve({ token: 'token' }) });
(async () => {
  valid = false;
  assert.equal((await getReferralReviewAccess('expired', owner.email)).status, 'invalid');
  valid = true;
  assert.equal((await getReferralReviewAccess('token', owner.email)).status, 'unclaimed');
  owners = [owner];
  assert.equal((await getReferralReviewAccess('token')).status, 'signed_out');
  assert.equal((await submit()).status, 401);
  for (email of ['other@example.test', 'conner.morgan14@gmail.com', 'carson.morgan101@gmail.com']) {
    assert.equal((await getReferralReviewAccess('token', email)).status, 'forbidden');
    assert.equal((await submit()).status, 403);
  }
  assert.equal(reads, 0, 'unauthorized requests cannot load referral details');
  assert.equal(writes, 0);
  email = owner.email;
  owners = [{ ...owner, emailVerified: null }];
  assert.equal((await submit()).status, 403);
  owners = [{ ...owner, deletedAt: new Date() }];
  assert.equal((await submit()).status, 403);
  owners = [owner];
  assert.equal((await getReferralReviewAccess('token', 'OWNER@EXAMPLE.TEST')).status, 'allowed');
  transactionOwner = false;
  assert.equal((await submit()).status, 403, 'revoked ownership is checked again before writing');
  assert.equal(writes, 0);
  transactionOwner = true;
  assert.equal((await submit()).status, 200);
  assert.equal(writes, 2);
  console.log('PASS: owner-only referral access, no admin bypass, invalid links, deleted/unverified owners, and ownership recheck before save.');
})().catch(error => { console.error(error); process.exitCode = 1; });
