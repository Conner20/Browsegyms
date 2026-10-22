export const CLAIM_CLICKS_TITLE = "Gym claim clicks";
export const CLAIM_GYM_SELECTION_RANGE = "'Gym claim clicks'!B1";

type DataSheet = { title: string; rows: number; values: (string | number | boolean)[][] };

export function claimClickRequests(sheets: DataSheet[], sheetId: number, previousGym?: string) {
  const source = sheets.find(sheet => sheet.title === CLAIM_CLICKS_TITLE)!;
  const directory = sheets.find(sheet => sheet.title === "Revenue by gym")!;
  const idColumn = directory.values[0].indexOf("Gym ID");
  const gyms = directory.values.slice(1).map(row => ({ name: String(row[0]), id: String(row[idColumn]) }));
  const options = [["Select a gym", ""], ...gyms.map(gym => [gyms.filter(other => other.name === gym.name).length > 1 || gym.name === "Select a gym" ? `${gym.name} [${gym.id}]` : gym.name, gym.id])];
  const selected = options.some(([name]) => name === previousGym) ? previousGym! : "Select a gym";
  const end = Math.max(6, source.rows + 4);
  const lookup = `$R$1:$S$${options.length}`;
  const id = `VLOOKUP($B$1,${lookup},2,FALSE)`;
  const cells = (row: number, column: number, values: { userEnteredValue: { stringValue?: string; formulaValue?: string } }[][]) => ({ updateCells: { range: { sheetId, startRowIndex: row, endRowIndex: row + values.length, startColumnIndex: column, endColumnIndex: column + values[0].length }, rows: values.map(values => ({ values })), fields: "userEnteredValue" } });
  const text = (stringValue: string) => ({ userEnteredValue: { stringValue } });
  return [
    cells(0, 0, [[text("Gym"), text(selected)]]),
    cells(1, 0, [[text("Users who clicked Claim Day Pass or Claim Membership")]]),
    cells(2, 0, [[{ userEnteredValue: { formulaValue: `=IF($B$1="Select a gym",IF(COUNT($M$6:$M$${end})=0,"No claim clicks yet.","Showing all gyms — most recently clicked first."),IF(COUNTIF($P$6:$P$${end},${id})=0,"No claim clicks for this gym.","Showing claim clicks for "&$B$1))` } }]]),
    cells(0, 17, options.map(row => row.map(text))),
    cells(4, 0, [source.values[0].slice(0, 6).map(value => text(String(value)))]),
    cells(5, 0, [[{ userEnteredValue: { formulaValue: `=IFERROR(SORT(IF($B$1="Select a gym",FILTER($J$6:$O$${end},$M$6:$M$${end}<>""),FILTER($J$6:$O$${end},$P$6:$P$${end}=${id})),4,FALSE),"")` } }]]),
    { setDataValidation: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 }, rule: { condition: { type: "ONE_OF_RANGE", values: [{ userEnteredValue: `=$R$1:$R$${options.length}` }] }, strict: true, showCustomUi: true } } },
    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 6, endIndex: 20 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 6 }, cell: { userEnteredFormat: { textFormat: { fontFamily: "Arial", fontSize: 11 }, wrapStrategy: "OVERFLOW_CELL" } }, fields: "userEnteredFormat" } },
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.94, green: 0.99, blue: 0.96 }, textFormat: { bold: true } } }, fields: "userEnteredFormat" } },
  ];
}
