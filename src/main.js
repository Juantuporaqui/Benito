// main.js – Punto de entrada de la aplicación UCRIF
// ───────────────────────────────────────────────────
// Orquesta la autenticación, las rutas y la carga dinámica de vistas.
// Mantén los helpers y vistas en los ficheros indicados en los imports.

import { initFirebase, auth } from "./helpers/firebase.js";
import {
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Vistas
import { renderMenu } from "./views/menu.js";
import { renderStatistics } from "./views/statistics.js";
import { renderGroup2and3Form } from "./views/group2and3Form.js";
import { renderSpecificGroupForm } from "./views/simplifiedGroupForm.js";

// Utilidades y constantes
import { groups } from "./constants/groups.js"; // mapeo clave‑grupo
import { showAuthError, showFirebaseConfigError } from "./helpers/firebaseErrors.js";

// Exponer algunos helpers globales si tu HTML los necesita (ej. <button onclick="navigateTo('grupo1')">)
export const appState = {
  appId: typeof __app_id !== "undefined" ? __app_id : "default-app-id",
  userId: null,
  currentView: "menu",
  currentGroup: null,
  currentDocId: null,
};

// ───────────────────────── Router ─────────────────────────
export const router = {
  goHome() {
    appState.currentView = "menu";
    renderMenu();
  },

  toGroup(groupKey) {
    appState.currentGroup = groupKey;

    if (groupKey === "estadistica") {
      renderStatistics();
      return;
    }

    if (groupKey === "grupo2" || groupKey === "grupo3") {
      renderGroup2and3Form(groupKey);
      return;
    }

    renderSpecificGroupForm(groupKey);
  },
};

// Hacer accesible desde HTML
window.navigateTo = router.toGroup.bind(router);

// ─────────────── Autenticación Firebase ────────────────
const authenticateAndRenderMenu = async () => {
  try {
    if (typeof __initial_auth_token !== "undefined") {
      await signInWithCustomToken(auth, __initial_auth_token);
    } else {
      await signInAnonymously(auth);
    }

    appState.userId = auth.currentUser?.uid ?? crypto.randomUUID();
    renderMenu();
  } catch (error) {
    console.error("Authentication failed:", error);
    showAuthError(error);
  }
};

// ─────────────────────── Init ───────────────────────────
const init = () => {
  try {
    initFirebase();

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        appState.userId = user.uid;
        renderMenu();
      } else {
        await authenticateAndRenderMenu();
      }
    });

    // Botón "Atrás" universal si existe en tu HTML
    document
      .getElementById("back-button")
      ?.addEventListener("click", router.goHome);
  } catch (e) {
    console.error("Firebase config error:", e);
    showFirebaseConfigError(e);
  }
};

document.addEventListener("DOMContentLoaded", init);
