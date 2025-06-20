diff --git a//dev/null b/src/modules/helpers.js
index 0000000000000000000000000000000000000000..6619a425c2cf53731b1092506707ec61d1a998d3 100644
--- a//dev/null
+++ b/src/modules/helpers.js
@@ -0,0 +1,96 @@
+import { Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
+
+export function parseDate(value) {
+    if (!value) return null;
+    let d;
+    if (value instanceof Date) d = value;
+    else if (value instanceof Timestamp) d = value.toDate();
+       else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
+        const [y, m, dNum] = value.split('-').map(Number);
+        d = new Date(y, m - 1, dNum, 0, 0, 0);
+    } else d = new Date(value);
+    return isNaN(d) ? null : d;
+}
+
+export const formatDate = (date) => {
+    const d = parseDate(date);
+    return d ? d.toISOString().split('T')[0] : '';
+};
+
+export const formatDateTime = (date) => {
+    const d = parseDate(date);
+    return d ? d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
+
+};
+
+export const showSpinner = (show) => {
+    const spinner = document.getElementById('spinner');
+    if (spinner) spinner.style.display = show ? 'flex' : 'none';
+};
+
+export const showStatus = (message, isError = false) => {
+    const statusDiv = document.getElementById('status-message');
+    if (statusDiv) {
+        statusDiv.textContent = message;
+        statusDiv.className = `my-2 font-semibold ${isError ? 'text-red-600' : 'text-green-600'}`;
+        setTimeout(() => { if (statusDiv) statusDiv.textContent = ''; }, 4000);
+    }
+};
+
+export function removeDynamicItem(buttonElement) {
+    buttonElement.closest('.dynamic-list-item').remove();
+}
+
+export function addDynamicItem(container, fields, data = {}) {
+    const wrap = document.createElement('div');
+    wrap.className = 'dynamic-list-item flex flex-wrap gap-3 mb-2';
+
+    let html = '';
+    fields.forEach((f) => {
+        const value = data[f.valueField] ?? '';
+        const display = f.type === 'date' ? formatDate(value) : value;
+
+        let input;
+        if (f.type === 'textarea') {
+            input = `<textarea rows="${f.rows ?? 2}" class="${f.idPrefix}-item w-full px-2 py-1 border rounded" placeholder="${f.placeholder ?? ''}">${display}</textarea>`;
+        } else if (f.type === 'select') {
+            input = `<select class="${f.idPrefix}-item w-full px-2 py-1 border rounded">` +
+                    f.options.map(o => `<option ${o === display ? 'selected' : ''}>${o}</option>`).join('') +
+                    `</select>`;
+        } else {
+            input = `<input type="${f.type ?? 'text'}" class="${f.idPrefix}-item w-full px-2 py-1 border rounded" value="${display}" placeholder="${f.placeholder ?? ''}">`;
+        }
+
+        html += `
+          <div class="flex-1 min-w-[120px] ${f.colSpan ? `md:col-span-${f.colSpan}` : ''}">
+            <label class="block text-gray-700 text-xs font-medium mb-1">${f.label}:</label>
+            ${input}
+          </div>`;
+    });
+
+    wrap.innerHTML = `${html}<button type="button" class="bg-red-500 text-white text-xs px-3 py-1 rounded" onclick="removeDynamicItem(this)">Eliminar</button>`;
+    container.prepend(wrap);
+}
+
+export function getDynamicItems(container, fields) {
+    const out = [];
+    container.querySelectorAll('.dynamic-list-item').forEach((wrap) => {
+        const obj = {};
+        let empty = true;
+        fields.forEach((f) => {
+            const sel = f.type === 'textarea'
+                ? `textarea.${f.idPrefix}-item`
+                : f.type === 'select'
+                ? `select.${f.idPrefix}-item`
+                : `input.${f.idPrefix}-item`;
+            const el = wrap.querySelector(sel);
+            obj[f.valueField] = (el?.value ?? '').trim();
+            if (obj[f.valueField]) empty = false;
+        });
+        if (!empty) out.push(obj);
+    });
+    return out;
+}
+
+// Expose for inline onclick usage
+window.removeDynamicItem = removeDynamicItem;
