/* Legacy filename retained; referral links no longer initiate verification. */
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
let email = 'new-owner@example.test', claimed = false, otherGym = false, expired = false, revoked = false, writes = 0, inviteConsumed = 0;
const record = () => ({ id: 'invite1', gymId: 'gym1', tokenHash: 'hash', usedAt: null, expiresAt: new Date(Date.now() + (expired ? -1 : 1) * 60000), gym: { name: 'Gym', _count: { access: claimed ? 1 : 0 } } });
const db = {
  gymInvite: { findUnique: async () => record() },
  $transaction: async (callback, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    return callback({
      gymInvite: { findFirst: async () => revoked ? null : record(), update: async () => { inviteConsumed++; } },
      user: { findUnique: async () => ({ id: 'user1', emailVerified: new Date(), deletedAt: null, gymAccesses: otherGym ? [{ gymId: 'other' }] : [] }), update: async () => { writes++; } },
      gymAccess: { findFirst: async () => claimed ? { id: 'other-owner' } : null, upsert: async () => { writes++; } },
      gym: { update: async () => { writes++; } }, gymClaim: { upsert: async () => { writes++; } },
    });
  },
};
const original = Module._load;
Module._load = function(name, parent, isMain) {
  if (name === 'next-auth') return { getServerSession: async () => email ? { user: { email } } : null };
  if (name === 'next/headers') return { cookies: async () => ({ get: () => undefined, delete: () => {} }) };
  if (name === '@/lib/auth') return { authOptions: {} };
  if (name === '@/prisma/client') return { db };
  if (name === '@/lib/gyms') return { cleanGymInput: () => ({ name: 'Verified gym', isPublished: true }), validateCompleteGymInput: () => [] };
  if (name === '@/lib/listing-verification') return { getListingVerification: async () => expired ? { ...record(), expiresAt: new Date(0) } : record() };
  if (name.startsWith('@/')) name = path.join(__dirname, '..', name.slice(2));
  return original.call(this, name, parent, isMain);
};
const { PATCH } = require('../app/api/gym-invites/[token]/claim/route.ts');
const submit = () => PATCH(new Request('https://example.test/api/gym-invites/verification/claim', { method: 'PATCH', body: '{}' }), { params: Promise.resolve({ token: 'verification' }) });
(async () => {
  email = null; assert.equal((await submit()).status, 401); email = 'new-owner@example.test';
  expired = true; assert.equal((await submit()).status, 410); expired = false;
  claimed = true; assert.equal((await submit()).status, 409); claimed = false;
  otherGym = true; assert.equal((await submit()).status, 409); otherGym = false;
  revoked = true; assert.equal((await submit()).status, 410); revoked = false;
  assert.equal(writes, 0);
  const response = await submit();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).redirectTo, undefined, 'verification no longer redirects through a referral token');
  assert.equal(writes, 4); assert.equal(inviteConsumed, 1);
  console.log('PASS: verification links authenticate, enforce one-gym ownership, and no longer depend on referral links.');
})().catch(error => { console.error(error); process.exitCode = 1; });
