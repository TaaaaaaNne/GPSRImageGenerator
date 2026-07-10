const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("fs/promises");
const path = require("path");

const DEFAULT_OUTPUT_FOLDER = "GPSR输出";

function getDefaultOutputDirectory() {
  return path.join(app.getPath("downloads"), DEFAULT_OUTPUT_FOLDER);
}

function sanitizeSegment(value, fallback = "output") {
  const text = String(value || "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .trim();
  return text || fallback;
}

function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (Array.isArray(data)) return Buffer.from(data);
  if (data && data.type === "Buffer" && Array.isArray(data.data)) return Buffer.from(data.data);
  throw new Error("无法读取输出图片数据。");
}

async function ensureDirectory(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true });
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "GPSR 图片生成器",
    backgroundColor: "#f3f6f4",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "web", "index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("gpsr:get-desktop-info", async () => {
    const defaultOutputDirectory = getDefaultOutputDirectory();
    await ensureDirectory(defaultOutputDirectory);
    return {
      defaultOutputDirectory,
      platform: process.platform,
    };
  });

  ipcMain.handle("gpsr:select-output-directory", async (_event, currentDirectory) => {
    const defaultOutputDirectory = currentDirectory || getDefaultOutputDirectory();
    await ensureDirectory(defaultOutputDirectory);
    const result = await dialog.showOpenDialog({
      title: "选择 GPSR 输出文件夹",
      defaultPath: defaultOutputDirectory,
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("gpsr:save-entries", async (_event, payload) => {
    const outputDirectory = payload && payload.outputDirectory
      ? payload.outputDirectory
      : getDefaultOutputDirectory();
    const entries = Array.isArray(payload && payload.entries) ? payload.entries : [];

    await ensureDirectory(outputDirectory);
    for (const entry of entries) {
      const folder = sanitizeSegment(entry.folder);
      const fileName = sanitizeSegment(entry.fileName, "image.jpg");
      const targetDirectory = path.join(outputDirectory, folder);
      await ensureDirectory(targetDirectory);
      await fs.writeFile(path.join(targetDirectory, fileName), toBuffer(entry.data));
    }

    return {
      count: entries.length,
      outputDirectory,
    };
  });

  ipcMain.handle("gpsr:open-output-directory", async (_event, directoryPath) => {
    const target = directoryPath || getDefaultOutputDirectory();
    await ensureDirectory(target);
    const errorMessage = await shell.openPath(target);
    if (errorMessage) throw new Error(errorMessage);
    return target;
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
