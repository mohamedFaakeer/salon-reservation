/**
 * A minimal RFC4180 reader — quoted fields, embedded commas, doubled-quote
 * escaping, `\r\n` or `\n` line endings. Deliberately not a library: this
 * project keeps dependencies to what earns its place (CLAUDE.md §3), and a
 * "product name, price, a handful of columns" template doesn't need one.
 * Returns one object per data row, keyed by the trimmed, lower-cased header.
 */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows = splitRows(text);
  if (rows.length === 0) {
    return [];
  }
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((key, i) => {
      record[key] = (cells[i] ?? "").trim();
    });
    return record;
  });
}

function splitRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim().length > 0)) {
    rows.push(row);
  }
  return rows;
}
