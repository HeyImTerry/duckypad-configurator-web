// Data Models, File Tree Builder/Parser, Differential Sync & Standard Library
// Ported from duck_objs.py, shared.py, my_compare.py, ds_stdlib.py, check_update.py

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./dsvm.js'), require('./zip_md5.js'));
  } else {
    root.DuckObjs = factory(root.DSVM, root.ZipMD5);
  }
})(typeof self !== 'undefined' ? self : this, function (DSVM, ZipMD5) {
  'use strict';

  const THIS_VERSION_NUMBER = '4.0.2';

  const DP_MODEL_OG_DUCKYPAD = 20;
  const DP_MODEL_DUCKYPAD_PRO = 24;

  const MIN_DUCKYPAD_PRO_FIRMWARE_VERSION = '3.0.0';
  const MAX_DUCKYPAD_PRO_FIRMWARE_VERSION = '3.10.0';
  const MIN_DUCKYPAD_2020_FIRMWARE_VERSION = '3.0.0';
  const MAX_DUCKYPAD_2020_FIRMWARE_VERSION = '3.10.0';

  const MAX_PROFILE_NAME_LEN = 16;
  const MAX_EXPANSION_MODULE_COUNT = 4;
  const CHANNELS_PER_EXPANSION_MODULE = 8;
  const MAX_EXPANSION_CHANNEL = MAX_EXPANSION_MODULE_COUNT * CHANNELS_PER_EXPANSION_MODULE;

  const BUTTON_RE1_CW = 20;
  const BUTTON_RE1_CCW = 21;
  const BUTTON_RE1_PUSH = 22;
  const BUTTON_RE2_CW = 23;
  const BUTTON_RE2_CCW = 24;
  const BUTTON_RE2_PUSH = 25;
  const EXP_BUTTON_START = 36;

  const KEY_NAME_MAX_CHAR_PER_LINE = 7;
  const SW_MATRIX_NUM_COLS = 4;
  const SW_MATRIX_NUM_ROWS = 5;
  const MECH_OBSW_COUNT = SW_MATRIX_NUM_COLS * SW_MATRIX_NUM_ROWS; // 20
  const ROTARY_ENCODER_SW_COUNT = 6;
  const ONBOARD_SPARE_GPIO_COUNT = 10;
  const MAX_PROFILE_COUNT = 64;
  const MAX_KEY_COUNT = MECH_OBSW_COUNT + ROTARY_ENCODER_SW_COUNT + ONBOARD_SPARE_GPIO_COUNT + MAX_EXPANSION_CHANNEL; // 68

  const profile_info_dot_txt = 'profile_info.txt';
  const user_header_dot_txt = 'user_header.txt';
  const stdlib_source_tag_NO_SPACE = 'USE_STDLIB';
  const user_header_source_tag_NO_SPACE = 'USE_UH';

  const dp24_to_dp20_lookup_1idx = {
    1: 1, 2: 2, 3: 3,
    5: 4, 6: 5, 7: 6,
    9: 7, 10: 8, 11: 9,
    13: 10, 14: 11, 15: 12,
    17: 13, 18: 14, 19: 15
  };

  const dp20_to_dp24_lookup_0idx = {
    0: 0, 1: 1, 2: 2,
    3: 4, 4: 5, 5: 6,
    6: 8, 7: 9, 8: 10,
    9: 12, 10: 13, 11: 14,
    12: 16, 13: 17, 14: 18
  };

  function is_rotary_encoder_button(key_index_start_from_0) {
    return key_index_start_from_0 >= BUTTON_RE1_CW && key_index_start_from_0 <= BUTTON_RE2_PUSH;
  }

  function is_expansion_button(key_index_start_from_0) {
    return key_index_start_from_0 >= EXP_BUTTON_START && key_index_start_from_0 < EXP_BUTTON_START + MAX_EXPANSION_CHANNEL;
  }

  function get_appropriate_key_index(key_index_1idx, device_type) {
    if (device_type === DP_MODEL_DUCKYPAD_PRO) {
      return key_index_1idx;
    }
    return dp24_to_dp20_lookup_1idx[key_index_1idx] || null;
  }

  const invalid_filename_characters = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);

  function clean_input(str_input, len_limit = null, is_filename = true) {
    if (str_input === null || str_input === undefined) return '';
    const chars = [];
    for (const ch of String(str_input)) {
      const code = ch.charCodeAt(0);
      if (code >= 32 && code <= 126) {
        if (is_filename && invalid_filename_characters.has(ch)) continue;
        chars.push(ch);
      }
    }
    let result = chars.join('');
    while (result.includes('  ')) {
      result = result.replace(/  /g, ' ');
    }
    if (len_limit !== null && len_limit !== undefined) {
      result = result.slice(0, len_limit);
    }
    return result.trim();
  }

  function rgb_to_hex(rgb_tuple) {
    if (!rgb_tuple) return '#5416b4';
    const [r, g, b] = rgb_tuple;
    return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
  }

  function hex_to_rgb(hex) {
    const clean = String(hex).replace(/^#/, '');
    if (clean.length !== 6) return [84, 22, 180];
    return [
      parseInt(clean.slice(0, 2), 16) || 0,
      parseInt(clean.slice(2, 4), 16) || 0,
      parseInt(clean.slice(4, 6), 16) || 0,
    ];
  }

  function adapt_color(rgb_tuple) {
    if (!rgb_tuple) return 'white';
    if (rgb_tuple[0] * 0.299 + rgb_tuple[1] * 0.587 + rgb_tuple[2] * 0.114 > 145) {
      return '#111827';
    }
    return '#ffffff';
  }

  function toUint8Array(v) {
    if (v instanceof Uint8Array) return v;
    if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    if (v instanceof ArrayBuffer) return new Uint8Array(v);
    if (typeof v === 'string') return new TextEncoder().encode(v);
    if (Array.isArray(v)) return new Uint8Array(v);
    if (v && typeof v === 'object') {
      const keys = Object.keys(v).map(Number).filter(n => !Number.isNaN(n)).sort((a, b) => a - b);
      const out = new Uint8Array(keys.length);
      for (let i = 0; i < keys.length; i++) out[i] = v[keys[i]] & 0xff;
      return out;
    }
    return new Uint8Array(0);
  }

  class dp_key {
    constructor(path_on_press = null, path_on_release = null) {
      this.path = path_on_press;
      this.path_on_release = path_on_release;
      this.name = null;
      this.name_line2 = null;
      this.index = null; // 0-based slot index (0..67)
      this.color = null; // [r, g, b] or null
      this.script = '';
      this.script_on_release = '';
      this.binary_array = null;
      this.binary_array_on_release = null;
      this.allow_abort = false;
      this.dont_repeat = false;

      // Dirty tracking & preserved original file bytes from last load/save
      this.is_dirty = true;
      this.is_script_dirty = true;
      this.orig_disk_index = null; // 1-based key index on disk (1..68)
      this.orig_key_txt_bytes = null;
      this.orig_key_rel_txt_bytes = null;
      this.orig_dsb_bytes = null;
      this.orig_dsb_rel_bytes = null;
    }

    clone() {
      const k = new dp_key(this.path, this.path_on_release);
      k.name = this.name;
      k.name_line2 = this.name_line2;
      k.index = this.index;
      k.color = this.color ? [...this.color] : null;
      k.script = this.script;
      k.script_on_release = this.script_on_release;
      k.binary_array = this.binary_array ? new Uint8Array(this.binary_array) : null;
      k.binary_array_on_release = this.binary_array_on_release ? new Uint8Array(this.binary_array_on_release) : null;
      k.allow_abort = this.allow_abort;
      k.dont_repeat = this.dont_repeat;
      k.is_dirty = this.is_dirty;
      k.is_script_dirty = this.is_script_dirty;
      k.orig_disk_index = this.orig_disk_index;
      k.orig_key_txt_bytes = this.orig_key_txt_bytes ? new Uint8Array(this.orig_key_txt_bytes) : null;
      k.orig_key_rel_txt_bytes = this.orig_key_rel_txt_bytes ? new Uint8Array(this.orig_key_rel_txt_bytes) : null;
      k.orig_dsb_bytes = this.orig_dsb_bytes ? new Uint8Array(this.orig_dsb_bytes) : null;
      k.orig_dsb_rel_bytes = this.orig_dsb_rel_bytes ? new Uint8Array(this.orig_dsb_rel_bytes) : null;
      return k;
    }
  }

  class dp_profile {
    constructor() {
      this.path = null;
      this.name = null;
      this.keylist = new Array(MAX_KEY_COUNT).fill(null);
      this.bg_color = [84, 22, 180];
      this.kd_color = null;
      this.dim_unused = true;
      this.is_landscape = false;
      this.is_upper_re_halfstep = false;
      this.is_lower_re_halfstep = false;

      // Dirty tracking & preserved original folder/files from last load/save
      this.is_dirty = true;
      this.is_config_dirty = true;
      this.orig_folder_name = null;
      this.orig_files_map = new Map(); // subPath (e.g. 'config.txt', 'key1.txt') -> Uint8Array
    }

    clone() {
      const p = new dp_profile();
      p.path = this.path;
      p.name = this.name;
      p.keylist = this.keylist.map(k => (k ? k.clone() : null));
      p.bg_color = [...this.bg_color];
      p.kd_color = this.kd_color ? [...this.kd_color] : null;
      p.dim_unused = this.dim_unused;
      p.is_landscape = this.is_landscape;
      p.is_upper_re_halfstep = this.is_upper_re_halfstep;
      p.is_lower_re_halfstep = this.is_lower_re_halfstep;
      p.is_dirty = true;
      p.is_config_dirty = true;
      p.orig_folder_name = null;
      p.orig_files_map = new Map();
      return p;
    }

    add_key_if_doesnt_exist(index) {
      if (index < 0 || index >= MAX_KEY_COUNT) return;
      if (this.keylist[index] === null) {
        this.keylist[index] = new dp_key();
        this.keylist[index].index = index;
      }
    }

    read_config_text(configText) {
      if (!configText) return;
      const lines = configText.split(/\r?\n/);
      for (let line of lines) {
        line = line.replace(/[\r\n]/g, '').trim();
        while (line.includes('  ')) {
          line = line.replace(/  /g, ' ');
        }
        if (!line) continue;
        const firstSpace = line.indexOf(' ');
        const cmd = firstSpace === -1 ? line : line.slice(0, firstSpace);
        const rest = firstSpace === -1 ? '' : line.slice(firstSpace + 1);

        try {
          if (line.startsWith('BG_COLOR ')) {
            const parts = line.split(' ');
            this.bg_color = [parseInt(parts[1], 10), parseInt(parts[2], 10), parseInt(parts[3], 10)];
          } else if (line.startsWith('KEYDOWN_COLOR ')) {
            const parts = line.split(' ');
            this.kd_color = [parseInt(parts[1], 10), parseInt(parts[2], 10), parseInt(parts[3], 10)];
          } else if (line.startsWith('DIM_UNUSED_KEYS 0')) {
            this.dim_unused = false;
          } else if (line.startsWith('IS_LANDSCAPE 1')) {
            this.is_landscape = true;
          } else if (line.startsWith('UPPER_HS 1')) {
            this.is_upper_re_halfstep = true;
          } else if (line.startsWith('LOWER_HS 1')) {
            this.is_lower_re_halfstep = true;
          } else if (cmd.startsWith('z')) {
            const this_index = parseInt(cmd.slice(1), 10) - 1;
            this.add_key_if_doesnt_exist(this_index);
            if (this.keylist[this_index]) this.keylist[this_index].name = rest;
          } else if (cmd.startsWith('x')) {
            const this_index = parseInt(cmd.slice(1), 10) - 1;
            this.add_key_if_doesnt_exist(this_index);
            if (this.keylist[this_index]) this.keylist[this_index].name_line2 = rest;
          } else if (cmd.startsWith('ab')) {
            const this_index = parseInt(rest, 10) - 1;
            this.add_key_if_doesnt_exist(this_index);
            if (this.keylist[this_index]) this.keylist[this_index].allow_abort = true;
          } else if (cmd.startsWith('dr')) {
            const this_index = parseInt(rest, 10) - 1;
            this.add_key_if_doesnt_exist(this_index);
            if (this.keylist[this_index]) this.keylist[this_index].dont_repeat = true;
          } else if (cmd.startsWith('SWCOLOR_')) {
            const this_index = parseInt(cmd.split('_').pop(), 10) - 1;
            this.add_key_if_doesnt_exist(this_index);
            const parts = line.split(' ');
            if (this.keylist[this_index]) {
              this.keylist[this_index].color = [parseInt(parts[1], 10), parseInt(parts[2], 10), parseInt(parts[3], 10)];
            }
          }
        } catch (e) {
          console.warn('read_config_text line parse error:', line, e);
        }
      }
    }

    load_from_virtual_folder(folderName, fileAccessor) {
      if (!folderName.toLowerCase().startsWith('profile')) return false;
      this.path = folderName;
      this.orig_folder_name = folderName;
      const idx = folderName.indexOf('_');
      this.name = idx !== -1 ? folderName.slice(idx + 1) : folderName;

      const getText = typeof fileAccessor.getText === 'function'
        ? p => fileAccessor.getText(p)
        : p => {
            const v = fileAccessor.get(p);
            if (v === undefined) return undefined;
            return typeof v === 'string' ? v : new TextDecoder('utf-8').decode(toUint8Array(v));
          };
      const getBytes = typeof fileAccessor.getBytes === 'function'
        ? p => fileAccessor.getBytes(p)
        : p => {
            const v = fileAccessor.get(p);
            return v === undefined ? undefined : toUint8Array(v);
          };

      this.orig_files_map = new Map();
      const sourceBytesMap = fileAccessor.bytesMap || (fileAccessor instanceof Map ? fileAccessor : null);
      if (sourceBytesMap) {
        const prefixLower = folderName.toLowerCase() + '/';
        for (const [p, rawVal] of sourceBytesMap.entries()) {
          if (p.toLowerCase().startsWith(prefixLower)) {
            const subName = p.slice(folderName.length + 1);
            this.orig_files_map.set(subName, toUint8Array(rawVal));
          }
        }
      }

      const configText = getText(`${folderName}/config.txt`) || '';
      this.read_config_text(configText);

      // Ensure any key<N>.txt present in the folder is also represented even if config.txt lacked a z<N> line
      for (const subName of this.orig_files_map.keys()) {
        const m = /^key(\d+)\.txt$/i.exec(subName);
        if (m) {
          const diskIdx = parseInt(m[1], 10);
          if (diskIdx >= 1 && diskIdx <= MAX_KEY_COUNT && this.keylist[diskIdx - 1] === null) {
            this.add_key_if_doesnt_exist(diskIdx - 1);
            this.keylist[diskIdx - 1].name = `Key${diskIdx}`;
          }
        }
      }

      for (let i = 0; i < MAX_KEY_COUNT; i++) {
        const this_key = this.keylist[i];
        if (this_key !== null) {
          this_key.index = i;
          const diskIdx = i + 1;
          const onPress = getText(`${folderName}/key${diskIdx}.txt`);
          const onRelease = getText(`${folderName}/key${diskIdx}-release.txt`);
          const pressBytes = getBytes(`${folderName}/key${diskIdx}.txt`);
          const relBytes = getBytes(`${folderName}/key${diskIdx}-release.txt`);
          const dsbBytes = getBytes(`${folderName}/key${diskIdx}.dsb`);
          const dsbRelBytes = getBytes(`${folderName}/key${diskIdx}-release.dsb`);

          this_key.script = onPress !== undefined ? onPress : '';
          this_key.script_on_release = onRelease !== undefined ? onRelease : '';
          this_key.orig_disk_index = diskIdx;
          this_key.orig_key_txt_bytes = pressBytes !== undefined ? new Uint8Array(pressBytes) : null;
          this_key.orig_key_rel_txt_bytes = relBytes !== undefined ? new Uint8Array(relBytes) : null;
          this_key.orig_dsb_bytes = dsbBytes !== undefined ? new Uint8Array(dsbBytes) : null;
          this_key.orig_dsb_rel_bytes = dsbRelBytes !== undefined ? new Uint8Array(dsbRelBytes) : null;
          this_key.binary_array = this_key.orig_dsb_bytes ? new Uint8Array(this_key.orig_dsb_bytes) : null;
          this_key.binary_array_on_release = this_key.orig_dsb_rel_bytes ? new Uint8Array(this_key.orig_dsb_rel_bytes) : null;
          this_key.is_dirty = false;
          this_key.is_script_dirty = false;
        }
      }

      this.is_dirty = false;
      this.is_config_dirty = false;
      return true;
    }
  }

  function convert_key_order_dp20_to_dp24(profile_list) {
    for (const this_profile of profile_list) {
      const new_klist = new Array(MAX_KEY_COUNT).fill(null);
      for (let i = 0; i < this_profile.keylist.length; i++) {
        const this_key = this_profile.keylist[i];
        if (this_key === null) continue;
        const srcIdx0 = this_key.index !== null && this_key.index !== undefined ? this_key.index : i;
        const dp24_index = dp20_to_dp24_lookup_0idx[srcIdx0];
        if (dp24_index === undefined || dp24_index < 0 || dp24_index >= MAX_KEY_COUNT) continue;
        this_key.index = dp24_index;
        new_klist[dp24_index] = this_key;
      }
      this_profile.keylist = new_klist;
    }
  }

  // Parse a virtual file map (Map<relativePath, Uint8Array|string> or Object) into { profiles, userHeaderLines, detectedIsDp24, normalizedBytesMap }
  function parseVirtualFileSystem(rawFilesMap) {
    const utf8Decoder = new TextDecoder('utf-8');
    let entries = [];
    for (const [k, v] of (rawFilesMap instanceof Map ? rawFilesMap.entries() : Object.entries(rawFilesMap || {}))) {
      const normPath = k.replace(/\\/g, '/').replace(/^\/+/, '');
      if (!normPath) continue;
      const bytes = toUint8Array(v);
      const text = typeof v === 'string' ? v : utf8Decoder.decode(bytes);
      entries.push([normPath, text, bytes]);
    }

    // Unwrap common leading wrapper directory (including wrapper directories like "profile_backups" or "profiles" that contain profile_* folders)
    while (entries.length > 0) {
      const topDirs = new Set();
      let hasTopFiles = false;
      for (const [p] of entries) {
        const parts = p.split('/');
        if (parts.length === 1) {
          hasTopFiles = true;
        } else {
          topDirs.add(parts[0]);
        }
      }
      if (!hasTopFiles && topDirs.size === 1) {
        const onlyDir = [...topDirs][0];
        const onlyDirLower = onlyDir.toLowerCase();
        const hasNestedProfileDirsOrInfo = entries.some(([p]) => {
          const rest = p.slice(onlyDir.length + 1);
          const restLower = rest.toLowerCase();
          return (
            restLower === profile_info_dot_txt ||
            restLower === user_header_dot_txt ||
            (rest.includes('/') && restLower.startsWith('profile'))
          );
        });
        if (!onlyDirLower.startsWith('profile') || hasNestedProfileDirsOrInfo) {
          entries = entries.map(([p, t, b]) => [p.slice(onlyDir.length + 1), t, b]);
          continue;
        }
      }
      break;
    }

    // If the user directly selected a single profile folder containing config.txt at top level, wrap it as profile_Imported
    const hasTopConfigTxt = entries.some(([p]) => p.toLowerCase() === 'config.txt');
    const hasAnyProfileSubdir = entries.some(([p]) => p.includes('/') && p.split('/')[0].toLowerCase().startsWith('profile'));
    if (hasTopConfigTxt && !hasAnyProfileSubdir) {
      entries = entries.map(([p, t, b]) => [`profile_Imported/${p}`, t, b]);
    }

    const textMap = new Map();
    const bytesMap = new Map();
    const lowerKeyMap = new Map();
    const profileFolders = new Set();
    const lowerFolderMap = new Map();

    for (const [p, t, b] of entries) {
      textMap.set(p, t);
      bytesMap.set(p, b);
      lowerKeyMap.set(p.toLowerCase(), p);
      const parts = p.split('/');
      if (parts.length >= 2) {
        const dirName = parts[0];
        const dirLower = dirName.toLowerCase();
        if (dirLower.startsWith('profile') && dirLower !== 'profile_backups' && dirLower !== 'profiles') {
          profileFolders.add(dirName);
          lowerFolderMap.set(dirLower, dirName);
        }
      }
    }

    const fileAccessor = {
      bytesMap,
      getText(path) {
        if (textMap.has(path)) return textMap.get(path);
        const actual = lowerKeyMap.get(path.toLowerCase());
        return actual !== undefined ? textMap.get(actual) : undefined;
      },
      getBytes(path) {
        if (bytesMap.has(path)) return bytesMap.get(path);
        const actual = lowerKeyMap.get(path.toLowerCase());
        return actual !== undefined ? bytesMap.get(actual) : undefined;
      },
    };

    // Read user_header.txt if present
    let userHeaderLines = [];
    const uhText = fileAccessor.getText(user_header_dot_txt);
    if (uhText !== undefined) {
      userHeaderLines = uhText.split(/\r?\n/);
      if (userHeaderLines.length > 0 && userHeaderLines[userHeaderLines.length - 1] === '') {
        userHeaderLines.pop();
      }
    }

    // Read profile_info.txt if present
    const profileList = [];
    const loadedFolders = new Set();
    const pfInfoText = fileAccessor.getText(profile_info_dot_txt);
    if (pfInfoText !== undefined) {
      const profile_num_dict = {};
      for (const rawLine of pfInfoText.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        const spIdx = line.indexOf(' ');
        if (spIdx === -1) continue;
        const pf_number = parseInt(line.slice(0, spIdx), 10);
        const pf_name = line.slice(spIdx + 1).trim();
        if (Number.isNaN(pf_number) || pf_number >= MAX_PROFILE_COUNT || !pf_name) continue;
        profile_num_dict[pf_name] = pf_number;
      }
      const profile_info_list = Object.entries(profile_num_dict).map(([name, num]) => [num, name]);
      profile_info_list.sort((a, b) => a[0] - b[0]);

      for (const [, pf_name] of profile_info_list) {
        const candidate = `profile_${pf_name}`;
        const actualFolder = profileFolders.has(candidate)
          ? candidate
          : lowerFolderMap.get(candidate.toLowerCase());
        if (!actualFolder || loadedFolders.has(actualFolder)) continue;
        const pf = new dp_profile();
        pf.load_from_virtual_folder(actualFolder, fileAccessor);
        profileList.push(pf);
        loadedFolders.add(actualFolder);
      }
    }

    // Load any remaining profile folders on disk that were not listed in profile_info.txt
    // so existing profile folders on the SD card are never ignored or wiped out
    const remainingFolders = [...profileFolders].filter(f => !loadedFolders.has(f));
    if (remainingFolders.length > 0) {
      const numberedFolders = remainingFolders.filter(x => /^profile\d+_/i.test(x));
      const unnumberedFolders = remainingFolders.filter(x => !/^profile\d+_/i.test(x));
      numberedFolders.sort((a, b) => parseInt(a.slice(7).split('_')[0], 10) - parseInt(b.slice(7).split('_')[0], 10));
      unnumberedFolders.sort();

      for (const folderName of [...numberedFolders, ...unnumberedFolders]) {
        if (profileList.length >= MAX_PROFILE_COUNT) break;
        const pf = new dp_profile();
        pf.load_from_virtual_folder(folderName, fileAccessor);
        profileList.push(pf);
        loadedFolders.add(folderName);
      }
    }

    // Heuristic detection of dp24 vs dp20:
    let detectedIsDp24 = null;
    const hasNumberedLegacyDirs = [...profileFolders].some(x => /^profile\d+_/i.test(x));
    if (hasNumberedLegacyDirs && pfInfoText === undefined) {
      detectedIsDp24 = false;
    }
    for (const pf of profileList) {
      if (pf.is_landscape || pf.is_upper_re_halfstep || pf.is_lower_re_halfstep) {
        detectedIsDp24 = true;
      }
      for (let i = 15; i < MAX_KEY_COUNT; i++) {
        if (pf.keylist[i] !== null) {
          detectedIsDp24 = true;
        }
      }
    }

    return {
      profiles: profileList,
      userHeaderLines,
      detectedIsDp24,
      normalizedBytesMap: bytesMap,
    };
  }

  // Helper to compile a single dp_key's On Press and On Release scripts
  function compileSingleKey(this_profile, this_key, importDict) {
    this_key.script = this_key.script || '';
    this_key.script_on_release = this_key.script_on_release || '';

    const finalPressLines = [];
    if (this_key.allow_abort) finalPressLines.push('$_ALLOW_ABORT = 1');
    if (this_key.dont_repeat) finalPressLines.push('$_DONT_REPEAT = 1');
    finalPressLines.push(...this_key.script.replace(/^[ \t]+/, '').replace(/\r/g, '').split('\n'));

    const pressLineObjs = DSVM.make_list_of_ds_line_obj_from_str_listing(finalPressLines);
    const compPress = DSVM.make_dsb_with_exception(pressLineObjs, false, true, importDict);
    if (!compPress.is_success) {
      return {
        ok: false,
        error: `ERROR on Profile [${this_profile.name}] Key [${this_key.name}]:\nLine ${compPress.error_line_number_starting_from_1}: ${compPress.error_comment}\n${compPress.error_line_str}`,
      };
    }
    this_key.binary_array = compPress.bin_array;

    if (this_key.script_on_release.replace(/^[ \t]+/, '').length > 0) {
      const finalReleaseLines = [];
      if (this_key.allow_abort) finalReleaseLines.push('$_ALLOW_ABORT = 1');
      if (this_key.dont_repeat) finalReleaseLines.push('$_DONT_REPEAT = 1');
      finalReleaseLines.push(...this_key.script_on_release.replace(/^[ \t]+/, '').replace(/\r/g, '').split('\n'));

      const relLineObjs = DSVM.make_list_of_ds_line_obj_from_str_listing(finalReleaseLines);
      const compRel = DSVM.make_dsb_with_exception(relLineObjs, false, true, importDict);
      if (!compRel.is_success) {
        return {
          ok: false,
          error: `ERROR on Profile [${this_profile.name}] Key [${this_key.name}] (On Release):\nLine ${compRel.error_line_number_starting_from_1}: ${compRel.error_comment}\n${compRel.error_line_str}`,
        };
      }
      this_key.binary_array_on_release = compRel.bin_array;
    } else {
      this_key.binary_array_on_release = null;
    }

    if (
      this_key.binary_array.length >= DSVM.MAX_BIN_SIZE ||
      (this_key.binary_array_on_release && this_key.binary_array_on_release.length >= DSVM.MAX_BIN_SIZE)
    ) {
      return {
        ok: false,
        error: `Script size too large!\n\nProfile: ${this_profile.name}\nKey: ${this_key.name}`,
      };
    }

    return { ok: true };
  }

  // Compile modified scripts and generate virtual filesystem map: Map<relativePath, Uint8Array>
  // Preserves untouched profiles and untouched keys verbatim from their loaded bytes.
  function compileAndBuildFileSystem(
    profileList,
    userHeaderLines,
    stdlibLines,
    deviceType = DP_MODEL_DUCKYPAD_PRO,
    options = {}
  ) {
    const utf8Encoder = new TextEncoder();
    const filesMap = new Map(); // path -> Uint8Array
    const preserveUnchanged = options.preserveUnchanged !== false;
    const isUserHeaderDirty = Boolean(options.isUserHeaderDirty);
    const isProfileOrderDirty = Boolean(options.isProfileOrderDirty);
    const isDeviceTypeChanged = Boolean(options.isDeviceTypeChanged);
    const originalFilesMap = options.originalFilesMap instanceof Map ? options.originalFilesMap : null;

    const importDict = DSVM.preprocess_import_str_dict({
      [user_header_source_tag_NO_SPACE]: userHeaderLines || [],
      [stdlib_source_tag_NO_SPACE]: stdlibLines || [],
    });

    // 1. Write profile_info.txt (preserve exact bytes if profile list & names did not change)
    const anyProfileDirtyOrRenamed = profileList.some(
      pf => pf.is_dirty || pf.orig_folder_name !== `profile_${pf.name}`
    );
    if (
      preserveUnchanged &&
      !isProfileOrderDirty &&
      !anyProfileDirtyOrRenamed &&
      originalFilesMap &&
      originalFilesMap.has(profile_info_dot_txt)
    ) {
      filesMap.set(profile_info_dot_txt, toUint8Array(originalFilesMap.get(profile_info_dot_txt)));
    } else {
      let pfInfoContent = '';
      profileList.forEach((pf, idx) => {
        pfInfoContent += `${idx + 1} ${pf.name}\n`;
      });
      filesMap.set(profile_info_dot_txt, utf8Encoder.encode(pfInfoContent));
    }

    // 2. Write user_header.txt if non-empty (preserve exact bytes if untouched)
    if (preserveUnchanged && !isUserHeaderDirty && originalFilesMap) {
      if (originalFilesMap.has(user_header_dot_txt)) {
        filesMap.set(user_header_dot_txt, toUint8Array(originalFilesMap.get(user_header_dot_txt)));
      }
    } else if (userHeaderLines && userHeaderLines.some(l => l.trim().length > 0)) {
      const uhContent = userHeaderLines.join('\n') + '\n';
      filesMap.set(user_header_dot_txt, utf8Encoder.encode(uhContent));
    }

    // 3. Process each profile folder
    for (const this_profile of profileList) {
      const pfFolder = `profile_${this_profile.name}`;
      const hasAnyDirtyKey = this_profile.keylist.some(k => k !== null && (k.is_dirty || k.is_script_dirty));
      const isProfileUntouched =
        preserveUnchanged &&
        !this_profile.is_dirty &&
        !this_profile.is_config_dirty &&
        !hasAnyDirtyKey &&
        !isUserHeaderDirty &&
        !isDeviceTypeChanged &&
        this_profile.orig_files_map &&
        this_profile.orig_files_map.size > 0;

      if (isProfileUntouched) {
        const targetFolder = this_profile.orig_folder_name === pfFolder ? pfFolder : pfFolder;
        for (const [subName, bytes] of this_profile.orig_files_map.entries()) {
          filesMap.set(`${targetFolder}/${subName}`, toUint8Array(bytes));
        }
        continue;
      }

      // Profile is new or modified: build config.txt and process keys
      const configLines = [];
      for (let key_index = 0; key_index < this_profile.keylist.length; key_index++) {
        const this_key = this_profile.keylist[key_index];
        if (!this_key) continue;
        this_key.index = key_index;
        const correct_index = get_appropriate_key_index(key_index + 1, deviceType);
        if (!correct_index) continue;
        configLines.push(`z${correct_index} ${this_key.name}`);
        if (this_key.name_line2 && this_key.name_line2.length > 0) {
          configLines.push(`x${correct_index} ${this_key.name_line2}`);
        }
        if (this_key.allow_abort) {
          configLines.push(`ab ${correct_index}`);
        }
        if (this_key.dont_repeat) {
          configLines.push(`dr ${correct_index}`);
        }
      }

      configLines.push(`BG_COLOR ${this_profile.bg_color[0]} ${this_profile.bg_color[1]} ${this_profile.bg_color[2]}`);
      if (this_profile.kd_color) {
        configLines.push(`KEYDOWN_COLOR ${this_profile.kd_color[0]} ${this_profile.kd_color[1]} ${this_profile.kd_color[2]}`);
      }
      if (this_profile.dim_unused === false) {
        configLines.push('DIM_UNUSED_KEYS 0');
      }
      if (this_profile.is_landscape) {
        configLines.push('IS_LANDSCAPE 1');
      }
      if (this_profile.is_upper_re_halfstep) {
        configLines.push('UPPER_HS 1');
      }
      if (this_profile.is_lower_re_halfstep) {
        configLines.push('LOWER_HS 1');
      }

      for (let key_index = 0; key_index < this_profile.keylist.length; key_index++) {
        const this_key = this_profile.keylist[key_index];
        if (!this_key) continue;
        this_key.index = key_index;
        const correct_index = get_appropriate_key_index(key_index + 1, deviceType);
        if (!correct_index) continue;

        const keyTxtPath = `${pfFolder}/key${correct_index}.txt`;
        const keyRelTxtPath = `${pfFolder}/key${correct_index}-release.txt`;
        const dsbPath = `${pfFolder}/key${correct_index}.dsb`;
        const dsbRelPath = `${pfFolder}/key${correct_index}-release.dsb`;

        const isKeyScriptUntouched =
          preserveUnchanged &&
          !this_key.is_script_dirty &&
          !isUserHeaderDirty &&
          !isDeviceTypeChanged &&
          (this_key.orig_key_txt_bytes !== null || this_key.orig_dsb_bytes !== null);

        if (isKeyScriptUntouched) {
          // Preserve exact original key script & bytecode bytes without overwriting
          if (this_key.orig_key_txt_bytes !== null) {
            filesMap.set(keyTxtPath, this_key.orig_key_txt_bytes);
          }
          if (this_key.orig_dsb_bytes !== null) {
            filesMap.set(dsbPath, this_key.orig_dsb_bytes);
            this_key.binary_array = this_key.orig_dsb_bytes;
          } else if (this_key.orig_key_txt_bytes !== null) {
            const compRes = compileSingleKey(this_profile, this_key, importDict);
            if (!compRes.ok) return compRes;
            filesMap.set(dsbPath, this_key.binary_array);
          }

          if (this_key.orig_key_rel_txt_bytes !== null) {
            filesMap.set(keyRelTxtPath, this_key.orig_key_rel_txt_bytes);
          }
          if (this_key.orig_dsb_rel_bytes !== null) {
            filesMap.set(dsbRelPath, this_key.orig_dsb_rel_bytes);
            this_key.binary_array_on_release = this_key.orig_dsb_rel_bytes;
          }
        } else {
          // Key script or flags changed (or new key): compile this key
          const compRes = compileSingleKey(this_profile, this_key, importDict);
          if (!compRes.ok) {
            return compRes;
          }

          filesMap.set(keyTxtPath, utf8Encoder.encode((this_key.script || '').replace(/\r/g, '')));
          filesMap.set(dsbPath, this_key.binary_array);

          if (this_key.script_on_release && this_key.script_on_release.replace(/^[ \t]+/, '').length > 0 && this_key.binary_array_on_release) {
            filesMap.set(keyRelTxtPath, utf8Encoder.encode(this_key.script_on_release.replace(/\r/g, '')));
            filesMap.set(dsbRelPath, this_key.binary_array_on_release);
          }
        }

        if (this_key.color) {
          configLines.push(`SWCOLOR_${correct_index} ${this_key.color[0]} ${this_key.color[1]} ${this_key.color[2]}`);
        }
      }

      if (
        preserveUnchanged &&
        !this_profile.is_config_dirty &&
        !isDeviceTypeChanged &&
        this_profile.orig_files_map &&
        this_profile.orig_files_map.has('config.txt')
      ) {
        filesMap.set(`${pfFolder}/config.txt`, toUint8Array(this_profile.orig_files_map.get('config.txt')));
      } else {
        filesMap.set(`${pfFolder}/config.txt`, utf8Encoder.encode(configLines.join('\n') + '\n'));
      }
    }

    return {
      ok: true,
      filesMap,
    };
  }

  // Update all profiles and keys after a successful save so subsequent saves only write newly changed keys
  function commitSavedState(profileList, savedFilesMap, deviceType = DP_MODEL_DUCKYPAD_PRO) {
    for (const pf of profileList) {
      const pfFolder = `profile_${pf.name}`;
      pf.path = pfFolder;
      pf.orig_folder_name = pfFolder;
      pf.orig_files_map = new Map();
      const prefix = pfFolder + '/';
      for (const [p, bytes] of savedFilesMap.entries()) {
        if (p.startsWith(prefix)) {
          pf.orig_files_map.set(p.slice(prefix.length), toUint8Array(bytes));
        }
      }
      pf.is_dirty = false;
      pf.is_config_dirty = false;

      for (let key_index = 0; key_index < pf.keylist.length; key_index++) {
        const k = pf.keylist[key_index];
        if (!k) continue;
        k.index = key_index;
        const correct_index = get_appropriate_key_index(key_index + 1, deviceType);
        if (!correct_index) continue;
        const keyTxt = savedFilesMap.get(`${pfFolder}/key${correct_index}.txt`);
        const keyRelTxt = savedFilesMap.get(`${pfFolder}/key${correct_index}-release.txt`);
        const dsb = savedFilesMap.get(`${pfFolder}/key${correct_index}.dsb`);
        const dsbRel = savedFilesMap.get(`${pfFolder}/key${correct_index}-release.dsb`);

        k.orig_disk_index = correct_index;
        k.orig_key_txt_bytes = keyTxt ? new Uint8Array(keyTxt) : null;
        k.orig_key_rel_txt_bytes = keyRelTxt ? new Uint8Array(keyRelTxt) : null;
        k.orig_dsb_bytes = dsb ? new Uint8Array(dsb) : null;
        k.orig_dsb_rel_bytes = dsbRel ? new Uint8Array(dsbRel) : null;
        k.is_dirty = false;
        k.is_script_dirty = false;
      }
    }
  }

  // Differential sync operations (ported from my_compare.py)
  const duckypad_file_whitelist = [
    'profile',
    'dpkm_',
    'config.txt',
    'key',
    'state.sps',
    profile_info_dot_txt,
    user_header_dot_txt,
  ];
  const duckypad_file_blacklist = ['keymaps', 'profile_backups'];

  function is_duckypad_file(name) {
    const lower = name.toLowerCase().trim();
    for (const b of duckypad_file_blacklist) {
      if (lower.includes(b)) return false;
    }
    for (const w of duckypad_file_whitelist) {
      if (lower.startsWith(w)) return true;
    }
    return false;
  }

  // Computes sync operations between oldFilesMap (Map<path, Uint8Array>) and newFilesMap (Map<path, Uint8Array>)
  // Returns array of { action: 'mkdir'|'rmdir'|'cpf'|'rmf', path: string, data?: Uint8Array, isOverwrite?: boolean }
  function computeFileSyncOps(oldFilesMap, newFilesMap, options = {}) {
    const ops = [];
    const oldDirs = new Set();
    const newDirs = new Set();
    const deletedDirs = options.deletedDirs instanceof Set ? options.deletedDirs : null;

    for (const p of oldFilesMap.keys()) {
      const parts = p.split('/');
      if (parts.length > 1 && is_duckypad_file(parts[0])) oldDirs.add(parts[0]);
    }
    for (const p of newFilesMap.keys()) {
      const parts = p.split('/');
      if (parts.length > 1 && is_duckypad_file(parts[0])) newDirs.add(parts[0]);
    }

    // Top-level files
    const oldTopFiles = [...oldFilesMap.keys()].filter(p => !p.includes('/') && is_duckypad_file(p));
    const newTopFiles = [...newFilesMap.keys()].filter(p => !p.includes('/') && is_duckypad_file(p));

    for (const f of oldTopFiles) {
      if (!newFilesMap.has(f)) {
        ops.push({ action: 'rmf', path: f });
      } else if (ZipMD5.md5Hex(toUint8Array(oldFilesMap.get(f))) !== ZipMD5.md5Hex(toUint8Array(newFilesMap.get(f)))) {
        ops.push({ action: 'cpf', path: f, data: toUint8Array(newFilesMap.get(f)), isOverwrite: true });
      }
    }
    for (const f of newTopFiles) {
      if (!oldFilesMap.has(f)) {
        ops.push({ action: 'cpf', path: f, data: toUint8Array(newFilesMap.get(f)), isOverwrite: false });
      }
    }

    // Directories to delete (only delete if explicitly removed/renamed or if deletedDirs filter not restricted)
    for (const d of oldDirs) {
      if (!newDirs.has(d)) {
        if (!deletedDirs || deletedDirs.has(d)) {
          ops.push({ action: 'rmdir', path: d });
        }
      }
    }

    // Directories to create
    for (const d of newDirs) {
      if (!oldDirs.has(d)) {
        ops.push({ action: 'mkdir', path: d });
        for (const [p, data] of newFilesMap.entries()) {
          if (p.startsWith(d + '/')) {
            const fileName = p.slice(d.length + 1);
            if (is_duckypad_file(fileName)) {
              ops.push({ action: 'cpf', path: p, data: toUint8Array(data), isOverwrite: false });
            }
          }
        }
      }
    }

    // Directories in both
    const modifiedProfiles = new Set();
    for (const d of newDirs) {
      if (!oldDirs.has(d)) continue;
      const oldSub = [...oldFilesMap.keys()].filter(p => p.startsWith(d + '/') && is_duckypad_file(p.slice(d.length + 1)));
      const newSub = [...newFilesMap.keys()].filter(p => p.startsWith(d + '/') && is_duckypad_file(p.slice(d.length + 1)));
      const oldSubSet = new Set(oldSub);
      const newSubSet = new Set(newSub);

      for (const p of oldSub) {
        const subName = p.slice(d.length + 1);
        if (subName.toLowerCase() === 'state.sps') continue;
        if (!newSubSet.has(p)) {
          ops.push({ action: 'rmf', path: p });
          if (d.toLowerCase().startsWith('profile')) modifiedProfiles.add(d);
        } else if (ZipMD5.md5Hex(toUint8Array(oldFilesMap.get(p))) !== ZipMD5.md5Hex(toUint8Array(newFilesMap.get(p)))) {
          ops.push({ action: 'cpf', path: p, data: toUint8Array(newFilesMap.get(p)), isOverwrite: true });
          if (d.toLowerCase().startsWith('profile')) modifiedProfiles.add(d);
        }
      }
      for (const p of newSub) {
        const subName = p.slice(d.length + 1);
        if (subName.toLowerCase() === 'state.sps') continue;
        if (!oldSubSet.has(p)) {
          ops.push({ action: 'cpf', path: p, data: toUint8Array(newFilesMap.get(p)), isOverwrite: false });
          if (d.toLowerCase().startsWith('profile')) modifiedProfiles.add(d);
        }
      }
    }

    // Delete state.sps on modified profiles (matching get_remove_sps_ops in my_compare.py)
    for (const pfDir of modifiedProfiles) {
      ops.push({ action: 'rmf', path: `${pfDir}/state.sps` });
    }

    return ops;
  }

  // Standard library default code (from ds_stdlib.py)
  const default_stdlib_code = `
FUN WAITKEY(key_id)
    WHILE 1
        VAR pressed = _BLOCKING_READKEY
        IF pressed == key_id
            RETURN 1
        END_IF
    END_WHILE
END_FUN

FUN MEMSET(addr, value, length)
    VAR i = 0
    WHILE i < length
        POKE8(addr + i, value)
        i = i + 1
    END_WHILE
END_FUN

FUN ABS(n)
    IF _UNSIGNED_MATH == 1
        RETURN n
    END_IF
    
    IF n < 0
        RETURN n * -1
    END_IF
    
    RETURN n
END_FUN

FUN MIN(a, b)
    IF a < b
        RETURN a
    END_IF
    RETURN b
END_FUN

FUN MAX(a, b)
    IF a > b
        RETURN a
    END_IF
    RETURN b
END_FUN
`.trim();

  const stdlib_url = 'https://raw.githubusercontent.com/duckyPad/DPDS-Standard-Library/refs/heads/master/releases/duckypad_stdlib_latest.txt';
  const stdlib_readme_url = 'https://github.com/duckyPad/DPDS-Standard-Library/blob/master/README.md';

  // Sample Profiles for instant demo/testing in browser
  function createSampleProfiles() {
    const p1 = new dp_profile();
    p1.name = 'Welcome_Demo';
    p1.bg_color = [84, 22, 180];
    p1.kd_color = [0, 220, 130];
    p1.dim_unused = true;

    const demoKeys = [
      { idx: 0, name: 'Hello', name2: 'World', color: [37, 99, 235], script: '// Type a greeting\nSTRINGLN Hello from duckyPad Web Configurator!' },
      { idx: 1, name: 'Copy', name2: '', color: [16, 185, 129], script: 'CTRL c' },
      { idx: 2, name: 'Paste', name2: '', color: [16, 185, 129], script: 'CTRL v' },
      { idx: 3, name: 'Undo', name2: '', color: [245, 158, 11], script: 'CTRL z' },
      { idx: 4, name: 'Run', name2: 'Cmd', color: [236, 72, 153], script: 'GUI r\nDELAY 250\nSTRINGLN calc' },
      { idx: 5, name: 'Counter', name2: 'OLED', color: [139, 92, 246], script: 'USE_STDLIB\n$_GV0 = $_GV0 + 1\nOLED_CLEAR\nOLED_CURSOR 10 24\nOLED_CPRINT Pressed $_GV0%d times!\nOLED_UPDATE', abort: true },
      { idx: 6, name: 'Cycle', name2: 'Loop', color: [14, 165, 233], script: 'LOOP0:\nSTRING Step 1\nLOOP1:\nSTRING Step 2\nLOOP2:\nSTRING Step 3' },
      { idx: 7, name: 'RGB', name2: 'Wave', color: [239, 68, 68], script: 'VAR i = 1\nWHILE $i <= 20\n    SWC_SET $i 255 60 180\n    DELAY 25\n    $i = $i + 1\nEND_WHILE\nDELAY 300\nSWC_RESET 99', abort: true },
      { idx: 20, name: 'Vol +', name2: '', color: null, script: 'MK_VOLUP' },
      { idx: 21, name: 'Vol -', name2: '', color: null, script: 'MK_VOLDOWN' },
      { idx: 22, name: 'Mute', name2: '', color: null, script: 'MK_MUTE' },
      { idx: 23, name: 'ScrlUp', name2: '', color: null, script: 'MOUSE_WHEEL 2' },
      { idx: 24, name: 'ScrlDn', name2: '', color: null, script: 'MOUSE_WHEEL -2' },
      { idx: 25, name: 'Play', name2: '', color: null, script: 'MK_PP' },
    ];

    for (const dk of demoKeys) {
      const k = new dp_key();
      k.index = dk.idx;
      k.name = dk.name;
      k.name_line2 = dk.name2 || null;
      k.color = dk.color;
      k.script = dk.script;
      k.allow_abort = Boolean(dk.abort);
      p1.keylist[dk.idx] = k;
    }

    const p2 = new dp_profile();
    p2.name = 'Dev_Shortcuts';
    p2.bg_color = [15, 118, 110];
    p2.dim_unused = true;

    const devKeys = [
      { idx: 0, name: 'Term', name2: 'Open', color: [30, 41, 59], script: 'CTRL ALT t' },
      { idx: 1, name: 'Git', name2: 'Status', color: [234, 88, 12], script: 'STRINGLN git status' },
      { idx: 2, name: 'Git', name2: 'Diff', color: [234, 88, 12], script: 'STRINGLN git diff' },
      { idx: 3, name: 'Build', name2: 'Test', color: [34, 197, 94], script: 'STRINGLN npm test' },
      { idx: 4, name: 'Prev', name2: 'Prof', color: [99, 102, 241], script: 'PREV_PROFILE' },
      { idx: 5, name: 'Next', name2: 'Prof', color: [99, 102, 241], script: 'NEXT_PROFILE' },
    ];
    for (const dk of devKeys) {
      const k = new dp_key();
      k.index = dk.idx;
      k.name = dk.name;
      k.name_line2 = dk.name2 || null;
      k.color = dk.color;
      k.script = dk.script;
      p2.keylist[dk.idx] = k;
    }

    return [p1, p2];
  }

  return {
    THIS_VERSION_NUMBER,
    DP_MODEL_OG_DUCKYPAD,
    DP_MODEL_DUCKYPAD_PRO,
    MIN_DUCKYPAD_PRO_FIRMWARE_VERSION,
    MAX_DUCKYPAD_PRO_FIRMWARE_VERSION,
    MIN_DUCKYPAD_2020_FIRMWARE_VERSION,
    MAX_DUCKYPAD_2020_FIRMWARE_VERSION,
    MAX_PROFILE_NAME_LEN,
    MAX_EXPANSION_MODULE_COUNT,
    CHANNELS_PER_EXPANSION_MODULE,
    MAX_EXPANSION_CHANNEL,
    BUTTON_RE1_CW,
    BUTTON_RE1_CCW,
    BUTTON_RE1_PUSH,
    BUTTON_RE2_CW,
    BUTTON_RE2_CCW,
    BUTTON_RE2_PUSH,
    EXP_BUTTON_START,
    KEY_NAME_MAX_CHAR_PER_LINE,
    MECH_OBSW_COUNT,
    ROTARY_ENCODER_SW_COUNT,
    ONBOARD_SPARE_GPIO_COUNT,
    MAX_PROFILE_COUNT,
    MAX_KEY_COUNT,
    profile_info_dot_txt,
    user_header_dot_txt,
    stdlib_source_tag_NO_SPACE,
    user_header_source_tag_NO_SPACE,
    dp24_to_dp20_lookup_1idx,
    dp20_to_dp24_lookup_0idx,
    is_rotary_encoder_button,
    is_expansion_button,
    get_appropriate_key_index,
    clean_input,
    rgb_to_hex,
    hex_to_rgb,
    adapt_color,
    toUint8Array,
    dp_key,
    dp_profile,
    convert_key_order_dp20_to_dp24,
    parseVirtualFileSystem,
    compileAndBuildFileSystem,
    commitSavedState,
    is_duckypad_file,
    computeFileSyncOps,
    default_stdlib_code,
    stdlib_url,
    stdlib_readme_url,
    createSampleProfiles,
  };
});
