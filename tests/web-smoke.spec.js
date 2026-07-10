const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

let baseUrl;
const WEB_ROOT = path.resolve(__dirname, "..", "web");
const FIXTURE_DIR = path.resolve(__dirname, ".fixtures");

let server;

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((request, response) => {
      const url = new URL(request.url, baseUrl);
      const requestedPath = decodeURIComponent(url.pathname);
      const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
      const filePath = path.resolve(WEB_ROOT, relativePath);

      if (!filePath.startsWith(WEB_ROOT)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      fs.readFile(filePath, (error, data) => {
        if (error) {
          response.writeHead(404);
          response.end("Not found");
          return;
        }
        response.writeHead(200, { "Content-Type": contentType(filePath) });
        response.end(data);
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}/`;
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(resolve);
  });
}

function writeFixtures() {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.writeFileSync(path.join(FIXTURE_DIR, "manual.csv"), "ShopA-ES\nB012345678\nB012345678\n");
  fs.writeFileSync(path.join(FIXTURE_DIR, "legacy-extra-column.csv"), "ShopA-ES,备注\nB012345678,第一条\nB0ABCDEF12,第二条\n");
  fs.writeFileSync(path.join(FIXTURE_DIR, "legacy-three-columns.csv"), "ShopA-ES,备注,负责人\nB012345678,第一条,A\nB0ABCDEF12,第二条,B\n");
  fs.writeFileSync(path.join(FIXTURE_DIR, "three-column.csv"), "\ufeff店铺,站点,ASIN\nShopA,ES,B012345678\nShopA,ES,B0ABCDEF12\nShopB,DE,ASIN：B0BBBBBBB1\n");
  fs.writeFileSync(path.join(FIXTURE_DIR, "three-column-no-header.csv"), "ShopA,ES,B012345678\nShopB,DE,B0BBBBBBB1\n");
  fs.writeFileSync(path.join(FIXTURE_DIR, "ShopA-ES.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9]));
  fs.writeFileSync(path.join(FIXTURE_DIR, "ES-ShopA.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x01, 0xff, 0xd9]));
}

async function waitForReady(page) {
  await page.waitForFunction(() => document.documentElement.dataset.gpsrReady === "true");
}

test.beforeAll(async () => {
  writeFixtures();
  await startServer();
});

test.afterAll(async () => {
  await stopServer();
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

test("GPSR web workflow smoke test", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(baseUrl);
  await waitForReady(page);
  await expect(page.locator("h1")).toHaveText("GPSR 图片生成器");
  await expect(page.locator("#nextStepText")).toContainText("先导入");
  await expect(page.locator(".output-actions > button").first()).toHaveAttribute("id", "saveFolderButton");
  await expect(page.locator("#saveFolderButton")).toHaveClass(/primary-button/);
  await expect(page.locator("#generateZipButton")).toHaveText("下载 ZIP（备用）");
  await expect(page.locator("#saveModeHint")).toContainText(/\d{8}_\d{6}_v1/);
  await expect(page.locator("#bulkPasteInput")).toHaveCount(0);
  await expect(page.locator("#addBulkSheetsButton")).toHaveCount(0);
  await expect(page.locator("#resourceDirectoryInput")).toHaveCount(0);
  await expect(page.locator("#clearImageCacheButton")).toHaveCount(0);
  await expect(page.locator("#saveFolderButton")).toBeDisabled();
  await expect(page.locator("#generateZipButton")).toBeDisabled();
  await expect(page.locator("#exportSheetButton")).toBeDisabled();

  await page.locator("#tableInput").setInputFiles(path.join(FIXTURE_DIR, "manual.csv"));
  await expect(page.locator("#sheetCount")).toHaveText("1");
  await expect(page.locator("#outputCount")).toHaveText("1");
  await expect(page.locator("#nextStepText")).toContainText("下一步导入店铺 JPG");
  await expect(page.locator(".warn-text")).toContainText("已忽略重复 ASIN");

  await page.locator("#imageInput").setInputFiles([
    path.join(FIXTURE_DIR, "ShopA-ES.jpg"),
    path.join(FIXTURE_DIR, "ES-ShopA.jpg"),
  ]);
  await expect(page.locator("#matchBadge")).toHaveText("0 / 1");
  await expect(page.locator("#nextStepText")).toContainText("多张疑似图片");
  await expect(page.locator("#copyIssueListButton")).toBeVisible();
  await expect(page.locator(".shop-row")).toContainText("需手选");

  await page.locator(".shop-row input[type='file']").setInputFiles(path.join(FIXTURE_DIR, "ShopA-ES.jpg"));
  await expect(page.locator("#matchBadge")).toHaveText("1 / 1");
  await expect(page.locator("#readinessBadge")).toHaveText("可以生成");
  await expect(page.locator("#nextStepTitle")).toHaveText("可以生成");
  await expect(page.locator("#nextStepDetail")).toContainText("本次不会使用 1 张图片");

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#generateZipButton").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^GPSR生成结果-\d{8}_\d{6}_v1\.zip$/);
  const downloadPath = await download.path();
  const zipBuffer = fs.readFileSync(downloadPath);
  const zipText = zipBuffer.toString("latin1");
  expect(zipBuffer.includes(Buffer.from("GPSR生成清单.csv"))).toBe(false);
  expect(zipText).toMatch(/\d{8}_\d{6}_v1\/ShopA-ES\/B012345678\.PS01\.jpg/);
  expect(zipBuffer.includes(Buffer.from("ShopA,ES,ShopA-ES,B012345678"))).toBe(false);

  expect(errors).toEqual([]);
});

test("manual table entries persist draft and export csv", async ({ page }) => {
  await page.goto(baseUrl);
  await waitForReady(page);

  await page.locator("#manualShop").fill("ShopA");
  await page.locator("#manualSite").fill("ES");
  await page.locator("#manualAsins").fill(["B012345678", "B012345678", "B0ABCDEF12"].join("\n"));
  await page.locator("#addManualSheetButton").click();

  await page.locator("#manualShop").fill("ShopB");
  await page.locator("#manualSite").fill("DE");
  await page.locator("#manualAsins").fill("ASIN：B0BBBBBBB1");
  await page.locator("#addManualSheetButton").click();

  await expect(page.locator("#sheetCount")).toHaveText("2");
  await expect(page.locator("#shopCount")).toHaveText("2");
  await expect(page.locator("#outputCount")).toHaveText("3");
  await expect(page.locator("#tableFileName")).toHaveText("网页内置表格");
  await expect(page.locator("#exportSheetButton")).toBeEnabled();
  await expect(page.locator(".sheet-list")).toContainText("ShopA-ES");
  await expect(page.locator(".sheet-list")).toContainText("ShopB-DE");
  await expect(page.locator(".warn-text")).toContainText("已忽略重复 ASIN");

  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#tableFileName")).toHaveText("已恢复本机草稿");
  await expect(page.locator("#sheetCount")).toHaveText("2");
  await expect(page.locator("#outputCount")).toHaveText("3");

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportSheetButton").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^GPSR清单-\d{8}\.csv$/);

  await page.locator("#resetButton").click();
  await expect(page.locator("#sheetCount")).toHaveText("0");
  await expect(page.locator("#exportSheetButton")).toBeDisabled();
  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#sheetCount")).toHaveText("0");
});

test("three-column csv import matches exported format", async ({ page }) => {
  await page.goto(baseUrl);
  await waitForReady(page);

  await page.locator("#tableInput").setInputFiles(path.join(FIXTURE_DIR, "three-column.csv"));
  await expect(page.locator("#sheetCount")).toHaveText("2");
  await expect(page.locator("#shopCount")).toHaveText("2");
  await expect(page.locator("#outputCount")).toHaveText("3");
  await expect(page.locator("#tableFileName")).toHaveText("three-column.csv");
  await expect(page.locator(".sheet-list")).toContainText("ShopA-ES");
  await expect(page.locator(".sheet-list")).toContainText("ShopB-DE");

  await page.locator("#resetButton").click();
  await page.locator("#tableInput").setInputFiles(path.join(FIXTURE_DIR, "three-column-no-header.csv"));
  await expect(page.locator("#sheetCount")).toHaveText("2");
  await expect(page.locator("#shopCount")).toHaveText("2");
  await expect(page.locator("#outputCount")).toHaveText("2");
  await expect(page.locator("#tableFileName")).toHaveText("three-column-no-header.csv");
  await expect(page.locator(".sheet-list")).toContainText("ShopA-ES");
  await expect(page.locator(".sheet-list")).toContainText("ShopB-DE");
});

test("legacy csv with extra columns still uses first column", async ({ page }) => {
  await page.goto(baseUrl);
  await waitForReady(page);

  await page.locator("#tableInput").setInputFiles(path.join(FIXTURE_DIR, "legacy-extra-column.csv"));
  await expect(page.locator("#sheetCount")).toHaveText("1");
  await expect(page.locator("#shopCount")).toHaveText("1");
  await expect(page.locator("#outputCount")).toHaveText("2");
  await expect(page.locator("#tableFileName")).toHaveText("legacy-extra-column.csv");
  await expect(page.locator(".sheet-list")).toContainText("ShopA-ES");

  await page.locator("#resetButton").click();
  await page.locator("#tableInput").setInputFiles(path.join(FIXTURE_DIR, "legacy-three-columns.csv"));
  await expect(page.locator("#sheetCount")).toHaveText("1");
  await expect(page.locator("#shopCount")).toHaveText("1");
  await expect(page.locator("#outputCount")).toHaveText("2");
  await expect(page.locator("#tableFileName")).toHaveText("legacy-three-columns.csv");
  await expect(page.locator(".sheet-list")).toContainText("ShopA-ES");
});

test("manual jpgs are selected per session and not restored after reload", async ({ page }) => {
  await page.goto(baseUrl);
  await waitForReady(page);
  await expect(page.locator("#imageCount")).toHaveText("0");

  await page.locator("#imageInput").setInputFiles([
    path.join(FIXTURE_DIR, "ShopA-ES.jpg"),
    path.join(FIXTURE_DIR, "ES-ShopA.jpg"),
  ]);
  await expect(page.locator("#imageCount")).toHaveText("2");
  await expect(page.locator("#imageFileName")).toHaveText("2 张图片已导入");

  await page.reload();
  await waitForReady(page);
  await expect(page.locator("#imageCount")).toHaveText("0");
  await expect(page.locator("#imageFileName")).toHaveText("拖入或选择 JPG/JPEG，可多选");
});
