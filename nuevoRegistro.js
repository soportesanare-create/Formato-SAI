function calcularSemanaDelMes(fechaStr) {
  if (!fechaStr) return null;
  const [, , diaStr] = fechaStr.split("-"); // fechaStr viene como YYYY-MM-DD
  const dia = Number(diaStr);

  if (dia <= 7) return 1;
  if (dia <= 14) return 2;
  if (dia <= 21) return 3;
  return 4; // 22 hasta el fin de mes (28/29/30/31)
}

function limpiarFormularioNuevoRegistro() {
["nrFechaInfusion", "nrSemana", "nrServicio", "nrHoraCita",
   "nrHoraIngreso", "nrHoraSalida", "nrViaAcceso", "nrTiempoInfusion",
   "nrCiclo", "nrNumeroCiclos", "nrPaciente",
   "nrDelegacion", "nrEdad",
   "nrEstatusPaciente", "nrMedicos", "nrTipoTratamiento", "nrAseguradora", "nrHonorarioMedico",
   "nrSubtotal", "nrIva", "nrMontoServicio", "nrTratamiento", "nrDiagnostico", "nrNotas"].forEach(id => { $(id).value = ""; });
  $("nrSexo").value = "";
  $("nrPrimeraVez").value = "SUBSECUENTE";
  $("nrEstatusPaciente").value = "ACTIVO";
  $("nrServicio").value = "INFUSION";
}

function abrirNuevoRegistro() {
  if (!currentUser || currentUser.role !== "sede") {
    showToast("Solo los usuarios de sede pueden capturar registros.", "error");
    return;
  }
  limpiarFormularioNuevoRegistro();
  $("nuevoRegistroSedeInfo").textContent = `Sede: ${currentUser.sede} · Marca: SANARE`;
  $("drawerNuevoRegistro").classList.remove("hidden");
  $("drawerNuevoBackdrop").classList.remove("hidden");
}

function cerrarNuevoRegistro() {
  $("drawerNuevoRegistro").classList.add("hidden");
  $("drawerNuevoBackdrop").classList.add("hidden");
}

async function guardarNuevoRegistro() {
  const paciente = $("nrPaciente").value.trim();
  const fechaInfusion = $("nrFechaInfusion").value;

  if (!paciente || !fechaInfusion) {
    showToast("Paciente y Fecha Infusión son obligatorios.", "error");
    return;
  }

  const sede = currentUser.sede;
  const marca = "SANARE";

  const registro = {
    folio: generarFolio(marca, sede),
    marca,
    sede,
    fecha_infusion: fechaInfusion,
    semana: leerNumero($("nrSemana").value),
    servicio: $("nrServicio").value.trim() || null,
hora_cita: $("nrHoraCita").value ? `${$("nrHoraCita").value} hrs` : null,
    hora_ingreso: $("nrHoraIngreso").value ? `${$("nrHoraIngreso").value} hrs` : null,
    hora_salida: $("nrHoraSalida").value ? `${$("nrHoraSalida").value} hrs` : null,
    via_acceso: $("nrViaAcceso").value.trim() || null,
    tiempo_infusion: $("nrTiempoInfusion").value.trim() || null,
    ciclo: $("nrCiclo").value.trim() || null,
    numero_ciclos: leerNumero($("nrNumeroCiclos").value),
    paciente,
    delegacion_origen: $("nrDelegacion").value.trim() || null,
    edad: leerNumero($("nrEdad").value),
    sexo: $("nrSexo").value.trim() || null,
    estatus_paciente: $("nrEstatusPaciente").value.trim() || null,
    medicos: $("nrMedicos").value.trim() || null,
    tipo_tratamiento: $("nrTipoTratamiento").value.trim() || null,
    aseguradora_pago_bolsillo: $("nrAseguradora").value.trim() || null,
    honorario_medico: leerNumero($("nrHonorarioMedico").value),
    primera_vez: $("nrPrimeraVez").value,
    subtotal: leerNumero($("nrSubtotal").value),
    iva: leerNumero($("nrIva").value),
    monto_del_servicio: leerNumero($("nrMontoServicio").value),
    tratamiento: $("nrTratamiento").value.trim() || null,
    diagnostico: $("nrDiagnostico").value.trim() || null,
    notas: $("nrNotas").value.trim() || null
  };

  const btn = $("btnGuardarNuevoRegistro");
  btn.disabled = true;
  try {
    const { error } = await supabaseClient.from("cotizaciones").insert(registro);
    if (error) throw new Error(error.message);
    showToast(`Registro guardado: ${registro.folio}`, "success");
    cerrarNuevoRegistro();
    if (typeof cargarRegistros === "function") await cargarRegistros();
  } catch (err) {
    console.error(err);
    showToast(err.message || "Error al guardar el registro.", "error");
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btnAbrir = $("btnNuevoRegistro");
  const btnCerrar = $("btnCerrarDrawerNuevo");
  const btnGuardar = $("btnGuardarNuevoRegistro");
  const backdrop = $("drawerNuevoBackdrop");
  if (!btnAbrir) return;

  btnAbrir.addEventListener("click", abrirNuevoRegistro);
  btnCerrar.addEventListener("click", cerrarNuevoRegistro);
  backdrop.addEventListener("click", cerrarNuevoRegistro);
  btnGuardar.addEventListener("click", guardarNuevoRegistro);

  $("nrFechaInfusion").addEventListener("change", () => {
    const semana = calcularSemanaDelMes($("nrFechaInfusion").value);
    if (semana !== null) $("nrSemana").value = semana;
  });

  // NUEVO: calcula IVA y Monto del servicio al escribir el Subtotal
 function actualizarTotalNuevoRegistro() {
  $("nrMontoServicio").value = calcularTotal($("nrSubtotal").value, $("nrIva").value);
}

$("nrSubtotal").addEventListener("input", actualizarTotalNuevoRegistro);
$("nrIva").addEventListener("input", actualizarTotalNuevoRegistro);
});
