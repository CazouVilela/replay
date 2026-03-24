// src/index.js
// Replay CLI - Extrator de Agenda ZenFisio
// Uso: node src/index.js
//
// Fluxo:
// 1. Abre browser headless
// 2. Carrega sessao salva (se existir) ou faz login
// 3. Pergunta periodo
// 4. Extrai dados dia a dia
// 5. Gera Excel

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const readline = require('readline/promises');

const DEBUG_DIR = path.join(__dirname, '..', 'debug');
const SESSION_FILE = path.join(__dirname, '..', 'session.json');
const CALENDAR_URL = 'https://app.zenfisio.com/calendar';

if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });

// ==================== HELPERS ====================

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function log(msg) {
  const ts = new Date().toLocaleTimeString('pt-BR');
  console.log(`[${ts}] ${msg}`);
}

function warn(msg) {
  const ts = new Date().toLocaleTimeString('pt-BR');
  console.log(`[${ts}] ⚠ ${msg}`);
}

function ok(msg) {
  const ts = new Date().toLocaleTimeString('pt-BR');
  console.log(`[${ts}] ✓ ${msg}`);
}

async function screenshot(page, name) {
  const filepath = path.join(DEBUG_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  log(`Screenshot: debug/${name}.png`);
}

async function dumpHTML(page, name) {
  const html = await page.content();
  const filepath = path.join(DEBUG_DIR, `${name}.html`);
  fs.writeFileSync(filepath, html, 'utf-8');
  log(`HTML dump: debug/${name}.html`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ==================== BROWSER ====================

async function launchBrowser() {
  log('Iniciando browser...');

  const contextOptions = {
    viewport: { width: 1280, height: 900 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  };

  // Carregar sessao salva se existir
  if (fs.existsSync(SESSION_FILE)) {
    log('Sessao salva encontrada. Carregando...');
    contextOptions.storageState = SESSION_FILE;
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext(contextOptions);
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await context.newPage();
  ok('Browser pronto.');
  return { browser, context, page };
}

// ==================== LOGIN ====================

async function ensureLoggedIn(page, context) {
  log('Navegando para o calendario...');
  await page.goto(CALENDAR_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(2000);
  await screenshot(page, '01-inicio');

  const url = page.url();

  if (!url.includes('login')) {
    ok('Sessao ativa! Ja esta no calendario.');
    return true;
  }

  log('Tela de login detectada.');
  await screenshot(page, '02-login');

  const email = await rl.question('Email ZenFisio: ');
  const senha = await rl.question('Senha: ');

  // Preencher formulario
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', senha);
  await screenshot(page, '03-formulario-preenchido');

  // Aguardar Turnstile
  log('Aguardando Cloudflare Turnstile...');
  log('(Isso pode levar ate 30s em headless. Se falhar, usaremos cookies do seu browser.)');

  // Esperar o turnstile-response ser preenchido ou o botao ficar habilitado
  let turnstileOk = false;
  for (let i = 0; i < 30; i++) {
    const btnDisabled = await page.evaluate(() => {
      const btn = document.getElementById('submitBtn');
      return btn ? btn.disabled : true;
    });
    const tokenVal = await page.evaluate(() => {
      const input = document.querySelector('input[name="cf-turnstile-response"]');
      return input ? input.value : '';
    });
    if (!btnDisabled && tokenVal.length > 10) {
      turnstileOk = true;
      break;
    }
    if (i % 5 === 0) log(`  Tentativa ${i + 1}/30...`);
    await sleep(1000);
  }

  if (!turnstileOk) {
    await screenshot(page, '04-turnstile-falhou');
    warn('Turnstile nao completou automaticamente.');
    console.log('');
    console.log('=== INSTRUCOES PARA IMPORTAR COOKIES ===');
    console.log('1. Abra https://app.zenfisio.com/calendar no seu browser Windows');
    console.log('2. Faca login normalmente');
    console.log('3. Abra DevTools (F12) > Console');
    console.log('4. Cole: document.cookie');
    console.log('5. Copie o resultado e cole aqui:');
    console.log('');

    const cookieStr = await rl.question('Cookies (ou Enter para cancelar): ');
    if (!cookieStr.trim()) {
      throw new Error('Login cancelado.');
    }

    // Injetar cookies
    const cookies = cookieStr.split(';').map(c => {
      const [name, ...rest] = c.trim().split('=');
      return {
        name: name.trim(),
        value: rest.join('=').trim(),
        domain: '.zenfisio.com',
        path: '/',
      };
    }).filter(c => c.name && c.value);

    await context.addCookies(cookies);
    log(`${cookies.length} cookies injetados.`);

    // Tentar navegar novamente
    await page.goto(CALENDAR_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(2000);
    await screenshot(page, '05-pos-cookies');

    if (page.url().includes('login')) {
      throw new Error('Login falhou mesmo com cookies. Verifique debug/05-pos-cookies.png');
    }
  } else {
    // Turnstile OK, clicar em Entrar
    ok('Turnstile completado!');
    await page.click('#submitBtn');
    log('Clicou em Entrar...');

    try {
      await page.waitForURL(url => !url.includes('login'), { timeout: 15000 });
    } catch {
      await sleep(3000);
    }
    await screenshot(page, '05-pos-login');

    if (page.url().includes('login')) {
      await screenshot(page, '05-login-falhou');
      throw new Error('Login falhou. Verifique credenciais. (debug/05-login-falhou.png)');
    }
  }

  // Salvar sessao para proxima vez
  await context.storageState({ path: SESSION_FILE });
  ok('Login OK! Sessao salva em session.json');
  return true;
}

// ==================== EXTRACAO ====================

async function setupView(page) {
  log('Configurando visualizacao...');
  await screenshot(page, '10-calendario-antes-config');
  await dumpHTML(page, '10-calendario');

  // Descobrir a estrutura da pagina
  const pageInfo = await page.evaluate(() => {
    const info = {
      url: window.location.href,
      buttons: [],
      links: [],
      selects: [],
      checkboxes: [],
    };

    // Botoes
    document.querySelectorAll('button, .btn, [role="button"], a.btn').forEach(el => {
      const text = el.textContent.trim().substring(0, 60);
      if (text) {
        info.buttons.push({
          text,
          tag: el.tagName,
          classes: el.className.substring(0, 80),
          id: el.id,
          visible: el.offsetParent !== null,
        });
      }
    });

    // Selects
    document.querySelectorAll('select').forEach(el => {
      info.selects.push({
        name: el.name,
        id: el.id,
        options: Array.from(el.options).slice(0, 10).map(o => o.text.substring(0, 40)),
      });
    });

    // Checkboxes
    document.querySelectorAll('input[type="checkbox"]').forEach(el => {
      const label = el.closest('label')?.textContent?.trim() ||
                    document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() || '';
      info.checkboxes.push({
        name: el.name,
        id: el.id,
        checked: el.checked,
        label: label.substring(0, 60),
      });
    });

    return info;
  });

  // Salvar para debug
  fs.writeFileSync(
    path.join(DEBUG_DIR, '10-page-info.json'),
    JSON.stringify(pageInfo, null, 2),
    'utf-8'
  );
  log(`Pagina analisada: ${pageInfo.buttons.length} botoes, ${pageInfo.selects.length} selects, ${pageInfo.checkboxes.length} checkboxes`);
  log('Detalhes em debug/10-page-info.json');

  // Tentar clicar "Selecionar todos"
  const selectAllClicked = await page.evaluate(() => {
    // Procurar por texto "Selecionar todos", "Todos", checkbox geral
    const candidates = [
      ...document.querySelectorAll('button, a, label, span, div'),
    ];
    for (const el of candidates) {
      const text = el.textContent.trim().toLowerCase();
      if (text === 'selecionar todos' || text === 'todos' || text === 'select all') {
        el.click();
        return `Clicou em: "${el.textContent.trim()}" (${el.tagName}.${el.className})`;
      }
    }
    return null;
  });

  if (selectAllClicked) {
    ok(selectAllClicked);
  } else {
    warn('"Selecionar todos" nao encontrado. Verifique debug/10-page-info.json');
  }
  await sleep(1000);

  // Tentar selecionar "Lista do dia"
  const listClicked = await page.evaluate(() => {
    const candidates = [
      ...document.querySelectorAll('button, a, label, span, div, li'),
    ];
    for (const el of candidates) {
      const text = el.textContent.trim().toLowerCase();
      if (text.includes('lista') && (text.includes('dia') || text.length < 20)) {
        el.click();
        return `Clicou em: "${el.textContent.trim()}" (${el.tagName}.${el.className})`;
      }
    }
    return null;
  });

  if (listClicked) {
    ok(listClicked);
  } else {
    warn('"Lista do dia" nao encontrado. Verifique debug/10-page-info.json');
  }
  await sleep(1500);
  await screenshot(page, '11-apos-config');
}

async function navigateToDate(page, dateISO) {
  log(`Navegando para ${dateISO}...`);

  // Tentar via URL com parametro date
  const targetUrl = `${CALENDAR_URL}?date=${dateISO}`;
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(2000);
  await screenshot(page, `20-dia-${dateISO}`);
}

async function extractDayAppointments(page, dateISO) {
  const appointments = [];
  const [y, m, d] = dateISO.split('-');
  const dateStr = `${d}/${m}/${y}`;

  log(`Extraindo agendamentos de ${dateStr}...`);
  await dumpHTML(page, `30-lista-${dateISO}`);

  // Descobrir itens clicaveis na lista
  const items = await page.evaluate(() => {
    // Seletores comuns para agendamentos
    const selectors = [
      '.fc-event', '.fc-list-event', '.fc-list-event-title',
      '.appointment', '.schedule-item', '.event-item',
      '[class*="agendamento"]', '[class*="appointment"]',
      'tr[data-id]', 'tr.event', 'div.event',
      '.list-group-item', '.calendar-event',
    ];

    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        return {
          selector: sel,
          count: els.length,
          samples: Array.from(els).slice(0, 3).map(el => ({
            tag: el.tagName,
            classes: el.className.substring(0, 80),
            text: el.textContent.trim().substring(0, 100),
            dataId: el.dataset.id || '',
          })),
        };
      }
    }

    // Fallback: procurar quaisquer elementos que parecem itens de lista
    const all = document.querySelectorAll('tr, li, .card, .item');
    const clickable = Array.from(all).filter(el => {
      const text = el.textContent.trim();
      return text.length > 5 && text.length < 200 && el.querySelector('a, button, [onclick]');
    });

    if (clickable.length > 0) {
      return {
        selector: 'fallback',
        count: clickable.length,
        samples: clickable.slice(0, 3).map(el => ({
          tag: el.tagName,
          classes: el.className.substring(0, 80),
          text: el.textContent.trim().substring(0, 100),
        })),
      };
    }

    return { selector: null, count: 0, samples: [] };
  });

  fs.writeFileSync(
    path.join(DEBUG_DIR, `30-items-${dateISO}.json`),
    JSON.stringify(items, null, 2),
    'utf-8'
  );

  if (!items.selector || items.count === 0) {
    warn(`Nenhum item encontrado em ${dateStr}. Verifique debug/30-items-${dateISO}.json e debug/30-lista-${dateISO}.html`);
    return appointments;
  }

  log(`Encontrou ${items.count} itens com seletor: ${items.selector}`);
  log(`Amostra: ${items.samples.map(s => s.text.substring(0, 40)).join(' | ')}`);

  // Iterar nos itens
  for (let i = 0; i < items.count; i++) {
    log(`  Item ${i + 1}/${items.count}...`);

    try {
      if (items.selector === 'fallback') {
        // Fallback nao e confiavel, pular
        warn('  Seletor fallback nao confiavel. Ajuste necessario.');
        break;
      }

      // Clicar no item
      await page.locator(items.selector).nth(i).click();
      await sleep(1500);
      await screenshot(page, `31-popup-${dateISO}-${i + 1}`);

      // Tentar extrair dados do popup/modal
      const popupData = await page.evaluate(() => {
        // Procurar modal/popup aberto
        const modal = document.querySelector(
          '.modal.show, .modal.in, .modal[style*="display: block"], ' +
          '.popup:not(.hidden), [role="dialog"]:not([aria-hidden="true"]), ' +
          '.popover.show, .swal2-popup, .sweet-alert'
        );

        if (!modal) return { found: false, html: '' };

        const getText = (selectors) => {
          for (const sel of selectors) {
            const el = modal.querySelector(sel);
            if (el) {
              const text = (el.value || el.textContent || '').trim();
              if (text) return text;
            }
          }
          return '';
        };

        return {
          found: true,
          fullText: modal.textContent.trim().substring(0, 2000),
          html: modal.innerHTML.substring(0, 5000),
          title: getText(['.modal-title', 'h3', 'h4', 'h5', '.title', '.name']),
        };
      });

      if (!popupData.found) {
        warn(`  Popup nao encontrado apos clicar item ${i + 1}.`);
        // Dump para debug
        await dumpHTML(page, `31-no-popup-${dateISO}-${i + 1}`);
        continue;
      }

      // Salvar popup HTML para analise
      fs.writeFileSync(
        path.join(DEBUG_DIR, `31-popup-${dateISO}-${i + 1}.json`),
        JSON.stringify(popupData, null, 2),
        'utf-8'
      );

      const paciente = popupData.title;
      log(`  Paciente (titulo popup): ${paciente || '?'}`);

      // Tentar clicar no icone de edicao (azul, no rodape do popup)
      const editClicked = await page.evaluate(() => {
        const modal = document.querySelector(
          '.modal.show, .modal.in, .modal[style*="display: block"], ' +
          '.popup:not(.hidden), [role="dialog"], .popover.show, .swal2-popup'
        );
        if (!modal) return false;

        // Procurar icone/botao de edicao
        const candidates = modal.querySelectorAll('a, button, i, svg, span');
        for (const el of candidates) {
          const classes = (el.className || '').toString().toLowerCase();
          const title = (el.title || el.getAttribute('aria-label') || '').toLowerCase();
          const parent = el.parentElement;
          const parentClasses = (parent?.className || '').toString().toLowerCase();

          if (
            classes.includes('edit') || classes.includes('pencil') || classes.includes('fa-edit') ||
            classes.includes('fa-pencil') || classes.includes('btn-primary') ||
            title.includes('edit') || title.includes('editar') ||
            (classes.includes('blue') || parentClasses.includes('blue'))
          ) {
            (parent?.tagName === 'A' || parent?.tagName === 'BUTTON' ? parent : el).click();
            return true;
          }
        }

        // Fallback: procurar ultimo link/botao no footer do modal
        const footer = modal.querySelector('.modal-footer, .popup-footer, .footer');
        if (footer) {
          const btns = footer.querySelectorAll('a, button');
          for (const btn of btns) {
            const cls = btn.className.toLowerCase();
            if (cls.includes('primary') || cls.includes('info') || cls.includes('edit')) {
              btn.click();
              return true;
            }
          }
        }

        return false;
      });

      if (editClicked) {
        ok('  Clicou no icone de edicao.');
        await sleep(2000);
        await screenshot(page, `32-edicao-${dateISO}-${i + 1}`);
      } else {
        warn('  Icone de edicao nao encontrado.');
        await screenshot(page, `32-sem-edicao-${dateISO}-${i + 1}`);
      }

      // Extrair dados da tela de edicao
      const editData = await page.evaluate(() => {
        const data = {};
        const fields = document.querySelectorAll('input, select, textarea');
        fields.forEach(f => {
          const name = f.name || f.id || '';
          const label = f.closest('label')?.textContent?.trim() ||
                        document.querySelector(`label[for="${f.id}"]`)?.textContent?.trim() || '';
          const value = f.value || '';
          if (name || label) {
            data[name || label] = { value, label, name, type: f.type, tag: f.tagName };
          }
        });
        return data;
      });

      fs.writeFileSync(
        path.join(DEBUG_DIR, `32-fields-${dateISO}-${i + 1}.json`),
        JSON.stringify(editData, null, 2),
        'utf-8'
      );

      // Mapear campos
      let horario = '', profissional = '', especialidade = '', valor = '', pago = '', dataPagamento = '';

      for (const [key, field] of Object.entries(editData)) {
        const k = (key + ' ' + field.label).toLowerCase();
        const v = field.value;
        if (!v) continue;

        if (k.match(/hor[aá]rio|hora|time|hour|start/)) horario = v;
        else if (k.match(/profissional|professional|terap|fisio|provider/)) {
          const match = v.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
          if (match) { profissional = match[1].trim(); especialidade = match[2].trim(); }
          else { profissional = v; }
        }
        else if (k.match(/valor|preco|price|value/) && !k.match(/pag/)) valor = v;
        else if (k.match(/data.*pag|date.*pay/)) dataPagamento = v;
        else if (k.match(/pago|pagamento|payment|paid|status/)) pago = v;
      }

      appointments.push({ data: dateStr, horario, profissional, especialidade, paciente, valor, pago, dataPagamento });
      ok(`  ${paciente || '?'} | ${horario || '?'} | ${profissional || '?'} | R$ ${valor || '?'}`);

      // Fechar modal
      await page.keyboard.press('Escape');
      await sleep(500);
      await page.keyboard.press('Escape');
      await sleep(500);

    } catch (err) {
      warn(`  Erro item ${i + 1}: ${err.message}`);
      await screenshot(page, `erro-${dateISO}-${i + 1}`);
      await page.keyboard.press('Escape');
      await sleep(500);
    }
  }

  log(`${appointments.length} agendamentos extraidos de ${dateStr}.`);
  return appointments;
}

// ==================== EXCEL ====================

async function saveExcel(appointments, startDate, endDate) {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Replay';
  const sheet = workbook.addWorksheet('Agendamentos');

  sheet.columns = [
    { header: 'Data', key: 'data', width: 14 },
    { header: 'Horario', key: 'horario', width: 10 },
    { header: 'Profissional', key: 'profissional', width: 28 },
    { header: 'Especialidade', key: 'especialidade', width: 22 },
    { header: 'Paciente', key: 'paciente', width: 30 },
    { header: 'Valor', key: 'valor', width: 14 },
    { header: 'Pago', key: 'pago', width: 10 },
    { header: 'Data Pgto', key: 'dataPagamento', width: 14 },
  ];

  sheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
    cell.alignment = { horizontal: 'center' };
  });

  for (const row of appointments) sheet.addRow(row);

  const filename = `Agenda_ZenFisio_${startDate.replace(/\//g, '-')}_a_${endDate.replace(/\//g, '-')}.xlsx`;
  const filepath = path.join(__dirname, '..', filename);
  await workbook.xlsx.writeFile(filepath);
  return filepath;
}

// ==================== MAIN ====================

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║  REPLAY - Extrator Agenda ZenFisio   ║');
  console.log('║  Versao Debug (Linux CLI)             ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  let browser, context, page;

  try {
    ({ browser, context, page } = await launchBrowser());

    // Login
    await ensureLoggedIn(page, context);

    // Periodo
    console.log('');
    const startDate = await rl.question('Data inicio (DD/MM/AAAA): ');
    const endDate = await rl.question('Data fim (DD/MM/AAAA): ');

    // Gerar lista de datas
    const [sd, sm, sy] = startDate.split('/').map(Number);
    const [ed, em, ey] = endDate.split('/').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    const dates = [];
    const cur = new Date(start);
    while (cur <= end) {
      const iso = cur.toISOString().split('T')[0];
      dates.push(iso);
      cur.setDate(cur.getDate() + 1);
    }

    log(`Periodo: ${startDate} a ${endDate} (${dates.length} dias)`);
    console.log('');

    // Configurar filtros
    await setupView(page);

    // Extrair por dia
    const allAppointments = [];
    for (let i = 0; i < dates.length; i++) {
      console.log('');
      log(`═══ Dia ${i + 1}/${dates.length}: ${dates[i]} ═══`);
      await navigateToDate(page, dates[i]);
      const dayData = await extractDayAppointments(page, dates[i]);
      allAppointments.push(...dayData);
      log(`Acumulado: ${allAppointments.length} agendamentos`);
    }

    // Resultado
    console.log('');
    if (allAppointments.length > 0) {
      const filepath = await saveExcel(allAppointments, startDate, endDate);
      console.log('╔══════════════════════════════════════╗');
      ok(`${allAppointments.length} agendamentos extraidos!`);
      ok(`Excel: ${filepath}`);
      console.log('╚══════════════════════════════════════╝');
    } else {
      warn('Nenhum agendamento extraido.');
      warn('Verifique os arquivos em debug/ para diagnosticar.');
      warn('Arquivos importantes:');
      warn('  - debug/10-page-info.json  (botoes e controles da pagina)');
      warn('  - debug/10-calendario.html (HTML completo)');
      warn('  - debug/30-items-*.json    (itens encontrados)');
    }

  } catch (err) {
    console.error('');
    console.error(`ERRO: ${err.message}`);
    if (page) await screenshot(page, 'erro-fatal');
  } finally {
    rl.close();
    if (browser) await browser.close();
    log('Fim.');
  }
}

main();
