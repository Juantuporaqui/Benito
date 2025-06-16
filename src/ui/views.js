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
  currentView='specific';
  const g = groups[groupKey];
  const coll = g.collection;

  // Build formFieldsHtml and dynamicAdders+dataMapping based on groupKey
  // ... (copy form HTML from main.js)

  // Attach event listeners:
  document.getElementById('newDocBtn').addEventListener('click', ()=> resetSpecificForm(coll));
  document.getElementById('loadDocBtn').addEventListener('click', ()=> loadSpecificDoc(coll,dataMapping));
  document.getElementById('saveDocBtn').addEventListener('click', ()=> saveSpecificDoc(coll,dataMapping));

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
