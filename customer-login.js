import { auth, customerEmailFromLogin } from "./firebase.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const form = document.querySelector("#loginForm");
const msg = document.querySelector("#loginMsg");

form.addEventListener("submit", async e => {
  e.preventDefault();
  msg.textContent = "Signing in…";
  try {
    const loginId = document.querySelector("#loginId").value;
    const password = document.querySelector("#password").value;
    await signInWithEmailAndPassword(auth, customerEmailFromLogin(loginId), password);
    location.replace("customer.html");
  } catch (err) {
    msg.textContent = "Login failed. Please check your Login ID and password.";
  }
});
