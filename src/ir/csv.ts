/** RFC 4180 quoting, including embedded newlines and doubled quotes. */
export function csvRows(content: string, maxCells = Infinity): string[][] {
  const rows: string[][] = [];
  let cells = 0;
  let row: string[] = [], cell = '', quoted = false, closed = false;
  const emitCell = (): void => { if (++cells > maxCells) throw new Error('CSV exceeds its cell budget.'); row.push(cell); cell = ''; closed = false; };
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!;
    if (quoted) {
      if (character === '"') {
        if (content[index + 1] === '"') { cell += '"'; index += 1; }
        else { quoted = false; closed = true; }
      } else cell += character;
    } else if (character === ',') emitCell();
    else if (character === '\r' || character === '\n') {
      if (character === '\r' && content[index + 1] === '\n') index += 1;
      emitCell(); rows.push(row); row = [];
    } else if (character === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || character === '"') throw new Error('Malformed CSV quoting.');
      cell += character;
    }
  }
  if (quoted) throw new Error('Unterminated CSV quoted cell.');
  if (cell || row.length || closed) { emitCell(); rows.push(row); }
  return rows;
}
