import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyC8elIQW3uTeTvjdw7i7gqcLcnIA-ROjVU",
  authDomain: "medicine-name-c9650.firebaseapp.com",
  projectId: "medicine-name-c9650",
  storageBucket: "medicine-name-c9650.firebasestorage.app",
  messagingSenderId: "653156310293",
  appId: "1:653156310293:web:670726a41a5c65cff3dd1c",
  measurementId: "G-44QL2TG56D"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const customerEmailFromLogin = loginId =>
  `${loginId.trim().toLowerCase()}@zenolife.local`;
