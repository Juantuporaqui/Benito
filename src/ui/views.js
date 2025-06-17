// src/ui/views.js

import { initFirebase, db, auth } from '../firebase.js';
import { signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { collection, doc, addDoc, setDoc, getDoc, getDocs, query, where, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { formatDate, formatDateTime, showSpinner, showStatus, removeDynamicItem } from '../utils.js';
import * as lists from './dynamicLists.js';
import { fetchDataForSelect, saveData, loadData, getNextCode, loadSubCollection, addRelatedItem, completePendingTask, fetchGlobalPendingTasks } from '../services/firestoreService.js';
import { appId, userId } from '../state.js';
import { groups } from '../groups.js';

// --- UI ELEMENTS ---
const mainContent = () => document.getElementById('main-content');
const headerTitle = () => document.getElementById('header-title');
const backButton = () => document.getElementById('back-button');

let currentView = 'menu';
let currentGroup = null;
let currentDocId = null;

window.removeDynamicItem = removeDynamicItem;

// --- VIEW FUNCTIONS ---

export function renderMenu() {
  currentView = 'menu';
  headerTitle().textContent = 'UCRIF · Menú Principal de Novedades';
  backButton().classList.add('hidden');

  let html = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 p-4">`;
  for (const key in groups) {
    const g = groups[key];
    html += `
      <button data-group="${key}" class="group-btn ...">
        <span class="text-5xl mb-3">${g.icon}</span>
        <span class="font-bold text-lg">${g.name}</span>
        <span class="text-sm text-slate-500">${g.description}</span>
      </button>
    `;
  }
  html += `</div>
    <div class="text-center text-slate-500 mt-8 text-sm">
      ID de Usuario: <span id="userIdDisplay">${userId||'...'}</span>
    </div>`;

  mainContent().innerHTML = html;
  document.querySelectorAll('.group-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>navigateTo(btn.dataset.group));
  });
}

export function navigateTo(groupKey) {
  currentGroup = groupKey;
  headerTitle().textContent = `UCRIF · ${groups[groupKey].name}`;
  backButton().classList.remove('hidden');
  currentDocId = null;

  if (groupKey==='estadistica') renderStatistics();
  else if (['grupo2','grupo3'].includes(groupKey)) renderGroup2and3Form(groupKey);
  else renderSpecificGroupForm(groupKey);
}

export async function renderSpecificGroupForm(groupKey) {
  currentView = 'specific';
  const g = groups[groupKey];
  const coll = g.collection;

  const baseFields = `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
      <div>
        <label for="fecha">Fecha</label>
        <input type="date" id="fecha" class="w-full rounded border px-2 py-1">
      </div>
      <div>
        <label for="anio">Año</label>
        <input type="text" id="anio" class="w-full rounded border px-2 py-1">
      </div>
    </div>
    <div class="mb-4">
      <label for="descripcionBreve">Descripción Breve</label>
      <textarea id="descripcionBreve" class="w-full rounded border px-2 py-1" rows="2"></textarea>
    </div>`;

  let formFieldsHtml = '';
  let dynamicAdders = '';
  let dataMapping = {};

  switch (groupKey) {
    case 'puerto':
      formFieldsHtml = `
        ${baseFields}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label for="carnet">Carnet (6 dígitos)</label>
            <input type="text" id="carnet" maxlength="6" pattern="\\d{6}" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="funcionario">Funcionario</label>
            <input type="text" id="funcionario" class="w-full rounded border px-2 py-1">
          </div>
        </div>
        <div class="mb-4">
          <label for="tipoControl">Tipo de control</label>
          <select id="tipoControl" class="w-full rounded border px-2 py-1">
            <option value="">--Seleccione--</option>
            <option>Control embarque</option>
            <option>Control desembarque</option>
            <option>Inspección buque</option>
            <option>Crucero</option>
            <option>Ferri entrada/salida</option>
            <option>Puerto deportivo</option>
            <option>Otras actuaciones</option>
          </select>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label for="marinosArgos">Marinos chequeados en Argos</label>
            <input type="number" id="marinosArgos" min="0" value="0" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="controlPasaportesMarinos">Control pasaportes marinos</label>
            <input type="number" id="controlPasaportesMarinos" min="0" value="0" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="cruceros">Cruceros</label>
            <input type="number" id="cruceros" min="0" value="0" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="cruceristas">Cruceristas</label>
            <input type="number" id="cruceristas" min="0" value="0" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="visadosValencia">Visados Valencia</label>
            <input type="number" id="visadosValencia" min="0" value="0" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="visadosCG">Visados CG</label>
            <input type="number" id="visadosCG" min="0" value="0" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="culminadosEISICS">Culminados EISICS</label>
            <input type="number" id="culminadosEISICS" min="0" value="0" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="ferriEntradas">Ferry entradas</label>
            <input type="number" id="ferriEntradas" min="0" value="0" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="ferriSalidas">Ferry salidas</label>
            <input type="number" id="ferriSalidas" min="0" value="0" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="ferriPasajeros">Ferry pasajeros</label>
            <input type="number" id="ferriPasajeros" min="0" value="0" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="ferriVehiculos">Ferry vehículos</label>
            <input type="number" id="ferriVehiculos" min="0" value="0" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="entradasExcepcionales">Entradas excepcionales</label>
            <input type="number" id="entradasExcepcionales" min="0" value="0" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="puertoDeportivo">Puerto deportivo</label>
            <input type="number" id="puertoDeportivo" min="0" value="0" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="denegaciones">Denegaciones</label>
            <input type="number" id="denegaciones" min="0" value="0" class="w-full rounded border px-2 py-1">
          </div>
        </div>
        <div class="mb-4">
          <label for="observacionesPuerto">Observaciones</label>
          <textarea id="observacionesPuerto" class="w-full rounded border px-2 py-1" rows="2"></textarea>
        </div>
        <div class="mb-4">
          <label for="archivo">Documentos/Imágenes</label>
          <input type="file" id="archivo" multiple class="w-full">
        </div>
        <div class="mb-4 border-t pt-4">
          <label for="pendiente"><b>¿Queda alguna tarea pendiente?</b></label>
          <select id="pendiente" class="w-full rounded border px-2 py-1">
            <option value="">No</option>
            <option value="Sí">Sí</option>
          </select>
          <div id="pendienteDetalles" class="mt-4 hidden">
            <label for="pendienteDescripcion">Descripción de la tarea pendiente</label>
            <input type="text" id="pendienteDescripcion" class="w-full rounded border px-2 py-1">
            <label for="pendienteFecha" class="mt-2">Fecha límite (alerta)</label>
            <input type="date" id="pendienteFecha" class="w-full rounded border px-2 py-1">
          </div>
        </div>`;
      dataMapping = {
        fecha: 'fecha',
        anio: 'anio',
        descripcionBreve: 'descripcionBreve',
        carnet: 'carnet',
        funcionario: 'funcionario',
        tipoControl: 'tipoControl',
        marinosArgos: 'marinosArgos',
        controlPasaportesMarinos: 'controlPasaportesMarinos',
        cruceros: 'cruceros',
        cruceristas: 'cruceristas',
        visadosValencia: 'visadosValencia',
        visadosCG: 'visadosCG',
        culminadosEISICS: 'culminadosEISICS',
        ferriEntradas: 'ferriEntradas',
        ferriSalidas: 'ferriSalidas',
        ferriPasajeros: 'ferriPasajeros',
        ferriVehiculos: 'ferriVehiculos',
        entradasExcepcionales: 'entradasExcepcionales',
        puertoDeportivo: 'puertoDeportivo',
        denegaciones: 'denegaciones',
        observaciones: 'observacionesPuerto',
        pendiente: 'pendiente',
        pendienteDescripcion: 'pendienteDescripcion',
        pendienteFecha: 'pendienteFecha'
      };
      break;

    case 'cecorex':
      formFieldsHtml = `
        ${baseFields}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label for="turno">Turno</label>
            <select id="turno" class="w-full rounded border px-2 py-1">
              <option value="">--Seleccione--</option>
              <option>Mañana</option>
              <option>Tarde</option>
              <option>Noche</option>
              <option>Día completo</option>
            </select>
          </div>
          <div>
            <label for="carnet">Carnet (6 dígitos)</label>
            <input type="text" id="carnet" maxlength="6" pattern="\\d{6}" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="funcionario">Funcionario</label>
            <input type="text" id="funcionario" class="w-full rounded border px-2 py-1">
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label for="incoacciones">Incoacciones</label>
            <input type="number" id="incoacciones" min="0" value="0" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="consultasTelefonicas">Consultas telefónicas</label>
            <input type="number" id="consultasTelefonicas" min="0" value="0" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="consultasEquipo">Consultas equipo</label>
            <input type="number" id="consultasEquipo" min="0" value="0" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="diligenciasInforme">Diligencias informe</label>
            <input type="number" id="diligenciasInforme" min="0" value="0" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="ciesConcedidos">CIEs concedidos (por nacionalidad)</label>
            <input type="text" id="ciesConcedidos" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="ciesDenegados">CIEs denegados (por nacionalidad)</label>
            <input type="text" id="ciesDenegados" class="w-full rounded border px-2 py-1">
          </div>
          <div>
            <label for="menas">MENAs</label>
            <input type="number" id="menas" min="0" value="0" class="w-full rounded border px-2 py-1">
          </div>
        </div>
        <div class="mb-4">
          <label for="observacionesCecorex">Observaciones / Incidencias</label>
          <textarea id="observacionesCecorex" class="w-full rounded border px-2 py-1" rows="2"></textarea>
        </div>
        <div class="mb-4">
          <label for="archivoCecorex">Documentos/Imágenes</label>
          <input type="file" id="archivoCecorex" multiple class="w-full">
        </div>
        <div class="mb-4 border-t pt-4">
          <label for="pendiente"><b>¿Queda alguna tarea pendiente?</b></label>
          <select id="pendiente" class="w-full rounded border px-2 py-1">
            <option value="">No</option>
            <option value="Sí">Sí</option>
          </select>
          <div id="pendienteDetalles" class="mt-4 hidden">
            <label for="pendienteDescripcion">Descripción de la tarea pendiente</label>
            <input type="text" id="pendienteDescripcion" maxlength="140" class="w-full rounded border px-2 py-1">
            <label for="pendienteFecha" class="mt-2">Fecha límite (alerta)</label>
            <input type="date" id="pendienteFecha" class="w-full rounded border px-2 py-1">
          </div>
        </div>`;
      dataMapping = {
        fecha: 'fecha',
        anio: 'anio',
        descripcionBreve: 'descripcionBreve',
        turno: 'turno',
        carnet: 'carnet',
        funcionario: 'funcionario',
        incoacciones: 'incoacciones',
        consultasTelefonicas: 'consultasTelefonicas',
        consultasEquipo: 'consultasEquipo',
        diligenciasInforme: 'diligenciasInforme',
        ciesConcedidos: 'ciesConcedidos',
        ciesDenegados: 'ciesDenegados',
        menas: 'menas',
        observaciones: 'observacionesCecorex',
        pendiente: 'pendiente',
        pendienteDescripcion: 'pendienteDescripcion',
        pendienteFecha: 'pendienteFecha'
      };
      break;

    default:
      formFieldsHtml = `${baseFields}<p class="text-gray-500">Formulario pendiente para este grupo.</p>`;
  }

  let searchSection = `
    <div class="bg-white p-4 rounded shadow border-blue-300 border">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div class="md:col-span-2">
          <label>Buscar registro existente</label>
          <select id="docList" class="w-full rounded border px-2 py-1"></select>
        </div>
        <button id="loadDocBtn" class="bg-blue-600 text-white px-4 py-2 rounded">Cargar</button>
        <button id="newDocBtn" class="bg-gray-600 text-white px-4 py-2 rounded">Nuevo</button>
      </div>
    </div>`;

  if (groupKey === 'puerto' || groupKey === 'cecorex') {
    searchSection = `
      <div class="bg-white p-4 rounded shadow border-blue-300 border">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div class="md:col-span-2">
            <label>Fecha (grabar / buscar)</label>
            <input type="date" id="searchDate" class="w-full rounded border px-2 py-1">
          </div>
          <button id="loadDateBtn" class="bg-blue-600 text-white px-4 py-2 rounded">Buscar</button>
          <button id="newDocBtn" class="bg-gray-600 text-white px-4 py-2 rounded">Nuevo</button>
        </div>
      </div>`;
  }

  const html = `
    <div class="max-w-4xl mx-auto p-4 space-y-6">
      <h2 class="text-2xl font-bold text-center">${g.name} · ${g.description}</h2>
      ${searchSection}
      <div class="bg-white p-4 rounded shadow border-blue-300 border space-y-4">
        <div id="status-message" class="font-semibold"></div>
        ${formFieldsHtml}
        <div class="text-right">
          <button id="saveDocBtn" class="bg-green-600 text-white px-6 py-2 rounded">Guardar Registro</button>
        </div>
      </div>
      ${dynamicAdders}
    </div>`;

  mainContent().innerHTML = html;

  const newBtn = document.getElementById('newDocBtn');
  if (newBtn) newBtn.addEventListener('click', () => resetSpecificForm(coll));

  if (groupKey === 'puerto' || groupKey === 'cecorex') {
    const loadDateBtn = document.getElementById('loadDateBtn');
    if (loadDateBtn) loadDateBtn.addEventListener('click', () => {
      const dt = document.getElementById('searchDate').value;
      loadSpecificDocByDate(coll, dataMapping, dt);
    });
  } else {
    const loadDocBtn = document.getElementById('loadDocBtn');
    if (loadDocBtn) loadDocBtn.addEventListener('click', () => loadSpecificDoc(coll, dataMapping));
  }

  const saveBtn = document.getElementById('saveDocBtn');
  if (saveBtn) saveBtn.addEventListener('click', () => saveSpecificDoc(coll, dataMapping));


  await resetSpecificForm(coll);
}

export async function renderGroup2and3Form(groupKey) {
  currentView='operation';
  const g = groups[groupKey];
  const coll = g.collection;

  // Build operation form HTML from main.js
  // ...

  // Setup listeners:
  document.getElementById('newOpBtn').addEventListener('click', ()=> resetGroup2and3Form());
  document.getElementById('loadOpBtn').addEventListener('click', ()=> loadOperation(coll));
  document.getElementById('saveOpBtn').addEventListener('click', ()=> saveOperation(coll));
  document.getElementById('addChronBtn').addEventListener('click', ()=> {/*...*/});
  document.getElementById('addPendBtn').addEventListener('click', ()=>{/*...*/});
  document.getElementById('generateReportBtn').addEventListener('click', ()=>{/*...*/});

  await resetGroup2and3Form();
}

export function renderCollapsibleSection(id,title,content){
  return `
    <details id="details-${id}" class="...">
      <summary class="...">${title}<svg>...</svg></summary>
      <div class="p-4">${content}</div>
    </details>
  `;
}

export async function renderStatistics() {
  currentView='statistics';
  const today=new Date();
  const weekAgo=new Date(); weekAgo.setDate(today.getDate()-7);

  const html = `...statistics HTML...`;
  mainContent().innerHTML=html;

  document.getElementById('statsBtn').addEventListener('click',generateStats);
  document.getElementById('addTaskBtn').addEventListener('click',addGeneralPendingTask);

  await fetchGlobalPendingTasksAndRender();
}

// --- INIT + Auth ---

function setupAuthAndRender() {
  initFirebase();
  onAuthStateChanged(auth, async user=>{
    if (user) renderMenu();
    else await signInAnonymously(auth).then(()=>renderMenu());
  });
  backButton().addEventListener('click',renderMenu);
}

export function initViews(){
  document.addEventListener('DOMContentLoaded', setupAuthAndRender);
}

// Initialize
initViews();
