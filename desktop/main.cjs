const { app, BrowserWindow, clipboard, ipcMain, session, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const QRCode = require("qrcode");

const APP_ENTRY = path.join(__dirname, "..", "index.html");
const APP_ICON = path.join(__dirname, "..", "assets", "moeys-logo.png");
const PHONE_CAMERA_PAGE = fs.readFileSync(path.join(__dirname, "phone-camera.html"), "utf8");
const ALLOWED_PERMISSIONS = new Set(["media"]);
const MAX_PHONE_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_PHONE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

let mainWindow = null;
let phoneCameraBridge = null;

function lanIpv4Addresses() {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" || entry.internal || entry.address.startsWith("169.254.")) continue;
      addresses.push(entry.address);
    }
  }
  return [...new Set(addresses)].sort((a, b) => {
    const score = value => value.startsWith("192.168.") ? 0 : value.startsWith("10.") ? 1 : 2;
    return score(a) - score(b);
  });
}

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function startPhoneCameraBridge() {
  return new Promise((resolve, reject) => {
    const token = crypto.randomBytes(24).toString("hex");
    const server = http.createServer((request, response) => {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      if (requestUrl.searchParams.get("token") !== token) {
        jsonResponse(response, 403, { ok: false, error: "Invalid or expired connection" });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/camera") {
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'"
        });
        response.end(PHONE_CAMERA_PAGE);
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/upload") {
        const mimeType = String(request.headers["content-type"] || "").split(";", 1)[0].toLowerCase();
        const declaredLength = Number(request.headers["content-length"] || 0);
        if (!ALLOWED_PHONE_PHOTO_TYPES.has(mimeType)) {
          jsonResponse(response, 415, { ok: false, error: "Please send a JPEG, PNG, or WebP photo" });
          return;
        }
        if (declaredLength > MAX_PHONE_PHOTO_BYTES) {
          jsonResponse(response, 413, { ok: false, error: "Photo is larger than 10 MB" });
          request.destroy();
          return;
        }

        const chunks = [];
        let size = 0;
        request.on("data", chunk => {
          size += chunk.length;
          if (size > MAX_PHONE_PHOTO_BYTES) {
            request.destroy();
            return;
          }
          chunks.push(chunk);
        });
        request.on("end", () => {
          if (!size || size > MAX_PHONE_PHOTO_BYTES) {
            if (!response.headersSent) jsonResponse(response, 413, { ok: false, error: "Invalid photo size" });
            return;
          }
          if (!mainWindow || mainWindow.isDestroyed()) {
            jsonResponse(response, 409, { ok: false, error: "Desktop app is not ready" });
            return;
          }
          const dataUrl = `data:${mimeType};base64,${Buffer.concat(chunks).toString("base64")}`;
          mainWindow.webContents.send("phone-camera:photo", {
            dataUrl,
            mimeType,
            size,
            receivedAt: new Date().toISOString()
          });
          jsonResponse(response, 200, { ok: true });
        });
        request.on("error", () => {
          if (!response.headersSent) jsonResponse(response, 400, { ok: false, error: "Upload interrupted" });
        });
        return;
      }

      jsonResponse(response, 404, { ok: false, error: "Not found" });
    });

    server.on("error", reject);
    server.listen(0, "0.0.0.0", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const urls = lanIpv4Addresses().map(ip => `http://${ip}:${port}/camera?token=${token}`);
      phoneCameraBridge = { server, token, port, urls };
      resolve(phoneCameraBridge);
    });
  });
}

async function phoneCameraConnectionInfo() {
  const urls = phoneCameraBridge ? phoneCameraBridge.urls : [];
  const url = urls[0] || "";
  return {
    available: Boolean(url),
    url,
    alternateUrls: urls.slice(1),
    qrDataUrl: url ? await QRCode.toDataURL(url, { width: 280, margin: 1, errorCorrectionLevel: "M" }) : ""
  };
}

function isAppPage(rawUrl) {
  try {
    return new URL(rawUrl).protocol === "file:";
  } catch {
    return false;
  }
}

function openExternalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "https:" || url.protocol === "mailto:") {
      void shell.openExternal(url.href);
    }
  } catch {
    // Ignore malformed links instead of passing them to the operating system.
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "Students Registration",
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    icon: APP_ICON,
    backgroundColor: "#f4f7f6",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  const showWindow = () => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show();
  };
  const visibilityFallback = setTimeout(showWindow, 5000);

  mainWindow.once("ready-to-show", showWindow);
  mainWindow.webContents.once("did-finish-load", showWindow);
  mainWindow.once("closed", () => {
    clearTimeout(visibilityFallback);
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === "about:blank") {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
          }
        }
      };
    }

    openExternalUrl(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAppPage(url)) return;
    event.preventDefault();
    openExternalUrl(url);
  });

  void mainWindow.loadFile(APP_ENTRY);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const existingWindow = mainWindow || BrowserWindow.getAllWindows()[0];
    if (!existingWindow) return;
    if (existingWindow.isMinimized()) existingWindow.restore();
    existingWindow.focus();
  });

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionCheckHandler((webContents, permission) =>
      Boolean(webContents && isAppPage(webContents.getURL()) && ALLOWED_PERMISSIONS.has(permission))
    );

    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(Boolean(isAppPage(webContents.getURL()) && ALLOWED_PERMISSIONS.has(permission)));
    });

    ipcMain.handle("phone-camera:get-info", () => phoneCameraConnectionInfo());
    ipcMain.handle("phone-camera:copy-url", async () => {
      const info = await phoneCameraConnectionInfo();
      if (info.url) clipboard.writeText(info.url);
      return Boolean(info.url);
    });

    try {
      await startPhoneCameraBridge();
    } catch (error) {
      console.error("Phone camera bridge failed to start:", error);
    }

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (phoneCameraBridge && phoneCameraBridge.server) phoneCameraBridge.server.close();
});
