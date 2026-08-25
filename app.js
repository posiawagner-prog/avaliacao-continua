const NIVEIS = [
  { key: "defasagem", label: "Defasagem", short: "Defasagem", color: "#FF3B30" },
  { key: "intermediario", label: "Aprendizado intermediário", short: "Intermediário", color: "#FF9500" },
  { key: "adequado", label: "Aprendizado adequado", short: "Adequado", color: "#00E676" },
];

const DISCIPLINAS = {
  lp: "Língua Portuguesa",
  mat: "Matemática",
};

function detectAnoPagina() {
  if (typeof window !== "undefined" && window.__ANO_PAGINA__) {
    return String(window.__ANO_PAGINA__);
  }
  const m = (typeof location !== "undefined" ? location.pathname : "").match(/\/([6-9])o-ano\/?/i);
  return m ? m[1] : "";
}

let ANO_PAGINA = detectAnoPagina();

const state = {
  view: "dashboard",
  ano: ANO_PAGINA || "",
  disciplina: "",
  escola: "",
  turma: "",
  periodo: "percurso",
  nivel: "",
  search: "",
  page: 1,
  pageSize: 10,
  sort: { key: "ano", dir: 1 },
};

const charts = {};
const PAGE_SIZE = 10;
const THEME_KEY = "aca-theme-all";

function emptyAgg() {
  return {
    previstos: 0,
    avaliados: 0,
    defasagem: 0,
    intermediario: 0,
    adequado: 0,
    acertoPonderado: 0,
    pesoAcerto: 0,
  };
}

function sumLevels(bloco) {
  if (!bloco) return 0;
  return NIVEIS.reduce((acc, n) => acc + (bloco[n.key] || 0), 0);
}

function isComparativo() {
  return state.periodo === "comparativo";
}

function periodoUnico() {
  return state.periodo === "entrada" ? "entrada" : "percurso";
}

function blocoAtivo(row) {
  if (state.periodo === "entrada") return row.entrada;
  return row.percurso;
}

function matchesNivel(key) {
  if (!state.nivel) return true;
  return key === state.nivel;
}

function nivelLabel(key) {
  return NIVEIS.find((n) => n.key === key)?.label || key;
}

function anoLabel(ano) {
  if (!ano) return "Todos os anos";
  return `${ano}º ano`;
}

function discLabel(d) {
  if (!d) return "Todas as disciplinas";
  return DISCIPLINAS[d] || d;
}

function shortSchool(name) {
  const map = {
    "E.M.E.I.F. ANTONIO AGOSTINHO DOS ANJOS": "Antônio dos Anjos",
    "E.M.E.I.F. BARAO DE ALAGOAS": "Barão de Alagoas",
    "E.M.E.I.F. BOB PIERCE": "Bob Pierce",
    "E.M.E.I.F. ELISABETH JACOBA MARIA BOGERS": "Elisabeth Bogers",
    "E.M.E.I.F. IMACULADA CONCEICAO": "Imaculada Conceição",
    "E.M.E.I.F. JOSE ALVES DA SILVA": "José Alves Silva",
    "E.M.E.I.F. NOSSA SENHORA DE FATIMA": "N. S. Fátima",
    "E.M.E.I.F. NOSSA SENHORA DE LOURDES": "N. S. Lourdes",
    "E.M.E.I.F. PEDRO FRANCISCO DAS CHAGAS": "Pedro das Chagas",
    "E.M.E.I.F. POSSIDONIO GADI": "Possidônio Gadi",
    "E.M.E.I.F. VEREADOR JOSE DOMINGOS DE BARROS": "Vereador Barros",
    "E.M.E.I.F. WASHINGTON SOARES GAIA": "Washington Gaia",
    "E.M.E.I.F. WELLINGTON PINTO FONTES": "Wellington Fontes",
  };
  return map[name] || name.replace(/^E\.M\.E\.I\.F\.\s+/i, "").replace(/^EMEIF\s+/i, "");
}

function pct(part, total) {
  if (!total) return 0;
  return (part / total) * 100;
}

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}

function fmtPct(n) {
  return `${(n || 0).toFixed(1).replace(".", ",")}%`;
}

function rowsBase() {
  const q = state.search.trim().toLowerCase();
  return DADOS.filter((row) => {
    if (state.ano && String(row.ano) !== String(state.ano)) return false;
    if (state.disciplina && row.disciplina !== state.disciplina) return false;
    if (state.escola && row.escola !== state.escola) return false;
    if (state.turma && row.turma !== state.turma) return false;
    if (
      q &&
      !`${row.ano} ${anoLabel(row.ano)} ${discLabel(row.disciplina)} ${row.escola} ${row.turma}`
        .toLowerCase()
        .includes(q)
    ) {
      return false;
    }
    return true;
  });
}

function addBloco(target, bloco) {
  if (!bloco) return;
  target.previstos += bloco.previstos || 0;
  target.avaliados += bloco.avaliados || 0;
  NIVEIS.forEach((n) => {
    target[n.key] += bloco[n.key] || 0;
  });
  const av = bloco.avaliados || 0;
  if (av > 0) {
    target.acertoPonderado += (bloco.acertoTotal || 0) * av;
    target.pesoAcerto += av;
  }
}

function aggregate(rows, periodo) {
  const agg = emptyAgg();
  rows.forEach((row) => addBloco(agg, row[periodo]));
  if (sumLevels(agg) > agg.avaliados) agg.avaliados = sumLevels(agg);
  return agg;
}

function acertoMedio(agg) {
  if (!agg.pesoAcerto) return 0;
  return agg.acertoPonderado / agg.pesoAcerto;
}

function countNivel(agg) {
  if (!state.nivel) return agg.avaliados;
  return NIVEIS.reduce((acc, n) => acc + (matchesNivel(n.key) ? agg[n.key] : 0), 0);
}

function predominante(bloco) {
  if (!bloco || !sumLevels(bloco)) return null;
  return NIVEIS.reduce((best, n) => ((bloco[n.key] || 0) > (bloco[best.key] || 0) ? n : best));
}

function toggleFilter(key, value) {
  state[key] = state[key] === value ? "" : value;
  if (key === "escola") state.turma = "";
  if (key === "ano" || key === "disciplina") {
    state.escola = "";
    state.turma = "";
  }
  state.page = 1;
  syncSelects();
  render();
}

function setView(view) {
  state.view = view;
  document.querySelectorAll(".nav-btn[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  document.getElementById("viewDashboard").hidden = view !== "dashboard";
  document.getElementById("viewTable").hidden = view !== "table";
}

function escolasUnicas() {
  return [
    ...new Set(
      DADOS.filter((r) => {
        if (state.ano && String(r.ano) !== String(state.ano)) return false;
        if (state.disciplina && r.disciplina !== state.disciplina) return false;
        return true;
      }).map((r) => r.escola)
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function turmasDaEscola(escola) {
  return [
    ...new Set(
      DADOS.filter((r) => {
        if (state.ano && String(r.ano) !== String(state.ano)) return false;
        if (state.disciplina && r.disciplina !== state.disciplina) return false;
        if (escola && r.escola !== escola) return false;
        return true;
      }).map((r) => r.turma)
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function fillSelects() {
  const esc = document.getElementById("filterEscola");
  const tur = document.getElementById("filterTurma");
  esc.innerHTML =
    `<option value="">Todas as escolas</option>` +
    escolasUnicas()
      .map((e) => `<option value="${e}">${shortSchool(e)}</option>`)
      .join("");
  const turmas = state.escola ? turmasDaEscola(state.escola) : turmasDaEscola("");
  tur.innerHTML =
    `<option value="">Todas as turmas</option>` +
    turmas.map((t) => `<option value="${t}">${t}</option>`).join("");
  syncSelects();
}

function syncSelects() {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
  };
  setVal("filterAno", state.ano);
  setVal("filterDisciplina", state.disciplina);
  setVal("filterEscola", state.escola);
  setVal("filterTurma", state.turma);
  setVal("filterPeriodo", state.periodo);
}

function yearPageUrl(ano) {
  const path = location.pathname || "";
  if (/[\\/]([6-9])o-ano[\\/]?/i.test(path)) return `../${ano}o-ano/`;
  if (/painel\.html$/i.test(path)) return `${ano}o-ano/`;
  return `${ano}o-ano/`;
}

function applyPageYearUI() {
  document.querySelectorAll(".year-nav a").forEach((a) => {
    const ano = a.dataset.ano;
    if (!ano) return;
    const isActive = String(state.ano) === String(ano);
    a.href = yearPageUrl(ano);
    a.textContent = `${ano}º ano`;
    a.classList.toggle("active", isActive);
    if (isActive) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

function goToYear(ano, { push = true } = {}) {
  const url = yearPageUrl(ano);
  if (push) location.href = url;
}

function pillHtml(delta, invert = false) {
  if (delta === null || Number.isNaN(delta)) return `<span class="pill neutral">sem base</span>`;
  const good = invert ? delta < 0 : delta > 0;
  const cls = delta === 0 ? "neutral" : good ? "up" : "down";
  const sign = delta > 0 ? "+" : "";
  return `<span class="pill ${cls}">${sign}${delta.toFixed(1).replace(".", ",")} pp</span>`;
}

function renderChips() {
  const chips = document.getElementById("chips");
  const items = [];
  if (state.ano) items.push({ key: "ano", label: anoLabel(state.ano) });
  if (state.disciplina) items.push({ key: "disciplina", label: discLabel(state.disciplina) });
  if (state.escola) items.push({ key: "escola", label: shortSchool(state.escola) });
  if (state.turma) items.push({ key: "turma", label: `Turma ${state.turma}` });
  if (state.nivel) items.push({ key: "nivel", label: nivelLabel(state.nivel) });
  if (!items.length) {
    chips.hidden = true;
    chips.innerHTML = "";
    return;
  }
  chips.hidden = false;
  chips.innerHTML = items
    .map(
      (i) =>
        `<button type="button" class="chip" data-clear="${i.key}">${i.label} <span aria-hidden="true">×</span></button>`
    )
    .join("");
}

function renderKPIs(rows) {
  const entrada = aggregate(rows, "entrada");
  const percurso = aggregate(rows, "percurso");
  const atual = isComparativo() ? percurso : aggregate(rows, periodoUnico());
  const hasEntrada = entrada.avaliados > 0;
  const previstos = atual.previstos || rows.reduce((acc, r) => acc + (r.alunos || 0), 0);
  const partPct = pct(atual.avaliados, previstos || atual.previstos);
  const acerto = acertoMedio(atual);
  const acertoEnt = acertoMedio(entrada);
  const defPct = pct(atual.defasagem, atual.avaliados);
  const defEnt = pct(entrada.defasagem, entrada.avaliados);
  const adePct = pct(atual.adequado, atual.avaliados);
  const adeEnt = pct(entrada.adequado, entrada.avaliados);
  const intPct = pct(atual.intermediario, atual.avaliados);

  const cards = [
    {
      key: "previstos",
      title: "Previstos",
      value: fmt(previstos),
      pill: "",
      foot: `<span class="num">${fmt(atual.avaliados)}</span> avaliados`,
      icon: `<div class="kpi-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>`,
    },
    {
      key: "participacao",
      title: "Participação",
      value: fmtPct(partPct),
      pill: "",
      foot: `<span class="num">${fmt(atual.avaliados)}</span> de <span class="num">${fmt(previstos)}</span>`,
      icon: `<div class="kpi-icon ini" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`,
    },
    {
      key: "acerto",
      title: "Acerto total",
      value: fmtPct(acerto),
      pill: pillHtml(hasEntrada ? acerto - acertoEnt : null),
      foot: isComparativo() || state.periodo === "percurso" ? "vs Ciclo I" : "média ponderada",
      icon: `<div class="kpi-icon flu" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m9 11 2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/></svg></div>`,
    },
    {
      key: "defasagem",
      title: "Defasagem",
      value: fmt(atual.defasagem),
      pill: pillHtml(hasEntrada ? defPct - defEnt : null, true),
      foot: `<span class="num">${fmtPct(defPct)}</span> do total avaliado`,
      icon: `<div class="kpi-icon pre" aria-hidden="true"><span class="kpi-icon-abc">!</span></div>`,
    },
    {
      key: "intermediario",
      title: "Intermediário",
      value: fmt(atual.intermediario),
      pill: "",
      foot: `<span class="num">${fmtPct(intPct)}</span> do total avaliado`,
      icon: `<div class="kpi-icon" style="background:rgba(255,149,0,.15);color:#ff9500" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 20V10M18 20V4M6 20v-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>`,
    },
    {
      key: "adequado",
      title: "Adequado",
      value: fmt(atual.adequado),
      pill: pillHtml(hasEntrada ? adePct - adeEnt : null),
      foot: `<span class="num">${fmtPct(adePct)}</span> do total avaliado`,
      icon: `<div class="kpi-icon flu" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" stroke-width="1.8"/><path d="m9 11 2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>`,
    },
  ];

  const left = cards.slice(0, 3);
  const right = cards.slice(3);
  const html = (list) =>
    list
      .map((c) => {
        const canFilter = ["defasagem", "intermediario", "adequado"].includes(c.key);
        return `
    <article class="kpi has-icon ${state.nivel === c.key ? "active" : ""}" ${canFilter ? `data-nivel="${c.key}"` : ""}>
      ${c.icon}
      <p class="kpi-title">${c.title}</p>
      <p class="kpi-value">${c.value}</p>
      <div class="kpi-foot">${c.pill || ""}<span class="kpi-foot-text">${c.foot || ""}</span></div>
    </article>`;
      })
      .join("");

  document.getElementById("kpiLeft").innerHTML = html(left);
  document.getElementById("kpiRight").innerHTML = html(right);
}

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  const btn = document.getElementById("btnTheme");
  if (btn) {
    btn.setAttribute("aria-checked", theme === "light" ? "true" : "false");
    btn.title = theme === "light" ? "Modo claro" : "Modo escuro";
    btn.setAttribute("aria-label", theme === "light" ? "Ativar modo escuro" : "Ativar modo claro");
  }
}

function toggleTheme() {
  applyTheme(currentTheme() === "light" ? "dark" : "light");
  render();
}

function chartTextColor() {
  return currentTheme() === "light" ? cssVar("--text") || "#141418" : "#ffffff";
}

function chartDefaults() {
  if (typeof Chart === "undefined") return { muted: "#9a9aa3", text: "#ffffff" };
  const muted = cssVar("--muted") || "#9a9aa3";
  const text = chartTextColor();
  Chart.defaults.color = text;
  Chart.defaults.borderColor = "transparent";
  Chart.defaults.font.family = "'DM Sans', system-ui, sans-serif";
  return { muted, text };
}

function drawOutlinedText(ctx, text, x, y, lineWidth = 1.25) {
  ctx.save();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = currentTheme() === "light" ? "rgba(255,255,255,.75)" : "rgba(0,0,0,.4)";
  ctx.fillStyle = chartTextColor();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

const barValueLabels = {
  id: "barValueLabels",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((el, i) => {
        const v = ds.data[i];
        if (v == null || v === 0) return;
        const { x, y } = el.tooltipPosition();
        ctx.font = "600 11px DM Sans, system-ui, sans-serif";
        drawOutlinedText(ctx, String(v), x, y - 10);
      });
    });
  },
};

function barSegmentCenter(el) {
  if (typeof el.getCenterPoint === "function") {
    return el.getCenterPoint(true);
  }
  const { x, y, base } = el.getProps(["x", "y", "base"], true);
  return { x: (Math.min(x, base) + Math.max(x, base)) / 2, y };
}

const stackValueLabels = {
  id: "stackValueLabels",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const totals = chart.data.labels.map((_, i) =>
      chart.data.datasets.reduce((acc, ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden) return acc;
        return acc + (Number(ds.data[i]) || 0);
      }, 0)
    );
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((el, i) => {
        const v = Number(ds.data[i]) || 0;
        if (v <= 0 || totals[i] <= 0) return;
        const { x: px, base } = el.getProps(["x", "base"], true);
        const segmentWidth = Math.abs(px - base);
        if (segmentWidth < 22) return;
        const { x, y } = barSegmentCenter(el);
        ctx.font = "600 10px DM Sans, system-ui, sans-serif";
        drawOutlinedText(ctx, String(v), x, y, 1.1);
      });
    });
  },
};

const donutValueLabels = {
  id: "donutValueLabels",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0) || 1;
    meta.data.forEach((el, i) => {
      const v = chart.data.datasets[0].data[i];
      if (!v) return;
      const p = (v / total) * 100;
      if (p < 6) return;
      const { x, y } = el.tooltipPosition();
      ctx.font = "700 11px DM Sans, system-ui, sans-serif";
      drawOutlinedText(ctx, `${p.toFixed(0)}%`, x, y);
    });
  },
};

function upsertChart(id, config) {
  if (typeof Chart === "undefined") return;
  if (charts[id]) {
    charts[id].destroy();
    charts[id] = null;
  }
  const canvas = document.getElementById(id);
  if (!canvas) return;
  charts[id] = new Chart(canvas, config);
}

function renderDonut(rows) {
  chartDefaults();
  const comparativo = isComparativo();
  const entrada = aggregate(rows, "entrada");
  const percurso = aggregate(rows, "percurso");
  const agg = comparativo ? percurso : aggregate(rows, periodoUnico());
  const values = NIVEIS.map((n) => (matchesNivel(n.key) ? agg[n.key] : 0));
  const total = values.reduce((a, b) => a + b, 0);

  document.getElementById("chartDonutTitle").textContent = comparativo
    ? "Distribuição no Ciclo II"
    : "Distribuição por nível";
  document.getElementById("chartDonutSub").textContent = "Clique em um segmento para filtrar";

  upsertChart("chartDonut", {
    type: "doughnut",
    data: {
      labels: NIVEIS.map((n) => n.label),
      datasets: [
        {
          data: values,
          backgroundColor: NIVEIS.map((n) => n.color),
          borderWidth: 0,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      cutout: "68%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = ctx.raw || 0;
              return ` ${ctx.label}: ${fmt(v)} (${fmtPct(pct(v, total))})`;
            },
          },
        },
      },
      onClick(_e, els) {
        if (!els.length) return;
        toggleFilter("nivel", NIVEIS[els[0].index].key);
      },
    },
    plugins: [donutValueLabels],
  });

  document.getElementById("donutLegend").innerHTML = NIVEIS.map((n, i) => {
    const v = values[i];
    return `<li class="${state.nivel === n.key ? "active" : ""}" data-nivel="${n.key}">
      <span class="swatch" style="background:${n.color}"></span>
      <span>${n.label}<br><b>${fmt(v)} · ${fmtPct(pct(v, total || 1))}</b></span>
      <span></span>
    </li>`;
  }).join("");

  // center text via CSS overlay not available — legend carries detail
  void entrada;
  void percurso;
}

function renderComparativo(rows) {
  chartDefaults();
  const entrada = aggregate(rows, "entrada");
  const percurso = aggregate(rows, "percurso");
  const labels = NIVEIS.map((n) => n.short);
  const dim = (color, key) => {
    if (!state.nivel) return color;
    return matchesNivel(key) ? color : color + "55";
  };

  upsertChart("chartComparativo", {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Ciclo I",
          data: NIVEIS.map((n) => entrada[n.key] || 0),
          backgroundColor: NIVEIS.map((n) => dim("#5B9AFF", n.key)),
          borderRadius: 8,
          maxBarThickness: 36,
        },
        {
          label: "Ciclo II",
          data: NIVEIS.map((n) => percurso[n.key] || 0),
          backgroundColor: NIVEIS.map((n) => dim(n.color, n.key)),
          borderRadius: 8,
          maxBarThickness: 36,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: { boxWidth: 12, usePointStyle: true, color: chartTextColor() },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: chartTextColor() } },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(128,128,128,.15)" },
          ticks: { precision: 0, color: chartTextColor() },
        },
      },
      onClick(_e, els) {
        if (!els.length) return;
        toggleFilter("nivel", NIVEIS[els[0].index].key);
      },
    },
    plugins: [barValueLabels],
  });
}

function renderEscolas(rows) {
  chartDefaults();
  const periodo = periodoUnico();
  const drillTurmas = Boolean(state.escola);
  const groups = new Map();

  rows.forEach((row) => {
    const bloco = isComparativo() ? row.percurso : row[periodo];
    if (!bloco || !bloco.avaliados) return;
    const key = drillTurmas ? row.turma : row.escola;
    if (!groups.has(key)) {
      groups.set(key, {
        label: drillTurmas ? `Turma ${row.turma}` : shortSchool(row.escola),
        raw: key,
        escola: row.escola,
        ...emptyAgg(),
      });
    }
    addBloco(groups.get(key), bloco);
  });

  const list = [...groups.values()]
    .map((g) => ({ ...g, total: sumLevels(g) }))
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  document.getElementById("chartEscolasTitle").textContent = drillTurmas
    ? "Composição por turma"
    : "Composição por escola";
  document.getElementById("chartEscolasSub").textContent = drillTurmas
    ? "Clique em uma barra para filtrar a turma"
    : "Clique em uma barra para filtrar a escola";

  upsertChart("chartEscolas", {
    type: "bar",
    data: {
      labels: list.map((g) => g.label),
      datasets: NIVEIS.map((n) => ({
        label: n.short,
        data: list.map((g) => (matchesNivel(n.key) ? g[n.key] : 0)),
        backgroundColor: n.color,
        stack: "niveis",
        borderRadius: 4,
        maxBarThickness: 28,
      })),
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: { boxWidth: 10, usePointStyle: true, color: chartTextColor() },
        },
      },
      scales: {
        x: {
          stacked: true,
          beginAtZero: true,
          grid: { color: "rgba(128,128,128,.12)" },
          ticks: { color: chartTextColor() },
        },
        y: { stacked: true, grid: { display: false }, ticks: { color: chartTextColor() } },
      },
      onClick(_e, els) {
        if (!els.length) return;
        const g = list[els[0].index];
        if (!g) return;
        if (drillTurmas) toggleFilter("turma", g.raw);
        else toggleFilter("escola", g.escola);
      },
    },
    plugins: [stackValueLabels],
  });
}

function renderHabilidades(rows) {
  chartDefaults();
  const periodo = isComparativo() ? "percurso" : periodoUnico();
  const sums = {};
  const weights = {};

  rows.forEach((row) => {
    const bloco = row[periodo];
    if (!bloco || !bloco.avaliados || !bloco.habilidades) return;
    const w = bloco.avaliados;
    Object.entries(bloco.habilidades).forEach(([k, v]) => {
      sums[k] = (sums[k] || 0) + Number(v) * w;
      weights[k] = (weights[k] || 0) + w;
    });
  });

  const keys = Object.keys(sums).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const labels = keys.map((k) => k.toUpperCase().replace("H", "H "));
  const values = keys.map((k) => (weights[k] ? sums[k] / weights[k] : 0));
  const colors = values.map((v) => (v >= 70 ? "#00E676" : v >= 50 ? "#FF9500" : "#FF3B30"));

  upsertChart("chartHabilidades", {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "% acerto",
          data: values.map((v) => Math.round(v * 10) / 10),
          backgroundColor: colors,
          borderRadius: 8,
          maxBarThickness: 32,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              return ` ${fmtPct(ctx.raw)}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: chartTextColor() } },
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: "rgba(128,128,128,.15)" },
          ticks: {
            color: chartTextColor(),
            callback: (v) => `${v}%`,
          },
        },
      },
    },
    plugins: [barValueLabels],
  });
}

function renderStatus(rows) {
  const agg = isComparativo() ? aggregate(rows, "percurso") : aggregate(rows, periodoUnico());
  const total = agg.avaliados || 1;
  const items = [
    { cls: "status-pl", label: "Defasagem", value: agg.defasagem, pct: pct(agg.defasagem, total) },
    { cls: "status-mid", label: "Intermediário", value: agg.intermediario, pct: pct(agg.intermediario, total) },
    { cls: "status-flu", label: "Adequado", value: agg.adequado, pct: pct(agg.adequado, total) },
  ];
  document.getElementById("statusRow").innerHTML = items
    .map(
      (i) => `<div class="status-card ${i.cls}">
      <strong>${fmt(i.value)}</strong>
      <span>${i.label}</span>
      <em>${fmtPct(i.pct)}</em>
    </div>`
    )
    .join("");
}

function sortedRows(rows) {
  const { key, dir } = state.sort;
  return [...rows].sort((a, b) => {
    const ba = blocoAtivo(a) || {};
    const bb = blocoAtivo(b) || {};
    let va;
    let vb;
    if (key === "avaliados" || key === "participacao" || key === "acertoTotal" || key === "defasagem" || key === "intermediario" || key === "adequado") {
      va = ba[key] ?? 0;
      vb = bb[key] ?? 0;
    } else if (key === "predominante") {
      va = predominante(ba)?.key || "";
      vb = predominante(bb)?.key || "";
    } else {
      va = a[key];
      vb = b[key];
    }
    if (typeof va === "string") return va.localeCompare(vb, "pt-BR") * dir;
    return (va - vb) * dir;
  });
}

function renderTable(rows) {
  const sorted = sortedRows(rows);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  if (state.page > pages) state.page = pages;
  const start = (state.page - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(start, start + PAGE_SIZE);

  document.getElementById("tableCount").textContent = `${fmt(sorted.length)} turma${sorted.length === 1 ? "" : "s"}`;
  document.getElementById("pageInfo").textContent = `${state.page} de ${pages}`;
  document.getElementById("pagePrev").disabled = state.page <= 1;
  document.getElementById("pageNext").disabled = state.page >= pages;

  document.getElementById("tableBody").innerHTML = pageRows
    .map((row) => {
      const b = blocoAtivo(row) || {};
      const pred = predominante(b);
      return `<tr>
        <td>${anoLabel(row.ano)}</td>
        <td>${discLabel(row.disciplina)}</td>
        <td title="${row.escola}">${shortSchool(row.escola)}</td>
        <td>${row.turma}</td>
        <td class="num">${fmt(b.previstos || row.alunos || 0)}</td>
        <td class="num">${fmt(b.avaliados || 0)}</td>
        <td class="num">${fmtPct(b.participacao || 0)}</td>
        <td class="num">${fmtPct(b.acertoTotal || 0)}</td>
        <td class="num">${fmt(b.defasagem || 0)}</td>
        <td class="num">${fmt(b.intermediario || 0)}</td>
        <td class="num">${fmt(b.adequado || 0)}</td>
        <td class="num">${pred ? `<span class="tag" style="--tag:${pred.color}">${pred.short}</span>` : "—"}</td>
      </tr>`;
    })
    .join("");
}

function exportCsv(rows) {
  const periodo = periodoUnico();
  const headers = [
    "Ano",
    "Disciplina",
    "Escola",
    "Turma",
    "Previstos",
    "Avaliados",
    "Participacao",
    "AcertoTotal",
    "Defasagem",
    "Intermediario",
    "Adequado",
    "Periodo",
  ];
  const lines = [headers.join(";")];
  sortedRows(rows).forEach((row) => {
    const b = (isComparativo() ? row.percurso : row[periodo]) || {};
    lines.push(
      [
        row.ano,
        discLabel(row.disciplina),
        row.escola,
        row.turma,
        b.previstos || 0,
        b.avaliados || 0,
        b.participacao || 0,
        b.acertoTotal || 0,
        b.defasagem || 0,
        b.intermediario || 0,
        b.adequado || 0,
        isComparativo() ? "Ciclo II" : state.periodo === "entrada" ? "Ciclo I" : "Ciclo II",
      ].join(";")
    );
  });
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `avaliacao-continua-${state.ano || "todos"}-${state.disciplina || "geral"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function resetAll() {
  state.disciplina = "";
  state.escola = "";
  state.turma = "";
  state.nivel = "";
  state.search = "";
  state.periodo = "percurso";
  state.page = 1;
  state.ano = ANO_PAGINA || "";
  const search = document.getElementById("searchInput");
  if (search) search.value = "";
  fillSelects();
  render();
}

function render() {
  applyPageYearUI();
  renderChips();
  const rows = rowsBase();
  try { renderKPIs(rows); } catch (e) { console.error("KPI", e); }
  try { renderDonut(rows); } catch (e) { console.error("Donut", e); }
  try { renderComparativo(rows); } catch (e) { console.error("Comparativo", e); }
  try { renderEscolas(rows); } catch (e) { console.error("Escolas", e); }
  try { renderHabilidades(rows); } catch (e) { console.error("Habilidades", e); }
  try { renderStatus(rows); } catch (e) { console.error("Status", e); }
  try { renderTable(rows); } catch (e) { console.error("Table", e); }
}

function bindEvents() {
  document.querySelectorAll(".nav-btn[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setView(btn.dataset.view);
      render();
    });
  });

  document.getElementById("btnResetAll")?.addEventListener("click", resetAll);
  document.getElementById("btnTheme")?.addEventListener("click", toggleTheme);
  document.getElementById("btnExport")?.addEventListener("click", () => exportCsv(rowsBase()));
  document.getElementById("pagePrev")?.addEventListener("click", () => {
    state.page -= 1;
    render();
  });
  document.getElementById("pageNext")?.addEventListener("click", () => {
    state.page += 1;
    render();
  });

  document.getElementById("searchInput")?.addEventListener("input", (e) => {
    state.search = e.target.value;
    state.page = 1;
    render();
  });

  document.getElementById("filterAno")?.addEventListener("change", (e) => {
    const ano = e.target.value;
    if (ano && ANO_PAGINA && String(ano) !== String(ANO_PAGINA)) {
      goToYear(ano);
      return;
    }
    state.ano = ano;
    state.escola = "";
    state.turma = "";
    state.page = 1;
    fillSelects();
    render();
  });

  document.getElementById("filterDisciplina")?.addEventListener("change", (e) => {
    state.disciplina = e.target.value;
    state.escola = "";
    state.turma = "";
    state.page = 1;
    fillSelects();
    render();
  });

  document.getElementById("filterEscola")?.addEventListener("change", (e) => {
    state.escola = e.target.value;
    state.turma = "";
    state.page = 1;
    fillSelects();
    render();
  });

  document.getElementById("filterTurma")?.addEventListener("change", (e) => {
    state.turma = e.target.value;
    state.page = 1;
    render();
  });

  document.getElementById("filterPeriodo")?.addEventListener("change", (e) => {
    state.periodo = e.target.value;
    state.page = 1;
    render();
  });

  document.getElementById("chips")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-clear]");
    if (!btn) return;
    const key = btn.dataset.clear;
    state[key] = "";
    if (key === "escola") state.turma = "";
    if (key === "ano") {
      state.escola = "";
      state.turma = "";
    }
    state.page = 1;
    fillSelects();
    render();
  });

  document.getElementById("donutLegend")?.addEventListener("click", (e) => {
    const li = e.target.closest("[data-nivel]");
    if (!li) return;
    toggleFilter("nivel", li.dataset.nivel);
  });

  document.getElementById("kpiLeft")?.addEventListener("click", onKpiClick);
  document.getElementById("kpiRight")?.addEventListener("click", onKpiClick);

  document.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.sort.key === key) state.sort.dir *= -1;
      else state.sort = { key, dir: 1 };
      render();
    });
  });

  document.querySelectorAll(".year-nav a").forEach((a) => {
    a.addEventListener("click", (e) => {
      const ano = a.dataset.ano;
      if (!ano) return;
      if (String(ano) === String(ANO_PAGINA)) {
        e.preventDefault();
        state.ano = ano;
        fillSelects();
        render();
      }
    });
  });
}

function onKpiClick(e) {
  const card = e.target.closest(".kpi[data-nivel]");
  if (!card || !card.dataset.nivel) return;
  toggleFilter("nivel", card.dataset.nivel);
}

function setToday() {
  const el = document.getElementById("todayLabel");
  if (!el) return;
  el.textContent = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function boot() {
  applyTheme(localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark");
  setToday();
  fillSelects();
  bindEvents();
  setView("dashboard");
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
