// Main Application Logic & UI Controller for duckyPad Configurator Web
// Ported from duckypad_config.py (v4.0.2)

(function () {
  'use strict';

  const DSVM = window.DSVM;
  const ZipMD5 = window.ZipMD5;
  const DuckObjs = window.DuckObjs;
  const HidFS = window.HidFS;

  // ---------------- APPLICATION STATE ----------------
  const state = {
    deviceType: DuckObjs.DP_MODEL_DUCKYPAD_PRO, // 24 = Pro, 20 = OG (2020)
    loadedDeviceType: DuckObjs.DP_MODEL_DUCKYPAD_PRO,
    isDeviceTypeChanged: false,
    connectionType: 'none', // 'none' | 'demo' | 'folder_handle' | 'folder_input' | 'webhid_dp20' | 'webhid_dpp' | 'zip'
    connectionLabel: '<---- Press Connect to begin',
    dirHandle: null,
    hidInfo: null,
    originalFilesMap: new Map(), // For differential sync (HID / DirectoryHandle)

    profileList: [],
    selectedProfileIndex: -1,
    selectedKeyIndex: null, // 0..67
    currentExpansionModule: 0, // 0..3
    scriptEditMode: 0, // 0 = On Press, 1 = On Release
    lastRgb: [238, 130, 238],

    userHeaderLines: [],
    stdlibLines: DuckObjs.default_stdlib_code.split('\n'),
    isUserHeaderDirty: false,
    isProfileOrderDirty: false,
    deletedProfileFolders: new Set(),

    isHalfstepWarningShown: false,
    isOnReleaseWarningShown: false,

    lastSyntaxListingStr: null,
    lastCompiledResult: null,
    dragSourceKeyIndex: null,
  };

  // ---------------- DOM ELEMENTS ----------------
  const el = {};

  function cacheElements() {
    const ids = [
      'btnConnect', 'statusLabel', 'modelSelect', 'btnSave', 'btnExportSdZip',
      'btnBackups', 'btnEditHeaders', 'btnThemeToggle',
      // Profiles
      'profileListbox', 'btnProfileUp', 'btnProfileRemove', 'btnProfileDown',
      'btnProfileNew', 'btnProfileDupe', 'btnProfileRename', 'btnProfileImport', 'btnProfileExport',
      'inputBgColor', 'chkKdColor', 'inputKdColor', 'chkDimUnused',
      'chkUpperHs', 'chkLowerHs',
      // Onboard Switches
      'chkRotateKeys', 'obswGrid',
      // Key Config
      'keyLimitLabel', 'keyNameTextarea', 'btnKeyRemove',
      'chkCustomKeyColor', 'inputKeyColor', 'chkAllowAbort', 'chkDontRepeat',
      // Rotary Encoders & Expansion
      'reActiveContainer', 'reTeaseContainer', 'reListContainer',
      'btnExpMinus', 'btnExpPlus', 'expModuleLabel', 'expListContainer',
      // Scripts
      'scriptsActiveWrapper', 'scriptsEmptyWrapper', 'btnCreateEmptyKey',
      'radioOnPress', 'radioOnRelease', 'labelOnRelease', 'btnInspectBytecode',
      'lineNumbersGutter', 'editorBackdrop', 'scriptTextarea',
      'syntaxStatusText', 'bytecodeSizeBadge',
      // Updates
      'appUpdateBadge', 'fwUpdateBadge',
      // Hidden file inputs
      'hiddenDirInput', 'hiddenZipInput', 'hiddenProfileZipInput',
      // Connect Modal
      'modalConnect', 'btnCloseConnectModal', 'btnModalWebHid', 'btnModalOpenFolder',
      'btnModalLoadZip', 'btnModalLoadDemo', 'webHidDevicePickerBox', 'webHidDeviceList',
      // Headers Modal
      'modalHeaders', 'btnCloseHeadersModal', 'headerLineGutter', 'headerBackdrop',
      'headerTextarea', 'headerSyntaxStatus', 'btnStdlibDocs', 'btnStdlibFetch',
      'btnToggleStdlibView', 'stdlibPreviewBox', 'btnSaveCloseHeaders',
      // Export Profiles Modal
      'modalExportProfiles', 'btnCloseExportModal', 'exportProfilesChecklist',
      'btnSelectAllProfiles', 'btnConfirmExportProfiles',
      // Backups Modal
      'modalBackups', 'btnCloseBackupsModal', 'backupsListContainer',
      // Bytecode Inspector Modal
      'modalBytecode', 'btnCloseBytecodeModal', 'bytecodeAsmPre', 'bytecodeHexPre',
      // Prompt / Model Question Modal
      'modalPrompt', 'promptTitle', 'promptMessage', 'promptInput',
      'promptButtonsNormal', 'promptButtonsYesNo', 'btnPromptCancel', 'btnPromptOk',
      'btnPromptYes', 'btnPromptNo',
      // Toast container
      'toastContainer',
    ];
    for (const id of ids) {
      el[id] = document.getElementById(id);
    }
  }

  // ---------------- TOAST & DIALOG HELPERS ----------------
  function showToast(message, type = 'info', durationMs = 3800) {
    const div = document.createElement('div');
    div.className = 'toast-msg';
    if (type === 'error') div.style.borderLeftColor = 'var(--accent-red)';
    if (type === 'success') div.style.borderLeftColor = 'var(--accent-green)';
    if (type === 'warn') div.style.borderLeftColor = 'var(--accent-orange)';
    div.textContent = message;
    el.toastContainer.appendChild(div);
    setTimeout(() => {
      div.remove();
    }, durationMs);
  }

  function askStringModal(title, message, initialValue = '') {
    return new Promise(resolve => {
      el.promptTitle.textContent = title;
      el.promptMessage.textContent = message;
      el.promptInput.value = initialValue;
      el.promptInput.classList.remove('hidden');
      el.promptButtonsNormal.classList.remove('hidden');
      el.promptButtonsYesNo.classList.add('hidden');
      el.modalPrompt.classList.remove('hidden');
      setTimeout(() => {
        el.promptInput.focus();
        el.promptInput.select();
      }, 20);

      function cleanup(val) {
        el.modalPrompt.classList.add('hidden');
        el.btnPromptOk.onclick = null;
        el.btnPromptCancel.onclick = null;
        el.promptInput.onkeydown = null;
        resolve(val);
      }

      el.btnPromptOk.onclick = () => cleanup(el.promptInput.value);
      el.btnPromptCancel.onclick = () => cleanup(null);
      el.promptInput.onkeydown = e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          cleanup(el.promptInput.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cleanup(null);
        }
      };
    });
  }

  function askYesNoModal(title, message, yesText = 'Yes', noText = 'No') {
    return new Promise(resolve => {
      el.promptTitle.textContent = title;
      el.promptMessage.textContent = message;
      el.promptInput.classList.add('hidden');
      el.promptButtonsNormal.classList.add('hidden');
      el.promptButtonsYesNo.classList.remove('hidden');
      el.btnPromptYes.textContent = yesText;
      el.btnPromptNo.textContent = noText;
      el.modalPrompt.classList.remove('hidden');

      function cleanup(val) {
        el.modalPrompt.classList.add('hidden');
        el.btnPromptYes.onclick = null;
        el.btnPromptNo.onclick = null;
        resolve(val);
      }

      el.btnPromptYes.onclick = () => cleanup(true);
      el.btnPromptNo.onclick = () => cleanup(false);
    });
  }

  function downloadBlob(bytes, filename, mime = 'application/zip') {
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
  }

  // ---------------- KEY BUTTON CREATION & LAYOUT ----------------
  // Portrait 4x5 order: 0..19
  // Landscape 5x4 order (matching place_obsw_buttons_landscape in duckypad_config.py):
  const LANDSCAPE_KEY_ORDER = [
    3,  7, 11, 15, 19,
    2,  6, 10, 14, 18,
    1,  5,  9, 13, 17,
    0,  4,  8, 12, 16,
  ];
  // Column 3 keys (0-indexed: 3, 7, 11, 15, 19) do not exist on 15-key OG duckyPad (2020)
  const DP20_UNUSED_INDICES = new Set([3, 7, 11, 15, 19]);

  const RE_LABELS = [
    { idx: 20, label: 'RE1 -->' },
    { idx: 21, label: 'RE1 <--' },
    { idx: 22, label: 'RE1   ↓' },
    { idx: 23, label: 'RE2 -->' },
    { idx: 24, label: 'RE2 <--' },
    { idx: 25, label: 'RE2   ↓' },
  ];

  const keyButtonsMap = new Map(); // keyIndex (0..67) -> HTMLButtonElement

  function makeKeyButtonTextFromTwoLines(line1, line2) {
    if (!line1) return '';
    const c1 = DuckObjs.clean_input(line1, DuckObjs.KEY_NAME_MAX_CHAR_PER_LINE, false);
    if (!line2 || line2.length === 0) return c1;
    const c2 = DuckObjs.clean_input(line2, DuckObjs.KEY_NAME_MAX_CHAR_PER_LINE, false);
    return `${c1}\n${c2}`;
  }

  function attachKeyDragAndClickEvents(btn, keyIndex) {
    btn.addEventListener('click', () => {
      selectKeyIndex(keyIndex);
    });

    btn.addEventListener('dragstart', e => {
      const pf = getCurrentProfile();
      if (!pf || !pf.keylist[keyIndex]) {
        e.preventDefault();
        return;
      }
      state.dragSourceKeyIndex = keyIndex;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(keyIndex));
    });

    btn.addEventListener('dragover', e => {
      if (state.dragSourceKeyIndex === null || state.dragSourceKeyIndex === keyIndex) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!btn.classList.contains('drag-over')) {
        btn.classList.add('drag-over');
        btn.dataset.savedText = btn.textContent;
        const isAux = DuckObjs.is_rotary_encoder_button(keyIndex) || DuckObjs.is_expansion_button(keyIndex);
        btn.textContent = isAux ? 'move' : 'move\nhere';
      }
    });

    btn.addEventListener('dragleave', () => {
      if (btn.classList.contains('drag-over')) {
        btn.classList.remove('drag-over');
        renderKeyButtons();
      }
    });

    btn.addEventListener('drop', e => {
      e.preventDefault();
      btn.classList.remove('drag-over');
      const srcIdx = state.dragSourceKeyIndex;
      state.dragSourceKeyIndex = null;
      if (srcIdx === null || srcIdx === keyIndex) return;
      const pf = getCurrentProfile();
      if (!pf) return;

      // Swap srcIdx and keyIndex matching button_drag_release in duckypad_config.py
      const temp = pf.keylist[keyIndex];
      pf.keylist[keyIndex] = pf.keylist[srcIdx];
      pf.keylist[srcIdx] = temp;
      pf.is_dirty = true;
      pf.is_config_dirty = true;
      if (pf.keylist[keyIndex]) pf.keylist[keyIndex].is_dirty = true;
      if (pf.keylist[srcIdx]) pf.keylist[srcIdx].is_dirty = true;
      updateKeylistIndices(pf);
      selectKeyIndex(keyIndex);
      renderAll();
    });

    btn.addEventListener('dragend', () => {
      state.dragSourceKeyIndex = null;
      renderKeyButtons();
    });
  }

  function buildInitialKeyDOM() {
    // 1. Onboard Switches (0..19)
    for (let i = 0; i < DuckObjs.MECH_OBSW_COUNT; i++) {
      const btn = document.createElement('div');
      btn.className = 'dp-key-btn';
      btn.dataset.keyIndex = String(i);
      attachKeyDragAndClickEvents(btn, i);
      keyButtonsMap.set(i, btn);
    }

    // 2. Rotary Encoders (20..25)
    el.reListContainer.innerHTML = '';
    for (const item of RE_LABELS) {
      const row = document.createElement('div');
      row.className = 'aux-row';
      const lbl = document.createElement('span');
      lbl.className = 'aux-label';
      lbl.textContent = item.label;
      const btn = document.createElement('div');
      btn.className = 'dp-key-btn aux-key-btn';
      btn.dataset.keyIndex = String(item.idx);
      attachKeyDragAndClickEvents(btn, item.idx);
      keyButtonsMap.set(item.idx, btn);
      row.appendChild(lbl);
      row.appendChild(btn);
      el.reListContainer.appendChild(row);
    }

    // 3. Expansion Channels (36..67)
    for (let i = DuckObjs.EXP_BUTTON_START; i < DuckObjs.EXP_BUTTON_START + DuckObjs.MAX_EXPANSION_CHANNEL; i++) {
      const btn = document.createElement('div');
      btn.className = 'dp-key-btn aux-key-btn';
      btn.dataset.keyIndex = String(i);
      attachKeyDragAndClickEvents(btn, i);
      keyButtonsMap.set(i, btn);
    }
  }

  function updateKeylistIndices(profile) {
    if (!profile) return;
    for (let i = 0; i < profile.keylist.length; i++) {
      if (profile.keylist[i] !== null) {
        profile.keylist[i].index = i;
      }
    }
  }

  function getCurrentProfile() {
    if (state.selectedProfileIndex < 0 || state.selectedProfileIndex >= state.profileList.length) {
      return null;
    }
    return state.profileList[state.selectedProfileIndex];
  }

  function getCurrentKey() {
    const pf = getCurrentProfile();
    if (!pf || state.selectedKeyIndex === null) return null;
    return pf.keylist[state.selectedKeyIndex] || null;
  }

  // ---------------- RENDER FUNCTIONS ----------------
  function renderAll() {
    const hasProfiles = state.profileList.length > 0;
    const pf = getCurrentProfile();

    // Dashboard controls
    el.statusLabel.textContent = state.connectionLabel;
    el.statusLabel.title = state.connectionLabel;
    el.modelSelect.value = String(state.deviceType);
    el.btnSave.disabled = !hasProfiles;
    el.btnExportSdZip.disabled = !hasProfiles;
    el.btnEditHeaders.disabled = false;

    const hasUserHeader = state.userHeaderLines.some(l => l.trim().length > 0);
    el.btnEditHeaders.classList.toggle('btn-success-text', hasUserHeader);

    // Rotary encoder tease vs active panel
    if (state.deviceType === DuckObjs.DP_MODEL_OG_DUCKYPAD) {
      el.reActiveContainer.classList.add('hidden');
      el.reTeaseContainer.classList.remove('hidden');
    } else {
      el.reActiveContainer.classList.remove('hidden');
      el.reTeaseContainer.classList.add('hidden');
    }

    // Profile buttons state
    const canEditProfiles = state.connectionType !== 'none' || hasProfiles;
    el.btnProfileNew.disabled = !canEditProfiles;
    el.btnProfileImport.disabled = !canEditProfiles;
    el.btnProfileRemove.disabled = !pf;
    el.btnProfileRename.disabled = !pf;
    el.btnProfileDupe.disabled = !pf;
    el.btnProfileUp.disabled = !pf || state.selectedProfileIndex <= 0;
    el.btnProfileDown.disabled = !pf || state.selectedProfileIndex >= state.profileList.length - 1;
    el.btnProfileExport.disabled = !hasProfiles;

    // Profile list items
    el.profileListbox.innerHTML = '';
    state.profileList.forEach((p, idx) => {
      const li = document.createElement('li');
      li.className = 'profile-item' + (idx === state.selectedProfileIndex ? ' active' : '');
      const dot = document.createElement('span');
      dot.className = 'profile-color-dot';
      dot.style.backgroundColor = DuckObjs.rgb_to_hex(p.bg_color);
      const txt = document.createElement('span');
      txt.textContent = `${idx + 1}. ${p.name}`;
      li.appendChild(dot);
      li.appendChild(txt);
      li.addEventListener('click', () => {
        if (state.selectedProfileIndex !== idx) {
          state.selectedProfileIndex = idx;
          state.selectedKeyIndex = null;
          state.currentExpansionModule = 0;
          renderAll();
        }
      });
      el.profileListbox.appendChild(li);
    });

    // Profile settings
    el.inputBgColor.disabled = !pf;
    el.chkKdColor.disabled = !pf;
    el.inputKdColor.disabled = !pf || !pf.kd_color;
    el.chkDimUnused.disabled = !pf;
    el.chkUpperHs.disabled = !pf;
    el.chkLowerHs.disabled = !pf;
    el.chkRotateKeys.disabled = !pf;

    if (pf) {
      el.inputBgColor.value = DuckObjs.rgb_to_hex(pf.bg_color);
      el.chkKdColor.checked = pf.kd_color !== null;
      el.inputKdColor.value = pf.kd_color ? DuckObjs.rgb_to_hex(pf.kd_color) : DuckObjs.rgb_to_hex(state.lastRgb);
      el.chkDimUnused.checked = Boolean(pf.dim_unused);
      el.chkUpperHs.checked = Boolean(pf.is_upper_re_halfstep);
      el.chkLowerHs.checked = Boolean(pf.is_lower_re_halfstep);
      el.chkRotateKeys.checked = Boolean(pf.is_landscape);
    } else {
      el.chkKdColor.checked = false;
      el.chkDimUnused.checked = false;
      el.chkUpperHs.checked = false;
      el.chkLowerHs.checked = false;
      el.chkRotateKeys.checked = false;
    }

    // Key name character limit hint
    if (state.deviceType === DuckObjs.DP_MODEL_OG_DUCKYPAD) {
      el.keyLimitLabel.textContent = 'Key Name:\n7 Letters/1 Line';
    } else if (pf && pf.is_landscape) {
      el.keyLimitLabel.textContent = 'Key Name:\n4 Letters/2 Lines';
    } else {
      el.keyLimitLabel.textContent = 'Key Name:\n5 Letters/2 Lines';
    }

    renderKeyButtons();
    renderExpansionPanel();
    renderKeyConfigAndScriptPanel();
  }

  function renderKeyButtons() {
    const pf = getCurrentProfile();
    const isLandscape = Boolean(pf && pf.is_landscape);

    // Arrange Onboard Switches in Portrait (4x5) or Landscape (5x4)
    el.obswGrid.className = 'obsw-grid ' + (isLandscape ? 'landscape' : 'portrait');
    el.obswGrid.innerHTML = '';
    const order = isLandscape ? LANDSCAPE_KEY_ORDER : Array.from({ length: 20 }, (_, i) => i);

    for (const keyIdx of order) {
      const btn = keyButtonsMap.get(keyIdx);
      el.obswGrid.appendChild(btn);
    }

    // Style all 68 key buttons
    for (const [keyIdx, btn] of keyButtonsMap.entries()) {
      const isSelected = state.selectedKeyIndex === keyIdx;
      btn.classList.toggle('selected', isSelected);

      const isDp20Disabled = state.deviceType === DuckObjs.DP_MODEL_OG_DUCKYPAD && DP20_UNUSED_INDICES.has(keyIdx);
      btn.classList.toggle('dp20-disabled', isDp20Disabled);

      if (!pf) {
        btn.style.backgroundColor = '';
        btn.style.color = '';
        btn.textContent = '';
        btn.draggable = false;
        continue;
      }

      const keyObj = pf.keylist[keyIdx];
      if (keyObj) {
        btn.draggable = true;
        const rgb = keyObj.color ? keyObj.color : pf.bg_color;
        btn.style.backgroundColor = DuckObjs.rgb_to_hex(rgb);
        btn.style.color = DuckObjs.adapt_color(rgb);

        let labelText = makeKeyButtonTextFromTwoLines(keyObj.name, keyObj.name_line2);
        if (DuckObjs.is_rotary_encoder_button(keyIdx)) {
          labelText = keyObj.name || '';
        }
        btn.textContent = labelText;
      } else {
        btn.draggable = false;
        btn.textContent = '';
        if (pf.dim_unused === false) {
          btn.style.backgroundColor = DuckObjs.rgb_to_hex(pf.bg_color);
          btn.style.color = DuckObjs.adapt_color(pf.bg_color);
        } else {
          btn.style.backgroundColor = '';
          btn.style.color = '';
        }
      }
    }
  }

  function renderExpansionPanel() {
    el.expModuleLabel.textContent = `Module ${state.currentExpansionModule + 1}`;
    el.expListContainer.innerHTML = '';
    const moduleStart = DuckObjs.EXP_BUTTON_START + state.currentExpansionModule * DuckObjs.CHANNELS_PER_EXPANSION_MODULE;

    for (let ch = 0; ch < DuckObjs.CHANNELS_PER_EXPANSION_MODULE; ch++) {
      const keyIdx = moduleStart + ch;
      const row = document.createElement('div');
      row.className = 'aux-row';
      const lbl = document.createElement('span');
      lbl.className = 'aux-label';
      lbl.textContent = `CH${ch + 1}`;
      const btn = keyButtonsMap.get(keyIdx);
      row.appendChild(lbl);
      row.appendChild(btn);
      el.expListContainer.appendChild(row);
    }
  }

  function selectKeyIndex(keyIndex) {
    if (!getCurrentProfile()) return;
    state.selectedKeyIndex = keyIndex;
    state.scriptEditMode = 0; // Reset to On Press just like key_button_click in duckypad_config.py
    el.radioOnPress.checked = true;
    el.radioOnRelease.checked = false;
    renderKeyButtons();
    renderKeyConfigAndScriptPanel(true);
  }

  function renderKeyConfigAndScriptPanel(updateTextareas = false) {
    const pf = getCurrentProfile();
    const hasSelectedSlot = Boolean(pf && state.selectedKeyIndex !== null);
    const keyObj = getCurrentKey();

    el.keyNameTextarea.disabled = !hasSelectedSlot;
    el.btnKeyRemove.disabled = !keyObj;
    el.chkCustomKeyColor.disabled = !keyObj;
    el.inputKeyColor.disabled = !keyObj || !keyObj.color;
    el.chkAllowAbort.disabled = !keyObj;
    el.chkDontRepeat.disabled = !keyObj;

    if (!hasSelectedSlot) {
      el.keyNameTextarea.value = '';
      el.chkCustomKeyColor.checked = false;
      el.chkAllowAbort.checked = false;
      el.chkDontRepeat.checked = false;
      el.scriptsActiveWrapper.classList.add('hidden');
      el.scriptsEmptyWrapper.classList.remove('hidden');
      el.btnCreateEmptyKey.classList.add('hidden');
      return;
    }

    if (!keyObj) {
      if (updateTextareas) {
        el.keyNameTextarea.value = '';
      }
      el.chkCustomKeyColor.checked = false;
      el.chkAllowAbort.checked = false;
      el.chkDontRepeat.checked = false;
      el.scriptsActiveWrapper.classList.add('hidden');
      el.scriptsEmptyWrapper.classList.remove('hidden');
      el.btnCreateEmptyKey.classList.remove('hidden');
      return;
    }

    // Active key exists
    el.scriptsActiveWrapper.classList.remove('hidden');
    el.scriptsEmptyWrapper.classList.add('hidden');

    if (updateTextareas) {
      el.keyNameTextarea.value = makeKeyButtonTextFromTwoLines(keyObj.name, keyObj.name_line2);
      const rawScript = state.scriptEditMode === 1 ? keyObj.script_on_release : keyObj.script;
      el.scriptTextarea.value = (rawScript || '').replace(/^[ \t]+/, '').replace(/[\r\n]+$/, '');
    }

    el.chkCustomKeyColor.checked = keyObj.color !== null;
    if (keyObj.color) {
      state.lastRgb = [...keyObj.color];
      el.inputKeyColor.value = DuckObjs.rgb_to_hex(keyObj.color);
    } else {
      el.inputKeyColor.value = DuckObjs.rgb_to_hex(pf.bg_color);
    }

    el.chkAllowAbort.checked = Boolean(keyObj.allow_abort);
    el.chkDontRepeat.checked = Boolean(keyObj.dont_repeat);

    const hasRelease = Boolean(keyObj.script_on_release && keyObj.script_on_release.trim().length > 0);
    el.labelOnRelease.classList.toggle('has-release-script', hasRelease);

    runLiveSyntaxCheck(true);
  }

  // ---------------- CODE EDITOR GUTTER & LIVE SYNTAX CHECK ----------------
  function renderEditorGutterAndBackdrop(textareaEl, gutterEl, backdropEl, errorLine1Idx = null) {
    const lines = textareaEl.value.split('\n');
    const lineCount = Math.max(1, lines.length);

    let gutterHtml = '';
    let backdropHtml = '';
    for (let i = 1; i <= lineCount; i++) {
      const isErr = errorLine1Idx === i;
      gutterHtml += `<div class="gutter-line${isErr ? ' error-gutter' : ''}">${i}</div>`;
      backdropHtml += `<div class="backdrop-line${isErr ? ' error-highlight' : ''}"> </div>`;
    }
    gutterEl.innerHTML = gutterHtml;
    backdropEl.innerHTML = backdropHtml;
    gutterEl.scrollTop = textareaEl.scrollTop;
    backdropEl.scrollTop = textareaEl.scrollTop;
  }

  let syntaxTimer = null;
  function scheduleSyntaxCheck() {
    if (syntaxTimer) clearTimeout(syntaxTimer);
    syntaxTimer = setTimeout(() => {
      runLiveSyntaxCheck(false);
    }, 300);
  }

  function runLiveSyntaxCheck(force = false) {
    const keyObj = getCurrentKey();
    if (!keyObj) return;

    const currentScript = state.scriptEditMode === 1 ? keyObj.script_on_release : keyObj.script;
    if (!force && currentScript === state.lastSyntaxListingStr) {
      return;
    }
    state.lastSyntaxListingStr = currentScript;

    const res = DSVM.compileScriptText(currentScript || '', {
      allowAbort: keyObj.allow_abort,
      dontRepeat: keyObj.dont_repeat,
      userHeaderLines: state.userHeaderLines,
      stdlibLines: state.stdlibLines,
    });
    state.lastCompiledResult = res;

    if (res.is_success) {
      el.syntaxStatusText.textContent = 'Code seems OK...';
      el.syntaxStatusText.className = 'syntax-ok';
      el.bytecodeSizeBadge.textContent = `${res.bin_array.length} / ${DSVM.MAX_BIN_SIZE} bytes`;
      renderEditorGutterAndBackdrop(el.scriptTextarea, el.lineNumbersGutter, el.editorBackdrop, null);
    } else {
      // Adjust error line number if allow_abort / dont_repeat prepended lines
      let extraPrefixLines = 0;
      if (keyObj.allow_abort) extraPrefixLines += 1;
      if (keyObj.dont_repeat) extraPrefixLines += 1;

      let errLine = res.error_line_number_starting_from_1;
      let errText = res.error_comment;
      if (errLine < 0) {
        errText = `Errors in USE_UH — Click "Edit Headers" Button.`;
        errLine = null;
      } else if (errLine > 0) {
        errLine = Math.max(1, errLine - extraPrefixLines);
        errText = `Line ${errLine}: ${res.error_comment}`;
      }
      el.syntaxStatusText.textContent = errText;
      el.syntaxStatusText.className = 'syntax-err';
      el.bytecodeSizeBadge.textContent = 'Compile Error';
      renderEditorGutterAndBackdrop(el.scriptTextarea, el.lineNumbersGutter, el.editorBackdrop, errLine);
    }
  }

  // ---------------- PROFILE OPERATIONS ----------------
  async function handleProfileNew() {
    if (state.profileList.length >= DuckObjs.MAX_PROFILE_COUNT) {
      showToast(`Maximum ${DuckObjs.MAX_PROFILE_COUNT} profiles reached`, 'warn');
      return;
    }
    const rawName = await askStringModal('New Profile', 'New profile name?');
    if (rawName === null) return;
    const answer = DuckObjs.clean_input(rawName, DuckObjs.MAX_PROFILE_NAME_LEN);
    if (!answer) return;

    const newPf = new DuckObjs.dp_profile();
    newPf.name = answer;
    newPf.is_dirty = true;
    newPf.is_config_dirty = true;
    state.isProfileOrderDirty = true;
    const insertIdx = state.selectedProfileIndex >= 0 ? state.selectedProfileIndex + 1 : state.profileList.length;
    state.profileList.splice(insertIdx, 0, newPf);
    state.selectedProfileIndex = insertIdx;
    state.selectedKeyIndex = null;
    if (state.connectionType === 'none') {
      state.connectionType = 'demo';
      state.connectionLabel = 'Browser Workspace';
    }
    renderAll();
  }

  function handleProfileRemove() {
    if (state.selectedProfileIndex < 0 || state.selectedProfileIndex >= state.profileList.length) return;
    const removed = state.profileList[state.selectedProfileIndex];
    if (removed) {
      if (removed.orig_folder_name) state.deletedProfileFolders.add(removed.orig_folder_name);
      if (removed.name) state.deletedProfileFolders.add(`profile_${removed.name}`);
    }
    state.profileList.splice(state.selectedProfileIndex, 1);
    state.isProfileOrderDirty = true;
    if (state.selectedProfileIndex >= state.profileList.length) {
      state.selectedProfileIndex = state.profileList.length - 1;
    }
    state.selectedKeyIndex = null;
    renderAll();
  }

  async function handleProfileDupe() {
    const pf = getCurrentProfile();
    if (!pf) return;
    const rawName = await askStringModal('Duplicate Profile', 'New profile name?', pf.name + '_copy');
    if (rawName === null) return;
    const answer = DuckObjs.clean_input(rawName, DuckObjs.MAX_PROFILE_NAME_LEN);
    if (!answer) return;

    const copyPf = pf.clone();
    copyPf.name = answer;
    copyPf.is_dirty = true;
    copyPf.is_config_dirty = true;
    copyPf.orig_folder_name = null;
    state.isProfileOrderDirty = true;
    const insertIdx = state.selectedProfileIndex + 1;
    state.profileList.splice(insertIdx, 0, copyPf);
    state.selectedProfileIndex = insertIdx;
    state.selectedKeyIndex = null;
    renderAll();
  }

  async function handleProfileRename() {
    const pf = getCurrentProfile();
    if (!pf) return;
    const rawName = await askStringModal('Rename Profile', 'New name?', pf.name);
    if (rawName === null) return;
    const answer = DuckObjs.clean_input(rawName, DuckObjs.MAX_PROFILE_NAME_LEN);
    if (!answer || state.profileList.some((p, i) => i !== state.selectedProfileIndex && p.name === answer)) {
      return;
    }
    if (pf.orig_folder_name && pf.orig_folder_name !== `profile_${answer}`) {
      state.deletedProfileFolders.add(pf.orig_folder_name);
    }
    if (pf.name && `profile_${pf.name}` !== `profile_${answer}`) {
      state.deletedProfileFolders.add(`profile_${pf.name}`);
    }
    pf.name = answer;
    pf.is_dirty = true;
    state.isProfileOrderDirty = true;
    renderAll();
  }

  function handleProfileShift(delta) {
    const src = state.selectedProfileIndex;
    const dst = src + delta;
    if (src < 0 || dst < 0 || dst >= state.profileList.length) return;
    const tmp = state.profileList[dst];
    state.profileList[dst] = state.profileList[src];
    state.profileList[src] = tmp;
    state.selectedProfileIndex = dst;
    state.isProfileOrderDirty = true;
    renderAll();
  }

  // ---------------- IMPORT / EXPORT PROFILES (.zip) ----------------
  async function handleProfileImportFile(file) {
    if (!file) return;
    try {
      const entries = await ZipMD5.readZip(await file.arrayBuffer());
      const fileMap = new Map();
      let profileFolder = null;

      for (const entry of entries) {
        const parts = entry.path.split('/');
        // Find folder starting with "profile"
        const pfIdx = parts.findIndex(p => p.toLowerCase().startsWith('profile'));
        if (pfIdx !== -1 && pfIdx < parts.length - 1) {
          profileFolder = parts[pfIdx];
          const rel = `${profileFolder}/${parts.slice(pfIdx + 1).join('/')}`;
          fileMap.set(rel, entry.data);
        }
      }

      if (!profileFolder) {
        throw new Error('Profile folder (profile_*) not found inside ZIP archive');
      }

      const pf = new DuckObjs.dp_profile();
      pf.load_from_virtual_folder(profileFolder, fileMap);
      if (!pf.name) {
        throw new Error('Invalid Profile');
      }
      pf.orig_folder_name = null;
      pf.is_dirty = true;
      pf.is_config_dirty = true;
      state.isProfileOrderDirty = true;
      state.profileList.push(pf);
      state.selectedProfileIndex = state.profileList.length - 1;
      state.selectedKeyIndex = null;
      renderAll();
      showToast(`Imported profile "${pf.name}"`, 'success');
    } catch (e) {
      showToast(`Import Failed: ${e.message || e}`, 'error');
    }
  }

  function openExportProfilesModal() {
    if (state.profileList.length === 0) return;
    el.exportProfilesChecklist.innerHTML = '';
    state.profileList.forEach((pf, idx) => {
      const label = document.createElement('label');
      label.className = 'checkbox-label';
      label.style.padding = '5px 8px';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.value = String(idx);
      if (idx === state.selectedProfileIndex) chk.checked = true;
      label.appendChild(chk);
      label.appendChild(document.createTextNode(` ${idx + 1}. ${pf.name}`));
      el.exportProfilesChecklist.appendChild(label);
    });
    el.modalExportProfiles.classList.remove('hidden');
  }

  function confirmExportSelectedProfiles() {
    const checkboxes = el.exportProfilesChecklist.querySelectorAll('input[type="checkbox"]:checked');
    const selectedIndices = Array.from(checkboxes).map(c => parseInt(c.value, 10));
    if (selectedIndices.length === 0) {
      showToast('Select at least one profile to export', 'warn');
      return;
    }

    // Compile using duckyPad Pro format just like export_profile_click in duckypad_config.py
    const buildRes = DuckObjs.compileAndBuildFileSystem(
      state.profileList,
      state.userHeaderLines,
      state.stdlibLines,
      DuckObjs.DP_MODEL_DUCKYPAD_PRO,
      {
        preserveUnchanged: true,
        isUserHeaderDirty: state.isUserHeaderDirty,
        isProfileOrderDirty: state.isProfileOrderDirty,
        isDeviceTypeChanged: state.deviceType !== DuckObjs.DP_MODEL_DUCKYPAD_PRO,
        originalFilesMap: state.originalFilesMap,
      }
    );
    if (!buildRes.ok) {
      showToast(buildRes.error, 'error', 6000);
      return;
    }

    for (const idx of selectedIndices) {
      const pf = state.profileList[idx];
      if (!pf) continue;
      const prefix = `profile_${pf.name}/`;
      const pfFiles = [];
      for (const [path, data] of buildRes.filesMap.entries()) {
        if (path.startsWith(prefix)) {
          pfFiles.push({ path, data });
        }
      }
      const zipBytes = ZipMD5.createZip(pfFiles);
      downloadBlob(zipBytes, `duckyPad_Profile_${pf.name}.zip`);
    }

    el.modalExportProfiles.classList.add('hidden');
    showToast(`Exported ${selectedIndices.length} profile(s)!`, 'success');
  }

  // ---------------- CONNECT / LOAD WORKFLOWS ----------------
  async function loadFromVirtualFilesMap(filesMap, sourceLabel, connType, knownIsDp24 = null) {
    const parsed = DuckObjs.parseVirtualFileSystem(filesMap);
    let isDirForDp24 = knownIsDp24;

    if (isDirForDp24 === null) {
      if (parsed.detectedIsDp24 !== null) {
        isDirForDp24 = parsed.detectedIsDp24;
      } else {
        isDirForDp24 = await askYesNoModal(
          'Select Backup Source Model',
          'Which duckyPad model was this folder/backup made from?\n\nClick "duckyPad Pro (2024)" or "OG duckyPad (2020)".',
          'duckyPad Pro (2024)',
          'OG duckyPad (2020)'
        );
      }
    }

    let convertedModel = false;
    if (!isDirForDp24) {
      DuckObjs.convert_key_order_dp20_to_dp24(parsed.profiles);
      if (knownIsDp24 === null) {
        const useOnPro = await askYesNoModal(
          'Target duckyPad Model',
          'Which duckyPad are you planning to use this configuration on?',
          'duckyPad Pro (2024)',
          'OG duckyPad (2020)'
        );
        state.deviceType = useOnPro ? DuckObjs.DP_MODEL_DUCKYPAD_PRO : DuckObjs.DP_MODEL_OG_DUCKYPAD;
        convertedModel = useOnPro;
      } else {
        state.deviceType = DuckObjs.DP_MODEL_OG_DUCKYPAD;
      }
    } else {
      state.deviceType = DuckObjs.DP_MODEL_DUCKYPAD_PRO;
    }

    state.loadedDeviceType = state.deviceType;
    state.isDeviceTypeChanged = convertedModel;
    state.isUserHeaderDirty = false;
    state.isProfileOrderDirty = false;
    state.deletedProfileFolders = new Set();

    state.profileList = parsed.profiles;
    state.userHeaderLines = parsed.userHeaderLines;
    state.selectedProfileIndex = state.profileList.length > 0 ? 0 : -1;
    state.selectedKeyIndex = null;
    state.currentExpansionModule = 0;
    state.connectionType = connType;
    state.connectionLabel = sourceLabel;
    state.originalFilesMap = parsed.normalizedBytesMap || filesMap;

    el.modalConnect.classList.add('hidden');
    renderAll();
    showToast(`Loaded ${state.profileList.length} profile(s) from ${sourceLabel}`, 'success');
  }

  async function handleConnectWebHid() {
    try {
      const dpList = await HidFS.requestAndScanDuckypads();
      if (!dpList || dpList.length === 0) {
        showToast('No duckyPad found via WebHID. Ensure plugged into upper USB port and not in Bluetooth mode.', 'warn', 5000);
        return;
      }
      if (dpList.length === 1) {
        await connectSelectedHidDevice(dpList[0]);
      } else {
        // Show picker inside modal
        el.webHidDeviceList.innerHTML = '';
        for (const info of dpList) {
          const modelStr = info.dp_model === DuckObjs.DP_MODEL_DUCKYPAD_PRO ? 'duckyPad Pro' : 'duckyPad (2020)';
          const btn = document.createElement('button');
          btn.style.justifyContent = 'space-between';
          btn.style.width = '100%';
          btn.textContent = `${modelStr} — Serial: ${info.serial} — FW: v${info.fw_version}`;
          btn.onclick = () => connectSelectedHidDevice(info);
          el.webHidDeviceList.appendChild(btn);
        }
        el.webHidDevicePickerBox.classList.remove('hidden');
      }
    } catch (e) {
      showToast(String(e.message || e), 'error', 5000);
    }
  }

  async function connectSelectedHidDevice(dpInfo) {
    state.hidInfo = dpInfo;
    checkFirmwareUpdateStatus(dpInfo);

    try {
      await HidFS.syncRtcHid(dpInfo.device);
    } catch (e) {
      console.warn('RTC sync error:', e);
    }

    if (dpInfo.dp_model === DuckObjs.DP_MODEL_OG_DUCKYPAD) {
      state.deviceType = DuckObjs.DP_MODEL_OG_DUCKYPAD;
      el.modalConnect.classList.add('hidden');
      showToast('Dumping SD card over WebHID...', 'info');
      try {
        const filesMap = await HidFS.dumpSdOverHid(dpInfo.device, msg => {
          el.statusLabel.textContent = msg;
        });
        await loadFromVirtualFilesMap(filesMap, `USB HID: duckyPad (${dpInfo.serial})`, 'webhid_dp20', false);
      } catch (e) {
        showToast(`HID Read Error: ${e.message || e}`, 'error');
      }
    } else {
      state.deviceType = DuckObjs.DP_MODEL_DUCKYPAD_PRO;
      const rebootMsc = await askYesNoModal(
        'duckyPad Pro Detected',
        `Connected to duckyPad Pro (Serial ${dpInfo.serial}, FW ${dpInfo.fw_version}).\n\nMount duckyPad Pro as a USB drive (${dpInfo.diskLabel}) and select its folder?`,
        'Mount & Select Drive',
        'Cancel'
      );
      if (!rebootMsc) return;
      await HidFS.swResetHid(dpInfo.device, true);
      showToast(`Switched duckyPad Pro to USB Drive mode (${dpInfo.diskLabel}). Select the mounted drive folder once it appears.`, 'info', 6000);
      await handleOpenFolder(true);
    }
  }

  async function handleOpenFolder(knownIsDp24 = null) {
    if (typeof window.showDirectoryPicker === 'function') {
      try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        state.dirHandle = dirHandle;
        const filesMap = await HidFS.readDirectoryHandle(dirHandle);
        await loadFromVirtualFilesMap(filesMap, `Folder: ${dirHandle.name}`, 'folder_handle', knownIsDp24);
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        console.warn('showDirectoryPicker failed, falling back to input:', e);
      }
    }
    // Fallback for Firefox / Safari
    el.hiddenDirInput.value = '';
    el.hiddenDirInput.click();
  }

  // ---------------- SAVE & BACKUP WORKFLOW ----------------
  function makeBackupName() {
    const prefix = state.deviceType === DuckObjs.DP_MODEL_DUCKYPAD_PRO ? 'duckyPad_Pro_backup_' : 'duckyPad_backup_';
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    return prefix + ts;
  }

  function markSaveCommitted(savedFilesMap) {
    DuckObjs.commitSavedState(state.profileList, savedFilesMap, state.deviceType);
    state.originalFilesMap = new Map(savedFilesMap);
    state.loadedDeviceType = state.deviceType;
    state.isDeviceTypeChanged = false;
    state.isUserHeaderDirty = false;
    state.isProfileOrderDirty = false;
    state.deletedProfileFolders.clear();
  }

  async function handleSaveClick() {
    const buildRes = DuckObjs.compileAndBuildFileSystem(
      state.profileList,
      state.userHeaderLines,
      state.stdlibLines,
      state.deviceType,
      {
        preserveUnchanged: true,
        isUserHeaderDirty: state.isUserHeaderDirty,
        isProfileOrderDirty: state.isProfileOrderDirty,
        isDeviceTypeChanged: state.isDeviceTypeChanged,
        originalFilesMap: state.originalFilesMap,
      }
    );
    if (!buildRes.ok) {
      showToast(buildRes.error, 'error', 6500);
      return;
    }

    const backupName = makeBackupName();
    await HidFS.BackupStore.saveBackup(backupName, state.deviceType, buildRes.filesMap);
    const syncOptions = { deletedDirs: state.deletedProfileFolders };

    try {
      if (state.connectionType === 'webhid_dp20' && state.hidInfo && state.hidInfo.device) {
        const count = await HidFS.syncFilesOverHid(
          state.hidInfo.device,
          state.originalFilesMap,
          buildRes.filesMap,
          msg => {
            el.statusLabel.textContent = msg;
          },
          syncOptions
        );
        await HidFS.swResetHid(state.hidInfo.device, false);
        markSaveCommitted(buildRes.filesMap);
        el.statusLabel.textContent = `Saved (${count} file ops) to duckyPad & Rebooted!`;
        showToast('Changes synced to duckyPad over WebHID and backup saved!', 'success');
      } else if (state.connectionType === 'folder_handle' && state.dirHandle) {
        const count = await HidFS.syncToDirectoryHandle(
          state.dirHandle,
          state.originalFilesMap,
          buildRes.filesMap,
          msg => {
            el.statusLabel.textContent = msg;
          },
          syncOptions
        );
        markSaveCommitted(buildRes.filesMap);
        if (state.hidInfo && state.hidInfo.device) {
          await HidFS.swResetHid(state.hidInfo.device, false);
        }
        el.statusLabel.textContent = `Saved (${count} file ops) to ${state.dirHandle.name}`;
        showToast(`Saved (${count} changed file ops) to folder "${state.dirHandle.name}" & stored backup!`, 'success');
      } else {
        // Browser / Firefox / ZIP mode: download complete SD card ZIP archive
        exportFullSdCardZip(buildRes.filesMap, `${backupName}.zip`);
        markSaveCommitted(buildRes.filesMap);
        el.statusLabel.textContent = `Saved & Downloaded ${backupName}.zip`;
        showToast('Saved browser backup and downloaded SD card ZIP!', 'success');
      }
    } catch (e) {
      showToast(`Save error: ${e.message || e}`, 'error', 6000);
    }
  }

  function exportFullSdCardZip(filesMap = null, filename = null) {
    if (!filesMap) {
      const buildRes = DuckObjs.compileAndBuildFileSystem(
        state.profileList,
        state.userHeaderLines,
        state.stdlibLines,
        state.deviceType,
        {
          preserveUnchanged: true,
          isUserHeaderDirty: state.isUserHeaderDirty,
          isProfileOrderDirty: state.isProfileOrderDirty,
          isDeviceTypeChanged: state.isDeviceTypeChanged,
          originalFilesMap: state.originalFilesMap,
        }
      );
      if (!buildRes.ok) {
        showToast(buildRes.error, 'error', 6500);
        return;
      }
      filesMap = buildRes.filesMap;
    }
    const zipEntries = [];
    for (const [path, data] of filesMap.entries()) {
      zipEntries.push({ path, data });
    }
    const zipBytes = ZipMD5.createZip(zipEntries);
    downloadBlob(zipBytes, filename || `${makeBackupName()}.zip`);
  }

  // ---------------- BACKUPS MODAL ----------------
  async function openBackupsModal() {
    const backups = await HidFS.BackupStore.listBackups();
    el.backupsListContainer.innerHTML = '';

    if (backups.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'hint-text';
      empty.textContent = 'No browser backups saved yet. Clicking "Save" automatically creates a timestamped backup here.';
      el.backupsListContainer.appendChild(empty);
    } else {
      for (const b of backups) {
        const row = document.createElement('div');
        row.className = 'backup-list-item';

        const infoDiv = document.createElement('div');
        const title = document.createElement('div');
        title.style.fontWeight = '600';
        title.textContent = b.name;
        const sub = document.createElement('div');
        sub.className = 'hint-text';
        const fileCount = b.files ? Object.keys(b.files).length : 0;
        const modelLabel = b.deviceType === DuckObjs.DP_MODEL_OG_DUCKYPAD ? 'OG duckyPad (2020)' : 'duckyPad Pro (2024)';
        sub.textContent = `${new Date(b.timestamp).toLocaleString()} • ${modelLabel} • ${fileCount} files`;
        infoDiv.appendChild(title);
        infoDiv.appendChild(sub);

        const actionsDiv = document.createElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '6px';

        const btnRestore = document.createElement('button');
        btnRestore.className = 'btn-primary';
        btnRestore.textContent = 'Load in Editor';
        btnRestore.onclick = async () => {
          const map = new Map(Object.entries(b.files));
          await loadFromVirtualFilesMap(
            map,
            `Backup: ${b.name}`,
            'zip',
            b.deviceType !== DuckObjs.DP_MODEL_OG_DUCKYPAD
          );
          el.modalBackups.classList.add('hidden');
        };

        const btnZip = document.createElement('button');
        btnZip.textContent = 'Download .zip';
        btnZip.onclick = () => {
          const entries = Object.entries(b.files).map(([path, data]) => ({
            path,
            data: data instanceof Uint8Array ? data : new Uint8Array(data),
          }));
          downloadBlob(ZipMD5.createZip(entries), `${b.name}.zip`);
        };

        const btnDel = document.createElement('button');
        btnDel.className = 'btn-danger';
        btnDel.textContent = '✕';
        btnDel.onclick = async () => {
          await HidFS.BackupStore.deleteBackup(b.name);
          openBackupsModal();
        };

        actionsDiv.appendChild(btnRestore);
        actionsDiv.appendChild(btnZip);
        actionsDiv.appendChild(btnDel);

        row.appendChild(infoDiv);
        row.appendChild(actionsDiv);
        el.backupsListContainer.appendChild(row);
      }
    }

    el.modalBackups.classList.remove('hidden');
  }

  // ---------------- HEADERS & STDLIB MODAL ----------------
  let headerSyntaxTimer = null;

  function openHeadersModal() {
    el.headerTextarea.value = state.userHeaderLines.join('\n');
    el.stdlibPreviewBox.textContent = state.stdlibLines.join('\n');
    checkUserHeaderSyntax();
    el.modalHeaders.classList.remove('hidden');
    setTimeout(() => el.headerTextarea.focus(), 20);
  }

  function checkUserHeaderSyntax() {
    const raw = el.headerTextarea.value.replace(/\r/g, '');
    state.userHeaderLines = raw.length > 0 ? raw.split('\n') : [];

    const res = DSVM.checkSyntaxText(raw, {
      removeUnusedFunc: false,
      sourceFn: DuckObjs.user_header_source_tag_NO_SPACE,
    });

    if (res.is_success) {
      el.headerSyntaxStatus.textContent = 'Code seems OK...';
      el.headerSyntaxStatus.className = 'syntax-ok';
      renderEditorGutterAndBackdrop(el.headerTextarea, el.headerLineGutter, el.headerBackdrop, null);
    } else {
      const lineNo = Math.abs(res.error_line_number_starting_from_1 || 1);
      el.headerSyntaxStatus.textContent = `Line ${lineNo}: ${res.error_comment}`;
      el.headerSyntaxStatus.className = 'syntax-err';
      renderEditorGutterAndBackdrop(el.headerTextarea, el.headerLineGutter, el.headerBackdrop, lineNo);
    }
  }

  async function fetchLatestStdlib(silent = false) {
    try {
      const resp = await fetch(DuckObjs.stdlib_url, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      state.stdlibLines = text.replace(/\r/g, '').split('\n');
      await HidFS.BackupStore.setKv('stdlib_text', text);
      await HidFS.BackupStore.setKv('stdlib_timestamp', Date.now());
      el.stdlibPreviewBox.textContent = state.stdlibLines.join('\n');
      if (!silent) {
        showToast('Fetched latest duckyPad Standard Library from GitHub!', 'success');
      }
      runLiveSyntaxCheck(true);
    } catch (e) {
      if (!silent) {
        showToast('Could not fetch remote StdLib (offline or blocked); using built-in Standard Library.', 'warn');
      }
    }
  }

  // ---------------- BYTECODE INSPECTOR MODAL ----------------
  function openBytecodeModal() {
    const keyObj = getCurrentKey();
    if (!keyObj) return;
    const currentScript = state.scriptEditMode === 1 ? keyObj.script_on_release : keyObj.script;
    const res = DSVM.compileScriptText(currentScript || '', {
      allowAbort: keyObj.allow_abort,
      dontRepeat: keyObj.dont_repeat,
      userHeaderLines: state.userHeaderLines,
      stdlibLines: state.stdlibLines,
    });

    if (!res.is_success) {
      showToast(`Cannot inspect bytecode while script has syntax error: ${res.error_comment}`, 'error');
      return;
    }

    const asmLines = [];
    if (res.assembly) {
      for (const inst of res.assembly) {
        if (inst.label) {
          asmLines.push(`~~~~${inst.label}:`);
        }
        const addrStr = String(inst.addr ?? '').padEnd(6, ' ');
        const opStr = inst.opcode.name.padEnd(11, ' ');
        let payloadStr = '';
        if (inst.payload !== null && inst.payload !== undefined) {
          const val32 = (Number(inst.payload) >>> 0).toString(16);
          payloadStr = `${String(inst.payload).padEnd(10, ' ')} (0x${val32})`.padEnd(24, ' ');
        } else {
          payloadStr = ''.padEnd(24, ' ');
        }
        const commentStr = inst.comment ? `; ${inst.comment.trim()}` : '';
        asmLines.push(`${addrStr}${opStr}${payloadStr}${commentStr}`);
      }
    }
    el.bytecodeAsmPre.textContent = asmLines.join('\n') || '(No instructions)';

    // Format hex dump
    const hexParts = [];
    for (let i = 0; i < res.bin_array.length; i++) {
      hexParts.push(res.bin_array[i].toString(16).padStart(2, '0'));
    }
    el.bytecodeHexPre.textContent = `Total Size: ${res.bin_array.length} bytes (Max ${DSVM.MAX_BIN_SIZE})\n\n` + hexParts.join(' ');
    el.modalBytecode.classList.remove('hidden');
  }

  // ---------------- UPDATE CHECKS (check_update.py) ----------------
  function versionTuple(v) {
    return String(v).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  }

  function isVersionGreater(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const av = a[i] || 0;
      const bv = b[i] || 0;
      if (av > bv) return true;
      if (av < bv) return false;
    }
    return false;
  }

  async function checkAppUpdateStatus() {
    try {
      const resp = await fetch('https://api.github.com/repos/duckyPad/duckyPad-Configurator/releases/latest');
      if (!resp.ok) throw new Error('status');
      const data = await resp.json();
      if (data && data.tag_name) {
        const remote = versionTuple(data.tag_name);
        const local = versionTuple(DuckObjs.THIS_VERSION_NUMBER);
        if (isVersionGreater(remote, local)) {
          el.appUpdateBadge.textContent = `Web App (v${DuckObjs.THIS_VERSION_NUMBER}): Upstream ${data.tag_name} available!`;
          el.appUpdateBadge.classList.add('has-update');
          el.appUpdateBadge.onclick = () => window.open('https://github.com/duckyPad/duckyPad-Configurator/releases/latest', '_blank');
        } else {
          el.appUpdateBadge.textContent = `Web App (v${DuckObjs.THIS_VERSION_NUMBER}): Up to date`;
        }
      }
    } catch (_) {
      el.appUpdateBadge.textContent = `Web App (v${DuckObjs.THIS_VERSION_NUMBER}): Offline Ready`;
    }
  }

  async function checkFirmwareUpdateStatus(dpInfo) {
    if (!dpInfo || !dpInfo.fw_version) return;
    const isPro = dpInfo.dp_model === DuckObjs.DP_MODEL_DUCKYPAD_PRO;
    const url = isPro
      ? 'https://api.github.com/repos/dekuNukem/duckyPad-Pro/contents/firmware?ref=master'
      : 'https://api.github.com/repos/dekuNukem/duckyPad/contents/firmware?ref=master';

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('status');
      const fileList = await resp.json();
      const versions = [];
      for (const item of fileList) {
        if (!item.name || item.type !== 'file') continue;
        if (isPro && item.name.startsWith('DPP_FW_') && item.name.endsWith('.bin')) {
          versions.push(item.name.replace('DPP_FW_', '').replace('.bin', '').split('_')[0]);
        } else if (!isPro && item.name.startsWith('duckypad_v') && item.name.endsWith('.dfu')) {
          versions.push(item.name.replace('duckypad_v', '').replace('.dfu', ''));
        }
      }
      versions.sort((a, b) => (isVersionGreater(versionTuple(a), versionTuple(b)) ? 1 : -1));
      if (versions.length > 0) {
        const latest = versions[versions.length - 1];
        if (isVersionGreater(versionTuple(latest), versionTuple(dpInfo.fw_version))) {
          el.fwUpdateBadge.textContent = `Firmware (${dpInfo.fw_version}): Update (${latest}) available! Click me!`;
          el.fwUpdateBadge.classList.add('has-update');
          el.fwUpdateBadge.onclick = () => {
            const docUrl = isPro
              ? 'https://dekunukem.github.io/duckyPad-Pro/doc/fw_update.html'
              : 'https://dekunukem.github.io/duckyPad/firmware_updates_and_version_history.html';
            window.open(docUrl, '_blank');
          };
          return;
        }
      }
      el.fwUpdateBadge.textContent = `Firmware (${dpInfo.fw_version}): Up to date`;
      el.fwUpdateBadge.classList.remove('has-update');
    } catch (_) {
      el.fwUpdateBadge.textContent = `Firmware (${dpInfo.fw_version})`;
    }
  }

  // ---------------- THEME MANAGEMENT ----------------
  function initTheme() {
    let saved = null;
    try {
      saved = localStorage.getItem('dp_web_theme');
    } catch (_) {}
    const theme = saved || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('dp_web_theme', next);
    } catch (_) {}
  }

  // ---------------- EVENT LISTENERS BINDING ----------------
  function bindEvents() {
    // Dashboard
    el.btnConnect.addEventListener('click', () => {
      el.webHidDevicePickerBox.classList.add('hidden');
      el.modalConnect.classList.remove('hidden');
    });
    el.btnCloseConnectModal.addEventListener('click', () => el.modalConnect.classList.add('hidden'));
    el.btnModalWebHid.addEventListener('click', handleConnectWebHid);
    el.btnModalOpenFolder.addEventListener('click', () => handleOpenFolder());
    el.btnModalLoadZip.addEventListener('click', () => {
      el.hiddenZipInput.value = '';
      el.hiddenZipInput.click();
    });
    el.btnModalLoadDemo.addEventListener('click', () => {
      state.profileList = DuckObjs.createSampleProfiles();
      state.selectedProfileIndex = 0;
      state.selectedKeyIndex = 0;
      state.connectionType = 'demo';
      state.connectionLabel = 'Demo Workspace (Sample Profiles)';
      state.originalFilesMap = new Map();
      state.deletedProfileDirs = new Set();
      state.isUserHeaderDirty = false;
      state.isProfileOrderDirty = false;
      state.isDeviceTypeChanged = false;
      el.modalConnect.classList.add('hidden');
      renderAll();
      renderKeyConfigAndScriptPanel(true);
      showToast('Loaded Sample Profiles! Click any key to inspect or edit its DuckyScript.', 'success');
    });

    el.modelSelect.addEventListener('change', () => {
      state.deviceType = parseInt(el.modelSelect.value, 10);
      state.isDeviceTypeChanged = (state.deviceType !== state.loadedDeviceType);
      renderAll();
    });

    el.btnSave.addEventListener('click', handleSaveClick);
    el.btnExportSdZip.addEventListener('click', () => exportFullSdCardZip());
    el.btnBackups.addEventListener('click', openBackupsModal);
    el.btnCloseBackupsModal.addEventListener('click', () => el.modalBackups.classList.add('hidden'));
    el.btnThemeToggle.addEventListener('click', toggleTheme);

    // Hidden file inputs
    el.hiddenDirInput.addEventListener('change', async e => {
      if (!e.target.files || e.target.files.length === 0) return;
      const filesMap = await HidFS.readFileListFromInput(e.target.files);
      const firstPath = e.target.files[0].webkitRelativePath || 'Selected Folder';
      const rootFolder = firstPath.split('/')[0] || 'Selected Folder';
      await loadFromVirtualFilesMap(filesMap, `Folder: ${rootFolder}`, 'folder_input');
    });

    el.hiddenZipInput.addEventListener('change', async e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const entries = await ZipMD5.readZip(await file.arrayBuffer());
        const filesMap = new Map();
        for (const entry of entries) {
          filesMap.set(entry.path, entry.data);
        }
        await loadFromVirtualFilesMap(filesMap, `ZIP: ${file.name}`, 'zip');
      } catch (err) {
        showToast(`Failed to read ZIP: ${err.message || err}`, 'error');
      }
    });

    el.hiddenProfileZipInput.addEventListener('change', async e => {
      const file = e.target.files && e.target.files[0];
      if (file) await handleProfileImportFile(file);
    });

    // Profile buttons
    el.btnProfileNew.addEventListener('click', handleProfileNew);
    el.btnProfileRemove.addEventListener('click', handleProfileRemove);
    el.btnProfileDupe.addEventListener('click', handleProfileDupe);
    el.btnProfileRename.addEventListener('click', handleProfileRename);
    el.btnProfileUp.addEventListener('click', () => handleProfileShift(-1));
    el.btnProfileDown.addEventListener('click', () => handleProfileShift(1));
    el.btnProfileImport.addEventListener('click', () => {
      el.hiddenProfileZipInput.value = '';
      el.hiddenProfileZipInput.click();
    });
    el.btnProfileExport.addEventListener('click', openExportProfilesModal);
    el.btnCloseExportModal.addEventListener('click', () => el.modalExportProfiles.classList.add('hidden'));
    el.btnSelectAllProfiles.addEventListener('click', () => {
      const chks = el.exportProfilesChecklist.querySelectorAll('input[type="checkbox"]');
      const allChecked = Array.from(chks).every(c => c.checked);
      chks.forEach(c => { c.checked = !allChecked; });
    });
    el.btnConfirmExportProfiles.addEventListener('click', confirmExportSelectedProfiles);

    // Profile settings
    el.inputBgColor.addEventListener('input', () => {
      const pf = getCurrentProfile();
      if (!pf) return;
      const rgb = DuckObjs.hex_to_rgb(el.inputBgColor.value);
      state.lastRgb = rgb;
      pf.bg_color = rgb;
      pf.is_dirty = true;
      pf.is_config_dirty = true;
      renderAll();
    });

    el.chkKdColor.addEventListener('change', () => {
      const pf = getCurrentProfile();
      if (!pf) return;
      pf.kd_color = el.chkKdColor.checked ? [...state.lastRgb] : null;
      pf.is_dirty = true;
      pf.is_config_dirty = true;
      renderAll();
    });

    el.inputKdColor.addEventListener('input', () => {
      const pf = getCurrentProfile();
      if (!pf || !pf.kd_color) return;
      const rgb = DuckObjs.hex_to_rgb(el.inputKdColor.value);
      state.lastRgb = rgb;
      pf.kd_color = rgb;
      pf.is_dirty = true;
      pf.is_config_dirty = true;
      renderAll();
    });

    el.chkDimUnused.addEventListener('change', () => {
      const pf = getCurrentProfile();
      if (!pf) return;
      pf.dim_unused = el.chkDimUnused.checked;
      pf.is_dirty = true;
      pf.is_config_dirty = true;
      renderKeyButtons();
    });

    function onHalfstepChange() {
      const pf = getCurrentProfile();
      if (!pf) return;
      if (!state.isHalfstepWarningShown) {
        showToast("Note: This doubles the rotary encoder's sensitivity. Only for SMOOTH encoders! Leave unchecked if unsure.", 'warn', 5500);
        state.isHalfstepWarningShown = true;
      }
      pf.is_upper_re_halfstep = el.chkUpperHs.checked;
      pf.is_lower_re_halfstep = el.chkLowerHs.checked;
      pf.is_dirty = true;
      pf.is_config_dirty = true;
    }
    el.chkUpperHs.addEventListener('change', onHalfstepChange);
    el.chkLowerHs.addEventListener('change', onHalfstepChange);

    // Onboard switches Rotate
    el.chkRotateKeys.addEventListener('change', () => {
      const pf = getCurrentProfile();
      if (!pf) return;
      pf.is_landscape = el.chkRotateKeys.checked;
      pf.is_dirty = true;
      pf.is_config_dirty = true;
      renderAll();
    });

    // Expansion module pager
    el.btnExpMinus.addEventListener('click', () => {
      state.currentExpansionModule = (state.currentExpansionModule - 1 + DuckObjs.MAX_EXPANSION_MODULE_COUNT) % DuckObjs.MAX_EXPANSION_MODULE_COUNT;
      state.selectedKeyIndex = null;
      renderAll();
    });
    el.btnExpPlus.addEventListener('click', () => {
      state.currentExpansionModule = (state.currentExpansionModule + 1) % DuckObjs.MAX_EXPANSION_MODULE_COUNT;
      state.selectedKeyIndex = null;
      renderAll();
    });

    // Key Config
    function getCleanKeyName2Lines(userText) {
      const splitLines = userText.replace(/\r/g, '').split('\n').slice(0, 2);
      const line1 = DuckObjs.clean_input(splitLines[0] || '', DuckObjs.KEY_NAME_MAX_CHAR_PER_LINE, false);
      const line2 = DuckObjs.clean_input(splitLines[1] || '', DuckObjs.KEY_NAME_MAX_CHAR_PER_LINE, false);
      return [line1, line2];
    }

    el.keyNameTextarea.addEventListener('input', () => {
      const pf = getCurrentProfile();
      if (!pf || state.selectedKeyIndex === null) return;
      const [line1, line2] = getCleanKeyName2Lines(el.keyNameTextarea.value);
      if (line1.length === 0) return;

      let keyObj = pf.keylist[state.selectedKeyIndex];
      if (keyObj) {
        keyObj.name = line1;
        keyObj.name_line2 = line2;
        keyObj.is_dirty = true;
        pf.is_dirty = true;
        pf.is_config_dirty = true;
        renderKeyButtons();
      } else {
        // Automatically create key when typing name into empty slot (matching key_rename_click in duckypad_config.py)
        const newKey = new DuckObjs.dp_key();
        newKey.name = line1;
        newKey.name_line2 = line2;
        newKey.is_dirty = true;
        newKey.is_script_dirty = true;
        pf.keylist[state.selectedKeyIndex] = newKey;
        pf.is_dirty = true;
        pf.is_config_dirty = true;
        updateKeylistIndices(pf);
        renderKeyButtons();
        renderKeyConfigAndScriptPanel(false);
        el.scriptTextarea.value = '';
        runLiveSyntaxCheck(true);
      }
    });

    el.btnCreateEmptyKey.addEventListener('click', () => {
      const pf = getCurrentProfile();
      if (!pf || state.selectedKeyIndex === null) return;
      const newKey = new DuckObjs.dp_key();
      newKey.name = `Key${state.selectedKeyIndex + 1}`;
      newKey.name_line2 = '';
      newKey.is_dirty = true;
      newKey.is_script_dirty = true;
      pf.keylist[state.selectedKeyIndex] = newKey;
      pf.is_dirty = true;
      pf.is_config_dirty = true;
      updateKeylistIndices(pf);
      renderKeyButtons();
      renderKeyConfigAndScriptPanel(true);
      el.keyNameTextarea.focus();
      el.keyNameTextarea.select();
    });

    el.btnKeyRemove.addEventListener('click', () => {
      const pf = getCurrentProfile();
      if (!pf || state.selectedKeyIndex === null) return;
      pf.keylist[state.selectedKeyIndex] = null;
      pf.is_dirty = true;
      pf.is_config_dirty = true;
      renderKeyButtons();
      renderKeyConfigAndScriptPanel(true);
    });

    el.chkCustomKeyColor.addEventListener('change', () => {
      const pf = getCurrentProfile();
      const keyObj = getCurrentKey();
      if (!keyObj) return;
      keyObj.color = el.chkCustomKeyColor.checked ? [...state.lastRgb] : null;
      keyObj.is_dirty = true;
      if (pf) {
        pf.is_dirty = true;
        pf.is_config_dirty = true;
      }
      renderKeyButtons();
      renderKeyConfigAndScriptPanel(false);
    });

    el.inputKeyColor.addEventListener('input', () => {
      const pf = getCurrentProfile();
      const keyObj = getCurrentKey();
      if (!keyObj) return;
      const rgb = DuckObjs.hex_to_rgb(el.inputKeyColor.value);
      state.lastRgb = rgb;
      keyObj.color = rgb;
      keyObj.is_dirty = true;
      if (pf) {
        pf.is_dirty = true;
        pf.is_config_dirty = true;
      }
      el.chkCustomKeyColor.checked = true;
      renderKeyButtons();
    });

    el.chkAllowAbort.addEventListener('change', () => {
      const pf = getCurrentProfile();
      const keyObj = getCurrentKey();
      if (!keyObj) return;
      keyObj.allow_abort = el.chkAllowAbort.checked;
      keyObj.is_dirty = true;
      keyObj.is_script_dirty = true;
      if (pf) {
        pf.is_dirty = true;
        pf.is_config_dirty = true;
      }
      runLiveSyntaxCheck(true);
    });

    el.chkDontRepeat.addEventListener('change', () => {
      const pf = getCurrentProfile();
      const keyObj = getCurrentKey();
      if (!keyObj) return;
      keyObj.dont_repeat = el.chkDontRepeat.checked;
      keyObj.is_dirty = true;
      keyObj.is_script_dirty = true;
      if (pf) {
        pf.is_dirty = true;
        pf.is_config_dirty = true;
      }
      runLiveSyntaxCheck(true);
    });

    // Scripts On Press / On Release radio buttons
    el.radioOnPress.addEventListener('change', () => {
      if (!el.radioOnPress.checked) return;
      state.scriptEditMode = 0;
      const keyObj = getCurrentKey();
      if (!keyObj) return;
      el.scriptTextarea.value = (keyObj.script || '').replace(/^[ \t]+/, '').replace(/[\r\n]+$/, '');
      runLiveSyntaxCheck(true);
    });

    el.radioOnRelease.addEventListener('change', () => {
      if (!el.radioOnRelease.checked) return;
      state.scriptEditMode = 1;
      const keyObj = getCurrentKey();
      if (!keyObj) return;
      if (!state.isOnReleaseWarningShown) {
        showToast('On Release script is for advanced users! Leave blank if unsure.', 'info', 4500);
        state.isOnReleaseWarningShown = true;
      }
      el.scriptTextarea.value = (keyObj.script_on_release || '').replace(/^[ \t]+/, '').replace(/[\r\n]+$/, '');
      runLiveSyntaxCheck(true);
    });

    // Script Editor events
    el.scriptTextarea.addEventListener('input', () => {
      const pf = getCurrentProfile();
      const keyObj = getCurrentKey();
      if (!keyObj) return;
      const text = el.scriptTextarea.value.replace(/^[ \t]+/, '');
      if (state.scriptEditMode === 1) {
        keyObj.script_on_release = text;
      } else {
        keyObj.script = text;
      }
      keyObj.is_dirty = true;
      keyObj.is_script_dirty = true;
      if (pf) pf.is_dirty = true;
      const hasRelease = Boolean(keyObj.script_on_release && keyObj.script_on_release.trim().length > 0);
      el.labelOnRelease.classList.toggle('has-release-script', hasRelease);
      renderEditorGutterAndBackdrop(el.scriptTextarea, el.lineNumbersGutter, el.editorBackdrop, null);
      scheduleSyntaxCheck();
    });

    el.scriptTextarea.addEventListener('scroll', () => {
      el.lineNumbersGutter.scrollTop = el.scriptTextarea.scrollTop;
      el.editorBackdrop.scrollTop = el.scriptTextarea.scrollTop;
    });

    // Support Tab key (2 spaces) inside script & header editors
    function enableTabIndentation(textarea) {
      textarea.addEventListener('keydown', e => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          textarea.value = textarea.value.slice(0, start) + '  ' + textarea.value.slice(end);
          textarea.selectionStart = textarea.selectionEnd = start + 2;
          textarea.dispatchEvent(new Event('input'));
        }
      });
    }
    enableTabIndentation(el.scriptTextarea);
    enableTabIndentation(el.headerTextarea);

    el.btnInspectBytecode.addEventListener('click', openBytecodeModal);
    el.btnCloseBytecodeModal.addEventListener('click', () => el.modalBytecode.classList.add('hidden'));

    // Edit Headers Modal events
    el.btnEditHeaders.addEventListener('click', openHeadersModal);
    function saveAndCloseHeaders() {
      checkUserHeaderSyntax();
      el.modalHeaders.classList.add('hidden');
      renderAll();
      runLiveSyntaxCheck(true);
    }
    el.btnCloseHeadersModal.addEventListener('click', saveAndCloseHeaders);
    el.btnSaveCloseHeaders.addEventListener('click', saveAndCloseHeaders);

    el.headerTextarea.addEventListener('input', () => {
      state.isUserHeaderDirty = true;
      renderEditorGutterAndBackdrop(el.headerTextarea, el.headerLineGutter, el.headerBackdrop, null);
      if (headerSyntaxTimer) clearTimeout(headerSyntaxTimer);
      headerSyntaxTimer = setTimeout(checkUserHeaderSyntax, 350);
    });
    el.headerTextarea.addEventListener('scroll', () => {
      el.headerLineGutter.scrollTop = el.headerTextarea.scrollTop;
      el.headerBackdrop.scrollTop = el.headerTextarea.scrollTop;
    });

    el.btnStdlibDocs.addEventListener('click', () => window.open(DuckObjs.stdlib_readme_url, '_blank'));
    el.btnStdlibFetch.addEventListener('click', () => fetchLatestStdlib(false));
    el.btnToggleStdlibView.addEventListener('click', () => {
      el.stdlibPreviewBox.classList.toggle('hidden');
    });
  }

  // ---------------- AUTOMATED SELF-TEST SUITE (#autotest) ----------------
  async function runAutomatedSelfTests() {
    const results = [];
    function assert(cond, name) {
      if (!cond) throw new Error(`Assertion failed: ${name}`);
      results.push(name);
    }

    try {
      // 1. Test DuckyScript 3 compiler (functions, loops, expressions, interpolation, stdlib)
      const testScript = [
        'USE_STDLIB',
        'DEFINE MAX_ITER 3',
        'VAR $acc = 10',
        'FUN add_two(x, y)',
        '  RETURN MAX(x + y, 0)',
        'END_FUN',
        'WHILE $acc < 20',
        '  $acc = add_two($acc, MAX_ITER)',
        '  IF $acc == 16',
        '    STRING Value is $acc%04d!',
        '  END_IF',
        'END_WHILE',
        'CTRL SHIFT ESC',
      ].join('\n');

      const comp = DSVM.compileScriptText(testScript, {
        userHeaderLines: state.userHeaderLines,
        stdlibLines: state.stdlibLines,
      });
      assert(comp.is_success === true, `DSVM Compiler (${comp.bin_array.length}B bytecode${comp.error_comment ? ': ' + comp.error_comment : ''})`);
      assert(comp.bin_array.length > 20 && comp.bin_array.length < DSVM.MAX_BIN_SIZE, 'Bytecode size bounds');

      // 2. Test full filesystem compilation & round-trip parsing
      const buildRes = DuckObjs.compileAndBuildFileSystem(
        state.profileList,
        state.userHeaderLines,
        state.stdlibLines,
        state.deviceType
      );
      assert(buildRes.ok === true, `Build Virtual FS (${buildRes.filesMap.size} files)`);
      assert(buildRes.filesMap.has('profile_Welcome_Demo/config.txt'), 'profile_Welcome_Demo/config.txt generated');
      assert(buildRes.filesMap.has('profile_Welcome_Demo/key1.dsb'), 'profile_Welcome_Demo/key1.dsb compiled');

      // 3. Test round-trip parseVirtualFileSystem & differential preservation of existing profiles/keys
      const parsed = DuckObjs.parseVirtualFileSystem(buildRes.filesMap);
      assert(parsed.profiles.length === state.profileList.length, `Round-trip profile count (${parsed.profiles.length})`);

      // Modify ONLY key 1's script in the first profile and verify only key1.txt & key1.dsb are marked for sync
      parsed.profiles[0].keylist[0].script = 'STRING Changed Key 1 Script!\n';
      parsed.profiles[0].keylist[0].is_dirty = true;
      parsed.profiles[0].keylist[0].is_script_dirty = true;
      parsed.profiles[0].is_dirty = true;

      const diffBuild = DuckObjs.compileAndBuildFileSystem(
        parsed.profiles,
        parsed.userHeaderLines,
        state.stdlibLines,
        state.deviceType,
        {
          preserveUnchanged: true,
          isUserHeaderDirty: false,
          isProfileOrderDirty: false,
          isDeviceTypeChanged: false,
          originalFilesMap: buildRes.filesMap,
        }
      );
      assert(diffBuild.ok === true, 'Differential FS build succeeded');
      const syncOps = DuckObjs.computeFileSyncOps(buildRes.filesMap, diffBuild.filesMap);
      assert(
        syncOps.length === 3 &&
        syncOps.some(op => op.action === 'cpf' && op.path === 'profile_Welcome_Demo/key1.txt') &&
        syncOps.some(op => op.action === 'cpf' && op.path === 'profile_Welcome_Demo/key1.dsb'),
        `Differential sync writes only changed key (${syncOps.length} ops)`
      );

      // 4. Test ZIP creation and extraction
      const zipEntries = [];
      for (const [path, data] of buildRes.filesMap.entries()) {
        zipEntries.push({ path, data });
      }
      const zipBytes = ZipMD5.createZip(zipEntries);
      assert(zipBytes.length > 500, `ZIP Archive built (${zipBytes.length}B)`);
      const unzipped = await ZipMD5.readZip(zipBytes.buffer);
      assert(unzipped.length === buildRes.filesMap.size, `ZIP Archive round-trip (${unzipped.length} entries)`);

      // 5. Test long script scrolling and viewport maximization (no page overflow)
      const longScriptLines = [
        'DEFAULTCHARDELAY 15',
        'DEFAULTDELAY 25',
        '',
        'DEFINE PLUS_BUTTON 28',
        '',
        'FUNCTION blink()',
        '  VAR $count = 0',
        '  WHILE $count < 4',
        '    SWC_FILL 100 100 100',
        '    DELAY 200',
        '    SWC_FILL 0 0 0',
        '    DELAY 200',
        '    $count = $count + 1',
        '  END_WHILE',
        'END_FUNCTION',
        '',
      ];
      for (let i = 1; i <= 75; i++) {
        longScriptLines.push(`// Step ${i}: Long line of DuckyScript code to verify internal scrolling without stretching layout`);
        longScriptLines.push(`STRINGLN Step ${i} executed`);
      }
      const longScript = longScriptLines.join('\n');
      const curKey = getCurrentKey();
      if (curKey) {
        curKey.script = longScript;
        el.scriptTextarea.value = longScript;
        runLiveSyntaxCheck(true);
      }
      assert(
        el.scriptTextarea.scrollHeight > el.scriptTextarea.clientHeight &&
        document.documentElement.scrollHeight <= window.innerHeight + 1,
        `Long script scrolls internally (${el.scriptTextarea.clientHeight}px box, ${el.scriptTextarea.scrollHeight}px content, docScroll=${document.documentElement.scrollHeight}, winH=${window.innerHeight})`
      );

      showToast(`PASS: All ${results.length} self-tests succeeded! (${results.join(' • ')})`, 'success', 15000);
    } catch (err) {
      showToast(`FAIL: ${err.message || err}`, 'error', 20000);
    }
  }

  // ---------------- INITIALIZATION ----------------
  async function init() {
    initTheme();
    cacheElements();
    buildInitialKeyDOM();
    bindEvents();

    if (window.location.hash === '#demo' || window.location.hash === '#autotest') {
      state.profileList = DuckObjs.createSampleProfiles();
      state.selectedProfileIndex = 0;
      state.selectedKeyIndex = 5;
      state.connectionType = 'demo';
      state.connectionLabel = 'Demo Workspace (Sample Profiles)';
    }

    renderAll();
    if (state.selectedKeyIndex !== null) {
      renderKeyConfigAndScriptPanel(true);
    }

    if (window.location.hash === '#autotest') {
      await runAutomatedSelfTests();
    }

    // Load cached stdlib if available, and check for daily update in background
    const cachedStdlib = await HidFS.BackupStore.getKv('stdlib_text', null);
    if (cachedStdlib) {
      state.stdlibLines = cachedStdlib.replace(/\r/g, '').split('\n');
    }
    const lastStdlibTs = await HidFS.BackupStore.getKv('stdlib_timestamp', 0);
    if (Date.now() - lastStdlibTs > 12 * 3600 * 1000) {
      fetchLatestStdlib(true);
    }
    checkAppUpdateStatus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
