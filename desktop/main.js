// desktop/main.js
// Electron main process - janela principal com webview do ZenFisio

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 900,
    title: 'Replay - Extrator ZenFisio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

// IPC: Salvar arquivo Excel
ipcMain.handle('save-excel', async (event, data) => {
  const ExcelJS = require('exceljs');

  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Salvar planilha',
    defaultPath: `Agenda_ZenFisio_${data.periodo}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });

  if (!filePath) return { success: false, reason: 'cancelado' };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Replay';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Agendamentos');

  // Cabecalho
  sheet.columns = [
    { header: 'Data', key: 'data', width: 14 },
    { header: 'Horario', key: 'horario', width: 10 },
    { header: 'Profissional', key: 'profissional', width: 28 },
    { header: 'Especialidade', key: 'especialidade', width: 22 },
    { header: 'Paciente', key: 'paciente', width: 30 },
    { header: 'Valor', key: 'valor', width: 14 },
    { header: 'Pago', key: 'pago', width: 10 },
    { header: 'Data Pgto', key: 'dataPagamento', width: 14 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Convenio', key: 'convenio', width: 20 },
  ];

  // Estilo do cabecalho
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2E7D32' },
    };
    cell.alignment = { horizontal: 'center' };
  });

  // Dados
  for (const row of data.rows) {
    sheet.addRow(row);
  }

  // Auto-filtro
  sheet.autoFilter = {
    from: 'A1',
    to: `J${data.rows.length + 1}`,
  };

  await workbook.xlsx.writeFile(filePath);
  return { success: true, filePath };
});

// IPC: Capturar DOM para debug
ipcMain.handle('save-debug', async (event, { filename, content }) => {
  const debugDir = path.join(app.getPath('userData'), 'debug');
  if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
  const filePath = path.join(debugDir, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
});
