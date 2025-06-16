import { db }            from '../firebase.js';
import { appId, userId } from '../state.js';
import { groups }        from '../groups.js';
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  query, where, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { showSpinner, showStatus } from '../utils.js';

// ---------------------------------------------------------------------------
// GUARDAR / CARGAR documentos principales
// ---------------------------------------------------------------------------
export async function saveData (collectionName, data, docId = null) {
  if (!userId) { showStatus('Usuario no autenticado', true); throw new Error('No auth'); }

  const userCol = collection(db, `artifacts/${appId}/${collectionName}`);

  if (docId) {
    await setDoc(doc(userCol, docId), { ...data, updatedAt: serverTimestamp() }, { merge:true });
    return docId;
  }

  const ref = await addDoc(userCol, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function loadData (collectionName, docId) {
  if (!userId) { showStatus('Usuario no autenticado', true); throw new Error('No auth'); }

  const snap = await getDoc(doc(db, `artifacts/${appId}/${collectionName}`, docId));
  return snap.exists() ? snap.data() : null;
}

// ---------------------------------------------------------------------------
// LISTADOS para <select>
// ---------------------------------------------------------------------------
export async function fetchDataForSelect (
  collectionName, selectId, display1, display2 = null, groupKey = null
) {
  if (!userId) return;
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = '<option value="">-- Seleccionar --</option>';
  showSpinner(true);

  let q = collection(db, `artifacts/${appId}/${collectionName}`);
  if (groupKey) q = query(q, where('grupo', '==', groups[groupKey].name));

  const docs = (await getDocs(q)).docs.map(d => ({ id:d.id, ...d.data() }));

  docs.sort((a,b) => {
    const aDate = a.createdAt ? (a.createdAt instanceof Timestamp ? a.createdAt.toDate() : new Date(a.createdAt)) : new Date(0);
    const bDate = b.createdAt ? (b.createdAt instanceof Timestamp ? b.createdAt.toDate() : new Date(b.createdAt)) : new Date(0);
    return bDate - aDate;
  });

  docs.forEach(d => {
    const opt = document.createElement('option');
    let text  = d[display1] || 'Sin nombre';
    if (display2 && d[display2]) text += ` (${d[display2]})`;
    if (d.codigo) text = `${d.codigo}/${d.anio} - ${text}`;
    opt.value = d.id;
    opt.textContent = text.length > 100 ? text.slice(0,100)+'…' : text;
    select.appendChild(opt);
  });

  showSpinner(false);
}

// ---------------------------------------------------------------------------
// Cálculo del siguiente código correlativo
// ---------------------------------------------------------------------------
export async function getNextCode (collectionName, groupName, year) {
  if (!userId) return 1;

  const q = query(
    collection(db, `artifacts/${appId}/${collectionName}`),
    where('grupo','==', groupName),
    where('anio', '==', year)
  );
  const snap  = await getDocs(q);
  const codes = snap.docs.map(d => Number(d.data().codigo || 0)).sort((a,b)=>b-a);
  return codes.length ? codes[0]+1 : 1;
}

// ---------------------------------------------------------------------------
// Sub-colecciones (cronología, pendientes, …)
// ---------------------------------------------------------------------------
export async function loadSubCollection (opId, subCol, listId, sortFn, renderFn) {
  if (!userId) return;
  const elm = document.getElementById(listId);
  if (!elm)  return;

  const q     = collection(db, `artifacts/${appId}/operations`, opId, subCol);
  const items = (await getDocs(q)).docs.map(d => ({id:d.id, ...d.data()})).sort(sortFn);

  elm.innerHTML = items.map(renderFn).join('');
}

export async function addRelatedItem (opId, subCol, data) {
  if (!userId) throw new Error('No auth');
  const ref = collection(db, `artifacts/${appId}/operations`, opId, subCol);
  const docRef = await addDoc(ref, { ...data, createdAt: serverTimestamp() });
  return docRef.id;
}

// ---------------------------------------------------------------------------
// completar tarea, tareas globales, etc.
// ---------------------------------------------------------------------------
export async function completePendingTask (taskId, isOperationTask = false, opId = null) {
  if (!userId) throw new Error('No auth');
  showSpinner(true);
  try {
    let taskRef;
    if (isOperationTask && opId) {
      taskRef = doc(db, `artifacts/${appId}/operations`, opId, 'pendingTasks', taskId);
    } else {
      taskRef = doc(db, `artifacts/${appId}/pendingTasks`, taskId);
    }
    await setDoc(taskRef, { estado: 'Completado' }, { merge: true });
  } catch (e) {
    console.error('Error completing task:', e);
    throw e;
  } finally {
    showSpinner(false);
  }
}

export async function fetchGlobalPendingTasks () {
  if (!userId) return [];
  showSpinner(true);
  try {
    const q = query(
      collection(db, `artifacts/${appId}/pendingTasks`),
      where('estado', '==', 'Pendiente')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } finally {
    showSpinner(false);
  }
}
