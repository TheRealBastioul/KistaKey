// RFC 4180 CSV: quoted fields with "" escapes, commas and newlines inside
// quotes, CRLF or LF line ends, a leading BOM. Lenient where exporters are
// sloppy (a stray quote inside an unquoted field is kept as text).

export type CsvRow = string[];

export function parseCsv(text: string): CsvRow[] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: CsvRow[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // Skip blank lines (one empty field).
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const ch = input[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === ",") {
      endField();
    } else if (ch === "\r" || ch === "\n") {
      endRow();
      if (ch === "\r" && input[i + 1] === "\n") i++;
    } else {
      field += ch;
    }
    i++;
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/** One record per data row, keyed by lowercased, trimmed header. Missing cells are "". */
export function csvRecords(text: string): { headers: string[]; records: Record<string, string>[] } {
  const [header, ...rows] = parseCsv(text);
  const headers = (header ?? []).map((h) => h.trim().toLowerCase());
  const records = rows.map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((name, index) => {
      if (name && record[name] === undefined) record[name] = cells[index] ?? "";
    });
    return record;
  });
  return { headers, records };
}

function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) || /^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Rows → CSV text (CRLF line ends, quoted only where needed). */
export function toCsv(rows: string[][]): string {
  return `${rows.map((row) => row.map(escapeCell).join(",")).join("\r\n")}\r\n`;
}
