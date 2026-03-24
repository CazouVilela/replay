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
    { header: 'Inconsistencias', key: 'inconsistencia', width: 40 },
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
    to: `K${data.rows.length + 1}`,
  };

  // ==================== ABA PAGAMENTOS ====================
  // Status que NAO entram na soma
  const statusExcluidos = [
    'faltou (com aviso prévio)',
    'não atendido (sem cobrança)',
  ];

  // Agrupar por paciente e profissional (excluindo status nao cobraveis)
  const pagMap = {};       // { paciente: { total: N, profs: { profissional: N } } }
  const allProfs = new Set();

  for (const row of data.rows) {
    const statusLower = (row.status || '').toLowerCase();
    if (statusExcluidos.includes(statusLower)) continue;

    const paciente = (row.paciente || '').trim();
    const profissional = (row.profissional || '').trim();
    const valor = parseFloat((row.valor || '0').replace(/\./g, '').replace(',', '.')) || 0;

    if (!paciente) continue;

    const convenio = (row.convenio || '').trim();

    if (!pagMap[paciente]) pagMap[paciente] = { total: 0, convenio: '', profs: {} };
    pagMap[paciente].total += valor;
    if (convenio && !pagMap[paciente].convenio) pagMap[paciente].convenio = convenio;

    if (profissional) {
      allProfs.add(profissional);
      pagMap[paciente].profs[profissional] = (pagMap[paciente].profs[profissional] || 0) + valor;
    }
  }

  if (Object.keys(pagMap).length > 0) {
    const sheetPag = workbook.addWorksheet('Pagamentos');
    const profsList = Array.from(allProfs).sort();

    // Cabecalho: Paciente | Total | Prof1 | Prof2 | ...
    sheetPag.columns = [
      { header: 'Paciente', key: 'paciente', width: 30 },
      { header: 'Convenio', key: 'convenio', width: 20 },
      { header: 'Total', key: 'total', width: 14 },
      ...profsList.map(p => ({ header: p, key: `prof_${p}`, width: 20 })),
    ];

    // Estilo do cabecalho
    sheetPag.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565C0' } };
      cell.alignment = { horizontal: 'center' };
    });

    // Dados
    const pacientes = Object.keys(pagMap).sort();
    for (const pac of pacientes) {
      const rowData = {
        paciente: pac,
        convenio: pagMap[pac].convenio,
        total: pagMap[pac].total,
      };
      for (const prof of profsList) {
        const v = pagMap[pac].profs[prof] || 0;
        rowData[`prof_${prof}`] = v > 0 ? v : '';
      }
      sheetPag.addRow(rowData);
    }

    // Formato moeda nas colunas de valor
    const moneyFmt = '#.##0,00';
    for (let col = 3; col <= profsList.length + 3; col++) {
      sheetPag.getColumn(col).numFmt = moneyFmt;
    }
  }

  await workbook.xlsx.writeFile(filePath);
  return { success: true, filePath };
});

// IPC: Carregar tabela de precos (.xlsx)
ipcMain.handle('load-price-table', async (event, fileData) => {
  const ExcelJS = require('exceljs');

  const workbook = new ExcelJS.Workbook();
  const buffer = Buffer.from(fileData);
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];

  // Header: coluna 1 = "Pacientes" (ignorar), colunas 2+ = especialidades
  const specialties = [];
  sheet.getRow(1).eachCell((cell, colNumber) => {
    if (colNumber > 1) {
      specialties.push({ col: colNumber, name: (cell.value || '').toString().trim() });
    }
  });

  // Dados: coluna 1 = nome paciente, colunas 2+ = valores
  const priceMap = {};
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const patient = (row.getCell(1).value || '').toString().trim();
    if (!patient) return;
    const key = patient.toLowerCase();
    priceMap[key] = {};
    for (const spec of specialties) {
      const val = row.getCell(spec.col).value;
      priceMap[key][spec.name.toLowerCase()] = parseFloat(val) || 0;
    }
  });

  return {
    specialties: specialties.map(s => s.name),
    priceMap,
    patientCount: Object.keys(priceMap).length,
  };
});

// IPC: Capturar DOM para debug
ipcMain.handle('save-debug', async (event, { filename, content }) => {
  const debugDir = path.join(app.getPath('userData'), 'debug');
  if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
  const filePath = path.join(debugDir, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
});
