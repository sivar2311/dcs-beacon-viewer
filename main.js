const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow = null;

function createWindow() {
  const preloadPath = path.join(__dirname, "preload.js");

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon : path.join(__dirname, "assets", "icon.ico"),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile("index.html");
}

function createAppMenu() {
  const template = [
    {
      label: "Datei",
      submenu: [
        {
          label: "Datei öffnen...",
          accelerator: "CmdOrCtrl+O",
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("menu:open-file");
            }
          }
        },
        { type: "separator" },
        {
          label: "Beenden",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Alt+F4",
          click: () => app.quit()
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

ipcMain.handle("dialog:openBeaconFile", async () => {
  const result = await dialog.showOpenDialog({
    title: "Beacon-LUA-Datei öffnen",
    properties: ["openFile"],
    filters: [
      { name: "Lua-Dateien", extensions: ["lua"] },
      { name: "Alle Dateien", extensions: ["*"] }
    ]
  });

  if (result.canceled || !result.filePaths.length) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, "utf8");

  return {
    canceled: false,
    filePath,
    content
  };
});

ipcMain.handle("maps:openWindow", (_event, latitude, longitude) => {
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;

  const mapWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    title: `Map (${latitude}, ${longitude})`,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mapWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mapWindow.loadURL(url);

  return true;
});

app.whenReady().then(() => {
  createAppMenu();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
