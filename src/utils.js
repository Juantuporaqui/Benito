import { Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export function parseDate(value) {
    if (!value) return null;
    let d;
    if (value instanceof Date) d = value;
    else if (value instanceof Timestamp) d = value.toDate();
       else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, dNum] = value.split('-').map(Number);
        d = new Date(y, m - 1, dNum, 0, 0, 0);
    } else d = new Date(value);
    return isNaN(d) ? null : d;
}

export const formatDate = (date) => {
    const d = parseDate(date);
    return d ? d.toISOString().split('T')[0] : '';
};

export const formatDateTime = (date) => {
    const d = parseDate(date);
    return d ? d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

};

export const showSpinner = (show) => {
    const spinner = document.getElementById('spinner');
    if (spinner) spinner.style.display = show ? 'flex' : 'none';
};

export const showStatus = (message, isError = false) => {
    const statusDiv = document.getElementById('status-message');
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.className = `my-2 font-semibold ${isError ? 'text-red-600' : 'text-green-600'}`;
        setTimeout(() => { if (statusDiv) statusDiv.textContent = ''; }, 4000);
    }
};

export function removeDynamicItem(buttonElement) {
    buttonElement.closest('.dynamic-list-item').remove();
}
