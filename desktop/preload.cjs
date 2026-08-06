const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopCamera", {
  getConnectionInfo: () => ipcRenderer.invoke("phone-camera:get-info"),
  copyConnectionUrl: () => ipcRenderer.invoke("phone-camera:copy-url"),
  onPhoto: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("phone-camera:photo", listener);
    return () => ipcRenderer.removeListener("phone-camera:photo", listener);
  }
});
