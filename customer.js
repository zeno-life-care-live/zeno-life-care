import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, addDoc, query, where, orderBy, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

let currentUser, customer, medicines = [];

const $ = s => document.querySelector(s);
const money = n => `₹${Number(n || 0).toFixed(2)}`;

onAuthStateChanged(auth, async user => {
  if (!user) return location.href = "index.html";
  currentUser = user;
  const snap = await getDoc(doc(db, "customers", user.uid));
  if (!snap.exists()) return signOut(auth);
  customer = snap.data();
  $("#customerName").textContent = customer.name;
  $("#medicalName").textContent = customer.medicalName;
  $("#welcome").textContent = `Hello, ${customer.name.split(" ")[0]} ✿`;
  await loadMedicines();
  await loadOrders();
});

async function loadMedicines() {
  const snap = await getDocs(query(collection(db, "medicines"), orderBy("name")));
  medicines = snap.docs.map(d => ({ id:d.id, ...d.data() }));
  renderMedicines();
}

function renderMedicines() {
  const term = $("#search").value.toLowerCase().trim();
  const list = medicines.filter(m => m.name.toLowerCase().includes(term));
  $("#medicineGrid").innerHTML = list.map(m => `
    <article class="medicine-card glass">
      <div class="stock-dot ${m.available && Number(m.quantity)>0 ? "on":"off"}"></div>
      <div class="med-top"><span class="med-icon">✿</span><span class="stock-label">${m.available && Number(m.quantity)>0 ? "Available":"Not available"}</span></div>
      <h3>${esc(m.name)}</h3>
      <div class="rate-row"><span>Sell Rate</span><b>${money(m.sellRate)}</b></div>
      <div class="rate-row muted-row"><span>Quantity</span><b>N. RATE</b></div>
      <div class="rate-row muted-row"><span>Expiry</span><b>N. RATE</b></div>
      <div class="rate-row muted-row"><span>MRP</span><b>N. RATE</b></div>
      <button class="primary full" ${!(m.available && Number(m.quantity)>0) ? "disabled":""} data-order="${m.id}">Order Now</button>
    </article>`).join("");
  $("#emptyMedicines").hidden = list.length !== 0;
  document.querySelectorAll("[data-order]").forEach(b => b.onclick = () => openOrder(b.dataset.order));
}

async function openOrder(id) {
  const m = medicines.find(x => x.id === id);
  $("#orderMedicineId").value = id;
  $("#orderMedicineName").textContent = m.name;
  $("#orderMedicineRate").textContent = money(m.sellRate);
  $("#orderQty").max = Math.max(1, Number(m.quantity));
  $("#orderQty").value = 1;
  $("#orderMsg").textContent = "";
  $("#orderDialog").showModal();
}

$("#orderForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("#orderMedicineId").value;
  const m = medicines.find(x => x.id === id);
  const qty = Number($("#orderQty").value);
  if (!m || !m.available || qty < 1 || qty > Number(m.quantity)) {
    $("#orderMsg").textContent = "Requested quantity is not available.";
    return;
  }
  $("#orderMsg").textContent = "Sending order…";
  try {
    await addDoc(collection(db, "orders"), {
      customerId: currentUser.uid,
      customerName: customer.name,
      medicalName: customer.medicalName,
      phone: customer.phone,
      medicineId: id,
      medicineName: m.name,
      quantity: qty,
      sellRateAtOrder: Number(m.sellRate),
      status: "new",
      createdAt: serverTimestamp()
    });
    $("#orderMsg").textContent = "Order sent to Admin ✓";
    setTimeout(() => $("#orderDialog").close(), 700);
    await loadOrders();
  } catch {
    $("#orderMsg").textContent = "Could not place order. Try again.";
  }
});

async function loadOrders() {
  const snap = await getDocs(query(collection(db, "orders"), where("customerId","==",currentUser.uid)));
  const orders = snap.docs.map(d => ({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  $("#reward").textContent = `${orders.filter(o=>o.status==="completed").length}/20 completed`;
  $("#ordersList").innerHTML = orders.length ? orders.map(o => `
    <article class="order-card glass">
      <div><b>${esc(o.medicineName)}</b><small>${o.createdAt?.toDate?.().toLocaleString?.() || "Just now"}</small></div>
      <div>Qty <b>${o.quantity}</b></div><div>${money(o.sellRateAtOrder * o.quantity)}</div>
      <span class="status ${o.status}">${o.status}</span>
    </article>`).join("") : `<div class="empty glass">No orders yet.</div>`;
}

$("#search").addEventListener("input", renderMedicines);
$("#refreshBtn").onclick = loadMedicines;
$("#logoutBtn").onclick = () => signOut(auth).then(()=>location.href="index.html");
$("#closeDialog").onclick = () => $("#orderDialog").close();

document.querySelectorAll(".tab").forEach(tab => tab.onclick = () => {
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  tab.classList.add("active");
  const isOrders = tab.dataset.tab === "orders";
  $("#medicinesTab").hidden = isOrders;
  $("#ordersTab").hidden = !isOrders;
});

function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
