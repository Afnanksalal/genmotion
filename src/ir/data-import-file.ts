import { open } from 'node:fs/promises';
import { GenmotionError } from '../errors.js';

export async function readFrozenDataFile(file: string): Promise<string> {
  const handle = await open(file, 'r');
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > 8 * 1024 * 1024) throw new GenmotionError('DATA_SIZE_LIMIT', 'Data source must be a regular file of at most 8 MiB.');
    const chunks: Buffer[] = []; let bytes = 0;
    while (bytes <= 8 * 1024 * 1024) {
      const chunk = Buffer.alloc(Math.min(65536, 8 * 1024 * 1024 + 1 - bytes));
      const read = await handle.read(chunk, 0, chunk.length, null);
      if (!read.bytesRead) break;
      bytes += read.bytesRead; chunks.push(chunk.subarray(0, read.bytesRead));
    }
    if (bytes > 8 * 1024 * 1024) throw new GenmotionError('DATA_SIZE_LIMIT', 'Data source grew beyond 8 MiB while reading.');
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks)); }
    catch { throw new GenmotionError('DATA_ENCODING', 'Data source must contain valid UTF-8 text.'); }
  } finally { await handle.close(); }
}
