// src/ui/dynamicLists.js
//------------------------------------------------------
//  Helpers para listas dinámicas (add*/get*)
//------------------------------------------------------
import { formatDate, removeDynamicItem } from '../utils.js';

// Dejo removeDynamicItem accesible para los botones “Eliminar”
window.removeDynamicItem = removeDynamicItem;

/* ═════════════════════════════════════════════════════
   Genéricos
   ════════════════════════════════════════════════════ */
function addDynamicItem(container, fields, data = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'dynamic-list-item flex flex-wrap gap-3 mb-2';

  let html = '';
  fields.forEach((f) => {
    const value = data[f.valueField] ?? '';
    const display = f.type === 'date' ? formatDate(value) : value;

    let input;
    if (f.type === 'textarea') {
      input = `<textarea rows="${f.rows ?? 2}"
                         class="${f.idPrefix}-item w-full px-2 py-1 border rounded"
                         placeholder="${f.placeholder ?? ''}">${display}</textarea>`;
    } else if (f.type === 'select') {
      input =
        `<select class="${f.idPrefix}-item w-full px-2 py-1 border rounded">` +
        f.options
          .map((o) => `<option ${o === display ? 'selected' : ''}>${o}</option>`)
          .join('') +
        `</select>`;
    } else {
      input = `<input type="${f.type ?? 'text'}"
                      class="${f.idPrefix}-item w-full px-2 py-1 border rounded"
                      value="${display}"
                      placeholder="${f.placeholder ?? ''}">`;
    }

    html += `
      <div class="flex-1 min-w-[120px] ${f.colSpan ? `md:col-span-${f.colSpan}` : ''}">
        <label class="block text-gray-700 text-xs font-medium mb-1">${f.label}:</label>
        ${input}
      </div>`;
  });

  wrap.innerHTML = `
    ${html}
    <button type="button"
            class="bg-red-500 text-white text-xs px-3 py-1 rounded"
            onclick="removeDynamicItem(this)">Eliminar</button>`;
  container.prepend(wrap);
}

function getDynamicItems(container, fields) {
  const out = [];
  container.querySelectorAll('.dynamic-list-item').forEach((wrap) => {
    const obj = {};
    let empty = true;
    fields.forEach((f) => {
      const sel =
        f.type === 'textarea'
          ? `textarea.${f.idPrefix}-item`
          : f.type === 'select'
          ? `select.${f.idPrefix}-item`
          : `input.${f.idPrefix}-item`;
      const el = wrap.querySelector(sel);
      obj[f.valueField] = (el?.value ?? '').trim();
      if (obj[f.valueField]) empty = false;
    });
    if (!empty) out.push(obj);
  });
  return out;
}

/* ═════════════════════════════════════════════════════
   Factoría: genera pares add y get con muy poco código
   ════════════════════════════════════════════════════ */
      
const api = {};
function makePair(addName, getName, containerId, fieldDefs) {
  const addFn = (d = {}) => {
    const c = document.getElementById(containerId);
    if (c) addDynamicItem(c, fieldDefs, d);
  };
  const getFn = () =>
    getDynamicItems(document.getElementById(containerId), fieldDefs) ?? [];
  api[addName] = addFn;
  api[getName] = getFn;
  window[addName] = addFn; // para los onclick inline
  window[getName] = getFn;
}

/* ═════════════════════════════════════════════════════
   Declaración de TODOS los pares
   (son los mismos que tenías en tu main.js original)
   ════════════════════════════════════════════════════ */

// Personas implicadas (Grupo 1)
makePair(
  'addPersonaImplicada',
  'getPersonasImplicadas',
  'personasImplicadasContainer',
  [
    { idPrefix: 'impNombre', label: 'Nombre', valueField: 'nombre' },
    { idPrefix: 'impNac', label: 'Nacionalidad', valueField: 'nacionalidad' },
  ],
);
makePair(
  'addGrupoPendiente',
  'getGrupoPendientes',
  'grupoPendientesList',
  [
    { idPrefix: 'gpPendDesc', label: 'Descripción', valueField: 'descripcion' },
    { idPrefix: 'gpPendDate', label: 'Fecha Límite', type: 'date', valueField: 'fechaLimite' },
  ],
);

// Expulsados
makePair(
  'addExpulsado',
  'getExpulsados',
  'expulsadosContainer',
  [
    { idPrefix: 'expNombre', label: 'Nombre', valueField: 'nombre' },
    { idPrefix: 'expNac', label: 'Nacionalidad', valueField: 'nacionalidad' },
  ],
);

// Fletados
makePair(
  'addFletado',
  'getFletados',
  'fletadosContainer',
  [
    { idPrefix: 'fletDestino', label: 'Destino', valueField: 'destino' },
    { idPrefix: 'fletPax', label: 'Pax', type: 'number', valueField: 'pax' },
  ],
);

// Conducciones
makePair(
  'addConduccionPositiva',
  'getConduccionesPositivas',
  'conduccionesPositivasContainer',
  [
    { idPrefix: 'cpDesc', label: 'Descripción', valueField: 'descripcion', colSpan: 2 },
  ],
);

makePair(
  'addConduccionNegativa',
  'getConduccionesNegativas',
  'conduccionesNegativasContainer',
  [
    { idPrefix: 'cnDesc', label: 'Descripción', valueField: 'descripcion', colSpan: 2 },
  ],
);

// Grupo 4
makePair(
  'addPersonaImplicadaG4',
  'getPersonasImplicadasG4',
  'personasImplicadasG4Container',
  [
    { idPrefix: 'impG4Nombre', label: 'Nombre', valueField: 'nombre' },
    { idPrefix: 'impG4Rol', label: 'Rol', valueField: 'rol' },
  ],
);
makePair(
  'addGrupo4Pendiente',
  'getGrupo4Pendientes',
  'grupo4PendientesList',
  [
    { idPrefix: 'gp4PendDesc', label: 'Descripción', valueField: 'descripcion' },
    { idPrefix: 'gp4PendDate', label: 'Fecha Límite', type: 'date', valueField: 'fechaLimite' },
  ],
);

// Puerto, CIE, Gestión, CECOREX
[
  ['Puerto',   'puertoPendientesList',   'puertoPendDesc',   'puertoPendDate'],
  ['CIE',      'ciePendientesList',      'ciePendDesc',      'ciePendDate'],
  ['Gestion',  'gestionPendientesList',  'gestionPendDesc',  'gestionPendDate'],
  ['Cecorex',  'cecorexPendientesList',  'cecorexPendDesc',  'cecorexPendDate'],
].forEach(([n, listId, descId, dateId]) =>
  makePair(
    `add${n}Pendiente`,
    `get${n}Pendientes`,
    listId,
    [
      { idPrefix: descId, label: 'Descripción', valueField: 'descripcion' },
      { idPrefix: dateId, label: 'Fecha Límite', type: 'date', valueField: 'fechaLimite' },
    ],
  ),
);

// CIE adicionales
makePair(
  'addInternoNacionalidad',
  'getInternosNacionalidad',
  'internosNacionalidadesContainer',
  [
    { idPrefix: 'intNac', label: 'Nacionalidad', valueField: 'nacionalidad' },
    { idPrefix: 'intNum', label: 'Número', type: 'number', valueField: 'numero' },
  ],
);
makePair(
  'addIngreso',
  'getIngresos',
  'ingresosContainer',
  [
    { idPrefix: 'ingNac', label: 'Nacionalidad', valueField: 'nacionalidad' },
    { idPrefix: 'ingNum', label: 'Número', type: 'number', valueField: 'numero' },
  ],
);
makePair(
  'addSalida',
  'getSalidas',
  'salidasContainer',
  [
    { idPrefix: 'salDestino', label: 'Destino', valueField: 'destino' },
    { idPrefix: 'salNum', label: 'Número', type: 'number', valueField: 'numero' },
  ],
);

// Grupo 4 nuevos
makePair(
  'addColaboracionG4',
  'getColaboracionesG4',
  'colaboracionesG4Container',
  [
    { idPrefix: 'colG4Desc', label: 'Descripción', valueField: 'descripcion', colSpan: 2 },
  ],
);
makePair(
  'addDetenidoG4',
  'getDetenidosG4',
  'detenidosG4Container',
  [
    { idPrefix: 'detG4Motivo', label: 'Motivo', valueField: 'motivo' },
    { idPrefix: 'detG4Nac', label: 'Nacionalidad', valueField: 'nacionalidad' },
  ],
);

// Grupo 2/3 – todos los helpers largos
makePair(
  'addDiligenciaPreviasJuzgados',
  'getDiligenciasPreviasJuzgados',
  'diligenciasPreviasJuzgadosContainer',
  [
    { idPrefix: 'dpjFecha',   label: 'Fecha',   type: 'date', valueField: 'fecha' },
    { idPrefix: 'dpjJuzgado', label: 'Juzgado', valueField: 'juzgado' },
  ],
);
makePair(
  'addHistoricoInhibicion',
  'getHistoricoInhibiciones',
  'historicoInhibicionesContainer',
  [
    { idPrefix: 'inhibJuzgado', label: 'Juzgado', valueField: 'juzgado' },
    { idPrefix: 'inhibFecha',   label: 'Fecha',   type: 'date', valueField: 'fecha' },
  ],
);
makePair(
  'addHistoricoGeneralJuzgados',
  'getHistoricoGeneralJuzgados',
  'historicoGeneralJuzgadosContainer',
  [
    { idPrefix: 'hgJFecha',   label: 'Fecha',   type: 'date', valueField: 'fecha' },
    { idPrefix: 'hgJJuzgado', label: 'Juzgado', valueField: 'juzgado' },
    { idPrefix: 'hgJEvento',  label: 'Evento',  valueField: 'evento' },
  ],
);
makePair(
  'addIntervencionTelefonica',
  'getIntervencionesTelefonicas',
  'intervencionesTelefonicasContainer',
  [
    { idPrefix: 'itDesc', label: 'Descripción', valueField: 'descripcion', colSpan: 2 },
  ],
);
makePair(
  'addEntradaYRegistro',
  'getEntradasYRegistros',
  'entradasYRegistrosContainer',
  [
    { idPrefix: 'eyrDesc', label: 'Descripción', valueField: 'descripcion', colSpan: 2 },
  ],
);
makePair(
  'addSolicitudJudicial',
  'getSolicitudesJudiciales',
  'solicitudesJudicialesContainer',
  [
    { idPrefix: 'sjTipo', label: 'Tipo', valueField: 'tipo' },
    { idPrefix: 'sjDesc', label: 'Descripción', valueField: 'descripcion', colSpan: 2 },
  ],
);
makePair(
  'addColaboracion',
  'getColaboraciones',
  'colaboracionesContainer',
  [
    { idPrefix: 'colaboracionFecha',            label: 'Fecha', type: 'date', valueField: 'fecha' },
    { idPrefix: 'colaboracionGrupoInstitucion', label: 'Grupo/Institución', valueField: 'grupoInstitucion' },
    { idPrefix: 'colaboracionTipo',             label: 'Tipo',  valueField: 'tipoColaboracion' },
  ],
);
makePair(
  'addDetenido',
  'getDetenidos',
  'detenidosContainer',
  [
    { idPrefix: 'detFiliacion', label: 'Filiación Delito', valueField: 'filiacionDelito' },
    { idPrefix: 'detNac',       label: 'Nacionalidad',     valueField: 'nacionalidad' },
    { idPrefix: 'detFecha',     label: 'Fecha Detención',  type: 'date', valueField: 'fechaDetencion' },
    { idPrefix: 'detOrdinal',   label: 'Ordinal',          valueField: 'ordinal' },
  ],
);
makePair(
  'addDetenidoPrevisto',
  'getDetenidosPrevistos',
  'detenidosPrevistosContainer',
  [
    { idPrefix: 'detPrevFiliacion', label: 'Filiación Delito', valueField: 'filiacionDelito' },
    { idPrefix: 'detPrevNac',       label: 'Nacionalidad',     valueField: 'nacionalidad' },
    { idPrefix: 'detPrevFecha',     label: 'Fecha Prevista',   type: 'date', valueField: 'fechaDetencion' },
    { idPrefix: 'detPrevOrdinal',   label: 'Ordinal',          valueField: 'ordinal' },
  ],
);
makePair(
  'addOtraPersona',
  'getOtrasPersonas',
  'otrasPersonasContainer',
  [
    { idPrefix: 'otraFiliacion', label: 'Filiación',               valueField: 'filiacion' },
    { idPrefix: 'otraTipo',      label: 'Tipo de Vinculación',     valueField: 'tipoVinculacion' },
    { idPrefix: 'otraNac',       label: 'Nacionalidad',            valueField: 'nacionalidad' },
    { idPrefix: 'otraTelefono',  label: 'Teléfono',                valueField: 'telefono' },
  ],
);

/* ═════════════════════════════════════════════════════
   Exportamos todo el API generado
   ════════════════════════════════════════════════════ */
export default api;
export const {
  addPersonaImplicada,
  getPersonasImplicadas,
  addGrupoPendiente,
  getGrupoPendientes,
  addExpulsado,
  getExpulsados,
  addFletado,
  getFletados,
  addConduccionPositiva,
  getConduccionesPositivas,
  addConduccionNegativa,
  getConduccionesNegativas,
  addPersonaImplicadaG4,
  getPersonasImplicadasG4,
  addGrupo4Pendiente,
  getGrupo4Pendientes,
  addPuertoPendiente,
  getPuertoPendientes,
  addCIEPendiente,
  getCIEPendientes,
    addInternoNacionalidad,
  getInternosNacionalidad,
  addIngreso,
  getIngresos,
  addSalida,
  getSalidas,
  addGestionPendiente,
  getGestionPendientes,
  addCecorexPendiente,
  getCecorexPendientes,
  addDiligenciaPreviasJuzgados,
  getDiligenciasPreviasJuzgados,
  addHistoricoInhibicion,
  getHistoricoInhibiciones,
  addHistoricoGeneralJuzgados,
  getHistoricoGeneralJuzgados,
  addIntervencionTelefonica,
  getIntervencionesTelefonicas,
  addEntradaYRegistro,
  getEntradasYRegistros,
  addSolicitudJudicial,
  getSolicitudesJudiciales,
  addColaboracion,
  getColaboraciones,
   addColaboracionG4,
  getColaboracionesG4,
  addDetenido,
  getDetenidos,
  addDetenidoG4,
  getDetenidosG4,
  addDetenidoPrevisto,
  getDetenidosPrevistos,
  addOtraPersona,
  getOtrasPersonas,
} = api;
