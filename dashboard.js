// ============================================================
// Dashboard ejecutivo (SOLO ADMIN)
// ============================================================
let execUltimaData = null;

function obtenerColoresTema() {
  const estilos = getComputedStyle(document.documentElement);
  const esClaro = document.documentElement.getAttribute("data-theme") === "light";
  return {
    esClaro,
    muted: (estilos.getPropertyValue("--muted") || "#9fb0c8").trim(),
    grid: esClaro ? "rgba(15,23,42,0.08)" : "rgba(148,163,184,0.14)",
    fondoPunto: esClaro ? "#ffffff" : "#0b1524",
    paleta: ["#4ea3ff", "#7c5cff", "#22d3ee", "#37d39a", "#ffb020", "#ff6b81", "#c084fc", "#5eead4"]
  };
}

function agruparSumaPorClave(rows, obtenerClave) {
  const mapa = new Map();
  rows.forEach(r => {
    const clave = obtenerClave(r);
    if (clave === null || clave === undefined || clave === "") return;
    const monto = Number(r.montoServicio) || 0;
    mapa.set(clave, (mapa.get(clave) || 0) + monto);
  });
  return mapa;
}

function claveMes(fechaISO) {
  if (!fechaISO) return null;
  return fechaISO.slice(0, 7); // YYYY-MM
}

function nombreMes(claveYYYYMM) {
  const [y, m] = claveYYYYMM.split("-");
  const fecha = new Date(Number(y), Number(m) - 1, 1);
  const texto = fecha.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ¿El campo "aseguradora y/o pago de bolsillo" indica pago de bolsillo?
function esPagoDeBolsillo(texto) {
  const t = normalizarEncabezado(texto);
  return !t || t.includes("bolsillo");
}

// ¿El campo "1º vez" indica paciente nuevo (vs subsecuente/recurrente)?
function esPacienteNuevo(texto) {
  const t = normalizarEncabezado(texto);
  return /1.*vez|^nuevo/.test(t);
}

// ============================================================
// TABS del dashboard ejecutivo (Resumen ejecutivo / Tabla dinámica)
// ============================================================
function initExecTabs() {
  const botones = document.querySelectorAll(".exec-tab-btn");
  if (!botones.length) return;
  botones.forEach(btn => {
    btn.addEventListener("click", () => {
      botones.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.execTab;
      $("execTabResumen").classList.toggle("hidden", tab !== "resumen");
      $("execTabPivot").classList.toggle("hidden", tab !== "pivot");
      if (tab === "pivot") renderPivot();
    });
  });
}

function renderExecutiveDashboard(rows) {
  const panel = document.getElementById("panelDashboardAdmin");
  if (!panel) return;

  execUltimaData = rows || []; // todas las sedes (sin aplicar el filtro de sede)
  if (panel.classList.contains("hidden")) return; // solo se pinta si el perfil es admin

  // Filtro de sede seleccionado en la barra de filtros superior.
  // Afecta al ticket promedio/monto total, EXCEPTO: Sede líder y
  // Sede con mejor ticket promedio, que siempre comparan todas las sedes.
  const sedeFiltro = $("filtroSede") ? $("filtroSede").value : "";
  const rowsSedeFiltrada = sedeFiltro
    ? execUltimaData.filter(r => normalizarTexto(r.sede) === normalizarTexto(sedeFiltro))
    : execUltimaData;

  const rowsConMontoTodas = execUltimaData.filter(
    r => r.montoServicio !== null && r.montoServicio !== undefined && r.montoServicio !== ""
  );
  const rowsConMonto = rowsSedeFiltrada.filter(
    r => r.montoServicio !== null && r.montoServicio !== undefined && r.montoServicio !== ""
  );

  if ($("execActualizado")) {
    $("execActualizado").textContent = `Actualizado: ${new Date().toLocaleString("es-MX")}`;
  }

  // ---- KPI: monto total y ticket promedio (respeta el filtro de sede) ----
  const montoTotal = rowsConMonto.reduce((a, r) => a + (Number(r.montoServicio) || 0), 0);
  $("execMontoTotal").textContent = formatearMoneda(montoTotal);
  $("execMontoRegistros").textContent = `${rowsConMonto.length} registro(s) facturado(s)`;
  $("execTicketPromedio").textContent = formatearMoneda(rowsConMonto.length ? montoTotal / rowsConMonto.length : 0);

  // ---- Agrupado por sede (siempre con TODAS las sedes, para poder comparar) ----
  const porSede = agruparSumaPorClave(rowsConMontoTodas, r => r.sede);
  const sedesOrdenadas = Array.from(porSede.entries()).sort((a, b) => b[1] - a[1]);
  if (sedesOrdenadas.length) {
    $("execSedeLider").textContent = sedesOrdenadas[0][0];
    $("execSedeLiderMonto").textContent = formatearMoneda(sedesOrdenadas[0][1]);
  } else {
    $("execSedeLider").textContent = "—";
    $("execSedeLiderMonto").textContent = "$0";
  }

  // ---- Tendencia mensual (mes actual vs anterior) ----
  const porMes = agruparSumaPorClave(rowsConMonto, r => claveMes(r.fechaInfusion));
  const mesesOrdenados = Array.from(porMes.keys()).sort();
  const valoresMes = mesesOrdenados.map(m => porMes.get(m));

  const cardCrecimiento = $("execCrecimiento");
  const detalleCrecimiento = $("execCrecimientoDetalle");
  if (mesesOrdenados.length >= 2) {
    const actual = valoresMes[valoresMes.length - 1];
    const anterior = valoresMes[valoresMes.length - 2];
    const cambio = anterior > 0 ? ((actual - anterior) / anterior) * 100 : (actual > 0 ? 100 : 0);
    const signo = cambio >= 0 ? "+" : "";
    cardCrecimiento.textContent = `${signo}${cambio.toFixed(1)}%`;
    cardCrecimiento.style.color = cambio >= 0 ? "#37d39a" : "#ff6b81";
    detalleCrecimiento.textContent = `${nombreMes(mesesOrdenados[mesesOrdenados.length - 1])} vs ${nombreMes(mesesOrdenados[mesesOrdenados.length - 2])}`;
  } else {
    cardCrecimiento.textContent = "—";
    cardCrecimiento.style.color = "";
    detalleCrecimiento.textContent = "Sin datos suficientes";
  }

  // ---- Origen del pago: aseguradora vs pago de bolsillo ----
  const montoBolsillo = rowsConMonto
    .filter(r => esPagoDeBolsillo(r.aseguradora))
    .reduce((a, r) => a + (Number(r.montoServicio) || 0), 0);
  const montoAseguradora = montoTotal - montoBolsillo;
  const pctAseguradora = montoTotal > 0 ? (montoAseguradora / montoTotal) * 100 : 0;
  const pctBolsillo = montoTotal > 0 ? (montoBolsillo / montoTotal) * 100 : 0;
  if ($("execOrigenPagoPct")) {
    if (montoTotal > 0) {
      const mayorEsAseguradora = montoAseguradora >= montoBolsillo;
      const pctMayor = mayorEsAseguradora ? pctAseguradora : pctBolsillo;
      const pctMenor = mayorEsAseguradora ? pctBolsillo : pctAseguradora;
      const montoMenor = mayorEsAseguradora ? montoBolsillo : montoAseguradora;
      const etiquetaMayor = mayorEsAseguradora ? "aseguradora" : "pago de bolsillo";
      const etiquetaMenor = mayorEsAseguradora ? "pago de bolsillo" : "aseguradora";

      $("execOrigenPagoPct").textContent = `${pctMayor.toFixed(0)}% ${etiquetaMayor}`;
      $("execOrigenPagoDetalle").textContent = `${pctMenor.toFixed(0)}% ${etiquetaMenor} (${formatearMoneda(montoMenor)})`;
    } else {
      $("execOrigenPagoPct").textContent = "—";
      $("execOrigenPagoDetalle").textContent = "Sin datos suficientes";
    }
  }

  // ---- Retención: pacientes nuevos vs recurrentes ----
  const nuevos = rowsConMonto.filter(r => esPacienteNuevo(r.primeraVez));
  const recurrentes = rowsConMonto.filter(r => !esPacienteNuevo(r.primeraVez));
  const pctRecurrentes = rowsConMonto.length ? (recurrentes.length / rowsConMonto.length) * 100 : 0;
  if ($("execRetencionPct")) {
    if (rowsConMonto.length) {
      const mayorEsRecurrente = recurrentes.length >= nuevos.length;
      const pctMayor = mayorEsRecurrente ? pctRecurrentes : (100 - pctRecurrentes);
      const pctMenor = mayorEsRecurrente ? (100 - pctRecurrentes) : pctRecurrentes;
      const etiquetaMayor = mayorEsRecurrente ? "recurrentes" : "de primera vez";
      const etiquetaMenor = mayorEsRecurrente ? "de primera vez" : "recurrentes";

      $("execRetencionPct").textContent = `${pctMayor.toFixed(0)}% ${etiquetaMayor}`;
      $("execRetencionDetalle").textContent = `${pctMenor.toFixed(0)}% ${etiquetaMenor}`;
    } else {
      $("execRetencionPct").textContent = "—";
      $("execRetencionDetalle").textContent = "Sin datos suficientes";
    }
  }

  // ---- Ticket promedio por sede (siempre todas las sedes, para comparar) ----
  const conteoPorSede = new Map();
  rowsConMontoTodas.forEach(r => {
    if (!r.sede) return;
    conteoPorSede.set(r.sede, (conteoPorSede.get(r.sede) || 0) + 1);
  });
  const ticketPromedioPorSede = sedesOrdenadas.map(([sede, monto]) => [sede, conteoPorSede.get(sede) ? monto / conteoPorSede.get(sede) : 0]);
  const sedeMejorTicket = ticketPromedioPorSede.slice().sort((a, b) => b[1] - a[1])[0];
  if ($("execSedeMejorTicket")) {
    $("execSedeMejorTicket").textContent = sedeMejorTicket ? sedeMejorTicket[0] : "—";
    $("execSedeMejorTicketMonto").textContent = sedeMejorTicket ? `${formatearMoneda(sedeMejorTicket[1])} por registro` : "$0 por registro";
  }

  // Si la pestaña de tabla dinámica está activa, la refrescamos también
  const tabPivot = $("execTabPivot");
  if (tabPivot && !tabPivot.classList.contains("hidden")) renderPivot();
}

// ============================================================
// TABLA DINÁMICA INTERACTIVA — datos del concentrado
// (excluye Fecha Infusión, Semana, Subtotal, Iva, Monto del
// servicio y Notas, tal como se pidió)
// ============================================================
const PIVOT_CAMPOS = [
  { key: "sede", label: "Sede" },
  { key: "servicio", label: "Servicio" },
  { key: "horaCita", label: "Hora de Cita" },
  { key: "horaIngreso", label: "Hora de Ingreso" },
  { key: "horaSalida", label: "Hora de Salida" },
  { key: "viaAcceso", label: "Vía de Acceso" },
  { key: "tiempoInfusion", label: "Tiempo de Infusión" },
  { key: "ciclo", label: "Ciclo" },
  { key: "numeroCiclos", label: "No. de Ciclos" },
  { key: "paciente", label: "Paciente" },
  { key: "delegacion", label: "Delegación de Origen" },
  { key: "edad", label: "Edad" },
  { key: "sexo", label: "Sexo" },
  { key: "estatusPaciente", label: "Estatus de Paciente" },
  { key: "medicos", label: "Médicos" },
  { key: "tipoTratamiento", label: "Tipo de tratamiento" },
  { key: "aseguradora", label: "Aseguradora y/o pago de bolsillo" },
  { key: "honorarioMedico", label: "Honorario médico" },
  { key: "primeraVez", label: "1º vez" },
  { key: "tratamiento", label: "Tratamiento" },
  { key: "diagnostico", label: "Diagnostico" }
];

const PIVOT_VALORES = [
  { key: "__conteo__", label: "Registros (conteo)" },
  { key: "honorarioMedico", label: "Honorario médico" },
  { key: "numeroCiclos", label: "No. de Ciclos" },
  { key: "edad", label: "Edad" }
];

const PIVOT_CAMPOS_TEXTO = new Set(PIVOT_CAMPOS.filter(c => c.key !== "honorarioMedico" && c.key !== "edad" && c.key !== "numeroCiclos").map(c => c.key));

function pivotEtiquetaCampo(key) {
  const campo = PIVOT_CAMPOS.find(c => c.key === key);
  return campo ? campo.label : key;
}

function pivotValorCelda(valor) {
  if (valor === null || valor === undefined || valor === "") return "SIN DATO";
  return String(valor).trim().toUpperCase() || "SIN DATO";
}

function initPivotSelects() {
  const selFilas = $("pivotFilas");
  const selCols = $("pivotColumnas");
  const selValor = $("pivotValor");
  if (!selFilas || !selCols || !selValor) return;

  selFilas.innerHTML = PIVOT_CAMPOS.map(c => `<option value="${c.key}">${c.label}</option>`).join("");
  selCols.innerHTML = `<option value="">— Ninguna —</option>` + PIVOT_CAMPOS.map(c => `<option value="${c.key}">${c.label}</option>`).join("");
  selValor.innerHTML = PIVOT_VALORES.map(v => `<option value="${v.key}">${v.label}</option>`).join("");

  // Valores por defecto que suelen dar una vista interesante desde el primer vistazo
  selFilas.value = "medicos";
  selCols.value = "sede";
  selValor.value = "__conteo__";
}

function pivotFuncionActual() {
  const valorKey = $("pivotValor").value;
  const selFuncion = $("pivotFuncion");
  if (valorKey === "__conteo__") {
    selFuncion.value = "count";
    selFuncion.disabled = true;
    return "count";
  }
  selFuncion.disabled = false;
  if (selFuncion.value === "count") selFuncion.value = "sum";
  return selFuncion.value;
}

function pivotAplicarBusqueda(rows, texto) {
  const q = normalizarTexto(texto || "");
  if (!q) return rows;
  return rows.filter(r => PIVOT_CAMPOS.some(c => normalizarTexto(r[c.key]).includes(q)));
}

function pivotAgregar(valores, funcion) {
  if (!valores.length) return 0;
  switch (funcion) {
    case "count": return valores.length;
    case "sum": return valores.reduce((a, v) => a + v, 0);
    case "avg": return valores.reduce((a, v) => a + v, 0) / valores.length;
    case "max": return Math.max(...valores);
    case "min": return Math.min(...valores);
    default: return valores.length;
  }
}

function construirPivot(rows, filasKey, colKey, valorKey, funcion) {
  // celdas: Map("valorFila|||valorCol" -> array de valores numéricos u ocurrencias)
  const celdas = new Map();
  const totalesFila = new Map();
  const totalesCol = new Map();
  let granTotal = [];

  rows.forEach(r => {
    const vFila = pivotValorCelda(r[filasKey]);
    const vCol = colKey ? pivotValorCelda(r[colKey]) : "__TOTAL__";
    const valorNumerico = valorKey === "__conteo__" ? 1 : Number(r[valorKey]);
    if (valorKey !== "__conteo__" && (valorNumerico === null || isNaN(valorNumerico))) return;

    const claveCelda = `${vFila}|||${vCol}`;
    if (!celdas.has(claveCelda)) celdas.set(claveCelda, []);
    celdas.get(claveCelda).push(valorNumerico);

    if (!totalesFila.has(vFila)) totalesFila.set(vFila, []);
    totalesFila.get(vFila).push(valorNumerico);

    if (!totalesCol.has(vCol)) totalesCol.set(vCol, []);
    totalesCol.get(vCol).push(valorNumerico);

    granTotal.push(valorNumerico);
  });

  const filasOrdenadas = Array.from(totalesFila.entries())
    .map(([clave, valores]) => [clave, pivotAgregar(valores, funcion)])
    .sort((a, b) => b[1] - a[1])
    .map(([clave]) => clave);

  const colsOrdenadas = colKey
    ? Array.from(totalesCol.entries())
        .map(([clave, valores]) => [clave, pivotAgregar(valores, funcion)])
        .sort((a, b) => b[1] - a[1])
        .map(([clave]) => clave)
    : ["__TOTAL__"];

  const matriz = filasOrdenadas.map(fila => {
    return colsOrdenadas.map(col => {
      const valores = celdas.get(`${fila}|||${col}`) || [];
      return valores.length ? pivotAgregar(valores, funcion) : null;
    });
  });

  return {
    filas: filasOrdenadas,
    columnas: colsOrdenadas,
    matriz,
    totalesFila: filasOrdenadas.map(f => pivotAgregar(totalesFila.get(f) || [], funcion)),
    totalesCol: colsOrdenadas.map(c => pivotAgregar(totalesCol.get(c) || [], funcion)),
    granTotal: pivotAgregar(granTotal, funcion)
  };
}

function pivotFormatearValor(valor, valorKey) {
  if (valor === null || valor === undefined) return "—";
  if (valorKey === "honorarioMedico") return formatearMoneda(valor);
  if (valorKey === "__conteo__") return Math.round(valor).toLocaleString("es-MX");
  return (Math.round(valor * 100) / 100).toLocaleString("es-MX");
}

function renderPivot() {
  const tabla = $("pivotTabla");
  if (!tabla) return;

  const filasKey = $("pivotFilas").value;
  const colKey = $("pivotColumnas").value;
  const valorKey = $("pivotValor").value;
  const funcion = pivotFuncionActual();
  const texto = $("pivotBuscar") ? $("pivotBuscar").value : "";

  const rowsBase = (execUltimaData || []).filter(r => r.paciente);
  const rows = pivotAplicarBusqueda(rowsBase, texto);

  const vacio = $("pivotVacio");
  if (!rows.length) {
    tabla.innerHTML = "";
    if (vacio) vacio.classList.remove("hidden");
    $("pivotInsightTotal").textContent = "0";
    $("pivotInsightTop").textContent = "—";
    $("pivotInsightTopDetalle").textContent = "Sin datos";
    $("pivotInsightFilas").textContent = "0";
    $("pivotInsightColumnas").textContent = "0";
    return;
  }
  if (vacio) vacio.classList.add("hidden");

  const pivot = construirPivot(rows, filasKey, colKey, valorKey, funcion);

  // ---- Insights (para el efecto "wow") ----
  $("pivotInsightTotal").textContent = pivotFormatearValor(pivot.granTotal, valorKey);
  $("pivotInsightFilas").textContent = String(pivot.filas.length);
  $("pivotInsightColumnas").textContent = colKey ? String(pivot.columnas.length) : "1";

  let mejorValor = -Infinity, mejorFila = null, mejorCol = null;
  pivot.matriz.forEach((fila, i) => {
    fila.forEach((v, j) => {
      if (v !== null && v > mejorValor) { mejorValor = v; mejorFila = pivot.filas[i]; mejorCol = pivot.columnas[j]; }
    });
  });
  if (mejorFila !== null) {
    $("pivotInsightTop").textContent = pivotFormatearValor(mejorValor, valorKey);
    $("pivotInsightTopDetalle").textContent = colKey && mejorCol !== "__TOTAL__"
      ? `${mejorFila} × ${mejorCol}`
      : mejorFila;
  } else {
    $("pivotInsightTop").textContent = "—";
    $("pivotInsightTopDetalle").textContent = "Sin datos";
  }

  // ---- Render de la tabla con heatmap ----
  const maxCelda = Math.max(1, ...pivot.matriz.flat().filter(v => v !== null));
  const colores = obtenerColoresTema();

  const filasLabel = pivotEtiquetaCampo(filasKey);
  const colsLabel = colKey ? pivotEtiquetaCampo(colKey) : "";

  let html = "<thead><tr>";
  html += `<th class="pivot-corner">${escapeHtml(filasLabel)}${colKey ? ` \\ ${escapeHtml(colsLabel)}` : ""}</th>`;
  pivot.columnas.forEach(col => {
    html += `<th>${escapeHtml(col === "__TOTAL__" ? "Total" : col)}</th>`;
  });
  if (colKey) html += `<th class="pivot-total-col">Total</th>`;
  html += "</tr></thead><tbody>";

  pivot.filas.forEach((fila, i) => {
    html += `<tr><th class="pivot-row-head">${escapeHtml(fila)}</th>`;
    pivot.matriz[i].forEach(valor => {
      if (valor === null) {
        html += `<td class="pivot-vacia">—</td>`;
      } else {
        const alpha = Math.min(0.65, 0.08 + (valor / maxCelda) * 0.57);
        html += `<td style="background: rgba(78,163,255,${alpha.toFixed(3)})">${pivotFormatearValor(valor, valorKey)}</td>`;
      }
    });
    if (colKey) html += `<td class="pivot-total-col">${pivotFormatearValor(pivot.totalesFila[i], valorKey)}</td>`;
    html += "</tr>";
  });

  html += `<tr class="pivot-total-row"><th>Total</th>`;
  pivot.totalesCol.forEach(v => { html += `<td>${pivotFormatearValor(v, valorKey)}</td>`; });
  if (colKey) html += `<td>${pivotFormatearValor(pivot.granTotal, valorKey)}</td>`;
  html += "</tr></tbody>";

  tabla.innerHTML = html;
}

function exportarPivotAExcel() {
  const tabla = $("pivotTabla");
  if (!tabla || !tabla.querySelector("tbody")) {
    showToast("No hay datos en la tabla dinámica para exportar.", "error");
    return;
  }
  if (typeof XLSX === "undefined") {
    showToast("No se pudo exportar: falta la librería XLSX.", "error");
    return;
  }
  const hoja = XLSX.utils.table_to_sheet(tabla);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Tabla dinamica");
  const fechaHoy = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(libro, `tabla_dinamica_${fechaHoy}.xlsx`);
  showToast("Tabla dinámica exportada.", "success");
}

function initPivotEventos() {
  initPivotSelects();

  ["pivotFilas", "pivotColumnas", "pivotValor", "pivotFuncion"].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener("change", renderPivot);
  });

  const buscador = $("pivotBuscar");
  if (buscador) buscador.addEventListener("input", () => renderPivot());

  const btnIntercambiar = $("btnPivotIntercambiar");
  if (btnIntercambiar) {
    btnIntercambiar.addEventListener("click", () => {
      const selFilas = $("pivotFilas");
      const selCols = $("pivotColumnas");
      if (!selCols.value) { showToast("Elige una columna para poder intercambiar.", "error"); return; }
      const filasActual = selFilas.value;
      selFilas.value = selCols.value;
      selCols.value = filasActual;
      renderPivot();
    });
  }

  const btnExportar = $("btnPivotExportar");
  if (btnExportar) btnExportar.addEventListener("click", exportarPivotAExcel);
}

document.addEventListener("DOMContentLoaded", () => {
  initExecTabs();
  initPivotEventos();
});

// Vuelve a pintar la tabla dinámica con la paleta correcta al cambiar de tema
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-theme-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      setTimeout(() => {
        const tabPivot = $("execTabPivot");
        if (execUltimaData && tabPivot && !tabPivot.classList.contains("hidden")) renderPivot();
      }, 50);
    });
  });
});

window.renderExecutiveDashboard = renderExecutiveDashboard;
