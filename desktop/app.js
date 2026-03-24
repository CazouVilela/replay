// desktop/app.js
// Renderer - controle da UI e logica de extracao via webview
// Seletores mapeados via CDP do ZenFisio real (2026-03-23)

const webview = document.getElementById('zenfisio');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnDiscover = document.getElementById('btn-discover');
const dateStart = document.getElementById('date-start');
const dateEnd = document.getElementById('date-end');
const statusText = document.getElementById('status-text');
const progressEl = document.getElementById('progress');
const progressCurrent = document.getElementById('progress-current');
const progressTotal = document.getElementById('progress-total');
const logContent = document.getElementById('log-content');

let running = false;
let shouldStop = false;

// ==================== SELETORES (mapeados do DOM real) ====================
const SEL = {
  // Filtro: selecionar todos os profissionais
  selectAll: 'a.select-all-users-calendar',

  // Botao "Lista do dia" (FullCalendar)
  dayListBtn: '.fc-listDay-button',

  // Itens de agendamento na lista do dia
  appointmentItems: 'tr.fc-list-event',

  // Partes de cada item na lista
  eventTime: 'td.fc-list-event-time',
  eventTitle: 'td.fc-list-event-title a',

  // Cabecalho do dia na lista (tem data-date="YYYY-MM-DD")
  dayHeader: 'tr.fc-list-day',

  // Popover que abre ao clicar no evento (Bootstrap popover)
  popover: '.popover.in',
  popoverTitle: '.popover-title',
  popoverContent: '.popover-content',

  // Link do paciente dentro do popover
  patientLink: 'a[href*="/patients/"]',

  // Botao de edicao (icone azul) dentro do popover
  editBtn: 'a.btn-edit-event',

  // Fechar popover
  popoverClose: '.popover.in .close',

  // Modal de edicao do agendamento
  modal: '#modalScheduling',
  modalVisible: '#modalScheduling.in',

  // Campos do modal de edicao (usar SEMPRE id, nunca name - names sao randomizados)
  fields: {
    data: '#datepicker',           // "23/03/2026"
    horaInicio: '#start',          // "8:00"
    horaFim: '#end',               // "9:00"
    profissional: '#user',         // select2: "Cazou (Fonoaudiologo(a))"
    paciente: '#autocomplete_patient_calendar',  // "Jose Henrique"
    valor: '#value',               // "150,00"
    pago: '#paid_out',             // checkbox (checked = pago)
    dataPagamento: '#date_payment', // "__/__/____"
    convenio: '#agreement',        // "Particular"
    status: '#status',             // "Agendado"
  },

  // Fechar modal
  modalClose: '#modalScheduling [data-dismiss="modal"]',

  // Navegacao de datas (FullCalendar)
  prevDay: '.fc-prev-button',
  nextDay: '.fc-next-button',
  todayBtn: '.fc-today-button',
  dateTitle: '.fc-toolbar-title',
};

// ==================== LOGGING ====================
function log(msg, type = 'info') {
  const ts = new Date().toLocaleTimeString('pt-BR');
  const div = document.createElement('div');
  div.className = `log-line log-${type}`;
  div.textContent = `[${ts}] ${msg}`;
  logContent.appendChild(div);
  logContent.parentElement.scrollTop = logContent.parentElement.scrollHeight;
}

// ==================== WEBVIEW HELPERS ====================

async function exec(code) {
  return webview.executeJavaScript(code);
}

async function waitForSelector(selector, timeout = 10000) {
  return exec(`
    new Promise((resolve) => {
      const el = document.querySelector('${selector}');
      if (el) return resolve(true);
      const observer = new MutationObserver(() => {
        if (document.querySelector('${selector}')) {
          observer.disconnect();
          resolve(true);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); resolve(false); }, ${timeout});
    });
  `);
}

async function waitForNoElement(selector, timeout = 5000) {
  return exec(`
    new Promise((resolve) => {
      if (!document.querySelector('${selector}')) return resolve(true);
      const observer = new MutationObserver(() => {
        if (!document.querySelector('${selector}')) {
          observer.disconnect();
          resolve(true);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      setTimeout(() => { observer.disconnect(); resolve(false); }, ${timeout});
    });
  `);
}

async function clickEl(selector) {
  return exec(`
    (() => {
      const el = document.querySelector('${selector}');
      if (el) { el.click(); return true; }
      return false;
    })();
  `);
}

async function getText(selector) {
  return exec(`
    (() => {
      const el = document.querySelector('${selector}');
      return el ? el.textContent.trim() : '';
    })();
  `);
}

async function getValue(selector) {
  return exec(`
    (() => {
      const el = document.querySelector('${selector}');
      if (!el) return '';
      if (el.tagName === 'SELECT') {
        const opt = el.querySelector('option:checked');
        return opt ? opt.textContent.trim() : '';
      }
      return (el.value || '').trim();
    })();
  `);
}

async function isChecked(selector) {
  return exec(`
    (() => {
      const el = document.querySelector('${selector}');
      return el ? el.checked : false;
    })();
  `);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ==================== DISCOVERY ====================
btnDiscover.addEventListener('click', async () => {
  log('Capturando estrutura do DOM...');
  try {
    const domInfo = await exec(`
      (() => {
        const result = {
          url: window.location.href,
          title: document.title,
          buttons: Array.from(document.querySelectorAll('button, .btn, [role="button"]')).map(b => ({
            tag: b.tagName,
            text: b.textContent.trim().substring(0, 80),
            classes: b.className,
            id: b.id,
          })).slice(0, 50),
          inputs: Array.from(document.querySelectorAll('input, select, textarea')).map(i => ({
            tag: i.tagName, type: i.type, name: i.name, id: i.id,
            placeholder: i.placeholder, classes: i.className,
          })).slice(0, 50),
          modals: Array.from(document.querySelectorAll('.modal, .popup, .popover, [role="dialog"]')).map(m => ({
            classes: m.className, id: m.id,
            visible: m.offsetParent !== null || window.getComputedStyle(m).display !== 'none',
            html: m.innerHTML.substring(0, 500),
          })),
          events: Array.from(document.querySelectorAll('[class*="event"], [class*="appointment"], [class*="schedule"]')).map(e => ({
            tag: e.tagName, classes: e.className,
            text: e.textContent.trim().substring(0, 100),
          })).slice(0, 30),
          mainHTML: (document.querySelector('main, .content, #content, .main-content, [class*="calendar"]') || document.body).innerHTML.substring(0, 10000),
        };
        return JSON.stringify(result);
      })();
    `);

    const filePath = await window.api.saveDebug({
      filename: `dom-discovery-${Date.now()}.json`,
      content: domInfo,
    });
    log(`DOM salvo em: ${filePath}`, 'ok');
    log('Analise o arquivo JSON para ajustar os seletores em app.js', 'warn');
  } catch (err) {
    log(`Erro ao capturar DOM: ${err.message}`, 'error');
  }
});

// ==================== NAVEGACAO ====================

/**
 * Obtem a data atual exibida no calendario.
 * Tenta primeiro o atributo data-date do cabecalho do dia (quando ha eventos).
 * Fallback: parseia o titulo do toolbar ("24 de marco de 2026" → "2026-03-24").
 */
async function getCurrentDate() {
  return exec(`
    (() => {
      // 1. Tentar data-date do cabecalho (so existe quando ha eventos)
      const dayRow = document.querySelector('tr.fc-list-day');
      if (dayRow) {
        const d = dayRow.getAttribute('data-date');
        if (d) return d;
      }

      // 2. Fallback: parsear titulo do toolbar
      const title = document.querySelector('.fc-toolbar-title');
      if (!title) return null;
      const text = title.textContent.trim();

      const meses = {
        'janeiro':1, 'fevereiro':2, 'março':3, 'marco':3, 'abril':4,
        'maio':5, 'junho':6, 'julho':7, 'agosto':8, 'setembro':9,
        'outubro':10, 'novembro':11, 'dezembro':12
      };

      // Formato: "24 de março de 2026"
      const m = text.match(/(\\d{1,2})\\s+de\\s+(\\w+)\\s+de\\s+(\\d{4})/);
      if (m) {
        const dia = m[1].padStart(2, '0');
        const mes = meses[m[2].toLowerCase()];
        if (mes) return m[3] + '-' + String(mes).padStart(2, '0') + '-' + dia;
      }

      return null;
    })();
  `);
}

/**
 * Navega para uma data especifica usando prev/next.
 * Em "Lista do dia", cada click avanca/retrocede 1 dia.
 */
async function navigateToDate(targetDateStr) {
  const target = new Date(targetDateStr + 'T12:00:00');
  let attempts = 0;
  const maxAttempts = 400; // maximo ~1 ano de navegacao

  while (attempts < maxAttempts) {
    if (shouldStop) return false;

    const currentStr = await getCurrentDate();
    if (!currentStr) {
      // Pode ser dia sem agendamentos - checar titulo
      const title = await getText(SEL.dateTitle);
      log(`  Dia sem agendamentos (titulo: ${title}). Avancando...`, 'info');
      await clickEl(SEL.nextDay);
      await sleep(800);
      attempts++;
      continue;
    }

    const current = new Date(currentStr + 'T12:00:00');
    const diffDays = Math.round((target - current) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return true;

    if (diffDays > 0) {
      await clickEl(SEL.nextDay);
    } else {
      await clickEl(SEL.prevDay);
    }
    await sleep(800);
    attempts++;
  }

  log(`Nao conseguiu navegar para ${targetDateStr} apos ${maxAttempts} tentativas`, 'error');
  return false;
}

// ==================== FILTROS ====================

async function setupFilters() {
  log('Configurando filtros...');

  // Selecionar todos os profissionais
  const clicked = await clickEl(SEL.selectAll);
  if (clicked) {
    log('"Selecionar todos" profissionais.', 'ok');
  } else {
    log('"Selecionar todos" nao encontrado.', 'warn');
  }
  await sleep(1500);

  // Mudar para "Lista do dia"
  const listClicked = await clickEl(SEL.dayListBtn);
  if (listClicked) {
    log('Modo "Lista do dia" ativado.', 'ok');
  } else {
    log('Botao "Lista do dia" nao encontrado.', 'warn');
  }
  await sleep(1500);
}

// ==================== EXTRACAO ====================

/**
 * Fecha qualquer popover ou modal aberto.
 */
async function closeAll() {
  // Fechar modal se aberto
  await clickEl(SEL.modalClose);
  await sleep(300);
  // Fechar popover se aberto
  await clickEl(SEL.popoverClose);
  await sleep(300);
  // Fallback: tecla Escape
  await exec(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(300);
}

/**
 * Extrai dados de todos os agendamentos do dia atual.
 */
async function extractDay(dateStr) {
  const appointments = [];

  // Contar itens da lista (apenas eventos, nao cabecalhos)
  const itemCount = await exec(`document.querySelectorAll('${SEL.appointmentItems}').length`);
  if (!itemCount) {
    log(`  Nenhum agendamento neste dia.`, 'info');
    return appointments;
  }

  log(`  ${itemCount} agendamento(s) encontrado(s).`);
  progressCurrent.textContent = `0/${itemCount}`;

  for (let i = 0; i < itemCount; i++) {
    if (shouldStop) break;

    progressCurrent.textContent = `${i + 1}/${itemCount}`;

    try {
      // 1. Clicar no evento da lista → popover abre
      await exec(`document.querySelectorAll('${SEL.appointmentItems}')[${i}].click()`);
      await sleep(1200);

      // 2. Esperar popover de agendamento (filtrar note-popovers do Summernote)
      await sleep(500);
      const popoverResult = await exec(`
        (() => {
          const pops = document.querySelectorAll('.popover.in');
          for (const p of pops) {
            if (p.textContent.includes('Paciente') && !p.classList.contains('note-popover')) {
              const link = p.querySelector('a[href*="/patients/"]');
              return { found: true, paciente: link ? link.textContent.trim() : '' };
            }
          }
          return { found: false };
        })();
      `);

      if (!popoverResult.found) {
        // Tentar esperar mais
        await sleep(1500);
        const retry = await exec(`
          (() => {
            const pops = document.querySelectorAll('.popover.in');
            for (const p of pops) {
              if (p.textContent.includes('Paciente') && !p.classList.contains('note-popover')) {
                const link = p.querySelector('a[href*="/patients/"]');
                return { found: true, paciente: link ? link.textContent.trim() : '' };
              }
            }
            return { found: false };
          })();
        `);
        if (!retry.found) {
          log(`  Item ${i + 1}: popover nao abriu. Pulando.`, 'warn');
          continue;
        }
      }

      const pacientePopover = popoverResult.paciente || '';

      // 4. Clicar no botao de edicao (icone azul) dentro do popover correto
      const editClicked = await exec(`
        (() => {
          const pops = document.querySelectorAll('.popover.in');
          for (const p of pops) {
            if (p.textContent.includes('Paciente') && !p.classList.contains('note-popover')) {
              const btn = p.querySelector('a.btn-edit-event');
              if (btn) { btn.click(); return true; }
            }
          }
          return false;
        })();
      `);

      if (!editClicked) {
        log(`  Item ${i + 1}: botao editar nao encontrado. Pulando.`, 'warn');
        await closeAll();
        continue;
      }

      await sleep(1500);

      // 5. Esperar modal de edicao abrir
      const hasModal = await exec(`
        (() => {
          const m = document.querySelector('${SEL.modal}');
          return m && m.classList.contains('in');
        })();
      `);

      if (!hasModal) {
        log(`  Item ${i + 1}: modal de edicao nao abriu. Pulando.`, 'warn');
        await closeAll();
        continue;
      }

      // 6. Extrair todos os campos do modal
      const data = await getValue(SEL.fields.data);
      const horaInicio = await getValue(SEL.fields.horaInicio);
      const horaFim = await getValue(SEL.fields.horaFim);
      const profissionalRaw = await getValue(SEL.fields.profissional);
      const pacienteModal = await getValue(SEL.fields.paciente);
      const valor = await getValue(SEL.fields.valor);
      const pago = await isChecked(SEL.fields.pago);
      const dataPagamento = await getValue(SEL.fields.dataPagamento);
      const status = await getValue(SEL.fields.status);
      const convenio = await getValue(SEL.fields.convenio);

      // 7. Separar profissional e especialidade
      // Formato: "Cazou (Fonoaudiologo(a))"
      let profissional = profissionalRaw;
      let especialidade = '';
      const match = profissionalRaw.match(/^(.+?)\s*\(([^)]+(?:\([^)]*\))?[^)]*)\)\s*$/);
      if (match) {
        profissional = match[1].trim();
        especialidade = match[2].trim();
      }

      // Usar paciente do modal (mais confiavel) ou do popover
      const paciente = pacienteModal || pacientePopover;

      // Formatar horario
      const horario = horaInicio && horaFim ? `${horaInicio} - ${horaFim}` : horaInicio || '';

      appointments.push({
        data: data || dateStr,
        horario,
        profissional,
        especialidade,
        paciente,
        valor,
        pago: pago ? 'Sim' : 'Nao',
        dataPagamento: dataPagamento || '',
        status: status || '',
        convenio: convenio || '',
      });

      log(`  OK: ${paciente} | ${horario} | ${profissional} | R$ ${valor} | ${status} | ${convenio} | ${pago ? 'Pago' : 'Nao pago'}`, 'ok');

      // 8. Fechar modal
      await clickEl(SEL.modalClose);
      await sleep(800);

      // Garantir que modal fechou
      await waitForNoElement(SEL.modalVisible, 3000);
      await sleep(300);

    } catch (err) {
      log(`  Erro no item ${i + 1}: ${err.message}`, 'error');
      await closeAll();
      await sleep(500);
    }
  }

  return appointments;
}

/**
 * Fluxo principal de extracao.
 */
async function startExtraction() {
  const start = dateStart.value;
  const end = dateEnd.value;

  if (!start || !end) {
    log('Informe as datas de inicio e fim.', 'error');
    return;
  }

  running = true;
  shouldStop = false;
  btnStart.classList.add('hidden');
  btnStop.classList.remove('hidden');
  progressEl.classList.remove('hidden');

  const allAppointments = [];

  // Gerar lista de datas
  const dates = [];
  const current = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  while (current <= endDate) {
    const iso = current.toISOString().split('T')[0];
    dates.push(iso);
    current.setDate(current.getDate() + 1);
  }

  progressTotal.textContent = `${dates.length} dias`;
  log(`Iniciando extracao: ${dates.length} dias (${start} a ${end})`, 'info');

  // 1. Configurar filtros (selecionar todos + lista do dia)
  await setupFilters();

  // 2. Navegar para a primeira data
  log(`Navegando para ${start}...`);
  const reached = await navigateToDate(start);
  if (!reached) {
    log('Nao conseguiu navegar para a data inicial.', 'error');
    running = false;
    btnStart.classList.remove('hidden');
    btnStop.classList.add('hidden');
    progressEl.classList.add('hidden');
    return;
  }

  // 3. Extrair dia a dia
  for (let d = 0; d < dates.length; d++) {
    if (shouldStop) {
      log('Extracao interrompida pelo usuario.', 'warn');
      break;
    }

    const dateStr = dates[d];
    const [y, m, day] = dateStr.split('-');
    statusText.textContent = `Dia ${d + 1}/${dates.length}: ${day}/${m}/${y}`;
    log(`--- Dia ${d + 1}/${dates.length}: ${day}/${m}/${y} ---`);

    // Verificar se estamos no dia correto
    const currentDate = await getCurrentDate();
    if (currentDate && currentDate !== dateStr) {
      // Pode ser dia sem agendamentos - verificar pelo titulo
      const title = await getText(SEL.dateTitle);
      log(`  Data esperada: ${dateStr}, atual: ${currentDate || title}`, 'warn');
    }

    // Extrair agendamentos do dia
    const dayData = await extractDay(dateStr);
    allAppointments.push(...dayData);

    log(`  Acumulado: ${allAppointments.length} agendamentos.`);

    // Avancar para proximo dia (exceto no ultimo)
    if (d < dates.length - 1) {
      await clickEl(SEL.nextDay);
      await sleep(1000);
    }
  }

  // 4. Salvar Excel
  if (allAppointments.length > 0) {
    log(`Gerando Excel com ${allAppointments.length} registros...`);
    const periodo = `${start.replace(/-/g, '')}_${end.replace(/-/g, '')}`;
    const result = await window.api.saveExcel({
      periodo,
      rows: allAppointments,
    });

    if (result.success) {
      log(`Planilha salva: ${result.filePath}`, 'ok');
      statusText.textContent = `Concluido! ${allAppointments.length} agendamentos extraidos.`;
    } else {
      log(`Salvamento cancelado.`, 'warn');
    }
  } else {
    log('Nenhum agendamento extraido.', 'warn');
    statusText.textContent = 'Nenhum dado extraido.';
  }

  running = false;
  btnStart.classList.remove('hidden');
  btnStop.classList.add('hidden');
  progressEl.classList.add('hidden');
}

// ==================== EVENTOS ====================

webview.addEventListener('dom-ready', () => {
  const url = webview.getURL();
  if (url.includes('calendar')) {
    statusText.textContent = 'Calendario carregado. Selecione as datas e clique "Iniciar Extracao".';
    btnStart.disabled = false;
    log('Calendario ZenFisio carregado.', 'ok');
  } else if (url.includes('login')) {
    statusText.textContent = 'Faca login no ZenFisio abaixo.';
    btnStart.disabled = true;
    log('Tela de login detectada. Aguardando login manual...');
  }
});

webview.addEventListener('did-navigate', (e) => {
  const url = e.url || webview.getURL();
  if (url.includes('calendar') && !running) {
    btnStart.disabled = false;
    statusText.textContent = 'Calendario carregado. Selecione as datas e clique "Iniciar Extracao".';
  }
});

btnStart.addEventListener('click', startExtraction);

btnStop.addEventListener('click', () => {
  shouldStop = true;
  log('Parando extracao...');
});

// Data padrao: mes atual
const today = new Date();
const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
dateStart.value = firstDay.toISOString().split('T')[0];
dateEnd.value = today.toISOString().split('T')[0];

log('Replay iniciado. Aguardando login no ZenFisio...');
