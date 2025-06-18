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
  return {
    formFields: `
      <div class="mb-4">
        <label for="fecha" class="font-semibold mb-1">Fecha</label>
        <input type="date" id="fecha" class="border rounded px-2 py-1" value="${formatDate(new Date())}">
      </div>
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label for="pdfDesde" class="font-semibold">Desde</label>
          <input type="date" id="pdfDesde" class="border rounded px-2 py-1" value="${formatDate(new Date())}">
        </div>
        <div>
          <label for="pdfHasta" class="font-semibold">Hasta</label>
          <input type="date" id="pdfHasta" class="border rounded px-2 py-1" value="${formatDate(new Date())}">
        </div>
      </div>
    `,

    dynamicAdders: `
       <div class="card space-y-4">
        <h4 class="font-semibold mb-2">Expulsados</h4>
        <div id="expulsadosContainer" class="space-y-2"></div>
        <div class="flex gap-2">
          <input type="text" id="expNombre" placeholder="Nombre" class="flex-1 border rounded px-2 py-1">
          <input type="text" id="expNac" placeholder="Nacionalidad" class="flex-1 border rounded px-2 py-1">
          <button onclick="addExpulsado()" class="btn-primary">Añadir</button>
        </div>

        <h4 class="font-semibold mb-2">Fletados</h4>
        <div id="fletadosContainer" class="space-y-2"></div>
        <div class="flex gap-2">
          <input type="text" id="fletDestino" placeholder="Destino" class="flex-1 border rounded px-2 py-1">
          <input type="number" id="fletPax" placeholder="Pax" class="flex-1 border rounded px-2 py-1">
          <button onclick="addFletado()" class="btn-primary">Añadir</button>
        </div>

        <h4 class="font-semibold mb-2">Conducciones Positivas</h4>
        <div id="conduccionesPositivasContainer" class="space-y-2"></div>
        <div class="flex gap-2">
          <input type="text" id="cpDesc" placeholder="Descripción" class="flex-1 border rounded px-2 py-1">
          <button onclick="addConduccionPositiva()" class="btn-primary">Añadir</button>
        </div>

        <h4 class="font-semibold mb-2">Conducciones Negativas</h4>
        <div id="conduccionesNegativasContainer" class="space-y-2"></div>
        <div class="flex gap-2">
          <input type="text" id="cnDesc" placeholder="Descripción" class="flex-1 border rounded px-2 py-1">
          <button onclick="addConduccionNegativa()" class="btn-primary">Añadir</button>
        </div>

        <h4 class="font-semibold mb-2">Pendientes de Gestión</h4>
        <ul id="grupoPendientesList" class="list-disc pl-5 space-y-2"></ul>
        <div class="flex gap-2">
          <input type="text" id="gpPendDesc" placeholder="Descripción" class="flex-1 border rounded px-2 py-1">
          <input type="date" id="gpPendDate" class="border rounded px-2 py-1">
          <button onclick="addGrupoPendiente()" class="btn-primary">Añadir</button>
        </div>

        <div class="text-right">
          <button id="generatePdfBtn" class="bg-indigo-600 text-white rounded px-6 py-2">Generar Resumen PDF</button>
        </div>
      </div>
    `,

    dataMap: {
      fecha: 'fecha',
      expulsados: getExpulsados,
      fletados: getFletados,
      conduccionesPositivas: getConduccionesPositivas,
      conduccionesNegativas: getConduccionesNegativas,
      grupoPendientes: getGrupoPendientes,
    },
  };
}
