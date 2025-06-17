// src/ui/grupo1.js
// Helpers to render Grupo 1 form pieces
import {
  getPersonasImplicadas,
  getExpulsados,
  getFletados,
  getConduccionesPositivas,
  getConduccionesNegativas,
  getGrupoPendientes
} from './dynamicLists.js';

export function getGrupo1Config(baseFields) {
  const formFields = `
    ${baseFields}
    <div class="mb-4">
      <label for="nombreActuacion">Nombre de la Actuación</label>
      <input type="text" id="nombreActuacion" class="w-full rounded border px-2 py-1">
    </div>
    <div class="mb-4">
      <label for="diligenciasActuaciones">Diligencias/Actuaciones</label>
      <textarea id="diligenciasActuaciones" class="w-full rounded border px-2 py-1" rows="3"></textarea>
    </div>
    <h4 class="mt-6 mb-2 font-semibold">Personas Implicadas</h4>
    <div id="personasImplicadasContainer" class="mb-4 border rounded p-2 max-h-60 overflow-y-auto"></div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
      <input type="text" id="impNombre" placeholder="Nombre" class="rounded border px-2 py-1">
      <input type="text" id="impNac" placeholder="Nacionalidad" class="rounded border px-2 py-1">
      <button onclick="addPersonaImplicada()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
    </div>
  `;

  const dynamicAdders = `
    <h4 class="mt-6 mb-2 font-semibold">Expulsados</h4>
    <div id="expulsadosContainer" class="mb-4 border rounded p-2 max-h-60 overflow-y-auto"></div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
      <input type="text" id="expNombre" placeholder="Nombre" class="rounded border px-2 py-1">
      <input type="text" id="expNac" placeholder="Nacionalidad" class="rounded border px-2 py-1">
      <button onclick="addExpulsado()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
    </div>
    <h4 class="mt-6 mb-2 font-semibold">Fletados</h4>
    <div id="fletadosContainer" class="mb-4 border rounded p-2 max-h-60 overflow-y-auto"></div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
      <input type="text" id="fletDestino" placeholder="Destino" class="rounded border px-2 py-1">
      <input type="number" id="fletPax" placeholder="Pax" class="rounded border px-2 py-1">
      <button onclick="addFletado()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
    </div>
    <h4 class="mt-6 mb-2 font-semibold">Conducciones Positivas</h4>
    <div id="conduccionesPositivasContainer" class="mb-4 border rounded p-2 max-h-60 overflow-y-auto"></div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end mb-4">
      <input type="text" id="cpDesc" placeholder="Descripción" class="rounded border px-2 py-1">
      <button onclick="addConduccionPositiva()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
    </div>
    <h4 class="mt-6 mb-2 font-semibold">Conducciones Negativas</h4>
    <div id="conduccionesNegativasContainer" class="mb-4 border rounded p-2 max-h-60 overflow-y-auto"></div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end mb-4">
      <input type="text" id="cnDesc" placeholder="Descripción" class="rounded border px-2 py-1">
      <button onclick="addConduccionNegativa()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
    </div>
    <h4 class="mt-6 mb-2 font-semibold">Pendientes de Gestión</h4>
    <ul id="grupoPendientesList" class="list-disc pl-5 mb-4 max-h-40 overflow-y-auto"></ul>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
      <input type="text" id="gpPendDesc" placeholder="Descripción" class="rounded border px-2 py-1">
      <input type="date" id="gpPendDate" class="rounded border px-2 py-1">
      <button onclick="addGrupoPendiente()" class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
    </div>
  `;

  const dataMap = {
    fecha: 'fecha',
    anio: 'anio',
    descripcionBreve: 'descripcionBreve',
    nombreActuacion: 'nombreActuacion',
    diligenciasActuaciones: 'diligenciasActuaciones',
    personasImplicadas: getPersonasImplicadas,
    expulsados: getExpulsados,
    fletados: getFletados,
    conduccionesPositivas: getConduccionesPositivas,
    conduccionesNegativas: getConduccionesNegativas,
    grupoPendientes: getGrupoPendientes
  };

  return { formFields, dynamicAdders, dataMap };
}
