diff --git a//dev/null b/src/firebase.js
index 0000000000000000000000000000000000000000..6d4da9873c9a25fdeef89e40f5b31dfa99793713 100644
--- a//dev/null
+++ b/src/firebase.js
@@ -0,0 +1,27 @@
+import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
+import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
+import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
+
+// Firebase configuration
+const firebaseConfig = {
+    apiKey: "AIzaSyDTvriR7KjlAINO44xhDDvIDlc4T_4nilo",
+    authDomain: "ucrif-5bb75.firebaseapp.com",
+    projectId: "ucrif-5bb75",
+    storageBucket: "ucrif-5bb75.firebasestorage.app",
+    messagingSenderId: "241698436443",
+    appId: "1:241698436443:web:1f333b3ae3f813b755167e",
+    measurementId: "G-S2VPQNWZ21"
+};
+
+let app, db, auth;
+
+export function initFirebase() {
+    if (!app) {
+        app = initializeApp(firebaseConfig);
+        db = getFirestore(app);
+        auth = getAuth(app);
+    }
+    return { db, auth };
+}
+
+export { db, auth };
