export const OVERVIEW_PERIODS = ["All time", "Past week", "Past month", "Past year"];

export function overviewPeriodRequests(sheetId: number, previousPeriod?: string, rowCount = 6) {
  const selected = OVERVIEW_PERIODS.includes(previousPeriod ?? "") ? previousPeriod! : "All time";
  return [
    { updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 2 }, rows: [
      { values: [{ userEnteredValue: { stringValue: "Overview period" } }, { userEnteredValue: { stringValue: selected } }] },
      { values: [{ userEnteredValue: { stringValue: "Period selector applies to user, demand, and purchase metrics. Financial summaries are all time." } }] },
    ], fields: "userEnteredValue" } },
    { updateCells: { range: { sheetId, startRowIndex: 3, endRowIndex: rowCount + 3, startColumnIndex: 0, endColumnIndex: 4 }, rows: [
      { values: [{ userEnteredValue: { stringValue: "Metric" } }, { userEnteredValue: { stringValue: "Value" } }, { userEnteredValue: { stringValue: "Period" } }, { userEnteredValue: { stringValue: "Meaning" } }] },
      ...Array.from({ length: rowCount - 1 }, (_, index) => ({ values: [
        { userEnteredValue: { formulaValue: `=J${index + 5}` } },
        { userEnteredValue: { formulaValue: `=IF(O${index + 5}="Selectable",INDEX(K${index + 5}:N${index + 5},1,MATCH($B$1,{"All time","Past week","Past month","Past year"},0)),IF(K${index + 5}="","",K${index + 5}))` } },
        { userEnteredValue: { formulaValue: `=IF(O${index + 5}="Selectable",$B$1,O${index + 5})` } },
        { userEnteredValue: { formulaValue: `=IF(P${index + 5}="","",P${index + 5})` } },
      ] })),
    ], fields: "userEnteredValue" } },
    { setDataValidation: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 }, rule: { condition: { type: "ONE_OF_LIST", values: OVERVIEW_PERIODS.map(userEnteredValue => ({ userEnteredValue })) }, strict: true, showCustomUi: true } } },
    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 4 }, properties: { hiddenByUser: false }, fields: "hiddenByUser" } },
    ...[24].filter(row => row < rowCount + 3).map(row => ({ repeatCell: { range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 0, endColumnIndex: 4 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.86, green: 0.95, blue: 0.89 }, textFormat: { bold: true } } }, fields: "userEnteredFormat(backgroundColor,textFormat)" } })),
    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 4, endIndex: 16 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.94, green: 0.99, blue: 0.96 }, textFormat: { bold: true } } }, fields: "userEnteredFormat" } },
    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 3, endIndex: 4 }, properties: { pixelSize: 360 }, fields: "pixelSize" } },
    { repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: rowCount + 3, startColumnIndex: 0, endColumnIndex: 4 }, cell: { userEnteredFormat: { wrapStrategy: "WRAP" } }, fields: "userEnteredFormat.wrapStrategy" } },
    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 460 }, fields: "pixelSize" } },
  ];
}
