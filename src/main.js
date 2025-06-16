import { initFirebase, db, auth } from './firebase.js';
import { signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, doc, addDoc, setDoc, getDoc, getDocs, query, where, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatDate, formatDateTime, showSpinner, showStatus, removeDynamicItem } from './utils.js';
import * as dynamicLists from './ui/dynamicLists.js';

// --- Firebase Configuration ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
let userId = null;

// --- App State ---
let currentView = 'menu';
let currentGroup = null;
let currentDocId = null;

// --- UI Elements ---
const mainContent = () => document.getElementById('main-content');
const headerTitle = () => document.getElementById('header-title');
const backButton = () => document.getElementById('back-button');

// --- Group Definitions ---
const groups = {
  'grupo1': { name: 'Grupo 1', description: 'Expulsiones', icon: '🚷', collection: 'expulsiones' },
  'grupo2': { name: 'Grupo 2', description: 'Investigación', icon: '🕵️‍♂️', collection: 'operaciones' },
  'grupo3': { name: 'Grupo 3', description: 'Operativo', icon: '👮‍♂️', collection: 'operaciones' },
  'grupo4': { name: 'Grupo 4', description: 'Operativo', icon: '👮‍♂️', collection: 'grupo4Operaciones' },
  'puerto': { name: 'Puerto', description: 'Controles y actuaciones', icon: '⚓', collection: 'puertoControles' },
  'cie': { name: 'CIE', description: 'Centro de Internamiento', icon: '🏢', collection: 'cieInternamiento' },
  'gestion': { name: 'Gestión', description: 'Asilos, cartas, trámites', icon: '🗂️', collection: 'gestionTramites' },
  'estadistica': { name: 'Estadística', description: 'Datos y pendientes', icon: '📊', collection: null },
  'cecorex': { name: 'CECOREX', description: 'Centro Coordinación', icon: '📞', collection: 'cecorexCoordinacion' }
};

window.removeDynamicItem = removeDynamicItem;

// --- FIRESTORE GENERIC FUNCTIONS ---
async function saveData(collectionName, data, docId = null) {
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
}

async function loadData(collectionName, docId) {
  if (!userId) {
    showStatus('Error: Usuario no autenticado para cargar datos. Recargue o revise Firebase.', true);
    throw new Error("User not authenticated.");
  }
  try {
    const docRef = doc(db, `artifacts/${appId}/users/${userId}/${collectionName}`, docId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  } catch (e) {
    console.error(`Error al cargar desde ${collectionName}: `, e);
    showStatus(`Error al cargar: ${e.message}. Verifique reglas de seguridad.`, true);
    throw e;
  }
}

async function fetchDataForSelect(collectionName, selectId, field1, field2 = null, groupFilter = null) {
  if (!userId) return;
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Seleccionar para cargar --</option>';
  showSpinner(true);
  try {
    let qref = collection(db, `artifacts/${appId}/users/${userId}/${collectionName}`);
    if (groupFilter) qref = query(qref, where('grupo', '==', groups[groupFilter].name));
    const snap = await getDocs(qref);
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a,b)=>{
      const da = a.createdAt instanceof Timestamp ? a.createdAt.toDate() : new Date(a.createdAt);
      const db_ = b.createdAt instanceof Timestamp ? b.createdAt.toDate() : new Date(b.createdAt);
      return db_ - da;
    });
    docs.forEach(docItem => {
      const opt = document.createElement('option');
      opt.value = docItem.id;
      let text = docItem[field1] || 'Sin nombre';
      if (field2 && docItem[field2]) text += ` (${docItem[field2]})`;
      if (docItem.codigo) text = `${docItem.codigo}/${docItem.anio} - ${text}`;
      opt.textContent = text;
      sel.appendChild(opt);
    });
  } catch(e) {
    console.error(e);
    showStatus(`Error al cargar listado: ${e.message}.`, true);
  } finally { showSpinner(false); }
}

async function getNextCode(collectionName, groupName, year) {
  if (!userId) return 1;
  const qref = query(collection(db, `artifacts/${appId}/users/${userId}/${collectionName}`), where('grupo','==',groupName), where('anio','==',year));
  const snap = await getDocs(qref);
  let codes = [];
  snap.forEach(d=>{ if (d.data().codigo) codes.push(Number(d.data().codigo)); });
  codes.sort((a,b)=>b-a);
  return codes.length?codes[0]+1:1;
}

// Re-export dynamic lists
Object.assign(window, dynamicLists);

// --- VIEW RENDERING & NAVIGATION ---
function renderMenu() {
  currentView = 'menu';
  headerTitle().textContent = 'UCRIF · Menú Principal de Novedades';
  backButton().classList.add('hidden');
  let html = '<div class="grid ...">';
  for(const key in groups){ const g=groups[key]; html+=`<button data-group="${key}" ...>${g.icon}<br>${g.name}</button>`; }
  html+='</div>';
  mainContent().innerHTML = html;
  document.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>navigateTo(b.dataset.group));
}

function navigateTo(groupKey) {
  currentGroup = groupKey;
  headerTitle().textContent = `UCRIF · ${groups[groupKey].name}`;
  backButton().classList.remove('hidden');
  currentDocId = null;
  if (groupKey==='estadistica') renderStatistics();
  else if (groupKey==='grupo2'||groupKey==='grupo3') renderGroup2and3Form(groupKey);
  else renderSpecificGroupForm(groupKey);
}

async function renderSpecificGroupForm(groupKey) {
  currentView='specificForm';
  const grp=groups[groupKey];
  let formHtml = `<div>... campos de ${grp.name} ...</div>`;
  mainContent().innerHTML = formHtml;
  document.getElementById('newDocBtn').onclick=()=>resetSpecificForm(grp.collection);
  document.getElementById('loadDocBtn').onclick=()=>loadSpecificDoc(grp.collection, dataMapping);
  document.getElementById('saveDocBtn').onclick=()=>saveSpecificDoc(grp.collection, dataMapping);
  await resetSpecificForm(grp.collection);
}

async function loadSpecificDoc(collectionName,dataMapping){ /*...*/ }
async function saveSpecificDoc(collectionName,dataMapping){ /*...*/ }
async function resetSpecificForm(collectionName){ /*...*/ }

function renderGroup2and3Form(groupKey){
  currentView='operationForm';
  const grp=groups[groupKey];
  let html=`<div>... formulario detallado ... <button id="generateReportBtn">Generar Informe Automático</button></div>`;
  mainContent().innerHTML=html;
  document.getElementById('generateReportBtn').onclick=generateOperationReport;
  document.getElementById('newOpBtn').onclick=()=>resetGroup2and3Form();
  document.getElementById('loadOpBtn').onclick=()=>loadOperation(grp.collection);
  document.getElementById('saveOpBtn').onclick=()=>saveOperation(grp.collection);
  resetGroup2and3Form();
}

async function generateOperationReport(){
  if(!currentDocId){ showStatus("No hay una operación cargada...",true); return; }
  showSpinner(true);
  try{
    const op=await loadData(groups[currentGroup].collection,currentDocId);
    let report=`<style>/* estilos */</style><h1>Informe: ${op.nombreOperacion}</h1>`;
    // ... construir contenido completo con op datos ...
    const w=window.open('','_blank'); w.document.write(report); w.document.close(); w.print();
  }catch(e){ console.error(e); showStatus(`Error al generar el informe: ${e.message}`,true); }
  finally{ showSpinner(false); }
}

async function resetGroup2and3Form(fetchOps=true){ /*...*/ }
async function loadOperation(collectionName){ /*...*/ }
async function saveOperation(collectionName){ /*...*/ }

async function loadSubCollection(opId,subName,listId,sortFn,renderFn){ /*...*/ }
async function addRelatedItem(subName,data,listId,renderFn){ /*...*/ }
async function completePendingTask(taskId,isOp=false){ /*...*/ }
async function fetchGlobalPendingTasks(){ /*...*/ }
async function addGeneralPendingTask(){ /*...*/ }
async function generateStats(){ /*...*/ }
function renderStatistics(){ /*...*/ }

// --- AUTH & INIT ---
function showAuthError(error){ mainContent().innerHTML=`<div>Error de Autenticación: ${error.message}</div>`; }
function showFirebaseConfigError(e){ mainContent().innerHTML=`<div>Error Config Firebase: ${e.message}</div>`; }

async function authenticateAndRenderMenu(){
  try{
    if(typeof __initial_auth_token!=='undefined') await signInWithCustomToken(auth,__initial_auth_token);
    else await signInAnonymously(auth);
    userId=auth.currentUser?.uid||crypto.randomUUID();
    renderMenu();
  }catch(err){ showAuthError(err); }
}

function init(){
  try{
    initFirebase();
    onAuthStateChanged(auth,user=>{ if(user){ userId=user.uid; renderMenu(); } else authenticateAndRenderMenu(); });
  }catch(e){ showFirebaseConfigError(e); return; }
  backButton().onclick=renderMenu;
}

document.addEventListener('DOMContentLoaded',init);
