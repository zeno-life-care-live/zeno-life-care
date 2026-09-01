import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, query, where, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const $ = s => document.querySelector(s);
const money = n => `₹${Number(n || 0).toFixed(2)}`;
const MIN_QUALIFYING_ORDER = 1500;
const REWARD20 = 100;
const REWARD40 = 250;
const SIX_DAYS = 6 * 24 * 60 * 60 * 1000;

let currentUser = null, customer = null, medicines = [], orders = [];
let cart = JSON.parse(localStorage.getItem("zenoCart") || "[]");
let knownStatuses = JSON.parse(localStorage.getItem("zenoOrderStatuses") || "{}");
let toastTimer;

function esc(v = "") {
  return String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function medicineName(m) { return m.name || m.drugName || m.medicineName || "Medicine"; }
function sellRate(m) { return Number(m.sellRate ?? m.nRate ?? m.rate ?? m.netRate ?? 0); }
function orderDate(o) { return o.createdAt?.toDate?.() || (o.orderTimeMs ? new Date(o.orderTimeMs) : null); }
function toast(msg) {
  if (!$("#toast")) return;
  $("#toast").textContent = msg;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 2800);
}

onAuthStateChanged(auth, async user => {
  if (!user) { location.replace("index.html"); return; }
  currentUser = user;
  try {
    const snap = await getDoc(doc(db, "customers", user.uid));
    if (!snap.exists() || snap.data().active === false) {
      await signOut(auth);
      location.replace("index.html");
      return;
    }
    customer = snap.data();
    $("#customerName").textContent = customer.name || "Customer";
    $("#medicalName").textContent = customer.medicalName || "Customer Portal";
    $("#welcome").textContent = `Hello, ${(customer.name || "Customer").split(" ")[0]} ✿`;
    await loadMedicines();
    await loadOrders();
    restoreTab();
    renderCart();
    if (location.hash === "#cart") $("#cartDialog").showModal();
  } catch (e) {
    console.error(e);
    toast("Data load nahi ho pa raha. Firebase Rules aur internet check karo.");
    renderMedicines();
  }
});

async function loadMedicines() {
  let snap;
  try {
    snap = await getDocs(collection(db, "medicines"));
  } catch (e) {
    console.error("Medicine read failed", e);
    $("#medicineGrid").innerHTML = `<div class="empty glass">Medicine list load nahi hui.<br><small>${esc(e.message || "Firestore read failed")}</small></div>`;
    return;
  }
  medicines = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(m => medicineName(m) !== "Medicine")
    .sort((a,b) => medicineName(a).localeCompare(medicineName(b)));
  renderChips();
  renderMedicines();
}

function renderChips() {
  const cats = [...new Set(medicines.map(m => m.category).filter(Boolean))];
  $("#categoryChips").innerHTML = cats.length
    ? `<button class="chip active" data-cat="">All</button>${cats.map(c => `<button class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}`
    : "";
  document.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => {
    document.querySelectorAll("[data-cat]").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    renderMedicines();
  });
}

function renderMedicines() {
  if (!$("#medicineGrid")) return;
  const term = ($("#search")?.value || "").toLowerCase().trim();
  const cat = document.querySelector("[data-cat].active")?.dataset.cat || "";
  const list = medicines.filter(m => {
    const n = medicineName(m).toLowerCase();
    const comp = String(m.composition || "").toLowerCase();
    return (!cat || m.category === cat) && (n.includes(term) || comp.includes(term));
  });
  $("#medicineGrid").innerHTML = list.length ? list.map(m => {
    const name = medicineName(m), available = m.available !== false && Number(m.quantity ?? m.stock ?? 0) > 0;
    const image = m.imageData || m.imageUrl || m.image || "";
    return `<article class="medicine-card glass">
      <div class="stock-dot ${available ? "on" : "off"}"></div>
      ${image ? `<img class="medicine-image small-product" src="${esc(image)}" alt="${esc(name)}">` : `<div class="medicine-image small-product placeholder">✿</div>`}
      <div class="med-top"><span class="med-icon">✿</span><span class="stock-label">${available ? "Available" : "Not available"}</span></div>
      <h3>${esc(name)}</h3>
      ${m.composition ? `<div class="composition-mini">${esc(m.composition)}</div>` : ""}
      <div class="rate-row"><span>N. Rate</span><b>${money(sellRate(m))}</b></div>
      <div class="rate-row"><span>Exp.</span><b>N. RATE</b></div>
      <div class="rate-row"><span>MRP</span><b>N. RATE</b></div>
      <div class="card-actions"><button class="ghost" data-details="${esc(m.id)}">Details</button><button class="primary" data-add="${esc(m.id)}" ${!available ? "disabled" : ""}>Add to Cart</button></div>
    </article>`;
  }).join("") : "";
  $("#emptyMedicines").hidden = list.length !== 0;
  document.querySelectorAll("[data-details]").forEach(b => b.onclick = () => location.href = `drug-details.html?id=${encodeURIComponent(b.dataset.details)}`);
  document.querySelectorAll("[data-add]").forEach(b => b.onclick = () => addToCart(b.dataset.add));
}

function addToCart(id) {
  const m = medicines.find(x => x.id === id);
  const max = Number(m?.quantity ?? m?.stock ?? 0);
  if (!m || m.available === false || max < 1) return;
  const existing = cart.find(x => x.id === id);
  if (existing) existing.qty = Math.min(existing.qty + 1, max); else cart.push({ id, qty: 1 });
  renderCart(); toast(`${medicineName(m)} cart me add ho gayi ✓`);
}
function changeQty(id, d) {
  const x = cart.find(a => a.id === id), m = medicines.find(a => a.id === id);
  if (!x || !m) return;
  const max = Number(m.quantity ?? m.stock ?? 0);
  x.qty = Math.max(0, Math.min(max, x.qty + d));
  if (!x.qty) cart = cart.filter(a => a.id !== id);
  renderCart();
}
function currentCartItems() { return cart.map(x => ({...x, m: medicines.find(a => a.id === x.id)})).filter(x => x.m); }
function currentCartTotal(items) { return items.reduce((s,x) => s + sellRate(x.m) * x.qty, 0); }

function renderCart() {
  localStorage.setItem("zenoCart", JSON.stringify(cart));
  if (!$("#cartCount")) return;
  $("#cartCount").textContent = cart.reduce((s,x) => s + x.qty, 0);
  const items = currentCartItems();
  $("#cartList").innerHTML = items.length ? items.map(x => `<div class="cart-item"><div><b>${esc(medicineName(x.m))}</b><small>${money(sellRate(x.m))} each</small></div><div class="qty-control"><button data-minus="${esc(x.id)}">−</button><b>${x.qty}</b><button data-plus="${esc(x.id)}">+</button><button class="mini danger" data-remove="${esc(x.id)}">×</button></div></div>`).join("") : "<div class='empty'>Cart is empty.</div>";
  const subtotal = currentCartTotal(items), reward = getRewardState();
  const discount = reward.available ? Math.min(reward.discount, subtotal) : 0;
  $("#cartSubtotal").textContent = money(subtotal);
  $("#cartDiscount").textContent = discount ? `− ${money(discount)}` : "₹0.00";
  $("#cartTotal").textContent = money(Math.max(0, subtotal - discount));
  $("#rewardCartMsg").textContent = reward.available ? `🎉 ${reward.milestone} qualifying orders complete! ₹${reward.discount} OFF unlocked.` : `Offer: ₹${MIN_QUALIFYING_ORDER}+ order • 6 din ke andar ke orders = 1 order • ${reward.completed % 40}/40 qualifying completed`;
  $("#placeCartOrder").disabled = !items.length;
  document.querySelectorAll("[data-minus]").forEach(b => b.onclick = () => changeQty(b.dataset.minus, -1));
  document.querySelectorAll("[data-plus]").forEach(b => b.onclick = () => changeQty(b.dataset.plus, 1));
  document.querySelectorAll("[data-remove]").forEach(b => b.onclick = () => { cart = cart.filter(x => x.id !== b.dataset.remove); renderCart(); });
}

function rawOrderGroups(list) {
  const valid = list.filter(o => o.status !== "cancelled").sort((a,b) => (orderDate(a)?.getTime() || 0) - (orderDate(b)?.getTime() || 0));
  const map = new Map();
  for (const o of valid) {
    const key = o.orderGroupId || o.id;
    if (!map.has(key)) map.set(key, {key, anchor: orderDate(o)?.getTime() || 0, orders: []});
    const g = map.get(key); g.orders.push(o); g.anchor = Math.min(g.anchor, orderDate(o)?.getTime() || 0);
  }
  return [...map.values()].sort((a,b) => a.anchor - b.anchor);
}
function getRewardGroups(list) {
  const qualifying = rawOrderGroups(list).filter(g => {
    const total = g.orders.reduce((s,o) => s + Number(o.lineTotalAtOrder ?? (Number(o.sellRateAtOrder || 0) * Number(o.quantity || 0))), 0);
    g.total = Number(g.orders[0]?.orderTotalAtOrder ?? total);
    return g.total >= MIN_QUALIFYING_ORDER;
  });
  const groups = [];
  for (const r of qualifying) {
    let g = groups.at(-1);
    if (!g || r.anchor - g.anchor > SIX_DAYS) { g = {anchor:r.anchor, ids:new Set(), orders:[], total:0}; groups.push(g); }
    g.ids.add(r.key); g.orders.push(...r.orders); g.total += r.total;
  }
  return groups;
}
function completedRewardGroups(list) { return getRewardGroups(list).filter(g => g.orders.some(o => o.status === "completed")); }
function getRewardState() {
  const groups = completedRewardGroups(orders);
  const used = groups.filter(g => g.orders.some(o => o.rewardApplied)).length;
  let discount = 0, milestone = 0;
  if (groups.length >= 40 && used < 40) { discount = REWARD40; milestone = 40; }
  else if (groups.length >= 20 && used < 20) { discount = REWARD20; milestone = 20; }
  return {groups, available: discount > 0, discount, milestone, completed: groups.length, used};
}
function getRewardGroupNumber(o) {
  const groups = getRewardGroups(orders);
  const i = groups.findIndex(g => g.ids.has(o.orderGroupId || o.id));
  return i >= 0 ? i + 1 : "-";
}

async function loadOrders() {
  try {
    const snap = await getDocs(query(collection(db, "orders"), where("customerId", "==", currentUser.uid)));
    orders = snap.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => (orderDate(b)?.getTime() || 0) - (orderDate(a)?.getTime() || 0));
    orders.forEach(o => { if (knownStatuses[o.id] && knownStatuses[o.id] !== o.status && o.status !== "new") toast(`Order update: ${o.medicineName || "Order"} → ${o.status}`); knownStatuses[o.id] = o.status; });
    localStorage.setItem("zenoOrderStatuses", JSON.stringify(knownStatuses));
  } catch (e) { console.error("Orders read failed", e); orders = []; }
  const reward = getRewardState();
  $("#reward").innerHTML = `🎁 Offer: Minimum ₹${MIN_QUALIFYING_ORDER} ka order hi count hoga • 6 din ke andar ke orders = 1 order • <b>${reward.completed % 20}/20</b> • 20 orders = ₹${REWARD20} OFF • 40 orders = ₹${REWARD40} OFF`;
  $("#ordersList").innerHTML = orders.length ? orders.map(o => `<article class="order-card glass"><div><b>${esc(o.medicineName || "Medicine")}</b><small>${orderDate(o)?.toLocaleString?.() || "Just now"}${o.orderGroupId ? ` • 6-Day Order #${getRewardGroupNumber(o)}` : ""}</small></div><div>Qty <b>${o.quantity}</b></div><div>${money((Number(o.lineTotalAtOrder) || Number(o.sellRateAtOrder || 0) * Number(o.quantity || 0)) - Number(o.discountAtOrder || 0))}${o.discountAtOrder ? `<small>− ₹${Number(o.discountAtOrder).toFixed(2)} bonus</small>` : ""}</div><div><span class="status ${esc(o.status)}">${esc(o.status)}</span>${(o.status === "new" || o.status === "confirmed") ? `<button class="mini danger cancel-order" data-cancel="${esc(o.id)}">Cancel</button>` : ""}</div></article>`).join("") : `<div class="empty glass">No orders yet.</div>`;
  document.querySelectorAll("[data-cancel]").forEach(b => b.onclick = () => cancelOrder(b.dataset.cancel));
}

async function cancelOrder(id) {
  const o = orders.find(x => x.id === id);
  if (!o || !confirm("Is order ko cancel karna hai?")) return;
  try {
    const { updateDoc } = await import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js");
    await updateDoc(doc(db, "orders", id), {status:"cancelled", updatedAt:serverTimestamp()});
    toast("Order cancelled ✓"); await loadOrders();
  } catch (e) { toast(e.message || "Cancel failed"); }
}

$("#placeCartOrder").onclick = async () => {
  const items = currentCartItems(); if (!items.length) return;
  const subtotal = currentCartTotal(items);
  if (subtotal < MIN_QUALIFYING_ORDER) { $("#cartMsg").textContent = `Minimum ₹${MIN_QUALIFYING_ORDER} ka order chahiye. Abhi ${money(subtotal)} hai.`; toast(`Minimum order ₹${MIN_QUALIFYING_ORDER} hai`); return; }
  $("#cartMsg").textContent = "Sending order…";
  try {
    const now = Date.now(), groupId = `${currentUser.uid}_${now}`, reward = getRewardState();
    const discount = reward.available ? Math.min(reward.discount, subtotal) : 0;
    const batch = writeBatch(db);
    items.forEach(x => {
      const lineTotal = sellRate(x.m) * x.qty;
      batch.set(doc(collection(db, "orders")), {customerId:currentUser.uid,customerName:customer.name,medicalName:customer.medicalName,phone:customer.phone,medicineId:x.m.id,medicineName:medicineName(x.m),quantity:x.qty,sellRateAtOrder:sellRate(x.m),lineTotalAtOrder:lineTotal,orderTotalAtOrder:subtotal,status:"new",stockDeducted:false,orderGroupId:groupId,orderTimeMs:now,rewardApplied:Boolean(reward.available),rewardMilestone:reward.available?reward.milestone:0,discountAtOrder:subtotal ? discount * (lineTotal/subtotal) : 0,createdAt:serverTimestamp()});
    });
    await batch.commit(); cart=[]; renderCart(); $("#cartMsg").textContent = discount ? `Order placed • ₹${discount.toFixed(2)} OFF applied ✓` : "Order placed successfully ✓"; toast("Order placed successfully ✓"); await loadOrders(); setTimeout(() => $("#cartDialog").close(), 900);
  } catch (e) { console.error(e); $("#cartMsg").textContent = e?.message || "Could not place order."; }
};

$("#search").addEventListener("input", renderMedicines);
$("#clearSearch").onclick = () => { $("#search").value = ""; renderMedicines(); };
$("#refreshBtn").onclick = async () => { await loadMedicines(); await loadOrders(); toast("Updated ✓"); };
$("#logoutBtn").onclick = async () => { try { await signOut(auth); localStorage.removeItem("zenoCustomerTab"); location.replace("index.html"); } catch(e) { toast("Logout failed"); } };
$("#supportBtn").onclick = () => $("#supportDialog").showModal();
$("#closeSupport").onclick = () => $("#supportDialog").close();
$("#cartBtn").onclick = () => { $("#cartMsg").textContent = ""; $("#cartDialog").showModal(); };
$("#closeCart").onclick = () => $("#cartDialog").close();
$("#profileBtn").onclick = () => { $("#profileTitle").textContent = customer?.name || "Customer"; $("#profileMedical").textContent = customer?.medicalName || ""; $("#profilePhone").textContent = customer?.phone || ""; $("#profileMsg").textContent = ""; $("#currentPassword").value = ""; $("#newPassword").value = ""; $("#profileDialog").showModal(); };
$("#closeProfile").onclick = () => $("#profileDialog").close();
$("#profileForm").addEventListener("submit", async e => { e.preventDefault(); const oldp=$("#currentPassword").value,newp=$("#newPassword").value; if(!oldp||newp.length<6){$("#profileMsg").textContent="Current password aur 6+ character new password bharo.";return;} try{await reauthenticateWithCredential(currentUser,EmailAuthProvider.credential(currentUser.email,oldp));await updatePassword(currentUser,newp);$("#profileMsg").textContent="Password updated ✓";setTimeout(()=>$("#profileDialog").close(),600);}catch(e){$("#profileMsg").textContent="Password update failed. Current password check karo.";} });

document.querySelectorAll(".tab").forEach(tab => tab.onclick = () => { document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active")); tab.classList.add("active"); const isOrders=tab.dataset.tab === "orders"; $("#medicinesTab").hidden=isOrders; $("#ordersTab").hidden=!isOrders; localStorage.setItem("zenoCustomerTab",tab.dataset.tab); });
function restoreTab(){ const t=localStorage.getItem("zenoCustomerTab"); if(!t)return; const b=document.querySelector(`.tab[data-tab="${t}"]`); if(b)b.click(); }
