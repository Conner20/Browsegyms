const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
let email = 'new-owner@example.test', claimed = false, otherGym = false, expired = false, valid = true, revoked = false, writes = 0, inviteMode = false, inviteConsumed = 0;
const record = () => ({ id: 'link1', gymId: 'gym1', usedAt: null, expiresAt: new Date(Date.now() + (expired ? -1 : 1) * 60000), gym: { name: 'Gym', _count: { access: claimed ? 1 : 0 } } });
const db = {
  gymInvite: { findUnique: async () => inviteMode ? record() : null },
  gymConversionReviewLink: { findUnique: async () => valid ? record() : null, findFirst: async () => valid && !expired ? { id: 'link1' } : null },
  $transaction: async (callback, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    return callback({
      gymConversionReviewLink: { findFirst: async () => revoked ? null : record() },
      gymInvite: { findFirst: async () => revoked ? null : record(), update: async () => { inviteConsumed++; } },
      user: { findUnique: async () => ({ id: 'user1', emailVerified: new Date(), deletedAt: null, gymAccesses: otherGym ? [{ gymId: 'other' }] : [] }), update: async () => { writes++; } },
      gymAccess: { findFirst: async () => claimed ? { id: 'other-owner' } : null, upsert: async () => { writes++; } },
      gym: { update: async () => { writes++; } },
      gymClaim: { upsert: async () => { writes++; } },
    });
  },
};
const original = Module._load;
Module._load = function(name, parent, isMain) {
  if (name === 'next-auth') return { getServerSession: async () => email ? { user: { email } } : null };
  if (name === 'next/headers') return { cookies: async () => ({ get: () => undefined }) };
  if (name === '@/lib/auth') return { authOptions: {} };
  if (name === '@/prisma/client') return { db };
  if (name === '@/lib/gyms') return { cleanGymInput: () => ({ name: 'Verified gym', isPublished: true }), validateCompleteGymInput: () => [] };
  if (name.startsWith('@/')) name = path.join(__dirname, '..', name.slice(2));
  return original.call(this, name, parent, isMain);
};
const { PATCH } = require('../app/api/gym-invites/[token]/claim/route.ts');
const { getValidPendingGymInvite } = require('../lib/pending-gym-invite.ts');
const submit = () => PATCH(new Request('https://example.test/api/gym-invites/referral/claim', { method: 'PATCH', body: '{}' }), { params: Promise.resolve({ token: 'referral' }) });
(async () => {
  assert.equal(await getValidPendingGymInvite('referral'), 'referral', 'referral verification survives signup and login');
  email = null; assert.equal((await submit()).status, 401); email = 'new-owner@example.test';
  valid = false; assert.equal((await submit()).status, 410); valid = true;
  expired = true; assert.equal((await submit()).status, 410); expired = false;
  claimed = true; assert.equal((await submit()).status, 409); assert.equal(await getValidPendingGymInvite('referral'), ''); claimed = false;
  otherGym = true; assert.equal((await submit()).status, 409); otherGym = false;
  revoked = true; assert.equal((await submit()).status, 410); revoked = false;
  assert.equal(writes, 0, 'rejected claims cannot modify ownership or listing');
  const response = await submit();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).redirectTo, '/referrals/review/referral');
  assert.equal(writes, 4); assert.equal(inviteConsumed, 0, 'referral remains available for owner review');
  inviteMode = true;
  assert.equal((await submit()).status, 200);
  assert.equal(inviteConsumed, 1, 'ordinary verification invitations still get consumed');
  console.log('PASS: referral-initiated verification, authentication, expiry/revocation, existing ownership, one-gym restriction, return destination, and ordinary invites.');
})().catch(error => { console.error(error); process.exitCode = 1; });
