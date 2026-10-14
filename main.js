"use strict";

const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const db = require("./db/database");

let ventanaPrincipal = null;

function crearVentana() {
  ventanaPrincipal = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: "#0f172a",
    autoHideMenuBar: true,
    title: "MÓNICA 9 · Módulo Parámetros",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  ventanaPrincipal.webContents.on("did-finish-load", () => {
    console.log("Renderer cargado correctamente.");
    if (process.env.MONICA_SMOKE_TEST === "1") {
      console.log("SMOKE_OK");
      setTimeout(() => app.quit(), 600);
    }
  });

  ventanaPrincipal.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("Fallo al cargar el renderer:", code, desc, url);
  });

  ventanaPrincipal.loadFile(
    path.join(__dirname, "renderer", process.env.MONICA_SMOKE_PAGE || "index.html")
  );
}

/** Registra todos los controladores IPC del módulo de parámetros. */
function registrarIpc() {
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("db:ruta", () => db.rutaBase);

  ipcMain.handle("parametros:leer", () => db.leerParametros());
  ipcMain.handle("parametros:guardar", (_evt, payload) => db.guardarParametros(payload || {}));

  ipcMain.handle("contadores:leer", () => db.leerContadores());
  ipcMain.handle("contadores:actualizar", (_evt, { clave, valor }) =>
    db.actualizarContador(clave, valor)
  );

  ipcMain.handle("preferencias:leer", (_evt, clave) => db.leerPreferencia(clave));
  ipcMain.handle("preferencias:guardar", (_evt, { clave, valor }) =>
    db.guardarPreferencia(clave, valor)
  );
}

app.whenReady().then(async () => {
  try {
    const ruta = await db.init(app.getPath("userData"));
    console.log("Base de datos inicializada en:", ruta);
  } catch (err) {
    console.error("No se pudo inicializar la base de datos:", err);
  }

  registrarIpc();
  crearVentana();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
