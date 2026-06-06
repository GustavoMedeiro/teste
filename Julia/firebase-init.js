// Importando o Firebase direto da internet (CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// As suas chaves secretas do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDhGhOHmHhE_6nmJ4XCl-XzEnZRb47IzTk",
  authDomain: "studioagenda-8c2cb.firebaseapp.com",
  projectId: "studioagenda-8c2cb",
  storageBucket: "studioagenda-8c2cb.firebasestorage.app",
  messagingSenderId: "600061613716",
  appId: "1:600061613716:web:4430f79723dd11ae74c681"
};

// Ligando o motor!
const app = initializeApp(firebaseConfig);

// Exportando a Autenticação (Login) e o Banco de Dados (Firestore) pra gente usar nos outros arquivos
export const auth = getAuth(app);
export const db = getFirestore(app);