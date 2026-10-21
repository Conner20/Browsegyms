/* Deterministic fixtures: never connects to a database or Google. */
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { generateKeyPairSync } = require('node:crypto');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const originalLoad = Module._load;
const today = new Date().toISOString().slice(0, 10);
const at = new Date(`${today}T00:00:00Z`);
const gyms = [{ id: 'g1', name: 'Alpha Gym', isPublished: true, contactEmail: 'gym@example.test', membershipOptions: [], createdAt: at, updatedAt: at, access: [] }, { id: 'g2', name: 'Beta Gym', isPublished: false, contactEmail: '', membershipOptions: [], createdAt: at, updatedAt: at, access: [] }];
const users = [{ id: 'u1', email: 'member@example.test', role: 'USER', isAdmin: false, createdAt: at, emailVerified: at, lastLoginAt: null, deletedAt: null, gymAccesses: gyms.map(gym => ({ gym })) }];
const event = (id, eventType, gymId = 'g1', metadata = {}) => ({ id, eventType, gymId, gym: gyms.find(gym => gym.id === gymId), userId: 'u1', user: users[0], visitorId: 'v1', visitId: `visit:${id}`, createdAt: at, durationMs: null, path: '/', metadata });
let events = [event('v', 'VISIT', null), event('o', 'GYM_OPENED'), event('c', 'DAY_PASS_CLICKED', 'g1', { price: 12 }), { ...event('p', 'DAY_PASS_GYM_CONFIRMED', 'g1', { claimClickId: 'c', attributedAmount: 12, customerEmail: users[0].email, offerName: 'Day pass' }), visitId: 'gym-confirm:c' }, event('r', 'DAY_PASS_CLAIM_CONFIRMED'), event('f', 'FILTER_CHANGED', null, { filter: 'Squat rack' }), event('c2', 'DAY_PASS_CLICKED', 'g2', { price: 20 }), event('r2', 'DAY_PASS_CLAIM_CONFIRMED', 'g2')];
const db = { landingEvent: { findMany: async () => events, findFirst: async () => null }, user: { findMany: async () => users }, gym: { findMany: async () => gyms } };
Module._load = function(request, parent, isMain) {
  if (request === '@/prisma/client') return { db };
  if (request === '@/lib/admin') return { getUserAdminStatus: user => user.isAdmin };
  if (request.startsWith('@/')) request = path.join(__dirname, '..', request.slice(2));
  return originalLoad.call(this, request, parent, isMain);
};
const { buildAdminMetricsWorkbook } = require('../lib/admin-metrics-workbook.ts');
const { syncAdminMetricsToGoogleSheets } = require('../lib/google-sheets-sync.ts');
const { filterCategory } = require('../lib/metrics-filter-category.ts');
const rows = sheet => sheet.getSheetValues().slice(2).map(row => row.slice(1));
(async () => {
  const book = await buildAdminMetricsWorkbook();
  assert.equal(book.worksheets[0].name, 'Start here');
  assert.equal(book.worksheets.length, 25);
  for (const sheet of book.worksheets) { assert(sheet.autoFilter, sheet.name); assert.equal(sheet.views[0].ySplit, 1); }
  assert.equal(book.getWorksheet('Raw events').state, 'hidden');
  assert.equal(book.getWorksheet('Claim activity log').getCell('A1').value, 'Gym');
  assert.equal(book.getWorksheet('Financial ledger').getCell('A1').value, 'Gym');
  assert.deepEqual(rows(book.getWorksheet('Revenue by gym'))[0].slice(0, 8), ['Alpha Gym', 1, 0, 12, 12, 0, 1, 12]);
  assert.equal(rows(book.getWorksheet('User spending'))[0][1], 12);
  assert.equal(rows(book.getWorksheet('User gym access')).length, 2);
  const userRow = rows(book.getWorksheet('Users'))[0];
  assert.equal(userRow[13], 1, 'already confirmed reports are excluded from user-reported totals');
  assert.equal(rows(book.getWorksheet('Filter usage')).find(row => row[0] === 'Equipment')[1], 1);
  assert.equal(rows(book.getWorksheet('Filter usage')).find(row => row[0] === 'Gym type')[1], 0);
  assert.equal(rows(book.getWorksheet('Unclaimed gym opportunity'))[0][7], 20);
  assert.equal(filterCategory({ filter: 'Pool' }), 'Amenities');
  assert.equal(filterCategory({ filter: 'Open' }), 'Gym type');
  const binary = await book.xlsx.writeBuffer();
  const ExcelJS = require('exceljs'); const roundtrip = new ExcelJS.Workbook(); await roundtrip.xlsx.load(binary);
  assert.equal(roundtrip.getWorksheet('Revenue by gym').getCell('D2').value, 12);
  assert.equal(roundtrip.getWorksheet('Raw events').state, 'hidden');

  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = 'fixture'; process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'fixture@example.test';
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  let metadata = { sheets: [{ properties: { sheetId: 0, title: 'Gym demand', gridProperties: { rowCount: 1000, columnCount: 26 } } }, { properties: { sheetId: 99, title: 'Personal notes', gridProperties: { rowCount: 1000, columnCount: 26 } } }] };
  const requests = []; const writes = [];
  global.fetch = async (url, init) => {
    if (url.includes('oauth2')) return Response.json({ access_token: 'fixture-token' });
    const body = init?.body ? JSON.parse(init.body) : {};
    if (url.includes('?fields=')) return Response.json(metadata);
    if (url.endsWith('/values:batchUpdate')) writes.push(...body.data);
    if (url.endsWith(':batchUpdate') && body.requests) for (const request of body.requests) {
      requests.push(request);
      if (request.addSheet) metadata.sheets.push({ properties: { ...request.addSheet.properties, sheetId: metadata.sheets.length + 100 } });
      if (request.updateSheetProperties) Object.assign(metadata.sheets.find(sheet => sheet.properties.sheetId === request.updateSheetProperties.properties.sheetId).properties, request.updateSheetProperties.properties);
      if (request.addBanding) { const sheet = metadata.sheets.find(sheet => sheet.properties.sheetId === request.addBanding.bandedRange.range.sheetId); sheet.bandedRanges = [{ bandedRangeId: sheet.properties.sheetId + 1000 }]; }
    }
    return Response.json({});
  };
  await syncAdminMetricsToGoogleSheets();
  assert.equal(metadata.sheets.find(sheet => sheet.properties.sheetId === 0).properties.title, 'Gym demand funnel', 'renaming preserves tab IDs');
  const claims = writes.find(write => write.range === "'Claim activity log'!A1");
  assert.equal(typeof claims.values[1][4], 'number', 'timestamps become sortable native dates');
  assert.equal(claims.values[1][0], 'Alpha Gym');
  assert(!requests.some(request => request.updateSheetProperties?.properties.sheetId === 99), 'personal tabs untouched');
  assert(requests.some(request => request.repeatCell?.cell.userEnteredFormat?.numberFormat?.type === 'CURRENCY'));
  await syncAdminMetricsToGoogleSheets();
  assert.equal(metadata.sheets.length, 26, 'repeat sync creates no duplicate tabs');
  assert(requests.some(request => request.deleteBanding), 'repeat sync replaces managed bands');
  events = []; users.length = 0; gyms.length = 0;
  const empty = await buildAdminMetricsWorkbook();
  assert.equal(empty.getWorksheet('Revenue by gym').rowCount, 1);
  await syncAdminMetricsToGoogleSheets();
  console.log('PASS: section coverage, financial totals, gym lookup, filter categories, empty data, XLSX roundtrip, Google migration and repeat sync.');
})().catch(error => { console.error(error); process.exitCode = 1; });
