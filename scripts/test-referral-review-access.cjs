const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
let email = null, account = null, reads = 0, writes = 0, transactionOwner = true, reviewStatus = 'check_later';
const owner = { role: 'GYM', emailVerified: new Date(), deletedAt: null, gymAccesses: [{ gymId: 'gym1' }] };
const db = {
  user: { findUnique: async ({ where }) => where.email === 'owner@example.test' ? account : null },
  landingEvent: { findMany: async () => [{ id: 'click1', eventType: 'DAY_PASS_CLICKED', visitorId: 'v1', userId: 'customer1', metadata: { price: 10 }, createdAt: new Date() }] },
  $transaction: async callback => callback({ gymAccess: { findFirst: async () => transactionOwner ? { id: 'access1' } : null }, landingEvent: { deleteMany: async () => { writes++; return { count: 1 }; }, create: async () => { writes++; } } }),
};
const original = Module._load;
Module._load = function(name, parent, isMain) {
  if (name === 'next-auth') return { getServerSession: async () => email ? { user: { email } } : null };
  if (name === '@/lib/auth') return { authOptions: {} };
  if (name === '@/prisma/client') return { db };
  if (name === '@/lib/conversion-review') return { getConversionReview: async gymId => { reads++; assert.equal(gymId, 'gym1'); return { gymId, rows: [{ id: 'click1', sourceClickId: 'click1', status: reviewStatus, rowKind: 'referral', email: 'customer@example.test' }] }; } };
  if (name.startsWith('@/')) name = path.join(__dirname, '..', name.slice(2));
  return original.call(this, name, parent, isMain);
};
const { getReferralReviewAccess } = require('../lib/referral-review-access.ts');
const { PATCH, DELETE } = require('../app/api/referrals/route.ts');
const submit = () => PATCH(new Request('https://example.test/api/referrals', { method: 'PATCH', body: JSON.stringify({ decisions: [{ clickId: 'click1', status: 'purchased' }] }) }));
const remove = () => DELETE(new Request('https://example.test/api/referrals', { method: 'DELETE', body: JSON.stringify({ clickId: 'click1' }) }));
(async () => {
  assert.equal((await getReferralReviewAccess()).status, 'signed_out');
  assert.equal((await submit()).status, 401);
  for (const invalid of [null, { ...owner, role: 'TRAINEE' }, { ...owner, emailVerified: null }, { ...owner, deletedAt: new Date() }, { ...owner, gymAccesses: [] }, { ...owner, gymAccesses: [{ gymId: 'gym1' }, { gymId: 'gym2' }] }]) {
    account = invalid; email = 'owner@example.test';
    assert.equal((await getReferralReviewAccess(email)).status, 'forbidden');
    assert.equal((await submit()).status, 403);
  }
  email = 'admin@example.test'; account = owner;
  assert.equal((await submit()).status, 403, 'admins have no bypass');
  assert.equal(reads, 0, 'unauthorized requests cannot load referral details');
  email = 'OWNER@EXAMPLE.TEST'; account = owner;
  assert.deepEqual(await getReferralReviewAccess(email), { status: 'allowed', gymId: 'gym1' });
  transactionOwner = false;
  assert.equal((await submit()).status, 403, 'ownership is checked again before writing');
  assert.equal(writes, 0);
  transactionOwner = true;
  assert.equal((await submit()).status, 200);
  assert.equal(writes, 2);
  reviewStatus = 'purchased';
  assert.equal((await remove()).status, 200);
  assert.equal(writes, 3, 'removing a confirmation deletes its metric-producing event');
  console.log('PASS: permanent referral access is owner-only and confirmed purchases can be removed securely.');
})().catch(error => { console.error(error); process.exitCode = 1; });
