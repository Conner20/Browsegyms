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
const { growthChartRequests } = require('../lib/google-sheets-growth-charts.ts');
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
  metadata.sheets.push({ properties: { sheetId: 98, title: 'Fitting In Metrics' } });
  const requests = []; const writes = [];
  let selectedGym; const selectedMetrics = {}; let nextChartId = 10000; let failCharts = false;
  global.fetch = async (url, init) => {
    if (url.includes('oauth2')) return Response.json({ access_token: 'fixture-token' });
    const body = init?.body ? JSON.parse(init.body) : {};
    if (url.includes('/values/') && !init?.method) {
      const cell = decodeURIComponent(url.split('/values/')[1]);
      const value = cell.endsWith('!B1') ? selectedGym : selectedMetrics[cell.includes('Financial growth') ? 'Financial growth' : 'User and demand growth'];
      return Response.json({ values: value ? [[value]] : [] });
    }
    if (failCharts && body.requests?.some(request => request.updateChartSpec || request.addChart)) return new Response('Chart request failed', { status: 500 });
    if (url.includes('?fields=')) return Response.json(metadata);
    if (url.endsWith('/values:batchUpdate')) writes.push(...body.data);
    if (url.endsWith(':batchUpdate') && body.requests) for (const request of body.requests) {
      requests.push(request);
      if (request.updateCells?.range.startRowIndex === 0 && request.updateCells?.range.endColumnIndex === 2) selectedGym = request.updateCells.rows[0].values[1].userEnteredValue.stringValue;
      if (request.updateCells?.range.startRowIndex === 0 && request.updateCells?.range.startColumnIndex === 3) {
        const title = metadata.sheets.find(sheet => sheet.properties.sheetId === request.updateCells.range.sheetId).properties.title;
        selectedMetrics[title] = request.updateCells.rows[0].values[1].userEnteredValue.stringValue;
      }
      if (request.addChart) { const chart = request.addChart.chart; metadata.sheets.find(sheet => sheet.properties.sheetId === chart.position.overlayPosition.anchorCell.sheetId).charts = [{ ...chart, chartId: nextChartId++ }]; }
      if (request.updateChartSpec) assert(metadata.sheets.some(sheet => sheet.charts?.some(chart => chart.chartId === request.updateChartSpec.chartId)));
      if (request.deleteSheet) metadata.sheets = metadata.sheets.filter(sheet => sheet.properties.sheetId !== request.deleteSheet.sheetId);
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
  assert(writes.some(write => write.range === "'Financial growth'!A28"));
  assert(writes.some(write => write.range === "'User and demand growth'!A28"));
  assert.equal(selectedGym, 'All gyms', 'financial chart defaults to the aggregate series');
  assert.equal(requests.filter(request => request.addChart).length, 2);
  assert.equal(requests.filter(request => request.deleteSheet).length, 1);
  assert(!metadata.sheets.some(sheet => sheet.properties.title === 'Fitting In Metrics'));
  const formula = requests.flatMap(request => request.updateCells?.rows ?? []).flatMap(row => row.values ?? []).find(cell => cell.userEnteredValue?.formulaValue)?.userEnteredValue.formulaValue;
  assert(formula.includes('FILTER($B$29:$G$') && formula.includes('$H$29:$H$') && formula.includes('VLOOKUP($B$1,'), 'chart filters by stable gym ID, never sums all-gym and individual rows');
  assert(requests.some(request => request.setDataValidation?.rule.condition.type === 'ONE_OF_RANGE'));
  assert.deepEqual(selectedMetrics, { 'Financial growth': 'All metrics', 'User and demand growth': 'All metrics' });
  const metricDropdowns = requests.filter(request => request.setDataValidation?.rule.condition.type === 'ONE_OF_LIST');
  assert.deepEqual(metricDropdowns.map(request => request.setDataValidation.rule.condition.values.length), [6, 8], 'every financial and demand metric is selectable');
  const chartFormulas = requests.flatMap(request => request.updateCells?.rows ?? []).flatMap(row => row.values ?? []).map(cell => cell.userEnteredValue?.formulaValue).filter(Boolean);
  assert.equal(chartFormulas.filter(formula => formula.includes('NA()')).length, 12, 'each series hides rather than plots zeros when not selected');
  assert(chartFormulas.filter(formula => formula.includes('NA()')).every(formula => formula.includes('$E$1="All metrics"') && formula.includes('$E$1=$')));
  assert(requests.filter(request => request.addChart).every(request => request.addChart.chart.spec.basicChart.domains[0].domain.sourceRange.sources[0].startColumnIndex === 20), 'both charts use selector-controlled data');
  selectedMetrics['Financial growth'] = 'Customers supplied';
  selectedMetrics['User and demand growth'] = 'Users';
  selectedGym = 'Beta Gym';
  await syncAdminMetricsToGoogleSheets();
  assert.equal(selectedMetrics['Financial growth'], 'Customers supplied');
  assert.equal(selectedMetrics['User and demand growth'], 'Users');
  assert.equal(selectedGym, 'Beta Gym', 'scheduled refresh preserves a valid gym selection');
  assert.equal(requests.filter(request => request.addChart).length, 2, 'repeat sync updates charts without duplicates');
  assert.equal(requests.filter(request => request.updateChartSpec).length, 2);
  assert.equal(metadata.sheets.length, 26, 'repeat sync creates no duplicate tabs');
  assert(requests.some(request => request.deleteBanding), 'repeat sync replaces managed bands');
  metadata.sheets.push({ properties: { sheetId: 98, title: 'Fitting In Metrics' } });
  failCharts = true;
  await assert.rejects(syncAdminMetricsToGoogleSheets, /Chart request failed/);
  assert(metadata.sheets.some(sheet => sheet.properties.sheetId === 98), 'legacy tab is retained when replacement charts fail');
  failCharts = false;
  events = []; users.length = 0; gyms.length = 0;
  const empty = await buildAdminMetricsWorkbook();
  assert.equal(empty.getWorksheet('Revenue by gym').rowCount, 1);
  selectedGym = 'Removed gym';
  selectedMetrics['Financial growth'] = 'Removed metric';
  selectedMetrics['User and demand growth'] = 'Removed metric';
  await syncAdminMetricsToGoogleSheets();
  assert.equal(selectedGym, 'All gyms', 'missing gym falls back to All gyms');
  assert.deepEqual(selectedMetrics, { 'Financial growth': 'All metrics', 'User and demand growth': 'All metrics' }, 'invalid metric selections reset safely');
  const duplicateGyms = { title: 'Financial growth', rows: 4, values: [['Gym', 'Date', 'Total', 'Day', 'Membership', 'MRR', 'Customers', 'ID'], ['All gyms (combined)', 46000, 30, 30, 0, 0, 2, 'all'], ['Twin Gym', 46000, 10, 10, 0, 0, 1, 'a'], ['Twin Gym', 46000, 20, 20, 0, 0, 1, 'b']] };
  const duplicateRequests = growthChartRequests([duplicateGyms], [{ properties: { sheetId: 1, title: duplicateGyms.title } }]);
  const options = duplicateRequests.find(request => request.updateCells?.range.startColumnIndex === 17).updateCells.rows;
  assert.deepEqual(options.slice(1).map(row => row.values[0].userEnteredValue.stringValue), ['All gyms', 'Twin Gym [a]', 'Twin Gym [b]']);
  console.log('PASS: section coverage, financial totals, gym lookup, filter categories, empty data, XLSX roundtrip, Google migration and repeat sync.');
})().catch(error => { console.error(error); process.exitCode = 1; });
