const USERS = [
  { username: "admin",    password: "innvida2026", role: "admin", sede: null,       displayName: "Administración general" },
  { username: "morelia",  password: "morelia2026", role: "sede",  sede: "Morelia",  displayName: "Sede Morelia" },
  { username: "toluca",   password: "toluca2026",  role: "sede",  sede: "Toluca",   displayName: "Sede Toluca" },
  { username: "narvarte", password: "narvarte2026",role: "sede",  sede: "Narvarte", displayName: "Sede Narvarte" },
  { username: "tijuana",  password: "tijuana2026", role: "sede",  sede: "Tijuana",  displayName: "Sede Tijuana" }
];

const SESSION_KEY = "innvidaSesionUsuario";

// currentUser queda disponible globalmente para que main.js lo use
let currentUser = null;

function findUser(username, password) {
  const normalized = String(username || "").trim().toLowerCase();
  return USERS.find(u => u.username.toLowerCase() === normalized && u.password === password) || null;
}

function saveSession(user) {
  // Guardamos solo lo necesario, nunca la contraseña
  const { username, role, sede, displayName } = user;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ username, role, sede, displayName }));
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function showApp() {
  document.getElementById("loginContainer").classList.add("hidden");
  document.getElementById("appContainer").classList.remove("hidden");
  applyRoleToUI();
  // Si main.js ya cargó sus funciones, inicializamos el dashboard aquí
  if (typeof initDashboard === "function") initDashboard();
}

function showLogin() {
  document.getElementById("appContainer").classList.add("hidden");
  document.getElementById("loginContainer").classList.remove("hidden");
}

// ----- 2) Ajustar la interfaz según el rol -----------------------
function applyRoleToUI() {
  const info = document.getElementById("sesionInfo");
  if (info) {
    info.textContent = currentUser.role === "admin"
      ? `${currentUser.displayName} · Ve todas las sedes`
      : `${currentUser.displayName} · Sede asignada: ${currentUser.sede}`;
  }

  const campoSede = document.getElementById("campoFiltroSede");
  if (campoSede) {
    // Los perfiles de sede no necesitan elegir sede: ya está fija.
    campoSede.classList.toggle("hidden", currentUser.role !== "admin");
  }
 // NUEVO: Importar solo para sede, Exportar solo para admin
  const btnImportar = document.getElementById("btnImportarExcel");
  const btnExportar = document.getElementById("btnExportarExcel");
  if (btnImportar) btnImportar.classList.toggle("hidden", currentUser.role === "admin");
  if (btnExportar) btnExportar.classList.toggle("hidden", currentUser.role !== "admin");

  // NUEVO: Dashboard ejecutivo — visible SOLO para admin
  const panelDashboardAdmin = document.getElementById("panelDashboardAdmin");
  if (panelDashboardAdmin) panelDashboardAdmin.classList.toggle("hidden", currentUser.role !== "admin");

  // NUEVO: "Nuevo registro" solo visible para perfiles de sede, oculto para admin
  const btnNuevoRegistro = document.getElementById("btnNuevoRegistro");
  if (btnNuevoRegistro) btnNuevoRegistro.classList.toggle("hidden", currentUser.role === "admin");

  // NUEVO: Editar y Borrar registros: SOLO admin puede hacerlo
  const btnGuardarDetalle = document.getElementById("btnGuardarDetalle");
  const btnBorrarRegistro = document.getElementById("btnBorrarRegistro");
  if (btnGuardarDetalle) btnGuardarDetalle.classList.toggle("hidden", currentUser.role !== "admin");
  if (btnBorrarRegistro) btnBorrarRegistro.classList.toggle("hidden", currentUser.role !== "admin");
}

// ----- 3) Eventos de login / logout -------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const saved = loadSession();
  if (saved) {
    currentUser = saved;
    showApp();
  }

  const form = document.getElementById("loginForm");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const username = document.getElementById("loginUsername").value;
    const password = document.getElementById("loginPassword").value;
    const errorEl = document.getElementById("loginError");
    const user = findUser(username, password);
    if (user) {
      currentUser = user;
      saveSession(user);
      errorEl.style.display = "none";
      showApp();
    } else {
      errorEl.style.display = "block";
    }
  });

  const btnSalir = document.getElementById("btnCerrarSesion");
  btnSalir.addEventListener("click", () => {
    clearSession();
    currentUser = null;
    window.location.reload();
  });
});
