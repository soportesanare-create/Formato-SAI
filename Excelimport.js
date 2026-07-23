// Encabezados esperados en el Excel → nombre de columna en Supabase
const MAPA_COLUMNAS = {
  "fecha infusión": "fecha_infusion",
  "semana": "semana",
  "servicio": "servicio",
  "hora de cita": "hora_cita",
  "ciclo": "ciclo",
  "no. de ciclos": "numero_ciclos",
  "no de ciclos": "numero_ciclos",
  "numero de ciclos": "numero_ciclos",
  "paciente": "paciente",
  "delegacion de origen": "delegacion_origen",
  "edad": "edad",
  "sexo": "sexo",
  "estatus de paciente": "estatus_paciente",
  "médicos": "medicos",
  "tipo de tratamiento": "tipo_tratamiento",
  "aseguradora y/o pago de bolsillo": "aseguradora_pago_bolsillo",
  "honorario médico": "honorario_medico",
  "1º vez": "primera_vez",
  "subtotal": "subtotal",
  "iva": "iva",
  "monto del servicio": "monto_del_servicio",
  "tratamiento": "tratamiento",
  "diagnostico": "diagnostico",
  "notas": "notas"
};

function normalizarEncabezado(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita acentos
    .replace(/\s+/g, " ")
    .trim();
}

// Encuentra en qué fila están los encabezados (busca "paciente" en las primeras 10 filas)
function ubicarFilaEncabezados(filas) {
  for (let i = 0; i < Math.min(filas.length, 10); i++) {
    const normalizada = filas[i].map(normalizarEncabezado);
    if (normalizada.includes("paciente")) return i;
  }
  return -1;
}

function construirMapaIndices(filaEncabezados) {
  const mapa = {}; // { fecha_infusion: 0, paciente: 5, ... }
  filaEncabezados.forEach((valor, idx) => {
    const clave = MAPA_COLUMNAS[normalizarEncabezado(valor)];
    if (clave) mapa[clave] = idx;
  });
  return mapa;
}

// Convierte lo que venga en la celda de fecha (Date real o texto) a 'YYYY-MM-DD'
function parsearFecha(valor) {
  if (!valor) return { ok: true, valor: null };
  if (valor instanceof Date && !isNaN(valor)) {
    return { ok: true, valor: valor.toISOString().slice(0, 10) };
  }
  // Intenta con formato DD/MM/YYYY
  const match = String(valor).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    return { ok: true, valor: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` };
  }
  return { ok: false, valor: null };
}

function generarFolio(marca, sede) {
  const hoy = new Date();
  const fecha = hoy.toISOString().slice(0, 10).replace(/-/g, "");
  const azar = Math.random().toString(36).slice(2, 6).toUpperCase();
  const prefijoSede = (sede || "GEN").slice(0, 3).toUpperCase();
  return `${marca}-${prefijoSede}-${fecha}-${azar}`;
}

function leerNumero(valor) {
  const n = Number(valor);
  return isNaN(n) ? null : n;
}


async function procesarArchivoExcel(file, marca, sede) {
  const buffer = await file.arrayBuffer();
  const libro = XLSX.read(buffer, { type: "array", cellDates: true });
  const hoja = libro.Sheets[libro.SheetNames[0]]; // siempre la primera hoja
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "" });

  const filaEncabezadosIdx = ubicarFilaEncabezados(filas);
  if (filaEncabezadosIdx === -1) {
    throw new Error("No encontré la fila de encabezados (busqué la columna 'Paciente'). Revisa que el Excel tenga el formato correcto.");
  }

  const indices = construirMapaIndices(filas[filaEncabezadosIdx]);
  const registros = [];
  const errores = [];

  for (let i = filaEncabezadosIdx + 1; i < filas.length; i++) {
    const fila = filas[i];
    const paciente = fila[indices.paciente];
    if (!paciente || String(paciente).trim() === "") continue; // fila vacía, se ignora

    const fechaResult = parsearFecha(fila[indices.fecha_infusion]);
    if (!fechaResult.ok) {
      errores.push(`Fila ${i + 1}: la fecha "${fila[indices.fecha_infusion]}" no es válida — revísala en el Excel.`);
      continue;
    }

    registros.push({
      folio: generarFolio(marca, sede),
      marca,
      sede,
      fecha_infusion: fechaResult.valor,
      semana: leerNumero(fila[indices.semana]),
      servicio: fila[indices.servicio] || null,
      hora_cita: fila[indices.hora_cita] || null,
      ciclo: fila[indices.ciclo] || null,
      numero_ciclos: leerNumero(fila[indices.numero_ciclos]),
      paciente: String(paciente).trim(),
      delegacion_origen: fila[indices.delegacion_origen] || null,
      edad: leerNumero(fila[indices.edad]),
      sexo: fila[indices.sexo] || null,
      estatus_paciente: fila[indices.estatus_paciente] || null,
      medicos: fila[indices.medicos] || null,
      tipo_tratamiento: fila[indices.tipo_tratamiento] || null,
      aseguradora_pago_bolsillo: fila[indices.aseguradora_pago_bolsillo] || null,
      honorario_medico: leerNumero(fila[indices.honorario_medico]),
      primera_vez: fila[indices.primera_vez] || null,
      subtotal: leerNumero(fila[indices.subtotal]),
      iva: leerNumero(fila[indices.iva]),
      monto_del_servicio: leerNumero(fila[indices.monto_del_servicio]),
      tratamiento: fila[indices.tratamiento] || null,
      diagnostico: fila[indices.diagnostico] || null,
      notas: fila[indices.notas] || null
    });
  }

  return { registros, errores };
}

async function importarExcelASupabase(file, marca, sede) {
  const { registros, errores } = await procesarArchivoExcel(file, marca, sede);

  if (registros.length === 0) {
    return { insertados: 0, duplicados: 0, errores: errores.length ? errores : ["No se encontró ninguna fila con datos de paciente."] };
  }

  // Se inserta todo el archivo sin validar duplicados contra Supabase.
  // Si algo se sube de más o repetido, se elimina manualmente después.
  const { error } = await supabaseClient.from("cotizaciones").insert(registros);
  if (error) {
    throw new Error(`Error al guardar en Supabase: ${error.message}`);
  }

  return { insertados: registros.length, duplicados: 0, errores };
}

// ----- Conexión con la UI -----
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnImportarExcel");
  const input = document.getElementById("inputExcelFile");
  if (!btn || !input) return;

  btn.addEventListener("click", () => input.click());

  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;

    const marca = "SANARÉ";
    const sede = currentUser && currentUser.role === "sede" ? currentUser.sede : "";

    if (!sede) {
      showToast("Solo los usuarios de sede pueden importar (el admin no tiene sede asignada).", "error");
      input.value = "";
      return;
    }

    try {
      showToast("Importando archivo...", "success");
      const resultado = await importarExcelASupabase(file, marca, sede);

      if (resultado.errores.length) {
        console.warn("Filas con problemas al importar:", resultado.errores);
      }

      if (resultado.insertados > 0) {
        const partes = [`${resultado.insertados} registro(s) importado(s)`];
        if (resultado.duplicados) partes.push(`${resultado.duplicados} ya existían y se omitieron`);
        if (resultado.errores.length) partes.push(`${resultado.errores.length} fila(s) con errores (ver consola)`);
        showToast(partes.join(" · "), "success");
        if (typeof cargarRegistros === "function") await cargarRegistros();
      } else if (resultado.duplicados) {
        showToast(`Todos los registros (${resultado.duplicados}) ya existían — no se importó nada nuevo.`, "error");
      } else {
        showToast("No se importó ningún registro. Revisa la consola para más detalle.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast(err.message || "Error al importar el archivo.", "error");
    } finally {
      input.value = "";
    }
  });
});
// ----- Exportar a Excel (solo ADMIN) -----
function exportarRegistrosAExcel() {
  if (!allRows || allRows.length === 0) {
    showToast("No hay registros para exportar.", "error");
    return;
  }

  // Exporta lo que se está viendo actualmente (respeta los filtros aplicados)
  const filasParaExportar = (typeof filteredRows !== "undefined" && filteredRows.length) ? filteredRows : allRows;

  const datosExcel = filasParaExportar.map(r => ({
    "Folio": r.folio || "",
    "Sede": r.sede || "",
    "Fecha Infusión": r.fechaInfusion || "",
    "Semana": r.semana ?? "",
    "Servicio": r.servicio || "",
    "Hora de Cita": r.horaCita || "",
    "Ciclo": r.ciclo || "",
    "No. de Ciclos": r.numeroCiclos ?? "",
    "Paciente": r.paciente || "",
    "Delegación de Origen": r.delegacion || "",
    "Edad": r.edad ?? "",
    "Sexo": r.sexo || "",
    "Estatus de Paciente": r.estatusPaciente || "",
    "Médicos": r.medicos || "",
    "Tipo de tratamiento": r.tipoTratamiento || "",
    "Aseguradora y/o pago de bolsillo": r.aseguradora || "",
    "Honorario médico": r.honorarioMedico ?? "",
    "1º vez": r.primeraVez || "",
    "Subtotal": r.subtotal ?? "",
    "Iva": r.iva ?? "",
    "Monto del servicio": r.montoServicio ?? "",
    "Tratamiento": r.tratamiento || "",
    "Diagnostico": r.diagnostico || "",
    "Notas": r.notas || ""
  }));

  const hoja = XLSX.utils.json_to_sheet(datosExcel);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Cotizaciones");

  const fechaHoy = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(libro, `cotizaciones_${fechaHoy}.xlsx`);

  showToast(`${datosExcel.length} registro(s) exportado(s).`, "success");
}

document.addEventListener("DOMContentLoaded", () => {
  const btnExportar = document.getElementById("btnExportarExcel");
  if (btnExportar) btnExportar.addEventListener("click", exportarRegistrosAExcel);
});
