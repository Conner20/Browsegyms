export const OVERVIEW_PERIODS = ["All time", "Past week", "Past month", "Past year"];

export function overviewPeriodRequests(sheetId: number, previousPeriod?: string) {
  const selected = OVERVIEW_PERIODS.includes(previousPeriod ?? "") ? previousPeriod! : "All time";
  return [
    { updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 2 }, rows: [
      { values: [{ userEnteredValue: { stringValue: "Overview period" } }, { userEnteredValue: { stringValue: selected } }] },
      { values: [{ userEnteredValue: { stringValue: "Past week/month/year = last 7/30/365 days as of the latest sync." } }] },
    ], fields: "userEnteredValue" } },
    { updateCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 9, startColumnIndex: 0, endColumnIndex: 2 }, rows: [
      { values: [{ userEnteredValue: { stringValue: "Metric" } }, { userEnteredValue: { stringValue: "Value" } }] },
      ...Array.from({ length: 5 }, (_, index) => ({ values: [
        { userEnteredValue: { formulaValue: `=J${index + 5}` } },
        { userEnteredValue: { formulaValue: `=INDEX(K${index + 5}:N${index + 5},1,MATCH($B$1,{"All time","Past week","Past month","Past year"},0))` } },
      ] })),
    ], fields: "userEnteredValue" } },
    { setDataValidation: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 }, rule: { condition: { type: "ONE_OF_LIST", values: OVERVIEW_PERIODS.map(userEnteredValue => ({ userEnteredValue })) }, strict: true, showCustomUi: true } } },
    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 14 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.94, green: 0.99, blue: 0.96 }, textFormat: { bold: true } } }, fields: "userEnteredFormat" } },
    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 460 }, fields: "pixelSize" } },
  ];
}
