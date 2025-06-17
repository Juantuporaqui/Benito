import { initFirebase, db, auth } from './firebase.js';
import { signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, doc, addDoc, setDoc, getDoc, getDocs, query, where, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatDate, formatDateTime, showSpinner, showStatus, removeDynamicItem } from './utils.js';
import { groups } from './groups.js';
// Import dynamic list helpers so that global add*/get* functions are registered
import {
  addInternoNacionalidad,
  getInternosNacionalidad,
  addIngreso,
  getIngresos,
  addSalida,
  getSalidas,
  addColaboracionG4,
  getColaboracionesG4,
  addDetenidoG4,
  getDetenidosG4,
} from './ui/dynamicLists.js';


// --- Firebase Configuration ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
let userId = null; // Se asigna tras la autenticación

// --- App State ---
let currentView = 'menu';
let currentGroup = null;    // 'grupo1', 'grupo2', etc.
let currentDocId = null;    // ID del documento cargado/creado

// --- UI Elements helpers ---
const mainContent  = () => document.getElementById('main-content');
const headerTitle  = () => document.getElementById('header-title');
const backButton   = () => document.getElementById('back-button');

// --- Definición de grupos y colecciones asociadas (importados de groups.js) ---


// Hacemos accesible desde HTML:
window.removeDynamicItem = removeDynamicItem;

// =======================
// == FUNCIONES GENÉRICAS Firestore ==
// =======================

/**
 * Guarda o actualiza un documento en Firestore.
 */
const saveData = async (collectionName, data, docId = null) => {
    if (!userId) {
        showStatus('Error: Usuario no autenticado. Recarga o revisa Firebase.', true);
        throw new Error("User not authenticated.");
    }
    try {
        const userCol = collection(db, `artifacts/${appId}/${collectionName}`);
        if (docId) {
            await setDoc(doc(userCol, docId), { ...data, updatedAt: serverTimestamp() }, { merge: true });
            return docId;
        } else {
            const ref = await addDoc(userCol, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            return ref.id;
        }
    } catch (e) {
        console.error(`Error al guardar en ${collectionName}:`, e);
        showStatus(`Error al guardar: ${e.message}`, true);
        throw e;
    }
};

/**
 * Carga un documento de Firestore.
 */
const loadData = async (collectionName, docId) => {
    if (!userId) {
        showStatus('Error: Usuario no autenticado. Recarga o revisa Firebase.', true);
        throw new Error("User not authenticated.");
    }
    try {
        const ref = doc(db, `artifacts/${appId}/${collectionName}`, docId);
        const snap = await getDoc(ref);
        return snap.exists() ? snap.data() : null;
    } catch (e) {
        console.error(`Error al cargar desde ${collectionName}:`, e);
        showStatus(`Error al cargar: ${e.message}`, true);
        throw e;
    }
};

/**
 * Rellena un <select> con documentos de una colección.
 */
const fetchDataForSelect = async (collectionName, selectId, displayField1, displayField2 = null, groupFilter = null) => {
    if (!userId) return;
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Seleccionar --</option>';
    showSpinner(true);
    try {
        let q = collection(db, `artifacts/${appId}/${collectionName}`);
        if (groupFilter) {
            q = query(q, where("grupo", "==", groups[groupFilter].name));
        }
        const snaps = await getDocs(q);
        const docs = snaps.docs.map(d=>({ id: d.id, ...d.data() }));
        docs.sort((a,b)=>{
            const da = a.createdAt instanceof Timestamp ? a.createdAt.toDate() : new Date(a.createdAt);
            const db_ = b.createdAt instanceof Timestamp ? b.createdAt.toDate() : new Date(b.createdAt);
            return db_ - da;
        });
        docs.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.id;
            let txt = d[displayField1] || '';
            if (displayField2 && d[displayField2]) txt += ` (${d[displayField2]})`;
            opt.textContent = txt;
            sel.appendChild(opt);
        });
    } catch(e) {
        console.error(e);
    } finally {
        showSpinner(false);
    }
};

/**
 * Calcula el próximo código secuencial para una colección determinada.
 */
const getNextCode = async (collectionName, groupName, year) => {
    if (!userId) return 1;
    const q = query(
        collection(db, `artifacts/${appId}/${collectionName}`),
        where("grupo", "==", groupName),
        where("anio", "==", year)
    );
    const snaps = await getDocs(q);
    const codes = [];
    snaps.forEach(d=>{
        if (d.data().codigo) codes.push(Number(d.data().codigo));
    });
    codes.sort((a,b)=>b-a);
    return codes.length ? codes[0]+1 : 1;
};

// =======================
// == HELPERS DE LISTAS DINÁMICAS ==
// =======================

/**
 * Añade un ítem dinámico genérico.
 */
const addDynamicItem = (container, fields, data = {}) => {
    const div = document.createElement('div');
    div.className = 'dynamic-list-item';
    let inner = '';
    fields.forEach(f => {
        const val  = data[f.valueField] ?? '';
        const disp = f.type === 'date' ? formatDate(val) : val;
        let inputEl;
        if (f.type === 'textarea') {
            inputEl = `<textarea rows="${f.rows||2}" class="${f.idPrefix}-item">${disp}</textarea>`;
        } else if (f.type === 'select') {
            inputEl = `<select class="${f.idPrefix}-item">` +
                      f.options.map(o=>`<option value="${o}"${disp===o?' selected':''}>${o}</option>`).join('') +
                      `</select>`;
        } else {
            inputEl = `<input type="${f.type||'text'}" class="${f.idPrefix}-item" value="${disp}">`;
        }
        inner += `<div><label>${f.label}:</label>${inputEl}</div>`;
    });
    div.innerHTML = inner + `<button onclick="removeDynamicItem(this)">Eliminar</button>`;
    container.appendChild(div);
};

/**
 * Recoge datos de ítems dinámicos.
 */
const getDynamicItems = (container, fields) => {
    const items = [];
    container.querySelectorAll('.dynamic-list-item').forEach(div=>{
        const obj = {};
        let filled = false;
        fields.forEach(f => {
            const el = div.querySelector(`.${f.idPrefix}-item`);
            if (el) {
                obj[f.valueField] = el.value.trim();
                if (obj[f.valueField]) filled = true;
            }
        });
        if (filled) items.push(obj);
    });
    return items;
};

// --- Helpers específicos para Grupo 2/3 ---
const addDiligenciaPreviasJuzgados = (data = {}) => {
    const c = document.getElementById('diligenciasPreviasJuzgadosContainer');
    if (!c) return;
    addDynamicItem(c, [
        { idPrefix: 'dpjFecha',    label: 'Fecha', type: 'date', valueField: 'fecha' },
        { idPrefix: 'dpjJuzgado',  label: 'Juzgado',         valueField: 'juzgado' }
    ], data);
};
window.addDiligenciaPreviasJuzgados = addDiligenciaPreviasJuzgados;

const getDiligenciasPreviasJuzgados = () => {
    const c = document.getElementById('diligenciasPreviasJuzgadosContainer');
    if (!c) return [];
    return getDynamicItems(c, [
        { idPrefix: 'dpjFecha',   valueField: 'fecha' },
        { idPrefix: 'dpjJuzgado', valueField: 'juzgado' }
    ]);
};
window.getDiligenciasPreviasJuzgados = getDiligenciasPreviasJuzgados;

const addHistoricoInhibicion = (data = {}) => {
    const c = document.getElementById('historicoInhibicionesContainer');
    if (!c) return;
    addDynamicItem(c, [
        { idPrefix: 'inhibJuzgado', label: 'Juzgado Inhibido', valueField: 'juzgado' },
        { idPrefix: 'inhibFecha',   label: 'Fecha Inhibición', type: 'date', valueField: 'fecha' }
    ], data);
};
window.addHistoricoInhibicion = addHistoricoInhibicion;

const getHistoricoInhibiciones = () => {
    const c = document.getElementById('historicoInhibicionesContainer');
    if (!c) return [];
    return getDynamicItems(c, [
        { idPrefix: 'inhibJuzgado', valueField: 'juzgado' },
        { idPrefix: 'inhibFecha',   valueField: 'fecha' }
    ]);
};
window.getHistoricoInhibiciones = getHistoricoInhibiciones;

const addHistoricoGeneralJuzgados = (data = {}) => {
    const c = document.getElementById('historicoGeneralJuzgadosContainer');
    if (!c) return;
    addDynamicItem(c, [
        { idPrefix: 'hgJFecha', label: 'Fecha Evento', type: 'date', valueField: 'fecha' },
        { idPrefix: 'hgJJuzgado', label: 'Juzgado Relacionado', valueField: 'juzgado' },
        { idPrefix: 'hgJEvento',  label: 'Descripción del Evento', colSpan: 2, valueField: 'evento' }
    ], data);
};
window.addHistoricoGeneralJuzgados = addHistoricoGeneralJuzgados;

const getHistoricoGeneralJuzgados = () => {
    const c = document.getElementById('historicoGeneralJuzgadosContainer');
    if (!c) return [];
    return getDynamicItems(c, [
        { idPrefix: 'hgJFecha',    valueField: 'fecha' },
        { idPrefix: 'hgJJuzgado', valueField: 'juzgado' },
        { idPrefix: 'hgJEvento',  valueField: 'evento' }
    ]);
};
window.getHistoricoGeneralJuzgados = getHistoricoGeneralJuzgados;

const addIntervencionTelefonica = (data = {}) => {
    const c = document.getElementById('intervencionesTelefonicasContainer');
    if (!c) return;
    addDynamicItem(c, [
        { idPrefix: 'itDesc', label: 'Descripción', colSpan: 2, valueField: 'descripcion' }
    ], data);
};
window.addIntervencionTelefonica = addIntervencionTelefonica;

const getIntervencionesTelefonicas = () => {
    const c = document.getElementById('intervencionesTelefonicasContainer');
    if (!c) return [];
    return getDynamicItems(c, [
        { idPrefix: 'itDesc', valueField: 'descripcion' }
    ]);
};
window.getIntervencionesTelefonicas = getIntervencionesTelefonicas;

const addEntradaYRegistro = (data = {}) => {
    const c = document.getElementById('entradasYRegistrosContainer');
    if (!c) return;
    addDynamicItem(c, [
        { idPrefix: 'eyrDesc', label: 'Descripción', colSpan: 2, valueField: 'descripcion' }
    ], data);
};
window.addEntradaYRegistro = addEntradaYRegistro;

const getEntradasYRegistros = () => {
    const c = document.getElementById('entradasYRegistrosContainer');
    if (!c) return [];
    return getDynamicItems(c, [
        { idPrefix: 'eyrDesc', valueField: 'descripcion' }
    ]);
};
window.getEntradasYRegistros = getEntradasYRegistros;

const addSolicitudJudicial = (data = {}) => {
    const c = document.getElementById('solicitudesJudicialesContainer');
    if (!c) return;
    addDynamicItem(c, [
        { idPrefix: 'sjTipo', label: 'Tipo', valueField: 'tipo' },
        { idPrefix: 'sjDesc', label: 'Descripción', colSpan: 2, valueField: 'descripcion' }
    ], data);
};
window.addSolicitudJudicial = addSolicitudJudicial;

const getSolicitudesJudiciales = () => {
    const c = document.getElementById('solicitudesJudicialesContainer');
    if (!c) return [];
    return getDynamicItems(c, [
        { idPrefix: 'sjTipo', valueField: 'tipo' },
        { idPrefix: 'sjDesc', valueField: 'descripcion' }
    ]);
};
window.getSolicitudesJudiciales = getSolicitudesJudiciales;

const addColaboracion = (data = {}) => {
    const c = document.getElementById('colaboracionesContainer');
    if (!c) return;
    addDynamicItem(c, [
        { idPrefix: 'colaboracionFecha', label: 'Fecha', type: 'date', valueField: 'fecha' },
        { idPrefix: 'colaboracionGrupoInstitucion', label: 'Grupo/Institución', valueField: 'grupoInstitucion' },
        { idPrefix: 'colaboracionTipo', label: 'Tipo de Colaboración', valueField: 'tipoColaboracion' }
    ], data);
};
window.addColaboracion = addColaboracion;

const getColaboraciones = () => {
    const c = document.getElementById('colaboracionesContainer');
    if (!c) return [];
    return getDynamicItems(c, [
        { idPrefix: 'colaboracionFecha', valueField: 'fecha' },
        { idPrefix: 'colaboracionGrupoInstitucion', valueField: 'grupoInstitucion' },
        { idPrefix: 'colaboracionTipo', valueField: 'tipoColaboracion' }
    ]);
};
window.getColaboraciones = getColaboraciones;

const addDetenido = (data = {}) => {
    const c = document.getElementById('detenidosContainer');
    if (!c) return;
    addDynamicItem(c, [
        { idPrefix: 'detFiliacion', label: 'Filiación Delito', valueField: 'filiacionDelito' },
        { idPrefix: 'detNac',       label: 'Nacionalidad',    valueField: 'nacionalidad' },
        { idPrefix: 'detFecha',     label: 'Fecha Detención', type: 'date', valueField: 'fechaDetencion' },
        { idPrefix: 'detOrdinal',   label: 'Ordinal',         valueField: 'ordinal' }
    ], data);
};
window.addDetenido = addDetenido;

const getDetenidos = () => {
    const c = document.getElementById('detenidosContainer');
    if (!c) return [];
    return getDynamicItems(c, [
        { idPrefix: 'detFiliacion', valueField: 'filiacionDelito' },
        { idPrefix: 'detNac',       valueField: 'nacionalidad' },
        { idPrefix: 'detFecha',     valueField: 'fechaDetencion' },
        { idPrefix: 'detOrdinal',   valueField: 'ordinal' }
    ]);
};
window.getDetenidos = getDetenidos;

const addDetenidoPrevisto = (data = {}) => {
    const c = document.getElementById('detenidosPrevistosContainer');
    if (!c) return;
    addDynamicItem(c, [
        { idPrefix: 'detPrevFiliacion', label: 'Filiación Delito', valueField: 'filiacionDelito' },
        { idPrefix: 'detPrevNac',       label: 'Nacionalidad',    valueField: 'nacionalidad' },
        { idPrefix: 'detPrevFecha',     label: 'Fecha Prevista',  type: 'date', valueField: 'fechaDetencion' },
        { idPrefix: 'detPrevOrdinal',   label: 'Ordinal',         valueField: 'ordinal' }
    ], data);
};
window.addDetenidoPrevisto = addDetenidoPrevisto;

const getDetenidosPrevistos = () => {
    const c = document.getElementById('detenidosPrevistosContainer');
    if (!c) return [];
    return getDynamicItems(c, [
        { idPrefix: 'detPrevFiliacion', valueField: 'filiacionDelito' },
        { idPrefix: 'detPrevNac',       valueField: 'nacionalidad' },
        { idPrefix: 'detPrevFecha',     valueField: 'fechaDetencion' },
        { idPrefix: 'detPrevOrdinal',   valueField: 'ordinal' }
    ]);
};
window.getDetenidosPrevistos = getDetenidosPrevistos;

const addOtraPersona = (data = {}) => {
    const c = document.getElementById('otrasPersonasContainer');
    if (!c) return;
    addDynamicItem(c, [
        { idPrefix: 'otraFiliacion', label: 'Filiación',         valueField: 'filiacion' },
        { idPrefix: 'otraTipo',      label: 'Tipo de Vinculación', valueField: 'tipoVinculacion' },
        { idPrefix: 'otraNac',       label: 'Nacionalidad',      valueField: 'nacionalidad' },
        { idPrefix: 'otraTelefono',  label: 'Teléfono',          valueField: 'telefono' }
    ], data);
};
window.addOtraPersona = addOtraPersona;

const getOtrasPersonas = () => {
    const c = document.getElementById('otrasPersonasContainer');
    if (!c) return [];
    return getDynamicItems(c, [
        { idPrefix: 'otraFiliacion', valueField: 'filiacion' },
        { idPrefix: 'otraTipo',      valueField: 'tipoVinculacion' },
        { idPrefix: 'otraNac',       valueField: 'nacionalidad' },
        { idPrefix: 'otraTelefono',  valueField: 'telefono' }
    ]);
};
window.getOtrasPersonas = getOtrasPersonas;

// --- funciones básicas de listas para grupos simples ---
const addBasicListItem = (listId, desc, fecha) => {
    const list = document.getElementById(listId);
    if (!list || !desc) return;
    const li = document.createElement('li');
    li.dataset.descripcion = desc;
    li.dataset.fecha = fecha || '';
    li.className = 'flex justify-between items-center';
    li.innerHTML = `
        <span>${desc}${fecha ? ` (Vence: ${fecha})` : ''}</span>
        <button type="button" class="ml-2 text-xs text-red-500 remove-basic-item">Eliminar</button>`;
    li.querySelector('.remove-basic-item').addEventListener('click', () => li.remove());
    list.appendChild(li);
};
const getBasicListItems = (listId) => {
    const list = document.getElementById(listId);
    if (!list) return [];
    return Array.from(list.children).map(li => ({
        descripcion: li.dataset.descripcion || '',
        fechaLimite: li.dataset.fecha || ''
    }));
};

// --- grupos simples: personas implicadas, pendientes, etc. ---
const addPersonaImplicada = (data={})=>{
    const c=document.getElementById('personasImplicadasContainer');
    if(!c)return;
    addDynamicItem(c,[
        {idPrefix:'impNombre',label:'Nombre',valueField:'nombre'},
        {idPrefix:'impNac',label:'Nacionalidad',valueField:'nacionalidad'},
        {idPrefix:'impFechaExp',label:'Fecha Expulsión',type:'date',valueField:'fechaExpulsion'}
    ],data);
};
window.addPersonaImplicada=addPersonaImplicada;
const getPersonasImplicadas=()=>{
    const c=document.getElementById('personasImplicadasContainer');
    if(!c)return[];
    return getDynamicItems(c,[
        {idPrefix:'impNombre',valueField:'nombre'},
        {idPrefix:'impNac',valueField:'nacionalidad'},
        {idPrefix:'impFechaExp',valueField:'fechaExpulsion'}
    ]);
};
window.getPersonasImplicadas=getPersonasImplicadas;

const addGrupoPendiente = (data={})=>{
    const descInput = document.getElementById('gpPendDesc');
    const dateInput = document.getElementById('gpPendDate');
    const desc = data.descripcion || (descInput?descInput.value.trim():'');
    const fecha= data.fechaLimite?formatDate(data.fechaLimite):(dateInput?dateInput.value:'');
    addBasicListItem('grupoPendientesList',desc,fecha);
    if(!data.descripcion && descInput) descInput.value='';
    if(!data.fechaLimite && dateInput) dateInput.value='';
};
window.addGrupoPendiente=addGrupoPendiente;
const getGrupoPendientes=()=>getBasicListItems('grupoPendientesList');
window.getGrupoPendientes=getGrupoPendientes;

// Expulsados
const addExpulsado = (data={})=>{
    const c=document.getElementById('expulsadosContainer');
    if(!c)return;
    addDynamicItem(c,[
        {idPrefix:'expNombre',label:'Nombre',valueField:'nombre'},
        {idPrefix:'expNac',label:'Nacionalidad',valueField:'nacionalidad'}
    ],data);
};
window.addExpulsado=addExpulsado;
const getExpulsados=()=>{
    const c=document.getElementById('expulsadosContainer');
    if(!c)return[];
    return getDynamicItems(c,[
        {idPrefix:'expNombre',valueField:'nombre'},
        {idPrefix:'expNac',valueField:'nacionalidad'}
    ]);
};
window.getExpulsados=getExpulsados;

// Fletados
const addFletado = (data={})=>{
    const c=document.getElementById('fletadosContainer');
    if(!c)return;
    addDynamicItem(c,[
        {idPrefix:'fletDestino',label:'Destino',valueField:'destino'},
        {idPrefix:'fletPax',label:'Pax',type:'number',valueField:'pax'}
    ],data);
};
window.addFletado=addFletado;
const getFletados=()=>{
    const c=document.getElementById('fletadosContainer');
    if(!c)return[];
    return getDynamicItems(c,[
        {idPrefix:'fletDestino',valueField:'destino'},
        {idPrefix:'fletPax',valueField:'pax'}
    ]);
};
window.getFletados=getFletados;

// Conducciones Positivas
const addConduccionPositiva=(data={})=>{
    const c=document.getElementById('conduccionesPositivasContainer');
    if(!c)return;
    addDynamicItem(c,[{idPrefix:'cpDesc',label:'Descripción',valueField:'descripcion'}],data);
};
window.addConduccionPositiva=addConduccionPositiva;
const getConduccionesPositivas=()=>{
    const c=document.getElementById('conduccionesPositivasContainer');
    if(!c)return[];
    return getDynamicItems(c,[{idPrefix:'cpDesc',valueField:'descripcion'}]);
};
window.getConduccionesPositivas=getConduccionesPositivas;

// Conducciones Negativas
const addConduccionNegativa=(data={})=>{
    const c=document.getElementById('conduccionesNegativasContainer');
    if(!c)return;
    addDynamicItem(c,[{idPrefix:'cnDesc',label:'Descripción',valueField:'descripcion'}],data);
};
window.addConduccionNegativa=addConduccionNegativa;
const getConduccionesNegativas=()=>{
    const c=document.getElementById('conduccionesNegativasContainer');
    if(!c)return[];
    return getDynamicItems(c,[{idPrefix:'cnDesc',valueField:'descripcion'}]);
};
window.getConduccionesNegativas=getConduccionesNegativas;

const addPersonaImplicadaG4 = (data={})=>{
    const c=document.getElementById('personasImplicadasG4Container');
    if(!c)return;
    addDynamicItem(c,[
        {idPrefix:'impG4Nombre',label:'Nombre',valueField:'nombre'},
        {idPrefix:'impG4Rol',label:'Rol',valueField:'rol'}
    ],data);
};
window.addPersonaImplicadaG4=addPersonaImplicadaG4;
const getPersonasImplicadasG4=()=>{
    const c=document.getElementById('personasImplicadasG4Container');
    if(!c)return[];
    return getDynamicItems(c,[
        {idPrefix:'impG4Nombre',valueField:'nombre'},
        {idPrefix:'impG4Rol',valueField:'rol'}
    ]);
};
window.getPersonasImplicadasG4=getPersonasImplicadasG4;

const addGrupo4Pendiente = (data={})=>{
    const descInput = document.getElementById('gp4PendDesc');
    const dateInput = document.getElementById('gp4PendDate');
    const desc = data.descripcion || (descInput?descInput.value.trim():'');
    const fecha= data.fechaLimite?formatDate(data.fechaLimite):(dateInput?dateInput.value:'');
    addBasicListItem('grupo4PendientesList',desc,fecha);
    if(!data.descripcion && descInput) descInput.value='';
    if(!data.fechaLimite && dateInput) dateInput.value='';
};
window.addGrupo4Pendiente=addGrupo4Pendiente;
const getGrupo4Pendientes=()=>getBasicListItems('grupo4PendientesList');
window.getGrupo4Pendientes=getGrupo4Pendientes;

const addPuertoPendiente = (data={})=>{
    const descInput = document.getElementById('puertoPendDesc');
    const dateInput = document.getElementById('puertoPendDate');
    const desc = data.descripcion || (descInput?descInput.value.trim():'');
    const fecha= data.fechaLimite?formatDate(data.fechaLimite):(dateInput?dateInput.value:'');
    addBasicListItem('puertoPendientesList',desc,fecha);
    if(!data.descripcion && descInput) descInput.value='';
    if(!data.fechaLimite && dateInput) dateInput.value='';
};
window.addPuertoPendiente=addPuertoPendiente;
const getPuertoPendientes=()=>getBasicListItems('puertoPendientesList');
window.getPuertoPendientes=getPuertoPendientes;

const addCIEPendiente = (data={})=>{
    const descInput = document.getElementById('ciePendDesc');
    const dateInput = document.getElementById('ciePendDate');
    const desc = data.descripcion || (descInput?descInput.value.trim():'');
    const fecha= data.fechaLimite?formatDate(data.fechaLimite):(dateInput?dateInput.value:'');
    addBasicListItem('ciePendientesList',desc,fecha);
    if(!data.descripcion && descInput) descInput.value='';
    if(!data.fechaLimite && dateInput) dateInput.value='';
};
window.addCIEPendiente=addCIEPendiente;
const getCIEPendientes=()=>getBasicListItems('ciePendientesList');
window.getCIEPendientes=getCIEPendientes;

const addGestionPendiente = (data={})=>{
    const descInput = document.getElementById('gestionPendDesc');
    const dateInput = document.getElementById('gestionPendDate');
    const desc = data.descripcion || (descInput?descInput.value.trim():'');
    const fecha= data.fechaLimite?formatDate(data.fechaLimite):(dateInput?dateInput.value:'');
    addBasicListItem('gestionPendientesList',desc,fecha);
    if(!data.descripcion && descInput) descInput.value='';
    if(!data.fechaLimite && dateInput) dateInput.value='';
};
window.addGestionPendiente=addGestionPendiente;
const getGestionPendientes=()=>getBasicListItems('gestionPendientesList');
window.getGestionPendientes=getGestionPendientes;

const addCecorexPendiente = (data={})=>{
    const descInput = document.getElementById('cecorexPendDesc');
    const dateInput = document.getElementById('cecorexPendDate');
    const desc = data.descripcion || (descInput?descInput.value.trim():'');
    const fecha= data.fechaLimite?formatDate(data.fechaLimite):(dateInput?dateInput.value:'');
    addBasicListItem('cecorexPendientesList',desc,fecha);
    if(!data.descripcion && descInput) descInput.value='';
    if(!data.fechaLimite && dateInput) dateInput.value='';
};
window.addCecorexPendiente=addCecorexPendiente;
const getCecorexPendientes=()=>getBasicListItems('cecorexPendientesList');
window.getCecorexPendientes=getCecorexPendientes;

// =======================
// == RENDERING VIEWS ==
// =======================

/**
 * Menú principal.
 */
const renderMenu = () => {
    currentView = 'menu';
    headerTitle().textContent = 'UCRIF · Menú Principal de Novedades';
    backButton().classList.add('hidden');

    let html = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-4xl mx-auto p-4">`;
    for (const key in groups) {
        const g = groups[key];
        html += `
            <button data-group="${key}" class="group-btn p-6 bg-white rounded-lg shadow hover:shadow-lg">
                <div class="text-5xl">${g.icon}</div>
                <div class="font-semibold mt-2">${g.name}</div>
                <div class="text-sm text-gray-500">${g.description}</div>
            </button>
        `;
    }
    html += `</div>
        <div class="text-center text-gray-500 text-sm mt-4">
            ID de Usuario: <span id="userIdDisplay">${userId||'Cargando...'}</span>
        </div>
    `;
    mainContent().innerHTML = html;

    // Actualizar ID de usuario mostrado
    const ud = document.getElementById('userIdDisplay');
    if (ud) ud.textContent = userId || 'N/A';

    document.querySelectorAll('.group-btn').forEach(btn =>
        btn.addEventListener('click', () => navigateTo(btn.dataset.group))
    );
};

/**
 * Navega a la vista adecuada según el grupo.
 */
const navigateTo = async (groupKey) => {
    currentGroup = groupKey;
    headerTitle().textContent = `UCRIF · ${groups[groupKey].name}`;
    backButton().classList.remove('hidden');
    currentDocId = null;

    if (groupKey === 'estadistica') {
        renderStatistics();
    } else if (groupKey === 'grupo2' || groupKey === 'grupo3') {
        await renderGroup2and3Form(groupKey);
    } else {
        await renderSpecificGroupForm(groupKey);
    }
};

/**
 * Renderiza formularios simplificados para grupos distintos de 2/3.
 */
const renderSpecificGroupForm = async (groupKey) => {
    currentView = 'specificForm';
    const g = groups[groupKey];
    const colName = g.collection;

   // Bloque de campos comunes
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
        </div>
    `;
    let formFields = '';
    let dynamicAdders = '';
    let dataMap = {};

    switch (groupKey) {
        case 'grupo1':
            formFields = `
                <input type="hidden" id="fecha">
                <input type="hidden" id="anio">
                <input type="hidden" id="descripcionBreve">
                <input type="hidden" id="nombreActuacion">
                <input type="hidden" id="diligenciasActuaciones">
                <h4 class="mt-6 mb-2 font-semibold">Personas Implicadas</h4>
                <div id="personasImplicadasContainer" class="mb-4 border rounded p-2 max-h-60 overflow-y-auto"></div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
                    <input type="text" id="impNombre" placeholder="Nombre" class="rounded border px-2 py-1">
                    <input type="text" id="impNac" placeholder="Nacionalidad" class="rounded border px-2 py-1">
                    <button onclick="addPersonaImplicada()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
                </div>
            `;
            dynamicAdders = `
                <h4 class="mt-6 mb-2 font-semibold">Pendientes de Gestión</h4>
                <ul id="grupoPendientesList" class="list-disc pl-5 mb-4 max-h-40 overflow-y-auto"></ul>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <input type="text" id="gpPendDesc" placeholder="Descripción" class="rounded border px-2 py-1">
                    <input type="date" id="gpPendDate" class="rounded border px-2 py-1">
                    <button onclick="addGrupoPendiente()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
                </div>
            `;
            dataMap = {
                fecha: 'fecha',
                anio: 'anio',
                descripcionBreve: 'descripcionBreve',
                nombreActuacion: 'nombreActuacion',
                diligenciasActuaciones: 'diligenciasActuaciones',
                personasImplicadas: getPersonasImplicadas,
                grupoPendientes: getGrupoPendientes
            };
            break;

        case 'grupo4':
            formFields = `
                ${baseFields}
                <div class="mb-4">
                    <label for="identificados">Identificados</label>
                    <input type="number" id="identificados" min="0" value="0" class="w-full rounded border px-2 py-1">
                </div>
                <h4 class="mt-6 mb-2 font-semibold">Colaboraciones otros grupos</h4>
                <div id="colaboracionesG4Container" class="mb-4 border rounded p-2 max-h-60 overflow-y-auto"></div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end mb-4">
                    <input type="text" id="colG4Desc" placeholder="Descripción" class="rounded border px-2 py-1">
                    <button onclick="addColaboracionG4()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
                </div>
                <h4 class="mt-6 mb-2 font-semibold">Detenidos</h4>
                <div id="detenidosG4Container" class="mb-4 border rounded p-2 max-h-60 overflow-y-auto"></div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
                    <input type="text" id="detG4Motivo" placeholder="Motivo" class="rounded border px-2 py-1">
                    <input type="text" id="detG4Nac" placeholder="Nacionalidad" class="rounded border px-2 py-1">
                    <button onclick="addDetenidoG4()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
                </div>
                <div class="mb-4">
                    <label for="citados">Citados</label>
                    <input type="number" id="citados" min="0" value="0" class="w-full rounded border px-2 py-1">
                </div>
                <div class="mb-4">
                    <label for="otrasGestiones">Otras gestiones</label>
                    <textarea id="otrasGestiones" class="w-full rounded border px-2 py-1" rows="2"></textarea>
                </div>
                <div class="mb-4">
                    <label for="inspeccionesTrabajo">Inspecciones trabajo</label>
                    <input type="number" id="inspeccionesTrabajo" min="0" value="0" class="w-full rounded border px-2 py-1">
                </div>
                <div class="mb-4">
                    <label for="otrasInspecciones">Otras inspecciones</label>
                    <input type="number" id="otrasInspecciones" min="0" value="0" class="w-full rounded border px-2 py-1">
                </div>
            `;
            dynamicAdders = `
                <h4 class="mt-6 mb-2 font-semibold">Pendientes de Gestión</h4>
                <ul id="grupo4PendientesList" class="list-disc pl-5 mb-4 max-h-40 overflow-y-auto"></ul>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <input type="text" id="gp4PendDesc" placeholder="Descripción" class="rounded border px-2 py-1">
                    <input type="date" id="gp4PendDate" class="rounded border px-2 py-1">
                    <button onclick="addGrupo4Pendiente()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
                </div>
            `;
            dataMap = {
                fecha: 'fecha',
                anio: 'anio',
                descripcionBreve: 'descripcionBreve',
                identificados: 'identificados',
                colaboracionesOtrosGrupos: getColaboracionesG4,
                detenidos: getDetenidosG4,
                citados: 'citados',
                otrasGestiones: 'otrasGestiones',
                inspeccionesTrabajo: 'inspeccionesTrabajo',
                otrasInspecciones: 'otrasInspecciones',
                grupo4Pendientes: getGrupo4Pendientes
            };
            break;

        case 'puerto':
            formFields = `
                <input type="hidden" id="fecha">
                <input type="hidden" id="anio">
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
@@ -908,182 +871,237 @@ const renderSpecificGroupForm = async (groupKey) => {
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
                </div>
            `;
            dynamicAdders = ``;
            dataMap = {
                fecha: 'fecha',
                anio: 'anio',
                descripcionBreve: 'descripcionBreve',
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
                ferriVehiculos: 'ferriVehiculos',                entradasExcepcionales: 'entradasExcepcionales',
                puertoDeportivo: 'puertoDeportivo',
                denegaciones: 'denegaciones',
                observaciones: 'observacionesPuerto',
                pendiente: 'pendiente',
                pendienteDescripcion: 'pendienteDescripcion',
                pendienteFecha: 'pendienteFecha'
            };
            break;

        case 'cie':
            formFields = `
                ${baseFields}
                <div class="mb-4">
                    <label for="tipoActuacion">Tipo de Actuación</label>
                    <input type="text" id="tipoActuacion" placeholder="Admisión, Visita, Traslado" class="w-full rounded border px-2 py-1">
                </div>
                <div class="mb-4">
                    <label for="totalInternos">Nº internos total</label>
                    <input type="number" id="totalInternos" min="0" value="0" class="w-full rounded border px-2 py-1">
                </div>
                <h4 class="mt-6 mb-2 font-semibold">Internos por nacionalidad</h4>
                <div id="internosNacionalidadesContainer" class="mb-4 border rounded p-2 max-h-60 overflow-y-auto"></div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
                    <input type="text" id="intNac" placeholder="Nacionalidad" class="rounded border px-2 py-1">
                    <input type="number" id="intNum" placeholder="Número" class="rounded border px-2 py-1">
                    <button onclick="addInternoNacionalidad()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
                </div>
                <h4 class="mt-6 mb-2 font-semibold">Ingresos</h4>
                <div id="ingresosContainer" class="mb-4 border rounded p-2 max-h-60 overflow-y-auto"></div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
                    <input type="text" id="ingNac" placeholder="Nacionalidad" class="rounded border px-2 py-1">
                    <input type="number" id="ingNum" placeholder="Número" class="rounded border px-2 py-1">
                    <button onclick="addIngreso()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
                </div>
                <h4 class="mt-6 mb-2 font-semibold">Salidas</h4>
                <div id="salidasContainer" class="mb-4 border rounded p-2 max-h-60 overflow-y-auto"></div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
                    <input type="text" id="salDestino" placeholder="Destino" class="rounded border px-2 py-1">
                    <input type="number" id="salNum" placeholder="Número" class="rounded border px-2 py-1">
                    <button onclick="addSalida()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
                </div>
                <div class="mb-4">
                    <label for="nombrePersonaCIE">Nombre de la Persona</label>
                    <input type="text" id="nombrePersonaCIE" class="w-full rounded border px-2 py-1">
                </div>
                <div class="mb-4">
                    <label for="nacionalidadPersonaCIE">Nacionalidad de la Persona</label>
                    <input type="text" id="nacionalidadPersonaCIE" class="w-full rounded border px-2 py-1">
                </div>
                <div class="mb-4">
                    <label for="motivoCIE">Motivo</label>
                    <textarea id="motivoCIE" class="w-full rounded border px-2 py-1" rows="2"></textarea>
                </div>
                <div class="mb-4">
                    <label for="observacionesCIE">Observaciones</label>
                    <textarea id="observacionesCIE" class="w-full rounded border px-2 py-1" rows="3"></textarea>
                </div>
            `;
            dynamicAdders = `
                <h4 class="mt-6 mb-2 font-semibold">Pendientes de Gestión</h4>
                <ul id="ciePendientesList" class="list-disc pl-5 mb-4 max-h-40 overflow-y-auto"></ul>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <input type="text" id="ciePendDesc" placeholder="Descripción" class="rounded border px-2 py-1">
                    <input type="date" id="ciePendDate" class="rounded border px-2 py-1">
                    <button onclick="addCIEPendiente()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
                </div>
            `;
            dataMap = {
                fecha: 'fecha',
                anio: 'anio',
                descripcionBreve: 'descripcionBreve',
                tipoActuacion: 'tipoActuacion',
                totalInternos: 'totalInternos',
                internosNacionalidad: getInternosNacionalidad,
                ingresos: getIngresos,
                salidas: getSalidas,
                nombrePersonaCIE: 'nombrePersonaCIE',
                nacionalidadPersonaCIE: 'nacionalidadPersonaCIE',
                motivoCIE: 'motivoCIE',
                observaciones: 'observacionesCIE',
                ciePendientes: getCIEPendientes
            };
            break;

        case 'gestion':
            formFields = `
                <input type="hidden" id="fecha">
                <input type="hidden" id="anio">
                <input type="hidden" id="descripcionBreve">
                <div class="mb-4">
                    <label for="tipoTramite">Tipo de Trámite</label>
                    <input type="text" id="tipoTramite" placeholder="Asilo, Carta invitación" class="w-full rounded border px-2 py-1">
                </div>
                <div class="mb-4">
                    <label for="datosGestionado">Datos del Gestionado</label>
                    <textarea id="datosGestionado" class="w-full rounded border px-2 py-1" rows="3"></textarea>
                </div>
                <div class="mb-4">
                    <label for="descripcionTramite">Descripción Trámite</label>
                    <textarea id="descripcionTramite" class="w-full rounded border px-2 py-1" rows="2"></textarea>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                        <label for="menasGestion">MENAs</label>
                        <input type="number" id="menasGestion" min="0" value="0" class="w-full rounded border px-2 py-1">
                    </div>
                    <div>
                        <label for="asilosGestion">Asilos</label>
                        <input type="number" id="asilosGestion" min="0" value="0" class="w-full rounded border px-2 py-1">
                    </div>
                    <div>
                        <label for="citasOfertadas">Citas ofertadas</label>
                        <input type="number" id="citasOfertadas" min="0" value="0" class="w-full rounded border px-2 py-1">
                    </div>
                    <div>
                        <label for="cues">CUEs</label>
                        <input type="number" id="cues" min="0" value="0" class="w-full rounded border px-2 py-1">
                    </div>
                    <div>
                        <label for="asignaciones">Asignaciones</label>
                        <input type="number" id="asignaciones" min="0" value="0" class="w-full rounded border px-2 py-1">
                    </div>
                    <div>
                        <label for="protecciones">Protecciones</label>
                        <input type="number" id="protecciones" min="0" value="0" class="w-full rounded border px-2 py-1">
                    </div>
                </div>
                <div class="mb-4">
                    <label for="observacionesGestion">Observaciones</label>
                    <textarea id="observacionesGestion" class="w-full rounded border px-2 py-1" rows="3"></textarea>
                </div>
            `;
            dynamicAdders = `
                <h4 class="mt-6 mb-2 font-semibold">Pendientes de Gestión</h4>
                <ul id="gestionPendientesList" class="list-disc pl-5 mb-4 max-h-40 overflow-y-auto"></ul>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <input type="text" id="gestionPendDesc" placeholder="Descripción" class="rounded border px-2 py-1">
                    <input type="date" id="gestionPendDate" class="rounded border px-2 py-1">
                    <button onclick="addGestionPendiente()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
                </div>
            `;
            dataMap = {
                fecha: 'fecha',
                anio: 'anio',
                descripcionBreve: 'descripcionBreve',
                tipoTramite: 'tipoTramite',
                datosGestionado: 'datosGestionado',
                descripcionTramite: 'descripcionTramite',
                menasGestion: 'menasGestion',
                asilosGestion: 'asilosGestion',
                citasOfertadas: 'citasOfertadas',
                cues: 'cues',
                asignaciones: 'asignaciones',
                protecciones: 'protecciones',
                observaciones: 'observacionesGestion',
                gestionPendientes: getGestionPendientes
            };
            break;

        case 'cecorex':
            formFields = `
                <input type="hidden" id="fecha">
                <input type="hidden" id="anio">
                <input type="hidden" id="descripcionBreve">
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
@@ -1099,52 +1117,50 @@ const renderSpecificGroupForm = async (groupKey) => {
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
                </div>
            `;
            dynamicAdders = ``;
            dataMap = {
                fecha: 'fecha',
                anio: 'anio',
                descripcionBreve: 'descripcionBreve',
                turno: 'turno',
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
            formFields = `<p class="text-gray-500">No hay formulario definido para este grupo.</p>`;
    }
   // Sección de búsqueda/selección
    let searchSection = `
        <div class="bg-white p-4 rounded shadow border-blue-300 border">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div class="md:col-span-2">
                    <label>Buscar registro existente</label>
                    <select id="docList" class="w-full rounded border px-2 py-1"></select>
                </div>
@@ -1300,50 +1316,55 @@ const loadDocByDate = async (collectionName, dataMapping, dateStr) => {
        if (snaps.empty) {
            currentDocId = null;
            showStatus('Sin registro para esa fecha.', true);
            return;
        }
        const snap = snaps.docs[0];
        currentDocId = snap.id;
        const data = snap.data();
        for (const key in dataMapping) {
            const mp = dataMapping[key];
            if (typeof mp === 'string') {
                const fld = document.getElementById(mp);
                if (!fld) continue;
                if (fld.type === 'date') fld.value = formatDate(data[key]);
                else fld.value = data[key] || '';
            } else if (typeof mp === 'function') {
                const containerMap = {
                    personasImplicadas: 'personasImplicadasContainer',
                                      expulsados: 'expulsadosContainer',
                    fletados: 'fletadosContainer',
                    conduccionesPositivas: 'conduccionesPositivasContainer',
                    conduccionesNegativas: 'conduccionesNegativasContainer',
                    grupoPendientes: 'grupoPendientesList',
                    personasImplicadasG4: 'personasImplicadasG4Container',
                    grupo4Pendientes: 'grupo4PendientesList',
                    colaboracionesOtrosGrupos: 'colaboracionesG4Container',
                    detenidos: 'detenidosG4Container',
                    internosNacionalidad: 'internosNacionalidadesContainer',
                    ingresos: 'ingresosContainer',
                    salidas: 'salidasContainer',
                    puertoPendientes: 'puertoPendientesList',
                    ciePendientes: 'ciePendientesList',
                    gestionPendientes: 'gestionPendientesList',
                    cecorexPendientes: 'cecorexPendientesList'
                };
                const containerId = containerMap[key];
                if (!containerId) continue;
                const cont = document.getElementById(containerId);
                if (!cont) continue;
                cont.innerHTML = '';
                if (data[key] && Array.isArray(data[key])) {
                    const addFnName = 'add' + key.charAt(0).toUpperCase() + key.slice(1).replace(/s$/, '');
                    data[key].forEach(item => { if (window[addFnName]) window[addFnName](item); });
                }
            }
        }
        showStatus('Registro cargado.', false);
    } catch(e) {
        console.error(e);
        showStatus(`Error al cargar: ${e.message}`, true);
    } finally {
        showSpinner(false);
    }
};
/**
@@ -1386,50 +1407,52 @@ const saveSpecificDoc = async (collectionName, dataMapping) => {
};

/**
 * Resetea el formulario simplificado.
 */
const resetSpecificForm = async (collectionName) => {
    currentDocId = null;
    document.querySelectorAll('input, textarea').forEach(el=>{
        if (el.type==='checkbox') el.checked = false;
        else el.value = '';
    });
    if (document.getElementById('anio'))  document.getElementById('anio').value = new Date().getFullYear();
    if (document.getElementById('fecha')) document.getElementById('fecha').value = formatDate(new Date());
    
    const pendSel = document.getElementById('pendiente');
    const pendDet = document.getElementById('pendienteDetalles');
    if (pendSel) pendSel.value = '';
    if (pendDet) pendDet.classList.add('hidden');

    // Limpiar listas dinámicas
    [
        'personasImplicadasContainer','grupoPendientesList',
        'expulsadosContainer','fletadosContainer',
        'conduccionesPositivasContainer','conduccionesNegativasContainer',
        'personasImplicadasG4Container','grupo4PendientesList',
        'colaboracionesG4Container','detenidosG4Container',
        'internosNacionalidadesContainer','ingresosContainer','salidasContainer',
        'puertoPendientesList','ciePendientesList',
        'gestionPendientesList','cecorexPendientesList'
    ].forEach(id=>{
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });

    // Recargar select
    await fetchDataForSelect(collectionName, 'docList', 'descripcionBreve', 'anio', currentGroup);
    showStatus('', false);
    };

// =======================
// == Grupo 2/3: Operaciones detalladas ==
// =======================

/**
 * Reset completo de formulario Group2/3.
 */
const resetGroup2and3Form = async (fetchOps = true) => {
    currentDocId = null;

    // Campos directos
    [
        'codigo','anio','fecha','nombreOperacion','descripcionBreve',
        'fechaInicioOperacion','origen','tipologiaDelictiva',
        'dolenciasPreviasYJuzgados','diligenciasPolicialesMain',
        'diligenciasPolicialesDoc','oficiosJudiciales','documentosAdjuntos',
        'anotacionesTexto','juzgadoInicialField'
    ].forEach(id=>{
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    if (document.getElementById('anio'))  document.getElementById('anio').value = new Date().getFullYear();
    if (document.getElementById('fecha')) document.getElementById('fecha').value = formatDate(new Date());

    // Checkboxes
    ['anotacionRelevante','anotacionConfidencial'].forEach(id=>{
        const cb = document.getElementById(id);
        if (cb) cb.checked = false;
    });

    // Contenedores dinámicos
    [
        'diligenciasPreviasJuzgadosContainer','historicoInhibicionesContainer',
        'historicoGeneralJuzgadosContainer','intervencionesTelefonicasContainer',
        'entradasYRegistrosContainer','solicitudesJudicialesContainer',
        'colaboracionesContainer','detenidosContainer',
        'detenidosPrevistosContainer','otrasPersonasContainer',
        'chronologyList','pendingList'
    ].forEach(id=>{
        const c = document.getElementById(id);
        if (c) c.innerHTML = '';
    });

    // Cerrar <details>
    document.querySelectorAll('details').forEach(d=>d.open=false);

    if (fetchOps) {
        await fetchDataForSelect('operaciones','opList','nombreOperacion','anio',currentGroup);
    }
    showStatus('', false);
};

/**
 * Renderiza el formulario detallado para Grupo2/3.
 */
const renderGroup2and3Form = async (groupKey) => {
    currentView = 'operationForm';
    const g = groups[groupKey];
    const colName = g.collection; // 'operaciones'

    // Usamos función auxiliar para crear secciones plegables
    const renderCollapsibleSection = (id, title, content) => `
        <details id="details-${id}" class="bg-white border-blue-300 border rounded shadow mb-4">
            <summary class="p-4 font-semibold cursor-pointer flex justify-between items-center">
                <span>${title}</span>
                <svg class="w-5 h-5 transform details-arrow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </summary>
            <div class="p-4 border-t border-gray-200">
                ${content}
            </div>
        </details>
    `;

    const formHtml = `
    <div class="max-w-4xl mx-auto p-4 space-y-6">
        <h2 class="text-2xl font-bold text-center">${g.name} · ${g.description}</h2>

        <!-- Buscar / Seleccionar operación existente -->
        <div class="bg-white p-4 rounded shadow border-blue-300 border">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div class="md:col-span-2">
                    <label>Buscar operación existente</label>
                    <select id="opList" class="w-full rounded border px-2 py-1"></select>
                </div>
                <button id="loadOpBtn" class="bg-blue-600 text-white px-4 py-2 rounded">Cargar</button>
                <button id="newOpBtn" class="bg-gray-600 text-white px-4 py-2 rounded">Nueva</button>
            </div>
        </div>

        <!-- Datos Principales -->
        <div class="bg-white p-4 rounded shadow border-blue-300 border space-y-4">
            <div id="status-message" class="font-semibold"></div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label for="codigo">Código</label>
                    <input type="text" id="codigo" placeholder="Autogenerado..." class="w-full rounded border px-2 py-1">
                </div>
                <div>
                    <label for="anio">Año</label>
                    <input type="text" id="anio" class="w-full rounded border px-2 py-1">
                </div>
                <div>
                    <label for="fecha">Fecha Creación</label>
                    <input type="date" id="fecha" class="w-full rounded border px-2 py-1">
                </div>
            </div>
            <div>
                <label for="nombreOperacion">Nombre de la Operación</label>
                <input type="text" id="nombreOperacion" class="w-full rounded border px-2 py-1" required>
            </div>
            <div>
                <label for="descripcionBreve">Descripción Breve</label>
                <textarea id="descripcionBreve" class="w-full rounded border px-2 py-1" rows="2" required></textarea>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label for="fechaInicioOperacion">Fecha Inicio</label>
                    <input type="date" id="fechaInicioOperacion" class="w-full rounded border px-2 py-1">
                </div>
                <div>
                    <label for="origen">Origen</label>
                    <input type="text" id="origen" class="w-full rounded border px-2 py-1">
                </div>
                <div>
                    <label for="tipologiaDelictiva">Tipología Delictiva</label>
                    <input type="text" id="tipologiaDelictiva" class="w-full rounded border px-2 py-1">
                </div>
            </div>
            <div>
                <label for="dolenciasPreviasYJuzgados">Dolencias Previas y Juzgados</label>
                <textarea id="dolenciasPreviasYJuzgados" class="w-full rounded border px-2 py-1" rows="2"></textarea>
            </div>
            <div>
                <label for="diligenciasPolicialesMain">Diligencias Policiales (Principales)</label>
                <textarea id="diligenciasPolicialesMain" class="w-full rounded border px-2 py-1" rows="2"></textarea>
            </div>
            <div class="text-right">
                <button id="saveOpBtn" class="bg-green-600 text-white px-6 py-2 rounded">Guardar Operación</button>
            </div>
        </div>

        <!-- 2.1 Juzgados -->
        ${renderCollapsibleSection('juzgados','🗂️ Juzgados',`
            <div class="mb-4">
                <label for="juzgadoInicialField">Juzgado Inicial</label>
                <input type="text" id="juzgadoInicialField" class="w-full rounded border px-2 py-1">
            </div>
            <h4 class="font-semibold mb-2">Diligencias Previas</h4>
            <div id="diligenciasPreviasJuzgadosContainer" class="mb-4 space-y-2"></div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
                <input type="date" id="dpjFecha" class="rounded border px-2 py-1">
                <input type="text" id="dpjJuzgado" placeholder="Juzgado" class="rounded border px-2 py-1">
                <button onclick="addDiligenciaPreviasJuzgados()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
            </div>

            <h4 class="font-semibold mb-2">Inhibiciones</h4>
            <div id="historicoInhibicionesContainer" class="mb-4 space-y-2"></div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
                <input type="text" id="inhibJuzgado" placeholder="Juzgado Inhibido" class="rounded border px-2 py-1">
                <input type="date" id="inhibFecha" class="rounded border px-2 py-1">
                <button onclick="addHistoricoInhibicion()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
            </div>

            <h4 class="font-semibold mb-2">Histórico de Juzgados</h4>
            <div id="historicoGeneralJuzgadosContainer" class="mb-4 space-y-2"></div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
                <input type="date" id="hgJFecha" class="rounded border px-2 py-1">
                <input type="text" id="hgJJuzgado" placeholder="Juzgado Relacionado" class="rounded border px-2 py-1">
                <input type="text" id="hgJEvento" placeholder="Descripción Evento" class="rounded border px-2 py-1">
                <button onclick="addHistoricoGeneralJuzgados()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
            </div>
        `)}

        <!-- 2.2 Intervenciones / Medidas -->
        ${renderCollapsibleSection('intervenciones','📞 Intervenciones / Medidas',`
            <h4 class="mb-2 font-semibold">Intervenciones Telefónicas</h4>
            <div id="intervencionesTelefonicasContainer" class="mb-4 space-y-2"></div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end mb-4">
                <input type="text" id="itDesc" placeholder="Descripción" class="rounded border px-2 py-1">
                <button onclick="addIntervencionTelefonica()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
            </div>

            <h4 class="mb-2 font-semibold">Entradas y Registros</h4>
            <div id="entradasYRegistrosContainer" class="mb-4 space-y-2"></div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end mb-4">
                <input type="text" id="eyrDesc" placeholder="Descripción" class="rounded border px-2 py-1">
                <button onclick="addEntradaYRegistro()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
            </div>

            <h4 class="mb-2 font-semibold">Solicitudes Judiciales</h4>
            <div id="solicitudesJudicialesContainer" class="mb-4 space-y-2"></div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
                <input type="text" id="sjTipo" placeholder="Tipo" class="rounded border px-2 py-1">
                <input type="text" id="sjDesc" placeholder="Descripción" class="rounded border px-2 py-1">
                <button onclick="addSolicitudJudicial()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
            </div>

            <h4 class="mb-2 font-semibold">Colaboraciones</h4>
            <div id="colaboracionesContainer" class="mb-4 space-y-2"></div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
                <input type="date" id="colaboracionFecha" class="rounded border px-2 py-1">
                <input type="text" id="colaboracionGrupoInstitucion" placeholder="Grupo/Inst." class="rounded border px-2 py-1">
                <input type="text" id="colaboracionTipo" placeholder="Tipo Colaboración" class="rounded border px-2 py-1">
                <button onclick="addColaboracion()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
            </div>
        `)}

        <!-- 2.3 Cronología -->
        ${renderCollapsibleSection('chronology','🕰️ Cronología',`
            <ul id="chronologyList" class="mb-4 list-disc pl-5"></ul>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end mb-4">
                <input type="text" id="chronDesc" placeholder="Descripción" class="rounded border px-2 py-1">
                <button id="addChronBtn" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir Evento</button>
            </div>
        `)}

        <!-- 3. Personas Vinculadas -->
        ${renderCollapsibleSection('personas-vinculadas','👥 Personas Vinculadas',`
            <h4 class="mb-2 font-semibold">Detenidos</h4>
            <div id="detenidosContainer" class="mb-4 space-y-2"></div>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end mb-4">
                <input type="text" id="detFiliacion" placeholder="Filiación Delito" class="rounded border px-2 py-1">
                <input type="text" id="detNac" placeholder="Nacionalidad" class="rounded border px-2 py-1">
                <input type="date" id="detFecha" class="rounded border px-2 py-1">
                <input type="text" id="detOrdinal" placeholder="Ordinal" class="rounded border px-2 py-1">
                <button onclick="addDetenido()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
            </div>

            <h4 class="mb-2 font-semibold">Detenidos Previstos</h4>
            <div id="detenidosPrevistosContainer" class="mb-4 space-y-2"></div>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end mb-4">
                <input type="text" id="detPrevFiliacion" placeholder="Filiación Delito" class="rounded border px-2 py-1">
                <input type="text" id="detPrevNac" placeholder="Nacionalidad" class="rounded border px-2 py-1">
                <input type="date" id="detPrevFecha" class="rounded border px-2 py-1">
                <input type="text" id="detPrevOrdinal" placeholder="Ordinal" class="rounded border px-2 py-1">
                <button onclick="addDetenidoPrevisto()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
            </div>

            <h4 class="mb-2 font-semibold">Otras Personas</h4>
            <div id="otrasPersonasContainer" class="mb-4 space-y-2"></div>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end mb-4">
                <input type="text" id="otraFiliacion" placeholder="Filiación" class="rounded border px-2 py-1">
                <input type="text" id="otraTipo" placeholder="Tipo Vinculación" class="rounded border px-2 py-1">
                <input type="text" id="otraNac" placeholder="Nacionalidad" class="rounded border px-2 py-1">
                <input type="text" id="otraTelefono" placeholder="Teléfono" class="rounded border px-2 py-1">
                <button onclick="addOtraPersona()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
            </div>
        `)}

        <!-- 4. Documentación -->
        ${renderCollapsibleSection('documentacion','📝 Documentación',`
            <div class="mb-4">
                <label for="diligenciasPolicialesDoc">Diligencias Policiales</label>
                <textarea id="diligenciasPolicialesDoc" class="w-full rounded border px-2 py-1" rows="3"></textarea>
            </div>
            <div class="mb-4">
                <label for="oficiosJudiciales">Oficios Judiciales</label>
                <textarea id="oficiosJudiciales" class="w-full rounded border px-2 py-1" rows="3"></textarea>
            </div>
            <div class="mb-4">
                <label for="documentosAdjuntos">Documentos Adjuntos</label>
                <textarea id="documentosAdjuntos" class="w-full rounded border px-2 py-1" rows="3"></textarea>
            </div>
        `)}

        <!-- 5. Anotaciones / Observaciones -->
        ${renderCollapsibleSection('anotaciones','🧩 Anotaciones / Observaciones',`
            <div class="mb-4">
                <label for="anotacionesTexto">Comentarios Internos</label>
                <textarea id="anotacionesTexto" class="w-full rounded border px-2 py-1" rows="4"></textarea>
            </div>
            <div class="flex items-center mb-2">
                <input type="checkbox" id="anotacionRelevante" class="mr-2">
                <label for="anotacionRelevante">Marcar como Relevante</label>
            </div>
            <div class="flex items-center">
                <input type="checkbox" id="anotacionConfidencial" class="mr-2">
                <label for="anotacionConfidencial">Marcar como Confidencial</label>
            </div>
        `)}

        <!-- 6. Pendientes de Operación (subcolección) -->
        ${renderCollapsibleSection('pending','✅ Elementos Pendientes',`
            <ul id="pendingList" class="mb-4 list-disc pl-5"></ul>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <input type="text" id="pendDesc" placeholder="Descripción" class="rounded border px-2 py-1">
                <input type="date" id="pendDate" class="rounded border px-2 py-1">
                <button id="addPendBtn" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
            </div>
        `)}

        <!-- 7. Funciones Adicionales -->
        ${renderCollapsibleSection('funciones-adicionales','🔍 Funciones Adicionales',`
            <button id="generateReportBtn" class="bg-indigo-600 text-white px-4 py-2 rounded">Generar Informe Automático</button>
        `)}
    </div>
    `;
    mainContent().innerHTML = formHtml;

    // Attach listeners
    document.getElementById('newOpBtn').addEventListener('click', () => resetGroup2and3Form());
    document.getElementById('loadOpBtn').addEventListener('click', () => loadOperation(colName));
    document.getElementById('saveOpBtn').addEventListener('click', () => saveOperation(colName));
    document.getElementById('addChronBtn').addEventListener('click', async () => {
        const desc = document.getElementById('chronDesc').value.trim();
        if (!desc) return;
        await addRelatedItem('chronology', { descripcion: desc }, 'chronologyList', item => `<li>${formatDateTime(item.createdAt)} - ${item.descripcion}</li>`);
        document.getElementById('chronDesc').value = '';
    });
    document.getElementById('addPendBtn').addEventListener('click', addPendingTaskToOperation);
    document.getElementById('generateReportBtn').addEventListener('click', generateOperationReport);

    await resetGroup2and3Form();
};

/**
 * Carga una operación existente (Grupo2/3).
 */
const loadOperation = async (collectionName) => {
    const sel = document.getElementById('opList');
    const opId = sel ? sel.value : null;
    if (!opId) return;
    resetGroup2and3Form(false);
    showSpinner(true);
    currentDocId = opId;
    try {
        const op = await loadData(collectionName, opId);
        if (!op) {
            showStatus("Operación no encontrada.", true);
            return;
        }

        // Campos principales
        document.getElementById('codigo').value = op.codigo || '';
        document.getElementById('anio').value = op.anio || '';
        document.getElementById('fecha').value = formatDate(op.fecha);
        document.getElementById('nombreOperacion').value = op.nombreOperacion || '';
        document.getElementById('descripcionBreve').value = op.descripcionBreve || '';
        document.getElementById('fechaInicioOperacion').value = formatDate(op.fechaInicioOperacion);
        document.getElementById('origen').value = op.origen || '';
        document.getElementById('tipologiaDelictiva').value = op.tipologiaDelictiva || '';
        document.getElementById('dolenciasPreviasYJuzgados').value = op.dolenciasPreviasYJuzgados || '';
        document.getElementById('diligenciasPolicialesMain').value = op.diligenciasPolicialesMain || '';

        // Juzgados
        document.getElementById('juzgadoInicialField').value = op.juzgadoInicial || '';
        document.getElementById('diligenciasPreviasJuzgadosContainer').innerHTML = '';
        if (op.diligenciasPreviasJuzgados) op.diligenciasPreviasJuzgados.forEach(item => window.addDiligenciaPreviasJuzgados(item));
        document.getElementById('historicoInhibicionesContainer').innerHTML = '';
        if (op.historicoInhibicionesJuzgados) op.historicoInhibicionesJuzgados.forEach(item => window.addHistoricoInhibicion(item));
        document.getElementById('historicoGeneralJuzgadosContainer').innerHTML = '';
        if (op.historicoGeneralJuzgados) op.historicoGeneralJuzgados.forEach(item => window.addHistoricoGeneralJuzgados(item));

        // Intervenciones / Medidas
        document.getElementById('intervencionesTelefonicasContainer').innerHTML = '';
        if (op.intervencionesTelefonicas) op.intervencionesTelefonicas.forEach(item => window.addIntervencionTelefonica(item));
        document.getElementById('entradasYRegistrosContainer').innerHTML = '';
        if (op.entradasYRegistros) op.entradasYRegistros.forEach(item => window.addEntradaYRegistro(item));
        document.getElementById('solicitudesJudicialesContainer').innerHTML = '';
        if (op.solicitudesJudiciales) op.solicitudesJudiciales.forEach(item => window.addSolicitudJudicial(item));
        document.getElementById('colaboracionesContainer').innerHTML = '';
        if (op.colaboraciones) op.colaboraciones.forEach(item => window.addColaboracion(item));

        // Cronología (subcolección)
        await loadSubCollection(opId, 'chronology', 'chronologyList', (a,b)=>{
            const da = a.createdAt?.toDate?.() || new Date(a.createdAt);
            const db_ = b.createdAt?.toDate?.() || new Date(b.createdAt);
            return db_ - da;
        }, item => `<li>${formatDateTime(item.createdAt)} - ${item.descripcion}</li>`);

        // Personas Vinculadas
        document.getElementById('detenidosContainer').innerHTML = '';
        if (op.detenidos) op.detenidos.forEach(item => window.addDetenido(item));
        document.getElementById('detenidosPrevistosContainer').innerHTML = '';
        if (op.detenidosPrevistos) op.detenidosPrevistos.forEach(item => window.addDetenidoPrevisto(item));
        document.getElementById('otrasPersonasContainer').innerHTML = '';
        if (op.otrasPersonas) op.otrasPersonas.forEach(item => window.addOtraPersona(item));

        // Documentación
        document.getElementById('diligenciasPolicialesDoc').value = op.diligenciasPolicialesDoc || '';
        document.getElementById('oficiosJudiciales').value = op.oficiosJudiciales || '';
        document.getElementById('documentosAdjuntos').value = op.documentosAdjuntos || '';

        // Anotaciones
        document.getElementById('anotacionesTexto').value = op.anotacionesTexto || '';
        document.getElementById('anotacionRelevante').checked = op.anotacionRelevante || false;
        document.getElementById('anotacionConfidencial').checked = op.anotacionConfidencial || false;

        // Pendientes (subcolección)
        await loadSubCollection(opId, 'pendingTasks', 'pendingList', (a,b)=>{
            return new Date(a.fechaLimite) - new Date(b.fechaLimite);
        }, item => `
            <li class="flex justify-between items-center ${new Date(item.fechaLimite)<new Date() && item.estado!=='Completado'?'text-red-500':''}">
                <span>${item.descripcion} (Vence: ${item.fechaLimite})</span>
                ${item.estado!=='Completado'
                    ? `<button data-task-id="${item.id}" class="complete-task-btn text-white bg-green-500 px-2 py-1 rounded">Hecho</button>`
                    : `<span class="text-green-600">(Completado)</span>`
                }
            </li>
        `);
        document.querySelectorAll('.complete-task-btn').forEach(btn=>
            btn.addEventListener('click', ()=>completePendingTask(btn.dataset.taskId, true))
        );

        showStatus("Operación cargada.", false);
    } catch(e) {
        console.error(e);
        showStatus(`Error al cargar la operación: ${e.message}`, true);
    } finally {
        showSpinner(false);
    }
};

/**
 * Guarda la operación actual (create/update).
 */
const saveOperation = async (collectionName) => {
    showSpinner(true);
    const anio = Number(document.getElementById('anio').value.trim());
    const fecha = document.getElementById('fecha').value;
    const nombreOperacion = document.getElementById('nombreOperacion').value.trim();
    const descripcionBreve = document.getElementById('descripcionBreve').value.trim();
    const fechaInicio = document.getElementById('fechaInicioOperacion').value;
    const origen = document.getElementById('origen').value.trim();
    const juzgadoInicial = document.getElementById('juzgadoInicialField').value.trim();
    const tipologia = document.getElementById('tipologiaDelictiva').value.trim();
    const dolencias = document.getElementById('dolenciasPreviasYJuzgados').value.trim();
    const diligMain = document.getElementById('diligenciasPolicialesMain').value.trim();
    const anot = document.getElementById('anotacionesTexto').value.trim();
    const rel = document.getElementById('anotacionRelevante').checked;
    const conf = document.getElementById('anotacionConfidencial').checked;

    if (!nombreOperacion || !descripcionBreve) {
        showStatus("Los campos Nombre y Descripción son obligatorios.", true);
        showSpinner(false);
        return;
    }

    try {
        let codigo = document.getElementById('codigo').value.trim();
        if (!currentDocId) {
            codigo = await getNextCode(collectionName, groups[currentGroup].name, anio);
            document.getElementById('codigo').value = codigo;
        }

        const opData = {
            grupo: groups[currentGroup].name,
            codigo: Number(codigo),
            anio,
            fecha: new Date(fecha),
            nombreOperacion,
            descripcionBreve,
            fechaInicioOperacion: fechaInicio? new Date(fechaInicio): null,
            origen,
            juzgadoInicial,
            tipologiaDelictiva: tipologia,
            dolenciasPreviasYJuzgados: dolencias,
            diligenciasPolicialesMain: diligMain,
            historicoInhibicionesJuzgados: getHistoricoInhibiciones(),
            diligenciasPreviasJuzgados: getDiligenciasPreviasJuzgados(),
            historicoGeneralJuzgados: getHistoricoGeneralJuzgados(),
            intervencionesTelefonicas: getIntervencionesTelefonicas(),
            entradasYRegistros: getEntradasYRegistros(),
            solicitudesJudiciales: getSolicitudesJudiciales(),
            colaboraciones: getColaboraciones(),
            detenidos: getDetenidos(),
            detenidosPrevistos: getDetenidosPrevistos(),
            otrasPersonas: getOtrasPersonas(),
            diligenciasPolicialesDoc: document.getElementById('diligenciasPolicialesDoc').value.trim(),
            oficiosJudiciales: document.getElementById('oficiosJudiciales').value.trim(),
            documentosAdjuntos: document.getElementById('documentosAdjuntos').value.trim(),
            anotacionesTexto: anot,
            anotacionRelevante: rel,
            anotacionConfidencial: conf
        };

        currentDocId = await saveData(collectionName, opData, currentDocId);
        showStatus("Operación guardada correctamente.", false);
        await fetchDataForSelect(collectionName, 'opList', 'nombreOperacion', 'anio', currentGroup);
        const sel = document.getElementById('opList');
        if (sel) sel.value = currentDocId;
    } catch(e) {
        console.error(e);
        showStatus(`Error al guardar: ${e.message}`, true);
    } finally {
        showSpinner(false);
    }
};

/**
 * Carga una subcolección (chronology, pendingTasks).
 */
const loadSubCollection = async (opId, subColl, listId, sortFn, renderFn) => {
    const ul = document.getElementById(listId);
    if (!ul) return;
    ul.innerHTML = '';
    if (!userId) return;
    try {
        const q = query(collection(db, `artifacts/${appId}/operations`, opId, subColl));
        const snaps = await getDocs(q);
        let items = snaps.docs.map(d=>({ id: d.id, ...d.data() }));
        items.sort(sortFn);
        items.forEach(item => ul.insertAdjacentHTML('beforeend', renderFn(item)));
    } catch(e) {
        console.error(e);
    }
};

/**
 * Añade un elemento a subcolección.
 */
const addRelatedItem = async (subCollName, data, listElementId, renderFunc) => {
    if (!currentDocId) {
        showStatus("Guarda primero la operación principal.", true);
        return;
    }
    if (!userId) {
        showStatus("Usuario no autenticado.", true);
        return;
    }
    showSpinner(true);
    try {
        const subColRef = collection(db, `artifacts/${appId}/operations`, currentDocId, subCollName);
        const docRef = await addDoc(subColRef, { ...data, createdAt: serverTimestamp() });
        const ul = document.getElementById(listElementId);
        ul.insertAdjacentHTML('beforeend', renderFunc({ id: docRef.id, ...data }));
    } catch(e) {
        console.error(e);
        showStatus(`Error al añadir elemento: ${e.message}`, true);
    } finally {
        showSpinner(false);
    }
};

/**
 * Añade pendiente al form de operación.
 */
const addPendingTaskToOperation = async () => {
    const desc = document.getElementById('pendDesc').value.trim();
    const fecha = document.getElementById('pendDate').value;
    if (!desc) {
        showStatus("Descripción obligatoria.", true);
        return;
    }
    await addRelatedItem('pendingTasks', { descripcion: desc, fechaLimite: fecha, estado: 'Pendiente', operationId: currentDocId }, 'pendingList', item => `
        <li class="flex justify-between items-center ${new Date(item.fechaLimite) < new Date() && item.estado!=='Completado'?'text-red-500':''}">
            <span>${item.descripcion} (Vence: ${item.fechaLimite})</span>
            ${item.estado!=='Completado'
                ? `<button data-task-id="${item.id}" class="complete-task-btn text-white bg-green-500 px-2 py-1 rounded">Hecho</button>`
                : `<span class="text-green-600">(Completado)</span>`
            }
        </li>
    `);
    document.getElementById('pendDesc').value = '';
    document.getElementById('pendDate').value = '';
    document.querySelectorAll('.complete-task-btn').forEach(btn=>
        btn.addEventListener('click', ()=>completePendingTask(btn.dataset.taskId, true))
    );
};

/**
 * Marca una tarea como completada.
 */
const completePendingTask = async (taskId, fromOpForm = false) => {
    if (!taskId) return;
    showSpinner(true);
    try {
        if (!userId) {
            showStatus("Usuario no autenticado.", true);
            return;
        }
        if (fromOpForm && currentDocId) {
            const ref = doc(db, `artifacts/${appId}/operations`, currentDocId, "pendingTasks", taskId);
            await setDoc(ref, { estado: 'Completado' }, { merge: true });
            await loadSubCollection(currentDocId, 'pendingTasks', 'pendingList', (a,b)=>new Date(a.fechaLimite)-new Date(b.fechaLimite), item => `
                <li class="flex justify-between items-center ${new Date(item.fechaLimite)<new Date()&&item.estado!=='Completado'?'text-red-500':''}">
                    <span>${item.descripcion} (Vence: ${item.fechaLimite})</span>
                    ${item.estado!=='Completado'
                        ? `<button data-task-id="${item.id}" class="complete-task-btn text-white bg-green-500 px-2 py-1 rounded">Hecho</button>`
                        : `<span class="text-green-600">(Completado)</span>`
                    }
                </li>
            `);
            document.querySelectorAll('.complete-task-btn').forEach(btn=>
                btn.addEventListener('click', ()=>completePendingTask(btn.dataset.taskId, true))
            );
        } else {
            const ref = doc(db, `artifacts/${appId}/pendingTasks`, taskId);
            await setDoc(ref, { estado: 'Completado' }, { merge: true });
            fetchGlobalPendingTasks();
        }
        showStatus("Tarea completada.", false);
    } catch(e) {
        console.error(e);
        showStatus(`Error al completar: ${e.message}`, true);
    } finally {
        showSpinner(false);
    }
};

/**
 * Obtiene tareas pendientes globales.
 */
const fetchGlobalPendingTasks = async () => {
    const tbody = document.getElementById('globalPendingTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    showSpinner(true);
    try {
        if (!userId) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-500">Autenticando usuario...</td></tr>';
            return;
        }
        const q = query(collection(db, `artifacts/${appId}/pendingTasks`), where("estado","==","Pendiente"));
        const snaps = await getDocs(q);
        let tasks = snaps.docs.map(d=>({ id: d.id, ...d.data() }));
        tasks.sort((a,b)=>new Date(a.fechaLimite)-new Date(b.fechaLimite));

        const opCache = {};
        for (const task of tasks) {
            let opId = task.operationId;
            let opLabel = '- General -';
            if (opId) {
                if (!opCache[opId]) {
                    const ref = doc(db, `artifacts/${appId}/operations`, opId);
                    const snapOp = await getDoc(ref);
                    if (snapOp.exists()) {
                        const od = snapOp.data();
                        opCache[opId] = `${od.grupo} ${od.codigo||'N/A'}/${od.anio||'N/A'}`;
                    } else {
                        opCache[opId] = 'Operación borrada';
                    }
                }
                opLabel = opCache[opId];
            }
            const isOver = new Date(task.fechaLimite) < new Date();
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap ${isOver?'text-red-600 font-bold':''}">${task.descripcion}</td>
                <td class="px-6 py-4 whitespace-nowrap ${isOver?'text-red-600':''}">${task.fechaLimite}</td>
                <td class="px-6 py-4 whitespace-nowrap">${opLabel}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <button data-task-id="${task.id}" class="complete-global-task-btn text-green-600 hover:text-green-900">Marcar Hecho</button>
                </td>
            `;
            tbody.appendChild(row);
        }
        document.querySelectorAll('.complete-global-task-btn').forEach(btn=>
            btn.addEventListener('click', ()=>completePendingTask(btn.dataset.taskId, false))
        );
    } catch(e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-red-500">Error: ${e.message}</td></tr>`;
    } finally {
        showSpinner(false);
    }
};

/**
 * Añade tarea global.
 */
const addGeneralPendingTask = async () => {
    const desc  = document.getElementById('newTaskDesc').value.trim();
    const fecha = document.getElementById('newTaskDate').value;
    if (!desc) {
        showStatus("Descripción obligatoria.", true);
        return;
    }
    if (!userId) {
        showStatus("Usuario no autenticado.", true);
        return;
    }
    showSpinner(true);
    try {
        await addDoc(collection(db, `artifacts/${appId}/pendingTasks`), {
            descripcion: desc,
            fechaLimite: fecha,
            estado: 'Pendiente',
            createdAt: serverTimestamp(),
            operationId: null
        });
        showStatus("Tarea añadida.", false);
        document.getElementById('newTaskDesc').value = '';
        document.getElementById('newTaskDate').value = '';
        fetchGlobalPendingTasks();
    } catch(e) {
        console.error(e);
        showStatus(`Error al añadir: ${e.message}`, true);
    } finally {
        showSpinner(false);
    }
};

/**
 * Genera un informe sencillo de la operación cargada en el formulario.
 */
const generateOperationReport = () => {
    const data = {
        codigo: document.getElementById('codigo')?.value.trim(),
        anio: document.getElementById('anio')?.value.trim(),
        nombre: document.getElementById('nombreOperacion')?.value.trim(),
        descripcion: document.getElementById('descripcionBreve')?.value.trim(),
        fechaInicio: document.getElementById('fechaInicioOperacion')?.value,
        origen: document.getElementById('origen')?.value.trim(),
        tipologia: document.getElementById('tipologiaDelictiva')?.value.trim(),
        juzgadoInicial: document.getElementById('juzgadoInicialField')?.value.trim()
    };

    const chronology = Array.from(document.querySelectorAll('#chronologyList li'))
        .map(li => li.textContent);
    const pending = Array.from(document.querySelectorAll('#pendingList li'))
        .map(li => li.textContent);

    let html = `<h1>Informe de Operación</h1>`;
    if (data.nombre) html += `<h2>${data.nombre}</h2>`;
    html += `<p><strong>Código:</strong> ${data.codigo||''}/${data.anio||''}</p>`;
    if (data.descripcion) html += `<p><strong>Descripción:</strong> ${data.descripcion}</p>`;
    if (data.origen) html += `<p><strong>Origen:</strong> ${data.origen}</p>`;
    if (data.tipologia) html += `<p><strong>Tipología:</strong> ${data.tipologia}</p>`;
    if (data.fechaInicio) html += `<p><strong>Fecha Inicio:</strong> ${data.fechaInicio}</p>`;
    if (data.juzgadoInicial) html += `<p><strong>Juzgado Inicial:</strong> ${data.juzgadoInicial}</p>`;

    if (chronology.length) {
        html += '<h3>Cronología</h3><ul>' +
            chronology.map(c => `<li>${c}</li>`).join('') + '</ul>';
    }
    if (pending.length) {
        html += '<h3>Tareas Pendientes</h3><ul>' +
            pending.map(p => `<li>${p}</li>`).join('') + '</ul>';
    }

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(`<!DOCTYPE html><html><head><title>Informe</title>` +
            `<style>body{font-family:Arial,sans-serif;padding:20px;}h1,h2,h3{margin-top:1em;}</style>` +
            `</head><body>${html}</body></html>`);
        win.document.close();
        win.focus();
    } else {
        alert('No se pudo abrir la ventana de informe.');
    }
};

/**
 * Genera estadísticas.
 */
const generateStats = async () => {
    const resultDiv = document.getElementById('statsResult');
    if (!resultDiv) return;
    resultDiv.innerHTML = '';
    const start = document.getElementById('startDate').value;
    const end   = document.getElementById('endDate').value;
    if (!start || !end) {
        showStatus("Selecciona rango de fechas.", true);
        return;
    }
    if (!userId) {
        showStatus("Usuario no autenticado.", true);
        return;
    }
    showSpinner(true);
    try {
        const sDt = new Date(start);
        const eDt = new Date(end);
        eDt.setHours(23,59,59,999);

        // Recolectar colecciones de datos
        const cols = Object.values(groups).filter(g=>g.collection && g.collection!=='estadistica').map(g=>g.collection);
        const uniqueCols = [...new Set(cols)];
        const stats = {};
        Object.values(groups).forEach(g=>{
            if (g.name!=='Estadística') stats[g.name] = 0;
        });
        let total = 0;

        for (const colName of uniqueCols) {
            const q = query(
                collection(db, `artifacts/${appId}/${colName}`),
                where("fecha", ">=", sDt),
                where("fecha", "<=", eDt)
            );
            const snaps = await getDocs(q);
            snaps.forEach(d=>{
                const data = d.data();
                let gName = data.grupo || Object.values(groups).find(gr=>gr.collection===colName)?.name;
                if (gName) {
                    stats[gName] = (stats[gName]||0) + 1;
                    total++;
                }
            });
        }

        // Construir tabla
        let tbl = `<table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-50"><tr>
            <th class="px-6 py-3">Grupo</th><th class="px-6 py-3">Registros</th>
        </tr></thead><tbody class="bg-white divide-y divide-gray-200">`;

        Object.keys(stats).sort().forEach(gName=>{
            tbl += `<tr>
                <td class="px-6 py-4">${gName}</td>
                <td class="px-6 py-4">${stats[gName]}</td>
            </tr>`;
        });
        tbl += `<tr class="font-bold bg-gray-100">
            <td class="px-6 py-4">Total</td>
            <td class="px-6 py-4">${total}</td>
        </tr></tbody></table>`;

        resultDiv.innerHTML = tbl;
    } catch(e) {
        console.error(e);
        resultDiv.innerHTML = `<p class="text-red-500">Error: ${e.message}</p>`;
    } finally {
        showSpinner(false);
    }
};

/**
 * Renderiza la vista de estadísticas.
 */
const renderStatistics = () => {
    currentView = 'statistics';
    const today = new Date();
    const weekAgo = new Date(); weekAgo.setDate(today.getDate()-7);

    const html = `
    <div class="max-w-4xl mx-auto p-4 space-y-6">
        <div class="bg-white p-4 rounded shadow border-blue-300 border space-y-4">
            <h3 class="text-xl font-bold">Consultar Estadísticas</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div><label>Desde</label><input type="date" id="startDate" class="w-full rounded border px-2 py-1" value="${formatDate(weekAgo)}"></div>
                <div><label>Hasta</label><input type="date" id="endDate" class="w-full rounded border px-2 py-1" value="${formatDate(today)}"></div>
                <button id="statsBtn" class="bg-blue-600 text-white px-4 py-2 rounded">Generar Estadísticas</button>
            </div>
            <div id="statsResult" class="mt-4"></div>
        </div>

        <div class="bg-white p-4 rounded shadow border-blue-300 border space-y-4">
            <h3 class="text-xl font-bold">Listado Global de Pendientes</h3>
            <div class="overflow-x-auto max-h-96 p-2 border rounded">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50"><tr>
                        <th class="px-6 py-3">Tarea</th>
                        <th class="px-6 py-3">Vence</th>
                        <th class="px-6 py-3">Operación</th>
                        <th class="px-6 py-3">Acción</th>
                    </tr></thead>
                    <tbody id="globalPendingTableBody" class="bg-white divide-y divide-gray-200"></tbody>
                </table>
            </div>
        </div>

        <div class="bg-white p-4 rounded shadow border-blue-300 border space-y-4">
            <h3 class="text-xl font-bold">Añadir Tarea Pendiente General</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <input type="text" id="newTaskDesc" placeholder="Descripción" class="rounded border px-2 py-1">
                <input type="date" id="newTaskDate" class="rounded border px-2 py-1">
                <button id="addTaskBtn" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
            </div>
        </div>
    </div>
    `;
    mainContent().innerHTML = html;

    document.getElementById('statsBtn').addEventListener('click', generateStats);
    document.getElementById('addTaskBtn').addEventListener('click', addGeneralPendingTask);
    fetchGlobalPendingTasks();
};

// =======================
// == Auth & Init ==
// =======================

const showAuthError = (error) => {
    mainContent().innerHTML = `
        <div class="text-center text-red-500 p-8">
            <h2 class="text-xl font-bold">Error de Autenticación</h2>
            <p>${error.message}</p>
        </div>`;
};

const init = () => {
    try {
        initFirebase();
        onAuthStateChanged(auth, async user => {
            if (user) {
                userId = user.uid;
                renderMenu();
            } else {
                try {
                    if (typeof __initial_auth_token !== 'undefined') {
                        await signInWithCustomToken(auth, __initial_auth_token);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch(e) {
                    console.error(e);
                    showAuthError(e);
                }
            }
        });
    } catch(e) {
        console.error("Error init:", e);
        showStatus(`Error al iniciar app: ${e.message}`, true);
    }
    backButton().addEventListener('click', renderMenu);
};

document.addEventListener('DOMContentLoaded', init);
