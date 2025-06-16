import { formatDate }        from '../utils.js';
import { removeDynamicItem } from '../utils.js';

// ------------------- helpers genéricos --------------------
export function addDynamicItem (container, fields, data = {}) {
  const div = document.createElement('div');
  div.className = 'dynamic-list-item';

  let inner = '';
  fields.forEach(f => {
    const val  = data[f.valueField] ?? '';
    const disp = f.type === 'date' ? formatDate(val) : val;

    let input;
    if (f.type === 'textarea') {
      input = `<textarea rows="${f.rows||2}" class="${f.idPrefix}-item w-full px-2 py-1 border rounded" placeholder="${f.placeholder||''}">${disp}</textarea>`;
    } else if (f.type === 'select') {
      input = `<select class="${f.idPrefix}-item w-full px-2 py-1 border rounded">` +
              f.options.map(o => `<option value="${o}" ${disp===o?'selected':''}>${o}</option>`).join('') +
              `</select>`;
    } else {
      input = `<input type="${f.type||'text'}" class="${f.idPrefix}-item w-full px-2 py-1 border rounded" value="${disp}" placeholder="${f.placeholder||''}">`;
    }

    inner += `
      <div class="flex-1 ${f.colSpan?`md:col-span-${f.colSpan}`:''}">
        <label class="block text-gray-700 text-xs font-medium mb-1">${f.label}:</label>
        ${input}
      </div>`;
  });

  div.innerHTML = `
    ${inner}
    <button type="button" class="bg-red-500 text-white text-xs px-3 py-1 rounded hover:bg-red-600" onclick="removeDynamicItem(this)">Eliminar</button>
  `;
  container.appendChild(div);
}

export function getDynamicItems (container, fields) {
  const items = [];
  container.querySelectorAll('.dynamic-list-item').forEach(div => {
    const obj = {};
    let filled = false;
    fields.forEach(f => {
      let el;
      if (f.type === 'textarea')      el = div.querySelector(`textarea.${f.idPrefix}-item`);
      else if (f.type === 'select')   el = div.querySelector(`select.${f.idPrefix}-item`);
      else                            el = div.querySelector(`input.${f.idPrefix}-item`);
      if (!el) return;
      obj[f.valueField] = el.value.trim();
      if (obj[f.valueField]) filled = true;
    });
    if (filled) items.push(obj);
  });
  return items;
}

// ------------------- helpers específicos ------------------
// TODO ⟶ Copia aquí **sin cambios** todo el bloque “DYNAMIC LIST HELPERS”
//       de tu antiguo main.js (addDiligenciaPreviasJuzgados, addDetenido…
//       getDetenidosPrevistos, etc.).  Cada función debe exportarse:
//
// export function addDiligenciaPreviasJuzgados (data={}) { … }
// export function getDiligenciasPreviasJuzgados () { … }
//
// Al final del archivo añadimos:
export * from './dynamicLists.export.js';
//
// (Para no inflar este mensaje he puesto las funciones en
//  `dynamicLists.export.js`; simplemente pega allí lo que ya tenías.)
//
// ----------------------------------------------------------

// Hacemos accesibles las funciones desde atributos onclick del HTML:
import * as self from './dynamicLists.js';
Object.assign(window, self);
