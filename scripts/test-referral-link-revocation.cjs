const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
let links, inTransaction = false;
const noop = async () => ({});
const tx = new Proxy({}, { get: (_, model) => {
  if (model === 'gymConversionReviewLink') return { deleteMany: async ({ where }) => {
    assert(inTransaction, 'link revocation must be atomic with ownership removal');
    const ids = typeof where.gymId === 'string' ? [where.gymId] : where.gymId.in;
    for (const id of ids) links.delete(id);
  } };
  if (model === 'gymAccess') return { findMany: async () => [{ gymId: 'gym1', userId: 'owner1' }], deleteMany: noop, count: async () => 0 };
  if (model === 'gymInvite') return { findFirst: async () => null, deleteMany: noop };
  if (model === 'user') return { findUnique: async () => ({ email: 'owner@example.test' }), update: noop };
  return { deleteMany: noop, updateMany: noop, update: noop };
} });
const db = {
  user: { findUnique: async () => ({ id: 'owner1', email: 'owner@example.test', password: 'hash' }) },
  gymConversionReviewLink: { findFirst: async () => links.has('gym1') ? { gymId: 'gym1', gym: { access: [] } } : null, findUnique: async () => links.has('gym1') ? { gymId: 'gym1', expiresAt: new Date(Date.now() + 60000), gym: { _count: { access: 0 } } } : null },
  gymInvite: { findUnique: async () => null },
  $transaction: async callback => { inTransaction = true; try { return await callback(tx); } finally { inTransaction = false; } },
};
const original = Module._load;
Module._load = function(name, parent, isMain) {
  if (name === 'next-auth') return { getServerSession: async () => ({ user: { email: 'owner@example.test' } }) };
  if (name === '@/lib/auth') return { authOptions: {} };
  if (name === '@/lib/admin') return { hasAdminAccessByEmail: async () => true, hasSuperAdminAccessByEmail: async () => true };
  if (name === '@/prisma/client') return { db };
  if (name.startsWith('@/')) name = path.join(__dirname, '..', name.slice(2));
  return original.call(this, name, parent, isMain);
};
const { PATCH } = require('../app/api/admin/gyms/[id]/ownership/route.ts');
const { DELETE } = require('../app/api/user/delete/route.ts');
const { getReferralReviewAccess } = require('../lib/referral-review-access.ts');
const { getListingVerification } = require('../lib/listing-verification.ts');
const assertRevoked = async () => {
  assert.equal((await getReferralReviewAccess('old-token', 'owner@example.test')).status, 'invalid');
  assert.equal(await getListingVerification('old-token'), null, 'old referral cannot restart verification');
  assert(links.has('unrelated-gym'), 'other gyms retain their links');
};
(async () => {
  for (const action of ['removeClaim', 'removeOwner', 'unverify']) {
    links = new Set(['gym1', 'unrelated-gym']);
    const response = await PATCH(new Request('https://example.test', { method: 'PATCH', body: JSON.stringify({ action }) }), { params: Promise.resolve({ id: 'gym1' }) });
    assert.equal(response.status, 200);
    await assertRevoked();
  }
  links = new Set(['gym1', 'unrelated-gym']);
  assert.equal((await DELETE(new Request('https://example.test', { method: 'DELETE', body: '{}' }))).status, 200);
  await assertRevoked();
  console.log('PASS: owner removal, unverify, and account deletion revoke referral access and verification atomically without affecting other gyms.');
})().catch(error => { console.error(error); process.exitCode = 1; });
