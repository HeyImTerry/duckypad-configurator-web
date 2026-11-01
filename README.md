# duckyPad Configurator — Browser Edition (v4.0.2)

A zero-dependency, self-contained browser port of the official Python **duckyPad Configurator (v4.0.2)** for **duckyPad Pro (2024)** and **OG duckyPad (2020)**.

No Python runtime, `pip` packages, `tkinter`, `hidapi`, or local backend server are required.

---

## Quick Start

1. **Open Directly in Any Browser (`file://`)**
   - Double-click [`index.html`](./index.html) to open it in Firefox, Chrome, Edge, Brave, or Safari.
   - To launch directly with interactive sample profiles preloaded, open `index.html#demo`.
2. **Optional Static Hosting**
   - Can also be hosted on GitHub Pages, any static web server, or local HTTP server.

---

## Features & Architecture

- [`index.html`](./index.html) — Single-page application layout matching the desktop configurator's 4-column workflow (`Profiles`, `Onboard Switches & Key Config`, `Rotary Encoders & Expansion Modules`, `DuckyScript Editor`), plus modals for device connection, User Headers / Standard Library, Profile Export, Browser Backups, and a **DSVM2 Bytecode & Assembly Inspector**.
- [`js/dsvm.js`](./js/dsvm.js) — Full JavaScript port of the DuckyScript 3 / DSVM2 compiler pipeline (`dsvm_common.py`, `dsvm_preprocessor.py`, `dsvm_ds2py.py`, `dsvm_myast.py`, `dsvm_optimizer.py`, `dsvm_make_bytecode.py`):
  - Preprocessor macros (`DEFINE`), `USE_STDLIB`, `USE_UH` (User Header), `REM_BLOCK`, `STRING_BLOCK`, `STRINGLN_BLOCK`, `LOOP0:`..`LOOP9:`, `REPEAT`, key combos, `VAR` declarations, `FUN`/`END_FUN`, `IF`/`ELSE IF`/`ELSE`/`END_IF`, `WHILE`/`END_WHILE`, `LBREAK`, `CONTINUE`, `RETURN`.
  - Custom recursive-descent AST parser, dead-function elimination, constant folding, peephole bytecode optimizer, and `.dsb` binary packer with `$var%04d` printf string interpolation (`0x1e` frame-pointer-relative and `0x1f` global variable boundaries).
- [`js/duck_objs.js`](./js/duck_objs.js) — Port of `duck_objs.py`, `shared.py`, `my_compare.py`, and `ds_stdlib.py`:
  - `dp_key` and `dp_profile` models, 15-key OG duckyPad (`dp20`) ↔ 20-key duckyPad Pro (`dp24`) key index remapping, Portrait (4×5) and Landscape (5×4 rotated) switch layouts, 6 Rotary Encoder actions, and 4×8 Expansion Module channels.
  - Virtual filesystem parser (`parseVirtualFileSystem`), project compiler (`compileAndBuildFileSystem`), and MD5 differential sync calculator (`computeFileSyncOps`).
- [`js/zip_md5.js`](./js/zip_md5.js) — Dependency-free RFC 1321 MD5 implementation, CRC32, and `.zip` archive reader/writer (supporting `DecompressionStream('deflate-raw')` and `STORE` mode).
- [`js/hid_fs.js`](./js/hid_fs.js) — Hardware & filesystem integration (`hid_common.py`, `hid_op.py`, `dp20_dumpsd.py`):
  - **WebHID API** (`0x0483:0xd11c` / `0x0483:0xd11d`): Device discovery, firmware version check, RTC clock sync, USB Mass Storage mode mounting on duckyPad Pro, and full HID SD card dump & differential sync on OG duckyPad (2020).
  - **File System Access API (`showDirectoryPicker`)**: Direct read/write to mounted `DUCKYPAD` USB drives or local SD card folders in Chromium browsers.
  - **Universal Folder & `.zip` Support**: Folder reading via `<input webkitdirectory>` and full SD card / single-profile `.zip` import & export for Firefox, Safari, and mobile browsers.
  - **Automatic Browser Backups**: Saves timestamped backups in `IndexedDB` (with automatic `localStorage` fallback on `file://`).
- [`js/app.js`](./js/app.js) & [`css/styles.css`](./css/styles.css) — UI controller, drag-and-drop key swapping, live syntax & bytecode size checking, line-numbered code editor with error highlighting, and Dark/Light theme support.
