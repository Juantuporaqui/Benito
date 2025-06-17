// src/ui/grupo1.js
// Helpers to render Grupo 1 form pieces
import {
  getExpulsados,
  getFletados,
  getConduccionesPositivas,
  getConduccionesNegativas,
  getGrupoPendientes
} from './dynamicLists.js';

import { formatDate } from '../utils.js';

export function getGrupo1Config() {
  const formFields = ``;

    return {
    formFields: `
      <div class="mb-4">
        <label for="fecha">Fecha</label>
        <input
          type="date"
          id="fecha"
          class="w-full rounded border px-2 py-1"
          value="${formatDate(new Date())}"
        >
      </div>
    `,

    dynamicAdders: `
      <h4 class="mt-6 mb-2 font-semibold">Expulsados</h4>
      <div id="expulsadosContainer" class="mb-4 border rounded p-2 max-h-60 overflow-y-auto"></div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
        <input type="text" id="expNombre" placeholder="Nombre" class="rounded border px-2 py-1">
        <input type="text" id="expNac"    placeholder="Nacionalidad" class="rounded border px-2 py-1">
        <button onclick="addExpulsado()"   class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
      </div>

      <h4 class="mt-6 mb-2 font-semibold">Fletados</h4>
      <div id="fletadosContainer" class="mb-4 border rounded p-2 max-h-60 overflow-y-auto"></div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end mb-4">
        <input type="text"   id="fletDestino" placeholder="Destino" class="rounded border px-2 py-1">
        <input type="number" id="fletPax"     placeholder="Pax"      class="rounded border px-2 py-1">
        <button onclick="addFletado()"         class="bg-gray-600 text-white px-4 py-2 rounded">Añadir</button>
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
    `,

    dataMap: {
      fecha: 'fecha',
      expulsados: getExpulsados,
      fletados:   getFletados,
      conduccionesPositivas: getConduccionesPositivas,
      conduccionesNegativas: getConduccionesNegativas,
      grupoPendientes: getGrupoPendientes
    }
  };
}
