// ============================================================
// Dashboard ejecutivo (SOLO ADMIN) — Monto del servicio
// ============================================================
let execCharts = {};
let execUltimaData = null;
let execPacientesData = [];

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

function destruirGrafico(id) {
  if (execCharts[id]) {
    execCharts[id].destroy();
    delete execCharts[id];
  }
}

// ---- Tabla de pacientes: agrupa por paciente y determina si es recurrente ----
function construirResumenPacientes(rows) {
  const mapa = new Map(); // clave (paciente en minúsculas) -> resumen

  (rows || []).forEach(r => {
    const nombre = String(r.paciente || "").trim();
    if (!nombre) return;
    const clave = nombre.toLowerCase();

    const actual = mapa.get(clave) || {
      paciente: nombre,
      sede: r.sede || "",
      visitas: 0,
      montoTotal: 0,
      ultimaFecha: null,
      esNuevoUltimaVisita: true
    };

    actual.visitas += 1;
    actual.montoTotal += Number(r.montoServicio) || 0;
    if (r.sede) actual.sede = r.sede;

    // Nos quedamos con el dato de "1º vez" de la visita más reciente
    if (r.fechaInfusion && (!actual.ultimaFecha || r.fechaInfusion > actual.ultimaFecha)) {
      actual.ultimaFecha = r.fechaInfusion;
      actual.esNuevoUltimaVisita = esPacienteNuevo(r.primeraVez);
    }

    mapa.set(clave, actual);
  });

  return Array.from(mapa.values())
    .map(p => ({
      ...p,
      // Recurrente si tiene más de una visita registrada, o si su visita más reciente así lo indica
      recurrente: p.visitas > 1 || !p.esNuevoUltimaVisita
    }))
    .sort((a, b) => b.visitas - a.visitas || a.paciente.localeCompare(b.paciente, "es"));
}

function filtrarPacientes(lista, texto) {
  const q = normalizarEncabezado(texto || "");
  if (!q) return lista;
  return lista.filter(p => normalizarEncabezado(p.paciente).includes(q));
}

function renderTablaPacientes(lista) {
  const tbody = $("execPacientesTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!lista.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "muted";
    td.textContent = "Sin pacientes que coincidan.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  lista.slice(0, 300).forEach(p => {
    const tr = document.createElement("tr");

    const tdPaciente = document.createElement("td");
    tdPaciente.textContent = p.paciente;
    tr.appendChild(tdPaciente);

    const tdSede = document.createElement("td");
    tdSede.textContent = p.sede || "—";
    tr.appendChild(tdSede);

    const tdVisitas = document.createElement("td");
    tdVisitas.textContent = p.visitas;
    tr.appendChild(tdVisitas);

   const tdMonto = document.createElement("td");
    tdMonto.textContent = formatearMoneda(p.montoTotal || 0);
    tr.appendChild(tdMonto);

    const tdEstatus = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = `pill ${p.recurrente ? "pill-recurrente" : "pill-nuevo"}`;
    pill.textContent = p.recurrente ? "Recurrente" : "Nuevo";
    tdEstatus.appendChild(pill);
    tr.appendChild(tdEstatus);

    tbody.appendChild(tr);
  });
}

function opcionesBase(colores, cfg = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { ticks: { color: colores.muted }, grid: { color: colores.grid } },
      y: {
        ticks: { color: colores.muted, callback: (v) => (cfg.moneda ? formatearMoneda(v) : v) },
        grid: { color: colores.grid }
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => (cfg.moneda ? formatearMoneda(ctx.parsed.y ?? ctx.parsed) : ctx.formattedValue)
        }
      }
    }
  };
}

function renderExecutiveDashboard(rows) {
  const panel = document.getElementById("panelDashboardAdmin");
  if (!panel) return;

  execUltimaData = rows || []; // todas las sedes (sin aplicar el filtro de sede)
  if (panel.classList.contains("hidden")) return; // solo se pinta si el perfil es admin
  if (typeof Chart === "undefined") return;

  const colores = obtenerColoresTema();

  // Filtro de sede seleccionado en la barra de filtros superior.
  // Afecta a la mayoría de las tarjetas/gráficos del dashboard, EXCEPTO:
  // Sede líder, Sede con mejor ticket promedio, el gráfico "por sede" y la
  // tabla de pacientes, que siempre comparan/muestran todas las sedes.
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

  // ---- Tendencia mensual ----
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

  // ---- Mezcla de tratamientos ----
  const porTratamiento = agruparSumaPorClave(rowsConMonto, r => (r.tipoTratamiento || "Sin especificar").trim().toUpperCase());
  const tratamientosOrdenados = Array.from(porTratamiento.entries()).sort((a, b) => b[1] - a[1]);
  const topTratamientos = tratamientosOrdenados.slice(0, 6);
  const otrosTratamientos = tratamientosOrdenados.slice(6).reduce((a, [, v]) => a + v, 0);
  if (otrosTratamientos > 0) topTratamientos.push(["OTROS", otrosTratamientos]);
  const porMedico = agruparSumaPorClave(rowsConMonto, r => (r.medicos || "Sin especificar").trim().toUpperCase());
  const medicosOrdenados = Array.from(porMedico.entries()).sort((a, b) => b[1] - a[1]);

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

  // Ticket promedio por pagador (bolsillo + cada aseguradora), para saber quién paga mejor
  const pagadorAcumulado = new Map(); // nombre -> { monto, cuenta }
  rowsConMonto.forEach(r => {
    const nombre = esPagoDeBolsillo(r.aseguradora) ? "PAGO DE BOLSILLO" : String(r.aseguradora || "").trim().toUpperCase();
    if (!nombre) return;
    const actual = pagadorAcumulado.get(nombre) || { monto: 0, cuenta: 0 };
    actual.monto += Number(r.montoServicio) || 0;
    actual.cuenta += 1;
    pagadorAcumulado.set(nombre, actual);
  });
  const ticketPorPagador = Array.from(pagadorAcumulado.entries())
    .map(([nombre, v]) => [nombre, v.cuenta ? v.monto / v.cuenta : 0])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

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

  // ---- Tabla de pacientes: visitas y si son recurrentes ----
  execPacientesData = construirResumenPacientes(execUltimaData);
  const filtroPacientesActual = $("execPacientesBuscar") ? $("execPacientesBuscar").value : "";
  renderTablaPacientes(filtrarPacientes(execPacientesData, filtroPacientesActual));

  Chart.defaults.color = colores.muted;
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";

  // ---- Gráfico: por sede (barras) ----
  destruirGrafico("sede");
  execCharts.sede = new Chart(document.getElementById("chartPorSede"), {
    type: "bar",
    data: {
      labels: sedesOrdenadas.map(([sede]) => sede),
      datasets: [{
        label: "Monto del servicio",
        data: sedesOrdenadas.map(([, v]) => v),
        backgroundColor: colores.paleta,
        borderRadius: 10,
        maxBarThickness: 46
      }]
    },
    options: opcionesBase(colores, { moneda: true })
  });

  // ---- Gráfico: mezcla de tratamientos (dona) ----
  destruirGrafico("tratamiento");
  execCharts.tratamiento = new Chart(document.getElementById("chartTratamiento"), {
    type: "doughnut",
    data: {
      labels: topTratamientos.map(([t]) => t),
      datasets: [{
        data: topTratamientos.map(([, v]) => v),
        backgroundColor: colores.paleta,
        borderColor: colores.fondoPunto,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "bottom", labels: { color: colores.muted, boxWidth: 12, padding: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatearMoneda(ctx.parsed)}` } }
      }
    }
  });
destruirGrafico("medico");
  execCharts.medico = new Chart(document.getElementById("chartPorMedico"), {
    type: "bar",
    data: {
      labels: medicosOrdenados.map(([m]) => m),
      datasets: [{
        label: "Monto del servicio",
        data: medicosOrdenados.map(([, v]) => v),
        backgroundColor: colores.paleta,
        borderRadius: 8,
        maxBarThickness: 26
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: colores.muted, callback: (v) => formatearMoneda(v) }, grid: { color: colores.grid } },
        y: { ticks: { color: colores.muted }, grid: { color: colores.grid } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => formatearMoneda(ctx.parsed.x) } }
      }
    }
  });

  // ---- Gráfico: origen del pago (dona) ----
  const elOrigenPago = document.getElementById("chartOrigenPago");
  if (elOrigenPago) {
    destruirGrafico("origenPago");
    execCharts.origenPago = new Chart(elOrigenPago, {
      type: "doughnut",
      data: {
        labels: ["Aseguradora", "Pago de bolsillo"],
        datasets: [{
          data: [montoAseguradora, montoBolsillo],
          backgroundColor: [colores.paleta[1], colores.paleta[4]],
          borderColor: colores.fondoPunto,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { position: "bottom", labels: { color: colores.muted, boxWidth: 12, padding: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatearMoneda(ctx.parsed)}` } }
        }
      }
    });
  }

  // ---- Gráfico: ticket promedio por pagador (barras horizontales) ----
  const elTicketPagador = document.getElementById("chartTicketPagador");
  if (elTicketPagador) {
    destruirGrafico("ticketPagador");
    execCharts.ticketPagador = new Chart(elTicketPagador, {
      type: "bar",
      data: {
        labels: ticketPorPagador.map(([nombre]) => nombre),
        datasets: [{
          label: "Ticket promedio",
          data: ticketPorPagador.map(([, v]) => v),
          backgroundColor: colores.paleta,
          borderRadius: 8,
          maxBarThickness: 26
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: colores.muted, callback: (v) => formatearMoneda(v) }, grid: { color: colores.grid } },
          y: { ticks: { color: colores.muted }, grid: { color: colores.grid } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => formatearMoneda(ctx.parsed.x) } }
        }
      }
    });
  }

}

// Filtra la tabla de pacientes en vivo mientras se escribe en el buscador
document.addEventListener("DOMContentLoaded", () => {
  const buscador = document.getElementById("execPacientesBuscar");
  if (buscador) {
    buscador.addEventListener("input", () => {
      renderTablaPacientes(filtrarPacientes(execPacientesData, buscador.value));
    });
  }
});

// Vuelve a pintar los gráficos con la paleta correcta al cambiar de tema
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-theme-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      setTimeout(() => {
        if (execUltimaData) renderExecutiveDashboard(execUltimaData);
      }, 50);
    });
  });
});

window.renderExecutiveDashboard = renderExecutiveDashboard;
