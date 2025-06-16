import { initFirebase, db, auth } from './firebase.js';
import { signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, doc, addDoc, setDoc, getDoc, getDocs, query, where, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatDate, formatDateTime, showSpinner, showStatus, removeDynamicItem } from './utils.js';

// --- Firebase Configuration ---
// Your Firebase project configuration provided by the user.
// Global variables for app_id and userId
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
let userId = null; // Will be set after authentication

// --- App State ---
let currentView = 'menu';
let currentGroup = null; // Key of the current group (e.g., 'grupo1', 'grupo2')
let currentDocId = null; // ID of the current operation/actuation being edited

// --- UI Elements ---
const mainContent = () => document.getElementById('main-content');
const headerTitle = () => document.getElementById('header-title');
const backButton = () => document.getElementById('back-button');

// --- Group Definitions and their associated Firestore Collections ---
// Each group is mapped to a specific Firestore collection for its data.
const groups = {
    'grupo1': { name: 'Grupo 1', description: 'Expulsiones', icon: '🚷', collection: 'expulsiones' },
    'grupo2': { name: 'Grupo 2', description: 'Investigación', icon: '🕵️‍♂️', collection: 'operaciones' },
    'grupo3': { name: 'Grupo 3', description: 'Operativo', icon: '👮‍♂️', collection: 'operaciones' }, // Same collection as Grupo 2
    'grupo4': { name: 'Grupo 4', description: 'Operativo', icon: '👮‍♂️', collection: 'grupo4Operaciones' },
    'puerto': { name: 'Puerto', description: 'Controles y actuaciones', icon: '⚓', collection: 'puertoControles' },
    'cie': { name: 'CIE', description: 'Centro de Internamiento', icon: '🏢', collection: 'cieInternamiento' },
    'gestion': { name: 'Gestión', description: 'Asilos, cartas, trámites', icon: '🗂️', collection: 'gestionTramites' },
    'estadistica': { name: 'Estadística', description: 'Datos y pendientes', icon: '📊', collection: null }, // No dedicated collection
    'cecorex': { name: 'CECOREX', description: 'Centro Coordinación', icon: '📞', collection: 'cecorexCoordinacion' }
};

// Expose the helper to HTML
window.removeDynamicItem = removeDynamicItem;

// --- FIRESTORE GENERIC FUNCTIONS ---

/**
 * Saves data to a specified Firestore collection.
 * @param {string} collectionName - The name of the Firestore collection.
 * @param {object} data - The data object to save.
 * @param {string|null} docId - The ID of the document to update, or null for a new document.
 * @returns {string} The ID of the saved document.
 */
const saveData = async (collectionName, data, docId = null) => {
    if (!userId) {
        showStatus('Error: Usuario no autenticado para guardar datos. Recargue o revise Firebase.', true);
        throw new Error("User not authenticated.");
    }
    try {
        const userCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/${collectionName}`);
        if (docId) {
            await setDoc(doc(userCollectionRef, docId), { ...data, updatedAt: serverTimestamp() }, { merge: true });
            return docId;
        } else {
            const docRef = await addDoc(userCollectionRef, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            return docRef.id;
        }
    } catch (e) {
        console.error(`Error al guardar en ${collectionName}: `, e);
        showStatus(`Error al guardar: ${e.message}. Verifique reglas de seguridad.`, true);
        throw e;
    }
};

/**
 * Loads data from a specified Firestore document.
 * @param {string} collectionName - The name of the Firestore collection.
 * @param {string} docId - The ID of the document to load.
 * @returns {object|null} The document data, or null if not found.
 */
const loadData = async (collectionName, docId) => {
    if (!userId) {
        showStatus('Error: Usuario no autenticado para cargar datos. Recargue o revise Firebase.', true);
        throw new Error("User not authenticated.");
    }
    try {
        const docRef = doc(db, `artifacts/${appId}/users/${userId}/${collectionName}`, docId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data();
        } else {
            return null;
        }
    } catch (e) {
        console.error(`Error al cargar desde ${collectionName}: `, e);
        showStatus(`Error al cargar: ${e.message}. Verifique reglas de seguridad.`, true);
        throw e;
    }
};

/**
 * Fetches data for a specific group to populate a select dropdown.
 * @param {string} collectionName - The name of the Firestore collection.
 * @param {string} opListElementId - The ID of the <select> element.
 * @param {string} displayField1 - The primary field to display in the option text.
 * @param {string|null} displayField2 - A secondary field to display (e.g., year).
 * @param {string|null} groupFilter - Optional field to filter by 'grupo' if using a shared collection like 'operaciones'.
 */
const fetchDataForSelect = async (collectionName, opListElementId, displayField1, displayField2 = null, groupFilter = null) => {
    if (!userId) {
        // showStatus('ID de Usuario no disponible. Verifique la autenticación o recargue la página.', true);
        console.warn(`fetchDataForSelect: userId no disponible para ${collectionName}.`);
        return;
    }
    const opList = document.getElementById(opListElementId);
    if (!opList) return;
    opList.innerHTML = '<option value="">-- Seleccionar para cargar --</option>';
    showSpinner(true);
    try {
        let q = collection(db, `artifacts/${appId}/users/${userId}/${collectionName}`);
        // If there's a group filter (like for 'operaciones' collection shared by G2/G3)
        if (groupFilter) {
            q = query(q, where("grupo", "==", groups[groupFilter].name));
        }
        const querySnapshot = await getDocs(q);
        let fetchedDocs = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Sort by createdAt descending in memory
        fetchedDocs.sort((a, b) => {
            const dateA = a.createdAt ? (a.createdAt instanceof Timestamp ? a.createdAt.toDate() : new Date(a.createdAt)) : new Date(0);
            const dateB = b.createdAt ? (b.createdAt instanceof Timestamp ? b.createdAt.toDate() : new Date(b.createdAt)) : new Date(0);
            return dateB - dateA;
        });

        fetchedDocs.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.id;
            let text = doc[displayField1] || 'Sin nombre';
            if (displayField2 && doc[displayField2]) {
                text += ` (${doc[displayField2]})`;
            }
            if (doc.codigo) { // Add code/year for operations
                text = `${doc.codigo}/${doc.anio} - ${text}`;
            }
            option.textContent = text.substring(0, 100) + (text.length > 100 ? '...' : '');
            opList.appendChild(option);
        });

    } catch(e) {
        console.error(`Error fetching data for select from ${collectionName}: `, e);
        showStatus(`Error al cargar listado: ${e.message}.`, true);
    } finally {
        showSpinner(false);
    }
};

/**
 * Gets the next sequential code for a new operation within a group and year.
 * Fetches all documents and sorts in memory.
 * @param {string} collectionName - The name of the Firestore collection (e.g., 'operaciones').
 * @param {string} groupName - The name of the group (e.g., 'Grupo 2').
 * @param {number} year - The current year.
 * @returns {number} The next available code.
 */
const getNextCode = async (collectionName, groupName, year) => {
    if (!userId) {
        console.error("getNextCode: userId no disponible.");
        return 1;
    }
    const q = query(
        collection(db, `artifacts/${appId}/users/${userId}/${collectionName}`),
        where("grupo", "==", groupName),
        where("anio", "==", year)
    );
    const querySnapshot = await getDocs(q);
    let codes = [];
    querySnapshot.forEach(doc => {
        const data = doc.data();
        if (data.codigo) {
            codes.push(Number(data.codigo));
        }
    });
    codes.sort((a, b) => b - a); // Sort numerically in descending order
    return codes.length === 0 ? 1 : codes[0] + 1;
};


// --- DYNAMIC LIST HELPERS (for generating and getting data from dynamic input fields) ---

/**
 * Generic function to add a dynamic item row to a container.
 * The `fields` array defines { idPrefix, label, type, placeholder, valueField, colSpan }
 * @param {HTMLElement} container - The DOM element where items are added.
 * @param {Array<Object>} fields - Array defining the input fields for this item.
 * @param {Object} data - Initial data to populate the fields.
 */
const addDynamicItem = (container, fields, data = {}) => {
    const div = document.createElement('div');
    div.className = 'dynamic-list-item';
    
    let innerHTML = '';
    fields.forEach(field => {
        const value = data[field.valueField] !== undefined ? data[field.valueField] : '';
        const displayValue = field.type === 'date' ? formatDate(value) : value;
        let inputElement;
        if (field.type === 'textarea') {
            inputElement = `<textarea rows="${field.rows || 2}" class="${field.idPrefix}-item w-full px-2 py-1 border rounded" placeholder="${field.placeholder || ''}">${displayValue}</textarea>`;
        } else if (field.type === 'select') {
            inputElement = `<select class="${field.idPrefix}-item w-full px-2 py-1 border rounded">`;
            field.options.forEach(option => {
                inputElement += `<option value="${option}" ${displayValue === option ? 'selected' : ''}>${option}</option>`;
            });
            inputElement += `</select>`;
        } else {
            inputElement = `<input type="${field.type || 'text'}" class="${field.idPrefix}-item w-full px-2 py-1 border rounded" value="${displayValue}" placeholder="${field.placeholder || ''}">`;
        }
        
        innerHTML += `
            <div class="flex-1 ${field.colSpan ? `md:col-span-${field.colSpan}` : ''}">
                <label class="block text-gray-700 text-xs font-medium mb-1">${field.label}:</label>
                ${inputElement}
            </div>
        `;
    });

    div.innerHTML = `
        ${innerHTML}
        <button type="button" class="bg-red-500 text-white text-xs px-3 py-1 rounded hover:bg-red-600" onclick="removeDynamicItem(this)">Eliminar</button>
    `;
    container.appendChild(div);
};

/**
 * Generic function to get data from dynamic item rows in a container.
 * @param {HTMLElement} container - The DOM element containing the items.
 * @param {Array<Object>} fields - Array defining the input fields for this item.
 * @returns {Array<Object>} An array of objects, each representing a dynamic item.
 */
const getDynamicItems = (container, fields) => {
    const items = [];
    container.querySelectorAll('.dynamic-list-item').forEach(itemDiv => {
        const item = {};
        let hasContent = false;
        fields.forEach(field => {
            let inputElement;
            if (field.type === 'textarea') {
                inputElement = itemDiv.querySelector(`textarea.${field.idPrefix}-item`);
            } else if (field.type === 'select') {
                inputElement = itemDiv.querySelector(`select.${field.idPrefix}-item`);
            } else {
                inputElement = itemDiv.querySelector(`input.${field.idPrefix}-item`);
            }
            
            if (inputElement) {
                item[field.valueField] = inputElement.value.trim();
                if (item[field.valueField]) hasContent = true;
            }
        });
        if (hasContent) {
            items.push(item);
        }
    });
    return items;
};

// --- Specific Dynamic List Helpers for Groups 2/3 ---

const addDiligenciaPreviasJuzgados = (data = {}) => {
    const container = document.getElementById('diligenciasPreviasJuzgadosContainer');
    if (!container) return;
    addDynamicItem(container, [
        { idPrefix: 'dpjFecha', label: 'Fecha', type: 'date', valueField: 'fecha' },
        { idPrefix: 'dpjJuzgado', label: 'Juzgado', valueField: 'juzgado' }
    ], data);
};
window.addDiligenciaPreviasJuzgados = addDiligenciaPreviasJuzgados;

const getDiligenciasPreviasJuzgados = () => {
    const container = document.getElementById('diligenciasPreviasJuzgadosContainer');
    if (!container) return [];
    return getDynamicItems(container, [
        { idPrefix: 'dpjFecha', valueField: 'fecha' },
        { idPrefix: 'dpjJuzgado', valueField: 'juzgado' }
    ]);
};
window.getDiligenciasPreviasJuzgados = getDiligenciasPreviasJuzgados;

const addHistoricoInhibicion = (data = {}) => {
    const container = document.getElementById('historicoInhibicionesContainer');
    if (!container) return;
    addDynamicItem(container, [
        { idPrefix: 'inhibJuzgado', label: 'Juzgado Inhibido', valueField: 'juzgado' },
        { idPrefix: 'inhibFecha', label: 'Fecha Inhibición', type: 'date', valueField: 'fecha' }
    ], data);
};
window.addHistoricoInhibicion = addHistoricoInhibicion;

const getHistoricoInhibiciones = () => {
    const container = document.getElementById('historicoInhibicionesContainer');
    if (!container) return [];
    return getDynamicItems(container, [
        { idPrefix: 'inhibJuzgado', valueField: 'juzgado' },
        { idPrefix: 'inhibFecha', valueField: 'fecha' }
    ]);
};
window.getHistoricoInhibiciones = getHistoricoInhibiciones;

const addHistoricoGeneralJuzgados = (data = {}) => {
    const container = document.getElementById('historicoGeneralJuzgadosContainer');
    if (!container) return;
    addDynamicItem(container, [
        { idPrefix: 'hgJFecha', label: 'Fecha Evento', type: 'date', valueField: 'fecha' },
        { idPrefix: 'hgJJuzgado', label: 'Juzgado Relacionado', valueField: 'juzgado' },
        { idPrefix: 'hgJEvento', label: 'Descripción del Evento', valueField: 'evento', colSpan: 2 }
    ], data);
};
window.addHistoricoGeneralJuzgados = addHistoricoGeneralJuzgados;

const getHistoricoGeneralJuzgados = () => {
    const container = document.getElementById('historicoGeneralJuzgadosContainer');
    if (!container) return [];
    return getDynamicItems(container, [
        { idPrefix: 'hgJFecha', valueField: 'fecha' },
        { idPrefix: 'hgJJuzgado', valueField: 'juzgado' },
        { idPrefix: 'hgJEvento', valueField: 'evento' }
    ]);
};
window.getHistoricoGeneralJuzgados = getHistoricoGeneralJuzgados;

const addIntervencionTelefonica = (data = {}) => {
    const container = document.getElementById('intervencionesTelefonicasContainer');
    if (!container) return;
    addDynamicItem(container, [
        { idPrefix: 'itDesc', label: 'Descripción', valueField: 'descripcion', colSpan: 2 }
    ], data);
};
window.addIntervencionTelefonica = addIntervencionTelefonica;

const getIntervencionesTelefonicas = () => {
    const container = document.getElementById('intervencionesTelefonicasContainer');
    if (!container) return [];
    return getDynamicItems(container, [
        { idPrefix: 'itDesc', valueField: 'descripcion' }
    ]);
};
window.getIntervencionesTelefonicas = getIntervencionesTelefonicas;

const addEntradaYRegistro = (data = {}) => {
    const container = document.getElementById('entradasYRegistrosContainer');
    if (!container) return;
    addDynamicItem(container, [
        { idPrefix: 'eyrDesc', label: 'Descripción', valueField: 'descripcion', colSpan: 2 }
    ], data);
};
window.addEntradaYRegistro = addEntradaYRegistro;

const getEntradasYRegistros = () => {
    const container = document.getElementById('entradasYRegistrosContainer');
    if (!container) return [];
    return getDynamicItems(container, [
        { idPrefix: 'eyrDesc', valueField: 'descripcion' }
    ]);
};
window.getEntradasYRegistros = getEntradasYRegistros;

const addSolicitudJudicial = (data = {}) => {
    const container = document.getElementById('solicitudesJudicialesContainer');
    if (!container) return;
    addDynamicItem(container, [
        { idPrefix: 'sjTipo', label: 'Tipo', valueField: 'tipo' },
        { idPrefix: 'sjDesc', label: 'Descripción', valueField: 'descripcion', colSpan: 2 }
    ], data);
};
window.addSolicitudJudicial = addSolicitudJudicial;

const getSolicitudesJudiciales = () => {
    const container = document.getElementById('solicitudesJudicialesContainer');
    if (!container) return [];
    return getDynamicItems(container, [
        { idPrefix: 'sjTipo', valueField: 'tipo' },
        { idPrefix: 'sjDesc', valueField: 'descripcion' }
    ]);
};
window.getSolicitudesJudiciales = getSolicitudesJudiciales;

const addColaboracion = (data = {}) => {
    const container = document.getElementById('colaboracionesContainer');
    if (!container) return;
    addDynamicItem(container, [
        { idPrefix: 'colaboracionFecha', label: 'Fecha', type: 'date', valueField: 'fecha' },
        { idPrefix: 'colaboracionGrupoInstitucion', label: 'Grupo/Institución', valueField: 'grupoInstitucion' },
        { idPrefix: 'colaboracionTipo', label: 'Tipo de Colaboración', valueField: 'tipoColaboracion' }
    ], data);
};
window.addColaboracion = addColaboracion;

const getColaboraciones = () => {
    const container = document.getElementById('colaboracionesContainer');
    if (!container) return [];
    return getDynamicItems(container, [
        { idPrefix: 'colaboracionFecha', valueField: 'fecha' },
        { idPrefix: 'colaboracionGrupoInstitucion', valueField: 'grupoInstitucion' },
        { idPrefix: 'colaboracionTipo', valueField: 'tipoColaboracion' }
    ]);
};
window.getColaboraciones = getColaboraciones;

const addDetenido = (data = {}) => {
    const container = document.getElementById('detenidosContainer');
    if (!container) return;
    addDynamicItem(container, [
        { idPrefix: 'detFiliacion', label: 'Filiación Delito', valueField: 'filiacionDelito' },
        { idPrefix: 'detNac', label: 'Nacionalidad', valueField: 'nacionalidad' },
        { idPrefix: 'detFecha', label: 'Fecha Detención', type: 'date', valueField: 'fechaDetencion' },
        { idPrefix: 'detOrdinal', label: 'Ordinal', valueField: 'ordinal' }
    ], data);
};
window.addDetenido = addDetenido;

const getDetenidos = () => {
    const container = document.getElementById('detenidosContainer');
    if (!container) return [];
    return getDynamicItems(container, [
        { idPrefix: 'detFiliacion', valueField: 'filiacionDelito' },
        { idPrefix: 'detNac', valueField: 'nacionalidad' },
        { idPrefix: 'detFecha', valueField: 'fechaDetencion' },
        { idPrefix: 'detOrdinal', valueField: 'ordinal' }
    ]);
};
window.getDetenidos = getDetenidos;

const addDetenidoPrevisto = (data = {}) => {
    const container = document.getElementById('detenidosPrevistosContainer');
    if (!container) return;
    addDynamicItem(container, [
        { idPrefix: 'detPrevFiliacion', label: 'Filiación Delito', valueField: 'filiacionDelito' },
        { idPrefix: 'detPrevNac', label: 'Nacionalidad', valueField: 'nacionalidad' },
        { idPrefix: 'detPrevFecha', label: 'Fecha Prevista', type: 'date', valueField: 'fechaDetencion' },
        { idPrefix: 'detPrevOrdinal', label: 'Ordinal', valueField: 'ordinal' }
    ], data);
};
window.addDetenidoPrevisto = addDetenidoPrevisto;

const getDetenidosPrevistos = () => {
    const container = document.getElementById('detenidosPrevistosContainer');
    if (!container) return [];
    return getDynamicItems(container, [
        { idPrefix: 'detPrevFiliacion', valueField: 'filiacionDelito' },
        { idPrefix: 'detPrevNac', valueField: 'nacionalidad' },
        { idPrefix: 'detPrevFecha', valueField: 'fechaDetencion' },
        { idPrefix: 'detPrevOrdinal', valueField: 'ordinal' }
    ]);
};
window.getDetenidosPrevistos = getDetenidosPrevistos;

const addOtraPersona = (data = {}) => {
    const container = document.getElementById('otrasPersonasContainer');
    if (!container) return;
    addDynamicItem(container, [
        { idPrefix: 'otraFiliacion', label: 'Filiación', valueField: 'filiacion' },
        { idPrefix: 'otraTipo', label: 'Tipo de Vinculación', valueField: 'tipoVinculacion' },
        { idPrefix: 'otraNac', label: 'Nacionalidad', valueField: 'nacionalidad' },
        { idPrefix: 'otraTelefono', label: 'Teléfono', valueField: 'telefono' }
    ], data);
};
window.addOtraPersona = addOtraPersona;

const getOtrasPersonas = () => {
    const container = document.getElementById('otrasPersonasContainer');
    if (!container) return [];
    return getDynamicItems(container, [
        { idPrefix: 'otraFiliacion', valueField: 'filiacion' },
        { idPrefix: 'otraTipo', valueField: 'tipoVinculacion' },
        { idPrefix: 'otraNac', valueField: 'nacionalidad' },
        { idPrefix: 'otraTelefono', valueField: 'telefono' }
    ]);
};
window.getOtrasPersonas = getOtrasPersonas;
// --- Dynamic Lists for Simplified Group Forms ---

// Helper to add a basic pending task item to an unordered list
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

// Personas implicadas (Grupo 1)
const addPersonaImplicada = (data = {}) => {
    const container = document.getElementById('personasImplicadasContainer');
    if (!container) return;
    addDynamicItem(container, [
        { idPrefix: 'impNombre', label: 'Nombre', valueField: 'nombre' },
        { idPrefix: 'impNac', label: 'Nacionalidad', valueField: 'nacionalidad' },
        { idPrefix: 'impFechaExp', label: 'Fecha Expulsión', type: 'date', valueField: 'fechaExpulsion' }
    ], data);
};
window.addPersonaImplicada = addPersonaImplicada;

const getPersonasImplicadas = () => {
    const container = document.getElementById('personasImplicadasContainer');
    if (!container) return [];
    return getDynamicItems(container, [
        { idPrefix: 'impNombre', valueField: 'nombre' },
        { idPrefix: 'impNac', valueField: 'nacionalidad' },
        { idPrefix: 'impFechaExp', valueField: 'fechaExpulsion' }
    ]);
};
window.getPersonasImplicadas = getPersonasImplicadas;

const addGrupoPendiente = (data = {}) => {
    const descInput = document.getElementById('gpPendDesc');
    const dateInput = document.getElementById('gpPendDate');
    const desc = data.descripcion || (descInput ? descInput.value.trim() : '');
    const fecha = data.fechaLimite ? formatDate(data.fechaLimite) : (dateInput ? dateInput.value : '');
    addBasicListItem('grupoPendientesList', desc, fecha);
    if (!data.descripcion && descInput) descInput.value = '';
    if (!data.descripcion && dateInput) dateInput.value = '';
};
window.addGrupoPendiente = addGrupoPendiente;

const getGrupoPendientes = () => getBasicListItems('grupoPendientesList');
window.getGrupoPendientes = getGrupoPendientes;

// Personas implicadas (Grupo 4)
const addPersonaImplicadaG4 = (data = {}) => {
    const container = document.getElementById('personasImplicadasG4Container');
    if (!container) return;
    addDynamicItem(container, [
        { idPrefix: 'impG4Nombre', label: 'Nombre', valueField: 'nombre' },
        { idPrefix: 'impG4Rol', label: 'Rol', valueField: 'rol' }
    ], data);
};
window.addPersonaImplicadaG4 = addPersonaImplicadaG4;

const getPersonasImplicadasG4 = () => {
    const container = document.getElementById('personasImplicadasG4Container');
    if (!container) return [];
    return getDynamicItems(container, [
        { idPrefix: 'impG4Nombre', valueField: 'nombre' },
        { idPrefix: 'impG4Rol', valueField: 'rol' }
    ]);
};
window.getPersonasImplicadasG4 = getPersonasImplicadasG4;

const addGrupo4Pendiente = (data = {}) => {
    const descInput = document.getElementById('gp4PendDesc');
    const dateInput = document.getElementById('gp4PendDate');
    const desc = data.descripcion || (descInput ? descInput.value.trim() : '');
    const fecha = data.fechaLimite ? formatDate(data.fechaLimite) : (dateInput ? dateInput.value : '');
    addBasicListItem('grupo4PendientesList', desc, fecha);
    if (!data.descripcion && descInput) descInput.value = '';
    if (!data.descripcion && dateInput) dateInput.value = '';
};
window.addGrupo4Pendiente = addGrupo4Pendiente;

const getGrupo4Pendientes = () => getBasicListItems('grupo4PendientesList');
window.getGrupo4Pendientes = getGrupo4Pendientes;

const addPuertoPendiente = (data = {}) => {
    const descInput = document.getElementById('puertoPendDesc');
    const dateInput = document.getElementById('puertoPendDate');
    const desc = data.descripcion || (descInput ? descInput.value.trim() : '');
    const fecha = data.fechaLimite ? formatDate(data.fechaLimite) : (dateInput ? dateInput.value : '');
    addBasicListItem('puertoPendientesList', desc, fecha);
    if (!data.descripcion && descInput) descInput.value = '';
    if (!data.descripcion && dateInput) dateInput.value = '';
};
window.addPuertoPendiente = addPuertoPendiente;

const getPuertoPendientes = () => getBasicListItems('puertoPendientesList');
window.getPuertoPendientes = getPuertoPendientes;

const addCIEPendiente = (data = {}) => {
    const descInput = document.getElementById('ciePendDesc');
    const dateInput = document.getElementById('ciePendDate');
    const desc = data.descripcion || (descInput ? descInput.value.trim() : '');
    const fecha = data.fechaLimite ? formatDate(data.fechaLimite) : (dateInput ? dateInput.value : '');
    addBasicListItem('ciePendientesList', desc, fecha);
    if (!data.descripcion && descInput) descInput.value = '';
    if (!data.descripcion && dateInput) dateInput.value = '';
};
window.addCIEPendiente = addCIEPendiente;

const getCIEPendientes = () => getBasicListItems('ciePendientesList');
window.getCIEPendientes = getCIEPendientes;

const addGestionPendiente = (data = {}) => {
    const descInput = document.getElementById('gestionPendDesc');
    const dateInput = document.getElementById('gestionPendDate');
    const desc = data.descripcion || (descInput ? descInput.value.trim() : '');
    const fecha = data.fechaLimite ? formatDate(data.fechaLimite) : (dateInput ? dateInput.value : '');
    addBasicListItem('gestionPendientesList', desc, fecha);
    if (!data.descripcion && descInput) descInput.value = '';
    if (!data.descripcion && dateInput) dateInput.value = '';
};
window.addGestionPendiente = addGestionPendiente;

const getGestionPendientes = () => getBasicListItems('gestionPendientesList');
window.getGestionPendientes = getGestionPendientes;

const addCecorexPendiente = (data = {}) => {
    const descInput = document.getElementById('cecorexPendDesc');
    const dateInput = document.getElementById('cecorexPendDate');
    const desc = data.descripcion || (descInput ? descInput.value.trim() : '');
    const fecha = data.fechaLimite ? formatDate(data.fechaLimite) : (dateInput ? dateInput.value : '');
    addBasicListItem('cecorexPendientesList', desc, fecha);
    if (!data.descripcion && descInput) descInput.value = '';
    if (!data.descripcion && dateInput) dateInput.value = '';
};
window.addCecorexPendiente = addCecorexPendiente;

const getCecorexPendientes = () => getBasicListItems('cecorexPendientesList');
window.getCecorexPendientes = getCecorexPendientes;

// --- VIEW RENDERING FUNCTIONS ---

/**
 * Renders the main menu with buttons for each group.
 */
const renderMenu = () => {
    currentView = 'menu';
    headerTitle().textContent = 'UCRIF · Menú Principal de Novedades';
    backButton().classList.add('hidden');
    let menuHtml = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-4xl mx-auto p-4 md:p-8">`;
    for (const key in groups) {
        const group = groups[key];
        menuHtml += `
            <button data-group="${key}" class="group-btn flex flex-col items-center justify-start bg-white/80 backdrop-blur-sm border-2 border-slate-200 shadow-lg hover:shadow-xl transition-shadow duration-300 rounded-2xl p-6 text-center text-slate-800 hover:border-blue-500 hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                <span class="text-5xl mb-3">${group.icon}</span>
                <span class="font-bold text-lg">${group.name}</span>
                <span class="text-sm text-slate-500">${group.description}</span>
            </button>
        `;
    }
    menuHtml += `</div>
    <div class="mt-8 text-center text-slate-500 text-sm">
        <p><b>Instrucciones:</b> Pulse en el grupo correspondiente para añadir o revisar novedades.</p>
        <p>(Desarrollado para UCRIF. Optimizado para móvil y escritorio.)</p>
        <p class="mt-4">ID de Usuario: <span id="userIdDisplay">${userId || 'Cargando...'}</span></p>
    </div>
    `;
    mainContent().innerHTML = menuHtml;

    // Update the userIdDisplay after the menu is rendered
    if (document.getElementById('userIdDisplay')) {
        document.getElementById('userIdDisplay').textContent = userId || 'N/A';
    }

    document.querySelectorAll('.group-btn').forEach(btn => {
        btn.addEventListener('click', () => navigateTo(btn.dataset.group));
    });
};

/**
 * Navigates to the appropriate form or view for a given group key.
 * @param {string} groupKey - The key of the group (e.g., 'grupo1', 'estadistica').
 */
const navigateTo = (groupKey) => {
    currentGroup = groupKey;
    headerTitle().textContent = `UCRIF · ${groups[groupKey].name}`;
    backButton().classList.remove('hidden');
    currentDocId = null; // Reset current document ID when navigating to a new group form

    if (groupKey === 'estadistica') {
        renderStatistics();
    } else if (groupKey === 'grupo2' || groupKey === 'grupo3') {
        renderGroup2and3Form(groupKey); // Comprehensive form
    } else {
        renderSpecificGroupForm(groupKey); // Simplified forms for other groups
    }
};

/**
 * Renders a simplified form for groups other than 2 and 3.
 * @param {string} groupKey - The key of the group.
 */
const renderSpecificGroupForm = async (groupKey) => {
    currentView = 'specificForm';
    const group = groups[groupKey];
    const collectionName = group.collection;

    let formFieldsHtml = '';
    let dynamicListAdders = '';
    let dataMapping = {}; // To map form field IDs to data keys

    // Base fields common to many simpler forms (without resumenNovedad and funcionario)
    const commonBaseFields = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
                <label for="fecha" class="block text-sm font-medium text-slate-600">Fecha</label>
                <input type="date" id="fecha" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm">
            </div>
            <div>
                <label for="anio" class="block text-sm font-medium text-slate-600">Año</label>
                <input type="text" id="anio" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm">
            </div>
        </div>
        <div>
            <label for="descripcionBreve" class="block text-sm font-medium text-slate-600">Descripción Breve</label>
            <textarea id="descripcionBreve" rows="2" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
        </div>
    `;

    switch (groupKey) {
        case 'grupo1': // Expulsiones
            formFieldsHtml = `
                ${commonBaseFields}
                <div>
                    <label for="nombreActuacion" class="block text-sm font-medium text-slate-600">Nombre de la Actuación</label>
                    <input type="text" id="nombreActuacion" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm">
                </div>
                <div>
                    <label for="diligenciasActuaciones" class="block text-sm font-medium text-slate-600">Diligencias/Actuaciones Realizadas</label>
                    <textarea id="diligenciasActuaciones" rows="3" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
                </div>
                <h4 class="font-semibold text-slate-700 mt-4 mb-2">Personas Implicadas (Expulsados)</h4>
                <div id="personasImplicadasContainer" class="space-y-2 max-h-60 overflow-y-auto p-2 border rounded"></div>
                <div class="mt-2 pt-2 border-t border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div><label class="block text-sm font-medium">Nombre</label><input type="text" id="impNombre" class="mt-1 w-full rounded-md border-slate-300"></div>
                    <div><label class="block text-sm font-medium">Nacionalidad</label><input type="text" id="impNac" class="mt-1 w-full rounded-md border-slate-300"></div>
                    <div><label class="block text-sm font-medium">Fecha Expulsión</label><input type="date" id="impFechaExp" class="mt-1 w-full rounded-md border-slate-300"></div>
                    <button type="button" class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm w-full" onclick="addPersonaImplicada()">Añadir Persona</button>
                </div>
                <div>
                    <label for="incidenciasResistencias" class="block text-sm font-medium text-slate-600">Incidencias o Resistencias</label>
                    <textarea id="incidenciasResistencias" rows="2" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
                </div>
                <div>
                    <label for="observacionesAnotaciones" class="block text-sm font-medium text-slate-600">Observaciones y Anotaciones</label>
                    <textarea id="observacionesAnotaciones" rows="3" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
                </div>
            `;
            dynamicListAdders = `
                <h4 class="font-semibold text-slate-700 mt-6 mb-2">Pendientes de Gestión</h4>
                <ul id="grupoPendientesList" class="space-y-2 text-sm text-slate-700 list-disc list-inside max-h-40 overflow-y-auto p-2 border rounded"></ul>
                <div class="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div class="md:col-span-1"><label class="block text-sm font-medium">Descripción</label><input type="text" id="gpPendDesc" class="mt-1 w-full rounded-md border-slate-300"></div>
                    <div><label class="block text-sm font-medium">Fecha Límite</label><input type="date" id="gpPendDate" class="mt-1 w-full rounded-md border-slate-300"></div>
                    <button class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm" onclick="addGrupoPendiente()">Añadir Pendiente</button>
                </div>
            `;
            dataMapping = {
                fecha: 'fecha', anio: 'anio', descripcionBreve: 'descripcionBreve',
                nombreActuacion: 'nombreActuacion',
                diligenciasActuaciones: 'diligenciasActuaciones',
                personasImplicadas: getPersonasImplicadas,
                incidenciasResistencias: 'incidenciasResistencias',
                observacionesAnotaciones: 'observacionesAnotaciones',
                grupoPendientes: getGrupoPendientes // For associated pending tasks
            };
            break;
        case 'grupo4': // Operativo (simplified)
            formFieldsHtml = `
                ${commonBaseFields}
                <div>
                    <label for="nombreActuacionG4" class="block text-sm font-medium text-slate-600">Nombre de la Actuación</label>
                    <input type="text" id="nombreActuacionG4" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm">
                </div>
                <div>
                    <label for="diligenciasActuacionesG4" class="block text-sm font-medium text-slate-600">Diligencias o Actuaciones Realizadas</label>
                    <textarea id="diligenciasActuacionesG4" rows="3" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
                </div>
                <h4 class="font-semibold text-slate-700 mt-4 mb-2">Personas Implicadas</h4>
                <div id="personasImplicadasG4Container" class="space-y-2 max-h-60 overflow-y-auto p-2 border rounded"></div>
                <div class="mt-2 pt-2 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div><label class="block text-sm font-medium">Nombre</label><input type="text" id="impG4Nombre" class="mt-1 w-full rounded-md border-slate-300"></div>
                    <div><label class="block text-sm font-medium">Rol</label><input type="text" id="impG4Rol" class="mt-1 w-full rounded-md border-slate-300" placeholder="Ej: Testigo, Sospechoso"></div>
                    <button type="button" class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm w-full" onclick="addPersonaImplicadaG4()">Añadir Persona</button>
                </div>
                <div>
                    <label for="observacionesAnotacionesG4" class="block text-sm font-medium text-slate-600">Observaciones y Anotaciones</label>
                    <textarea id="observacionesAnotacionesG4" rows="3" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
                </div>
            `;
             dynamicListAdders = `
                <h4 class="font-semibold text-slate-700 mt-6 mb-2">Pendientes de Gestión</h4>
                <ul id="grupo4PendientesList" class="space-y-2 text-sm text-slate-700 list-disc list-inside max-h-40 overflow-y-auto p-2 border rounded"></ul>
                <div class="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div class="md:col-span-1"><label class="block text-sm font-medium">Descripción</label><input type="text" id="gp4PendDesc" class="mt-1 w-full rounded-md border-slate-300"></div>
                    <div><label class="block text-sm font-medium">Fecha Límite</label><input type="date" id="gp4PendDate" class="mt-1 w-full rounded-md border-slate-300"></div>
                    <button class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm" onclick="addGrupo4Pendiente()">Añadir Pendiente</button>
                </div>
            `;
            dataMapping = {
                fecha: 'fecha', anio: 'anio', descripcionBreve: 'descripcionBreve',
                nombreActuacion: 'nombreActuacionG4',
                diligenciasActuaciones: 'diligenciasActuacionesG4',
                personasImplicadas: getPersonasImplicadasG4,
                observacionesAnotaciones: 'observacionesAnotacionesG4',
                grupo4Pendientes: getGrupo4Pendientes
            };
            break;
        case 'puerto': // Controles y actuaciones
            formFieldsHtml = `
                ${commonBaseFields}
                <div>
                    <label for="tipoControl" class="block text-sm font-medium text-slate-600">Tipo de Control</label>
                    <input type="text" id="tipoControl" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm" placeholder="Ej: Barco, Mercancía, Viajeros">
                </div>
                <div>
                    <label for="incidenciasResultados" class="block text-sm font-medium text-slate-600">Detalles de Incidencias/Resultados</label>
                    <textarea id="incidenciasResultados" rows="3" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
                </div>
                <div>
                    <label for="nacionalidadesImplicadas" class="block text-sm font-medium text-slate-600">Nacionalidades Implicadas</label>
                    <textarea id="nacionalidadesImplicadas" rows="2" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
                </div>
                <div>
                    <label for="diligenciasRealizadasPuerto" class="block text-sm font-medium text-slate-600">Diligencias Realizadas</label>
                    <textarea id="diligenciasRealizadasPuerto" rows="3" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
                </div>
                <div>
                    <label for="observacionesPuerto" class="block text-sm font-medium text-slate-600">Observaciones</label>
                    <textarea id="observacionesPuerto" rows="3" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
                </div>
            `;
            dynamicListAdders = `
                <h4 class="font-semibold text-slate-700 mt-6 mb-2">Pendientes de Gestión</h4>
                <ul id="puertoPendientesList" class="space-y-2 text-sm text-slate-700 list-disc list-inside max-h-40 overflow-y-auto p-2 border rounded"></ul>
                <div class="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div class="md:col-span-1"><label class="block text-sm font-medium">Descripción</label><input type="text" id="puertoPendDesc" class="mt-1 w-full rounded-md border-slate-300"></div>
                    <div><label class="block text-sm font-medium">Fecha Límite</label><input type="date" id="puertoPendDate" class="mt-1 w-full rounded-md border-slate-300"></div>
                    <button class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm" onclick="addPuertoPendiente()">Añadir Pendiente</button>
                </div>
            `;
            dataMapping = {
                fecha: 'fecha', anio: 'anio', descripcionBreve: 'descripcionBreve',
                tipoControl: 'tipoControl',
                incidenciasResultados: 'incidenciasResultados', nacionalidadesImplicadas: 'nacionalidadesImplicadas',
                diligenciasRealizadas: 'diligenciasRealizadasPuerto', observaciones: 'observacionesPuerto',
                puertoPendientes: getPuertoPendientes
            };
            break;
        case 'cie': // Centro de Internamiento
            formFieldsHtml = `
                ${commonBaseFields}
                <div>
                    <label for="tipoActuacion" class="block text-sm font-medium text-slate-600">Tipo de Actuación</label>
                    <input type="text" id="tipoActuacion" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm" placeholder="Ej: Admisión, Expulsión, Visita, Traslado">
                </div>
                <div>
                    <label for="nombrePersonaCIE" class="block text-sm font-medium text-slate-600">Nombre de la Persona</label>
                    <input type="text" id="nombrePersonaCIE" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm">
                </div>
                <div>
                    <label for="nacionalidadPersonaCIE" class="block text-sm font-medium text-slate-600">Nacionalidad de la Persona</label>
                    <input type="text" id="nacionalidadPersonaCIE" class="mt-1 w-full rounded-md border-slate-300 shadow-sm">
                </div>
                <div>
                    <label for="motivoCIE" class="block text-sm font-medium text-slate-600">Motivo de la Actuación</label>
                    <textarea id="motivoCIE" rows="2" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
                </div>
                <div>
                    <label for="observacionesCIE" class="block text-sm font-medium text-slate-600">Observaciones</label>
                    <textarea id="observacionesCIE" rows="3" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
                </div>
            `;
            dynamicListAdders = `
                <h4 class="font-semibold text-slate-700 mt-6 mb-2">Pendientes de Gestión</h4>
                <ul id="ciePendientesList" class="space-y-2 text-sm text-slate-700 list-disc list-inside max-h-40 overflow-y-auto p-2 border rounded"></ul>
                <div class="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div class="md:col-span-1"><label class="block text-sm font-medium">Descripción</label><input type="text" id="ciePendDesc" class="mt-1 w-full rounded-md border-slate-300"></div>
                    <div><label class="block text-sm font-medium">Fecha Límite</label><input type="date" id="ciePendDate" class="mt-1 w-full rounded-md border-slate-300"></div>
                    <button class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm" onclick="addCIEPendiente()">Añadir Pendiente</button>
                </div>
            `;
            dataMapping = {
                fecha: 'fecha', anio: 'anio', descripcionBreve: 'descripcionBreve',
                tipoActuacion: 'tipoActuacion',
                nombrePersonaCIE: 'nombrePersonaCIE', nacionalidadPersonaCIE: 'nacionalidadPersonaCIE',
                motivoCIE: 'motivoCIE', observaciones: 'observacionesCIE',
                ciePendientes: getCIEPendientes
            };
            break;
        case 'gestion': // Asilos, cartas, trámites
            formFieldsHtml = `
                ${commonBaseFields}
                <div>
                    <label for="tipoTramite" class="block text-sm font-medium text-slate-600">Tipo de Trámite</label>
                    <input type="text" id="tipoTramite" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm" placeholder="Ej: Asilo, Carta invitación, Devolución">
                </div>
                <div>
                    <label for="datosGestionado" class="block text-sm font-medium text-slate-600">Datos del Gestionado</label>
                    <textarea id="datosGestionado" rows="3" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
                </div>
                <div>
                    <label for="descripcionTramite" class="block text-sm font-medium text-slate-600">Descripción Breve del Trámite</label>
                    <textarea id="descripcionTramite" rows="2" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
                </div>
                <div>
                    <label for="observacionesGestion" class="block text-sm font-medium text-slate-600">Observaciones</label>
                    <textarea id="observacionesGestion" rows="3" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
                </div>
            `;
            dynamicListAdders = `
                <h4 class="font-semibold text-slate-700 mt-6 mb-2">Pendientes de Gestión</h4>
                <ul id="gestionPendientesList" class="space-y-2 text-sm text-slate-700 list-disc list-inside max-h-40 overflow-y-auto p-2 border rounded"></ul>
                <div class="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div class="md:col-span-1"><label class="block text-sm font-medium">Descripción</label><input type="text" id="gestionPendDesc" class="mt-1 w-full rounded-md border-slate-300"></div>
                    <div><label class="block text-sm font-medium">Fecha Límite</label><input type="date" id="gestionPendDate" class="mt-1 w-full rounded-md border-slate-300"></div>
                    <button class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm" onclick="addGestionPendiente()">Añadir Pendiente</button>
                </div>
            `;
            dataMapping = {
                fecha: 'fecha', anio: 'anio', descripcionBreve: 'descripcionBreve',
                tipoTramite: 'tipoTramite',
                datosGestionado: 'datosGestionado', descripcionTramite: 'descripcionTramite',
                observaciones: 'observacionesGestion',
                gestionPendientes: getGestionPendientes
            };
            break;
        case 'cecorex': // Centro Coordinación
            formFieldsHtml = `
                ${commonBaseFields}
                <div>
                    <label for="tipoCoordinacion" class="block text-sm font-medium text-slate-600">Tipo de Coordinación</label>
                    <input type="text" id="tipoCoordinacion" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm" placeholder="Ej: Alerta, Aviso, Colaboración">
                </div>
                <div>
                    <label for="datosActuacion" class="block text-sm font-medium text-slate-600">Datos de la Actuación</label>
                    <textarea id="datosActuacion" rows="3" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
                </div>
                <div>
                    <label for="resultadoCecorex" class="block text-sm font-medium text-slate-600">Resultado</label>
                    <textarea id="resultadoCecorex" rows="2" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
                </div>
                <div>
                    <label for="observacionesCecorex" class="block text-sm font-medium text-slate-600">Observaciones</label>
                    <textarea id="observacionesCecorex" rows="3" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
                </div>
            `;
            dynamicListAdders = `
                <h4 class="font-semibold text-slate-700 mt-6 mb-2">Pendientes de Gestión</h4>
                <ul id="cecorexPendientesList" class="space-y-2 text-sm text-slate-700 list-disc list-inside max-h-40 overflow-y-auto p-2 border rounded"></ul>
                <div class="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div class="md:col-span-1"><label class="block text-sm font-medium">Descripción</label><input type="text" id="cecorexPendDesc" class="mt-1 w-full rounded-md border-slate-300"></div>
                    <div><label class="block text-sm font-medium">Fecha Límite</label><input type="date" id="cecorexPendDate" class="mt-1 w-full rounded-md border-slate-300"></div>
                    <button class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm" onclick="addCecorexPendiente()">Añadir Pendiente</button>
                </div>
            `;
            dataMapping = {
                fecha: 'fecha', anio: 'anio', descripcionBreve: 'descripcionBreve',
                tipoCoordinacion: 'tipoCoordinacion',
                datosActuacion: 'datosActuacion', resultado: 'resultadoCecorex',
                observaciones: 'observacionesCecorex',
                cecorexPendientes: getCecorexPendientes
            };
            break;
        default:
            formFieldsHtml = `<p class="text-slate-500">No hay formulario definido para este grupo.</p>`;
    }

    const formHtml = `
    <div class="w-full max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        <h2 class="text-2xl font-bold text-center text-slate-700">${group.name} - ${group.description}</h2>
        
        <!-- Search Section -->
        <div class="bg-white p-4 rounded-lg shadow-md border-blue-300 border-2">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div class="col-span-1 md:col-span-2">
                    <label for="docList" class="block text-sm font-medium text-slate-600">Buscar/Seleccionar registro existente</label>
                    <select id="docList" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"></select>
                </div>
                <div class="flex space-x-2">
                    <button id="loadDocBtn" class="flex-1 w-full bg-blue-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">Cargar</button>
                    <button id="newDocBtn" class="flex-1 w-full bg-slate-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2">Nuevo</button>
                </div>
            </div>
        </div>

        <!-- Main Fields -->
        <div class="bg-white p-4 rounded-lg shadow-md border-blue-300 border-2 space-y-4">
            <div id="status-message" class="my-2 font-semibold"></div>
            ${formFieldsHtml}
            <div class="text-right">
                <button id="saveDocBtn" class="bg-green-600 text-white px-6 py-2 rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">Guardar Registro</button>
            </div>
        </div>
        ${dynamicListAdders}
    </div>`;
    mainContent().innerHTML = formHtml;

    // Setup event listeners for the specific form
    document.getElementById('newDocBtn').addEventListener('click', () => resetSpecificForm(collectionName));
    document.getElementById('loadDocBtn').addEventListener('click', () => loadSpecificDoc(collectionName, dataMapping));
    document.getElementById('saveDocBtn').addEventListener('click', () => saveSpecificDoc(collectionName, dataMapping));
    
    resetSpecificForm(collectionName);
};

const loadSpecificDoc = async (collectionName, dataMapping) => {
    const docList = document.getElementById('docList');
    const docId = docList ? docList.value : null;
    if (!docId) return;
    showSpinner(true);
    currentDocId = docId;
    try {
        const data = await loadData(collectionName, docId);
        if (!data) {
            showStatus('Registro no encontrado.', true);
            return;
        }

        // Populate form fields
        for (const key in dataMapping) {
            const mappedValue = dataMapping[key];
            if (typeof mappedValue === 'string') { // If it's a direct ID for a field
                const field = document.getElementById(mappedValue);
                if (field) {
                    if (field.type === 'date') {
                        field.value = formatDate(data[key]);
                    } else if (field.type === 'checkbox') {
                        field.checked = data[key];
                    } else {
                        field.value = data[key] || '';
                    }
                }
            } else if (typeof mappedValue === 'function') { // Handle dynamic lists during load (getter function)
                // Clear the container first
                let containerId;
                if (key === 'personasImplicadas') containerId = 'personasImplicadasContainer';
                else if (key === 'grupoPendientes') containerId = 'grupoPendientesList';
                else if (key === 'personasImplicadasG4') containerId = 'personasImplicadasG4Container';
                else if (key === 'grupo4Pendientes') containerId = 'grupo4PendientesList';
                else if (key === 'puertoPendientes') containerId = 'puertoPendientesList';
                else if (key === 'ciePendientes') containerId = 'ciePendientesList';
                else if (key === 'gestionPendientes') containerId = 'gestionPendientesList';
                else if (key === 'cecorexPendientes') containerId = 'cecorexPendientesList';

                if (containerId && document.getElementById(containerId)) {
                    document.getElementById(containerId).innerHTML = '';
                    if (data[key]) {
                        // Call the specific `add` function with the data item
                        const addFunctionName = 'add' + key.charAt(0).toUpperCase() + key.slice(1).replace(/s$/, '');
                        if (window[addFunctionName]) { // Check if the function exists
                            data[key].forEach(item => window[addFunctionName](item));
                        } else {
                            console.warn(`Function ${addFunctionName} not found for populating dynamic list.`);
                        }
                    }
                }
            }
        }
        showStatus('Registro cargado.', false);

    }
     catch (e) {
        console.error("Error loading specific doc:", e);
        showStatus(`Error al cargar registro: ${e.message}.`, true);
    } finally {
        showSpinner(false);
    }
};


const saveSpecificDoc = async (collectionName, dataMapping) => {
    showSpinner(true);
    let docData = {};
    // Collect data from form fields based on dataMapping
    for (const key in dataMapping) {
        const mappedValue = dataMapping[key];
        if (typeof mappedValue === 'string') { // Direct field ID
            const field = document.getElementById(mappedValue);
            if (field) {
                if (field.type === 'date') {
                    docData[key] = field.value ? new Date(field.value) : null;
                } else if (field.type === 'checkbox') {
                    docData[key] = field.checked;
                } else {
                    docData[key] = field.value.trim();
                }
            }
        } else if (typeof mappedValue === 'function') { // Dynamic list getter function
            docData[key] = mappedValue();
        }
    }
    // Add group name for filtering if needed
    docData.grupo = groups[currentGroup].name;
    docData.anio = Number(document.getElementById('anio').value); // Ensure anio is always collected

    // Special handling for autogenerated code/year if applicable (e.g., Grupo 1)
    // For simple groups, if `codigo` field is not present, don't generate.
    if (document.getElementById('codigo') && document.getElementById('codigo').value === '' && docData.anio) {
        docData.codigo = await getNextCode(collectionName, docData.grupo, Number(docData.anio));
        document.getElementById('codigo').value = docData.codigo; // Update UI with generated code
    }


    try {
        currentDocId = await saveData(collectionName, docData, currentDocId);
        showStatus('Registro guardado correctamente.', false);
        await fetchDataForSelect(collectionName, 'docList', 'descripcionBreve', 'anio', currentGroup);
        if (document.querySelector(`#docList option[value='${currentDocId}']`)) {
            document.querySelector(`#docList option[value='${currentDocId}']`).selected = true;
        }

    } catch (e) {
        showStatus(`Error al guardar registro: ${e.message}.`, true);
    } finally {
        showSpinner(false);
    }
};

const resetSpecificForm = async (collectionName) => {
    currentDocId = null;
    const formElements = document.querySelectorAll('.w-full input, .w-full textarea');
    formElements.forEach(el => {
        if (el.type === 'checkbox') el.checked = false;
        else el.value = '';
    });
    // Reset year and date if they exist
    if (document.getElementById('anio')) document.getElementById('anio').value = new Date().getFullYear();
    if (document.getElementById('fecha')) document.getElementById('fecha').value = formatDate(new Date());

    // Clear all dynamic lists (containers)
    const dynamicListContainers = [
        'personasImplicadasContainer', 'grupoPendientesList', 'personasImplicadasG4Container',
        'grupo4PendientesList', 'puertoPendientesList', 'ciePendientesList',
        'gestionPendientesList', 'cecorexPendientesList'
    ];
    dynamicListContainers.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.innerHTML = '';
    });

    // Close all details sections
    document.querySelectorAll('details').forEach(d => d.open = false);

    await fetchDataForSelect(collectionName, 'docList', 'descripcionBreve', 'anio', currentGroup);
    showStatus('', false); // Clear status message
};

// Resets all fields for the Group 2/3 operation form and optionally
// reloads the list of existing operations.
const resetGroup2and3Form = async (fetchOps = true) => {
    currentDocId = null;

    const textFields = [
        'codigo', 'anio', 'fecha', 'nombreOperacion', 'descripcionBreve',
        'fechaInicioOperacion', 'origen', 'tipologiaDelictiva',
        'dolenciasPreviasYJuzgados', 'diligenciasPolicialesMain',
        'diligenciasPolicialesDoc', 'oficiosJudiciales', 'documentosAdjuntos',
        'anotacionesTexto', 'juzgadoInicialField'
    ];
    textFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    // Reset year and date if present
    if (document.getElementById('anio')) {
        document.getElementById('anio').value = new Date().getFullYear();
    }
    if (document.getElementById('fecha')) {
        document.getElementById('fecha').value = formatDate(new Date());
    }

    const checkboxes = ['anotacionRelevante', 'anotacionConfidencial'];
    checkboxes.forEach(id => {
        const cb = document.getElementById(id);
        if (cb) cb.checked = false;
    });

    const containers = [
        'diligenciasPreviasJuzgadosContainer', 'historicoInhibicionesContainer',
        'historicoGeneralJuzgadosContainer', 'intervencionesTelefonicasContainer',
        'entradasYRegistrosContainer', 'solicitudesJudicialesContainer',
        'colaboracionesContainer', 'detenidosContainer',
        'detenidosPrevistosContainer', 'otrasPersonasContainer',
        'chronologyList', 'pendingList'
    ];
    containers.forEach(id => {
        const c = document.getElementById(id);
        if (c) c.innerHTML = '';
    });

    // Close all collapsible sections
    document.querySelectorAll('details').forEach(d => d.open = false);

    if (fetchOps) {
        await fetchDataForSelect('operaciones', 'opList', 'nombreOperacion', 'anio', currentGroup);
    }
    showStatus('', false);
};


/**
 * Renders the comprehensive data entry form for Groups 2 and 3.
 * @param {string} groupKey - The key of the group.
 */
const renderGroup2and3Form = (groupKey) => {
    currentView = 'operationForm'; // Specific view for detailed operations
    const group = groups[groupKey];
    const collectionName = group.collection; // 'operaciones'

    const formHtml = `
    <div class="w-full max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        <h2 class="text-2xl font-bold text-center text-slate-700">${group.name} - ${group.description}</h2>
        
        <!-- Search Section -->
        <div class="bg-white p-4 rounded-lg shadow-md border-blue-300 border-2">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div class="col-span-1 md:col-span-2">
                    <label for="opList" class="block text-sm font-medium text-slate-600">Buscar/Seleccionar operación existente</label>
                    <select id="opList" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"></select>
                </div>
                <div class="flex space-x-2">
                    <button id="loadOpBtn" class="flex-1 w-full bg-blue-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">Cargar</button>
                    <button id="newOpBtn" class="flex-1 w-full bg-slate-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2">Nueva</button>
                </div>
            </div>
        </div>

        <!-- Main Operation Fields (Header) -->
        <div class="bg-white p-4 rounded-lg shadow-md border-blue-300 border-2 space-y-4">
            <div id="status-message" class="my-2 font-semibold"></div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label for="codigo" class="block text-sm font-medium text-slate-600">Código</label>
                    <input type="text" id="codigo" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm" placeholder="Autogenerado...">
                </div>
                <div>
                    <label for="anio" class="block text-sm font-medium text-slate-600">Año</label>
                    <input type="text" id="anio" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm">
                </div>
                <div>
                    <label for="fecha" class="block text-sm font-medium text-slate-600">Fecha de Creación</label>
                    <input type="date" id="fecha" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm">
                </div>
            </div>
            
            <div>
                <label for="nombreOperacion" class="block text-sm font-medium text-slate-600">Nombre de la Operación</label>
                <input type="text" id="nombreOperacion" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm" required>
            </div>
            <div>
                <label for="descripcionBreve" class="block text-sm font-medium text-slate-600">Descripción Breve</label>
                <textarea id="descripcionBreve" rows="2" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm" required></textarea>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label for="fechaInicioOperacion" class="block text-sm font-medium text-slate-600">Fecha de Inicio Operación</label>
                    <input type="date" id="fechaInicioOperacion" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm">
                </div>
                <div>
                    <label for="origen" class="block text-sm font-medium text-slate-600">Origen</label>
                    <input type="text" id="origen" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm">
                </div>
                <div>
                    <label for="tipologiaDelictiva" class="block text-sm font-medium text-slate-600">Tipología Delictiva</label>
                    <input type="text" id="tipologiaDelictiva" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm">
                </div>
            </div>

            <div>
                <label for="dolenciasPreviasYJuzgados" class="block text-sm font-medium text-slate-600">Dolencias Previas y Juzgados</label>
                <textarea id="dolenciasPreviasYJuzgados" rows="2" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
            </div>
            <div>
                <label for="diligenciasPolicialesMain" class="block text-sm font-medium text-slate-600">Diligencias Policiales (Principales)</label>
                <textarea id="diligenciasPolicialesMain" rows="2" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
            </div>
            <div class="text-right">
                <button id="saveOpBtn" class="bg-green-600 text-white px-6 py-2 rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">Guardar Operación</button>
            </div>
        </div>

        <!-- 2. Pestañas de Datos Organizativos -->
        <!-- 2.1 Juzgados -->
        ${renderCollapsibleSection('juzgados', '🗂️ Juzgados', `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label for="juzgadoInicialField" class="block text-sm font-medium text-slate-600">Juzgado Inicial</label>
                    <input type="text" id="juzgadoInicialField" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm">
                </div>
            </div>
            <h4 class="font-semibold text-slate-700 mt-4 mb-2">Diligencias Previas (Juzgados con fecha)</h4>
            <div id="diligenciasPreviasJuzgadosContainer" class="space-y-2"></div>
            <div class="mt-2 pt-2 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                    <label class="block text-sm font-medium">Fecha</label>
                    <input type="date" id="dpjFecha" class="mt-1 w-full rounded-md border-slate-300">
                </div>
                <div>
                    <label class="block text-sm font-medium">Juzgado</label>
                    <input type="text" id="dpjJuzgado" class="mt-1 w-full rounded-md border-slate-300" placeholder="Nombre del Juzgado">
                </div>
                <div class="md:col-span-1">
                    <button type="button" class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm w-full" onclick="addDiligenciaPreviasJuzgados()">Añadir Diligencia Previa</button>
                </div>
            </div>

            <h4 class="font-semibold text-slate-700 mt-6 mb-2">Inhibiciones</h4>
            <div id="historicoInhibicionesContainer" class="space-y-2"></div>
            <div class="mt-2 pt-2 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                    <label class="block text-sm font-medium">Juzgado Inhibido</label>
                    <input type="text" id="inhibJuzgado" class="mt-1 w-full rounded-md border-slate-300">
                </div>
                <div>
                    <label class="block text-sm font-medium">Fecha Inhibición</label>
                    <input type="date" id="inhibFecha" class="mt-1 w-full rounded-md border-slate-300">
                </div>
                <button type="button" class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm w-full" onclick="addHistoricoInhibicion()">Añadir Inhibición</button>
            </div>

            <h4 class="font-semibold text-slate-700 mt-6 mb-2">Histórico de Juzgados</h4>
            <div id="historicoGeneralJuzgadosContainer" class="space-y-2"></div>
            <div class="mt-2 pt-2 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                    <label class="block text-sm font-medium">Fecha Evento</label>
                    <input type="date" id="hgJFecha" class="mt-1 w-full rounded-md border-slate-300">
                </div>
                <div>
                    <label class="block text-sm font-medium">Juzgado Relacionado</label>
                    <input type="text" id="hgJJuzgado" class="mt-1 w-full rounded-md border-slate-300" placeholder="Nombre del Juzgado">
                </div>
                <div class="md:col-span-2">
                    <label class="block text-sm font-medium">Descripción del Evento</label>
                    <input type="text" id="hgJEvento" class="mt-1 w-full rounded-md border-slate-300" placeholder="Ej: Cambio de juzgado, nuevo conocimiento">
                </div>
                <div class="md:col-span-1">
                    <button type="button" class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm w-full" onclick="addHistoricoGeneralJuzgados()">Añadir Evento Juzgado</button>
                </div>
            </div>
        `)}

        <!-- 2.2 Intervenciones / Medidas -->
        ${renderCollapsibleSection('intervenciones', '📞 Intervenciones / Medidas', `
            <h4 class="font-semibold text-slate-700 mt-4 mb-2">Intervenciones Telefónicas</h4>
            <div id="intervencionesTelefonicasContainer" class="space-y-2"></div>
            <div class="mt-2 pt-2 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                   <label class="block text-sm font-medium">Descripción</label>
                   <input type="text" id="itDesc" class="mt-1 w-full rounded-md border-slate-300">
                </div>
                <button type="button" class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm w-full" onclick="addIntervencionTelefonica()">Añadir Intervención</button>
            </div>

            <h4 class="font-semibold text-slate-700 mt-6 mb-2">Entradas y Registros</h4>
            <div id="entradasYRegistrosContainer" class="space-y-2"></div>
            <div class="mt-2 pt-2 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                   <label class="block text-sm font-medium">Descripción</label>
                   <input type="text" id="eyrDesc" class="mt-1 w-full rounded-md border-slate-300">
                </div>
                <button type="button" class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm w-full" onclick="addEntradaYRegistro()">Añadir Entrada/Registro</button>
            </div>

            <h4 class="font-semibold text-slate-700 mt-6 mb-2">Solicitudes Judiciales (Geolocalización, Balizas, etc.)</h4>
            <div id="solicitudesJudicialesContainer" class="space-y-2"></div>
            <div class="mt-2 pt-2 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                   <label class="block text-sm font-medium">Tipo</label>
                   <input type="text" id="sjTipo" class="mt-1 w-full rounded-md border-slate-300" placeholder="Ej: Geolocalización, Baliza">
                </div>
                <div class="md:col-span-2">
                   <label class="block text-sm font-medium">Descripción</label>
                   <input type="text" id="sjDesc" class="mt-1 w-full rounded-md border-slate-300">
                </div>
                <div class="md:col-span-1">
                    <button type="button" class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm w-full" onclick="addSolicitudJudicial()">Añadir Solicitud</button>
                </div>
            </div>

            <h4 class="font-semibold text-slate-700 mt-6 mb-2">Colaboraciones de Otros Grupos/Instituciones</h4>
            <div id="colaboracionesContainer" class="space-y-2"></div>
            <div class="mt-2 pt-2 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                    <label class="block text-sm font-medium">Fecha Colaboración</label>
                    <input type="date" id="colaboracionFecha" class="mt-1 w-full rounded-md border-slate-300">
                </div>
                <div>
                    <label class="block text-sm font-medium">Grupo/Institución</label>
                    <input type="text" id="colaboracionGrupoInstitucion" class="mt-1 w-full rounded-md border-slate-300">
                </div>
                <div>
                    <label class="block text-sm font-medium">Tipo de Colaboración</label>
                    <input type="text" id="colaboracionTipo" class="mt-1 w-full rounded-md border-slate-300" placeholder="Ej: apoyo logístico, intercambio de información">
                </div>
                <div class="md:col-span-1">
                    <button type="button" class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm w-full" onclick="addColaboracion()">Añadir Colaboración</button>
                </div>
            </div>
        `)}

        <!-- 2.3 Cronología -->
        ${renderCollapsibleSection('chronology', '🕰️ Cronología', `
            <ul id="chronologyList" class="space-y-2 text-sm text-slate-700 list-disc list-inside"></ul>
            <div class="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div class="md:col-span-2">
                   <label class="block text-sm font-medium">Descripción</label>
                   <input type="text" id="chronDesc" class="mt-1 w-full rounded-md border-slate-300">
                </div>
                <button id="addChronBtn" class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm">Añadir Evento</button>
            </div>
        `)}
        
        <!-- 3. Personas Vinculadas -->
        ${renderCollapsibleSection('personas-vinculadas', '👥 Personas Vinculadas', `
            <h4 class="font-semibold text-slate-700 mt-4 mb-2">Detenidos</h4>
            <div id="detenidosContainer" class="space-y-2 max-h-60 overflow-y-auto p-2 border rounded"></div>
            <div class="mt-2 pt-2 border-t border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div><label class="block text-sm font-medium">Filiación Delito</label><input type="text" id="detFiliacion" class="mt-1 w-full rounded-md border-slate-300"></div>
                <div><label class="block text-sm font-medium">Nacionalidad</label><input type="text" id="detNac" class="mt-1 w-full rounded-md border-slate-300"></div>
                <div><label class="block text-sm font-medium">Fecha Detención</label><input type="date" id="detFecha" class="mt-1 w-full rounded-md border-slate-300"></div>
                <div><label class="block text-sm font-medium">Ordinal</label><input type="text" id="detOrdinal" class="mt-1 w-full rounded-md border-slate-300"></div>
                <div class="md:col-span-1">
                    <button type="button" class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm w-full" onclick="addDetenido()">Añadir Detenido</button>
                </div>
            </div>

            <h4 class="font-semibold text-slate-700 mt-6 mb-2">Detenidos Previstos / Pendientes</h4>
            <div id="detenidosPrevistosContainer" class="space-y-2 max-h-60 overflow-y-auto p-2 border rounded"></div>
            <div class="mt-2 pt-2 border-t border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div><label class="block text-sm font-medium">Filiación Delito</label><input type="text" id="detPrevFiliacion" class="mt-1 w-full rounded-md border-slate-300"></div>
                <div><label class="block text-sm font-medium">Nacionalidad</label><input type="text" id="detPrevNac" class="mt-1 w-full rounded-md border-slate-300"></div>
                <div><label class="block text-sm font-medium">Fecha Prevista</label><input type="date" id="detPrevFecha" class="mt-1 w-full rounded-md border-slate-300"></div>
                <div><label class="block text-sm font-medium">Ordinal</label><input type="text" id="detPrevOrdinal" class="mt-1 w-full rounded-md border-slate-300"></div>
                <div class="md:col-span-1">
                    <button type="button" class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm w-full" onclick="addDetenidoPrevisto()">Añadir Previsto</button>
                </div>
            </div>

            <h4 class="font-semibold text-slate-700 mt-6 mb-2">Otras Personas (Testigos, Víctimas, Investigados no Detenidos)</h4>
            <div id="otrasPersonasContainer" class="space-y-2 max-h-60 overflow-y-auto p-2 border rounded"></div>
            <div class="mt-2 pt-2 border-t border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div><label class="block text-sm font-medium">Filiación</label><input type="text" id="otraFiliacion" class="mt-1 w-full rounded-md border-slate-300"></div>
                <div><label class="block text-sm font-medium">Tipo de Vinculación</label><input type="text" id="otraTipo" class="mt-1 w-full rounded-md border-slate-300" placeholder="Ej: Testigo, Víctima"></div>
                <div><label class="block text-sm font-medium">Nacionalidad</label><input type="text" id="otraNac" class="mt-1 w-full rounded-md border-slate-300"></div>
                <div><label class="block text-sm font-medium">Teléfono</label><input type="text" id="otraTelefono" class="mt-1 w-full rounded-md border-slate-300"></div>
                <div class="md:col-span-1">
                    <button type="button" class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm w-full" onclick="addOtraPersona()">Añadir Persona</button>
                </div>
            </div>
        `)}

        <!-- Documentación -->
        ${renderCollapsibleSection('documentacion', '📝 Documentación', `
            <div>
                <label for="diligenciasPolicialesDoc" class="block text-sm font-medium text-slate-600">Diligencias Policiales (Resumen o Enlaces)</label>
                <textarea id="diligenciasPolicialesDoc" rows="3" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
            </div>
            <div>
                <label for="oficiosJudiciales" class="block text-sm font-medium text-slate-600">Oficios Judiciales Enviados / Recibidos (Resumen o Enlaces)</label>
                <textarea id="oficiosJudiciales" rows="3" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
            </div>
            <div>
                <label for="documentosAdjuntos" class="block text-sm font-medium text-slate-600">Documentos Adjuntos (Notas o Enlaces a archivos externos)</label>
                <textarea id="documentosAdjuntos" rows="3" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
            </div>
        `)}

        <!-- 5. Anotaciones / Observaciones -->
        ${renderCollapsibleSection('anotaciones', '🧩 Anotaciones / Observaciones', `
            <div>
                <label for="anotacionesTexto" class="block text-sm font-medium text-slate-600">Comentarios Internos</label>
                <textarea id="anotacionesTexto" rows="4" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm"></textarea>
            </div>
            <div class="flex items-center mt-4">
                <input type="checkbox" id="anotacionRelevante" class="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                <label for="anotacionRelevante" class="ml-2 block text-sm font-medium text-slate-700">Marcar como Relevante</label>
            </div>
            <div class="flex items-center mt-2">
                <input type="checkbox" id="anotacionConfidencial" class="h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500">
                <label for="anotacionConfidencial" class="ml-2 block text-sm font-medium text-slate-700">Marcar como Confidencial</label>
            </div>
        `)}

        <!-- Existing Elements Pendientes (Operación) -->
        ${renderCollapsibleSection('pending', '✅ Elementos Pendientes (Operación)', `
            <ul id="pendingList" class="space-y-2 text-sm text-slate-700 list-disc list-inside max-h-40 overflow-y-auto p-2 border rounded"></ul>
             <div class="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
               <div class="md:col-span-1"><label class="block text-sm font-medium">Descripción</label><input type="text" id="pendDesc" class="mt-1 w-full rounded-md border-slate-300"></div>
               <div><label class="block text-sm font-medium">Fecha Límite</label><input type="date" id="pendDate" class="mt-1 w-full rounded-md border-slate-300"></div>
               <button id="addPendBtn" class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm">Añadir Pendiente</button>
            </div>
        `)}

        <!-- 6. Funciones adicionales -->
        ${renderCollapsibleSection('funciones-adicionales', '🔍 Funciones Adicionales', `
            <p class="text-slate-700"><b>Gestiones pendientes:</b> Ya integradas en el "Listado Global de Pendientes" en Estadísticas y "Elementos Pendientes (Operación)" en esta misma ficha.</p>
            <button id="generateReportBtn" class="bg-indigo-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 mt-4">Generar Informe Automático</button>
        `)}
    </div>
    `;
    mainContent().innerHTML = formHtml;
    // Setup event listeners for Group 2/3 form
    document.getElementById('newOpBtn').addEventListener('click', () => resetGroup2and3Form());
    document.getElementById('loadOpBtn').addEventListener('click', () => loadOperation(collectionName));
    document.getElementById('saveOpBtn').addEventListener('click', () => saveOperation(collectionName));
    
    // Add related items (for existing subcollections like chronology)
    document.getElementById('addChronBtn').addEventListener('click', async () => {
        const desc = document.getElementById('chronDesc').value.trim();
        if (!desc) return;
        await addRelatedItem('chronology', { descripcion: desc }, 'chronologyList', item => `<li>${formatDateTime(item.createdAt)} - ${item.descripcion}</li>`);
        document.getElementById('chronDesc').value = '';
    });
    document.getElementById('addPendBtn').addEventListener('click', addPendingTaskToOperation);

    // New report generation button listener
    document.getElementById('generateReportBtn').addEventListener('click', generateOperationReport);

    resetGroup2and3Form(); // Reset form and fetch ops for the select
};


/**
 * Helper to generate HTML for a collapsible section.
 */
const renderCollapsibleSection = (id, title, content) => `
    <details id="details-${id}" class="bg-white rounded-lg shadow-md border-blue-300 border-2 open:ring-2 open:ring-blue-200 open:shadow-lg">
        <summary class="p-4 font-semibold text-slate-700 cursor-pointer list-none flex justify-between items-center">
            ${title}
            <svg class="w-5 h-5 transition-transform transform details-arrow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
        </summary>
        <div class="p-4 border-t border-slate-200">
            ${content}
        </div>
    </details>
`;

/**
 * Renders the statistics and global pending tasks view.
 */
const renderStatistics = () => {
    currentView = 'statistics';
    const today = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(today.getDate() - 7);

    const statsHtml = `
    <div class="w-full max-w-4xl mx-auto p-4 md:p-6 space-y-6">
         <!-- Stats Section -->
        <div class="bg-white p-4 rounded-lg shadow-md border-blue-300 border-2 space-y-4">
            <h3 class="text-xl font-bold text-slate-700">Consultar Estadísticas</h3>
             <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                 <div>
                    <label for="startDate" class="block text-sm font-medium text-slate-600">Desde</label>
                    <input type="date" id="startDate" class="mt-1 block w-full rounded-md" value="${formatDate(weekAgo)}">
                </div>
                <div>
                    <label for="endDate" class="block text-sm font-medium text-slate-600">Hasta</label>
                    <input type="date" id="endDate" class="mt-1 block w-full rounded-md" value="${formatDate(today)}">
                </div>
                <button id="statsBtn" class="bg-blue-600 text-white px-4 py-2 rounded-md shadow-sm">Generar Estadísticas</button>
            </div>
            <div id="statsResult" class="mt-4"></div>
        </div>

        <!-- Global Pending Tasks -->
        <div class="bg-white p-4 rounded-lg shadow-md border-blue-300 border-2 space-y-4">
            <h3 class="text-xl font-bold text-slate-700">Listado Global de Pendientes</h3>
            <div class="overflow-x-auto max-h-96 p-2 border rounded">
                <table class="min-w-full divide-y divide-slate-200">
                    <thead class="bg-slate-50 sticky top-0">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Tarea</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Vence</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Operación</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Acción</th>
                        </tr>
                    </thead>
                    <tbody id="globalPendingTableBody" class="bg-white divide-y divide-slate-200">
                        <!-- Rows will be inserted here by JS -->
                    </tbody>
                </table>
            </div>
        </div>
         <!-- Add new general pending task -->
        <div class="bg-white p-4 rounded-lg shadow-md border-blue-300 border-2 space-y-4">
             <h3 class="text-xl font-bold text-slate-700">Añadir Tarea Pendiente General</h3>
             <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div class="md:col-span-1">
                    <label for="newTaskDesc" class="block text-sm font-medium">Descripción</label>
                    <input type="text" id="newTaskDesc" class="mt-1 w-full rounded-md border-slate-300">
                </div>
                <div>
                    <label for="newTaskDate" class="block text-sm font-medium">Fecha Límite</label>
                    <input type="date" id="newTaskDate" class="mt-1 w-full rounded-md border-slate-300">
                </div>
                <button id="addTaskBtn" class="bg-slate-500 text-white px-4 py-2 rounded-md text-sm">Añadir Tarea General</button>
             </div>
        </div>
    </div>`;
    mainContent().innerHTML = statsHtml;
    setupStatisticsEventListeners();
    fetchGlobalPendingTasks();
};


/**
 * Loads all data for a selected operation into the form (for Group 2/3).
 * @param {string} collectionName - The name of the Firestore collection ('operaciones').
 */
const loadOperation = async (collectionName) => {
    const opList = document.getElementById('opList');
    const opId = opList ? opList.value : null;
    if (!opId) return;
    resetGroup2and3Form(false); // Reset form but don't re-fetch ops yet
    showSpinner(true);
    currentDocId = opId; // Use currentDocId for main operations
    try {
        const op = await loadData(collectionName, opId);
        if (!op) {
            showStatus("La operación no existe.", true);
            return;
        }
        document.getElementById('codigo').value = op.codigo || '';
        document.getElementById('anio').value = op.anio || '';
        document.getElementById('fecha').value = formatDate(op.fecha);
        // Removed 'resumen' and 'funcionario' fields
        
        // Populate NEW direct fields
        document.getElementById('nombreOperacion').value = op.nombreOperacion || '';
        document.getElementById('descripcionBreve').value = op.descripcionBreve || '';
        document.getElementById('fechaInicioOperacion').value = formatDate(op.fechaInicioOperacion);
        document.getElementById('origen').value = op.origen || '';
        document.getElementById('tipologiaDelictiva').value = op.tipologiaDelictiva || '';
        document.getElementById('dolenciasPreviasYJuzgados').value = op.dolenciasPreviasYJuzgados || '';
        document.getElementById('diligenciasPolicialesMain').value = op.diligenciasPolicialesMain || '';

        // Populate dynamic lists
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

        // Cronología (Subcollection)
        await loadSubCollection(opId, 'chronology', 'chronologyList', (a, b) => {
            const dateA = a.createdAt ? (a.createdAt instanceof Timestamp ? a.createdAt.toDate() : new Date(a.createdAt)) : new Date(0);
            const dateB = b.createdAt ? (b.createdAt instanceof Timestamp ? b.createdAt.toDate() : new Date(b.createdAt)) : new Date(0);
            return dateB - dateA; // Descending by date for chronology (latest first)
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

        // Anotaciones / Observaciones
        document.getElementById('anotacionesTexto').value = op.anotacionesTexto || '';
        document.getElementById('anotacionRelevante').checked = op.anotacionRelevante || false;
        document.getElementById('anotacionConfidencial').checked = op.anotacionConfidencial || false;

        // Elements Pendientes (Operation) (Subcollection)
        await loadSubCollection(opId, 'pendingTasks', 'pendingList', (a, b) => {
            const dateA = new Date(a.fechaLimite);
            const dateB = new Date(b.fechaLimite);
            return dateA - dateB; // Ascending by date
        }, item => `
            <li class="flex justify-between items-center ${new Date(item.fechaLimite) < new Date() && item.estado !== 'Completado' ? 'text-red-500' : ''}">
                <span>${item.descripcion} (Vence: ${item.fechaLimite})</span>
                ${item.estado !== 'Completado' ? `<button data-task-id="${item.id}" class="ml-2 text-xs text-white bg-green-500 px-2 py-1 rounded complete-task-btn">Hecho</button>` : '<span class="ml-2 text-xs text-green-600">(Completado)</span>'}
            </li>`);

        document.querySelectorAll('.complete-task-btn').forEach(btn => btn.addEventListener('click', () => completePendingTask(btn.dataset.taskId, true)));
        
        showStatus("Operación cargada.", false);

    } catch (e) {
        console.error("Error loading operation:", e);
        showStatus(`Error al cargar la operación: ${e.message}.`, true);
    } finally {
        showSpinner(false);
    }
};

/**
 * Saves the current operation (creates new or updates existing) for Group 2/3.
 * @param {string} collectionName - The name of the Firestore collection ('operaciones').
 */
const saveOperation = async (collectionName) => {
    showSpinner(true);
    const anio = document.getElementById('anio').value.trim();
    const fecha = document.getElementById('fecha').value;
    const nombreOperacion = document.getElementById('nombreOperacion').value.trim();
    const descripcionBreve = document.getElementById('descripcionBreve').value.trim();
    const fechaInicioOperacion = document.getElementById('fechaInicioOperacion').value;
    const origen = document.getElementById('origen').value.trim();
    const juzgadoInicial = document.getElementById('juzgadoInicialField').value.trim();
    const tipologiaDelictiva = document.getElementById('tipologiaDelictiva').value.trim();
    const dolenciasPreviasYJuzgados = document.getElementById('dolenciasPreviasYJuzgados').value.trim();
    const diligenciasPolicialesMain = document.getElementById('diligenciasPolicialesMain').value.trim();
    const anotacionesTexto = document.getElementById('anotacionesTexto').value.trim();
    const anotacionRelevante = document.getElementById('anotacionRelevante').checked;
    const anotacionConfidencial = document.getElementById('anotacionConfidencial').checked;


    if (!nombreOperacion || !descripcionBreve) { // Removed resumen from required
        showStatus("Los campos 'Nombre de la Operación' y 'Descripción Breve' son obligatorios.", true);
        showSpinner(false);
        return;
    }

    try {
        let codigo = document.getElementById('codigo').value.trim();
        if (!currentDocId) { // Only generate new code for new documents
            codigo = await getNextCode(collectionName, groups[currentGroup].name, Number(anio));
            document.getElementById('codigo').value = codigo;
        }
        
        let opData = {
            grupo: groups[currentGroup].name,
            codigo: Number(codigo),
            anio: Number(anio),
            fecha: new Date(fecha),
            // Removed 'resumen' and 'funcionario' fields
            // Detailed fields
            nombreOperacion: nombreOperacion,
            descripcionBreve: descripcionBreve,
            fechaInicioOperacion: fechaInicioOperacion ? new Date(fechaInicioOperacion) : null,
            origen: origen,
            juzgadoInicial: juzgadoInicial,
            tipologiaDelictiva: tipologiaDelictiva,
            dolenciasPreviasYJuzgados: dolenciasPreviasYJuzgados,
            diligenciasPolicialesMain: diligenciasPolicialesMain,

            historicoInhibicionesJuzgados: window.getHistoricoInhibiciones(), // Corrected call
            diligenciasPreviasJuzgados: window.getDiligenciasPreviasJuzgados(), // Corrected call
            historicoGeneralJuzgados: window.getHistoricoGeneralJuzgados(), // Corrected call

            intervencionesTelefonicas: window.getIntervencionesTelefonicas(), // Corrected call
            entradasYRegistros: window.getEntradasYRegistros(), // Corrected call
            solicitudesJudiciales: window.getSolicitudesJudiciales(), // Corrected call
            colaboraciones: window.getColaboraciones(), // Corrected call

            detenidos: window.getDetenidos(), // Corrected call
            detenidosPrevistos: window.getDetenidosPrevistos(), // Corrected call
            otrasPersonas: window.getOtrasPersonas(), // Corrected call

            diligenciasPolicialesDoc: document.getElementById('diligenciasPolicialesDoc').value.trim(),
            oficiosJudiciales: document.getElementById('oficiosJudiciales').value.trim(),
            documentosAdjuntos: document.getElementById('documentosAdjuntos').value.trim(),

            anotacionesTexto: anotacionesTexto,
            anotacionRelevante: anotacionRelevante,
            anotacionConfidencial: anotacionConfidencial,
        };

        currentDocId = await saveData(collectionName, opData, currentDocId);
        showStatus("Operación guardada correctamente.", false);
        await fetchDataForSelect(collectionName, 'opList', 'nombreOperacion', 'anio', currentGroup);
        document.querySelector(`#opList option[value='${currentDocId}']`).selected = true;

    } catch(e) {
        showStatus(`Error al guardar la operación: ${e.message}.`, true);
    } finally {
        showSpinner(false);
    }
};

/**
 * Generic function to load and display items from a subcollection.
 * Added sortFunction parameter for in-memory sorting.
 */
const loadSubCollection = async (opId, collectionName, listElementId, sortFunction, renderFunc) => {
    const listElement = document.getElementById(listElementId);
    if (!listElement) return; // Guard against element not being present
    listElement.innerHTML = '';
    if (!userId) {
        console.warn(`loadSubCollection: userId no disponible para ${collectionName}.`);
        return;
    }
    const q = query(collection(db, `artifacts/${appId}/users/${userId}/operations`, opId, collectionName));
    const snapshot = await getDocs(q);
    let items = [];
    snapshot.forEach(doc => {
        items.push({id: doc.id, ...doc.data()});
    });

    items.sort(sortFunction);

    let itemsHtml = '';
    items.forEach(item => {
        itemsHtml += renderFunc(item);
    });
    listElement.innerHTML = itemsHtml;
};

/**
 * Adds an item to a subcollection (used for Chronology and Operation-specific Pending Tasks).
 * @param {string} subCollectionName - Name of the subcollection (e.g., 'chronology').
 * @param {object} data - The item data.
 * @param {string} listElementId - ID of the UL/container to display the item.
 * @param {function} renderFunc - Function to render the item HTML.
 */
const addRelatedItem = async (subCollectionName, data, listElementId, renderFunc) => {
    if (!currentDocId) {
        showStatus("Primero debe guardar la operación principal.", true);
        return;
    }
    if (!userId) {
        showStatus('Usuario no autenticado. Por favor, recargue la página o revise la configuración de Firebase.', true);
        return;
    }
    showSpinner(true);
    try {
        const subCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/operations`, currentDocId, subCollectionName);
        const completeData = { ...data, createdAt: serverTimestamp() };
        const docRef = await addDoc(subCollectionRef, completeData);
        
        const listElement = document.getElementById(listElementId);
        const newItemHtml = renderFunc({id: docRef.id, ...completeData});
        listElement.insertAdjacentHTML('beforeend', newItemHtml);

    } catch (e) {
        console.error(`Error adding to ${subCollectionName}:`, e);
        showStatus(`Error al añadir el elemento: ${e.message}.`, true);
    } finally {
        showSpinner(false);
    }
};

const addPendingTaskToOperation = async () => {
     const desc = document.getElementById('pendDesc').value.trim();
     const fechaLimite = document.getElementById('pendDate').value;
     if (!desc) {
         showStatus("La descripción del pendiente es obligatoria.", true);
         return;
     }
     const data = {
         descripcion: desc,
         fechaLimite: fechaLimite,
         estado: 'Pendiente',
         operationId: currentDocId // Link task to operation
     };
     await addRelatedItem('pendingTasks', data, 'pendingList', item => `
            <li class="flex justify-between items-center ${new Date(item.fechaLimite) < new Date() && item.estado !== 'Completado' ? 'text-red-500' : ''}">
                <span>${item.descripcion} (Vence: ${item.fechaLimite})</span>
                ${item.estado !== 'Completado' ? `<button data-task-id="${item.id}" class="ml-2 text-xs text-white bg-green-500 px-2 py-1 rounded complete-task-btn">Hecho</button>` : '<span class="ml-2 text-xs text-green-600">(Completado)</span>'}
            </li>`);
     document.getElementById('pendDesc').value = '';
     document.getElementById('pendDate').value = '';
     // Re-attach event listeners after adding a new item
     document.querySelectorAll('.complete-task-btn').forEach(btn => btn.addEventListener('click', () => completePendingTask(btn.dataset.taskId, true)));
};

/**
 * Marks a pending task as completed.
 * @param {string} taskId - The ID of the task in Firestore.
 * @param {boolean} isFromOperationForm - True if called from operation form to reload list.
 */
const completePendingTask = async (taskId, isFromOperationForm = false) => {
    if (!taskId) return;
    showSpinner(true);
    try {
        if (!userId) {
            showStatus('Usuario no autenticado. Por favor, recargue la página o revise la configuración de Firebase.', true);
            showSpinner(false);
            return;
        }
        if (isFromOperationForm && currentDocId) { // Task is part of an operation subcollection
             const taskRef = doc(db, `artifacts/${appId}/users/${userId}/operations`, currentDocId, "pendingTasks", taskId);
             await setDoc(taskRef, { estado: 'Completado' }, { merge: true });
             // Reload the specific pending tasks list for the current operation
             await loadSubCollection(currentDocId, 'pendingTasks', 'pendingList', (a, b) => {
                const dateA = new Date(a.fechaLimite);
                const dateB = new Date(b.fechaLimite);
                return dateA - dateB; // Ascending by date
            }, item => `
                <li class="flex justify-between items-center ${new Date(item.fechaLimite) < new Date() && item.estado !== 'Completado' ? 'text-red-500' : ''}">
                    <span>${item.descripcion} (Vence: ${item.fechaLimite})</span>
                    ${item.estado !== 'Completado' ? `<button data-task-id="${item.id}" class="ml-2 text-xs text-white bg-green-500 px-2 py-1 rounded complete-task-btn">Hecho</button>` : '<span class="ml-2 text-xs text-green-600">(Completado)</span>'}
                </li>`);
             document.querySelectorAll('.complete-task-btn').forEach(btn => btn.addEventListener('click', () => completePendingTask(btn.dataset.taskId, true)));
        } else { // Task is a global pending task
            const taskRef = doc(db, `artifacts/${appId}/users/${userId}/pendingTasks`, taskId);
            await setDoc(taskRef, { estado: 'Completado' }, { merge: true });
            fetchGlobalPendingTasks(); // Refresh the global list
        }
        
        showStatus("Tarea completada.", false);
    } catch (e) {
        console.error("Error completing task:", e);
        showStatus(`Error al completar la tarea: ${e.message}.`, true);
    } finally {
        showSpinner(false);
    }
};

const fetchGlobalPendingTasks = async () => {
    const tbody = document.getElementById('globalPendingTableBody');
    if(!tbody) return;
    tbody.innerHTML = ''; // Clear existing
    showSpinner(true);
    try {
        if (!userId) {
            console.warn("fetchGlobalPendingTasks: userId no disponible.");
            tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-500">Autenticando usuario...</td></tr>';
            showSpinner(false);
            return;
        }
        const q = query(
            collection(db, `artifacts/${appId}/users/${userId}/pendingTasks`), 
            where("estado", "==", "Pendiente")
        );
        const snapshot = await getDocs(q);
        
        let tasks = []; // Collect all tasks first
        snapshot.forEach(docSnapshot => {
            tasks.push({id: docSnapshot.id, ...docSnapshot.data()});
        });

        // Sort tasks in memory by fechaLimite ascending
        tasks.sort((a, b) => {
            const dateA = new Date(a.fechaLimite);
            const dateB = new Date(b.fechaLimite);
            return dateA - dateB;
        });

        let opCache = {};

        for (const task of tasks) { // Iterate through sorted tasks
            let opIdentifier = '- General -';

            if (task.operationId) { // If task is linked to an operation
                if (!opCache[task.operationId]) {
                     const opDoc = await getDoc(doc(db, `artifacts/${appId}/users/${userId}/operations`, task.operationId));
                     if (opDoc.exists()) {
                         const opData = opDoc.data();
                         opCache[task.operationId] = `${opData.grupo} ${opData.codigo || 'N/A'}/${opData.anio || 'N/A'}`;
                     } else {
                         opCache[task.operationId] = 'Operación borrada';
                     }
                }
                opIdentifier = opCache[task.operationId];
            }
            
            const isOverdue = new Date(task.fechaLimite) < new Date();
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm ${isOverdue ? 'text-red-600 font-bold' : 'text-slate-900'}">${task.descripcion}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm ${isOverdue ? 'text-red-600 font-bold' : 'text-slate-500'}">${task.fechaLimite}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${opIdentifier}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button data-task-id="${task.id}" class="complete-global-task-btn text-green-600 hover:text-green-900">Marcar Hecho</button>
                </td>
            `;
            tbody.appendChild(row);
        }
        document.querySelectorAll('.complete-global-task-btn').forEach(btn => btn.addEventListener('click', () => completePendingTask(btn.dataset.taskId, false)));
    } catch (e) {
        console.error("Error fetching global tasks:", e);
        tbody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-red-500">Error al cargar tareas pendientes: ${e.message}.</td></tr>`;
    } finally {
        showSpinner(false);
    }
};

const addGeneralPendingTask = async () => {
    const desc = document.getElementById('newTaskDesc').value.trim();
    const fecha = document.getElementById('newTaskDate').value;
    if (!desc) {
        showStatus("La descripción es obligatoria.", true);
        return;
    }
    if (!userId) {
        showStatus('Usuario no autenticado. Por favor, recargue la página o revise la configuración de Firebase.', true);
        return;
    }
    showSpinner(true);
    try {
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/pendingTasks`), {
            descripcion: desc,
            fechaLimite: fecha,
            estado: 'Pendiente',
            createdAt: serverTimestamp(),
            operationId: null // Explicitly null for general tasks
        });
        showStatus("Tarea general añadida.", false);
        document.getElementById('newTaskDesc').value = '';
        document.getElementById('newTaskDate').value = '';
        fetchGlobalPendingTasks(); // Refresh list
    } catch (e) {
        console.error("Error adding general task:", e);
        showStatus(`Error al añadir la tarea: ${e.message}.`, true);
    } finally {
        showSpinner(false);
    }
};

const generateStats = async () => {
    const resultDiv = document.getElementById('statsResult');
    if(!resultDiv) return;
    resultDiv.innerHTML = '';
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    if (!startDate || !endDate) {
        showStatus("Debe seleccionar un rango de fechas.", true);
        return;
    }
    if (!userId) {
        showStatus('Usuario no autenticado. Por favor, recargue la página o revise la configuración de Firebase.', true);
        showSpinner(false);
        return;
    }
    showSpinner(true);
    try {
        const startTimestamp = new Date(startDate);
        const endTimestamp = new Date(endDate);
        endTimestamp.setHours(23, 59, 59, 999); // Include the whole end day

        // Get all collection names that store data
        const allDataCollections = Object.values(groups)
            .filter(g => g.collection !== null && g.collection !== 'estadistica')
            .map(g => g.collection);
        
        // Ensure unique collection names
        const uniqueDataCollections = [...new Set(allDataCollections)];

        const stats = {};
        for (const key in groups) {
            if (key !== 'estadistica') stats[groups[key].name] = 0;
        }
        
        let total = 0;

        for (const colName of uniqueDataCollections) {
            const q = query(
                collection(db, `artifacts/${appId}/users/${userId}/${colName}`), 
                where("fecha", ">=", startTimestamp), 
                where("fecha", "<=", endTimestamp)
            );
            const snapshot = await getDocs(q);
            snapshot.forEach(docSnapshot => {
                const data = docSnapshot.data();
                let groupNameForStats = data.grupo; // Prefer 'grupo' field if present
                if (!groupNameForStats) { // Fallback if 'grupo' field is not in the doc
                     // Try to find the group name by matching the collection
                    const matchedGroup = Object.values(groups).find(g => g.collection === colName);
                    if (matchedGroup) {
                        groupNameForStats = matchedGroup.name;
                    }
                }

                if (groupNameForStats) {
                    stats[groupNameForStats] = (stats[groupNameForStats] || 0) + 1;
                    total++;
                }
            });
        }
        

        let tableHtml = `
        <table class="min-w-full divide-y divide-slate-200 mt-4">
            <thead class="bg-slate-50"><tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Grupo</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Registros</th>
            </tr></thead>
            <tbody class="bg-white divide-y divide-slate-200">`;

        // Sort stats alphabetically by group name for consistent display
        const sortedStats = Object.keys(stats).sort().reduce(
            (obj, key) => { 
                obj[key] = stats[key]; 
                return obj;
            }, 
            {}
        );

        for (const groupName in sortedStats) {
            tableHtml += `<tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">${groupName}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${sortedStats[groupName]}</td>
            </tr>`;
        }
        
        tableHtml += `<tr class="bg-slate-100 font-bold">
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-900">Total</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-900">${total}</td>
        </tr></tbody></table>`;

        resultDiv.innerHTML = tableHtml;

    } catch (e) {
        console.error("Error generating stats:", e);
        resultDiv.innerHTML = `<p class="text-red-500">Error al generar las estadísticas: ${e.message}.</p>`;
    } finally {
        showSpinner(false);
    }
};

/**
 * Generates a printable report for the current Group 2/3 operation.
 */
const generateOperationReport = async () => {
    if (!currentDocId) {
        showStatus("No hay una operación cargada para generar el informe.", true);
        return;
    }
    showSpinner(true);
    try {
        const op = await loadData(groups[currentGroup].collection, currentDocId);
        if (!op) {
            showStatus("No se pudo cargar la operación para el informe.", true);
            return;
        }

        let reportContent = `
            <style>
                body { font-family: 'Inter', sans-serif; margin: 20px; color: #333; }
                h1 { color: #2c3e50; font-size: 24px; margin-bottom: 15px; }
                h2 { color: #34495e; font-size: 20px; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
                p { margin-bottom: 8px; line-height: 1.5; }
                .section { background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #eee; }
                .section p strong { color: #555; }
                ul { list-style-type: disc; margin-left: 20px; padding-left: 0; }
                li { margin-bottom: 5px; }
                @media print {
                    body { margin: 0; }
                    .section { page-break-inside: avoid; }
                }
            </style>
            <h1>Informe de Operación: ${op.nombreOperacion || 'Sin nombre'}</h1>
            <p><strong>Código:</strong> ${op.codigo || 'N/A'}/${op.anio || 'N/A'}</p>
            <p><strong>Grupo:</strong> ${op.grupo || 'N/A'}</p>
            <p><strong>Fecha de Creación:</strong> ${formatDate(op.fecha)}</p>
            <p><strong>Descripción Breve:</strong> ${op.descripcionBreve || 'N/A'}</p>
            <p><strong>Fecha de Inicio Operación:</strong> ${formatDate(op.fechaInicioOperacion)}</p>
            <p><strong>Origen:</strong> ${op.origen || 'N/A'}</p>
            <p><strong>Tipología Delictiva:</strong> ${op.tipologiaDelictiva || 'N/A'}</p>
            <p><strong>Dolencias Previas y Juzgados:</strong> ${op.dolenciasPreviasYJuzgados || 'N/A'}</p>
            <p><strong>Diligencias Policiales (Principales):</strong> ${op.diligenciasPolicialesMain || 'N/A'}</p>
        `;

        // Juzgados
        reportContent += `<h2>Juzgados</h2>`;
        reportContent += `<p><strong>Juzgado Inicial:</strong> ${op.juzgadoInicial || 'N/A'}</p>`;
        reportContent += `<h3>Diligencias Previas (Juzgados con fecha):</h3>`;
        if (op.diligenciasPreviasJuzgados && op.diligenciasPreviasJuzgados.length > 0) {
            reportContent += `<ul>`;
            op.diligenciasPreviasJuzgados.forEach(item => {
                reportContent += `<li><strong>Fecha:</strong> ${item.fecha || 'N/A'}, <strong>Juzgado:</strong> ${item.juzgado || 'N/A'}</li>`;
            });
            reportContent += `</ul>`;
        } else { reportContent += `<p>N/A</p>`; }
        reportContent += `<h3>Inhibiciones:</h3>`;
        if (op.historicoInhibicionesJuzgados && op.historicoInhibicionesJuzgados.length > 0) {
            reportContent += `<ul>`;
            op.historicoInhibicionesJuzgados.forEach(item => {
                reportContent += `<li><strong>Juzgado:</strong> ${item.juzgado || 'N/A'}, <strong>Fecha:</strong> ${item.fecha || 'N/A'}</li>`;
            });
            reportContent += `</ul>`;
        } else { reportContent += `<p>N/A</p>`; }
        reportContent += `<h3>Histórico de Juzgados:</h3>`;
        if (op.historicoGeneralJuzgados && op.historicoGeneralJuzgados.length > 0) {
            reportContent += `<ul>`;
            op.historicoGeneralJuzgados.forEach(item => {
                reportContent += `<li><strong>Fecha:</strong> ${item.fecha || 'N/A'}, <strong>Juzgado:</strong> ${item.juzgado || 'N/A'}, <strong>Evento:</strong> ${item.evento || 'N/A'}</li>`;
            });
            reportContent += `</ul>`;
        } else { reportContent += `<p>N/A</p>`; }

        // Intervenciones / Medidas
        reportContent += `<h2>Intervenciones / Medidas</h2>`;
        reportContent += `<h3>Intervenciones Telefónicas:</h3>`;
        if (op.intervencionesTelefonicas && op.intervencionesTelefonicas.length > 0) {
            reportContent += `<ul>`;
            op.intervencionesTelefonicas.forEach(item => { reportContent += `<li>${item.descripcion || 'N/A'}</li>`; });
            reportContent += `</ul>`;
        } else { reportContent += `<p>N/A</p>`; }
        reportContent += `<h3>Entradas y Registros:</h3>`;
        if (op.entradasYRegistros && op.entradasYRegistros.length > 0) {
            reportContent += `<ul>`;
            op.entradasYRegistros.forEach(item => { reportContent += `<li>${item.descripcion || 'N/A'}</li>`; });
            reportContent += `</ul>`;
        } else { reportContent += `<p>N/A</p>`; }
        reportContent += `<h3>Solicitudes Judiciales:</h3>`;
        if (op.solicitudesJudiciales && op.solicitudesJudiciales.length > 0) {
            reportContent += `<ul>`;
            op.solicitudesJudiciales.forEach(item => { reportContent += `<li><strong>Tipo:</strong> ${item.tipo || 'N/A'}, <strong>Descripción:</strong> ${item.descripcion || 'N/A'}</li>`; });
            reportContent += `</ul>`;
        } else { reportContent += `<p>N/A</p>`; }
        reportContent += `<h3>Colaboraciones:</h3>`;
        if (op.colaboraciones && op.colaboraciones.length > 0) {
            reportContent += `<ul>`;
            op.colaboraciones.forEach(item => { reportContent += `<li><strong>Fecha:</strong> ${item.fecha || 'N/A'}, <strong>Grupo/Institución:</strong> ${item.grupoInstitucion || 'N/A'}, <strong>Tipo:</strong> ${item.tipoColaboracion || 'N/A'}</li>`; });
            reportContent += `</ul>`;
        } else { reportContent += `<p>N/A</p>`; }

        // Cronología (as subcollection, so fetch separately)
        // Use a direct subcollection query here as loadData loads single documents.
        const chronologySnapshot = await getDocs(collection(db, `artifacts/${appId}/users/${userId}/operations`, currentDocId, 'chronology'));
        const chronologicalEvents = chronologySnapshot.docs.map(d => d.data()).sort((a,b) => (a.createdAt?.toDate() || new Date(0)) - (b.createdAt?.toDate() || new Date(0)));
        reportContent += `<h2>Cronología</h2>`;
        if (chronologicalEvents && chronologicalEvents.length > 0) {
            reportContent += `<ul>`;
            chronologicalEvents.forEach(item => { reportContent += `<li>${formatDateTime(item.createdAt)} - ${item.descripcion || 'N/A'}</li>`; });
            reportContent += `</ul>`;
        } else { reportContent += `<p>N/A</p>`; }


        // Personas Vinculadas
        reportContent += `<h2>Personas Vinculadas</h2>`;
        reportContent += `<h3>Detenidos:</h3>`;
        if (op.detenidos && op.detenidos.length > 0) {
            reportContent += `<ul>`;
            op.detenidos.forEach(item => { reportContent += `<li><strong>Filiación/Delito:</strong> ${item.filiacionDelito || 'N/A'}, <strong>Nac.:</strong> ${item.nacionalidad || 'N/A'}, <strong>Fecha Det.:</strong> ${item.fechaDetencion || 'N/A'}, <strong>Ordinal:</strong> ${item.ordinal || 'N/A'}</li>`; });
            reportContent += `</ul>`;
        } else { reportContent += `<p>N/A</p>`; }
        reportContent += `<h3>Detenidos Previstos / Pendientes:</h3>`;
        if (op.detenidosPrevistos && op.detenidosPrevistos.length > 0) {
            reportContent += `<ul>`;
            op.detenidosPrevistos.forEach(item => { reportContent += `<li><strong>Filiación/Delito:</strong> ${item.filiacionDelito || 'N/A'}, <strong>Nac.:</strong> ${item.nacionalidad || 'N/A'}, <strong>Fecha Prev.:</strong> ${item.fechaPrevista || 'N/A'}, <strong>Ordinal:</strong> ${item.ordinal || 'N/A'}</li>`; });
            reportContent += `</ul>`;
        } else { reportContent += `<p>N/A</p>`; }
        reportContent += `<h3>Otras Personas:</h3>`;
        if (op.otrasPersonas && op.otrasPersonas.length > 0) {
            reportContent += `<ul>`;
            op.otrasPersonas.forEach(item => { reportContent += `<li><strong>Filiación:</strong> ${item.filiacion || 'N/A'}, <strong>Tipo:</strong> ${item.tipoVinculacion || 'N/A'}, <strong>Nac.:</strong> ${item.nacionalidad || 'N/A'}, <strong>Teléfono:</strong> ${item.telefono || 'N/A'}</li>`; });
            reportContent += `</ul>`;
        } else { reportContent += `<p>N/A</p>`; }

        // Documentación
        reportContent += `<h2>Documentación</h2>`;
        reportContent += `<p><strong>Diligencias Policiales:</strong> ${op.diligenciasPolicialesDoc || 'N/A'}</p>`;
        reportContent += `<p><strong>Oficios Judiciales:</strong> ${op.oficiosJudiciales || 'N/A'}</p>`;
        reportContent += `<p><strong>Documentos Adjuntos:</strong> ${op.documentosAdjuntos || 'N/A'}</p>`;

        // Anotaciones / Observaciones
        reportContent += `<h2>Anotaciones / Observaciones</h2>`;
        reportContent += `<p>${op.anotacionesTexto || 'N/A'}</p>`;
        reportContent += `<p><strong>Relevante:</strong> ${op.anotacionRelevante ? 'Sí' : 'No'}</p>`;
        reportContent += `<p><strong>Confidencial:</strong> ${op.anotacionConfidencial ? 'Sí' : 'No'}</p>`;

        // Elements Pendientes (Operation) (as subcollection)
        const pendingTasksSnapshot = await getDocs(collection(db, `artifacts/${appId}/users/${userId}/operations`, currentDocId, 'pendingTasks'));
        const pendingTasks = pendingTasksSnapshot.docs.map(d => d.data()).sort((a,b) => new Date(a.fechaLimite) - new Date(b.fechaLimite));
        reportContent += `<h2>Elementos Pendientes (Operación)</h2>`;
        if (pendingTasks && pendingTasks.length > 0) {
            reportContent += `<ul>`;
            pendingTasks.forEach(item => {
                reportContent += `<li><strong>Descripción:</strong> ${item.descripcion || 'N/A'}, <strong>Vence:</strong> ${item.fechaLimite || 'N/A'}, <strong>Estado:</strong> ${item.estado || 'N/A'}</li>`;
            });
            reportContent += `</ul>`;
        } else { reportContent += `<p>N/A</p>`; }


        const printWindow = window.open('', '_blank');
        printWindow.document.write(reportContent);
        printWindow.document.close();
        printWindow.print(); // Open print dialog immediately

    } catch (e) {
        console.error("Error generating report:", e);
        showStatus(`Error al generar el informe: ${e.message}.`, true);
    } finally {
        showSpinner(false);
    }
};


// --- EVENT LISTENERS (Initial setup and dynamic attachment) ---

const setupStatisticsEventListeners = () => {
    document.getElementById('statsBtn').addEventListener('click', generateStats);
    document.getElementById('addTaskBtn').addEventListener('click', addGeneralPendingTask);
};

// --- INITIALIZATION ---

const init = () => {
    try {
         initFirebase();
        
        onAuthStateChanged(auth, async (user) => { 
            if (user) {
                userId = user.uid;
                console.log("User authenticated:", userId);
                renderMenu();
            } else {
                try {
                    if (typeof __initial_auth_token !== 'undefined') {
                        await signInWithCustomToken(auth, __initial_auth_token);
                    } else {
                        await signInAnonymously(auth);
                    }
                    userId = auth.currentUser?.uid || crypto.randomUUID(); 
                    console.log("Authenticated anonymously or with token:", userId);
                    renderMenu();
                } catch (error) {
                    console.error("Authentication failed:", error);
                    mainContent().innerHTML = `<div class="text-center p-8 text-red-500">
                        <h2 class="text-xl font-bold">Error de Autenticación de Firebase</h2>
                        <p class="mt-2">La aplicación no pudo iniciar sesión. Por favor, asegúrate de que el **método de inicio de sesión anónimo** está habilitado en tu proyecto Firebase (Autenticación > Método de inicio de sesión).</p>
                        <p class="mt-2">También, verifica las **Reglas de Seguridad de Firestore** para permitir la lectura y escritura para usuarios autenticados en la ruta de tu colección (<code>artifacts/{appId}/users/{userId}/{document=**}</code>).</p>
                        <p class="mt-2"><b>Error de Firebase:</b> ${error.message}</p>
                    </div>`;
                }
            }
        });

    } catch (e) {
        console.error("Firebase initialization failed:", e);
        mainContent().innerHTML = `<div class="text-center p-8 text-red-500">
            <h2 class="text-xl font-bold">Error de Configuración de Firebase</h2>
 <p class="mt-2">La aplicación no se pudo iniciar. Revisa la configuración de Firebase en el código.</p>            <p class="mt-2"><b>Error de Firebase:</b> ${e.message}</p>
        </div>`;
        return;
    }

    backButton().addEventListener('click', renderMenu);
};

// Initialize the app when the DOM is ready
document.addEventListener('DOMContentLoaded', init);
