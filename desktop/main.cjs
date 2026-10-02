const { app, BrowserWindow, shell } = require("electron");

const appUrl = new URL("https://keinsuchti.github.io/");

function openExternalUrl(url) {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol === "https:") {
      void shell.openExternal(parsedUrl.href).catch((error) => {
        console.error("Externer Link konnte nicht geöffnet werden:", error);
      });
    }
  } catch (error) {
    console.error("Ungültiger externer Link:", error);
  }
}

function handleNavigation(event, url) {
  try {
    if (new URL(url).origin === appUrl.origin) {
      return;
    }
  } catch {
    event.preventDefault();
    return;
  }

  event.preventDefault();
  openExternalUrl(url);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 360,
    minHeight: 560,
    autoHideMenuBar: true,
    backgroundColor: "#131019",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", handleNavigation);
  window.webContents.on("will-redirect", handleNavigation);

  void window.loadURL(appUrl.href).catch((error) => {
    console.error("Die Website konnte nicht geladen werden:", error);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
