/** Native Google Sheets charts and formulas; gym names are always written as text. */
export type GrowthSheet = { title: string; values: (string | number | boolean)[][]; rows: number };
export type ChartSheet = { properties?: { sheetId?: number; title?: string }; charts?: { chartId: number; spec?: { altText?: string } }[] };
const FINANCIAL = "Financial growth";
const DEMAND = "User and demand growth";
export const FINANCIAL_SELECTION_RANGE = "'Financial growth'!B1";

export function growthChartRequests(sheets: GrowthSheet[], metadata: ChartSheet[], previousSelection?: string) {
  const requests: object[] = [];
  for (const title of [FINANCIAL, DEMAND]) {
    const data = sheets.find(sheet => sheet.title === title);
    const existing = metadata.find(sheet => sheet.properties?.title === title);
    const sheetId = existing?.properties?.sheetId;
    if (!data || sheetId === undefined) continue;
    const financial = title === FINANCIAL;
    let chartStart = 27, chartEnd = 27 + Math.max(2, data.rows), firstColumn = 0;
    const range = (startRowIndex: number, endRowIndex: number, startColumnIndex: number, endColumnIndex: number) => ({ sheetId, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex });
    const textCell = (value: string) => ({ userEnteredValue: { stringValue: value } });
    requests.push(
      { repeatCell: { range: range(0, 2, 0, 8), cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: { fontFamily: "Arial", fontSize: 11 }, wrapStrategy: "WRAP" } }, fields: "userEnteredFormat" } },
      { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 2 }, properties: { pixelSize: 42 }, fields: "pixelSize" } },
    );
    if (!financial) requests.push({ updateCells: { range: range(0, 2, 0, 1), rows: [{ values: [textCell("User and demand growth")] }, { values: [textCell("Cumulative totals · UTC")] }], fields: "userEnteredValue" } });
    if (financial) {
      const gyms = new Map<string, string>();
      for (const row of data.values.slice(1)) if (row[7] !== "all") gyms.set(String(row[7]), String(row[0]));
      const names = [...gyms.values()];
      // IDs disambiguate gyms with the same display name without exposing IDs normally.
      const options = [["All gyms", "all"], ...[...gyms].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => [name === "All gyms" || names.filter(value => value === name).length > 1 ? `${name} [${id}]` : name, id])];
      const selected = options.some(([label]) => label === previousSelection) ? previousSelection! : "All gyms";
      const lastOptionRow = options.length + 1;
      const sourceEnd = 27 + Math.max(2, data.rows);
      const formula = `=IFERROR(SORT(FILTER($B$29:$G$${sourceEnd},$H$29:$H$${sourceEnd}=IFERROR(VLOOKUP($B$1,$R$2:$S$${lastOptionRow},2,FALSE),"all")),1,TRUE),"")`;
      chartStart = 27; firstColumn = 9;
      chartEnd = chartStart + Math.max(2, new Set(data.values.slice(1).map(row => row[1])).size + 1);
      requests.push(
        { updateCells: { range: range(0, 1, 0, 2), rows: [{ values: [textCell("Choose gym →"), textCell(selected)] }], fields: "userEnteredValue" } },
        { updateCells: { range: range(1, 2, 0, 2), rows: [{ values: [textCell("Cumulative totals · UTC")] }], fields: "userEnteredValue" } },
        { updateCells: { range: range(0, lastOptionRow, 17, 19), rows: [["Gym selection", "Gym ID"], ...options].map(row => ({ values: row.map(textCell) })), fields: "userEnteredValue" } },
        { setDataValidation: { range: range(0, 1, 1, 2), rule: { condition: { type: "ONE_OF_RANGE", values: [{ userEnteredValue: `='Financial growth'!$R$2:$R$${lastOptionRow}` }] }, strict: true, showCustomUi: true, inputMessage: "Choose All gyms or a single gym." } } },
        { updateCells: { range: range(27, 28, 9, 15), rows: [{ values: data.values[0].slice(1, 7).map(value => textCell(String(value))) }], fields: "userEnteredValue" } },
        { updateCells: { range: range(28, 29, 9, 10), rows: [{ values: [{ userEnteredValue: { formulaValue: formula } }] }], fields: "userEnteredValue" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 9, endIndex: 19 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
        { repeatCell: { range: range(28, chartEnd, 9, 10), cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "mmm d, yyyy" } } }, fields: "userEnteredFormat.numberFormat" } },
        { repeatCell: { range: range(28, chartEnd, 10, 14), cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: '"$"#,##0.00' } } }, fields: "userEnteredFormat.numberFormat" } },
        { repeatCell: { range: range(0, 1, 1, 2), cell: { userEnteredFormat: { backgroundColor: { red: 0.86, green: 0.98, blue: 0.9 }, textFormat: { bold: true }, wrapStrategy: "WRAP" } }, fields: "userEnteredFormat" } },
      );
    }
    const marker = `fitting-in:${financial ? "financial" : "demand"}-growth`;
    const source = (column: number) => ({ sourceRange: { sources: [range(chartStart, chartEnd, column, column + 1)] } });
    const spec = {
      title: financial ? "Financial growth — selected gym" : "User and demand growth",
      altText: marker,
      fontName: "Arial",
      hiddenDimensionStrategy: "SHOW_ALL",
      basicChart: {
        chartType: "LINE", legendPosition: "BOTTOM_LEGEND", headerCount: 1, interpolateNulls: false,
        axis: [
          { position: "BOTTOM_AXIS", title: "Date (UTC)" },
          { position: "LEFT_AXIS", title: financial ? "Revenue / monthly recurring revenue (USD)" : "Cumulative users and activity" },
          ...(financial ? [{ position: "RIGHT_AXIS", title: "Customers supplied" }] : []),
        ],
        domains: [{ domain: source(firstColumn) }],
        series: Array.from({ length: financial ? 5 : 7 }, (_, index) => ({ series: source(firstColumn + index + 1), targetAxis: financial && index === 4 ? "RIGHT_AXIS" : "LEFT_AXIS", pointStyle: { size: 3 } })),
      },
    };
    const chart = existing?.charts?.find(chart => chart.spec?.altText === marker);
    requests.push(
      { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 8 }, properties: { pixelSize: 150 }, fields: "pixelSize" } },
      chart ? { updateChartSpec: { chartId: chart.chartId, spec } } : { addChart: { chart: { spec, position: { overlayPosition: { anchorCell: { sheetId, rowIndex: 3, columnIndex: 0 }, widthPixels: 1050, heightPixels: 420 } } } } },
    );
  }
  return requests;
}
