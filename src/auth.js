export const showAuthError = (error, mainContent) => {
    mainContent().innerHTML = `
        <div class="text-center p-8 text-red-500">
            <h2 class="text-xl font-bold">Error de Autenticación de Firebase</h2>
            <p class="mt-2">La aplicación no pudo iniciar sesión. Por favor, asegúrate de que el <strong>método de inicio de sesión anónimo</strong> está habilitado en tu proyecto Firebase (Autenticación > Método de inicio de sesión).</p>
            <p class="mt-2">También, verifica las <strong>Reglas de Seguridad de Firestore</strong> para permitir la lectura y escritura para usuarios autenticados en la ruta de tu colección (<code>artifacts/{appId}/users/{userId}/{document**}</code>).</p>
            <p class="mt-2"><b>Error de Firebase:</b> ${error.message}</p>
        </div>`;
};

export const showFirebaseConfigError = (e, mainContent) => {
    mainContent().innerHTML = `
        <div class="text-center p-8 text-red-500">
            <h2 class="text-xl font-bold">Error de Configuración de Firebase</h2>
            <p class="mt-2">La aplicación no se pudo iniciar. Revisa la configuración de Firebase en el código.</p>
            <p class="mt-2"><b>Error de Firebase:</b> ${e.message}</p>
        </div>`;
};

export const authenticateAndRenderMenu = async (
    auth,
    signInAnonymously,
    signInWithCustomToken,
    setUserId,
    renderMenu,
    mainContent
) => {
    try {
        if (typeof __initial_auth_token !== 'undefined') {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }
        const uid = auth.currentUser?.uid || crypto.randomUUID();
        console.log("Authenticated anonymously or with token:", uid);
        setUserId(uid);
        renderMenu();
    } catch (error) {
        console.error("Authentication failed:", error);
        showAuthError(error, mainContent);
    }
};
