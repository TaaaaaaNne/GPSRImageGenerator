(function () {
  "use strict";

  const OUTPUT_SUFFIX = ".PS01.jpg";
  const ASIN_RE = /^[A-Z0-9]{10}$/i;
  const SETTINGS_DB_NAME = "gpsr-image-generator";
  const SETTINGS_STORE_NAME = "settings";
  const OUTPUT_DIRECTORY_KEY = "outputDirectory";
  const DEFAULT_OUTPUT_START_IN = "downloads";
  const state = {
    tableFile: null,
    tableLabel: "",
    sheets: [],
    images: [],
    imageByKey: new Map(),
    shopImages: new Map(),
    outputDirectoryHandle: null,
    outputDirectoryName: "",
    busy: false,
    logs: ["等待导入文件。"],
  };

  const els = {
    tableInput: document.getElementById("tableInput"),
    imageInput: document.getElementById("imageInput"),
    resourceDirectoryInput: document.getElementById("resourceDirectoryInput"),
    tableDropZone: document.getElementById("tableDropZone"),
    imageDropZone: document.getElementById("imageDropZone"),
    tableFileName: document.getElementById("tableFileName"),
    imageFileName: document.getElementById("imageFileName"),
    resourceFolderName: document.getElementById("resourceFolderName"),
    saveFolderButton: document.getElementById("saveFolderButton"),
    changeOutputFolderButton: document.getElementById("changeOutputFolderButton"),
    generateZipButton: document.getElementById("generateZipButton"),
    saveModeHint: document.getElementById("saveModeHint"),
    resetButton: document.getElementById("resetButton"),
    downloadTemplateButton: document.getElementById("downloadTemplateButton"),
    manualShop: document.getElementById("manualShop"),
    manualSite: document.getElementById("manualSite"),
    manualAsins: document.getElementById("manualAsins"),
    addManualSheetButton: document.getElementById("addManualSheetButton"),
    sheetCount: document.getElementById("sheetCount"),
    shopCount: document.getElementById("shopCount"),
    imageCount: document.getElementById("imageCount"),
    outputCount: document.getElementById("outputCount"),
    sheetList: document.getElementById("sheetList"),
    shopList: document.getElementById("shopList"),
    readinessBadge: document.getElementById("readinessBadge"),
    matchBadge: document.getElementById("matchBadge"),
    logBadge: document.getElementById("logBadge"),
    logOutput: document.getElementById("logOutput"),
  };

  function addLog(message, level = "info") {
    const prefix = level === "error" ? "错误" : level === "success" ? "完成" : "记录";
    state.logs.push(`[${prefix}] ${message}`);
    els.logOutput.textContent = state.logs.join("\n");
    els.logOutput.scrollTop = els.logOutput.scrollHeight;
    els.logBadge.textContent = level === "error" ? "Error" : level === "success" ? "Done" : "Running";
    els.logBadge.className = level === "error" ? "has-error" : level === "success" ? "is-ready" : "";
  }

  function resetLogs() {
    state.logs = [];
    els.logOutput.textContent = "";
    els.logBadge.textContent = "Ready";
    els.logBadge.className = "";
  }

  function parseSheetName(sheetName) {
    if (!sheetName.includes("-")) {
      throw new Error(`表名必须是 店铺-站点 格式: ${sheetName}`);
    }
    const parts = sheetName.split("-");
    const shop = parts.shift().trim();
    const site = parts.join("-").trim();
    if (!shop || !site) {
      throw new Error(`表名必须包含店铺和站点: ${sheetName}`);
    }
    return { shop, site };
  }

  function extractAsin(value) {
    let text = String(value || "").trim();
    if (text.includes("ASIN：")) {
      text = text.split("ASIN：").pop().trim();
    } else if (text.includes("ASIN:")) {
      text = text.split("ASIN:").pop().trim();
    }
    text = text.toUpperCase();
    if (!ASIN_RE.test(text)) {
      throw new Error(`ASIN 格式不正确: ${value}`);
    }
    return text;
  }

  function extractSheetAsins(values, sheetName) {
    const asins = [];
    values.forEach((value, index) => {
      if (!String(value || "").trim()) return;
      try {
        asins.push(extractAsin(value));
      } catch (error) {
        throw new Error(`${sheetName} 第 ${index + 1} 行: ${error.message}`);
      }
    });
    if (asins.length === 0) {
      throw new Error(`${sheetName} 第一列没有有效 ASIN 数据。`);
    }
    return asins;
  }

  function parseManualAsinText(text) {
    return String(text || "")
      .split(/[\n,，;；\t]+/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (quoted) {
        if (char === "\"" && next === "\"") {
          cell += "\"";
          index += 1;
        } else if (char === "\"") {
          quoted = false;
        } else {
          cell += char;
        }
      } else if (char === "\"") {
        quoted = true;
      } else if (char === ",") {
        row.push(cell);
        cell = "";
      } else if (char === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (char !== "\r") {
        cell += char;
      }
    }

    row.push(cell);
    if (row.some((value) => value.trim())) {
      rows.push(row);
    }
    return rows;
  }

  async function readTextFile(file) {
    const buffer = await file.arrayBuffer();
    const encodings = ["utf-8", "gb18030", "gbk"];
    for (const encoding of encodings) {
      try {
        return new TextDecoder(encoding, { fatal: true }).decode(buffer);
      } catch (error) {
        // Try the next likely CSV encoding.
      }
    }
    return new TextDecoder("utf-8").decode(buffer);
  }

  async function parseCsvFile(file) {
    const text = await readTextFile(file);
    const rows = parseCsv(text)
      .map((row) => row[0] || "")
      .map((value) => value.trim())
      .filter(Boolean);

    if (rows.length === 0) {
      throw new Error("CSV 第一列没有数据。");
    }

    const sheetName = rows[0];
    const { shop, site } = parseSheetName(sheetName);
    const asins = extractSheetAsins(rows.slice(1), sheetName);
    return [{ name: sheetName, shop, site, asins }];
  }

  async function parseXlsxFile(file) {
    if (!window.XLSX) {
      throw new Error("XLSX 解析库未加载，请确认 vendor/xlsx.full.min.js 存在。");
    }
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
    const sheets = [];

    workbook.SheetNames.forEach((sheetName) => {
      const { shop, site } = parseSheetName(sheetName);
      const worksheet = workbook.Sheets[sheetName];
      const rangeText = worksheet && worksheet["!ref"];
      if (!rangeText) {
        throw new Error(`${sheetName} 第一列没有有效 ASIN 数据。`);
      }
      const range = XLSX.utils.decode_range(rangeText);
      const values = [];
      for (let row = range.s.r; row <= range.e.r; row += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: 0 });
        const cell = worksheet[address];
        values.push(cell ? XLSX.utils.format_cell(cell).trim() : "");
      }
      const asins = extractSheetAsins(values, sheetName);
      sheets.push({ name: sheetName, shop, site, asins });
    });

    if (sheets.length === 0) {
      throw new Error("表格中没有可处理的 sheet。");
    }
    return sheets;
  }

  async function parseTableFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx")) {
      return parseXlsxFile(file);
    }
    if (name.endsWith(".csv")) {
      return parseCsvFile(file);
    }
    throw new Error("请选择 .xlsx 或 .csv 表格文件。");
  }

  function getRequiredShops() {
    const shops = [];
    state.sheets.forEach((sheet) => {
      if (!shops.includes(sheet.shop)) shops.push(sheet.shop);
    });
    return shops;
  }

  function normalizeBaseName(fileName) {
    return fileName.replace(/\.[^.]+$/, "").trim().toLowerCase();
  }

  function isLikelyJpeg(file) {
    return /\.(jpe?g)$/i.test(file.name) || file.type === "image/jpeg";
  }

  function getImageKey(file) {
    const name = String(file.name || "image").trim().toLowerCase();
    const size = Number(file.size) || 0;
    const modified = Number(file.lastModified) || 0;
    return `${name}|${size}|${modified}`;
  }

  function registerImage(file) {
    const key = getImageKey(file);
    const existing = state.imageByKey.get(key);
    if (existing) {
      return { file: existing, added: false };
    }
    state.imageByKey.set(key, file);
    state.images.push(file);
    return { file, added: true };
  }

  function clearImages() {
    state.imageByKey.clear();
    state.images = [];
  }

  async function isValidJpeg(file) {
    if (!isLikelyJpeg(file) || file.size < 4) return false;
    const header = new Uint8Array(await file.slice(0, 3).arrayBuffer());
    return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  }

  async function addImages(files, sourceLabel = "图片") {
    let accepted = 0;
    let duplicates = 0;
    for (const file of files) {
      if (await isValidJpeg(file)) {
        const result = registerImage(file);
        if (result.added) {
          accepted += 1;
        } else {
          duplicates += 1;
        }
      } else {
        addLog(`已跳过无效 JPG: ${file.name}`, "error");
      }
    }
    autoMatchImages();
    updateView();
    if (accepted) {
      addLog(`${sourceLabel}已导入 ${accepted} 张店铺图片。`);
    }
    if (duplicates) {
      addLog(`已跳过 ${duplicates} 张重复图片。`);
    }
  }

  function dataUrlToFile(entry) {
    const match = String(entry.data || "").match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) {
      throw new Error(`${entry.name || "内置图片"} 不是有效的 data URL。`);
    }
    const mimeType = entry.type || match[1] || "image/jpeg";
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], entry.name, { type: mimeType, lastModified: entry.lastModified || 0 });
  }

  async function loadBundledImages() {
    const entries = Array.isArray(window.GPSR_RESOURCE_IMAGES) ? window.GPSR_RESOURCE_IMAGES : [];
    if (!entries.length) {
      return;
    }
    try {
      const files = entries.map(dataUrlToFile);
      await addImages(files, "内置素材库");
    } catch (error) {
      addLog(error.message || String(error), "error");
    }
  }

  function autoMatchImages() {
    const shops = getRequiredShops();
    Array.from(state.shopImages.keys()).forEach((shop) => {
      if (!shops.includes(shop)) {
        state.shopImages.delete(shop);
      }
    });
    shops.forEach((shop) => {
      if (state.shopImages.has(shop)) return;
      const target = shop.trim().toLowerCase();
      const matched = state.images.find((file) => normalizeBaseName(file.name) === target);
      if (matched) {
        state.shopImages.set(shop, matched);
      }
    });
  }

  function countOutputFiles() {
    return state.sheets.reduce((total, sheet) => total + sheet.asins.length, 0);
  }

  function isReady() {
    const shops = getRequiredShops();
    return state.sheets.length > 0 && shops.length > 0 && shops.every((shop) => state.shopImages.has(shop));
  }

  function renderSheets() {
    if (state.sheets.length === 0) {
      els.sheetList.innerHTML = '<p class="empty-state">导入表格后，这里会显示每个站点的 ASIN 数量。</p>';
      return;
    }
    els.sheetList.innerHTML = state.sheets
      .map((sheet, index) => `
        <article class="sheet-row">
          <div class="row-title">
            <strong>${escapeHtml(sheet.name)}</strong>
            <span class="pill">${sheet.asins.length} 张</span>
          </div>
          <p class="meta">店铺：${escapeHtml(sheet.shop)} · 站点：${escapeHtml(sheet.site)}</p>
          <button class="mini-button" type="button" data-delete-sheet="${index}">移除</button>
        </article>
      `)
      .join("");
    els.sheetList.querySelectorAll("[data-delete-sheet]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.deleteSheet);
        const [removed] = state.sheets.splice(index, 1);
        state.tableLabel = state.sheets.length ? state.tableLabel : "";
        autoMatchImages();
        updateView();
        addLog(`已移除清单: ${removed.name}`);
      });
    });
  }

  function renderShops() {
    const shops = getRequiredShops();
    if (shops.length === 0) {
      els.shopList.innerHTML = '<p class="empty-state">店铺图片文件名最好与店铺名一致，例如 店铺.jpg。</p>';
      return;
    }
    els.shopList.innerHTML = shops
      .map((shop) => {
        const image = state.shopImages.get(shop);
        const id = `shop-file-${hashString(shop)}`;
        return `
          <article class="shop-row">
            <div class="row-title">
              <strong>${escapeHtml(shop)}</strong>
              <span class="pill ${image ? "" : "bad"}">${image ? "已匹配" : "缺图片"}</span>
            </div>
            <p class="meta">${image ? escapeHtml(image.name) : `需要 ${escapeHtml(shop)}.jpg`}</p>
            <div class="shop-actions">
              <label class="inline-file" for="${id}">选择此店图片</label>
              <input id="${id}" data-shop="${escapeAttr(shop)}" type="file" accept="image/jpeg,.jpg,.jpeg">
            </div>
          </article>
        `;
      })
      .join("");
    els.shopList.querySelectorAll("input[type='file']").forEach((input) => {
      input.addEventListener("change", async (event) => {
        const [file] = Array.from(event.target.files || []);
        const shop = event.target.dataset.shop;
        if (!file || !shop) return;
        if (!(await isValidJpeg(file))) {
          addLog(`${file.name} 不是有效 JPG。`, "error");
          event.target.value = "";
          return;
        }
        const result = registerImage(file);
        state.shopImages.set(shop, result.file);
        updateView();
        addLog(`${shop} 已手动匹配 ${result.file.name}。`);
      });
    });
  }

  function updateView() {
    const shops = getRequiredShops();
    const matched = shops.filter((shop) => state.shopImages.has(shop)).length;
    const ready = isReady();

    els.tableFileName.textContent = state.tableFile
      ? state.tableFile.name
      : state.tableLabel || "拖入或选择 .xlsx / .csv，也可以下方直接填表";
    els.imageFileName.textContent = state.images.length ? `${state.images.length} 张图片已导入` : "拖入或选择 JPG/JPEG，可多选";
    els.resourceFolderName.textContent = state.images.length
      ? `素材库当前可用 ${state.images.length} 张 JPG/JPEG`
      : "可选择 resource/images 或任意店铺图片文件夹";
    els.sheetCount.textContent = String(state.sheets.length);
    els.shopCount.textContent = String(shops.length);
    els.imageCount.textContent = String(state.images.length);
    els.outputCount.textContent = String(countOutputFiles());
    els.matchBadge.textContent = `${matched} / ${shops.length}`;
    els.readinessBadge.textContent = ready ? "可以生成" : state.sheets.length ? "待补齐" : "等待导入";
    els.readinessBadge.className = ready ? "is-ready" : state.sheets.length ? "has-error" : "";
    els.saveFolderButton.disabled = !ready || state.busy || !canSaveToFolder();
    els.saveFolderButton.textContent = state.busy
      ? "正在生成..."
      : state.outputDirectoryHandle
        ? `保存到「${state.outputDirectoryName || "上次文件夹"}」`
        : "保存到文件夹";
    els.changeOutputFolderButton.disabled = state.busy || !canSaveToFolder();
    els.changeOutputFolderButton.textContent = state.outputDirectoryHandle ? "更换保存位置" : "设置保存位置";
    els.generateZipButton.disabled = !ready || state.busy;
    els.generateZipButton.textContent = state.busy ? "正在生成..." : "下载 ZIP 备用";
    els.saveModeHint.textContent = canSaveToFolder()
      ? state.outputDirectoryHandle
        ? `已记住系统弹窗里选过的文件夹「${state.outputDirectoryName || "上次文件夹"}」。浏览器不会提供完整路径；找不到时请点“更换保存位置”。`
        : "第一次保存会选择输出文件夹。建议在下载目录里新建并选择“GPSR输出”。"
      : "当前浏览器不支持直接保存文件夹，可使用 ZIP 备用。";
    renderSheets();
    renderShops();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function hashString(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  function safeSegment(value) {
    return String(value).replace(/[\\/:*?"<>|]+/g, "_").trim() || "output";
  }

  function canSaveToFolder() {
    return typeof window.showDirectoryPicker === "function";
  }

  function canStoreDirectoryHandle() {
    return typeof window.indexedDB !== "undefined";
  }

  function openSettingsDb() {
    return new Promise((resolve, reject) => {
      if (!canStoreDirectoryHandle()) {
        reject(new Error("当前浏览器不能记住保存位置。"));
        return;
      }
      const request = window.indexedDB.open(SETTINGS_DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(SETTINGS_STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("无法打开浏览器本地设置。"));
    });
  }

  async function getStoredSetting(key) {
    const db = await openSettingsDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SETTINGS_STORE_NAME, "readonly");
      const request = transaction.objectStore(SETTINGS_STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("无法读取浏览器本地设置。"));
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error("无法读取浏览器本地设置。"));
      };
    });
  }

  async function setStoredSetting(key, value) {
    const db = await openSettingsDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SETTINGS_STORE_NAME, "readwrite");
      const request = transaction.objectStore(SETTINGS_STORE_NAME).put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("无法保存浏览器本地设置。"));
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error("无法保存浏览器本地设置。"));
      };
    });
  }

  async function restoreSavedOutputFolder() {
    if (!canSaveToFolder() || !canStoreDirectoryHandle()) return;
    try {
      const handle = await getStoredSetting(OUTPUT_DIRECTORY_KEY);
      if (handle && handle.kind === "directory") {
        state.outputDirectoryHandle = handle;
        state.outputDirectoryName = handle.name || "已记住的文件夹";
        updateView();
      }
    } catch (error) {
      // Saving still works; only folder memory is unavailable.
    }
  }

  async function rememberOutputFolder(handle) {
    state.outputDirectoryHandle = handle;
    state.outputDirectoryName = handle.name || "已记住的文件夹";
    updateView();
    if (!canStoreDirectoryHandle()) return;
    try {
      await setStoredSetting(OUTPUT_DIRECTORY_KEY, handle);
    } catch (error) {
      addLog("已选择保存位置，但当前浏览器没有记住它。");
    }
  }

  async function chooseOutputFolder({ startFromRemembered = true } = {}) {
    const options = {
      mode: "readwrite",
      startIn: DEFAULT_OUTPUT_START_IN,
    };
    if (startFromRemembered && state.outputDirectoryHandle) {
      options.startIn = state.outputDirectoryHandle;
    }
    const handle = await window.showDirectoryPicker(options);
    await rememberOutputFolder(handle);
    return handle;
  }

  async function ensureDirectoryPermission(handle) {
    const options = { mode: "readwrite" };
    if (typeof handle.queryPermission === "function") {
      const current = await handle.queryPermission(options);
      if (current === "granted") return true;
    }
    if (typeof handle.requestPermission === "function") {
      return (await handle.requestPermission(options)) === "granted";
    }
    return true;
  }

  async function getWritableOutputFolder() {
    let handle = state.outputDirectoryHandle;
    if (!handle) {
      addLog("第一次保存请选择输出文件夹，之后同一浏览器会尽量记住。");
      handle = await chooseOutputFolder();
    }
    if (await ensureDirectoryPermission(handle)) {
      return handle;
    }
    addLog("保存位置需要重新授权，请重新选择输出文件夹。");
    return chooseOutputFolder({ startFromRemembered: false });
  }

  async function writeEntriesToFolder(rootHandle, entries) {
    const folderHandles = new Map();
    for (const entry of entries) {
      let folderHandle = folderHandles.get(entry.folder);
      if (!folderHandle) {
        folderHandle = await rootHandle.getDirectoryHandle(entry.folder, { create: true });
        folderHandles.set(entry.folder, folderHandle);
      }
      const fileHandle = await folderHandle.getFileHandle(entry.fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(entry.data);
      await writable.close();
    }
  }

  function addManualSheet() {
    const shop = els.manualShop.value.trim();
    const site = els.manualSite.value.trim();
    const sheetName = `${shop}-${site}`;
    if (!shop || !site) {
      addLog("请先填写店铺和站点。", "error");
      return;
    }

    try {
      const asins = extractSheetAsins(parseManualAsinText(els.manualAsins.value), sheetName);
      const nextSheet = { name: sheetName, shop, site, asins };
      const existingIndex = state.sheets.findIndex((sheet) => sheet.name === sheetName);
      if (existingIndex >= 0) {
        state.sheets[existingIndex] = nextSheet;
        addLog(`已更新网页清单: ${sheetName}，共 ${asins.length} 张。`, "success");
      } else {
        state.sheets.push(nextSheet);
        addLog(`已加入网页清单: ${sheetName}，共 ${asins.length} 张。`, "success");
      }
      state.tableFile = null;
      state.tableLabel = "网页内置表格";
      autoMatchImages();
      updateView();
    } catch (error) {
      addLog(error.message, "error");
    }
  }

  async function handleTableFile(file) {
    if (!file) return;
    resetLogs();
    state.tableFile = file;
    state.tableLabel = "";
    state.sheets = [];
    state.shopImages.clear();
    updateView();
    addLog(`正在解析表格: ${file.name}`);
    try {
      state.sheets = await parseTableFile(file);
      autoMatchImages();
      updateView();
      addLog(`表格解析完成，发现 ${state.sheets.length} 个处理清单，共 ${countOutputFiles()} 张输出图片。`, "success");
    } catch (error) {
      state.tableFile = null;
      state.sheets = [];
      state.shopImages.clear();
      updateView();
      addLog(error.message, "error");
    }
  }

  async function buildOutputEntries() {
    const entries = [];
    for (const sheet of state.sheets) {
      const image = state.shopImages.get(sheet.shop);
      const imageBytes = new Uint8Array(await image.arrayBuffer());
      const folder = safeSegment(sheet.name);
      sheet.asins.forEach((asin) => {
        entries.push({
          folder,
          fileName: `${asin}${OUTPUT_SUFFIX}`,
          name: `${folder}/${asin}${OUTPUT_SUFFIX}`,
          data: imageBytes,
        });
      });
    }
    return entries;
  }

  function setExportBusy(isBusy) {
    state.busy = isBusy;
    updateView();
  }

  async function saveToFolder() {
    if (!isReady()) return;
    if (!canSaveToFolder()) {
      addLog("当前浏览器不支持直接保存到文件夹，请使用 ZIP 备用。", "error");
      return;
    }
    setExportBusy(true);
    try {
      const rootHandle = await getWritableOutputFolder();
      const entries = await buildOutputEntries();
      await writeEntriesToFolder(rootHandle, entries);
      const folderName = rootHandle.name || "你选择的文件夹";
      addLog(`已保存 ${entries.length} 张图片到系统弹窗里选择的文件夹「${folderName}」。`, "success");
      addLog("浏览器不会告诉网页完整路径；如果找不到，请点“更换保存位置”，重新选择一个好认的子文件夹，例如 下载/GPSR输出。");
    } catch (error) {
      if (error && error.name === "AbortError") {
        addLog("已取消选择输出文件夹。");
      } else if (error && error.name === "NotAllowedError") {
        addLog("浏览器没有获得写入权限，请重新点击保存并允许访问文件夹。", "error");
      } else {
        addLog(error.message || String(error), "error");
      }
    } finally {
      setExportBusy(false);
    }
  }

  async function changeOutputFolder() {
    if (!canSaveToFolder()) {
      addLog("当前浏览器不支持直接保存到文件夹，请使用 ZIP 备用。", "error");
      return;
    }
    try {
      const handle = await chooseOutputFolder({ startFromRemembered: false });
      addLog(`已设置保存位置：系统弹窗里选择的文件夹「${handle.name || "已选择的文件夹"}」。`, "success");
      addLog("浏览器不会告诉网页完整路径，请记住刚才在系统弹窗里选的是哪个位置。");
    } catch (error) {
      if (error && error.name === "AbortError") {
        addLog("已取消设置保存位置。");
      } else {
        addLog(error.message || String(error), "error");
      }
    }
  }

  async function generateZip() {
    if (!isReady()) return;
    setExportBusy(true);
    addLog("开始生成 ZIP。");
    try {
      const entries = await buildOutputEntries();
      const zipBlob = createZipBlob(entries);
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      downloadBlob(zipBlob, `GPSR生成结果-${stamp}.zip`);
      addLog(`已生成 ${entries.length} 张图片。`, "success");
    } catch (error) {
      addLog(error.message, "error");
    } finally {
      setExportBusy(false);
    }
  }

  function makeCrcTable() {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    return table;
  }

  const CRC_TABLE = makeCrcTable();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.length; index += 1) {
      crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date) {
    const year = Math.max(date.getFullYear(), 1980);
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
  }

  function createZipBlob(entries) {
    const encoder = new TextEncoder();
    const now = dosDateTime(new Date());
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    entries.forEach((entry) => {
      const nameBytes = encoder.encode(entry.name);
      const data = entry.data;
      const crc = crc32(data);
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, now.time, true);
      localView.setUint16(12, now.day, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localView.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);
      localParts.push(localHeader, data);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, now.time, true);
      centralView.setUint16(14, now.day, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);
      centralParts.push(centralHeader);

      offset += localHeader.length + data.length;
    });

    const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, entries.length, true);
    endView.setUint16(10, entries.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    endView.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadTemplate() {
    if (!window.XLSX) {
      addLog("XLSX 解析库未加载，无法生成模板。", "error");
      return;
    }
    const rows = Array.from({ length: 10 }, () => ["ASIN：B012345678"]);
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "店铺-站点");
    const data = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    downloadBlob(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "GPSR表格模板.xlsx");
  }

  function resetAll() {
    state.tableFile = null;
    state.tableLabel = "";
    state.sheets = [];
    clearImages();
    state.shopImages.clear();
    state.busy = false;
    state.logs = ["等待导入文件。"];
    els.tableInput.value = "";
    els.imageInput.value = "";
    els.resourceDirectoryInput.value = "";
    els.manualShop.value = "";
    els.manualSite.value = "";
    els.manualAsins.value = "";
    els.logOutput.textContent = state.logs.join("\n");
    els.logBadge.textContent = "Ready";
    els.logBadge.className = "";
    updateView();
  }

  function setupDropZone(zone, callback) {
    ["dragenter", "dragover"].forEach((eventName) => {
      zone.addEventListener(eventName, (event) => {
        event.preventDefault();
        zone.classList.add("is-dragging");
      });
    });
    ["dragleave", "drop"].forEach((eventName) => {
      zone.addEventListener(eventName, (event) => {
        event.preventDefault();
        zone.classList.remove("is-dragging");
      });
    });
    zone.addEventListener("drop", (event) => {
      callback(Array.from(event.dataTransfer.files || []));
    });
  }

  function bindEvents() {
    els.tableInput.addEventListener("change", (event) => {
      const [file] = Array.from(event.target.files || []);
      handleTableFile(file);
    });
    els.imageInput.addEventListener("change", (event) => {
      addImages(Array.from(event.target.files || []));
    });
    els.resourceDirectoryInput.addEventListener("change", (event) => {
      const files = Array.from(event.target.files || []);
      addImages(files, "素材文件夹");
    });
    els.addManualSheetButton.addEventListener("click", addManualSheet);
    els.saveFolderButton.addEventListener("click", saveToFolder);
    els.changeOutputFolderButton.addEventListener("click", changeOutputFolder);
    els.generateZipButton.addEventListener("click", generateZip);
    els.resetButton.addEventListener("click", resetAll);
    els.downloadTemplateButton.addEventListener("click", downloadTemplate);
    setupDropZone(els.tableDropZone, ([file]) => handleTableFile(file));
    setupDropZone(els.imageDropZone, (files) => addImages(files));
  }

  bindEvents();
  updateView();
  restoreSavedOutputFolder();
  loadBundledImages();
  document.documentElement.dataset.gpsrReady = "true";
  document.documentElement.dataset.xlsxReady = String(Boolean(window.XLSX));

  window.GPSRWebTool = {
    test: {
      addImages,
      createZipBlob,
      handleTableFile,
      isValidJpeg,
      parseTableFile,
      summary: () => ({
        ready: isReady(),
        sheets: state.sheets.map((sheet) => ({
          name: sheet.name,
          shop: sheet.shop,
          site: sheet.site,
          count: sheet.asins.length,
        })),
        shops: getRequiredShops(),
        images: state.images.map((file) => file.name),
        matched: Array.from(state.shopImages.keys()),
        outputs: countOutputFiles(),
      }),
    },
  };
})();
