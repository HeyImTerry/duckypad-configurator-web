// DuckyScript 3 / DSVM2 Compiler & Preprocessor
// Ported from duckyPad Configurator v4.0.2 (dsvm_common.py, dsvm_preprocessor.py, dsvm_ds2py.py, dsvm_myast.py, dsvm_optimizer.py, dsvm_make_bytecode.py)

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DSVM = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DSVM_VERSION = 2;
  const DSVM_FUNC_ARG_MAX_SIZE = 255;
  const STRING_MAX_SIZE = 256;
  const REPEAT_MAX_SIZE = 256;
  const MAX_COMBO = 10;

  const MEM_END_ADDR = 0xFFFF;
  const USER_VAR_START_ADDRESS = 0xF000;
  const USER_VAR_BYTE_WIDTH = 4;
  const USER_VAR_END_ADDRESS_INCLUSIVE = 0xF3FF;
  const MAX_UDV_COUNT = Math.floor((USER_VAR_END_ADDRESS_INCLUSIVE - USER_VAR_START_ADDRESS + 1) / USER_VAR_BYTE_WIDTH);
  const PGV_START_ADDRESS = 0xFC00;
  const PGV_BYTE_WIDTH = 4;
  const PGV_END_ADDRESS_INCLUSIVE = 0xFDFF;

  const INTERAL_VAR_START_ADDRESS = 0xFE00;
  const INTERAL_VAR_BYTE_WIDTH = 4;
  const INTERAL_VAR_END_ADDRESS_INCLUSIVE = MEM_END_ADDR;
  const OP_DROP_REPLACEMENT_ADDR = MEM_END_ADDR;

  const STACK_BASE_ADDR = 0xEFFF;
  const MIN_STACK_SIZE_BYTES = 512;
  const STACK_MOAT_BYTES = 16;
  const MAX_BIN_SIZE = STACK_BASE_ADDR - MIN_STACK_SIZE_BYTES - STACK_MOAT_BYTES;
  const DUMMY_VAR_NAME = '_DSVM_DUMMY';
  const DSVM_DEFAULT_FN = 'main';

  const PARSE_OK = 0;
  const PARSE_ERROR = 1;

  // Keywords
  const KW = {
    kw_REPEAT: 'REPEAT',
    kw_REM: 'REM',
    kw_C_COMMENT: '//',
    kw_PEEK8: 'PEEK8',
    kw_PEEKU8: 'PEEKU8',
    kw_PEEK16: 'PEEK16',
    kw_PEEKU16: 'PEEKU16',
    kw_PEEK32: 'PEEK32',
    kw_POKE8: 'POKE8',
    kw_POKE16: 'POKE16',
    kw_POKE32: 'POKE32',
    kw_ULT: 'ULT',
    kw_ULTE: 'ULTE',
    kw_UGT: 'UGT',
    kw_UGTE: 'UGTE',
    kw_UDIV: 'UDIV',
    kw_UMOD: 'UMOD',
    kw_LSR: 'LSR',
    kw_RANDCHR: 'RANDCHR',
    kw_RANDINT: 'RANDINT',
    kw_RANDUINT: 'RANDUINT',
    kw_PUTS: 'PUTS',
    kw_HIDTX: 'HIDTX',
    kw_TRUE: 'TRUE',
    kw_FALSE: 'FALSE',
    kw_RANDOM_LOWERCASE_LETTER: 'RANDOM_LOWERCASE_LETTER',
    kw_RANDOM_UPPERCASE_LETTER: 'RANDOM_UPPERCASE_LETTER',
    kw_RANDOM_LETTER: 'RANDOM_LETTER',
    kw_RANDOM_NUMBER: 'RANDOM_NUMBER',
    kw_RANDOM_SPECIAL: 'RANDOM_SPECIAL',
    kw_RANDOM_CHAR: 'RANDOM_CHAR',
    kw_DEFAULTDELAY: 'DEFAULTDELAY',
    kw_DEFAULTCHARDELAY: 'DEFAULTCHARDELAY',
    kw_CHARJITTER: 'CHARJITTER',
    kw_DELAY: 'DELAY',
    kw_STRING: 'STRING',
    kw_STRINGLN: 'STRINGLN',
    kw_LOOP: 'LOOP',
    kw_DP_SLEEP: 'DP_SLEEP',
    kw_PREV_PROFILE: 'PREV_PROFILE',
    kw_NEXT_PROFILE: 'NEXT_PROFILE',
    kw_GOTO_PROFILE: 'GOTO_PROFILE',
    kw_SKIP_PROFILE: 'SKIP_PROFILE',
    kw_KEYDOWN: 'KEYDOWN',
    kw_KEYUP: 'KEYUP',
    kw_INJECT_MOD: 'INJECT_MOD',
    kw_SWCOLOR: 'SWCOLOR',
    kw_SWCC: 'SWC_SET',
    kw_SWCF: 'SWC_FILL',
    kw_SWCR: 'SWC_RESET',
    kw_OLED_PRINT: 'OLED_PRINT',
    kw_OLED_LPRINT: 'OLED_LPRINT',
    kw_OLED_CPRINT: 'OLED_CPRINT',
    kw_OLED_OPTPRINT: 'OLED_OPTPRINT',
    kw_OLED_UPDATE: 'OLED_UPDATE',
    kw_OLED_CURSOR: 'OLED_CURSOR',
    kw_OLED_CLEAR: 'OLED_CLEAR',
    kw_OLED_RESTORE: 'OLED_RESTORE',
    kw_OLED_LINE: 'OLED_LINE',
    kw_OLED_RECT: 'OLED_RECT',
    kw_OLED_CIRCLE: 'OLED_CIRCLE',
    kw_BCLR: 'BCLR',
    kw_LMOUSE: 'LMOUSE',
    kw_RMOUSE: 'RMOUSE',
    kw_MMOUSE: 'MMOUSE',
    kw_BMOUSE: 'BMOUSE',
    kw_FMOUSE: 'FMOUSE',
    kw_MOUSE_MOVE: 'MOUSE_MOVE',
    kw_MOUSE_WHEEL: 'MOUSE_WHEEL',
    kw_MOUSE_SCROLL: 'MOUSE_SCROLL',
    kw_VAR_DECLARE: 'VAR',
    kw_VAR_PREFIX: '$',
    kw_DEFINE: 'DEFINE',
    kw_IF: 'IF',
    kw_THEN: 'THEN',
    kw_ELSE_IF: 'ELSE IF',
    kw_END_IF: 'END_IF',
    kw_ELSE: 'ELSE',
    kw_WHILE: 'WHILE',
    kw_END_WHILE: 'END_WHILE',
    kw_FUNCTION: 'FUNCTION',
    kw_END_FUNCTION: 'END_FUNCTION',
    kw_FUN: 'FUN',
    kw_END_FUN: 'END_FUN',
    kw_RETURN: 'RETURN',
    kw_HALT: 'HALT',
    kw_ESCAPE: 'ESCAPE',
    kw_ESC: 'ESC',
    kw_ENTER: 'ENTER',
    kw_UP: 'UP',
    kw_DOWN: 'DOWN',
    kw_LEFT: 'LEFT',
    kw_RIGHT: 'RIGHT',
    kw_UPARROW: 'UPARROW',
    kw_DOWNARROW: 'DOWNARROW',
    kw_LEFTARROW: 'LEFTARROW',
    kw_RIGHTARROW: 'RIGHTARROW',
    kw_BACKSPACE: 'BACKSPACE',
    kw_TAB: 'TAB',
    kw_CAPSLOCK: 'CAPSLOCK',
    kw_PRINTSCREEN: 'PRINTSCREEN',
    kw_SCROLLLOCK: 'SCROLLLOCK',
    kw_PAUSE: 'PAUSE',
    kw_BREAK: 'BREAK',
    kw_INSERT: 'INSERT',
    kw_HOME: 'HOME',
    kw_PAGEUP: 'PAGEUP',
    kw_PAGEDOWN: 'PAGEDOWN',
    kw_DELETE: 'DELETE',
    kw_END: 'END',
    kw_SPACE: 'SPACE',
    kw_SHIFT: 'SHIFT',
    kw_RSHIFT: 'RSHIFT',
    kw_ALT: 'ALT',
    kw_RALT: 'RALT',
    kw_OPTION: 'OPTION',
    kw_ROPTION: 'ROPTION',
    kw_GUI: 'GUI',
    kw_WINDOWS: 'WINDOWS',
    kw_COMMAND: 'COMMAND',
    kw_RWINDOWS: 'RWINDOWS',
    kw_RCOMMAND: 'RCOMMAND',
    kw_CONTROL: 'CONTROL',
    kw_CTRL: 'CTRL',
    kw_RCONTROL: 'RCONTROL',
    kw_RCTRL: 'RCTRL',
    kw_NUMLOCK: 'NUMLOCK',
    kw_KPSLASH: 'KP_SLASH',
    kw_KPASTERISK: 'KP_ASTERISK',
    kw_KPMINUS: 'KP_MINUS',
    kw_KPPLUS: 'KP_PLUS',
    kw_KPENTER: 'KP_ENTER',
    kw_KP1: 'KP_1',
    kw_KP2: 'KP_2',
    kw_KP3: 'KP_3',
    kw_KP4: 'KP_4',
    kw_KP5: 'KP_5',
    kw_KP6: 'KP_6',
    kw_KP7: 'KP_7',
    kw_KP8: 'KP_8',
    kw_KP9: 'KP_9',
    kw_KP0: 'KP_0',
    kw_KPDOT: 'KP_DOT',
    kw_KPEQUAL: 'KP_EQUAL',
    kw_MK_VOLUP: 'MK_VOLUP',
    kw_MK_VOLDOWN: 'MK_VOLDOWN',
    kw_MK_VOLMUTE: 'MK_MUTE',
    kw_MK_EJECT: 'MK_EJECT',
    kw_MK_PREV: 'MK_PREV',
    kw_MK_NEXT: 'MK_NEXT',
    kw_MK_PLAYPAUSE: 'MK_PP',
    kw_MK_STOP: 'MK_STOP',
    kw_RO: 'RO',
    kw_KATAKANAHIRAGANA: 'KATAKANAHIRAGANA',
    kw_YEN: 'YEN',
    kw_HENKAN: 'HENKAN',
    kw_MUHENKAN: 'MUHENKAN',
    kw_KPJPCOMMA: 'KPJPCOMMA',
    kw_HANGEUL: 'HANGEUL',
    kw_HANJA: 'HANJA',
    kw_KATAKANA: 'KATAKANA',
    kw_HIRAGANA: 'HIRAGANA',
    kw_ZENKAKUHANKAKU: 'ZENKAKUHANKAKU',
    kw_MENU: 'MENU',
    kw_APP: 'APP',
    kw_POWER: 'POWER',
    kw_LOOP_BREAK: 'LBREAK',
    kw_CONTINUE: 'CONTINUE',
    kw_REM_BLOCK: 'REM_BLOCK',
    kw_END_REM: 'END_REM',
    kw_STRINGLN_BLOCK: 'STRINGLN_BLOCK',
    kw_END_STRINGLN: 'END_STRINGLN',
    kw_STRING_BLOCK: 'STRING_BLOCK',
    kw_END_STRING: 'END_STRING',
    kw_PASS: 'PASS',
    kw_STR_PRINT_FORMAT: '_STR_PRINT_FORMAT',
    kw_STR_PRINT_PADDING: '_STR_PRINT_PADDING',
  };

  const rv_IS_NUMLOCK_ON = '_IS_NUMLOCK_ON';
  const rv_IS_CAPSLOCK_ON = '_IS_CAPSLOCK_ON';
  const rv_IS_SCROLLLOCK_ON = '_IS_SCROLLLOCK_ON';
  const rv_KBLED_BITFIELD = '_KBLED_BITFIELD';

  const ds_kw_set = new Set(Object.values(KW));

  // Python 3 keywords for is_ds_keyword
  const PYTHON_KEYWORDS = new Set([
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
    'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
    'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
    'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
    'while', 'with', 'yield'
  ]);

  const KEY_TYPE_UNKNOWN = 0;
  const KEY_TYPE_CHAR = 1;
  const KEY_TYPE_MODIFIER = 2;
  const KEY_TYPE_SPECIAL = 3;
  const KEY_TYPE_MEDIA = 4;
  const KEY_TYPE_MOUSE_BUTTON = 11;

  const ds_hid_keyname_dict = {
    [KW.kw_LMOUSE]: [1, KEY_TYPE_MOUSE_BUTTON],
    [KW.kw_RMOUSE]: [2, KEY_TYPE_MOUSE_BUTTON],
    [KW.kw_MMOUSE]: [4, KEY_TYPE_MOUSE_BUTTON],
    [KW.kw_BMOUSE]: [8, KEY_TYPE_MOUSE_BUTTON],
    [KW.kw_FMOUSE]: [16, KEY_TYPE_MOUSE_BUTTON],
    [KW.kw_UP]: [0x52, KEY_TYPE_SPECIAL],
    [KW.kw_DOWN]: [0x51, KEY_TYPE_SPECIAL],
    [KW.kw_LEFT]: [0x50, KEY_TYPE_SPECIAL],
    [KW.kw_RIGHT]: [0x4F, KEY_TYPE_SPECIAL],
    [KW.kw_UPARROW]: [0x52, KEY_TYPE_SPECIAL],
    [KW.kw_DOWNARROW]: [0x51, KEY_TYPE_SPECIAL],
    [KW.kw_LEFTARROW]: [0x50, KEY_TYPE_SPECIAL],
    [KW.kw_RIGHTARROW]: [0x4F, KEY_TYPE_SPECIAL],
    [KW.kw_ESCAPE]: [0x29, KEY_TYPE_SPECIAL],
    [KW.kw_ESC]: [0x29, KEY_TYPE_SPECIAL],
    [KW.kw_ENTER]: [0x28, KEY_TYPE_SPECIAL],
    [KW.kw_BACKSPACE]: [0x2A, KEY_TYPE_SPECIAL],
    [KW.kw_TAB]: [0x2B, KEY_TYPE_SPECIAL],
    [KW.kw_CAPSLOCK]: [0x39, KEY_TYPE_SPECIAL],
    [KW.kw_PRINTSCREEN]: [0x46, KEY_TYPE_SPECIAL],
    [KW.kw_SCROLLLOCK]: [0x47, KEY_TYPE_SPECIAL],
    [KW.kw_PAUSE]: [0x48, KEY_TYPE_SPECIAL],
    [KW.kw_BREAK]: [0x48, KEY_TYPE_SPECIAL],
    [KW.kw_INSERT]: [0x49, KEY_TYPE_SPECIAL],
    [KW.kw_HOME]: [0x4A, KEY_TYPE_SPECIAL],
    [KW.kw_PAGEUP]: [0x4B, KEY_TYPE_SPECIAL],
    [KW.kw_PAGEDOWN]: [0x4E, KEY_TYPE_SPECIAL],
    [KW.kw_DELETE]: [0x4C, KEY_TYPE_SPECIAL],
    [KW.kw_END]: [0x4D, KEY_TYPE_SPECIAL],
    [KW.kw_NUMLOCK]: [0x53, KEY_TYPE_SPECIAL],
    [KW.kw_KPSLASH]: [0x54, KEY_TYPE_SPECIAL],
    [KW.kw_KPASTERISK]: [0x55, KEY_TYPE_SPECIAL],
    [KW.kw_KPMINUS]: [0x56, KEY_TYPE_SPECIAL],
    [KW.kw_KPPLUS]: [0x57, KEY_TYPE_SPECIAL],
    [KW.kw_KPENTER]: [0x58, KEY_TYPE_SPECIAL],
    [KW.kw_KP1]: [0x59, KEY_TYPE_SPECIAL],
    [KW.kw_KP2]: [0x5a, KEY_TYPE_SPECIAL],
    [KW.kw_KP3]: [0x5b, KEY_TYPE_SPECIAL],
    [KW.kw_KP4]: [0x5c, KEY_TYPE_SPECIAL],
    [KW.kw_KP5]: [0x5d, KEY_TYPE_SPECIAL],
    [KW.kw_KP6]: [0x5e, KEY_TYPE_SPECIAL],
    [KW.kw_KP7]: [0x5f, KEY_TYPE_SPECIAL],
    [KW.kw_KP8]: [0x60, KEY_TYPE_SPECIAL],
    [KW.kw_KP9]: [0x61, KEY_TYPE_SPECIAL],
    [KW.kw_KP0]: [0x62, KEY_TYPE_SPECIAL],
    [KW.kw_KPDOT]: [0x63, KEY_TYPE_SPECIAL],
    [KW.kw_KPEQUAL]: [0x67, KEY_TYPE_SPECIAL],
    [KW.kw_POWER]: [0x66, KEY_TYPE_SPECIAL],
    [KW.kw_MENU]: [0x65, KEY_TYPE_SPECIAL],
    [KW.kw_APP]: [0x65, KEY_TYPE_SPECIAL],
    [KW.kw_RO]: [0x87, KEY_TYPE_SPECIAL],
    [KW.kw_KATAKANAHIRAGANA]: [0x88, KEY_TYPE_SPECIAL],
    [KW.kw_YEN]: [0x89, KEY_TYPE_SPECIAL],
    [KW.kw_HENKAN]: [0x8a, KEY_TYPE_SPECIAL],
    [KW.kw_MUHENKAN]: [0x8b, KEY_TYPE_SPECIAL],
    [KW.kw_KPJPCOMMA]: [0x8c, KEY_TYPE_SPECIAL],
    [KW.kw_HANGEUL]: [0x90, KEY_TYPE_SPECIAL],
    [KW.kw_HANJA]: [0x91, KEY_TYPE_SPECIAL],
    [KW.kw_KATAKANA]: [0x92, KEY_TYPE_SPECIAL],
    [KW.kw_HIRAGANA]: [0x93, KEY_TYPE_SPECIAL],
    [KW.kw_ZENKAKUHANKAKU]: [0x94, KEY_TYPE_SPECIAL],
    F1: [0x3A, KEY_TYPE_SPECIAL],
    F2: [0x3B, KEY_TYPE_SPECIAL],
    F3: [0x3C, KEY_TYPE_SPECIAL],
    F4: [0x3D, KEY_TYPE_SPECIAL],
    F5: [0x3E, KEY_TYPE_SPECIAL],
    F6: [0x3F, KEY_TYPE_SPECIAL],
    F7: [0x40, KEY_TYPE_SPECIAL],
    F8: [0x41, KEY_TYPE_SPECIAL],
    F9: [0x42, KEY_TYPE_SPECIAL],
    F10: [0x43, KEY_TYPE_SPECIAL],
    F11: [0x44, KEY_TYPE_SPECIAL],
    F12: [0x45, KEY_TYPE_SPECIAL],
    F13: [0x68, KEY_TYPE_SPECIAL],
    F14: [0x69, KEY_TYPE_SPECIAL],
    F15: [0x6a, KEY_TYPE_SPECIAL],
    F16: [0x6b, KEY_TYPE_SPECIAL],
    F17: [0x6c, KEY_TYPE_SPECIAL],
    F18: [0x6d, KEY_TYPE_SPECIAL],
    F19: [0x6e, KEY_TYPE_SPECIAL],
    F20: [0x6f, KEY_TYPE_SPECIAL],
    F21: [0x70, KEY_TYPE_SPECIAL],
    F22: [0x71, KEY_TYPE_SPECIAL],
    F23: [0x72, KEY_TYPE_SPECIAL],
    F24: [0x73, KEY_TYPE_SPECIAL],
    [KW.kw_SPACE]: [0x20, KEY_TYPE_CHAR],
    [KW.kw_SHIFT]: [0x02, KEY_TYPE_MODIFIER],
    [KW.kw_RSHIFT]: [0x20, KEY_TYPE_MODIFIER],
    [KW.kw_ALT]: [0x04, KEY_TYPE_MODIFIER],
    [KW.kw_OPTION]: [0x04, KEY_TYPE_MODIFIER],
    [KW.kw_RALT]: [0x40, KEY_TYPE_MODIFIER],
    [KW.kw_ROPTION]: [0x40, KEY_TYPE_MODIFIER],
    [KW.kw_GUI]: [0x08, KEY_TYPE_MODIFIER],
    [KW.kw_WINDOWS]: [0x08, KEY_TYPE_MODIFIER],
    [KW.kw_RWINDOWS]: [0x80, KEY_TYPE_MODIFIER],
    [KW.kw_COMMAND]: [0x08, KEY_TYPE_MODIFIER],
    [KW.kw_RCOMMAND]: [0x80, KEY_TYPE_MODIFIER],
    [KW.kw_CTRL]: [0x01, KEY_TYPE_MODIFIER],
    [KW.kw_CONTROL]: [0x01, KEY_TYPE_MODIFIER],
    [KW.kw_RCTRL]: [0x10, KEY_TYPE_MODIFIER],
    [KW.kw_RCONTROL]: [0x10, KEY_TYPE_MODIFIER],
    [KW.kw_MK_VOLUP]: [0x40, KEY_TYPE_MEDIA],
    [KW.kw_MK_VOLDOWN]: [0x80, KEY_TYPE_MEDIA],
    [KW.kw_MK_VOLMUTE]: [0x20, KEY_TYPE_MEDIA],
    [KW.kw_MK_EJECT]: [0x08, KEY_TYPE_MEDIA],
    [KW.kw_MK_PREV]: [0x02, KEY_TYPE_MEDIA],
    [KW.kw_MK_NEXT]: [0x01, KEY_TYPE_MEDIA],
    [KW.kw_MK_PLAYPAUSE]: [0x10, KEY_TYPE_MEDIA],
    [KW.kw_MK_STOP]: [0x04, KEY_TYPE_MEDIA],
  };

  function is_ds_keyword(name) {
    return PYTHON_KEYWORDS.has(name) || ds_kw_set.has(name) || Object.prototype.hasOwnProperty.call(ds_hid_keyname_dict, name);
  }

  const SymType = {
    GLOBAL_VAR: 0,
    FUNC_ARG: 1,
    FUNC_LOCAL_VAR: 2,
    RESERVED_VAR: 3,
  };

  function makeOpcode(name, code, length, is_virtual = false) {
    return { name, code, length, is_virtual };
  }

  const OP = {
    OP_NOP: makeOpcode('NOP', 0, 1),
    OP_PUSHC16: makeOpcode('PUSHC16', 1, 3),
    OP_PUSHI: makeOpcode('PUSHI', 2, 3),
    OP_PUSHR: makeOpcode('PUSHR', 3, 3),
    OP_POPI: makeOpcode('POPI', 4, 3),
    OP_POPR: makeOpcode('POPR', 5, 3),
    OP_BRZ: makeOpcode('BRZ', 6, 3),
    OP_JMP: makeOpcode('JMP', 7, 3),
    OP_ALLOC: makeOpcode('ALLOC', 8, 3),
    OP_CALL: makeOpcode('CALL', 9, 3),
    OP_RET: makeOpcode('RET', 10, 3),
    OP_HALT: makeOpcode('HALT', 11, 1),
    OP_PUSH0: makeOpcode('PUSH0', 12, 1),
    OP_PUSH1: makeOpcode('PUSH1', 13, 1),
    OP_DROP: makeOpcode('DROP', 14, 1),
    OP_DUP: makeOpcode('DUP', 15, 1),
    OP_RANDINT: makeOpcode('RANDINT', 16, 1),
    OP_RANDUINT: makeOpcode('RANDUINT', 17, 1),
    OP_PUSHC32: makeOpcode('PUSHC32', 18, 5),
    OP_PUSHC8: makeOpcode('PUSHC8', 19, 2),
    OP_VMVER: makeOpcode('VMVER', 255, 3),

    OP_PEEK8: makeOpcode('PEEK8', 24, 1),
    OP_PEEKU8: makeOpcode('PEEKU8', 25, 1),
    OP_PEEK16: makeOpcode('PEEK16', 26, 1),
    OP_PEEKU16: makeOpcode('PEEKU16', 27, 1),
    OP_PEEK32: makeOpcode('PEEK32', 28, 1),
    OP_POKE8: makeOpcode('POKE8', 29, 1),
    OP_POKE16: makeOpcode('POKE16', 30, 1),
    OP_POKE32: makeOpcode('POKE32', 31, 1),

    OP_EQ: makeOpcode('EQ', 32, 1),
    OP_NOTEQ: makeOpcode('NOTEQ', 33, 1),
    OP_LT: makeOpcode('LT', 34, 1),
    OP_LTE: makeOpcode('LTE', 35, 1),
    OP_GT: makeOpcode('GT', 36, 1),
    OP_GTE: makeOpcode('GTE', 37, 1),
    OP_ADD: makeOpcode('ADD', 38, 1),
    OP_SUB: makeOpcode('SUB', 39, 1),
    OP_MULT: makeOpcode('MULT', 40, 1),
    OP_DIV: makeOpcode('DIV', 41, 1),
    OP_MOD: makeOpcode('MOD', 42, 1),
    OP_POW: makeOpcode('POW', 43, 1),
    OP_LSHIFT: makeOpcode('LSL', 44, 1),
    OP_RSHIFT: makeOpcode('ASR', 45, 1),
    OP_BITOR: makeOpcode('BITOR', 46, 1),
    OP_BITXOR: makeOpcode('BITXOR', 47, 1),
    OP_BITAND: makeOpcode('BITAND', 48, 1),
    OP_LOGIAND: makeOpcode('LOGIAND', 49, 1),
    OP_LOGIOR: makeOpcode('LOGIOR', 50, 1),

    OP_ULT: makeOpcode('ULT', 51, 1),
    OP_ULTE: makeOpcode('ULTE', 52, 1),
    OP_UGT: makeOpcode('UGT', 53, 1),
    OP_UGTE: makeOpcode('UGTE', 54, 1),
    OP_UDIV: makeOpcode('UDIV', 55, 1),
    OP_UMOD: makeOpcode('UMOD', 56, 1),
    OP_LSR: makeOpcode('LSR', 57, 1),

    OP_BITINV: makeOpcode('BITINV', 60, 1),
    OP_LOGINOT: makeOpcode('LOGINOT', 61, 1),
    OP_USUB: makeOpcode('USUB', 62, 1),

    OP_DELAY: makeOpcode('DELAY', 64, 1),
    OP_KDOWN: makeOpcode('KDOWN', 65, 1),
    OP_KUP: makeOpcode('KUP', 66, 1),
    OP_MSCL: makeOpcode('MSCL', 67, 1),
    OP_MMOV: makeOpcode('MMOV', 68, 1),
    OP_SWCF: makeOpcode('SWCF', 69, 1),
    OP_SWCC: makeOpcode('SWCC', 70, 1),
    OP_SWCR: makeOpcode('SWCR', 71, 1),
    OP_STR: makeOpcode('STR', 72, 1),
    OP_STRLN: makeOpcode('STRLN', 73, 1),
    OP_OLED_CUSR: makeOpcode('OLED_CUSR', 74, 1),
    OP_OLED_PRNT: makeOpcode('OLED_PRNT', 75, 1),
    OP_OLED_UPDE: makeOpcode('OLED_UPDE', 76, 1),
    OP_OLED_CLR: makeOpcode('OLED_CLR', 77, 1),
    OP_OLED_REST: makeOpcode('OLED_REST', 78, 1),
    OP_OLED_LINE: makeOpcode('OLED_LINE', 79, 1),
    OP_OLED_RECT: makeOpcode('OLED_RECT', 80, 1),
    OP_OLED_CIRC: makeOpcode('OLED_CIRC', 81, 1),
    OP_BCLR: makeOpcode('BCLR', 82, 1),
    OP_SKIPP: makeOpcode('SKIPP', 83, 1),
    OP_GOTOP: makeOpcode('GOTOP', 84, 1),
    OP_SLEEP: makeOpcode('SLEEP', 85, 1),
    OP_RANDCHR: makeOpcode('RANDCHR', 86, 1),
    OP_PUTS: makeOpcode('PUTS', 87, 1),
    OP_HIDTX: makeOpcode('HIDTX', 88, 1),

    OP_PUSHSTR: makeOpcode('PUSHSTR', 128, 3, true),
    OP_HCF: makeOpcode('HCF', 129, 0, true),
  };

  const pushc_instructions = new Set([OP.OP_PUSHC8, OP.OP_PUSHC16, OP.OP_PUSHC32]);

  const reserved_variables_dict = {
    _DEFAULTDELAY: INTERAL_VAR_START_ADDRESS + 0 * INTERAL_VAR_BYTE_WIDTH,
    _DEFAULTCHARDELAY: INTERAL_VAR_START_ADDRESS + 1 * INTERAL_VAR_BYTE_WIDTH,
    _CHARJITTER: INTERAL_VAR_START_ADDRESS + 2 * INTERAL_VAR_BYTE_WIDTH,
    _RANDOM_MIN: INTERAL_VAR_START_ADDRESS + 3 * INTERAL_VAR_BYTE_WIDTH,
    _RANDOM_MAX: INTERAL_VAR_START_ADDRESS + 4 * INTERAL_VAR_BYTE_WIDTH,
    _RANDOM_INT: INTERAL_VAR_START_ADDRESS + 5 * INTERAL_VAR_BYTE_WIDTH,
    _TIME_MS: INTERAL_VAR_START_ADDRESS + 6 * INTERAL_VAR_BYTE_WIDTH,
    _READKEY: INTERAL_VAR_START_ADDRESS + 7 * INTERAL_VAR_BYTE_WIDTH,
    _LOOP_SIZE: INTERAL_VAR_START_ADDRESS + 8 * INTERAL_VAR_BYTE_WIDTH,
    _KEYPRESS_COUNT: INTERAL_VAR_START_ADDRESS + 9 * INTERAL_VAR_BYTE_WIDTH,
    _EPILOGUE_ACTIONS: INTERAL_VAR_START_ADDRESS + 10 * INTERAL_VAR_BYTE_WIDTH,
    _TIME_S: INTERAL_VAR_START_ADDRESS + 11 * INTERAL_VAR_BYTE_WIDTH,
    _ALLOW_ABORT: INTERAL_VAR_START_ADDRESS + 12 * INTERAL_VAR_BYTE_WIDTH,
    _BLOCKING_READKEY: INTERAL_VAR_START_ADDRESS + 13 * INTERAL_VAR_BYTE_WIDTH,
    _KBLED_BITFIELD: INTERAL_VAR_START_ADDRESS + 14 * INTERAL_VAR_BYTE_WIDTH,
    _DONT_REPEAT: INTERAL_VAR_START_ADDRESS + 15 * INTERAL_VAR_BYTE_WIDTH,
    _THIS_KEYID: INTERAL_VAR_START_ADDRESS + 16 * INTERAL_VAR_BYTE_WIDTH,
    _DP_MODEL: INTERAL_VAR_START_ADDRESS + 17 * INTERAL_VAR_BYTE_WIDTH,
    _RTC_IS_VALID: INTERAL_VAR_START_ADDRESS + 18 * INTERAL_VAR_BYTE_WIDTH,
    _RTC_UTC_OFFSET: INTERAL_VAR_START_ADDRESS + 19 * INTERAL_VAR_BYTE_WIDTH,
    _RTC_YEAR: INTERAL_VAR_START_ADDRESS + 20 * INTERAL_VAR_BYTE_WIDTH,
    _RTC_MONTH: INTERAL_VAR_START_ADDRESS + 21 * INTERAL_VAR_BYTE_WIDTH,
    _RTC_DAY: INTERAL_VAR_START_ADDRESS + 22 * INTERAL_VAR_BYTE_WIDTH,
    _RTC_HOUR: INTERAL_VAR_START_ADDRESS + 23 * INTERAL_VAR_BYTE_WIDTH,
    _RTC_MINUTE: INTERAL_VAR_START_ADDRESS + 24 * INTERAL_VAR_BYTE_WIDTH,
    _RTC_SECOND: INTERAL_VAR_START_ADDRESS + 25 * INTERAL_VAR_BYTE_WIDTH,
    _RTC_WDAY: INTERAL_VAR_START_ADDRESS + 26 * INTERAL_VAR_BYTE_WIDTH,
    _RTC_YDAY: INTERAL_VAR_START_ADDRESS + 27 * INTERAL_VAR_BYTE_WIDTH,
    _SW_BITFIELD: INTERAL_VAR_START_ADDRESS + 28 * INTERAL_VAR_BYTE_WIDTH,
    [DUMMY_VAR_NAME]: OP_DROP_REPLACEMENT_ADDR,
  };
  for (let i = 0; i < 32; i++) {
    reserved_variables_dict[`_GV${i}`] = PGV_START_ADDRESS + i * PGV_BYTE_WIDTH;
  }

  const valid_var_chars = new Set('0123456789_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
  const valid_combo_chars = new Set('!"#$%&\'()*+,-./0123456789:;<=>?@[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'.split(''));

  const ds_str_func_lookup = {
    [KW.kw_STRING]: { opcode: OP.OP_STR, arg_len: 1, has_return_value: false },
    [KW.kw_STRINGLN]: { opcode: OP.OP_STRLN, arg_len: 1, has_return_value: false },
    [KW.kw_OLED_OPTPRINT]: { opcode: OP.OP_OLED_PRNT, arg_len: 2, has_return_value: false },
    [KW.kw_GOTO_PROFILE]: { opcode: OP.OP_GOTOP, arg_len: 1, has_return_value: false },
    [KW.kw_OLED_PRINT]: { opcode: OP.OP_HCF, arg_len: 1, has_return_value: false },
    [KW.kw_OLED_LPRINT]: { opcode: OP.OP_HCF, arg_len: 1, has_return_value: false },
    [KW.kw_OLED_CPRINT]: { opcode: OP.OP_HCF, arg_len: 1, has_return_value: false },
  };

  const ds_keypress_func_lookup = {
    [KW.kw_KEYDOWN]: { opcode: OP.OP_KDOWN, arg_len: 1, has_return_value: false },
    [KW.kw_KEYUP]: { opcode: OP.OP_KUP, arg_len: 1, has_return_value: false },
  };

  const ds_builtin_func_lookup = {
    [KW.kw_HALT]: { opcode: OP.OP_HALT, arg_len: 0, has_return_value: false },
    [KW.kw_DELAY]: { opcode: OP.OP_DELAY, arg_len: 1, has_return_value: false },
    [KW.kw_MOUSE_SCROLL]: { opcode: OP.OP_MSCL, arg_len: 2, has_return_value: false },
    [KW.kw_MOUSE_MOVE]: { opcode: OP.OP_MMOV, arg_len: 2, has_return_value: false },
    [KW.kw_SWCF]: { opcode: OP.OP_SWCF, arg_len: 3, has_return_value: false },
    [KW.kw_SWCC]: { opcode: OP.OP_SWCC, arg_len: 4, has_return_value: false },
    [KW.kw_SWCR]: { opcode: OP.OP_SWCR, arg_len: 1, has_return_value: false },
    [KW.kw_OLED_CURSOR]: { opcode: OP.OP_OLED_CUSR, arg_len: 2, has_return_value: false },
    [KW.kw_OLED_UPDATE]: { opcode: OP.OP_OLED_UPDE, arg_len: 0, has_return_value: false },
    [KW.kw_OLED_CLEAR]: { opcode: OP.OP_OLED_CLR, arg_len: 0, has_return_value: false },
    [KW.kw_OLED_RESTORE]: { opcode: OP.OP_OLED_REST, arg_len: 0, has_return_value: false },
    [KW.kw_OLED_LINE]: { opcode: OP.OP_OLED_LINE, arg_len: 4, has_return_value: false },
    [KW.kw_OLED_RECT]: { opcode: OP.OP_OLED_RECT, arg_len: 5, has_return_value: false },
    [KW.kw_OLED_CIRCLE]: { opcode: OP.OP_OLED_CIRC, arg_len: 4, has_return_value: false },
    [KW.kw_BCLR]: { opcode: OP.OP_BCLR, arg_len: 0, has_return_value: false },
    [KW.kw_SKIP_PROFILE]: { opcode: OP.OP_SKIPP, arg_len: 1, has_return_value: false },
    [KW.kw_DP_SLEEP]: { opcode: OP.OP_SLEEP, arg_len: 0, has_return_value: false },
    [KW.kw_RANDCHR]: { opcode: OP.OP_RANDCHR, arg_len: 1, has_return_value: false },
    [KW.kw_RANDINT]: { opcode: OP.OP_RANDINT, arg_len: 2, has_return_value: true },
    [KW.kw_RANDUINT]: { opcode: OP.OP_RANDUINT, arg_len: 2, has_return_value: true },
    [KW.kw_PUTS]: { opcode: OP.OP_PUTS, arg_len: 1, has_return_value: false },
    [KW.kw_HIDTX]: { opcode: OP.OP_HIDTX, arg_len: 1, has_return_value: false },
    [KW.kw_PEEK8]: { opcode: OP.OP_PEEK8, arg_len: 1, has_return_value: true },
    [KW.kw_PEEKU8]: { opcode: OP.OP_PEEKU8, arg_len: 1, has_return_value: true },
    [KW.kw_PEEK16]: { opcode: OP.OP_PEEK16, arg_len: 1, has_return_value: true },
    [KW.kw_PEEKU16]: { opcode: OP.OP_PEEKU16, arg_len: 1, has_return_value: true },
    [KW.kw_PEEK32]: { opcode: OP.OP_PEEK32, arg_len: 1, has_return_value: true },
    [KW.kw_POKE8]: { opcode: OP.OP_POKE8, arg_len: 2, has_return_value: false },
    [KW.kw_POKE16]: { opcode: OP.OP_POKE16, arg_len: 2, has_return_value: false },
    [KW.kw_POKE32]: { opcode: OP.OP_POKE32, arg_len: 2, has_return_value: false },
    [KW.kw_ULT]: { opcode: OP.OP_ULT, arg_len: 2, has_return_value: true },
    [KW.kw_ULTE]: { opcode: OP.OP_ULTE, arg_len: 2, has_return_value: true },
    [KW.kw_UGT]: { opcode: OP.OP_UGT, arg_len: 2, has_return_value: true },
    [KW.kw_UGTE]: { opcode: OP.OP_UGTE, arg_len: 2, has_return_value: true },
    [KW.kw_UDIV]: { opcode: OP.OP_UDIV, arg_len: 2, has_return_value: true },
    [KW.kw_UMOD]: { opcode: OP.OP_UMOD, arg_len: 2, has_return_value: true },
    [KW.kw_LSR]: { opcode: OP.OP_LSR, arg_len: 2, has_return_value: true },
  };

  const ds_func_to_parse_as_str = Object.assign({}, ds_str_func_lookup, ds_keypress_func_lookup);
  const ds_reserved_funcs = Object.assign({}, ds_func_to_parse_as_str, ds_builtin_func_lookup);
  const ds2py_ignored_cmds = new Set([KW.kw_END_IF, KW.kw_END_WHILE, KW.kw_END_FUN]);

  class ds_line {
    constructor(content, orig_lnum_sf1 = 0, indent_lvl = 0, source_fn = null) {
      this.orig_lnum_sf1 = orig_lnum_sf1;
      this.content = content;
      this.py_lnum_sf1 = null;
      this.indent_level = indent_lvl;
      this.source_fn = source_fn === null ? DSVM_DEFAULT_FN : source_fn;
    }
    clone() {
      const c = new ds_line(this.content, this.orig_lnum_sf1, this.indent_level, this.source_fn);
      c.py_lnum_sf1 = this.py_lnum_sf1;
      return c;
    }
  }

  class dsvm_instruction {
    constructor({ opcode = OP.OP_NOP, payload = null, label = null, comment = '', addr = null, parent_func = null, var_type = null } = {}) {
      this.opcode = opcode;
      this.payload = payload;
      this.label = label;
      this.comment = comment;
      this.addr = addr;
      this.parent_func = parent_func;
      this.var_type = var_type;
    }
  }

  function make_list_of_ds_line_obj_from_str_listing(pgm_listing, source_fn = null) {
    return pgm_listing.map((item, idx) => new ds_line(item, idx + 1, 0, source_fn));
  }

  function replace_operators(this_line) {
    if (this_line.replace(/^\s+/, '').startsWith(KW.kw_DEFINE)) {
      return this_line;
    }
    const placeholder = '__DSVM_NOTEQUAL_PLACEHOLDER__';
    let temp = this_line.split('!=').join(placeholder);
    temp = temp.split(KW.kw_VAR_PREFIX).join('')
               .split('||').join(' or ')
               .split('&&').join(' and ')
               .split('!').join(' not ');
    temp = temp.split(placeholder).join('!=');
    return temp;
  }

  // ---------------- PREPROCESSOR ----------------

  function needs_rstrip(first_word) {
    return first_word !== KW.kw_STRING && first_word !== KW.kw_STRINGLN && first_word !== KW.kw_OLED_PRINT;
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function replace_DEFINE_once(pgm_line, def_dict) {
    if (pgm_line.startsWith(KW.kw_STRING + ' ') || pgm_line.startsWith(KW.kw_STRINGLN + ' ')) {
      delete def_dict['TRUE'];
      delete def_dict['FALSE'];
    } else {
      def_dict['TRUE'] = 1;
      def_dict['FALSE'] = 0;
    }
    const keys = Object.keys(def_dict).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      const value = String(def_dict[key]);
      const pattern = new RegExp('\\b' + escapeRegExp(key) + '\\b', 'g');
      if (pattern.test(pgm_line)) {
        pgm_line = pgm_line.replace(pattern, () => value);
        break;
      }
    }
    return pgm_line;
  }

  function replace_DEFINE(source, def_dict) {
    let last_source = '';
    let iterations = 0;
    const max_iterations = Math.max(512, Object.keys(def_dict).length * 2);
    while (last_source !== source) {
      if (iterations > max_iterations) {
        throw new Error('Recursive DEFINE');
      }
      last_source = source;
      source = replace_DEFINE_once(source, def_dict);
      iterations += 1;
    }
    return source;
  }

  function skip_whitespace(pgm_line) {
    let search_index = KW.kw_DEFINE.length;
    while (search_index < pgm_line.length) {
      const ch = pgm_line[search_index];
      if (ch === ' ' || ch === '\t') {
        search_index += 1;
      } else {
        return search_index;
      }
    }
    return -1;
  }

  function is_valid_var_name(varname) {
    if (!varname || varname.length === 0) {
      return [false, 'Empty name'];
    }
    if (/^\d/.test(varname[0])) {
      return [false, `Name can't begin with a number: ${varname}`];
    }
    if (is_ds_keyword(varname)) {
      return [false, `Invalid Variable Name: ${varname}`];
    }
    for (const letter of varname) {
      if (!valid_var_chars.has(letter)) {
        return [false, `Name contains invalid characters: ${varname}`];
      }
    }
    return [true, ''];
  }

  function rsplitOnce(str, sep) {
    const idx = str.lastIndexOf(sep);
    if (idx === -1) return [str];
    return [str.slice(0, idx), str.slice(idx + sep.length)];
  }

  function splitOnce(str, sep) {
    const idx = str.indexOf(sep);
    if (idx === -1) return [str];
    return [str.slice(0, idx), str.slice(idx + sep.length)];
  }

  function new_define(pgm_line, dd) {
    pgm_line = rsplitOnce(pgm_line, KW.kw_C_COMMENT)[0].replace(/\s+$/, '');
    const define_source_start = skip_whitespace(pgm_line);
    if (define_source_start === -1) {
      return [PARSE_ERROR, 'DEFINE content not found'];
    }
    const segments = splitOnce(pgm_line.slice(define_source_start), ' ');
    if (segments.length !== 2) {
      return [PARSE_ERROR, 'empty DEFINE'];
    }
    const [define_source, define_destination] = segments;
    const [is_valid, comment] = is_valid_var_name(define_source);
    if (!is_valid) {
      return [PARSE_ERROR, comment];
    }
    if (Object.prototype.hasOwnProperty.call(dd, define_source) && define_destination !== dd[define_source]) {
      return [PARSE_ERROR, `${define_source} is already defined`];
    }
    dd[define_source] = define_destination;
    return [PARSE_OK, ''];
  }

  function check_loop(pgm_line) {
    try {
      const line_split = pgm_line.split(KW.kw_LOOP).filter(x => x.length > 0);
      if (!line_split[0] || !line_split[0].includes(':')) {
        return [PARSE_ERROR, 'missing ":"', null];
      }
      const number_split = line_split[0].split(':').filter(x => x.length > 0);
      if (number_split.length !== 1) {
        return [PARSE_ERROR, 'wrong number of arguments', null];
      }
      const val = Number(number_split[0].trim());
      if (!Number.isInteger(val) || !/^[+-]?\d+$/.test(number_split[0].trim())) {
        return [PARSE_ERROR, `invalid literal for int() with base 10: '${number_split[0]}'`, null];
      }
      return [PARSE_OK, '', val];
    } catch (e) {
      return [PARSE_ERROR, String(e.message || e), null];
    }
  }

  function new_rem_block_check(lnum, rbss, rbdict) {
    if (rbss.length !== 0) return [PARSE_ERROR, 'unmatched END_REM'];
    rbss.push(lnum);
    rbdict[lnum] = null;
    return [PARSE_OK, ''];
  }

  function new_stringln_block_check(lnum, slbss, slbdict) {
    if (slbss.length !== 0) return [PARSE_ERROR, 'unmatched END_STRINGLN'];
    slbss.push(lnum);
    slbdict[lnum] = null;
    return [PARSE_OK, ''];
  }

  function new_string_block_check(lnum, sbss, sbdict) {
    if (sbss.length !== 0) return [PARSE_ERROR, 'unmatched END_STRING'];
    sbss.push(lnum);
    sbdict[lnum] = null;
    return [PARSE_OK, ''];
  }

  function new_func_check(pgm_line, lnum, fss, fdict) {
    if (fss.length !== 0) return [PARSE_ERROR, 'unmatched END_FUN'];
    if (!pgm_line.endsWith(')')) return [PARSE_ERROR, 'missing )'];
    let fun_name;
    try {
      const words = pgm_line.trim().split(/\s+/);
      if (words.length < 2) return [PARSE_ERROR, 'invalid func name'];
      fun_name = words[1].split('(')[0];
    } catch (e) {
      return [PARSE_ERROR, 'invalid func name'];
    }
    const [isValidVn, vnComment] = is_valid_var_name(fun_name);
    if (!isValidVn) return [PARSE_ERROR, vnComment];
    if (Object.prototype.hasOwnProperty.call(fdict, fun_name)) {
      return [PARSE_ERROR, 'function already exists'];
    }
    let arg_list;
    try {
      const afterOpen = splitOnce(pgm_line, '(').slice(-1)[0];
      const all_args = rsplitOnce(afterOpen, ')')[0];
      arg_list = all_args.split(',').map(x => x.trim()).filter(x => x.length > 0);
    } catch (e) {
      return [PARSE_ERROR, 'Arg parse error'];
    }
    for (const arg of arg_list) {
      const [validArg, comment] = is_valid_var_name(arg);
      if (!validArg) return [PARSE_ERROR, comment];
    }
    if (arg_list.length !== new Set(arg_list).size) {
      return [PARSE_ERROR, 'Duplicate arg name'];
    }
    fss.push(fun_name);
    fdict[fun_name] = { fun_start: lnum, fun_end: null, args: arg_list };
    return [PARSE_OK, ''];
  }

  function rem_block_end_check(lnum, rbss, rbdict) {
    if (rbss.length === 0) return [PARSE_ERROR, 'orphan END_REM'];
    if (rbss.length !== 1) return [PARSE_ERROR, 'unmatched REM_BLOCK'];
    rbdict[rbss.pop()] = lnum;
    return [PARSE_OK, ''];
  }

  function stringln_block_end_check(lnum, slbss, slbdict) {
    if (slbss.length === 0) return [PARSE_ERROR, 'orphan END_STRINGLN'];
    if (slbss.length !== 1) return [PARSE_ERROR, 'unmatched STRINGLN_BLOCK'];
    slbdict[slbss.pop()] = lnum;
    return [PARSE_OK, ''];
  }

  function string_block_end_check(lnum, sbss, sbdict) {
    if (sbss.length === 0) return [PARSE_ERROR, 'orphan END_STRING'];
    if (sbss.length !== 1) return [PARSE_ERROR, 'unmatched STRING_BLOCK'];
    sbdict[sbss.pop()] = lnum;
    return [PARSE_OK, ''];
  }

  function func_end_check(lnum, fss, fdict) {
    if (fss.length === 0) return [PARSE_ERROR, 'orphan END_FUN'];
    const fun_name = fss.pop();
    fdict[fun_name].fun_end = lnum;
    return [PARSE_OK, ''];
  }

  function if_check(pgm_line, lnum, iss) {
    iss.push({ [lnum]: { else_if: [], else: null, end_if: null } });
    return [PARSE_OK, ''];
  }

  function end_if_check(pgm_line, lnum, iss, if_skip_table, if_take_table) {
    if (pgm_line !== KW.kw_END_IF) return [PARSE_ERROR, 'missing END_IF at end'];
    if (iss.length === 0) return [PARSE_ERROR, 'orphan END_IF'];
    const ifdict = iss.pop();
    const if_root = Object.keys(ifdict)[0];
    ifdict[if_root].end_if = lnum;
    ifdict[if_root].else_if.sort((a, b) => a - b);
    return [PARSE_OK, ''];
  }

  function elseif_check(pgm_line, lnum, iss) {
    if (iss.length === 0) return [PARSE_ERROR, 'orphan ELSE IF'];
    const ifdict = iss[iss.length - 1];
    for (const key of Object.keys(ifdict)) {
      if (ifdict[key].else !== null) {
        return [PARSE_ERROR, 'ELSE IF must be before ELSE'];
      }
      ifdict[key].else_if.push(lnum);
    }
    return [PARSE_OK, ''];
  }

  function else_check(pgm_line, lnum, iss) {
    if (pgm_line !== KW.kw_ELSE && !pgm_line.includes(KW.kw_C_COMMENT)) {
      return [PARSE_ERROR, 'extra stuff at end'];
    }
    if (iss.length === 0) return [PARSE_ERROR, 'orphan ELSE'];
    const ifdict = iss[iss.length - 1];
    for (const key of Object.keys(ifdict)) {
      if (ifdict[key].else !== null) {
        return [PARSE_ERROR, 'unmatched ELSE'];
      }
      ifdict[key].else = lnum;
    }
    return [PARSE_OK, ''];
  }

  function new_while_check(lnum, wss, wdict) {
    wss.push(lnum);
    wdict[lnum] = null;
    return [PARSE_OK, ''];
  }

  function end_while_check(pgm_line, lnum, wss, wdict) {
    if (pgm_line !== KW.kw_END_WHILE && !pgm_line.includes(KW.kw_C_COMMENT)) {
      return [PARSE_ERROR, 'extra stuff at end'];
    }
    if (wss.length === 0) return [PARSE_ERROR, 'orphan END_WHILE'];
    const while_start_line = wss.pop();
    wdict[while_start_line] = lnum;
    return [PARSE_OK, ''];
  }

  function break_check(pgm_line, wss) {
    const split = pgm_line.split(' ').filter(x => x.length > 0);
    if (split.length !== 1 && !pgm_line.includes(KW.kw_C_COMMENT)) {
      return [PARSE_ERROR, 'extra stuff at end'];
    }
    if (wss.length === 0) return [PARSE_ERROR, 'BREAK outside WHILE'];
    return [PARSE_OK, ''];
  }

  function continue_check(pgm_line, wss) {
    const split = pgm_line.split(' ').filter(x => x.length > 0);
    if (split.length !== 1 && !pgm_line.includes(KW.kw_C_COMMENT)) {
      return [PARSE_ERROR, 'extra stuff at end'];
    }
    if (wss.length === 0) return [PARSE_ERROR, 'CONTINUE outside WHILE'];
    return [PARSE_OK, ''];
  }

  function is_within_rem_block(lnum, rbdict) {
    for (const keyStr of Object.keys(rbdict)) {
      const key = Number(keyStr);
      const end = rbdict[keyStr];
      if (end === null) {
        return lnum >= key;
      }
      if (key <= lnum && lnum <= end) {
        return true;
      }
    }
    return false;
  }

  function is_within_strlen_block(lnum, slbdict) {
    for (const keyStr of Object.keys(slbdict)) {
      const key = Number(keyStr);
      const end = slbdict[keyStr];
      if (end === null) return true;
      if (key < lnum && lnum < end) return true;
    }
    return false;
  }

  function is_within_str_block(lnum, sbdict) {
    for (const keyStr of Object.keys(sbdict)) {
      const key = Number(keyStr);
      const end = sbdict[keyStr];
      if (end === null) return true;
      if (key < lnum && lnum < end) return true;
    }
    return false;
  }

  function ensure_arg_count(pgm_line, expected_args) {
    const tokens = pgm_line.trim().split(/\s+/).filter(x => x.length > 0);
    const arg_count = tokens.length - 1;
    if (arg_count !== expected_args) {
      return [PARSE_ERROR, `Expected ${expected_args} args, got ${arg_count}`];
    }
    return [PARSE_OK, ''];
  }

  function ensure_zero_arg(pgm_line) {
    return ensure_arg_count(pgm_line, 0);
  }

  function split_string(input_string, max_length = STRING_MAX_SIZE) {
    if (input_string.length <= max_length) return [input_string];
    const out = [];
    for (let i = 0; i < input_string.length; i += max_length) {
      out.push(input_string.slice(i, i + max_length));
    }
    return out;
  }

  function split_str_cmd(kw_type, line_obj) {
    const str_content = splitOnce(line_obj.content, kw_type + ' ').slice(-1)[0];
    if (str_content.length <= STRING_MAX_SIZE) {
      return [line_obj];
    }
    const kw_list = [];
    for (const item of split_string(str_content)) {
      kw_list.push(new ds_line(`${KW.kw_STRING} ${item}`, line_obj.orig_lnum_sf1));
    }
    if (kw_type === KW.kw_STRINGLN) {
      kw_list.push(new ds_line(`${KW.kw_ENTER}`, line_obj.orig_lnum_sf1));
    }
    return kw_list;
  }

  function parse_combo(line_obj) {
    const combo_keys = line_obj.content.split(' ').filter(x => x.length > 0);
    if (combo_keys.length > MAX_COMBO) {
      return [PARSE_ERROR, `No more than ${MAX_COMBO} combos`, null];
    }
    for (const rawItem of combo_keys) {
      if (!Object.prototype.hasOwnProperty.call(ds_hid_keyname_dict, rawItem)) {
        const item = rawItem.toLowerCase();
        if (!valid_combo_chars.has(item)) {
          return [PARSE_ERROR, 'Invalid combo character', null];
        }
      }
    }
    const new_lines = [];
    for (const item of combo_keys) {
      const new_obj = line_obj.clone();
      new_obj.content = `KEYDOWN ${item}`;
      new_lines.push(new_obj);
    }
    for (let i = combo_keys.length - 1; i >= 0; i--) {
      const new_obj = line_obj.clone();
      new_obj.content = `KEYUP ${combo_keys[i]}`;
      new_lines.push(new_obj);
    }
    return [PARSE_OK, 'Success', new_lines];
  }

  function check_var_declare(pgm_line, var_dict, fss) {
    let this_var_name, rightside;
    try {
      const replaced = replace_operators(pgm_line);
      const afterVar = splitOnce(replaced, KW.kw_VAR_DECLARE).slice(-1)[0];
      const var_sides = afterVar.split('=');
      if (var_sides.length < 2) {
        return [PARSE_ERROR, 'Invalid VAR declaration'];
      }
      this_var_name = var_sides[0].trim();
      rightside = var_sides[1].trim();
    } catch (e) {
      return [PARSE_ERROR, 'Invalid VAR declaration'];
    }
    if (rightside.length === 0) {
      return [PARSE_ERROR, 'Empty VAR declaration'];
    }
    const [validVn, vnComment] = is_valid_var_name(this_var_name);
    if (!validVn) {
      return [PARSE_ERROR, vnComment];
    }
    if (Object.prototype.hasOwnProperty.call(reserved_variables_dict, this_var_name)) {
      return [PARSE_ERROR, 'Re-declaration of reserved variable'];
    }
    const parent_func_name = fss.length > 0 ? fss[fss.length - 1] : null;
    const key = parent_func_name === null ? '__GLOBAL__' : parent_func_name;
    if (!var_dict[key]) {
      var_dict[key] = new Set();
    }
    if (var_dict[key].has(this_var_name)) {
      return [PARSE_ERROR, 'Duplicate var name'];
    }
    var_dict[key].add(this_var_name);
    return [PARSE_OK, ''];
  }

  function single_pass(program_listing, define_dict) {
    const loop_numbers = new Set();
    const func_table = {};
    const if_take_table = {};
    const if_skip_table = {};
    const while_table = {};
    const func_search_stack = [];
    const if_search_stack = [];
    const while_search_stack = [];
    const rem_block_search_stack = [];
    const rem_block_table = {};
    const strlen_block_search_stack = [];
    const strlen_block_table = {};
    const str_block_search_stack = [];
    const str_block_table = {};
    const user_declared_var_dict = {};

    const return_dict = {
      is_success: false,
      comments: '',
      error_line_number_starting_from_1: null,
      error_line_str: '',
      loop_state_save_needed: false,
      loop_size: null,
    };

    for (const line_obj of program_listing) {
      const line_number_starting_from_1 = line_obj.orig_lnum_sf1;
      let this_line = line_obj.content.replace(/^[ \t]+/, '');
      if (this_line.length === 0) continue;
      let first_word = this_line.trim().split(/\s+/)[0];
      if (needs_rstrip(first_word)) {
        this_line = this_line.replace(/[ \t]+$/, '');
      }

      let this_indent_level = if_search_stack.length + func_search_stack.length + while_search_stack.length;
      let presult = PARSE_ERROR;
      let pcomment = 'single_pass: Unknown error';

      if (first_word !== KW.kw_DEFINE) {
        this_line = replace_DEFINE(this_line, define_dict);
        first_word = this_line.trim().split(/\s+/)[0];
      }

      if (first_word === KW.kw_END_REM) {
        [presult, pcomment] = rem_block_end_check(line_number_starting_from_1, rem_block_search_stack, rem_block_table);
      } else if (is_within_rem_block(line_number_starting_from_1, rem_block_table)) {
        presult = PARSE_OK;
        pcomment = '';
      } else if (first_word === KW.kw_END_STRINGLN) {
        [presult, pcomment] = stringln_block_end_check(line_number_starting_from_1, strlen_block_search_stack, strlen_block_table);
      } else if (is_within_strlen_block(line_number_starting_from_1, strlen_block_table)) {
        presult = PARSE_OK;
        pcomment = '';
      } else if (first_word === KW.kw_END_STRING) {
        [presult, pcomment] = string_block_end_check(line_number_starting_from_1, str_block_search_stack, str_block_table);
      } else if (is_within_str_block(line_number_starting_from_1, str_block_table)) {
        presult = PARSE_OK;
        pcomment = '';
      } else if (first_word === KW.kw_DEFINE) {
        [presult, pcomment] = new_define(this_line, define_dict);
      } else if (first_word === KW.kw_VAR_DECLARE) {
        [presult, pcomment] = check_var_declare(this_line, user_declared_var_dict, func_search_stack);
      } else if (first_word === KW.kw_FUN) {
        [presult, pcomment] = new_func_check(this_line, line_number_starting_from_1, func_search_stack, func_table);
      } else if (first_word === KW.kw_END_FUN) {
        this_indent_level -= 1;
        [presult, pcomment] = func_end_check(line_number_starting_from_1, func_search_stack, func_table);
      } else if (first_word === KW.kw_IF) {
        [presult, pcomment] = if_check(this_line, line_number_starting_from_1, if_search_stack);
      } else if (this_line.startsWith(KW.kw_ELSE_IF)) {
        this_indent_level -= 1;
        [presult, pcomment] = elseif_check(this_line, line_number_starting_from_1, if_search_stack);
      } else if (first_word === KW.kw_ELSE) {
        this_indent_level -= 1;
        [presult, pcomment] = else_check(this_line, line_number_starting_from_1, if_search_stack);
      } else if (first_word === KW.kw_END_IF) {
        this_indent_level -= 1;
        [presult, pcomment] = end_if_check(this_line, line_number_starting_from_1, if_search_stack, if_skip_table, if_take_table);
      } else if (first_word === KW.kw_WHILE) {
        [presult, pcomment] = new_while_check(line_number_starting_from_1, while_search_stack, while_table);
      } else if (first_word === KW.kw_END_WHILE) {
        this_indent_level -= 1;
        [presult, pcomment] = end_while_check(this_line, line_number_starting_from_1, while_search_stack, while_table);
      } else if (first_word === KW.kw_LOOP_BREAK) {
        [presult, pcomment] = break_check(this_line, while_search_stack);
      } else if (first_word === KW.kw_CONTINUE) {
        [presult, pcomment] = continue_check(this_line, while_search_stack);
      } else if (first_word === KW.kw_REM_BLOCK) {
        [presult, pcomment] = new_rem_block_check(line_number_starting_from_1, rem_block_search_stack, rem_block_table);
      } else if (first_word === KW.kw_STRINGLN_BLOCK) {
        [presult, pcomment] = new_stringln_block_check(line_number_starting_from_1, strlen_block_search_stack, strlen_block_table);
      } else if (first_word === KW.kw_STRING_BLOCK) {
        [presult, pcomment] = new_string_block_check(line_number_starting_from_1, str_block_search_stack, str_block_table);
      } else if (first_word === KW.kw_RETURN) {
        if (func_search_stack.length === 0) {
          presult = PARSE_ERROR;
          pcomment = 'RETURN outside function';
        } else {
          presult = PARSE_OK;
          pcomment = '';
        }
      } else if (first_word === KW.kw_SWCC || first_word === KW.kw_SWCF || first_word === KW.kw_SWCR) {
        presult = PARSE_OK;
        pcomment = '';
      } else if (
        first_word === KW.kw_OLED_UPDATE ||
        first_word === KW.kw_OLED_CLEAR ||
        first_word === KW.kw_OLED_RESTORE ||
        first_word === KW.kw_BCLR ||
        first_word === KW.kw_NEXT_PROFILE ||
        first_word === KW.kw_PREV_PROFILE ||
        first_word === KW.kw_DP_SLEEP
      ) {
        [presult, pcomment] = ensure_zero_arg(this_line);
      } else if (first_word === KW.kw_KEYDOWN || first_word === KW.kw_KEYUP) {
        [presult, pcomment] = ensure_arg_count(this_line, 1);
      } else if (this_line.startsWith(KW.kw_SWCOLOR)) {
        presult = PARSE_OK;
        pcomment = '';
      } else if (this_line.startsWith(KW.kw_LOOP)) {
        let value;
        [presult, pcomment, value] = check_loop(this_line);
        if (value !== null) {
          return_dict.loop_state_save_needed = true;
          loop_numbers.add(value);
        }
      } else {
        presult = PARSE_OK;
        pcomment = '';
      }

      if (this_indent_level < 0) {
        presult = PARSE_ERROR;
        pcomment = 'Invalid indent level';
      }

      line_obj.indent_level = this_indent_level;

      if (presult === PARSE_ERROR) {
        return_dict.is_success = false;
        return_dict.comments = pcomment;
        return_dict.error_line_number_starting_from_1 = line_number_starting_from_1;
        return_dict.error_line_str = this_line;
        return return_dict;
      }
    }

    if (if_search_stack.length !== 0) {
      return_dict.is_success = false;
      return_dict.comments = 'Missing END_IF';
      return_dict.error_line_number_starting_from_1 = Number(Object.keys(if_search_stack[0])[0]);
      return return_dict;
    }

    if (func_search_stack.length !== 0) {
      return_dict.is_success = false;
      return_dict.comments = 'Missing END_FUN';
      return_dict.error_line_number_starting_from_1 = func_table[func_search_stack[0]].fun_start;
      return return_dict;
    }

    if (while_search_stack.length !== 0) {
      return_dict.is_success = false;
      return_dict.comments = 'Missing END_WHILE';
      return_dict.error_line_number_starting_from_1 = while_search_stack[while_search_stack.length - 1];
      return return_dict;
    }

    for (const key of Object.keys(rem_block_table)) {
      if (rem_block_table[key] === null) {
        return_dict.is_success = false;
        return_dict.comments = 'Missing END_REM';
        return_dict.error_line_number_starting_from_1 = Number(key);
        return_dict.error_line_str = '';
        return return_dict;
      }
    }

    for (const key of Object.keys(strlen_block_table)) {
      if (strlen_block_table[key] === null) {
        return_dict.is_success = false;
        return_dict.comments = 'Missing END_STRINGLN';
        return_dict.error_line_number_starting_from_1 = Number(key);
        return_dict.error_line_str = '';
        return return_dict;
      }
    }

    for (const key of Object.keys(str_block_table)) {
      if (str_block_table[key] === null) {
        return_dict.is_success = false;
        return_dict.comments = 'Missing END_STRING';
        return_dict.error_line_number_starting_from_1 = Number(key);
        return_dict.error_line_str = '';
        return return_dict;
      }
    }

    return_dict.is_success = true;
    return_dict.comments = '';
    return_dict.error_line_number_starting_from_1 = null;
    return_dict.error_line_str = '';
    return_dict.rem_block_table = rem_block_table;
    return_dict.strlen_block_table = strlen_block_table;
    return_dict.str_block_table = str_block_table;
    return_dict.dspp_listing_with_indent_level = program_listing;
    return_dict.user_declared_var_dict = user_declared_var_dict;

    if (loop_numbers.size > 0) {
      return_dict.loop_size = Math.max(...loop_numbers);
    }

    return return_dict;
  }

  function get_default_def_dict() {
    return {
      [KW.kw_RANDOM_LOWERCASE_LETTER]: `${KW.kw_RANDCHR}(0x101)`,
      [KW.kw_RANDOM_UPPERCASE_LETTER]: `${KW.kw_RANDCHR}(0x102)`,
      [KW.kw_RANDOM_LETTER]: `${KW.kw_RANDCHR}(0x103)`,
      [KW.kw_RANDOM_NUMBER]: `${KW.kw_RANDCHR}(0x104)`,
      [KW.kw_RANDOM_SPECIAL]: `${KW.kw_RANDCHR}(0x108)`,
      [KW.kw_RANDOM_CHAR]: `${KW.kw_RANDCHR}(0x10f)`,
      [KW.kw_DEFAULTDELAY]: '_DEFAULTDELAY=',
      [KW.kw_DEFAULTCHARDELAY]: '_DEFAULTCHARDELAY=',
      [KW.kw_CHARJITTER]: '_CHARJITTER=',
      [KW.kw_MOUSE_WHEEL]: `${KW.kw_MOUSE_SCROLL} 0`,
      [`${KW.kw_FUNCTION} `]: `${KW.kw_FUN} `,
      [KW.kw_END_FUNCTION]: KW.kw_END_FUN,
      [KW.kw_TRUE]: '1',
      [KW.kw_FALSE]: '0',
      [KW.kw_OLED_PRINT]: KW.kw_OLED_LPRINT,
      [rv_IS_NUMLOCK_ON]: `((${rv_KBLED_BITFIELD}&0x1)!=0)`,
      [rv_IS_CAPSLOCK_ON]: `((${rv_KBLED_BITFIELD}&0x2)!=0)`,
      [rv_IS_SCROLLLOCK_ON]: `((${rv_KBLED_BITFIELD}&0x4)!=0)`,
      [KW.kw_PASS]: 'pass',
      [KW.kw_STR_PRINT_FORMAT]: DUMMY_VAR_NAME,
      [KW.kw_STR_PRINT_PADDING]: DUMMY_VAR_NAME,
      [KW.kw_SWCOLOR]: `${KW.kw_SWCC} 0`,
    };
  }

  const import_result = {
    NOT_IMPORT_COMMAND: 0,
    ALREADY_IMPORTED: 1,
    NEW_IMPORT: 2,
  };

  function preprocessor_run_all(program_listing, import_name_to_line_obj_dict = null) {
    const all_def_dict = get_default_def_dict();
    const already_imported_header_set = new Set();

    function get_import_lineobjs(first_word) {
      if (!import_name_to_line_obj_dict) {
        return [import_result.NOT_IMPORT_COMMAND, []];
      }
      const new_lineobj_list = [];
      if (Object.prototype.hasOwnProperty.call(import_name_to_line_obj_dict, first_word)) {
        if (already_imported_header_set.has(first_word)) {
          return [import_result.ALREADY_IMPORTED, []];
        }
        for (const item of import_name_to_line_obj_dict[first_word]) {
          new_lineobj_list.push(item.clone());
        }
        already_imported_header_set.add(first_word);
      }
      return [import_result.NEW_IMPORT, new_lineobj_list];
    }

    let rdict = single_pass(program_listing, all_def_dict);
    if (!rdict.is_success) return rdict;

    let new_program_listing = [];
    for (const line_obj of program_listing) {
      const lnum = line_obj.orig_lnum_sf1;
      if (is_within_strlen_block(lnum, rdict.strlen_block_table)) {
        line_obj.content = `${KW.kw_STRINGLN} ${line_obj.content}`;
      } else if (is_within_str_block(lnum, rdict.str_block_table)) {
        line_obj.content = `${KW.kw_STRING} ${line_obj.content}`;
      } else if (is_within_rem_block(lnum, rdict.rem_block_table)) {
        line_obj.content = `${KW.kw_C_COMMENT} ${line_obj.content}`;
      } else {
        line_obj.content = line_obj.content.replace(/^[ \t]+/, '');
      }

      if (line_obj.content.length === 0) continue;

      const first_word = line_obj.content.split(' ')[0];
      const [imp_res, imported_lineobj_list] = get_import_lineobjs(first_word);
      if (imp_res === import_result.ALREADY_IMPORTED) continue;
      if (imp_res === import_result.NEW_IMPORT && imported_lineobj_list.length > 0) {
        new_program_listing.push(...imported_lineobj_list);
        continue;
      }

      if (
        first_word === KW.kw_STRINGLN_BLOCK ||
        first_word === KW.kw_END_STRINGLN ||
        first_word === KW.kw_STRING_BLOCK ||
        first_word === KW.kw_END_STRING
      ) {
        continue;
      }

      if (first_word === KW.kw_STRINGLN || first_word === KW.kw_STRING) {
        for (const item of split_str_cmd(first_word, line_obj)) {
          new_program_listing.push(item);
        }
      } else {
        new_program_listing.push(line_obj);
      }
    }

    program_listing = new_program_listing;
    new_program_listing = [];

    for (const line_obj of program_listing) {
      line_obj.content = line_obj.content.replace(/^[ \t]+/, '');
      const first_word = line_obj.content.split(' ')[0];
      if (first_word === KW.kw_REM || first_word.startsWith(KW.kw_C_COMMENT)) {
        continue;
      }
      if (first_word === KW.kw_INJECT_MOD) {
        line_obj.content = line_obj.content.replace(KW.kw_INJECT_MOD, '');
      }
      if (!Object.prototype.hasOwnProperty.call(ds_func_to_parse_as_str, first_word)) {
        const cpos = line_obj.content.indexOf(KW.kw_C_COMMENT);
        if (cpos !== -1) {
          line_obj.content = line_obj.content.slice(0, cpos).replace(/[ \t]+$/, '');
        }
        line_obj.content = replace_operators(line_obj.content);
      }
      if (first_word === KW.kw_PREV_PROFILE) {
        line_obj.content = `${KW.kw_SKIP_PROFILE} -1`;
      }
      if (first_word === KW.kw_NEXT_PROFILE) {
        line_obj.content = `${KW.kw_SKIP_PROFILE} 1`;
      }
      if (line_obj.content.trim() === KW.kw_GOTO_PROFILE) {
        rdict.is_success = false;
        rdict.comments = 'Missing profile name';
        rdict.error_line_number_starting_from_1 = line_obj.orig_lnum_sf1;
        rdict.error_line_str = line_obj.content;
        return rdict;
      }
      line_obj.content = line_obj.content.replace(/^[ \t]+/, '');
      new_program_listing.push(line_obj);
    }

    program_listing = new_program_listing;
    rdict = single_pass(program_listing, all_def_dict);
    if (!rdict.is_success) return rdict;

    let second_pass_program_listing = [];
    let needs_end_if = false;

    let epilogue = 0;
    if (rdict.loop_state_save_needed) {
      epilogue |= 0x1;
    }
    if (epilogue !== 0) {
      second_pass_program_listing.push(new ds_line(`_EPILOGUE_ACTIONS = ${epilogue}`));
    }
    if (rdict.loop_size !== null) {
      second_pass_program_listing.push(new ds_line(`_LOOP_SIZE = ${rdict.loop_size + 1}`));
    }

    let last_lnum_sf1 = 0;
    for (const line_obj of program_listing) {
      const line_number_starting_from_1 = line_obj.orig_lnum_sf1;
      last_lnum_sf1 = line_number_starting_from_1;
      let this_line = line_obj.content.replace(/^[ \t]+/, '');
      rdict.error_line_number_starting_from_1 = line_number_starting_from_1;
      rdict.error_line_str = this_line;
      if (this_line.length === 0) continue;
      const first_word = this_line.split(' ')[0];
      if (needs_rstrip(first_word)) {
        line_obj.content = this_line.replace(/[ \t]+$/, '');
      }
      if (first_word !== KW.kw_DEFINE) {
        line_obj.content = replace_DEFINE(line_obj.content, all_def_dict);
      } else {
        continue;
      }
      this_line = line_obj.content.replace(/^[ \t]+/, '');

      if (first_word === KW.kw_REPEAT) {
        if (second_pass_program_listing.length === 0) {
          rdict.is_success = false;
          rdict.comments = 'Nothing before REPEAT';
          return rdict;
        }
        const countStr = this_line.slice(KW.kw_REPEAT.length).trim();
        const repeat_count = Number(countStr);
        if (!/^[+-]?\d+$/.test(countStr) || !Number.isInteger(repeat_count) || repeat_count > REPEAT_MAX_SIZE || repeat_count < 0) {
          rdict.is_success = false;
          rdict.comments = 'Invalid REPEAT count';
          return rdict;
        }
        const last_line = second_pass_program_listing[second_pass_program_listing.length - 1];
        for (let x = 0; x < repeat_count; x++) {
          second_pass_program_listing.push(last_line.clone());
        }
      } else if (this_line.startsWith(KW.kw_LOOP)) {
        const [, , value] = check_loop(this_line);
        if (needs_end_if) {
          second_pass_program_listing.push(new ds_line(KW.kw_END_IF, line_number_starting_from_1));
        }
        const loop_str = `${KW.kw_IF} _KEYPRESS_COUNT % _LOOP_SIZE == ${value}`;
        second_pass_program_listing.push(new ds_line(loop_str, line_number_starting_from_1));
        needs_end_if = true;
      } else {
        second_pass_program_listing.push(line_obj);
      }
    }

    if (needs_end_if) {
      second_pass_program_listing.push(new ds_line(KW.kw_END_IF, last_lnum_sf1));
    }

    new_program_listing = [];
    for (const line_obj of second_pass_program_listing) {
      const first_word = line_obj.content.split(' ')[0];
      if (Object.prototype.hasOwnProperty.call(ds_hid_keyname_dict, first_word)) {
        const [parse_result, comments, new_lines] = parse_combo(line_obj);
        if (parse_result === PARSE_ERROR) {
          rdict.is_success = false;
          rdict.comments = comments;
          rdict.error_line_number_starting_from_1 = line_obj.orig_lnum_sf1;
          rdict.error_line_str = line_obj.content;
          return rdict;
        }
        new_program_listing.push(...new_lines);
        continue;
      }
      line_obj.content = line_obj.content.replace(/^[ \t]+/, '');
      new_program_listing.push(line_obj);
    }

    second_pass_program_listing = new_program_listing;
    rdict = single_pass(second_pass_program_listing, all_def_dict);
    rdict.define_dict = all_def_dict;
    return rdict;
  }

  function preprocess_import_str_dict(import_str_dict) {
    if (!import_str_dict) return null;
    const preprocessed_import_lineobj_dict = {};
    const defaultDefs = get_default_def_dict();
    for (const key of Object.keys(import_str_dict)) {
      const lineobj_list = make_list_of_ds_line_obj_from_str_listing(import_str_dict[key], key);
      const rdict = preprocessor_run_all(lineobj_list.map(x => x.clone()));
      const user_define_dict = {};
      if (rdict.define_dict) {
        for (const [k, v] of Object.entries(rdict.define_dict)) {
          if (!Object.prototype.hasOwnProperty.call(defaultDefs, k)) {
            user_define_dict[k] = v;
          }
        }
      }
      for (const defkey of Object.keys(user_define_dict)) {
        const user_def_lineobj = new ds_line(`DEFINE ${defkey} ${user_define_dict[defkey]}`, 1);
        lineobj_list.unshift(user_def_lineobj.clone());
        if (rdict.dspp_listing_with_indent_level) {
          rdict.dspp_listing_with_indent_level.unshift(user_def_lineobj.clone());
        }
      }
      if (!rdict.is_success) {
        preprocessed_import_lineobj_dict[key] = lineobj_list;
      } else {
        preprocessed_import_lineobj_dict[key] = rdict.dspp_listing_with_indent_level;
      }
    }
    return preprocessed_import_lineobj_dict;
  }

  // ---------------- PYTHON-LIKE EXPRESSION & AST PARSER ----------------

  function pyReprString(str) {
    return JSON.stringify(str);
  }

  function make_str_func(first_word, this_line) {
    const str_content = this_line.slice(first_word.length + 1);
    return `${first_word}(${pyReprString(str_content)})`;
  }

  function make_arg_func(first_word, this_line) {
    const rest = this_line.slice(first_word.length + 1).trim();
    const args = rest.length === 0 ? [''] : rest.split(' ');
    let final_str = first_word + '(';
    for (const item of args) {
      final_str += `${item}, `;
    }
    final_str = final_str.replace(/[, ]+$/, '') + ')';
    return final_str;
  }

  // Tokenizer for Python subset used by ds2py
  function tokenizePyLine(text, lineno) {
    const tokens = [];
    let i = 0;
    const len = text.length;
    while (i < len) {
      const ch = text[i];
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        i++;
        continue;
      }
      if (ch === '#') {
        break;
      }
      // String literal
      if (ch === '"' || ch === "'") {
        const quote = ch;
        let str = '';
        i++;
        let closed = false;
        while (i < len) {
          const c = text[i];
          if (c === '\\') {
            i++;
            if (i >= len) break;
            const esc = text[i];
            if (esc === 'n') str += '\n';
            else if (esc === 'r') str += '\r';
            else if (esc === 't') str += '\t';
            else if (esc === '\\') str += '\\';
            else if (esc === "'") str += "'";
            else if (esc === '"') str += '"';
            else if (esc === 'x' && i + 2 < len && /^[0-9a-fA-F]{2}$/.test(text.slice(i + 1, i + 3))) {
              str += String.fromCharCode(parseInt(text.slice(i + 1, i + 3), 16));
              i += 2;
            } else if (esc === 'u' && i + 4 < len && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) {
              str += String.fromCharCode(parseInt(text.slice(i + 1, i + 5), 16));
              i += 4;
            } else {
              str += '\\' + esc;
            }
            i++;
          } else if (c === quote) {
            closed = true;
            i++;
            break;
          } else {
            str += c;
            i++;
          }
        }
        if (!closed) {
          const err = new SyntaxError('unterminated string literal');
          err.lineno = lineno;
          err.text = text;
          throw err;
        }
        tokens.push({ type: 'STRING', value: str });
        continue;
      }

      // Numbers
      if (/\d/.test(ch)) {
        let start = i;
        if (ch === '0' && i + 1 < len && /[xXbBoO]/.test(text[i + 1])) {
          const baseChar = text[i + 1].toLowerCase();
          i += 2;
          const validRe = baseChar === 'x' ? /[0-9a-fA-F_]/ : baseChar === 'b' ? /[01_]/ : /[0-7_]/;
          const digitsStart = i;
          while (i < len && validRe.test(text[i])) i++;
          if (i === digitsStart || (i < len && /[a-zA-Z0-9_]/.test(text[i]))) {
            const err = new SyntaxError('invalid decimal literal');
            err.lineno = lineno;
            err.text = text;
            throw err;
          }
          const rawDigits = text.slice(digitsStart, i).replace(/_/g, '');
          const radix = baseChar === 'x' ? 16 : baseChar === 'b' ? 2 : 8;
          tokens.push({ type: 'NUMBER', value: parseInt(rawDigits, radix) });
          continue;
        } else {
          while (i < len && /[\d_]/.test(text[i])) i++;
          if (i < len && text[i] === '.') {
            const err = new SyntaxError('Unsupported Constant');
            err.lineno = lineno;
            err.text = text;
            throw err;
          }
          if (i < len && /[a-zA-Z]/.test(text[i])) {
            const err = new SyntaxError('invalid decimal literal');
            err.lineno = lineno;
            err.text = text;
            throw err;
          }
          const rawDigits = text.slice(start, i).replace(/_/g, '');
          tokens.push({ type: 'NUMBER', value: parseInt(rawDigits, 10) });
          continue;
        }
      }

      // Identifiers / keywords
      if (/[a-zA-Z_]/.test(ch)) {
        let start = i;
        while (i < len && /[a-zA-Z0-9_]/.test(text[i])) i++;
        const word = text.slice(start, i);
        tokens.push({ type: 'NAME', value: word });
        continue;
      }

      // Multi-char operators
      const three = text.slice(i, i + 3);
      if (three === '**=' || three === '//=' || three === '<<=' || three === '>>=') {
        tokens.push({ type: 'OP', value: three });
        i += 3;
        continue;
      }
      const two = text.slice(i, i + 2);
      if (
        two === '**' || two === '//' || two === '<<' || two === '>>' ||
        two === '==' || two === '!=' || two === '<=' || two === '>=' ||
        two === '+=' || two === '-=' || two === '*=' || two === '/=' ||
        two === '%=' || two === '&=' || two === '|=' || two === '^='
      ) {
        tokens.push({ type: 'OP', value: two });
        i += 2;
        continue;
      }
      if ('+-*/%&|^~<>()=,:' .includes(ch)) {
        tokens.push({ type: 'OP', value: ch });
        i++;
        continue;
      }

      const err = new SyntaxError('invalid syntax');
      err.lineno = lineno;
      err.text = text;
      throw err;
    }
    return tokens;
  }

  // Expression parser producing Python-compatible AST nodes
  function parseExprTokens(tokens, startIdx, lineno, rawText) {
    let pos = startIdx;

    function syntaxErr(msg = 'invalid syntax') {
      const err = new SyntaxError(msg);
      err.lineno = lineno;
      err.text = rawText;
      throw err;
    }

    function peek() {
      return pos < tokens.length ? tokens[pos] : null;
    }

    function consume() {
      return tokens[pos++];
    }

    function expectOp(val) {
      const t = peek();
      if (!t || t.type !== 'OP' || t.value !== val) syntaxErr();
      pos++;
    }

    // or_test: and_test ('or' and_test)*
    function parseOr() {
      const values = [parseAnd()];
      while (peek() && peek().type === 'NAME' && peek().value === 'or') {
        consume();
        values.push(parseAnd());
      }
      if (values.length === 1) return values[0];
      return { _type: 'BoolOp', op: 'Or', values, lineno };
    }

    // and_test: not_test ('and' not_test)*
    function parseAnd() {
      const values = [parseNot()];
      while (peek() && peek().type === 'NAME' && peek().value === 'and') {
        consume();
        values.push(parseNot());
      }
      if (values.length === 1) return values[0];
      return { _type: 'BoolOp', op: 'And', values, lineno };
    }

    // not_test: 'not' not_test | comparison
    function parseNot() {
      if (peek() && peek().type === 'NAME' && peek().value === 'not') {
        consume();
        return { _type: 'UnaryOp', op: 'Not', operand: parseNot(), lineno };
      }
      return parseComparison();
    }

    const CMP_MAP = {
      '==': 'Eq',
      '!=': 'NotEq',
      '<': 'Lt',
      '<=': 'LtE',
      '>': 'Gt',
      '>=': 'GtE',
    };

    function parseComparison() {
      const left = parseBitOr();
      const ops = [];
      const comparators = [];
      while (peek() && peek().type === 'OP' && Object.prototype.hasOwnProperty.call(CMP_MAP, peek().value)) {
        const opTok = consume();
        ops.push(CMP_MAP[opTok.value]);
        comparators.push(parseBitOr());
      }
      if (ops.length === 0) return left;
      return { _type: 'Compare', left, ops, comparators, lineno };
    }

    function parseBitOr() {
      let node = parseBitXor();
      while (peek() && peek().type === 'OP' && peek().value === '|') {
        consume();
        node = { _type: 'BinOp', left: node, op: 'BitOr', right: parseBitXor(), lineno };
      }
      return node;
    }

    function parseBitXor() {
      let node = parseBitAnd();
      while (peek() && peek().type === 'OP' && peek().value === '^') {
        consume();
        node = { _type: 'BinOp', left: node, op: 'BitXor', right: parseBitAnd(), lineno };
      }
      return node;
    }

    function parseBitAnd() {
      let node = parseShift();
      while (peek() && peek().type === 'OP' && peek().value === '&') {
        consume();
        node = { _type: 'BinOp', left: node, op: 'BitAnd', right: parseShift(), lineno };
      }
      return node;
    }

    function parseShift() {
      let node = parseArith();
      while (peek() && peek().type === 'OP' && (peek().value === '<<' || peek().value === '>>')) {
        const opTok = consume();
        const opName = opTok.value === '<<' ? 'LShift' : 'RShift';
        node = { _type: 'BinOp', left: node, op: opName, right: parseArith(), lineno };
      }
      return node;
    }

    function parseArith() {
      let node = parseTerm();
      while (peek() && peek().type === 'OP' && (peek().value === '+' || peek().value === '-')) {
        const opTok = consume();
        const opName = opTok.value === '+' ? 'Add' : 'Sub';
        node = { _type: 'BinOp', left: node, op: opName, right: parseTerm(), lineno };
      }
      return node;
    }

    function parseTerm() {
      let node = parseFactor();
      while (peek() && peek().type === 'OP' && (peek().value === '*' || peek().value === '/' || peek().value === '//' || peek().value === '%')) {
        const opTok = consume();
        const opName = opTok.value === '*' ? 'Mult' : opTok.value === '%' ? 'Mod' : opTok.value === '//' ? 'FloorDiv' : 'Div';
        node = { _type: 'BinOp', left: node, op: opName, right: parseFactor(), lineno };
      }
      return node;
    }

    function parseFactor() {
      if (peek() && peek().type === 'OP' && (peek().value === '+' || peek().value === '-' || peek().value === '~')) {
        const opTok = consume();
        const opName = opTok.value === '-' ? 'USub' : opTok.value === '~' ? 'Invert' : 'UAdd';
        return { _type: 'UnaryOp', op: opName, operand: parseFactor(), lineno };
      }
      return parsePower();
    }

    function parsePower() {
      const left = parseAtom();
      if (peek() && peek().type === 'OP' && peek().value === '**') {
        consume();
        return { _type: 'BinOp', left, op: 'Pow', right: parseFactor(), lineno };
      }
      return left;
    }

    function parseAtom() {
      const t = peek();
      if (!t) syntaxErr();

      if (t.type === 'NUMBER') {
        consume();
        return { _type: 'Constant', value: t.value, valueType: 'int', lineno };
      }
      if (t.type === 'STRING') {
        consume();
        return { _type: 'Constant', value: t.value, valueType: 'str', lineno };
      }
      if (t.type === 'OP' && t.value === '(') {
        consume();
        if (peek() && peek().type === 'OP' && peek().value === ')') {
          syntaxErr();
        }
        const expr = parseOr();
        expectOp(')');
        return expr;
      }
      if (t.type === 'NAME') {
        if (PYTHON_KEYWORDS.has(t.value)) {
          if (t.value === 'True') {
            consume();
            return { _type: 'Constant', value: 1, valueType: 'int', lineno };
          }
          if (t.value === 'False') {
            consume();
            return { _type: 'Constant', value: 0, valueType: 'int', lineno };
          }
          syntaxErr();
        }
        consume();
        // Check function call
        if (peek() && peek().type === 'OP' && peek().value === '(') {
          consume();
          const args = [];
          const keywords = [];
          while (peek() && !(peek().type === 'OP' && peek().value === ')')) {
            // Check keyword argument name=val
            if (peek().type === 'NAME' && pos + 1 < tokens.length && tokens[pos + 1].type === 'OP' && tokens[pos + 1].value === '=') {
              const kwName = consume().value;
              consume(); // '='
              const kwVal = parseOr();
              keywords.push({ arg: kwName, value: kwVal });
            } else {
              if (keywords.length > 0) syntaxErr('positional argument follows keyword argument');
              args.push(parseOr());
            }
            if (peek() && peek().type === 'OP' && peek().value === ',') {
              consume();
            } else {
              break;
            }
          }
          expectOp(')');
          return {
            _type: 'Call',
            func: { _type: 'Name', id: t.value, ctx: 'Load', lineno },
            args,
            keywords,
            lineno,
          };
        }
        return { _type: 'Name', id: t.value, ctx: 'Load', lineno };
      }
      syntaxErr();
    }

    const expr = parseOr();
    return { expr, nextPos: pos };
  }

  const AUG_ASSIGN_MAP = {
    '+=': 'Add',
    '-=': 'Sub',
    '*=': 'Mult',
    '/=': 'Div',
    '//=': 'FloorDiv',
    '%=': 'Mod',
    '**=': 'Pow',
    '<<=': 'LShift',
    '>>=': 'RShift',
    '|=': 'BitOr',
    '^=': 'BitXor',
    '&=': 'BitAnd',
  };

  function parseSingleLineStmt(content, lineno) {
    const tokens = tokenizePyLine(content, lineno);
    if (tokens.length === 0) return null;

    function syntaxErr(msg = 'invalid syntax') {
      const err = new SyntaxError(msg);
      err.lineno = lineno;
      err.text = content;
      throw err;
    }

    const first = tokens[0];
    if (first.type === 'NAME') {
      if (first.value === 'pass') {
        if (tokens.length !== 1) syntaxErr();
        return { _type: 'Pass', lineno };
      }
      if (first.value === 'break') {
        if (tokens.length !== 1) syntaxErr();
        return { _type: 'Break', lineno };
      }
      if (first.value === 'continue') {
        if (tokens.length !== 1) syntaxErr();
        return { _type: 'Continue', lineno };
      }
      if (first.value === 'return') {
        if (tokens.length === 1) {
          return { _type: 'Return', value: null, lineno };
        }
        const { expr, nextPos } = parseExprTokens(tokens, 1, lineno, content);
        if (nextPos !== tokens.length) syntaxErr();
        return { _type: 'Return', value: expr, lineno };
      }
      if (first.value === 'if' || first.value === 'elif' || first.value === 'while' || first.value === 'else' || first.value === 'def') {
        // Handled in block parser
        return { _type: 'BlockHeader', keyword: first.value, tokens, lineno, rawText: content };
      }
    }

    // Check assignment or augmented assignment
    if (tokens.length >= 2 && tokens[0].type === 'NAME' && !PYTHON_KEYWORDS.has(tokens[0].value) && tokens[1].type === 'OP') {
      const opVal = tokens[1].value;
      if (opVal === '=') {
        // Could be chained assignment a = b = 1 -> Python AST Assign with targets.length > 1
        const targets = [];
        let idx = 0;
        while (idx + 1 < tokens.length && tokens[idx].type === 'NAME' && !PYTHON_KEYWORDS.has(tokens[idx].value) && tokens[idx + 1].type === 'OP' && tokens[idx + 1].value === '=') {
          targets.push({ _type: 'Name', id: tokens[idx].value, ctx: 'Store', lineno });
          idx += 2;
        }
        const { expr, nextPos } = parseExprTokens(tokens, idx, lineno, content);
        if (nextPos !== tokens.length) syntaxErr();
        return { _type: 'Assign', targets, value: expr, lineno };
      }
      if (Object.prototype.hasOwnProperty.call(AUG_ASSIGN_MAP, opVal)) {
        const target = { _type: 'Name', id: tokens[0].value, ctx: 'Store', lineno };
        const { expr, nextPos } = parseExprTokens(tokens, 2, lineno, content);
        if (nextPos !== tokens.length) syntaxErr();
        return { _type: 'AugAssign', target, op: AUG_ASSIGN_MAP[opVal], value: expr, lineno };
      }
    }

    // Otherwise, expression statement
    const { expr, nextPos } = parseExprTokens(tokens, 0, lineno, content);
    if (nextPos !== tokens.length) syntaxErr();
    return { _type: 'Expr', value: expr, lineno };
  }

  function line_has_unconsumed_stack_value(line_obj) {
    try {
      const stmt = parseSingleLineStmt(line_obj.content, line_obj.py_lnum_sf1 || 1);
      return Boolean(stmt && stmt._type === 'Expr');
    } catch (e) {
      return false;
    }
  }

  function ensure_valid_python_blocks(lines) {
    const fixed_lines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      fixed_lines.push(line);
      const clean_content = line.content.replace(/\s+$/, '');
      if (clean_content.endsWith(':')) {
        const current_indent = line.indent_level;
        let next_indent = -1;
        if (i + 1 < lines.length) {
          next_indent = lines[i + 1].indent_level;
        }
        if (next_indent <= current_indent) {
          const pass_line = new ds_line('pass', line.orig_lnum_sf1, current_indent + 1, line.source_fn);
          pass_line.py_lnum_sf1 = line.py_lnum_sf1;
          fixed_lines.push(pass_line);
        }
      }
    }
    return fixed_lines;
  }

  function ds2py_run_all(program_listing) {
    let new_listing = [];
    for (const line_obj of program_listing) {
      line_obj.content = line_obj.content.replace(/^[ \t]+/, '');
      if (line_obj.content.length === 0) continue;
      const first_word = line_obj.content.trim().split(/\s+/)[0];

      if (first_word === KW.kw_VAR_DECLARE) {
        line_obj.content = line_obj.content.slice(KW.kw_VAR_DECLARE.length).trim();
      }
      if (!Object.prototype.hasOwnProperty.call(ds_func_to_parse_as_str, first_word)) {
        line_obj.content = replace_operators(line_obj.content);
      }

      const this_line = line_obj.content;

      if (first_word === KW.kw_OLED_LPRINT) {
        const new_obj = line_obj.clone();
        const str_content = this_line.slice(first_word.length + 1);
        new_obj.content = `${KW.kw_OLED_OPTPRINT}(0, ${pyReprString(str_content)})`;
        new_listing.push(new_obj);
      } else if (first_word === KW.kw_OLED_CPRINT) {
        const new_obj = line_obj.clone();
        const str_content = this_line.slice(first_word.length + 1);
        new_obj.content = `${KW.kw_OLED_OPTPRINT}(1, ${pyReprString(str_content)})`;
        new_listing.push(new_obj);
      } else if (Object.prototype.hasOwnProperty.call(ds_func_to_parse_as_str, first_word)) {
        const new_obj = line_obj.clone();
        new_obj.content = make_str_func(first_word, this_line);
        new_listing.push(new_obj);
      } else if (Object.prototype.hasOwnProperty.call(ds_builtin_func_lookup, first_word)) {
        const new_obj = line_obj.clone();
        new_obj.content = make_arg_func(first_word, this_line);
        new_listing.push(new_obj);
      } else if (first_word === KW.kw_IF) {
        const new_obj = line_obj.clone();
        let cond = this_line.slice(KW.kw_IF.length).trim();
        if (cond.endsWith(KW.kw_THEN)) cond = cond.slice(0, -KW.kw_THEN.length);
        new_obj.content = `if ${cond}:`;
        new_listing.push(new_obj);
      } else if (this_line.startsWith(`${KW.kw_ELSE_IF} `)) {
        const new_obj = line_obj.clone();
        let cond = this_line.slice(KW.kw_ELSE_IF.length).trim();
        if (cond.endsWith(KW.kw_THEN)) cond = cond.slice(0, -KW.kw_THEN.length);
        new_obj.content = `elif ${cond}:`;
        new_listing.push(new_obj);
      } else if (first_word === KW.kw_ELSE) {
        const new_obj = line_obj.clone();
        new_obj.content = 'else:';
        new_listing.push(new_obj);
      } else if (first_word === KW.kw_CONTINUE) {
        const new_obj = line_obj.clone();
        new_obj.content = 'continue';
        new_listing.push(new_obj);
      } else if (first_word === KW.kw_LOOP_BREAK) {
        const new_obj = line_obj.clone();
        new_obj.content = 'break';
        new_listing.push(new_obj);
      } else if (first_word === KW.kw_RETURN) {
        const return_expr = this_line.slice(KW.kw_RETURN.length).trim();
        const new_obj = line_obj.clone();
        new_obj.content = `return ${return_expr}`;
        new_listing.push(new_obj);
      } else if (ds2py_ignored_cmds.has(first_word)) {
        continue;
      } else if (first_word === KW.kw_WHILE) {
        const new_obj = line_obj.clone();
        new_obj.content = `while ${this_line.slice(KW.kw_WHILE.length).trim()}:`;
        new_listing.push(new_obj);
      } else if (first_word === KW.kw_FUN) {
        const new_obj = line_obj.clone();
        new_obj.content = `def ${this_line.slice(KW.kw_FUN.length).trim()}:`;
        new_listing.push(new_obj);
      } else {
        new_listing.push(line_obj);
      }
    }

    for (let index = 0; index < new_listing.length; index++) {
      const line_obj = new_listing[index];
      line_obj.py_lnum_sf1 = index + 1;
      if (line_has_unconsumed_stack_value(line_obj)) {
        line_obj.content = `${DUMMY_VAR_NAME} = ` + line_obj.content;
      }
    }

    new_listing = ensure_valid_python_blocks(new_listing);
    return new_listing;
  }

  // Parse indented Python listing into Module AST
  function parsePythonAST(pyout) {
    // Re-number lines sequentially 1..N just like dsline_to_source + ast.parse
    const lines = pyout.map((item, idx) => ({
      indent: item.indent_level,
      content: item.content,
      lineno: idx + 1,
      dsLine: item,
    }));

    let pos = 0;

    function syntaxErr(lineObj, msg = 'invalid syntax') {
      const err = new SyntaxError(msg);
      err.lineno = lineObj ? lineObj.lineno : 1;
      err.text = lineObj ? lineObj.content : '';
      throw err;
    }

    function parseBlock(expectedIndent) {
      const body = [];
      while (pos < lines.length) {
        const cur = lines[pos];
        if (cur.indent < expectedIndent) {
          break;
        }
        if (cur.indent > expectedIndent) {
          syntaxErr(cur, 'unexpected indent');
        }
        const stmt = parseSingleLineStmt(cur.content, cur.lineno);
        if (!stmt) {
          pos++;
          continue;
        }
        if (stmt._type !== 'BlockHeader') {
          pos++;
          body.push(stmt);
          continue;
        }

        const { keyword, tokens, lineno, rawText } = stmt;
        if (keyword === 'if') {
          if (tokens[tokens.length - 1].type !== 'OP' || tokens[tokens.length - 1].value !== ':') {
            syntaxErr(cur);
          }
          const condTokens = tokens.slice(1, -1);
          if (condTokens.length === 0) syntaxErr(cur);
          const { expr: testExpr, nextPos } = parseExprTokens(condTokens, 0, lineno, rawText);
          if (nextPos !== condTokens.length) syntaxErr(cur);
          pos++;
          const ifBody = parseBlock(expectedIndent + 1);
          if (ifBody.length === 0) syntaxErr(cur, 'expected an indented block');

          const rootIf = { _type: 'If', test: testExpr, body: ifBody, orelse: [], lineno };
          let currentIf = rootIf;

          while (pos < lines.length && lines[pos].indent === expectedIndent) {
            const nextLine = lines[pos];
            const nextStmt = parseSingleLineStmt(nextLine.content, nextLine.lineno);
            if (nextStmt && nextStmt._type === 'BlockHeader' && nextStmt.keyword === 'elif') {
              const eTokens = nextStmt.tokens;
              if (eTokens[eTokens.length - 1].type !== 'OP' || eTokens[eTokens.length - 1].value !== ':') {
                syntaxErr(nextLine);
              }
              const eCondTokens = eTokens.slice(1, -1);
              if (eCondTokens.length === 0) syntaxErr(nextLine);
              const { expr: eTest, nextPos: eNext } = parseExprTokens(eCondTokens, 0, nextLine.lineno, nextLine.rawText);
              if (eNext !== eCondTokens.length) syntaxErr(nextLine);
              pos++;
              const eBody = parseBlock(expectedIndent + 1);
              if (eBody.length === 0) syntaxErr(nextLine, 'expected an indented block');
              const elifNode = { _type: 'If', test: eTest, body: eBody, orelse: [], lineno: nextLine.lineno };
              currentIf.orelse = [elifNode];
              currentIf = elifNode;
            } else if (nextStmt && nextStmt._type === 'BlockHeader' && nextStmt.keyword === 'else') {
              const eTokens = nextStmt.tokens;
              if (eTokens.length !== 2 || eTokens[1].type !== 'OP' || eTokens[1].value !== ':') {
                syntaxErr(nextLine);
              }
              pos++;
              const elseBody = parseBlock(expectedIndent + 1);
              if (elseBody.length === 0) syntaxErr(nextLine, 'expected an indented block');
              currentIf.orelse = elseBody;
              break;
            } else {
              break;
            }
          }
          body.push(rootIf);
        } else if (keyword === 'while') {
          if (tokens[tokens.length - 1].type !== 'OP' || tokens[tokens.length - 1].value !== ':') {
            syntaxErr(cur);
          }
          const condTokens = tokens.slice(1, -1);
          if (condTokens.length === 0) syntaxErr(cur);
          const { expr: testExpr, nextPos } = parseExprTokens(condTokens, 0, lineno, rawText);
          if (nextPos !== condTokens.length) syntaxErr(cur);
          pos++;
          const whileBody = parseBlock(expectedIndent + 1);
          if (whileBody.length === 0) syntaxErr(cur, 'expected an indented block');
          body.push({ _type: 'While', test: testExpr, body: whileBody, orelse: [], lineno });
        } else if (keyword === 'def') {
          // def func(a, b):
          if (tokens.length < 5 || tokens[1].type !== 'NAME' || tokens[2].type !== 'OP' || tokens[2].value !== '(' || tokens[tokens.length - 1].type !== 'OP' || tokens[tokens.length - 1].value !== ':' || tokens[tokens.length - 2].type !== 'OP' || tokens[tokens.length - 2].value !== ')') {
            syntaxErr(cur);
          }
          const funcName = tokens[1].value;
          const argTokens = tokens.slice(3, -2);
          const args = [];
          for (let i = 0; i < argTokens.length; i++) {
            if (i % 2 === 0) {
              if (argTokens[i].type !== 'NAME') syntaxErr(cur);
              args.push(argTokens[i].value);
            } else {
              if (argTokens[i].type !== 'OP' || argTokens[i].value !== ',') syntaxErr(cur);
            }
          }
          pos++;
          const fnBody = parseBlock(expectedIndent + 1);
          if (fnBody.length === 0) syntaxErr(cur, 'expected an indented block');
          body.push({ _type: 'FunctionDef', name: funcName, args, body: fnBody, lineno });
        } else {
          syntaxErr(cur);
        }
      }
      return body;
    }

    const body = parseBlock(0);
    return { _type: 'Module', body };
  }

  // ---------------- OPTIMIZER (AST & PEEPHOLE) ----------------

  function c_style_div(a, b) {
    if (b === 0) throw new Error('ZeroDivisionError');
    return Math.trunc(a / b);
  }

  function c_style_mod(a, b) {
    if (b === 0) throw new Error('ZeroDivisionError');
    return Math.trunc(a % b);
  }

  function walkAST(node, callback) {
    if (!node || typeof node !== 'object') return;
    callback(node);
    const childArrays = ['body', 'orelse', 'values', 'comparators', 'args', 'targets'];
    for (const key of childArrays) {
      if (Array.isArray(node[key])) {
        for (const child of node[key]) walkAST(child, callback);
      }
    }
    const childProps = ['value', 'left', 'right', 'operand', 'test', 'func', 'target'];
    for (const key of childProps) {
      if (node[key] && typeof node[key] === 'object') {
        walkAST(node[key], callback);
      }
    }
  }

  function optimize_ast(tree, remove_unused_func = true) {
    const live_funcs = new Set();

    if (remove_unused_func) {
      const defined_funcs = {};
      for (const node of tree.body) {
        if (node._type === 'FunctionDef') {
          defined_funcs[node.name] = node;
        }
      }
      const worklist = tree.body.filter(node => node._type !== 'FunctionDef');
      while (worklist.length > 0) {
        const current_node = worklist.pop();
        const called_names = [];
        walkAST(current_node, child => {
          if (child._type === 'Call' && child.func && child.func._type === 'Name') {
            called_names.push(child.func.id);
          }
        });
        for (const name of called_names) {
          if (Object.prototype.hasOwnProperty.call(defined_funcs, name) && !live_funcs.has(name)) {
            live_funcs.add(name);
            worklist.push(defined_funcs[name]);
          }
        }
      }
    }

    function apply_bin_op(op, left, right) {
      switch (op) {
        case 'Add': return left + right;
        case 'Sub': return left - right;
        case 'Mult': return left * right;
        case 'Pow': return Math.pow(left, right);
        case 'Div':
        case 'FloorDiv': return c_style_div(left, right);
        case 'Mod': return c_style_mod(left, right);
        case 'LShift': return left << right;
        case 'RShift': return left >> right;
        case 'BitOr': return left | right;
        case 'BitXor': return left ^ right;
        case 'BitAnd': return left & right;
        default: return null;
      }
    }

    function apply_cmp_op(op, left, right) {
      switch (op) {
        case 'Eq': return left === right;
        case 'NotEq': return left !== right;
        case 'Lt': return left < right;
        case 'LtE': return left <= right;
        case 'Gt': return left > right;
        case 'GtE': return left >= right;
        default: return null;
      }
    }

    function transformNode(node) {
      if (!node || typeof node !== 'object') return node;

      if (node._type === 'Module') {
        node.body = node.body.map(transformNode).filter(Boolean);
        return node;
      }
      if (node._type === 'FunctionDef') {
        if (remove_unused_func && !live_funcs.has(node.name)) {
          return null;
        }
        node.body = node.body.map(transformNode).filter(Boolean);
        return node;
      }
      if (node._type === 'If') {
        node.test = transformNode(node.test);
        node.body = node.body.map(transformNode).filter(Boolean);
        node.orelse = node.orelse.map(transformNode).filter(Boolean);
        return node;
      }
      if (node._type === 'While') {
        node.test = transformNode(node.test);
        node.body = node.body.map(transformNode).filter(Boolean);
        return node;
      }
      if (node._type === 'Assign') {
        node.value = transformNode(node.value);
        return node;
      }
      if (node._type === 'AugAssign') {
        node.value = transformNode(node.value);
        return node;
      }
      if (node._type === 'Return') {
        if (node.value) node.value = transformNode(node.value);
        return node;
      }
      if (node._type === 'Expr') {
        node.value = transformNode(node.value);
        return node;
      }
      if (node._type === 'Call') {
        node.args = node.args.map(transformNode);
        return node;
      }
      if (node._type === 'UnaryOp') {
        node.operand = transformNode(node.operand);
        return node;
      }
      if (node._type === 'BinOp') {
        node.left = transformNode(node.left);
        node.right = transformNode(node.right);
        if (node.left._type === 'Constant' && node.right._type === 'Constant' && node.left.valueType === 'int' && node.right.valueType === 'int') {
          try {
            const val = apply_bin_op(node.op, node.left.value, node.right.value);
            if (val !== null && Number.isFinite(val)) {
              return { _type: 'Constant', value: Math.trunc(val), valueType: 'int', lineno: node.lineno };
            }
          } catch (e) {
            // Leave node as-is on division by zero
          }
        }
        return node;
      }
      if (node._type === 'Compare') {
        node.left = transformNode(node.left);
        node.comparators = node.comparators.map(transformNode);
        if (node.ops.length === 1 && node.comparators.length === 1) {
          const left = node.left;
          const right = node.comparators[0];
          const op = node.ops[0];
          if (left._type === 'Constant' && right._type === 'Constant' && left.valueType === 'int' && right.valueType === 'int') {
            const val = apply_cmp_op(op, left.value, right.value);
            if (val !== null) {
              return { _type: 'Constant', value: val ? 1 : 0, valueType: 'int', lineno: node.lineno };
            }
          }
        }
        return node;
      }
      if (node._type === 'BoolOp') {
        node.values = node.values.map(transformNode);
        if (node.values.every(v => v._type === 'Constant')) {
          const raw_values = node.values.map(v => v.value);
          let final_val = 0;
          if (node.op === 'And') {
            final_val = raw_values.every(Boolean) ? 1 : 0;
          } else if (node.op === 'Or') {
            final_val = raw_values.some(Boolean) ? 1 : 0;
          }
          return { _type: 'Constant', value: final_val, valueType: 'int', lineno: node.lineno };
        }
        return node;
      }
      return node;
    }

    return transformNode(tree);
  }

  function optimize_pass(instruction_list, arg_and_var_dict) {
    const optimized_list = [];
    let i = 0;
    while (i < instruction_list.length) {
      const current_instr = instruction_list[i];

      if (i + 1 < instruction_list.length) {
        const next_instr = instruction_list[i + 1];

        if (current_instr.opcode === OP.OP_PUSH0 && next_instr.opcode === OP.OP_DROP) {
          i += 2;
          continue;
        }

        const is_same_mem_save_load =
          (current_instr.opcode === OP.OP_POPI && next_instr.opcode === OP.OP_PUSHI) ||
          (current_instr.opcode === OP.OP_POPR && next_instr.opcode === OP.OP_PUSHR);
        if (is_same_mem_save_load && current_instr.payload === next_instr.payload) {
          optimized_list.push(new dsvm_instruction({ opcode: OP.OP_DUP }));
          optimized_list.push(current_instr);
          i += 2;
          continue;
        }
      }

      if (pushc_instructions.has(current_instr.opcode) && current_instr.payload === 0) {
        optimized_list.push(new dsvm_instruction({ opcode: OP.OP_PUSH0, label: current_instr.label, comment: current_instr.comment }));
        i += 1;
        continue;
      }
      if (pushc_instructions.has(current_instr.opcode) && current_instr.payload === 1) {
        optimized_list.push(new dsvm_instruction({ opcode: OP.OP_PUSH1, label: current_instr.label, comment: current_instr.comment }));
        i += 1;
        continue;
      }
      if (
        current_instr.opcode === OP.OP_ALLOC &&
        Object.prototype.hasOwnProperty.call(arg_and_var_dict, current_instr.payload) &&
        arg_and_var_dict[current_instr.payload].locals.length === 0
      ) {
        i += 1;
        continue;
      }

      optimized_list.push(current_instr);
      i += 1;
    }
    return optimized_list;
  }

  function optimize_full_assembly_from_context_dict(ctx_dict) {
    const arg_and_var_dict = ctx_dict.func_arg_and_local_var_lookup;
    ctx_dict.root_assembly_list = optimize_pass(ctx_dict.root_assembly_list, arg_and_var_dict);
    for (const key of Object.keys(ctx_dict.func_assembly_dict)) {
      ctx_dict.func_assembly_dict[key] = optimize_pass(ctx_dict.func_assembly_dict[key], arg_and_var_dict);
    }
  }

  function replace_dummy_with_drop(instruction_list) {
    for (const this_instruction of instruction_list) {
      if (this_instruction.opcode === OP.OP_POPI && this_instruction.payload === DUMMY_VAR_NAME) {
        this_instruction.opcode = OP.OP_DROP;
        this_instruction.payload = null;
      }
    }
  }

  function replace_dummy_with_drop_from_context_dict(ctx_dict) {
    replace_dummy_with_drop(ctx_dict.root_assembly_list);
    for (const key of Object.keys(ctx_dict.func_assembly_dict)) {
      replace_dummy_with_drop(ctx_dict.func_assembly_dict[key]);
    }
  }

  // ---------------- SYMTABLE & AST WALK ----------------

  function buildSymtableFromAST(unoptimizedTree) {
    const functions = {};
    for (const stmt of unoptimizedTree.body) {
      if (stmt._type === 'FunctionDef') {
        const symbols = new Map();
        for (const arg of stmt.args) {
          symbols.set(arg, { name: arg, isParam: true });
        }
        walkAST(stmt, node => {
          if (node._type === 'Name' && !symbols.has(node.id)) {
            symbols.set(node.id, { name: node.id, isParam: false });
          }
        });
        functions[stmt.name] = {
          name: stmt.name,
          params: [...stmt.args],
          symbols,
        };
      }
    }
    return { functions };
  }

  function get_orig_ds_lnumsf1_from_py_lnumsf1(rdict, this_pylnum_sf1, onerr = null) {
    if (this_pylnum_sf1 === null || this_pylnum_sf1 === undefined) return onerr;
    let og_index_sf1 = onerr;
    for (const line_obj of rdict.ds2py_listing) {
      if (line_obj.py_lnum_sf1 === this_pylnum_sf1) {
        og_index_sf1 = line_obj.orig_lnum_sf1;
        break;
      }
    }
    return og_index_sf1;
  }

  function get_orig_ds_line_from_py_lnum(rdict, this_pylnum_sf1) {
    try {
      if (this_pylnum_sf1 === null || this_pylnum_sf1 === undefined) return '';
      let og_index_sf0 = null;
      for (const line_obj of rdict.ds2py_listing) {
        if (line_obj.py_lnum_sf1 === this_pylnum_sf1) {
          og_index_sf0 = line_obj.orig_lnum_sf1 - 1;
          break;
        }
      }
      if (og_index_sf0 === null || og_index_sf0 < 0 || og_index_sf0 >= rdict.orig_listing.length) return '';
      return rdict.orig_listing[og_index_sf0].content;
    } catch (e) {
      return '';
    }
  }

  function get_orig_ds_line_from_orig_ds_lnum_sf1(ctx_dict, lnumsf1) {
    try {
      if (!ctx_dict.orig_listing || lnumsf1 < 1 || lnumsf1 > ctx_dict.orig_listing.length) return '';
      return ctx_dict.orig_listing[lnumsf1 - 1].content;
    } catch (e) {
      return '';
    }
  }

  function how_many_args(func_name, ctx_dict) {
    const args_list = ctx_dict.func_args_dict[func_name];
    if (!args_list) return null;
    return args_list.length;
  }

  const arith_lookup = {
    Eq: OP.OP_EQ,
    NotEq: OP.OP_NOTEQ,
    Lt: OP.OP_LT,
    LtE: OP.OP_LTE,
    Gt: OP.OP_GT,
    GtE: OP.OP_GTE,
    Add: OP.OP_ADD,
    Sub: OP.OP_SUB,
    Mult: OP.OP_MULT,
    Div: OP.OP_DIV,
    Mod: OP.OP_MOD,
    Pow: OP.OP_POW,
    LShift: OP.OP_LSHIFT,
    RShift: OP.OP_RSHIFT,
    BitOr: OP.OP_BITOR,
    BitAnd: OP.OP_BITAND,
    BitXor: OP.OP_BITXOR,
    And: OP.OP_LOGIAND,
    Or: OP.OP_LOGIOR,
    Invert: OP.OP_BITINV,
    Not: OP.OP_LOGINOT,
    USub: OP.OP_USUB,
  };

  function make_instruction_pushc(value, comment = '') {
    const val = (Number(value) >>> 0);
    if (val > 0xFFFF) {
      return new dsvm_instruction({ opcode: OP.OP_PUSHC32, payload: val, comment });
    }
    if (val > 0xFF) {
      return new dsvm_instruction({ opcode: OP.OP_PUSHC16, payload: val, comment });
    }
    return new dsvm_instruction({ opcode: OP.OP_PUSHC8, payload: val, comment });
  }

  function is_known_global(name, ctx_dict) {
    const globalsSet = ctx_dict.user_declared_var_dict['__GLOBAL__'];
    return Boolean(globalsSet && globalsSet.has(name));
  }

  function classify_name(name, current_function, ctx_dict) {
    if (is_ds_keyword(name)) {
      throw new Error(`Invalid Variable Name: "${name}"`);
    }
    if (Object.prototype.hasOwnProperty.call(reserved_variables_dict, name)) {
      return SymType.RESERVED_VAR;
    }

    const root_table = ctx_dict.symtable_root;
    if (current_function !== null) {
      const this_table = root_table.functions[current_function];
      const user_declared_func_locals = ctx_dict.user_declared_var_dict[current_function];
      if (!this_table) {
        throw new Error(`No symtable for ${name} in '${current_function}'()`);
      }
      const sym = this_table.symbols.get(name);
      if (sym) {
        if (sym.isParam && user_declared_func_locals && user_declared_func_locals.has(name)) {
          throw new Error(`Variable "${name}" cannot be both arg and local`);
        }
        if (sym.isParam) {
          return SymType.FUNC_ARG;
        }
        if (user_declared_func_locals && user_declared_func_locals.has(name)) {
          return SymType.FUNC_LOCAL_VAR;
        }
      }
    }

    if (is_known_global(name, ctx_dict)) {
      return SymType.GLOBAL_VAR;
    }
    const func_err_msg = current_function ? ` in function "${current_function}()"` : '';
    throw new Error(`Unknown symbol "${name}"${func_err_msg}`);
  }

  function get_key_combined_value(keyname) {
    let key_code, key_type;
    if (Object.prototype.hasOwnProperty.call(ds_hid_keyname_dict, keyname)) {
      key_code = ds_hid_keyname_dict[keyname][0];
      key_type = ds_hid_keyname_dict[keyname][1];
    } else if (keyname.length === 1) {
      key_code = keyname.charCodeAt(0);
      key_type = KEY_TYPE_CHAR;
    } else {
      throw new Error(`Invalid Key: ${keyname}`);
    }
    return ((key_type % 0xff) << 8) | (key_code % 0xff);
  }

  function visit_name_node(node, ctx_dict, inst_list) {
    const og_ds_line = ctx_dict.og_ds_line;
    const current_function = ctx_dict.func_def_name;
    const node_name = node.id;
    const sym_type = classify_name(node_name, current_function, ctx_dict);

    let parent_func = current_function;
    if (sym_type === SymType.GLOBAL_VAR || sym_type === SymType.RESERVED_VAR) {
      parent_func = null;
    }
    const varKey = `${node_name}|${sym_type}|${parent_func || ''}`;
    ctx_dict.var_info_map.set(varKey, { name: node_name, type: sym_type, func: parent_func });

    if (node.ctx === 'Store') {
      const opcode = (sym_type === SymType.FUNC_ARG || sym_type === SymType.FUNC_LOCAL_VAR) ? OP.OP_POPR : OP.OP_POPI;
      inst_list.push(new dsvm_instruction({ opcode, payload: node_name, comment: og_ds_line, parent_func: current_function, var_type: sym_type }));
      return;
    }
    if (node.ctx === 'Load') {
      const opcode = (sym_type === SymType.FUNC_ARG || sym_type === SymType.FUNC_LOCAL_VAR) ? OP.OP_PUSHR : OP.OP_PUSHI;
      inst_list.push(new dsvm_instruction({ opcode, payload: node_name, comment: og_ds_line, parent_func: current_function, var_type: sym_type }));
    }
  }

  function visit_node(node, ctx_dict) {
    const current_function = ctx_dict.func_def_name || null;
    const caller_func_name = ctx_dict.caller_func_name;
    let instruction_list;
    if (current_function === null) {
      instruction_list = ctx_dict.root_assembly_list;
    } else {
      if (!ctx_dict.func_assembly_dict[current_function]) {
        ctx_dict.func_assembly_dict[current_function] = [];
      }
      instruction_list = ctx_dict.func_assembly_dict[current_function];
    }

    const og_ds_line = get_orig_ds_line_from_py_lnum(ctx_dict, node.lineno);
    ctx_dict.og_ds_line = og_ds_line;

    function emit(opcode, payload = null, label = null, parent_func = null) {
      instruction_list.push(new dsvm_instruction({ opcode, payload, label, comment: og_ds_line, parent_func }));
    }

    if (node._type === 'Name') {
      visit_name_node(node, ctx_dict, instruction_list);
    } else if (node._type === 'Constant') {
      if (node.valueType === 'str' && Object.prototype.hasOwnProperty.call(ds_str_func_lookup, caller_func_name)) {
        emit(OP.OP_PUSHSTR, node.value, null, current_function);
      } else if (node.valueType === 'str' && Object.prototype.hasOwnProperty.call(ds_keypress_func_lookup, caller_func_name)) {
        emit(OP.OP_PUSHC16, get_key_combined_value(node.value));
      } else if (node.valueType === 'int') {
        instruction_list.push(make_instruction_pushc(node.value, og_ds_line));
      } else if (node.valueType === 'str' && node.value.length === 1 && node.value.charCodeAt(0) <= 0xff) {
        instruction_list.push(make_instruction_pushc(node.value.charCodeAt(0), og_ds_line));
      } else {
        throw new Error(`Unsupported Constant: ${node.value}`);
      }
    } else if (node._type === 'ArithOp') {
      if (!Object.prototype.hasOwnProperty.call(arith_lookup, node.op)) {
        throw new Error(`Unsupported Operation: ${node.op}`);
      }
      emit(arith_lookup[node.op]);
    } else if (node._type === 'If') {
      emit(OP.OP_BRZ, ctx_dict.if_destination_label);
    } else if (node._type === 'While') {
      emit(OP.OP_BRZ, ctx_dict.while_end_label);
    } else if (node._type === 'Continue') {
      emit(OP.OP_JMP, ctx_dict.while_start_label);
    } else if (node._type === 'Break') {
      emit(OP.OP_JMP, ctx_dict.while_end_label);
    } else if (node._type === 'Call') {
      const func_name = node.func.id;
      if (Object.prototype.hasOwnProperty.call(ds_reserved_funcs, func_name)) {
        const fun_info = ds_reserved_funcs[func_name];
        emit(fun_info.opcode);
        if (!fun_info.has_return_value) {
          emit(OP.OP_PUSH0);
        }
      } else {
        emit(OP.OP_CALL, `func_${func_name}`);
      }
    } else if (node._type === 'Return') {
      const arg_count = how_many_args(current_function, ctx_dict);
      if (arg_count === null) {
        throw new Error('Invalid arg count');
      }
      emit(OP.OP_RET, arg_count);
    } else if (node._type === 'Pass') {
      emit(OP.OP_NOP);
    } else if (node._type === 'add_nop') {
      emit(OP.OP_NOP, null, node.label);
    } else if (node._type === 'add_jmp') {
      emit(OP.OP_JMP, node.label);
    } else if (node._type === 'add_push0') {
      emit(OP.OP_PUSH0);
    } else if (node._type === 'add_default_return') {
      if (instruction_list[instruction_list.length - 1].opcode !== OP.OP_RET) {
        emit(OP.OP_PUSH0);
        emit(OP.OP_RET, node.arg_count);
      }
    } else if (node._type === 'add_alloc') {
      emit(OP.OP_ALLOC, node.func_name);
    } else {
      throw new Error(`Unsupported leaf node: ${node._type}`);
    }
  }

  function postorder_walk(node, action, ctx_dict) {
    const this_pylnum_sf1 = node.lineno;
    const this_orig_ds_lnum_sf1 = get_orig_ds_lnumsf1_from_py_lnumsf1(ctx_dict, this_pylnum_sf1);
    if (this_orig_ds_lnum_sf1 !== null && this_orig_ds_lnum_sf1 !== undefined) {
      ctx_dict.latest_orig_ds_lnum_sf1 = this_orig_ds_lnum_sf1;
    }

    if (node._type === 'Expr') {
      postorder_walk(node.value, action, ctx_dict);
    } else if (node._type === 'BinOp') {
      postorder_walk(node.right, action, ctx_dict);
      postorder_walk(node.left, action, ctx_dict);
      action({ _type: 'ArithOp', op: node.op, lineno: node.lineno }, ctx_dict);
    } else if (node._type === 'BoolOp') {
      for (let i = node.values.length - 1; i >= 0; i--) {
        postorder_walk(node.values[i], action, ctx_dict);
      }
      for (let x = 0; x < node.values.length - 1; x++) {
        action({ _type: 'ArithOp', op: node.op, lineno: node.lineno }, ctx_dict);
      }
    } else if (node._type === 'UnaryOp') {
      postorder_walk(node.operand, action, ctx_dict);
      action({ _type: 'ArithOp', op: node.op, lineno: node.lineno }, ctx_dict);
    } else if (node._type === 'Compare') {
      if (node.comparators.length > 1 || node.ops.length > 1) {
        throw new Error('Multiple Comparators');
      }
      postorder_walk(node.comparators[0], action, ctx_dict);
      postorder_walk(node.left, action, ctx_dict);
      action({ _type: 'ArithOp', op: node.ops[0], lineno: node.lineno }, ctx_dict);
    } else if (node._type === 'Assign') {
      postorder_walk(node.value, action, ctx_dict);
      if (node.targets.length !== 1) {
        throw new Error('Multiple Assignments');
      }
      postorder_walk(node.targets[0], action, ctx_dict);
    } else if (node._type === 'FunctionDef') {
      const func_name = node.name;
      const this_func_label = `func_${func_name}`;
      const this_arg_count = how_many_args(func_name, ctx_dict);
      if (this_arg_count === null) throw new Error('Invalid args');
      if (this_arg_count > DSVM_FUNC_ARG_MAX_SIZE) throw new Error('Too many args');
      ctx_dict.func_def_name = func_name;
      action({ _type: 'add_nop', label: this_func_label }, ctx_dict);
      action({ _type: 'add_alloc', func_name }, ctx_dict);
      for (const item of node.body) {
        postorder_walk(item, action, ctx_dict);
      }
      action({ _type: 'add_default_return', arg_count: this_arg_count }, ctx_dict);
    } else if (node._type === 'Return') {
      if (node.value === null) {
        action({ _type: 'add_push0' }, ctx_dict);
      } else {
        postorder_walk(node.value, action, ctx_dict);
      }
      action(node, ctx_dict);
    } else if (node._type === 'AugAssign') {
      const target_load = { _type: 'Name', id: node.target.id, ctx: 'Load', lineno: node.target.lineno };
      postorder_walk(node.value, action, ctx_dict);
      postorder_walk(target_load, action, ctx_dict);
      action({ _type: 'ArithOp', op: node.op, lineno: node.lineno }, ctx_dict);
      postorder_walk(node.target, action, ctx_dict);
    } else if (node._type === 'If') {
      let if_skip_label = `If_skip@${this_orig_ds_lnum_sf1}`;
      const if_end_label = `If_end@${this_orig_ds_lnum_sf1}`;
      if (node.orelse.length === 0) {
        if_skip_label = if_end_label;
      }
      ctx_dict.if_destination_label = if_skip_label;
      postorder_walk(node.test, action, ctx_dict);
      action(node, ctx_dict);
      for (const item of node.body) {
        postorder_walk(item, action, ctx_dict);
      }
      if (node.orelse.length > 0) {
        action({ _type: 'add_jmp', label: if_end_label }, ctx_dict);
        action({ _type: 'add_nop', label: if_skip_label }, ctx_dict);
        for (const item of node.orelse) {
          postorder_walk(item, action, ctx_dict);
        }
      }
      action({ _type: 'add_nop', label: if_end_label }, ctx_dict);
    } else if (node._type === 'While') {
      const while_start_label = `While_start@${this_orig_ds_lnum_sf1}`;
      const while_end_label = `While_end@${this_orig_ds_lnum_sf1}`;
      action({ _type: 'add_nop', label: while_start_label }, ctx_dict);
      postorder_walk(node.test, action, ctx_dict);
      ctx_dict.while_start_label = while_start_label;
      ctx_dict.while_end_label = while_end_label;
      action(node, ctx_dict);
      for (const item of node.body) {
        postorder_walk(item, action, ctx_dict);
      }
      action({ _type: 'add_jmp', label: while_start_label }, ctx_dict);
      action({ _type: 'add_nop', label: while_end_label }, ctx_dict);
    } else if (node._type === 'Call') {
      const func_name = node.func.id;
      const caller_arg_count = node.args.length;
      if (node.keywords && node.keywords.length !== 0) {
        throw new Error('Invalid arguments');
      }
      let callee_arg_count;
      if (Object.prototype.hasOwnProperty.call(ds_reserved_funcs, func_name)) {
        callee_arg_count = ds_reserved_funcs[func_name].arg_len;
      } else {
        callee_arg_count = how_many_args(func_name, ctx_dict);
      }
      if (callee_arg_count === null || callee_arg_count === undefined) {
        throw new Error(`Function ${func_name}() not found`);
      }
      if (caller_arg_count !== callee_arg_count) {
        throw new Error('Wrong number of arguments');
      }
      ctx_dict.caller_func_name = func_name;
      for (let i = node.args.length - 1; i >= 0; i--) {
        postorder_walk(node.args[i], action, ctx_dict);
      }
      action(node, ctx_dict);
    } else if (node._type === 'Name' || node._type === 'Constant' || node._type === 'Break' || node._type === 'Continue' || node._type === 'Pass') {
      action(node, ctx_dict);
    } else {
      throw new Error(`Unknown AST Node: ${node._type}`);
    }
  }

  // ---------------- BINARY RESOLUTION & PACKING ----------------

  function resolve_global_and_reserved_var_address(var_name, udgv_lookup) {
    if (Object.prototype.hasOwnProperty.call(reserved_variables_dict, var_name)) {
      return reserved_variables_dict[var_name];
    }
    if (Object.prototype.hasOwnProperty.call(udgv_lookup, var_name)) {
      return udgv_lookup[var_name];
    }
    throw new Error(`Unknown variable: ${var_name}`);
  }

  function group_vars(global_context_dict) {
    const grouped_data = {};
    for (const variable of global_context_dict.var_info_map.values()) {
      if (variable.func === null) continue;
      if (!grouped_data[variable.func]) {
        grouped_data[variable.func] = { args: [], locals: [] };
      }
      if (variable.type === SymType.FUNC_LOCAL_VAR) {
        grouped_data[variable.func].locals.push(variable.name);
      }
    }
    for (const func_name of Object.keys(global_context_dict.func_args_dict)) {
      if (!grouped_data[func_name]) {
        grouped_data[func_name] = { args: [], locals: [] };
      }
      grouped_data[func_name].args = global_context_dict.func_args_dict[func_name];
    }
    for (const key of Object.keys(grouped_data)) {
      grouped_data[key].locals.sort();
    }
    return grouped_data;
  }

  function needs_resolving(inst) {
    if (inst.opcode.is_virtual) return true;
    if (inst.opcode.length === 1) return false;
    if (typeof inst.payload === 'string') return true;
    if (typeof inst.payload === 'number') return false;
    throw new Error(`Unable to resolve: ${inst}`);
  }

  function var_name_to_address_lookup_only_for_strprint(var_name, str_inst, arg_and_local_var_lookup, udgv_lookup) {
    const parent_func = str_inst.parent_func;
    if (Object.prototype.hasOwnProperty.call(reserved_variables_dict, var_name)) {
      return [reserved_variables_dict[var_name], SymType.RESERVED_VAR];
    }
    if (parent_func !== null && Object.prototype.hasOwnProperty.call(arg_and_local_var_lookup, parent_func)) {
      const fun_var_list = arg_and_local_var_lookup[parent_func];
      const argIdx = fun_var_list.args.indexOf(var_name);
      if (argIdx !== -1) {
        return [(argIdx + 1) * 4, SymType.FUNC_ARG];
      }
      const locIdx = fun_var_list.locals.indexOf(var_name);
      if (locIdx !== -1) {
        return [(locIdx + 1) * -4, SymType.FUNC_LOCAL_VAR];
      }
    }
    if (Object.prototype.hasOwnProperty.call(udgv_lookup, var_name)) {
      return [udgv_lookup[var_name], SymType.GLOBAL_VAR];
    }
    return [null, null];
  }

  function get_partial_varname_addr(msg, str_inst, arg_and_local_var_lookup, udgv_lookup) {
    if (!msg) return [null, null, null];
    for (let x = msg.length; x >= 0; x--) {
      const partial_name = msg.slice(0, x);
      const [addr, var_type] = var_name_to_address_lookup_only_for_strprint(partial_name, str_inst, arg_and_local_var_lookup, udgv_lookup);
      if (addr !== null) {
        return [partial_name, addr, var_type];
      }
    }
    return [null, null, null];
  }

  function extract_printf_specifier(text) {
    const match = /^%[-+ #0]*(\d+)?(\.\d+)?[duxX]/.exec(text);
    return match ? match[0] : '';
  }

  const var_boundary_fp_rel = 0x1e;
  const var_boundary_udgv = 0x1f;
  const utf8Encoder = new TextEncoder();

  function replace_var_in_str(instruction, arg_and_local_var_lookup, udgv_lookup) {
    const result = [];
    const msg = instruction.payload;
    let i = 0;
    const msg_len = msg.length;

    while (i < msg_len) {
      const ch = msg[i];
      if (ch === '$') {
        const [var_name, var_addr, var_type] = get_partial_varname_addr(
          msg.slice(i + 1),
          instruction,
          arg_and_local_var_lookup,
          udgv_lookup
        );
        if (var_addr === null) {
          const bytes = utf8Encoder.encode(ch);
          for (const b of bytes) result.push(b);
          i += 1;
          continue;
        }
        let boundary, payload_bytes;
        if (var_type === SymType.FUNC_ARG || var_type === SymType.FUNC_LOCAL_VAR) {
          boundary = var_boundary_fp_rel;
          payload_bytes = pack_to_two_bytes(var_addr);
        } else {
          boundary = var_boundary_udgv;
          payload_bytes = pack_to_two_bytes(var_addr);
        }
        i += 1 + var_name.length;
        const printf_format_specifier = extract_printf_specifier(msg.slice(i));
        result.push(boundary);
        result.push(payload_bytes[0], payload_bytes[1]);
        for (let k = 0; k < printf_format_specifier.length; k++) {
          const code = printf_format_specifier.charCodeAt(k);
          if (code < 128) result.push(code);
        }
        result.push(boundary);
        i += printf_format_specifier.length;
      } else {
        const bytes = utf8Encoder.encode(ch);
        for (const b of bytes) result.push(b);
        i += 1;
      }
    }
    result.push(0);
    return new Uint8Array(result);
  }

  function pack_to_one_byte(value) {
    if (!Number.isInteger(value)) throw new Error(`Input must be an integer, but received ${typeof value}`);
    if (value >= 0) {
      if (value > 255) throw new Error(`Value ${value} is too large for uint8_t. Max allowed is 255.`);
      return new Uint8Array([value & 0xFF]);
    } else {
      if (value < -128 || value > 127) throw new Error(`Value ${value} is outside the int8_t range. Range is -128 to 127.`);
      return new Uint8Array([value & 0xFF]);
    }
  }

  function pack_to_two_bytes(value) {
    if (!Number.isInteger(value)) throw new Error(`Input must be an integer, but received ${typeof value}`);
    if (value >= 0) {
      if (value > 65535) throw new Error(`Value ${value} is too large for uint16_t. Max allowed is 65535.`);
      return new Uint8Array([value & 0xFF, (value >> 8) & 0xFF]);
    } else {
      if (value < -32768 || value > 32767) throw new Error(`Value ${value} is outside the int16_t range. Range is -32768 to 32767.`);
      const u = value & 0xFFFF;
      return new Uint8Array([u & 0xFF, (u >> 8) & 0xFF]);
    }
  }

  function pack_to_four_bytes(value) {
    if (!Number.isInteger(value)) throw new Error(`Input must be an integer, but received ${typeof value}`);
    if (value >= 0) {
      if (value > 4294967295) throw new Error(`Value ${value} is too large for uint32_t. Max is 4294967295.`);
      const u = value >>> 0;
      return new Uint8Array([u & 0xFF, (u >>> 8) & 0xFF, (u >>> 16) & 0xFF, (u >>> 24) & 0xFF]);
    } else {
      if (value < -2147483648 || value > 2147483647) throw new Error(`Value ${value} is outside the int32_t range.`);
      const u = value >>> 0;
      return new Uint8Array([u & 0xFF, (u >>> 8) & 0xFF, (u >>> 16) & 0xFF, (u >>> 24) & 0xFF]);
    }
  }

  function bytesToHexKey(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i++) {
      s += u8[i].toString(16).padStart(2, '0');
    }
    return s;
  }

  function compile_to_bin(rdict) {
    const user_strings_map = new Map(); // hexKey -> { bytes, addr }
    const func_arg_and_local_var_lookup = rdict.func_arg_and_local_var_lookup;
    const user_declared_global_var_addr_lookup = {};

    const globalNames = [];
    for (const v of rdict.var_info_map.values()) {
      if (v.type === SymType.GLOBAL_VAR) globalNames.push(v.name);
    }
    globalNames.sort();
    globalNames.forEach((item, index) => {
      user_declared_global_var_addr_lookup[item] = index * USER_VAR_BYTE_WIDTH + USER_VAR_START_ADDRESS;
    });

    if (Object.keys(user_declared_global_var_addr_lookup).length > MAX_UDV_COUNT) {
      throw new Error('Too many user-declared global variables');
    }

    const final_assembly_list = [];
    let curr_inst_addr = 0;
    for (const this_inst of rdict.root_assembly_list) {
      this_inst.addr = curr_inst_addr;
      curr_inst_addr += this_inst.opcode.length;
      final_assembly_list.push(this_inst);
    }

    for (const func_name of Object.keys(rdict.func_assembly_dict)) {
      for (const this_inst of rdict.func_assembly_dict[func_name]) {
        this_inst.addr = curr_inst_addr;
        curr_inst_addr += this_inst.opcode.length;
        final_assembly_list.push(this_inst);
      }
    }

    const label_to_addr_dict = {};
    for (const this_inst of final_assembly_list) {
      if (this_inst.label && this_inst.label.length > 0) {
        label_to_addr_dict[this_inst.label] = this_inst.addr;
      }
    }

    for (const this_inst of final_assembly_list) {
      if (!needs_resolving(this_inst)) continue;

      if (this_inst.opcode === OP.OP_PUSHSTR) {
        const bytestr = replace_var_in_str(this_inst, func_arg_and_local_var_lookup, user_declared_global_var_addr_lookup);
        const key = bytesToHexKey(bytestr);
        this_inst.payload = key;
        if (!user_strings_map.has(key)) {
          user_strings_map.set(key, { bytes: bytestr, addr: null });
        }
      } else if (this_inst.opcode === OP.OP_HCF) {
        throw new Error("I'm on fire!");
      } else if (Object.prototype.hasOwnProperty.call(label_to_addr_dict, this_inst.payload)) {
        this_inst.payload = label_to_addr_dict[this_inst.payload];
      } else if (this_inst.opcode === OP.OP_ALLOC) {
        let local_vars_count = 0;
        if (func_arg_and_local_var_lookup[this_inst.payload]) {
          local_vars_count = func_arg_and_local_var_lookup[this_inst.payload].locals.length;
        }
        if (local_vars_count > 255) {
          throw new Error(`Too many local variables in function "${this_inst.payload}()"`);
        }
        this_inst.payload = local_vars_count;
      } else if (this_inst.opcode === OP.OP_PUSHI || this_inst.opcode === OP.OP_POPI) {
        this_inst.payload = resolve_global_and_reserved_var_address(this_inst.payload, user_declared_global_var_addr_lookup);
      } else if (this_inst.opcode === OP.OP_PUSHR || this_inst.opcode === OP.OP_POPR) {
        const var_name = this_inst.payload;
        const parent_func = this_inst.parent_func;
        const var_type = this_inst.var_type;
        if (!parent_func || (var_type !== SymType.FUNC_LOCAL_VAR && var_type !== SymType.FUNC_ARG)) {
          throw new Error(`Insufficient info for ${var_name} in ${parent_func}()`);
        }
        const fun_info_dict = func_arg_and_local_var_lookup[parent_func];
        if (var_type === SymType.FUNC_ARG) {
          const argIdx = fun_info_dict.args.indexOf(var_name);
          if (argIdx === -1) throw new Error(`Not an arg: ${var_name} in ${parent_func}()`);
          this_inst.payload = (argIdx + 1) * 4;
        }
        if (var_type === SymType.FUNC_LOCAL_VAR) {
          const locIdx = fun_info_dict.locals.indexOf(var_name);
          if (locIdx === -1) throw new Error(`Not an local: ${var_name} in ${parent_func}()`);
          this_inst.payload = (locIdx + 1) * -4;
        }
      } else {
        throw new Error(`Unknown instruction: ${this_inst.opcode.name}`);
      }
    }

    const lastInst = final_assembly_list[final_assembly_list.length - 1];
    let user_str_addr = lastInst.addr + lastInst.opcode.length;

    for (const entry of user_strings_map.values()) {
      entry.addr = user_str_addr;
      user_str_addr += entry.bytes.length;
    }

    for (const this_inst of final_assembly_list) {
      if (this_inst.opcode === OP.OP_PUSHSTR) {
        this_inst.opcode = OP.OP_PUSHC16;
        this_inst.payload = user_strings_map.get(this_inst.payload).addr;
      }
    }

    const output_chunks = [];
    let totalLen = 0;
    for (const this_inst of final_assembly_list) {
      output_chunks.push(new Uint8Array([this_inst.opcode.code & 0xFF]));
      totalLen += 1;
      const this_payload = this_inst.payload;
      if (this_payload === null || this_payload === undefined) continue;
      let packed;
      if (this_inst.opcode === OP.OP_PUSHC8) {
        packed = pack_to_one_byte(this_payload);
      } else if (this_inst.opcode === OP.OP_PUSHC32) {
        packed = pack_to_four_bytes(this_payload);
      } else {
        packed = pack_to_two_bytes(this_payload);
      }
      output_chunks.push(packed);
      totalLen += packed.length;
    }
    for (const entry of user_strings_map.values()) {
      output_chunks.push(entry.bytes);
      totalLen += entry.bytes.length;
    }
    if (totalLen > MAX_BIN_SIZE) {
      throw new Error(`Bin size too large!\nThis: ${totalLen}, Max: ${MAX_BIN_SIZE}`);
    }

    const output_bin_array = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of output_chunks) {
      output_bin_array.set(chunk, offset);
      offset += chunk.length;
    }
    rdict.final_assembly_list = final_assembly_list;
    return output_bin_array;
  }

  function flip_import_line_number(import_dict) {
    if (!import_dict) return;
    for (const key of Object.keys(import_dict)) {
      for (const line_obj of import_dict[key]) {
        line_obj.orig_lnum_sf1 *= -1;
      }
    }
  }

  let global_context_dict = {};

  function make_dsb_with_exception(program_listing, should_print = false, remove_unused_func = true, import_name_to_line_obj_dict = null) {
    // Deep copy import dict so flipping line numbers doesn't mutate caller state across multiple calls
    let clonedImports = null;
    if (import_name_to_line_obj_dict) {
      clonedImports = {};
      for (const k of Object.keys(import_name_to_line_obj_dict)) {
        clonedImports[k] = import_name_to_line_obj_dict[k].map(x => x.clone());
      }
      flip_import_line_number(clonedImports);
    }

    const orig_listing = program_listing.map(x => x.clone());
    const working_listing = program_listing.map(x => x.clone());
    const rdict = preprocessor_run_all(working_listing, clonedImports);

    if (!rdict.is_success) {
      return {
        is_success: false,
        error_comment: rdict.comments || '',
        error_line_str: rdict.error_line_str || '',
        error_line_number_starting_from_1: rdict.error_line_number_starting_from_1 || 0,
        bin_array: new Uint8Array(0),
      };
    }

    global_context_dict = rdict;
    rdict.orig_listing = orig_listing;
    const post_pp_listing = rdict.dspp_listing_with_indent_level;
    const pyout = ds2py_run_all(post_pp_listing);
    rdict.ds2py_listing = pyout;

    let unoptimized_tree, my_tree;
    try {
      unoptimized_tree = parsePythonAST(pyout);
      // Clone for optimization so symtable_root sees unoptimized tree like Python's symtable.symtable(source)
      my_tree = optimize_ast(JSON.parse(JSON.stringify(unoptimized_tree)), remove_unused_func);
    } catch (e) {
      if (e instanceof SyntaxError) {
        return {
          is_success: false,
          error_comment: e.message || 'invalid syntax',
          error_line_number_starting_from_1: get_orig_ds_lnumsf1_from_py_lnumsf1(rdict, e.lineno, 0),
          error_line_str: e.text || '',
          bin_array: new Uint8Array(0),
        };
      }
      throw e;
    }

    const symtable_root = buildSymtableFromAST(unoptimized_tree);
    rdict.root_assembly_list = [new dsvm_instruction({ opcode: OP.OP_VMVER, payload: DSVM_VERSION })];
    rdict.symtable_root = symtable_root;
    rdict.func_assembly_dict = {};
    rdict.func_args_dict = {};
    for (const [fnName, fnTbl] of Object.entries(symtable_root.functions)) {
      rdict.func_args_dict[fnName] = fnTbl.params;
    }
    rdict.var_info_map = new Map();

    for (const statement of my_tree.body) {
      rdict.func_def_name = null;
      rdict.caller_func_name = null;
      postorder_walk(statement, visit_node, rdict);
    }

    rdict.func_arg_and_local_var_lookup = group_vars(rdict);
    replace_dummy_with_drop_from_context_dict(rdict);
    optimize_full_assembly_from_context_dict(rdict);
    rdict.root_assembly_list.push(new dsvm_instruction({ opcode: OP.OP_HALT }));

    const bin_array = compile_to_bin(rdict);
    return {
      is_success: true,
      error_comment: '',
      error_line_number_starting_from_1: 0,
      error_line_str: '',
      bin_array,
      assembly: rdict.final_assembly_list,
    };
  }

  function make_dsb_no_exception(program_listing, should_print = false, remove_unused_func = true, import_name_to_line_obj_dict = null) {
    try {
      return make_dsb_with_exception(program_listing, should_print, remove_unused_func, import_name_to_line_obj_dict);
    } catch (e) {
      const lnum = global_context_dict.latest_orig_ds_lnum_sf1 || 0;
      return {
        is_success: false,
        error_comment: String(e.message || e),
        error_line_number_starting_from_1: lnum,
        error_line_str: get_orig_ds_line_from_orig_ds_lnum_sf1(global_context_dict, lnum),
        bin_array: new Uint8Array(0),
      };
    }
  }

  function compileScriptText(scriptText, { allowAbort = false, dontRepeat = false, userHeaderLines = [], stdlibLines = [], removeUnusedFunc = true } = {}) {
    const rawLines = scriptText.replace(/^[ \t]+/, '').replace(/\r/g, '').split('\n');
    const finalListing = [];
    if (allowAbort) finalListing.push('$_ALLOW_ABORT = 1');
    if (dontRepeat) finalListing.push('$_DONT_REPEAT = 1');
    finalListing.push(...rawLines);

    const objList = make_list_of_ds_line_obj_from_str_listing(finalListing);
    const importDict = preprocess_import_str_dict({
      USE_UH: userHeaderLines,
      USE_STDLIB: stdlibLines,
    });
    return make_dsb_no_exception(objList, false, removeUnusedFunc, importDict);
  }

  function checkSyntaxText(scriptText, { userHeaderLines = [], stdlibLines = [], removeUnusedFunc = true, sourceFn = null } = {}) {
    const rawLines = scriptText.replace(/\r/g, '').split('\n');
    const objList = make_list_of_ds_line_obj_from_str_listing(rawLines, sourceFn);
    const importDict = sourceFn === 'USE_UH' ? null : preprocess_import_str_dict({
      USE_UH: userHeaderLines,
      USE_STDLIB: stdlibLines,
    });
    return make_dsb_no_exception(objList, false, removeUnusedFunc, importDict);
  }

  return {
    DSVM_VERSION,
    MAX_BIN_SIZE,
    KW,
    OP,
    ds_line,
    make_list_of_ds_line_obj_from_str_listing,
    preprocess_import_str_dict,
    make_dsb_with_exception,
    make_dsb_no_exception,
    compileScriptText,
    checkSyntaxText,
  };
});
