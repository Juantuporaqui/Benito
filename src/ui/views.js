import { userId }             from '../state.js';
import { groups }             from '../groups.js';
import * as DL                from './dynamicLists.js';
import {
  fetchDataForSelect, loadData, saveData,
  getNextCode, loadSubCollection, addRelatedItem,
  completePendingTask
} from '../services/firestoreService.js';

import {
  formatDate, formatDateTime,
  showSpinner, showStatus
} from '../utils.js';

// ---------------------------------------------------------------------------
// Todo el código de vistas (renderMenu, navigateTo, renderSpecificGroupForm,
// renderGroup2and3Form, renderStatistics, generateOperationReport, etc.)
// es el MISMO que tenías.  Lo único que cambia son los imports de arriba.
// ---------------------------------------------------------------------------

// Ejemplo:
export function renderMenu () {
  // …  **copia aquí** la función original tal cual …
}

/* Copia el resto de funciones de UI sin tocar nada */

// ---------------------------------------------------------------------------
// Al final exportamos las que necesite main.js
// ---------------------------------------------------------------------------
export {
  renderSpecificGroupForm,
  renderGroup2and3Form,
  renderStatistics,
  /* …cualquier helper que quieras usar fuera… */
};
