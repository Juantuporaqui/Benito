import { Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export const formatDate = (date) => {
    if (!date) return '';
    const d = date instanceof Timestamp ? date.toDate() : new Date(date);
    return d.toISOString().split('T')[0];
};

export const formatDateTime = (date) => {
    if (!date) return '';
    const d = date instanceof Timestamp ? date.toDate() : new Date(date);
    return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
