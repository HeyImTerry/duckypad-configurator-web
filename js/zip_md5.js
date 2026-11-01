// Zero-dependency ZIP Archive Reader/Writer & MD5 Hash Utility for duckyPad Configurator Web
// Supports Store (method 0) and Deflate (method 8 via browser CompressionStream/DecompressionStream)

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZipMD5 = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const utf8Encoder = new TextEncoder();
  const utf8Decoder = new TextDecoder('utf-8');

  // ---------------- MD5 IMPLEMENTATION (RFC 1321) ----------------
  function md5Bytes(input) {
    const data = input instanceof Uint8Array ? input : utf8Encoder.encode(String(input));
    const origBitLen = data.length * 8;
    const padLen = ((56 - ((data.length + 1) % 64)) + 64) % 64;
    const totalLen = data.length + 1 + padLen + 8;
    const buf = new Uint8Array(totalLen);
    buf.set(data, 0);
    buf[data.length] = 0x80;

    const view = new DataView(buf.buffer);
    view.setUint32(totalLen - 8, origBitLen >>> 0, true);
    view.setUint32(totalLen - 4, Math.floor(origBitLen / 0x100000000) >>> 0, true);

    function rotl(x, n) {
      return (x << n) | (x >>> (32 - n));
    }

    const K = new Uint32Array(64);
    for (let i = 0; i < 64; i++) {
      K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
    }
    const S = [
      7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
    ];

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;

    const M = new Uint32Array(16);
    for (let offset = 0; offset < totalLen; offset += 64) {
      for (let j = 0; j < 16; j++) {
        M[j] = view.getUint32(offset + j * 4, true);
      }
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) {
          F = (B & C) | (~B & D);
          g = i;
        } else if (i < 32) {
          F = (D & B) | (~D & C);
          g = (5 * i + 1) % 16;
        } else if (i < 48) {
          F = B ^ C ^ D;
          g = (3 * i + 5) % 16;
        } else {
          F = C ^ (B | ~D);
          g = (7 * i) % 16;
        }
        F = (F + A + K[i] + M[g]) >>> 0;
        A = D;
        D = C;
        C = B;
        B = (B + rotl(F, S[i])) >>> 0;
      }
      a0 = (a0 + A) >>> 0;
      b0 = (b0 + B) >>> 0;
      c0 = (c0 + C) >>> 0;
      d0 = (d0 + D) >>> 0;
    }

    const out = new Uint8Array(16);
    const outView = new DataView(out.buffer);
    outView.setUint32(0, a0, true);
    outView.setUint32(4, b0, true);
    outView.setUint32(8, c0, true);
    outView.setUint32(12, d0, true);
    return out;
  }

  function md5Hex(input) {
    const bytes = md5Bytes(input);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  // ---------------- CRC32 ----------------
  const CRC_TABLE = (function () {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // ---------------- ZIP WRITER ----------------
  // files: Array of { path: string, data: Uint8Array | string }
  function createZip(files) {
    const entries = [];
    let localOffset = 0;

    const now = new Date();
    const dosTime = ((now.getHours() & 0x1F) << 11) | ((now.getMinutes() & 0x3F) << 5) | ((now.getSeconds() >> 1) & 0x1F);
    const dosDate = (((now.getFullYear() - 1980) & 0x7F) << 9) | (((now.getMonth() + 1) & 0x0F) << 5) | (now.getDate() & 0x1F);

    for (const file of files) {
      const cleanPath = file.path.replace(/^[/\\]+/, '').replace(/\\/g, '/');
      const nameBytes = utf8Encoder.encode(cleanPath);
      const dataBytes = file.data instanceof Uint8Array ? file.data : utf8Encoder.encode(String(file.data));
      const crc = crc32(dataBytes);
      const size = dataBytes.length;

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lhView = new DataView(localHeader.buffer);
      lhView.setUint32(0, 0x04034b50, true); // Local file header signature
      lhView.setUint16(4, 20, true);         // Version needed to extract
      lhView.setUint16(6, 0x0800, true);     // General purpose bit flag (UTF-8)
      lhView.setUint16(8, 0, true);          // Compression method: 0 (Store)
      lhView.setUint16(10, dosTime, true);
      lhView.setUint16(12, dosDate, true);
      lhView.setUint32(14, crc, true);
      lhView.setUint32(18, size, true);
      lhView.setUint32(22, size, true);
      lhView.setUint16(26, nameBytes.length, true);
      lhView.setUint16(28, 0, true);         // Extra field length
      localHeader.set(nameBytes, 30);

      entries.push({
        nameBytes,
        dataBytes,
        localHeader,
        crc,
        size,
        dosTime,
        dosDate,
        localOffset,
      });

      localOffset += localHeader.length + dataBytes.length;
    }

    const centralHeaders = [];
    let centralSize = 0;

    for (const entry of entries) {
      const cdHeader = new Uint8Array(46 + entry.nameBytes.length);
      const cdView = new DataView(cdHeader.buffer);
      cdView.setUint32(0, 0x02014b50, true); // Central directory signature
      cdView.setUint16(4, 20, true);         // Version made by
      cdView.setUint16(6, 20, true);         // Version needed
      cdView.setUint16(8, 0x0800, true);     // UTF-8 flag
      cdView.setUint16(10, 0, true);         // Method: Store
      cdView.setUint16(12, entry.dosTime, true);
      cdView.setUint16(14, entry.dosDate, true);
      cdView.setUint32(16, entry.crc, true);
      cdView.setUint32(20, entry.size, true);
      cdView.setUint32(24, entry.size, true);
      cdView.setUint16(28, entry.nameBytes.length, true);
      cdView.setUint16(30, 0, true);         // Extra len
      cdView.setUint16(32, 0, true);         // Comment len
      cdView.setUint16(34, 0, true);         // Disk number
      cdView.setUint16(36, 0, true);         // Internal attrs
      cdView.setUint32(38, 0, true);         // External attrs
      cdView.setUint32(42, entry.localOffset, true);
      cdHeader.set(entry.nameBytes, 46);

      centralHeaders.push(cdHeader);
      centralSize += cdHeader.length;
    }

    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
    eocdView.setUint16(4, 0, true);
    eocdView.setUint16(6, 0, true);
    eocdView.setUint16(8, entries.length, true);
    eocdView.setUint16(10, entries.length, true);
    eocdView.setUint32(12, centralSize, true);
    eocdView.setUint32(16, localOffset, true);
    eocdView.setUint16(20, 0, true);

    const out = new Uint8Array(localOffset + centralSize + 22);
    let pos = 0;
    for (const entry of entries) {
      out.set(entry.localHeader, pos);
      pos += entry.localHeader.length;
      out.set(entry.dataBytes, pos);
      pos += entry.dataBytes.length;
    }
    for (const cd of centralHeaders) {
      out.set(cd, pos);
      pos += cd.length;
    }
    out.set(eocd, pos);
    return out;
  }

  // ---------------- ZIP READER ----------------
  const MAX_TOTAL_UNCOMPRESSED_SIZE = 10 * 1024 * 1024; // 10 MB safety limit matching shared.py
  const MAX_FILE_COUNT = 256;
  const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB

  async function inflateRaw(compressedBytes) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('DecompressionStream is not supported in this browser');
    }
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(compressedBytes);
    writer.close();
    const reader = ds.readable.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
      if (total > MAX_TOTAL_UNCOMPRESSED_SIZE) {
        throw new Error('Uncompressed size too large');
      }
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      result.set(c, offset);
      offset += c.length;
    }
    return result;
  }

  async function readZip(arrayBufferOrUint8) {
    const bytes = arrayBufferOrUint8 instanceof Uint8Array
      ? arrayBufferOrUint8
      : new Uint8Array(arrayBufferOrUint8);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // Locate End of Central Directory (EOCD)
    let eocdPos = -1;
    const minPos = Math.max(0, bytes.length - 65557);
    for (let i = bytes.length - 22; i >= minPos; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdPos = i;
        break;
      }
    }
    if (eocdPos === -1) {
      throw new Error('Invalid ZIP archive (EOCD not found)');
    }

    const totalEntries = view.getUint16(eocdPos + 10, true);
    if (totalEntries > MAX_FILE_COUNT) {
      throw new Error('Too many files in zip archive');
    }

    const cdOffset = view.getUint32(eocdPos + 16, true);
    let pos = cdOffset;
    let totalUncompressed = 0;
    const files = [];

    for (let i = 0; i < totalEntries; i++) {
      if (pos + 46 > bytes.length || view.getUint32(pos, true) !== 0x02014b50) {
        throw new Error('Corrupt Central Directory in ZIP archive');
      }
      const method = view.getUint16(pos + 10, true);
      const compSize = view.getUint32(pos + 20, true);
      const uncompSize = view.getUint32(pos + 24, true);
      const nameLen = view.getUint16(pos + 28, true);
      const extraLen = view.getUint16(pos + 30, true);
      const commentLen = view.getUint16(pos + 32, true);
      const localHeaderOffset = view.getUint32(pos + 42, true);

      const nameBytes = bytes.subarray(pos + 46, pos + 46 + nameLen);
      const filename = utf8Decoder.decode(nameBytes).replace(/\\/g, '/');

      pos += 46 + nameLen + extraLen + commentLen;

      // Path traversal check matching is_safe_path in shared.py
      if (filename.includes('..') || filename.startsWith('/')) {
        throw new Error(`Unsafe file path detected: ${filename}`);
      }
      if (filename.endsWith('/')) {
        continue; // Directory entry
      }
      if (uncompSize > MAX_FILE_SIZE) {
        throw new Error(`File ${filename} is too large`);
      }
      totalUncompressed += uncompSize;
      if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_SIZE) {
        throw new Error('Uncompressed size too large');
      }

      if (localHeaderOffset + 30 > bytes.length || view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
        throw new Error(`Corrupt local header for ${filename}`);
      }
      const lhNameLen = view.getUint16(localHeaderOffset + 26, true);
      const lhExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
      const rawData = bytes.subarray(dataStart, dataStart + compSize);

      let fileData;
      if (method === 0) {
        fileData = new Uint8Array(rawData);
      } else if (method === 8) {
        fileData = await inflateRaw(rawData);
      } else {
        throw new Error(`Unsupported ZIP compression method (${method}) for ${filename}`);
      }

      files.push({
        path: filename,
        data: fileData,
        text() {
          return utf8Decoder.decode(fileData);
        }
      });
    }

    return files;
  }

  return {
    md5Bytes,
    md5Hex,
    crc32,
    createZip,
    readZip,
  };
});
