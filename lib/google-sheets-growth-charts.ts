/** Native Google Sheets charts and formulas; gym names are always written as text. */
export type GrowthSheet = { title: string; values: (string | number | boolean)[][]; rows: number };
export type ChartSheet = { properties?: { sheetId?: number; title?: string }; charts?: { chartId: number; spec?: { altText?: string } }[] };
const FINANCIAL = "Financial growth";
const DEMAND = "User and demand growth";
export const FINANCIAL_SELECTION_RANGE = "'Financial growth'!B1";

export const GROWTH_METRIC_SELECTION_RANGES: Record<string, string> = {
  [FINANCIAL]: "'Financial growth'!E1",
  [DEMAND]: "'User and demand growth'!E1",
};

export function growthChartRequests(sheets: GrowthSheet[], metadata: ChartSheet[], previousSelection?: string, previousMetrics: Record<string, string> = {}) {
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
    if (!financial) requests.push({ updateCells: { range: range(0, 2, 0, 1), rows: [{ values: [textCell("User and demand growth")] }, { values: [textCell("Cumulative totals · DC time")] }], fields: "userEnteredValue" } });
    if (financial) {
      const gyms = new Map<string, string>();
      for (const row of data.values.slice(1)) if (row[6] !== "all") gyms.set(String(row[6]), String(row[0]));
      const names = [...gyms.values()];
      // IDs disambiguate gyms with the same display name without exposing IDs normally.
      const options = [["All gyms", "all"], ...[...gyms].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => [name === "All gyms" || names.filter(value => value === name).length > 1 ? `${name} [${id}]` : name, id])];
      const selected = options.some(([label]) => label === previousSelection) ? previousSelection! : "All gyms";
      const lastOptionRow = options.length + 1;
      const sourceEnd = 27 + Math.max(2, data.rows);
      const formula = `=IFERROR(SORT(FILTER($AE$29:$AI$${sourceEnd},$AJ$29:$AJ$${sourceEnd}=IFERROR(VLOOKUP($B$1,$R$2:$S$${lastOptionRow},2,FALSE),"all")),1,TRUE),"")`;
      chartStart = 27; firstColumn = 9;
      chartEnd = chartStart + Math.max(2, new Set(data.values.slice(1).map(row => row[1])).size + 1);
      requests.push(
        { updateCells: { range: range(0, 1, 0, 2), rows: [{ values: [textCell("Choose gym →"), textCell(selected)] }], fields: "userEnteredValue" } },
        { updateCells: { range: range(1, 2, 0, 2), rows: [{ values: [textCell("Cumulative totals · DC time")] }], fields: "userEnteredValue" } },
        { updateCells: { range: range(0, lastOptionRow, 17, 19), rows: [["Gym selection", "Gym ID"], ...options].map(row => ({ values: row.map(textCell) })), fields: "userEnteredValue" } },
        { setDataValidation: { range: range(0, 1, 1, 2), rule: { condition: { type: "ONE_OF_RANGE", values: [{ userEnteredValue: `='Financial growth'!$R$2:$R$${lastOptionRow}` }] }, strict: true, showCustomUi: true, inputMessage: "Choose All gyms or a single gym." } } },
        { updateCells: { range: range(27, 28, 9, 14), rows: [{ values: data.values[0].slice(1, 6).map(value => textCell(String(value))) }], fields: "userEnteredValue" } },
        { updateCells: { range: range(28, 29, 9, 10), rows: [{ values: [{ userEnteredValue: { formulaValue: formula } }] }], fields: "userEnteredValue" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 9, endIndex: 19 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
        { repeatCell: { range: range(28, chartEnd, 9, 10), cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "mmm d, yyyy" } } }, fields: "userEnteredFormat.numberFormat" } },
        { repeatCell: { range: range(28, chartEnd, 10, 13), cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: '"$"#,##0.00' } } }, fields: "userEnteredFormat.numberFormat" } },
        { repeatCell: { range: range(0, 1, 1, 2), cell: { userEnteredFormat: { backgroundColor: { red: 0.86, green: 0.98, blue: 0.9 }, textFormat: { bold: true }, wrapStrategy: "WRAP" } }, fields: "userEnteredFormat" } },
      );
    }
    const metricNames = data.values[0].slice(financial ? 2 : 1, financial ? 6 : 8).map(String);
    const metric = metricNames.includes(previousMetrics[title]) ? previousMetrics[title] : "All metrics";
    requests.push(
      { updateCells: { range: range(0, 1, 3, 5), rows: [{ values: [textCell("Choose metric →"), textCell(metric)] }], fields: "userEnteredValue" } },
      { setDataValidation: { range: range(0, 1, 4, 5), rule: { condition: { type: "ONE_OF_LIST", values: ["All metrics", ...metricNames].map(userEnteredValue => ({ userEnteredValue })) }, strict: true, showCustomUi: true, inputMessage: "Show all metrics together or one metric at a time." } } },
      { repeatCell: { range: range(0, 1, 4, 5), cell: { userEnteredFormat: { backgroundColor: { red: 0.86, green: 0.98, blue: 0.9 }, textFormat: { bold: true }, wrapStrategy: "WRAP" } }, fields: "userEnteredFormat" } },
    );
    // Empty strings suppress unselected series without exposing error labels in charts.
    const columnLetter = (index: number) => String.fromCharCode(65 + index);
    const rawDate = columnLetter(firstColumn);
    const headerRow = chartStart + 1, firstDataRow = headerRow + 1;
    const formulaCell = (formulaValue: string) => ({ userEnteredValue: { formulaValue } });
    const headerCells = [textCell("Date"), ...metricNames.map((_, index) => {
      const header = `$${columnLetter(firstColumn + index + 1)}$${headerRow}`;
      return formulaCell(`=IF(OR($E$1="All metrics",$E$1=${header}),${header},"")`);
    })];
    const dataCells = [formulaCell(`=ARRAYFORMULA(IF($${rawDate}$${firstDataRow}:$${rawDate}$${chartEnd}="","",$${rawDate}$${firstDataRow}:$${rawDate}$${chartEnd}))`), ...metricNames.map((_, index) => {
      const column = columnLetter(firstColumn + index + 1);
      return formulaCell(`=ARRAYFORMULA(IF($${rawDate}$${firstDataRow}:$${rawDate}$${chartEnd}="","",IF(OR($E$1="All metrics",$E$1=$${column}$${headerRow}),$${column}$${firstDataRow}:$${column}$${chartEnd},"")))`);
    })];
    firstColumn = 20;
    requests.push(
      { updateCells: { range: range(chartStart, chartStart + 2, firstColumn, firstColumn + metricNames.length + 1), rows: [{ values: headerCells }, { values: dataCells }], fields: "userEnteredValue" } },
      { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 20, endIndex: 28 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
      { repeatCell: { range: range(chartStart + 1, chartEnd, 20, 21), cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "mmm d, yyyy" } } }, fields: "userEnteredFormat.numberFormat" } },
      { repeatCell: { range: range(chartStart + 1, chartEnd, 21, financial ? 24 : 28), cell: { userEnteredFormat: { numberFormat: financial ? { type: "CURRENCY", pattern: '"$"#,##0.00' } : { type: "NUMBER", pattern: "0" } } }, fields: "userEnteredFormat.numberFormat" } },
    );
    if (financial) {
      // The visible table and chart share the same gym-filtered data. Compact the
      // table to Date + the selected metric, or show all metrics for that gym.
      const selectedRows = `FILTER($J$28:$N$${chartEnd},$J$28:$J$${chartEnd}<>"")`;
      const tableFormula = `=IFERROR(IF($E$1="All metrics",${selectedRows},CHOOSECOLS(${selectedRows},1,MATCH($E$1,$J$28:$N$28,0))),"")`;
      requests.push(
        { updateCells: { range: range(27, 28, 0, 1), rows: [{ values: [formulaCell(tableFormula)] }], fields: "userEnteredValue" } },
        { clearBasicFilter: { sheetId } },
        ...[13, 24].map(column => ({ repeatCell: { range: range(28, chartEnd, column, column + 1), cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "0" } } }, fields: "userEnteredFormat.numberFormat" } })),
        { updateCells: { range: range(1, 2, 3, 6), rows: [{ values: [textCell("Revenue in USD; customers are counts.")] }], fields: "userEnteredValue" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 29, endIndex: 37 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
        { repeatCell: { range: range(28, chartEnd, 0, 1), cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "mmm d, yyyy" } } }, fields: "userEnteredFormat.numberFormat" } },
        // A metric can move to column B when selected. Neutral numeric formatting
        // avoids formatting customer counts as dollars or revenue as dates.
        { repeatCell: { range: range(28, chartEnd, 1, 6), cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0.##" } } }, fields: "userEnteredFormat.numberFormat" } },
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
          { position: "BOTTOM_AXIS", title: "Date (DC time)" },
          { position: "LEFT_AXIS", title: financial ? "Revenue (USD)" : "Cumulative users and activity" },
          ...(financial ? [{ position: "RIGHT_AXIS", title: "Customers supplied" }] : []),
        ],
        domains: [{ domain: source(firstColumn) }],
        series: Array.from({ length: metricNames.length }, (_, index) => ({ series: source(firstColumn + index + 1), targetAxis: financial && index === 3 ? "RIGHT_AXIS" : "LEFT_AXIS", pointStyle: { size: 3 }, dataLabel: { type: "NONE" } })),
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
