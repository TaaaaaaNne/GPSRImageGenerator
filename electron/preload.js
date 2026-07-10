const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("GPSRDesktop", {
  isDesktop: true,
  getInfo: () => ipcRenderer.invoke("gpsr:get-desktop-info"),
  selectOutputDirectory: (currentDirectory) => ipcRenderer.invoke("gpsr:select-output-directory", currentDirectory),
  saveEntries: (payload) => ipcRenderer.invoke("gpsr:save-entries", payload),
  openOutputDirectory: (directoryPath) => ipcRenderer.invoke("gpsr:open-output-directory", directoryPath),
});
