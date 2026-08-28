const START = 7 * 60;
const END = 19 * 60;
const STEP = 30;
const DAY = "2026-08-28";
const STORAGE_KEY = "la-tournee-planning-v1";
const VALIDATED_KEY = "la-tournee-validations-v1";
const slots = Array.from({ length: (END - START) / STEP + 1 }, (_, i) => START + i * STEP);

const nurses = [
  { id: "anne", name: "Anne", initials: "AN", color: "#3f806d", icon: "🌿" },
  { id: "claire", name: "Claire", initials: "CL", color: "#d47f61", icon: "☀️" },
  { id: "marie", name: "Marie", initials: "MA", color: "#517f9a", icon: "💧" },
  { id: "sophie", name: "Sophie", initials: "SO", color: "#8e6b9e", icon: "✦" },
  { id: "nadia", name: "Nadia", initials: "NA", color: "#c1903e", icon: "🌼" }
];

const seedPatients = [
  ["dupont", "Mme Dupont", "Pansement", 8, 11], ["martin", "M. Martin", "Injection", 7.5, 10],
  ["durand", "Mme Durand", "Prise de sang", 7, 9.5], ["bernard", "M. Bernard", "Perfusion", 10, 13.5],
  ["legrand", "Mme Legrand", "Pansement", 12.5, 16], ["petit", "M. Petit", "Injection", 14, 18],
  ["moreau", "Mme Moreau", "Pansement", 10.5, 14], ["robert", "M. Robert", "Prise de sang", 8, 12],
  ["garcia", "Mme Garcia", "Surveillance", 15, 19]
];

let patientDirectory = createPatientDirectory();
let patients = createPatients();
let selectedNurse = null;
let draggedNurse = null;
let draggedAssignment = null;
let nextAssignmentId = 1;
let agendaNurse = null;
let nurseClickTimer = null;
let agendaAutoCloseHandler = null;
let validatedSignature = null;
let windowGestureMoved = false;
const planner = document.getElementById("planner");
const nurseList = document.getElementById("nurseList");
const status = document.getElementById("status");
const score = document.getElementById("score");
const nurseAgenda = document.getElementById("nurseAgenda");
const agendaTitle = document.getElementById("agendaTitle");
const agendaSummary = document.getElementById("agendaSummary");
const nurseTimeline = document.getElementById("nurseTimeline");
const agendaBody = document.getElementById("agendaBody");
const validationBadge = document.getElementById("validationBadge");
const printGroup = document.getElementById("printGroup");
const profileDialog = document.getElementById("profileDialog");
const profileForm = document.getElementById("profileForm");
const profileTitle = document.getElementById("profileTitle");
const profileLastName = document.getElementById("profileLastName");
const profileFirstName = document.getElementById("profileFirstName");
const profileProNumber = document.getElementById("profileProNumber");
const profilePhone = document.getElementById("profilePhone");
const profileCare = document.getElementById("profileCare");
const schedulePatientDialog = document.getElementById("schedulePatientDialog");
const schedulePatientSelect = document.getElementById("schedulePatientSelect");
const scheduleCare = document.getElementById("scheduleCare");
const scheduleMin = document.getElementById("scheduleMin");
const scheduleMax = document.getElementById("scheduleMax");
let profileTarget = null;
let linkedFileHandle = null;
let linkedWriteTimer = null;
let selectedAssignment = null;

function createPatientDirectory() { return seedPatients.map(([id, name]) => ({ id, name, firstName: "", lastName: name.replace(/^M(me)?\.?\s*/, ""), phone: "" })); }
function createPatients() { return seedPatients.map(([id, name, care, min, max]) => ({ id: `visit-${id}`, personId: id, name, firstName: "", lastName: name.replace(/^M(me)?\.?\s*/, ""), phone: "", care, min: min * 60, max: max * 60, assignments: [] })); }
function time(value) { return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }

function fillTimeSelect(select, values, selected) {
  select.replaceChildren(...values.map(value => { const option = document.createElement("option"); option.value = value; option.textContent = time(value); option.selected = value === selected; return option; }));
}

function minutesFromTime(value) { const [hours, minutes] = String(value).split(":").map(Number); return hours * 60 + minutes; }

function normalizeImportedPlanning(payload) {
  if (payload?.current?.format === "la-tournee-v1") return payload.current;
  if (payload?.format === "la-tournee-v1") return payload;
  if (payload?.format !== "la-tournee-demo-v1" || !Array.isArray(payload.planning)) throw new Error("Format inconnu");
  const directory = (payload.patientDirectory || []).map(person => ({ ...person, name: [person.firstName, person.lastName].filter(Boolean).join(" ") }));
  const importedNurses = (payload.nurses || []).map((item, index) => {
    const current = nurses.find(nurse => nurse.id === item.id);
    const name = [item.firstName, item.lastName].filter(Boolean).join(" ");
    return { ...current, ...item, name, initials: `${item.firstName?.charAt(0) || ""}${item.lastName?.charAt(0) || ""}`.toUpperCase(), color: current?.color || ["#3f806d", "#d47f61", "#517f9a", "#8e6b9e", "#c1903e"][index % 5], icon: current?.icon || "✚" };
  });
  const importedPatients = payload.planning.map((visit, index) => {
    const person = directory.find(item => item.id === visit.patientId) || { id: visit.patientId, name: visit.patientId, firstName: "", lastName: visit.patientId, phone: "" };
    const assignments = visit.nurseId && visit.targetTime ? [{ id: index + 1, nurseId: visit.nurseId, start: minutesFromTime(visit.targetTime) }] : [];
    return { ...person, id: `visit-import-${index}`, personId: person.id, care: visit.intervention, min: minutesFromTime(visit.window[0]), max: minutesFromTime(visit.window[1]), assignments };
  });
  return { format: "la-tournee-v1", nurses: importedNurses, patientDirectory: directory, patients: importedPatients, nextAssignmentId: importedPatients.length + 1 };
}

function applyImportedPlanning(imported, fileName) {
  if (!Array.isArray(imported.patients) || !Array.isArray(imported.nurses)) throw new Error("Planning incomplet");
  nurses.splice(0, nurses.length, ...imported.nurses);
  patientDirectory = Array.isArray(imported.patientDirectory) ? imported.patientDirectory : [];
  patients = imported.patients;
  nextAssignmentId = Number(imported.nextAssignmentId) || 1;
  selectedNurse = null; selectedAssignment = null; draggedNurse = null; draggedAssignment = null; agendaNurse = null; validatedSignature = null;
  status.textContent = `${fileName} est maintenant ouvert.`;
  render();
}

async function readPlanningFile(file) { return normalizeImportedPlanning(JSON.parse(await file.text())); }

async function writeLinkedFile() {
  if (!linkedFileHandle) return;
  try {
    const writable = await linkedFileHandle.createWritable();
    await writable.write(JSON.stringify({ current: snapshot(), validatedVersions: validatedVersions() }, null, 2));
    await writable.close();
  } catch (error) { status.textContent = "Le fichier lié n’a pas pu être mis à jour. Utilisez le bouton JSON."; }
}

function scheduleLinkedWrite() {
  if (!linkedFileHandle) return;
  clearTimeout(linkedWriteTimer);
  linkedWriteTimer = setTimeout(writeLinkedFile, 350);
}

function armAgendaAutoClose() {
  if (agendaAutoCloseHandler) document.removeEventListener("click", agendaAutoCloseHandler, true);
  agendaAutoCloseHandler = () => {
    agendaNurse = null;
    renderNurseAgenda();
    agendaAutoCloseHandler = null;
  };
  setTimeout(() => document.addEventListener("click", agendaAutoCloseHandler, { capture: true, once: true }), 0);
}

function deleteSelectedAssignment() {
  if (!selectedAssignment) return;
  const sourcePatient = patients.find(item => item.id === selectedAssignment.patientId);
  const assignment = sourcePatient?.assignments.find(item => item.id === selectedAssignment.assignmentId);
  const nurse = nurses.find(item => item.id === selectedAssignment.nurseId);
  if (!sourcePatient || !assignment || !nurse) { selectedAssignment = null; return; }
  if (!window.confirm(`Supprimer l’affectation de ${nurse.name} chez ${sourcePatient.name} ?`)) { status.textContent = "Suppression annulée."; return; }
  sourcePatient.assignments = sourcePatient.assignments.filter(item => item.id !== assignment.id);
  selectedAssignment = null; status.textContent = `L’affectation de ${nurse.name} chez ${sourcePatient.name} a été supprimée.`; render();
}

function openProfile(type, item, isNew = false) {
  profileTarget = { type, item, isNew };
  const isNurse = type === "nurse";
  profileTitle.textContent = isNew ? (isNurse ? "Nouvelle infirmière" : "Nouveau patient") : (isNurse ? "Fiche de l’infirmière" : "Fiche du patient");
  profileFirstName.value = item.firstName ?? (isNurse ? item.name : "");
  profileLastName.value = item.lastName ?? (isNurse ? "" : item.name.replace(/^M(me)?\.?\s*/, ""));
  profilePhone.value = item.phone || "";
  profileProNumber.value = item.proNumber || "";
  profileCare.value = item.care || "Pansement";
  document.getElementById("profileProGroup").hidden = !isNurse;
  document.getElementById("profileCareGroup").hidden = isNurse || type === "patient-directory";
  profileDialog.showModal();
  profileLastName.focus();
}

function renderNurses() {
  nurseList.replaceChildren(...nurses.map(nurse => {
    const count = patients.reduce((total, patient) => total + patient.assignments.filter(item => item.nurseId === nurse.id).length, 0);
    const button = document.createElement("button");
    button.type = "button"; button.className = `nurse${selectedNurse === nurse.id ? " selected" : ""}`; button.draggable = true;
    button.style.setProperty("--nurse", nurse.color);
    button.title = "Clic droit : modifier la fiche · Double-clic : voir l’emploi du temps";
    button.innerHTML = `<span class="portrait"><b>${nurse.initials}</b><i>${nurse.icon}</i></span><strong>${nurse.name}</strong><em class="nurse-count">${count} soin${count > 1 ? "s" : ""} placé${count > 1 ? "s" : ""}</em><small>∞ disponible</small>`;
    button.addEventListener("click", event => {
      if (event.detail !== 1) return;
      clearTimeout(nurseClickTimer);
      nurseClickTimer = setTimeout(() => {
        selectedNurse = nurse.id; selectedAssignment = null;
        status.textContent = `${nurse.name} reste sélectionnée pour les prochains placements, jusqu’au choix d’une autre infirmière.`;
        renderNurses();
      }, 230);
    });
    button.addEventListener("dblclick", event => {
      event.preventDefault(); clearTimeout(nurseClickTimer);
      selectedNurse = nurse.id; selectedAssignment = null;
      agendaNurse = agendaNurse === nurse.id ? null : nurse.id;
      status.textContent = agendaNurse ? `Emploi du temps de ${nurse.name} ouvert.` : `Emploi du temps de ${nurse.name} refermé.`;
      renderNurses(); renderNurseAgenda();
      if (agendaNurse) armAgendaAutoClose();
    });
    button.addEventListener("contextmenu", event => { event.preventDefault(); clearTimeout(nurseClickTimer); openProfile("nurse", nurse); });
    button.addEventListener("dragstart", event => {
      draggedAssignment = null; selectedAssignment = null; draggedNurse = nurse.id; selectedNurse = nurse.id; event.dataTransfer.setData("text/plain", nurse.id); event.dataTransfer.effectAllowed = "copy"; renderNurses();
    });
    button.addEventListener("dragend", () => { draggedNurse = null; document.querySelectorAll(".slot.over").forEach(el => el.classList.remove("over")); });
    return button;
  }));
}

function selectedNurseAssignments() {
  if (!agendaNurse) return [];
  return assignmentsForNurse(agendaNurse);
}

function assignmentsForNurse(nurseId) {
  return patients.flatMap(patient => patient.assignments
    .filter(assignment => assignment.nurseId === nurseId)
    .map(assignment => ({ ...assignment, patient: patient.name, care: patient.care })))
    .sort((a, b) => a.start - b.start);
}

function renderNurseAgenda() {
  nurseAgenda.hidden = !agendaNurse;
  if (!agendaNurse) return;
  const nurse = nurses.find(item => item.id === agendaNurse);
  const assignments = selectedNurseAssignments();
  agendaTitle.textContent = nurse.name;
  agendaTitle.style.setProperty("--nurse", nurse.color);
  agendaSummary.textContent = `${assignments.length} intervention${assignments.length > 1 ? "s" : ""} placée${assignments.length > 1 ? "s" : ""}`;
  nurseTimeline.style.setProperty("--nurse", nurse.color);
  nurseTimeline.style.setProperty("--slots", slots.length);
  nurseTimeline.replaceChildren();
  slots.forEach((value, index) => {
    const heading = document.createElement("div"); heading.className = `agenda-time${value % 60 ? " half" : ""}`; heading.style.gridColumn = index + 1; heading.textContent = time(value); nurseTimeline.appendChild(heading);
    const cell = document.createElement("div"); cell.className = "agenda-cell"; cell.style.gridColumn = index + 1;
    assignments.filter(item => item.start === value).forEach(item => { const chip = document.createElement("span"); chip.className = "agenda-chip"; chip.textContent = item.patient.replace(/^M(me)?\.?\s*/, ""); chip.title = `${item.patient} — ${item.care}`; cell.appendChild(chip); });
    nurseTimeline.appendChild(cell);
  });
  agendaBody.replaceChildren();
  if (!assignments.length) {
    const row = document.createElement("tr"); row.className = "agenda-empty"; row.innerHTML = `<td colspan="3">Aucune intervention placée — ${nurse.name} reste disponible toute la journée.</td>`; agendaBody.appendChild(row);
  } else assignments.forEach(item => {
    const row = document.createElement("tr"); row.innerHTML = `<td><strong>${time(item.start)}</strong></td><td>${item.patient}</td><td>${item.care}</td>`; agendaBody.appendChild(row);
  });
}

function renderPlanner() {
  planner.replaceChildren(); planner.style.setProperty("--slots", slots.length);
  const corner = document.createElement("div"); corner.className = "patient-heading"; corner.innerHTML = "<strong>Patients</strong><span>Réglez la plage mini–maxi</span>"; planner.appendChild(corner);
  slots.forEach((value, index) => {
    const label = document.createElement("div"); label.className = `time-heading${value % 60 ? " half" : ""}`; label.textContent = time(value); label.style.gridColumn = index + 2; planner.appendChild(label);
  });
  const orderedPatients = [...patients].sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }) || a.care.localeCompare(b.care, "fr", { sensitivity: "base" }));
  orderedPatients.forEach((patient, rowIndex) => {
    const row = rowIndex + 2;
    const label = document.createElement("div"); label.className = "patient-label"; label.style.gridRow = row;
    label.title = "Clic droit : modifier la fiche et choisir l’intervention";
    label.innerHTML = `<div><strong>${patient.name}</strong><span>${patient.care}</span></div><div class="window-values"><b>${time(patient.min)}</b><span>→</span><b>${time(patient.max)}</b></div><small class="window-help">Ajuster le rectangle →</small>`;
    label.addEventListener("contextmenu", event => { event.preventDefault(); openProfile("patient", patient); });
    planner.appendChild(label);
    const windowBand = document.createElement("div");
    const windowStart = slots.indexOf(patient.min);
    const windowSlots = (patient.max - patient.min) / STEP;
    windowBand.className = "window-band";
    windowBand.dataset.patientId = patient.id;
    windowBand.style.gridRow = row;
    windowBand.style.gridColumn = `${windowStart + 2} / span ${windowSlots}`;
    windowBand.innerHTML = `<button class="window-handle start" type="button" aria-label="Ajuster le début de la plage de ${patient.name}"></button><span class="window-time start-time">${time(patient.min)}</span><button class="window-mover" type="button" aria-label="Déplacer la plage de ${patient.name}"><strong>Glisser</strong><small>⋮⋮</small></button><span class="window-time end-time">${time(patient.max)}</span><button class="window-handle end" type="button" aria-label="Ajuster la fin de la plage de ${patient.name}"></button>`;
    windowBand.querySelector(".window-handle.start").addEventListener("pointerdown", event => beginWindowGesture(patient, windowBand, "start", event));
    windowBand.querySelector(".window-handle.end").addEventListener("pointerdown", event => beginWindowGesture(patient, windowBand, "end", event));
    windowBand.querySelector(".window-mover").addEventListener("pointerdown", event => beginWindowGesture(patient, windowBand, "move", event));
    windowBand.addEventListener("dragover", event => { if (!draggedNurse) return; event.preventDefault(); windowBand.classList.add("drop-ready"); event.dataTransfer.dropEffect = draggedAssignment ? "move" : "copy"; });
    windowBand.addEventListener("dragleave", () => windowBand.classList.remove("drop-ready"));
    windowBand.addEventListener("drop", event => { event.preventDefault(); windowBand.classList.remove("drop-ready"); const rect = windowBand.getBoundingClientRect(); const offset = Math.max(0, Math.min(windowSlots, Math.round((event.clientX - rect.left) / (rect.width / windowSlots)))); place(patient, patient.min + offset * STEP, event.dataTransfer.getData("text/plain") || draggedNurse); });
    windowBand.addEventListener("click", event => {
      if (event.target.closest(".window-handle") || windowGestureMoved) return;
      const rect = windowBand.getBoundingClientRect();
      const offset = Math.max(0, Math.min(windowSlots, Math.round((event.clientX - rect.left) / (rect.width / windowSlots))));
      if (selectedAssignment) draggedAssignment = { patientId: selectedAssignment.patientId, assignmentId: selectedAssignment.assignmentId };
      place(patient, patient.min + offset * STEP, selectedAssignment?.nurseId || selectedNurse);
    });
    windowBand.addEventListener("contextmenu", event => {
      event.preventDefault(); event.stopPropagation();
      if (!window.confirm(`Supprimer ${patient.name} et toutes ses affectations du planning ?`)) return;
      patients = patients.filter(item => item.id !== patient.id);
      status.textContent = `${patient.name} a été supprimé du planning.`;
      render();
    });
    planner.appendChild(windowBand);
    slots.forEach((value, colIndex) => {
      const inWindow = value >= patient.min && value <= patient.max;
      const cell = document.createElement("button"); cell.type = "button"; cell.className = `slot${inWindow ? " open allowed" : " inactive"}`; cell.setAttribute("aria-disabled", String(!inWindow));
      cell.style.gridRow = row; cell.style.gridColumn = colIndex + 2; cell.setAttribute("aria-label", `${patient.name}, ${time(value)}`);
      if (inWindow) {
        cell.addEventListener("click", () => { if (selectedAssignment) draggedAssignment = { patientId: selectedAssignment.patientId, assignmentId: selectedAssignment.assignmentId }; place(patient, value, selectedAssignment?.nurseId || selectedNurse); });
        cell.addEventListener("dragover", event => { if (!draggedNurse) return; event.preventDefault(); cell.classList.add("over"); event.dataTransfer.dropEffect = draggedAssignment ? "move" : "copy"; });
        cell.addEventListener("dragleave", () => cell.classList.remove("over"));
        cell.addEventListener("drop", event => { event.preventDefault(); cell.classList.remove("over"); place(patient, value, event.dataTransfer.getData("text/plain") || draggedNurse); });
      } else cell.addEventListener("click", deleteSelectedAssignment);
      planner.appendChild(cell);
    });
    patient.assignments.forEach(assignment => {
      const nurse = nurses.find(item => item.id === assignment.nurseId);
      const sameSlot = patient.assignments.filter(item => item.start === assignment.start);
      const stackIndex = sameSlot.findIndex(item => item.id === assignment.id);
      const isSelectedAssignment = selectedAssignment?.patientId === patient.id && selectedAssignment?.assignmentId === assignment.id;
      const block = document.createElement("button"); block.type = "button"; block.className = `assignment${isSelectedAssignment ? " selected-for-move" : ""}`; block.draggable = true; block.style.gridRow = row; block.style.gridColumn = `${slots.indexOf(assignment.start) + 2} / span 1`; block.style.setProperty("--nurse", nurse.color); block.style.setProperty("--stack", stackIndex);
      block.innerHTML = `<span>${nurse.initials}</span><strong>${time(assignment.start)}</strong>`; block.title = `${nurse.name} chez ${patient.name} à ${time(assignment.start)} — clic gauche pour sélectionner, glisser pour déplacer, clic droit pour supprimer`;
      block.addEventListener("dragstart", event => {
        event.stopPropagation(); draggedNurse = nurse.id; draggedAssignment = { patientId: patient.id, assignmentId: assignment.id };
        event.dataTransfer.setData("text/plain", nurse.id); event.dataTransfer.effectAllowed = "move"; block.classList.add("moving");
        status.textContent = `Déplacez directement l’intervention de ${nurse.name}.`;
      });
      block.addEventListener("dragend", () => { draggedNurse = null; draggedAssignment = null; block.classList.remove("moving"); document.querySelectorAll(".slot.over").forEach(element => element.classList.remove("over")); });
      block.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        selectedNurse = nurse.id;
        selectedAssignment = { patientId: patient.id, assignmentId: assignment.id, nurseId: nurse.id };
        status.textContent = `${nurse.name} est sélectionnée à ${time(assignment.start)} : touchez une plage verte pour déplacer, ou une case grise pour supprimer.`;
        renderNurses(); renderPlanner();
      });
      block.addEventListener("contextmenu", event => {
        event.preventDefault(); event.stopPropagation();
        patient.assignments = patient.assignments.filter(item => item.id !== assignment.id);
        if (selectedAssignment?.assignmentId === assignment.id) selectedAssignment = null;
        status.textContent = `L’affectation de ${nurse.name} chez ${patient.name} à ${time(assignment.start)} a été supprimée.`;
        render();
      });
      planner.appendChild(block);
    });
  });
}

function beginWindowGesture(patient, band, mode, event) {
  event.preventDefault(); event.stopPropagation();
  windowGestureMoved = false;
  const startX = event.clientX; const originalMin = patient.min; const originalMax = patient.max; const duration = originalMax - originalMin;
  document.body.classList.add("adjusting-window"); band.classList.add("adjusting");
  const onMove = moveEvent => {
    if (Math.abs(moveEvent.clientX - startX) > 3) windowGestureMoved = true;
    const delta = Math.round((moveEvent.clientX - startX) / 58) * STEP;
    if (mode === "start") patient.min = Math.max(START, Math.min(originalMin + delta, originalMax - STEP));
    if (mode === "end") patient.max = Math.min(END, Math.max(originalMax + delta, originalMin + STEP));
    if (mode === "move") { const newMin = Math.max(START, Math.min(originalMin + delta, END - duration)); patient.min = newMin; patient.max = newMin + duration; }
    const startIndex = slots.indexOf(patient.min); const span = (patient.max - patient.min) / STEP;
    band.style.gridColumn = `${startIndex + 2} / span ${span}`;
    band.querySelector(".start-time").textContent = time(patient.min); band.querySelector(".end-time").textContent = time(patient.max);
  };
  const onUp = () => {
    document.removeEventListener("pointermove", onMove); document.body.classList.remove("adjusting-window");
    band.classList.remove("adjusting");
    if (windowGestureMoved) {
      status.textContent = `Plage de ${patient.name} réglée sur ${time(patient.min)}–${time(patient.max)}. Les placements restent libres.`;
      renderPlanner(); savePlanning(false); updateValidationBadge();
    }
    setTimeout(() => { windowGestureMoved = false; }, 0);
  };
  document.addEventListener("pointermove", onMove); document.addEventListener("pointerup", onUp, { once: true });
}

function place(patient, start, nurseId) {
  if (!nurseId) { status.textContent = "Choisissez d’abord une infirmière dans l’équipe."; return; }
  const nurse = nurses.find(item => item.id === nurseId);
  if (draggedAssignment) {
    const sourcePatient = patients.find(item => item.id === draggedAssignment.patientId);
    const moved = sourcePatient?.assignments.find(item => item.id === draggedAssignment.assignmentId);
    if (moved) {
      sourcePatient.assignments = sourcePatient.assignments.filter(item => item.id !== moved.id);
      patient.assignments.push({ ...moved, nurseId, start });
      draggedAssignment = null; selectedAssignment = null;
      status.textContent = `${nurse.name} a été déplacée chez ${patient.name} à ${time(start)}.`;
      render(); return;
    }
  }
  patient.assignments.push({ id: nextAssignmentId++, nurseId, start });
  status.textContent = `${nurse.name} est placée chez ${patient.name} à ${time(start)}.`; render();
}

function updateScore() { score.textContent = `${patients.reduce((total, patient) => total + patient.assignments.length, 0)} placement${patients.reduce((total, patient) => total + patient.assignments.length, 0) > 1 ? "s" : ""}`; }
function planningSignature() { return JSON.stringify({ nurses, patientDirectory, patients }); }
function snapshot(validatedAt = null) { return { format: "la-tournee-v1", day: DAY, savedAt: new Date().toISOString(), validatedAt, nurses, patientDirectory, patients, nextAssignmentId }; }

function savePlanning(showMessage = true) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
    scheduleLinkedWrite();
    if (showMessage) status.textContent = `Planning enregistré dans ce navigateur à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`;
  } catch (error) { status.textContent = "La sauvegarde locale est bloquée par ce navigateur. Utilisez l’export JSON."; }
}

function restorePlanning() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved?.format === "la-tournee-v1" && Array.isArray(saved.patients)) {
      patients = saved.patients.map(patient => ({ ...patient, personId: patient.personId || patient.id.replace(/^visit-/, "") })); nextAssignmentId = Number(saved.nextAssignmentId) || 1;
      patientDirectory = Array.isArray(saved.patientDirectory) ? saved.patientDirectory : patients.filter((patient, index, list) => list.findIndex(item => item.personId === patient.personId) === index).map(patient => ({ id: patient.personId, name: patient.name, firstName: patient.firstName || "", lastName: patient.lastName || patient.name.replace(/^M(me)?\.?\s*/, ""), phone: patient.phone || "" }));
      if (Array.isArray(saved.nurses)) saved.nurses.forEach(savedNurse => {
        const nurse = nurses.find(item => item.id === savedNurse.id);
        if (nurse) Object.assign(nurse, savedNurse); else nurses.push(savedNurse);
      });
      status.textContent = `Dernier planning restauré automatiquement (${new Date(saved.savedAt).toLocaleString("fr-FR")}).`;
    }
    const versions = JSON.parse(localStorage.getItem(VALIDATED_KEY) || "[]");
    const latest = versions.at(-1); validatedSignature = latest?.signature || null;
  } catch (error) { status.textContent = "La sauvegarde précédente n’a pas pu être relue."; }
}

function validatedVersions() {
  try { const value = JSON.parse(localStorage.getItem(VALIDATED_KEY) || "[]"); return Array.isArray(value) ? value : []; }
  catch (error) { return []; }
}

function validateDay() {
  const validatedAt = new Date().toISOString(); const signature = planningSignature();
  const versions = validatedVersions(); versions.push({ ...snapshot(validatedAt), signature, version: versions.length + 1 });
  try {
    localStorage.setItem(VALIDATED_KEY, JSON.stringify(versions)); validatedSignature = signature; savePlanning(false); updateValidationBadge();
    status.textContent = `Journée validée et figée — version ${versions.length}, ${new Date(validatedAt).toLocaleString("fr-FR")}.`;
  } catch (error) { status.textContent = "La validation n’a pas pu être enregistrée. Exportez le planning en JSON."; }
}

function updateValidationBadge() {
  const validated = validatedSignature && validatedSignature === planningSignature();
  validationBadge.className = `validation-badge${validated ? " validated" : ""}`;
  validationBadge.textContent = validated ? "✓ Journée validée" : validatedSignature ? "Modifications non validées" : "Non validé";
}

function exportPlanning() {
  const payload = { current: snapshot(), validatedVersions: validatedVersions() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `la-tournee-${DAY}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000); status.textContent = `Archive la-tournee-${DAY}.json exportée.`;
}

function buildPrintGroup() {
  printGroup.replaceChildren(...nurses.map(nurse => {
    const assignments = assignmentsForNurse(nurse.id);
    const article = document.createElement("article"); article.className = "print-nurse"; article.style.setProperty("--nurse", nurse.color);
    const timeline = slots.map(value => {
      const names = assignments.filter(item => item.start === value).map(item => `<span>${item.patient.replace(/^M(me)?\.?\s*/, "")}</span>`).join("");
      return `<div class="print-time">${value % 60 ? "·30" : time(value)}</div><div class="print-cell">${names}</div>`;
    }).join("");
    const rows = assignments.length ? assignments.map(item => `<tr><td><strong>${time(item.start)}</strong></td><td>${item.patient}</td><td>${item.care}</td></tr>`).join("") : `<tr class="print-empty"><td colspan="3">Aucune intervention placée</td></tr>`;
    article.innerHTML = `<header><div><small>EMPLOI DU TEMPS DE LA JOURNÉE</small><h2>${nurse.name}</h2></div><strong>${assignments.length} intervention${assignments.length > 1 ? "s" : ""}</strong></header><div class="print-timeline">${timeline}</div><table><thead><tr><th>Heure</th><th>Patient</th><th>Intervention</th></tr></thead><tbody>${rows}</tbody></table>`;
    return article;
  }));
}

function printNurseAgenda() {
  buildPrintGroup();
  window.print();
}

function render() { renderNurses(); renderNurseAgenda(); renderPlanner(); updateScore(); savePlanning(false); updateValidationBadge(); }
document.getElementById("saveButton").addEventListener("click", () => savePlanning(true));
document.getElementById("validateButton").addEventListener("click", validateDay);
document.getElementById("exportButton").addEventListener("click", exportPlanning);
document.getElementById("printButton").addEventListener("click", printNurseAgenda);
document.getElementById("openJsonInput").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    const imported = await readPlanningFile(file);
    if (patients.length && !window.confirm("Ouvrir ce fichier remplacera le planning actuellement affiché. Continuer ?")) return;
    linkedFileHandle = null; applyImportedPlanning(imported, file.name);
  } catch (error) { window.alert("Ce fichier ne contient pas un planning La Tournée valide."); }
  finally { event.target.value = ""; }
});
document.getElementById("linkJsonButton").addEventListener("click", async () => {
  if (typeof window.showOpenFilePicker !== "function") { window.alert("Ce navigateur ne permet pas la liaison directe. Utilisez Ouvrir JSON et JSON pour exporter."); return; }
  try {
    const [handle] = await window.showOpenFilePicker({ multiple: false, types: [{ description: "Planning La Tournée", accept: { "application/json": [".json"] } }] });
    const imported = await readPlanningFile(await handle.getFile());
    if (patients.length && !window.confirm("Lier ce fichier remplacera le planning actuellement affiché. Continuer ?")) return;
    linkedFileHandle = handle; applyImportedPlanning(imported, handle.name); await writeLinkedFile();
    status.textContent = `${handle.name} est lié : les prochains enregistrements mettront ce fichier à jour.`;
  } catch (error) { if (error?.name !== "AbortError") window.alert("Impossible de lier ce fichier JSON."); }
});
document.getElementById("addNurseButton").addEventListener("click", () => {
  const colors = ["#3f806d", "#d47f61", "#517f9a", "#8e6b9e", "#c1903e"];
  openProfile("nurse", { id: `nurse-${Date.now()}`, name: "", firstName: "", lastName: "", proNumber: "", phone: "", initials: "NI", color: colors[nurses.length % colors.length], icon: "✚" }, true);
});
document.getElementById("addPatientButton").addEventListener("click", () => {
  openProfile("patient-directory", { id: `patient-${Date.now()}`, name: "", firstName: "", lastName: "", phone: "" }, true);
});
document.getElementById("schedulePatientButton").addEventListener("click", () => {
  const orderedDirectory = [...patientDirectory].sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
  schedulePatientSelect.replaceChildren(...orderedDirectory.map(patient => { const option = document.createElement("option"); option.value = patient.id; option.textContent = patient.name; return option; }));
  if (!patientDirectory.length) { status.textContent = "Créez d’abord un patient dans la liste permanente."; return; }
  fillTimeSelect(scheduleMin, slots.slice(0, -1), START);
  fillTimeSelect(scheduleMax, slots.slice(1), START + 2 * 60);
  schedulePatientDialog.showModal();
});
document.getElementById("schedulePatientCancel").addEventListener("click", () => schedulePatientDialog.close());
document.getElementById("schedulePatientForm").addEventListener("submit", event => {
  event.preventDefault();
  const person = patientDirectory.find(patient => patient.id === schedulePatientSelect.value);
  if (!person) return;
  const min = Number(scheduleMin.value); const max = Number(scheduleMax.value);
  if (max <= min) { status.textContent = "L’heure de fin doit être postérieure à l’heure de début."; return; }
  patients.push({ ...person, id: `visit-${Date.now()}`, personId: person.id, care: scheduleCare.value, min, max, assignments: [] });
  schedulePatientDialog.close();
  status.textContent = `${person.name} a été ajouté au planning pour ${scheduleCare.value}, de ${time(min)} à ${time(max)}.`;
  render();
});
document.getElementById("profileCancel").addEventListener("click", () => profileDialog.close());
profileForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!profileTarget) return;
  const { type, item, isNew } = profileTarget;
  item.lastName = profileLastName.value.trim(); item.firstName = profileFirstName.value.trim(); item.phone = profilePhone.value.trim();
  item.name = [item.firstName, item.lastName].filter(Boolean).join(" ") || item.name;
  if (type === "nurse") {
    item.proNumber = profileProNumber.value.trim();
    item.initials = `${item.firstName.charAt(0)}${item.lastName.charAt(0)}`.toUpperCase() || item.initials;
  } else if (type === "patient") item.care = profileCare.value;
  if (isNew) {
    if (type === "nurse") nurses.push(item);
    else if (type === "patient-directory") patientDirectory.push(item);
    else patients.push(item);
  } else if (type === "patient") {
    const person = patientDirectory.find(patient => patient.id === item.personId);
    if (person) Object.assign(person, { name: item.name, firstName: item.firstName, lastName: item.lastName, phone: item.phone });
    patients.filter(patient => patient.personId === item.personId).forEach(patient => Object.assign(patient, { name: item.name, firstName: item.firstName, lastName: item.lastName, phone: item.phone }));
  }
  profileDialog.close(); profileTarget = null;
  status.textContent = isNew ? (type === "patient-directory" ? `${item.name} a été ajouté à la liste permanente des patients.` : `${item.name} a été ajouté${type === "nurse" ? "e" : ""} au planning.`) : `${type === "nurse" ? "Fiche infirmière" : "Fiche patient et intervention"} enregistrée.`;
  render();
});
document.getElementById("resetButton").addEventListener("click", () => { patients = createPatients(); selectedNurse = null; selectedAssignment = null; draggedNurse = null; draggedAssignment = null; agendaNurse = null; nextAssignmentId = 1; status.textContent = "Démo réinitialisée. Choisissez une infirmière pour commencer."; render(); });
restorePlanning(); render();
