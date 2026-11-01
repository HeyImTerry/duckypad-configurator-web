// WebHID Communication, File System Access API, and Browser Backup Storage
// Ported from hid_common.py, hid_op.py, dp20_dumpsd.py, scan_md5.py

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./duck_objs.js'), require('./zip_md5.js'));
  } else {
    root.HidFS = factory(root.DuckObjs, root.ZipMD5);
  }
})(typeof self !== 'undefined' ? self : this, function (DuckObjs, ZipMD5) {
  'use strict';

  const VENDOR_ID = 0x0483;
  const DP20_PID = 0xd11c;
  const DPP_PID = 0xd11d;

  const PC_TO_DUCKYPAD_HID_BUF_SIZE = 64;
  const DUCKYPAD_TO_PC_HID_BUF_SIZE = 64;
  const HID_READ_FILE_PATH_SIZE_MAX = 55;

  const HID_RESPONSE_OK = 0;
  const HID_RESPONSE_ERROR = 1;
  const HID_RESPONSE_BUSY = 2;
  const HID_RESPONSE_EOF = 3;

  const HID_COMMAND_GET_INFO = 0;
  const HID_COMMAND_READ_FILE = 11;
  const HID_COMMAND_OPEN_FILE_FOR_WRITING = 14;
  const HID_COMMAND_WRITE_FILE = 15;
  const HID_COMMAND_CLOSE_FILE = 16;
  const HID_COMMAND_DELETE_FILE = 17;
  const HID_COMMAND_CREATE_DIR = 18;
  const HID_COMMAND_DELETE_DIR = 19;
  const HID_COMMAND_SW_RESET = 20;
  const HID_COMMAND_SET_RTC = 0x1A;
  const HID_COMMAND_DUMP_SD = 32;
  const HID_COMMAND_OPEN_FILE_FOR_READING = 33;

  const SD_WALK_OP_TYPE_INDEX = 1;
  const SD_WALK_OP_ACK = 0;
  const SD_WALK_OP_NEW_DIR = 1;
  const SD_WALK_OP_FILE_CONTENT = 2;
  const SD_WALK_OP_FILE_MD5 = 3;
  const SD_WALK_OP_EOT = 4;

  function getEmptyPcToDuckypadBuf() {
    const buf = new Uint8Array(PC_TO_DUCKYPAD_HID_BUF_SIZE);
    buf[0] = 5; // HID Report ID
    return buf;
  }

  function writeStrIntoBuf(text, buf) {
    for (let i = 0; i < text.length && 3 + i < buf.length; i++) {
      buf[3 + i] = text.charCodeAt(i) & 0xFF;
    }
  }

  function writeBytesIntoBuf(binBuf, buf) {
    for (let i = 0; i < binBuf.length && 3 + i < buf.length; i++) {
      buf[3 + i] = binBuf[i] & 0xFF;
    }
  }

  // Send 64-byte buffer (buf[0] = reportId 5, buf[1..63] = 63-byte payload) and await 64-byte response
  async function hidTxRx(device, buf64, timeoutMs = 4000) {
    if (!device.opened) {
      await device.open();
    }
    const reportId = buf64[0];
    const payload = buf64.subarray(1, PC_TO_DUCKYPAD_HID_BUF_SIZE);

    return new Promise((resolve, reject) => {
      let timer = setTimeout(() => {
        device.removeEventListener('inputreport', onReport);
        reject(new Error('WebHID response timeout'));
      }, timeoutMs);

      function onReport(event) {
        clearTimeout(timer);
        device.removeEventListener('inputreport', onReport);
        const rx = new Uint8Array(DUCKYPAD_TO_PC_HID_BUF_SIZE);
        rx[0] = event.reportId || 5;
        const dataBytes = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
        rx.set(dataBytes.subarray(0, DUCKYPAD_TO_PC_HID_BUF_SIZE - 1), 1);
        resolve(rx);
      }

      device.addEventListener('inputreport', onReport);
      device.sendReport(reportId, payload).catch(err => {
        clearTimeout(timer);
        device.removeEventListener('inputreport', onReport);
        reject(err);
      });
    });
  }

  async function hidSendOnly(device, buf64) {
    if (!device.opened) {
      await device.open();
    }
    const reportId = buf64[0];
    const payload = buf64.subarray(1, PC_TO_DUCKYPAD_HID_BUF_SIZE);
    await device.sendReport(reportId, payload);
  }

  function parseDpInfoFromHidMsg(hidMsg, device) {
    const fw_version = `${hidMsg[3]}.${hidMsg[4]}.${hidMsg[5]}`;
    const dp_model = hidMsg[6];
    const serialUint32 = ((hidMsg[7] << 24) | (hidMsg[8] << 16) | (hidMsg[9] << 8) | hidMsg[10]) >>> 0;
    const serial = serialUint32.toString(16).toUpperCase().padStart(8, '0');
    const diskLabel = `DP${hidMsg[6]}_${hidMsg[9].toString(16).toUpperCase().padStart(2, '0')}${hidMsg[10].toString(16).toUpperCase().padStart(2, '0')}`;
    return {
      fw_version,
      dp_model,
      serial,
      diskLabel,
      hid_msg: hidMsg,
      device,
    };
  }

  async function requestAndScanDuckypads() {
    if (!navigator.hid) {
      throw new Error('WebHID is not supported in this browser (use Chrome, Edge, or Brave on localhost/HTTPS, or use Folder / ZIP mode).');
    }
    // Request permission if needed
    await navigator.hid.requestDevice({
      filters: [
        { vendorId: VENDOR_ID, productId: DP20_PID },
        { vendorId: VENDOR_ID, productId: DPP_PID },
      ],
    });
    const devices = await navigator.hid.getDevices();
    const dpDevices = devices.filter(d => d.vendorId === VENDOR_ID && (d.productId === DP20_PID || d.productId === DPP_PID));

    const infoList = [];
    const seenSerials = new Set();

    for (const dev of dpDevices) {
      try {
        const req = getEmptyPcToDuckypadBuf();
        const res = await hidTxRx(dev, req, 1500);
        if (res[2] !== HID_RESPONSE_OK) continue;
        const info = parseDpInfoFromHidMsg(res, dev);
        if (!seenSerials.has(info.serial)) {
          seenSerials.add(info.serial);
          infoList.push(info);
        }
      } catch (e) {
        // Ignore interfaces that don't respond to custom HID usage
      }
    }
    infoList.sort((a, b) => a.serial.localeCompare(b.serial));
    return infoList;
  }

  async function syncRtcHid(device) {
    const buf = getEmptyPcToDuckypadBuf();
    const now = new Date();
    const unixTs = Math.floor(now.getTime() / 1000) >>> 0;
    // JS getTimezoneOffset() is minutes behind UTC (e.g. UTC+1 -> -60), so negate it to match Python's utcoffset()
    const utcOffsetMinutes = -now.getTimezoneOffset();
    buf[2] = HID_COMMAND_SET_RTC;
    buf[3] = unixTs & 0xFF;
    buf[4] = (unixTs >>> 8) & 0xFF;
    buf[5] = (unixTs >>> 16) & 0xFF;
    buf[6] = (unixTs >>> 24) & 0xFF;
    const offsetU16 = utcOffsetMinutes & 0xFFFF;
    buf[7] = offsetU16 & 0xFF;
    buf[8] = (offsetU16 >>> 8) & 0xFF;
    return await hidTxRx(device, buf);
  }

  async function swResetHid(device, rebootIntoUsbMscMode = false) {
    const buf = getEmptyPcToDuckypadBuf();
    buf[2] = HID_COMMAND_SW_RESET;
    if (rebootIntoUsbMscMode) {
      buf[3] = 1;
    }
    try {
      await hidSendOnly(device, buf);
    } catch (e) {
      // Device resets immediately so sendReport may close connection
    }
  }

  function cStringFromBytes(bytes, startOffset = 0, endOffset = bytes.length) {
    const slice = bytes.subarray(startOffset, endOffset);
    let zeroIdx = slice.indexOf(0);
    if (zeroIdx === -1) zeroIdx = slice.length;
    return new TextDecoder('utf-8').decode(slice.subarray(0, zeroIdx));
  }

  async function hidDumpSingleFile(sdFilePath, device) {
    if (sdFilePath.length > HID_READ_FILE_PATH_SIZE_MAX) {
      throw new Error(`SD file path too long: ${sdFilePath}`);
    }
    const openBuf = getEmptyPcToDuckypadBuf();
    openBuf[2] = HID_COMMAND_OPEN_FILE_FOR_READING;
    writeStrIntoBuf(sdFilePath, openBuf);
    const openRes = await hidTxRx(device, openBuf);
    if (openRes[2] !== 0) {
      throw new Error(`HID open file for read failed: ${sdFilePath}`);
    }

    const chunks = [];
    let totalLen = 0;
    while (true) {
      const readBuf = getEmptyPcToDuckypadBuf();
      readBuf[2] = HID_COMMAND_READ_FILE;
      const readRes = await hidTxRx(device, readBuf);
      const chunkSize = readRes[2];
      if (chunkSize === 0) break;
      const chunk = new Uint8Array(readRes.subarray(3, 3 + chunkSize));
      chunks.push(chunk);
      totalLen += chunk.length;
    }

    const out = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }

  // Dump entire SD card over WebHID (for OG duckyPad 2020), using cached MD5s from browser backups
  async function dumpSdOverHid(device, onProgress) {
    const md5Cache = await BackupStore.getMd5CacheMap();
    const filesMap = new Map();
    const md5MissList = [];
    let currentDir = '';

    const walkBuf = getEmptyPcToDuckypadBuf();
    walkBuf[2] = HID_COMMAND_DUMP_SD;

    while (true) {
      const rx = await hidTxRx(device, walkBuf, 6000);
      const opType = rx[SD_WALK_OP_TYPE_INDEX];

      if (opType === SD_WALK_OP_ACK) {
        continue;
      } else if (opType === SD_WALK_OP_EOT) {
        break;
      } else if (opType === SD_WALK_OP_NEW_DIR) {
        currentDir = cStringFromBytes(rx, 2).replace(/^[/\\]+/, '');
      } else if (opType === SD_WALK_OP_FILE_MD5) {
        const fileName = cStringFromBytes(rx, 18);
        let md5Hex = '';
        for (let i = 2; i < 18; i++) {
          md5Hex += rx[i].toString(16).padStart(2, '0');
        }
        const relPath = currentDir ? `${currentDir}/${fileName}` : fileName;
        if (onProgress) onProgress(`Loading ${relPath}...`);
        if (md5Cache.has(md5Hex)) {
          filesMap.set(relPath, md5Cache.get(md5Hex));
        } else {
          md5MissList.push([currentDir, fileName]);
        }
      } else if (opType === SD_WALK_OP_FILE_CONTENT) {
        const fileNameEnd = rx[2] + 1;
        const fileContentEnd = rx[3] + 1;
        const fileName = cStringFromBytes(rx, 4, fileNameEnd);
        const relPath = currentDir ? `${currentDir}/${fileName}` : fileName;
        if (onProgress) onProgress(`Loading ${relPath}...`);
        const rawBytes = new Uint8Array(rx.subarray(fileNameEnd, fileContentEnd));
        filesMap.set(relPath, rawBytes);
      }
    }

    // Read all MD5 miss files that firmware reported exist on SD card
    for (const [sdDir, sdFileName] of md5MissList) {
      const relPath = sdDir ? `${sdDir}/${sdFileName}` : sdFileName;
      if (onProgress) onProgress(`Reading ${relPath}...`);
      let rawBytes = null;
      try {
        rawBytes = await hidDumpSingleFile(`/${relPath}`, device);
      } catch (firstErr) {
        await new Promise(r => setTimeout(r, 60));
        rawBytes = await hidDumpSingleFile(`/${relPath}`, device);
      }
      filesMap.set(relPath, rawBytes);
    }

    // Optional top-level metadata files (may not exist on older SD cards)
    for (const optFile of [DuckObjs.profile_info_dot_txt, DuckObjs.user_header_dot_txt]) {
      if (!filesMap.has(optFile)) {
        try {
          if (onProgress) onProgress(`Reading ${optFile}...`);
          const rawBytes = await hidDumpSingleFile(`/${optFile}`, device);
          filesMap.set(optFile, rawBytes);
        } catch (e) {
          // Optional top-level file not present on SD card
        }
      }
    }

    return filesMap;
  }

  async function hidWriteFile(relPath, dataBytes, device) {
    const hidPath = '/' + relPath.replace(/^[/\\]+/, '');
    if (hidPath.length > HID_READ_FILE_PATH_SIZE_MAX) {
      throw new Error(`HID file path too long: ${hidPath}`);
    }
    const u8 = DuckObjs.toUint8Array(dataBytes);

    const openBuf = getEmptyPcToDuckypadBuf();
    openBuf[2] = HID_COMMAND_OPEN_FILE_FOR_WRITING;
    writeStrIntoBuf(hidPath, openBuf);
    await hidTxRx(device, openBuf);

    const chunkSize = 60;
    for (let i = 0; i < u8.length; i += chunkSize) {
      const chunk = u8.subarray(i, Math.min(i + chunkSize, u8.length));
      const chunkBuf = getEmptyPcToDuckypadBuf();
      chunkBuf[1] = chunk.length;
      chunkBuf[2] = HID_COMMAND_WRITE_FILE;
      writeBytesIntoBuf(chunk, chunkBuf);
      await hidTxRx(device, chunkBuf);
    }

    const closeBuf = getEmptyPcToDuckypadBuf();
    closeBuf[2] = HID_COMMAND_CLOSE_FILE;
    await hidTxRx(device, closeBuf);
  }

  async function syncFilesOverHid(device, oldFilesMap, newFilesMap, onProgress, options = {}) {
    const ops = DuckObjs.computeFileSyncOps(oldFilesMap, newFilesMap, options);
    for (const op of ops) {
      if (onProgress) onProgress(`Saving via HID: ${op.path}`);
      const hidPath = '/' + op.path.replace(/^[/\\]+/, '');
      if (hidPath.length > HID_READ_FILE_PATH_SIZE_MAX) {
        throw new Error(`HID file path too long: ${hidPath}`);
      }
      if (op.action === 'rmf') {
        const buf = getEmptyPcToDuckypadBuf();
        buf[2] = HID_COMMAND_DELETE_FILE;
        writeStrIntoBuf(hidPath, buf);
        await hidTxRx(device, buf);
      } else if (op.action === 'cpf') {
        if (op.isOverwrite) {
          const delBuf = getEmptyPcToDuckypadBuf();
          delBuf[2] = HID_COMMAND_DELETE_FILE;
          writeStrIntoBuf(hidPath, delBuf);
          await hidTxRx(device, delBuf);
        }
        await hidWriteFile(op.path, op.data, device);
      } else if (op.action === 'rmdir') {
        const buf = getEmptyPcToDuckypadBuf();
        buf[2] = HID_COMMAND_DELETE_DIR;
        writeStrIntoBuf(hidPath, buf);
        await hidTxRx(device, buf);
      } else if (op.action === 'mkdir') {
        const buf = getEmptyPcToDuckypadBuf();
        buf[2] = HID_COMMAND_CREATE_DIR;
        writeStrIntoBuf(hidPath, buf);
        await hidTxRx(device, buf);
      }
    }
    return ops.length;
  }

  // ---------------- FILE SYSTEM ACCESS API (Directory Handle) ----------------

  async function readDirectoryHandle(dirHandle) {
    const filesMap = new Map();

    async function walkDir(handle, prefix) {
      for await (const [name, entry] of handle.entries()) {
        // Ignore macOS junk files like ._key1.txt or .DS_Store (matching v1.3.5 fix)
        if (name.startsWith('.')) continue;
        const relPath = prefix ? `${prefix}/${name}` : name;
        if (entry.kind === 'file') {
          if (DuckObjs.is_duckypad_file(name) || (prefix && DuckObjs.is_duckypad_file(prefix))) {
            const file = await entry.getFile();
            const buf = new Uint8Array(await file.arrayBuffer());
            filesMap.set(relPath, buf);
          }
        } else if (entry.kind === 'directory') {
          if (DuckObjs.is_duckypad_file(name)) {
            await walkDir(entry, relPath);
          }
        }
      }
    }

    await walkDir(dirHandle, '');
    return filesMap;
  }

  async function syncToDirectoryHandle(dirHandle, oldFilesMap, newFilesMap, onProgress, options = {}) {
    const ops = DuckObjs.computeFileSyncOps(oldFilesMap, newFilesMap, options);

    for (const op of ops) {
      if (onProgress) onProgress(`Writing: ${op.path}`);
      const parts = op.path.split('/');
      if (op.action === 'mkdir') {
        await dirHandle.getDirectoryHandle(op.path, { create: true });
      } else if (op.action === 'rmdir') {
        try {
          await dirHandle.removeEntry(op.path, { recursive: true });
        } catch (e) {
          // Ignore if already removed
        }
      } else if (op.action === 'rmf') {
        try {
          if (parts.length === 1) {
            await dirHandle.removeEntry(parts[0]);
          } else {
            const subDir = await dirHandle.getDirectoryHandle(parts[0], { create: false });
            await subDir.removeEntry(parts[1]);
          }
        } catch (e) {
          // state.sps or old file might not exist
        }
      } else if (op.action === 'cpf') {
        let targetDir = dirHandle;
        if (parts.length > 1) {
          targetDir = await dirHandle.getDirectoryHandle(parts[0], { create: true });
        }
        const fileName = parts[parts.length - 1];
        const fileHandle = await targetDir.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        const dataBytes = DuckObjs.toUint8Array(op.data);
        await writable.write(dataBytes);
        await writable.close();
      }
    }

    return ops.length;
  }

  // Read FileList from <input type="file" webkitdirectory multiple>
  async function readFileListFromInput(fileList) {
    const filesMap = new Map();
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const rel = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
      const parts = rel.split('/');
      let innerPath = rel;
      if (parts.length > 1) {
        const firstLower = parts[0].toLowerCase();
        const secondLower = parts[1].toLowerCase();
        const isSingleProfileDir =
          firstLower.startsWith('profile') &&
          firstLower !== 'profile_backups' &&
          firstLower !== 'profiles' &&
          (secondLower === 'config.txt' || secondLower.startsWith('key'));
        if (!isSingleProfileDir) {
          innerPath = parts.slice(1).join('/');
        }
      }
      const baseName = innerPath.split('/').pop();
      if (baseName.startsWith('.')) continue;
      const buf = new Uint8Array(await file.arrayBuffer());
      filesMap.set(innerPath, buf);
    }
    return filesMap;
  }

  // ---------------- BROWSER BACKUP STORAGE (IndexedDB + localStorage fallback) ----------------
  const DB_NAME = 'duckypad_configurator_db';
  const DB_VERSION = 1;
  const STORE_BACKUPS = 'backups';
  const STORE_KV = 'kv';
  const LS_BACKUPS_KEY = 'dp_web_backups_v1';

  function u8ToBase64(u8) {
    let binary = '';
    for (let i = 0; i < u8.length; i++) {
      binary += String.fromCharCode(u8[i]);
    }
    return btoa(binary);
  }

  function base64ToU8(b64) {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined' || window.location.protocol === 'file:') {
        reject(new Error('IndexedDB skipped on file:// protocol'));
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('IndexedDB open timeout'));
        }
      }, 350);

      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = event => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_BACKUPS)) {
            db.createObjectStore(STORE_BACKUPS, { keyPath: 'name' });
          }
          if (!db.objectStoreNames.contains(STORE_KV)) {
            db.createObjectStore(STORE_KV, { keyPath: 'key' });
          }
        };
        req.onsuccess = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(req.result);
          } else {
            req.result.close();
          }
        };
        req.onerror = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(req.error);
          }
        };
        req.onblocked = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(new Error('IndexedDB blocked'));
          }
        };
      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      }
    });
  }

  const BackupStore = {
    async saveBackup(name, deviceType, filesMap) {
      try {
        const db = await openDb();
        const serializedFiles = {};
        for (const [k, v] of filesMap.entries()) {
          serializedFiles[k] = DuckObjs.toUint8Array(v);
        }
        const record = {
          name,
          timestamp: Date.now(),
          deviceType,
          files: serializedFiles,
        };
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_BACKUPS, 'readwrite');
          tx.objectStore(STORE_BACKUPS).put(record);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
        return true;
      } catch (e) {
        try {
          const serializedFiles = {};
          for (const [k, v] of filesMap.entries()) {
            const u8 = DuckObjs.toUint8Array(v);
            serializedFiles[k] = u8ToBase64(u8);
          }
          const raw = localStorage.getItem(LS_BACKUPS_KEY);
          const list = raw ? JSON.parse(raw) : [];
          const filtered = list.filter(b => b.name !== name).slice(0, 14);
          filtered.unshift({
            name,
            timestamp: Date.now(),
            deviceType,
            filesB64: serializedFiles,
          });
          localStorage.setItem(LS_BACKUPS_KEY, JSON.stringify(filtered));
          return true;
        } catch (lsErr) {
          console.warn('BackupStore fallback failed:', lsErr);
          return false;
        }
      }
    },

    async listBackups() {
      try {
        const db = await openDb();
        const list = await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_BACKUPS, 'readonly');
          const req = tx.objectStore(STORE_BACKUPS).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
        db.close();
        for (const item of list) {
          if (item.files) {
            for (const [k, v] of Object.entries(item.files)) {
              item.files[k] = DuckObjs.toUint8Array(v);
            }
          }
        }
        list.sort((a, b) => b.timestamp - a.timestamp);
        return list;
      } catch (e) {
        try {
          const raw = localStorage.getItem(LS_BACKUPS_KEY);
          if (!raw) return [];
          const list = JSON.parse(raw);
          return list.map(item => {
            const files = {};
            if (item.filesB64) {
              for (const [k, b64] of Object.entries(item.filesB64)) {
                files[k] = base64ToU8(b64);
              }
            }
            return {
              name: item.name,
              timestamp: item.timestamp,
              deviceType: item.deviceType,
              files,
            };
          });
        } catch (_) {
          return [];
        }
      }
    },

    async deleteBackup(name) {
      try {
        const db = await openDb();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_BACKUPS, 'readwrite');
          tx.objectStore(STORE_BACKUPS).delete(name);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      } catch (e) {
        try {
          const raw = localStorage.getItem(LS_BACKUPS_KEY);
          if (!raw) return;
          const list = JSON.parse(raw).filter(b => b.name !== name);
          localStorage.setItem(LS_BACKUPS_KEY, JSON.stringify(list));
        } catch (_) {}
      }
    },

    async getMd5CacheMap() {
      const cache = new Map();
      const backups = await this.listBackups();
      for (const b of backups.slice(0, 10)) {
        if (!b.files) continue;
        for (const data of Object.values(b.files)) {
          const u8 = DuckObjs.toUint8Array(data);
          if (u8.length > 0) {
            cache.set(ZipMD5.md5Hex(u8), u8);
          }
        }
      }
      return cache;
    },

    async getKv(key, fallback = null) {
      try {
        const db = await openDb();
        const res = await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_KV, 'readonly');
          const req = tx.objectStore(STORE_KV).get(key);
          req.onsuccess = () => resolve(req.result ? req.result.value : fallback);
          req.onerror = () => reject(req.error);
        });
        db.close();
        return res;
      } catch (e) {
        try {
          const item = localStorage.getItem(`dp_kv_${key}`);
          return item ? JSON.parse(item) : fallback;
        } catch (_) {
          return fallback;
        }
      }
    },

    async setKv(key, value) {
      try {
        const db = await openDb();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_KV, 'readwrite');
          tx.objectStore(STORE_KV).put({ key, value });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      } catch (e) {
        try {
          localStorage.setItem(`dp_kv_${key}`, JSON.stringify(value));
        } catch (_) {}
      }
    },
  };

  return {
    VENDOR_ID,
    DP20_PID,
    DPP_PID,
    requestAndScanDuckypads,
    syncRtcHid,
    swResetHid,
    dumpSdOverHid,
    syncFilesOverHid,
    readDirectoryHandle,
    syncToDirectoryHandle,
    readFileListFromInput,
    BackupStore,
  };
});
