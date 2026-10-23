import { overviewPeriodRequests } from "@/lib/google-sheets-overview";
import { claimClickRequests, CLAIM_CLICKS_TITLE, CLAIM_GYM_SELECTION_RANGE } from "@/lib/google-sheets-claim-clicks";
import { EASTERN_TIMESTAMP_FORMAT, METRICS_TIME_ZONE, easternTimestampSerial } from "@/lib/metrics-reporting-time";
import { growthChartRequests, FINANCIAL_SELECTION_RANGE, GROWTH_METRIC_SELECTION_RANGES } from "@/lib/google-sheets-growth-charts";
import { createSign } from "node:crypto";
import type ExcelJS from "exceljs";
import { buildAdminMetricsWorkbook } from "@/lib/admin-metrics-workbook";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");
const quoteSheet = (title: string) => `'${title.replace(/'/g, "''")}'`;

function requiredEnvironment() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!spreadsheetId || !clientEmail || !privateKey) {
    throw new Error("Google Sheets sync is not configured. Set GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.");
  }
  return { spreadsheetId, clientEmail, privateKey };
}

async function accessToken(clientEmail: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({ iss: clientEmail, scope: GOOGLE_SHEETS_SCOPE, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${base64url(signer.sign(privateKey))}`;
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
  });
  const result = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !result.access_token) throw new Error(result.error_description || "Google service-account authentication failed.");
  return result.access_token;
}

async function googleRequest<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Sheets API returned ${response.status}: ${detail.slice(0, 800)}`);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

type SheetValues = { startRow: number; title: string; values: (string | number | boolean)[][]; rows: number; columns: number; hidden: boolean; widths: number[]; hiddenColumns: number[]; moneyRows: number[]; formats: ({ type: string; pattern: string } | null)[] };

// Reuse existing tab IDs so bookmarks and saved filter views survive the migration.
const renamedTabs: Record<string, string> = {
  "Gym demand": "Gym demand funnel",
  "Gym claims": "Gym claim log",
};

function cellValue(cell: ExcelJS.Cell): string | number | boolean {
  const value = cell.value;
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return cell.text || String(value);
}

function worksheetValues(workbook: ExcelJS.Workbook): SheetValues[] {
  return workbook.worksheets.map(sheet => {
    const columns = Math.max(1, sheet.columnCount);
    const values: (string | number | boolean)[][] = [];
    const headers = Array.from({ length: columns }, (_, index) => sheet.getRow(1).getCell(index + 1).text);
    const formats = headers.map(header => {
      if (/^(Date|Created|Email verified|Last active|Last updated|Deleted at|Claimed when|Claimed at|Clicked|Clicked at|Confirmed at|Signed up at|Timestamp|Confirmation timestamp|User confirmed at|Gym confirmed at|Billing period start|Billing period end)$/.test(header)) return { type: header === "Date" || header.startsWith("Billing") ? "DATE" : "DATE_TIME", pattern: header === "Date" || header.startsWith("Billing") ? "mmm d, yyyy" : EASTERN_TIMESTAMP_FORMAT };
      if (/revenue|spending|spent|charge$|payment$|MRR|Monthly recurring/i.test(header) && !/charges/i.test(header)) return { type: "CURRENCY", pattern: '"$"#,##0.00' };
      if (/rate/i.test(header)) return { type: "NUMBER", pattern: '0.0"%"' };
      return null;
    });
    sheet.eachRow({ includeEmpty: true }, row => {
      values.push(Array.from({ length: columns }, (_, index) => {
        const value = cellValue(row.getCell(index + 1));
        if (row.number > 1 && formats[index]?.type.startsWith("DATE") && typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
          const timestamp = Date.parse(value);
          if (Number.isFinite(timestamp)) return formats[index]?.type === "DATE_TIME" ? easternTimestampSerial(value) : timestamp / 86_400_000 + 25569;
        }
        return value;
      }));
    });
    if (!values.length) values.push([""]);
    return { startRow: ["Financial growth", "User and demand growth"].includes(sheet.name) ? 27 : sheet.name === CLAIM_CLICKS_TITLE ? 4 : sheet.name === "Overview" ? 3 : 0, title: sheet.name, values, rows: values.length, columns, hidden: sheet.state !== "visible", widths: headers.map((_, index) => formats[index]?.type === "DATE_TIME" ? 260 : Math.min(360, Math.max(120, (sheet.getColumn(index + 1).width ?? 20) * 7))), moneyRows: ["Overview", "Financial Metrics"].includes(sheet.name) ? values.flatMap((row, index) => index > 0 && typeof row[1] === "number" && /revenue|MRR/i.test(String(row[0])) && !/Revenue-generating gyms/.test(String(row[0])) ? [index] : []) : [], hiddenColumns: headers.flatMap((_, index) => sheet.getColumn(index + 1).hidden ? [index] : []), formats };
  });
}

type SpreadsheetMetadata = { sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { rowCount?: number; columnCount?: number } }; charts?: { chartId: number; spec?: { altText?: string } }[]; bandedRanges?: { bandedRangeId: number }[] }[] };

function valueChunks(sheet: SheetValues) {
  const chunks: { range: string; majorDimension: "ROWS"; values: SheetValues["values"] }[] = [];
  let start = 0;
  while (start < sheet.values.length) {
    let end = start;
    let bytes = 0;
    while (end < sheet.values.length && end - start < 5_000) {
      const rowBytes = Buffer.byteLength(JSON.stringify(sheet.values[end]), "utf8");
      if (end > start && bytes + rowBytes > 900_000) break;
      bytes += rowBytes;
      end += 1;
    }
    chunks.push({ range: `${quoteSheet(sheet.title)}!${sheet.title === "Financial growth" ? "AD" : sheet.title === CLAIM_CLICKS_TITLE ? "U" : sheet.title === "Overview" ? "J" : "A"}${sheet.startRow + start + 1}`, majorDimension: "ROWS", values: sheet.values.slice(start, end) });
    start = end;
  }
  return chunks;
}

export function googleMetricsSheetUrl() {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  return id ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit` : null;
}

export async function syncAdminMetricsToGoogleSheets() {
  const { spreadsheetId, clientEmail, privateKey } = requiredEnvironment();
  const [token, workbook] = await Promise.all([accessToken(clientEmail, privateKey), buildAdminMetricsWorkbook()]);
  const sheets = worksheetValues(workbook);
  const baseUrl = `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}`;
  let metadata = await googleRequest<SpreadsheetMetadata>(`${baseUrl}?fields=sheets(properties,bandedRanges.bandedRangeId,charts(chartId,spec.altText))`, token);
  // Read all controls before the managed refresh clears their cells.
  const controls = [
    { key: "overviewPeriod", title: "Overview", range: "'Overview'!B1" },
    { key: "claimGym", title: CLAIM_CLICKS_TITLE, range: CLAIM_GYM_SELECTION_RANGE },
    { key: "gym", title: "Financial growth", range: FINANCIAL_SELECTION_RANGE },
    ...Object.entries(GROWTH_METRIC_SELECTION_RANGES).map(([title, range]) => ({ key: title, title, range })),
  ].filter(control => metadata.sheets?.some(sheet => sheet.properties?.title === control.title));
  const selections = await Promise.all(controls.map(async control => {
    const response = await googleRequest<{ values?: unknown[][] }>(`${baseUrl}/values/${encodeURIComponent(control.range)}`, token);
    return [control.key, typeof response.values?.[0]?.[0] === "string" ? response.values[0][0] : ""] as const;
  }));
  const previousSelections = Object.fromEntries(selections);
  const renames = (metadata.sheets ?? []).flatMap(sheet => {
    const title = sheet.properties?.title;
    const target = title ? renamedTabs[title] : undefined;
    return target && !(metadata.sheets ?? []).some(item => item.properties?.title === target)
      ? [{ updateSheetProperties: { properties: { sheetId: sheet.properties!.sheetId, title: target }, fields: "title" } }] : [];
  });
  if (renames.length) {
    await googleRequest(`${baseUrl}:batchUpdate`, token, { method: "POST", body: JSON.stringify({ requests: renames }) });
    metadata = await googleRequest<SpreadsheetMetadata>(`${baseUrl}?fields=sheets(properties,bandedRanges.bandedRangeId,charts(chartId,spec.altText))`, token);
  }
  const existingTitles = new Set((metadata.sheets ?? []).map(sheet => sheet.properties?.title).filter(Boolean));
  const missing = sheets.filter(sheet => !existingTitles.has(sheet.title));
  if (missing.length) {
    await googleRequest(`${baseUrl}:batchUpdate`, token, { method: "POST", body: JSON.stringify({ requests: missing.map(sheet => ({ addSheet: { properties: { title: sheet.title, gridProperties: { rowCount: Math.max(1_000, sheet.rows + sheet.startRow + 30), columnCount: Math.max(sheet.title === CLAIM_CLICKS_TITLE ? 38 : sheet.title === "Financial growth" ? 37 : sheet.startRow ? 28 : 26, sheet.columns) } } } })) }) });
    metadata = await googleRequest<SpreadsheetMetadata>(`${baseUrl}?fields=sheets(properties,bandedRanges.bandedRangeId,charts(chartId,spec.altText))`, token);
  }

  const propertiesByTitle = new Map((metadata.sheets ?? []).flatMap(sheet => sheet.properties?.title && sheet.properties.sheetId !== undefined ? [[sheet.properties.title, sheet.properties] as const] : []));
  const formatRequests = [{ updateSpreadsheetProperties: { properties: { timeZone: METRICS_TIME_ZONE }, fields: "timeZone" } }, ...sheets.flatMap((sheet, index) => {
    const properties = propertiesByTitle.get(sheet.title);
    if (!properties || properties.sheetId === undefined) throw new Error(`Google Sheet tab was not created: ${sheet.title}`);
    const rowCount = Math.max(properties.gridProperties?.rowCount ?? 0, sheet.rows + sheet.startRow + 30, sheet.title === CLAIM_CLICKS_TITLE ? (sheets.find(item => item.title === "Gym financials")?.rows ?? 0) + 1 : 0, 1_000);
    const columnCount = Math.max(properties.gridProperties?.columnCount ?? 0, sheet.columns, sheet.title === CLAIM_CLICKS_TITLE ? 38 : sheet.title === "Financial growth" ? 37 : sheet.startRow ? 28 : 26);
    const sheetId = properties.sheetId;
    const tableRows = sheet.title === "Financial growth" ? new Set(sheet.values.slice(1).map(row => row[1])).size + 1 : sheet.rows;
    const tableColumns = sheet.title === CLAIM_CLICKS_TITLE ? 13 : sheet.title === "Financial growth" ? 5 : sheet.title === "Overview" ? 4 : sheet.columns;
    const range = { sheetId, startRowIndex: sheet.startRow, endRowIndex: sheet.startRow + Math.max(2, tableRows), startColumnIndex: 0, endColumnIndex: tableColumns };
    return [
      { updateSheetProperties: { properties: { sheetId, index, hidden: sheet.hidden, gridProperties: { rowCount, columnCount, frozenRowCount: sheet.title === CLAIM_CLICKS_TITLE ? 5 : sheet.startRow ? 2 : 1, frozenColumnCount: 1, hideGridlines: true } }, fields: "index,hidden,gridProperties(rowCount,columnCount,frozenRowCount,frozenColumnCount,hideGridlines)" } },
      { repeatCell: { range, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: { fontFamily: "Arial", fontSize: 10 }, verticalAlignment: "MIDDLE", wrapStrategy: "CLIP", numberFormat: { type: "NUMBER", pattern: "0.##" } } }, fields: "userEnteredFormat" } },
      { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: sheet.startRow, endIndex: sheet.startRow + 1 }, properties: { pixelSize: 60 }, fields: "pixelSize" } },
      { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: columnCount }, properties: { hiddenByUser: false }, fields: "hiddenByUser" } },
      ...sheet.widths.map((pixelSize, column) => ({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: column, endIndex: column + 1 }, properties: { pixelSize, hiddenByUser: sheet.hiddenColumns.includes(column) }, fields: "pixelSize,hiddenByUser" } })),
      ...sheet.formats.flatMap((numberFormat, column) => numberFormat ? [{ repeatCell: { range: { ...range, startRowIndex: sheet.startRow + 1, startColumnIndex: column, endColumnIndex: column + 1 }, cell: { userEnteredFormat: { numberFormat } }, fields: "userEnteredFormat.numberFormat" } }] : []),
      ...sheet.moneyRows.map(row => ({ repeatCell: { range: { sheetId, startRowIndex: row + sheet.startRow, endRowIndex: row + sheet.startRow + 1, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: '"$"#,##0.00' } } }, fields: "userEnteredFormat.numberFormat" } })),
      ...(metadata.sheets?.find(item => item.properties?.sheetId === sheetId)?.bandedRanges ?? []).map(band => ({ deleteBanding: { bandedRangeId: band.bandedRangeId } })),
      { addBanding: { bandedRange: { range, rowProperties: { headerColor: { red: 0.133, green: 0.773, blue: 0.369 }, firstBandColor: { red: 1, green: 1, blue: 1 }, secondBandColor: { red: 0.94, green: 0.99, blue: 0.96 } } } } },
      { repeatCell: { range: { sheetId: properties.sheetId, startRowIndex: sheet.startRow, endRowIndex: sheet.startRow + 1, startColumnIndex: 0, endColumnIndex: tableColumns }, cell: { userEnteredFormat: { wrapStrategy: "WRAP", backgroundColor: { red: 0.133, green: 0.773, blue: 0.369 }, textFormat: { bold: true, foregroundColor: { red: 0, green: 0, blue: 0 } } } }, fields: "userEnteredFormat(backgroundColor,textFormat,wrapStrategy)" } },
      ["Financial growth", CLAIM_CLICKS_TITLE, "Overview"].includes(sheet.title) ? { clearBasicFilter: { sheetId } } : { setBasicFilter: { filter: { range } } },
    ];
  })];

  for (let index = 0; index < formatRequests.length; index += 100) {
    await googleRequest(`${baseUrl}:batchUpdate`, token, { method: "POST", body: JSON.stringify({ requests: formatRequests.slice(index, index + 100) }) });
  }
  await googleRequest(`${baseUrl}/values:batchClear`, token, { method: "POST", body: JSON.stringify({ ranges: sheets.map(sheet => quoteSheet(sheet.title)) }) });
  const chunks = sheets.flatMap(valueChunks);
  for (let index = 0; index < chunks.length; index += 10) {
    await googleRequest(`${baseUrl}/values:batchUpdate`, token, { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data: chunks.slice(index, index + 10) }) });
  }
  const chartRequests = [...growthChartRequests(sheets, metadata.sheets ?? [], previousSelections.gym, previousSelections), ...claimClickRequests(sheets, propertiesByTitle.get(CLAIM_CLICKS_TITLE)!.sheetId!, previousSelections.claimGym), ...overviewPeriodRequests(propertiesByTitle.get("Overview")!.sheetId!, previousSelections.overviewPeriod, sheets.find(sheet => sheet.title === "Overview")!.rows)];
  for (let index = 0; index < chartRequests.length; index += 100) {
    await googleRequest(`${baseUrl}:batchUpdate`, token, { method: "POST", body: JSON.stringify({ requests: chartRequests.slice(index, index + 100) }) });
  }
  // Retire only the obsolete managed tabs, after replacement reports succeed.
  const retired = (metadata.sheets ?? []).filter(sheet => ["Gym demand", "Gym claims", "Gym claim log", "Gym demand funnel", "Revenue by gym", "Unclaimed gym opportunity", "User spending", "Landing-page demand", "Financial Metrics", "Claim activity log", "Claim activity", "Fitting In Metrics", "Start here", "User gym access", "Signup activity", "Financial ledger", "Daily metrics", "Daily gym demand", "Daily filter usage", "Daily city activity", "Raw events", "Audit notes"].includes(sheet.properties?.title ?? "") && sheet.properties?.sheetId !== undefined);
  if (retired.length) {
    await googleRequest(`${baseUrl}:batchUpdate`, token, { method: "POST", body: JSON.stringify({ requests: retired.map(sheet => ({ deleteSheet: { sheetId: sheet.properties!.sheetId } })) }) });
  }
  return { spreadsheetId, tabs: sheets.length, rows: sheets.reduce((sum, sheet) => sum + sheet.rows, 0), syncedAt: new Date().toISOString() };
}
