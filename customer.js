import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, addDoc, query, where, orderBy, serverTimestamp, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
const $=s=>document.querySelector(s);const money=n=>`₹${Number(n||0).toFixed(2)}`;let currentUser,customer,medicines=[],orders=[],cart=JSON.parse(localStorage.getItem("zenoCart")||"[]");let knownStatuses=JSON.parse(localStorage.getItem("zenoOrderStatuses")||"{}");
onAuthStateChanged(auth,async user=>{if(!user)return location.replace("index.html");currentUser=user;const snap=await getDoc(doc(db,"customers",user.uid));if(!snap.exists()||snap.data().active===false){await signOut(auth);return location.replace("index.html")}customer=snap.data();$("#customerName").textContent=customer.name;$("#medicalName").textContent=customer.medicalName;$("#welcome").textContent=`Hello, ${customer.name.split(" ")[0]} ✿`;await loadMedicines();await loadOrders();restoreTab();renderCart();if(location.hash==="#cart")$("#cartDialog").showModal();});
async function loadMedicines(){const snap=await getDocs(query(collection(db,"medicines"),orderBy("name")));medicines=snap.docs.map(d=>({id:d.id,...d.data()}));renderChips();renderMedicines()}
function renderChips(){const cats=[...new Set(medicines.map(m=>m.category).filter(Boolean))];$("#categoryChips").innerHTML=cats.length?`<button class="chip active" data-cat="">All</button>${cats.map(c=>`<button class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}:"";document.querySelectorAll("[data-cat]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-cat]").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderMedicines()})}
function renderMedicines(){const term=$("#search").value.toLowerCase().trim(),cat=document.querySelector("[data-cat].active")?.dataset.cat||"";const list=medicines.filter(m=>(!cat||m.category===cat)&&((m.name||"").toLowerCase().includes(term)||(m.composition||"").toLowerCase().includes(term)));$("#medicineGrid").innerHTML=list.map(m=>{const available=m.available&&Number(m.quantity)>0;return `<article class="medicine-card glass"><div class="stock-dot ${available?"on":"off"}"></div>${m.imageData?`<img class="medicine-image small-product" src="${m.imageData}" alt="${esc(m.name)}">`:`<div class="medicine-image small-product placeholder">✿</div>`}<div class="med-top"><span class="med-icon">✿</span><span class="stock-label">${available?"Available":"Not available"}</span></div><h3>${esc(m.name)}</h3>${m.composition?`<div class="composition-mini">${esc(m.composition)}</div>`:""}<div class="rate-row"><span>N. Rate</span><b>${money(m.sellRate)}</b></div><div class="rate-row"><span>Exp.</span><b>N. RATE</b></div><div class="rate-row"><span>MRP</span><b>N. RATE</b></div><div class="card-actions"><button class="ghost" data-details="${m.id}">Details</button><button class="primary" data-add="${m.id}" ${!available?"disabled":""}>Add to Cart</button></div></article>`}).join("");$("#emptyMedicines").hidden=list.length!==0;document.querySelectorAll("[data-details]").forEach(b=>b.onclick=()=>location.href=`drug-details.html?id=${encodeURIComponent(b.dataset.details)}`);document.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>addToCart(b.dataset.add))}
function addToCart(id){const m=medicines.find(x=>x.id===id);if(!m||!m.available||Number(m.quantity)<1)return;const existing=cart.find(x=>x.id===id);if(existing)existing.qty=Math.min(existing.qty+1,Number(m.quantity));else cart.push({id,qty:1});renderCart();toast(`${m.name} cart me add ho gayi ✓`) }
function renderCart(){localStorage.setItem("zenoCart",JSON.stringify(cart));$("#cartCount").textContent=cart.reduce((s,x)=>s+x.qty,0);const items=cart.map(x=>{const m=medicines.find(a=>a.id===x.id);return m?{...x,m}:null}).filter(Boolean);$("#cartList").innerHTML=items.length?items.map(x=>`<div class="cart-item"><div><b>${esc(x.m.name)}</b><small>${money(x.m.sellRate)} each</small></div><div class="qty-control"><button data-minus="${x.id}">−</button><b>${x.qty}</b><button data-plus="${x.id}">+</button><button class="mini danger" data-remove="${x.id}">×</button></div></div>`).join(""):"<div class='empty'>Cart is empty.</div>";const total=items.reduce((s,x)=>s+Number(x.m.sellRate||0)*x.qty,0);$("#cartTotal").textContent=money(total);$("#placeCartOrder").disabled=!items.length;document.querySelectorAll("[data-minus]").forEach(b=>b.onclick=()=>changeQty(b.dataset.minus,-1));document.querySelectorAll("[data-plus]").forEach(b=>b.onclick=()=>changeQty(b.dataset.plus,1));document.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{cart=cart.filter(x=>x.id!==b.dataset.remove);renderCart()})}
function changeQty(id,d){const x=cart.find(a=>a.id===id),m=medicines.find(a=>a.id===id);if(!x||!m)return;x.qty=Math.max(0,Math.min(Number(m.quantity),x.qty+d));if(!x.qty)cart=cart.filter(a=>a.id!==id);renderCart()}
$("#placeCartOrder").onclick=async()=>{const items=cart.map(x=>({...x,m:medicines.find(a=>a.id===x.id)})).filter(x=>x.m);$("#cartMsg").textContent="Sending order…";try{const batch=writeBatch(db);for(const x of items){batch.set(doc(collection(db,"orders")),{customerId:currentUser.uid,customerName:customer.name,medicalName:customer.medicalName,phone:customer.phone,medicineId:x.m.id,medicineName:x.m.name,quantity:x.qty,sellRateAtOrder:Number(x.m.sellRate),status:"new",stockDeducted:false,createdAt:serverTimestamp()})}await batch.commit();cart=[];renderCart();$("#cartMsg").textContent="All orders sent to Admin ✓";toast("Order placed successfully ✓");await loadOrders();setTimeout(()=>$("#cartDialog").close(),700)}catch(e){$("#cartMsg").textContent=e?.message||"Could not place order."}};
function orderDate(o){return o.createdAt?.toDate?.()|| (o.orderTimeMs?new Date(o.orderTimeMs):null)}

const MIN_QUALIFYING_ORDER=1500;
const REWARD20=100;
const REWARD40=250;
const SIX_DAYS=6*24*60*60*1000;

function orderDate(o){return o.createdAt?.toDate?.()||(o.orderTimeMs?new Date(o.orderTimeMs):null)}

function rawOrderGroups(list){
  const nonCancelled=list.filter(o=>o.status!=="cancelled")
    .sort((a,b)=>(orderDate(a)?.getTime()||0)-(orderDate(b)?.getTime()||0));
  const byId=new Map();
  for(const o of nonCancelled){
    const key=o.orderGroupId||o.id;
    if(!byId.has(key))byId.set(key,{key,anchor:orderDate(o)?.getTime()||0,orders:[]});
    const g=byId.get(key);
    g.orders.push(o);
    if((orderDate(o)?.getTime()||0)<g.anchor)g.anchor=orderDate(o)?.getTime()||0;
  }
  return [...byId.values()].sort((a,b)=>a.anchor-b.anchor);
}

function getRewardGroups(list){
  // Only orders whose COMPLETE cart/order total is at least ₹1500 qualify.
  const raw=rawOrderGroups(list).filter(g=>{
    const total=g.orders.reduce((s,o)=>s+(Number(o.lineTotalAtOrder)!=null?Number(o.lineTotalAtOrder):Number(o.sellRateAtOrder||0)*Number(o.quantity||0)),0);
    g.total=Number(g.orders[0]?.orderTotalAtOrder||total);
    return g.total>=MIN_QUALIFYING_ORDER;
  });
  const groups=[];
  for(const o of raw){
    const t=o.anchor;
    let g=groups.at(-1);
    if(!g || t-g.anchor>SIX_DAYS){
      g={anchor:t,ids:new Set(),orders:[],total:0,num:groups.length+1};
      groups.push(g);
    }
    g.ids.add(o.key);
    g.orders.push(...o.orders);
    g.total+=o.total;
  }
  return groups;
}

function completedRewardGroups(list){
  return getRewardGroups(list).filter(g=>g.orders.some(o=>o.status==="completed"));
}

function getRewardState(){
  const groups=completedRewardGroups(orders);
  const used=groups.filter(g=>g.orders.some(o=>o.rewardApplied)).length;
  const available20=groups.length>=20 && used<20;
  const available40=groups.length>=40 && used<40;
  let discount=0, milestone=0;
  if(available40){discount=REWARD40;milestone=40}
  else if(available20){discount=REWARD20;milestone=20}
  return {groups,available:discount>0,discount,milestone,completed:groups.length,used};
}

async function loadOrders(){
  const snap=await getDocs(query(collection(db,"orders"),where("customerId","==",currentUser.uid)));
  orders=snap.docs.map(d=>({id:d.id,...d.data()}))
    .sort((a,b)=>(orderDate(b)?.getTime()||0)-(orderDate(a)?.getTime()||0));

  orders.forEach(o=>{
    if(knownStatuses[o.id]&&knownStatuses[o.id]!==o.status&&o.status!=="new")
      toast(`Order update: ${o.medicineName} → ${o.status}`);
    knownStatuses[o.id]=o.status;
  });
  localStorage.setItem("zenoOrderStatuses",JSON.stringify(knownStatuses));

  const reward=getRewardState();
  const cycleProgress=reward.completed>=40?reward.completed%40:(reward.completed%20);
  const offerText=`🎁 Offer: Minimum ₹${MIN_QUALIFYING_ORDER} ka order hi count hoga • 6 din ke andar ke orders = 1 order • <b>${cycleProgress}/20</b>`;

  $("#reward").innerHTML=`${offerText} • 20 orders = ₹${REWARD20} OFF • 40 orders = ₹${REWARD40} OFF`;

  $("#ordersList").innerHTML=orders.length
    ?orders.map(o=>`<article class="order-card glass">
      <div><b>${esc(o.medicineName)}</b>
      <small>${orderDate(o)?.toLocaleString?.()||"Just now"}${o.orderGroupId?` • 6-Day Order #${getRewardGroupNumber(o)}`:""}</small></div>
      <div>Qty <b>${o.quantity}</b></div>
      <div>${money((Number(o.lineTotalAtOrder)||Number(o.sellRateAtOrder||0)*Number(o.quantity||0))-Number(o.discountAtOrder||0))}
        ${o.discountAtOrder?`<small class="discount-note">− ₹${Number(o.discountAtOrder).toFixed(2)} bonus</small>`:""}</div>
      <div><span class="status ${o.status}">${o.status}</span>
      ${(o.status==="new"||o.status==="confirmed")?`<button class="mini danger cancel-order" data-cancel="${o.id}">Cancel</button>`:""}</div>
    </article>`).join("")
    :`<div class="empty glass">No orders yet.</div>`;

  document.querySelectorAll("[data-cancel]").forEach(b=>b.onclick=()=>cancelOrder(b.dataset.cancel));
}

function getRewardGroupNumber(o){
  const groups=getRewardGroups(orders);
  const i=groups.findIndex(g=>g.ids.has(o.orderGroupId||o.id));
  return i>=0?i+1:"-";
}

function currentCartTotal(items){
  return items.reduce((s,x)=>s+Number(x.m.sellRate||0)*x.qty,0);
}

function renderCart(){
  localStorage.setItem("zenoCart",JSON.stringify(cart));
  $("#cartCount").textContent=cart.reduce((s,x)=>s+x.qty,0);
  const items=cart.map(x=>{const m=medicines.find(a=>a.id===x.id);return m?{...x,m}:null}).filter(Boolean);

  $("#cartList").innerHTML=items.length
    ?items.map(x=>`<div class="cart-item">
      <div><b>${esc(x.m.name)}</b><small>${money(x.m.sellRate)} each</small></div>
      <div class="qty-control"><button data-minus="${x.id}">−</button><b>${x.qty}</b><button data-plus="${x.id}">+</button><button class="mini danger" data-remove="${x.id}">×</button></div>
    </div>`).join("")
    :"<div class='empty'>Cart is empty.</div>";

  const subtotal=currentCartTotal(items);
  const reward=getRewardState();
  const discount=reward.available?Math.min(reward.discount,subtotal):0;
  const total=Math.max(0,subtotal-discount);

  $("#cartSubtotal").textContent=money(subtotal);
  $("#cartDiscount").textContent=discount?`− ${money(discount)}`:"₹0.00";
  $("#cartTotal").textContent=money(total);

  $("#rewardCartMsg").textContent=reward.available
    ?`🎉 ${reward.milestone} qualifying orders complete! ₹${reward.discount} OFF unlocked.`
    :`Offer: ₹${MIN_QUALIFYING_ORDER}+ order • 6 din ke andar ke orders = 1 order • ${reward.completed%40}/40 qualifying completed`;

  $("#placeCartOrder").disabled=!items.length;

  document.querySelectorAll("[data-minus]").forEach(b=>b.onclick=()=>changeQty(b.dataset.minus,-1));
  document.querySelectorAll("[data-plus]").forEach(b=>b.onclick=()=>changeQty(b.dataset.plus,1));
  document.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{
    cart=cart.filter(x=>x.id!==b.dataset.remove);renderCart();
  });
}

function addToCart(id){
  const m=medicines.find(x=>x.id===id);
  if(!m||!m.available||Number(m.quantity)<1)return;
  const existing=cart.find(x=>x.id===id);
  if(existing)existing.qty=Math.min(existing.qty+1,Number(m.quantity));
  else cart.push({id,qty:1});
  renderCart();toast(`${m.name} cart me add ho gayi ✓`);
}

function changeQty(id,d){
  const x=cart.find(a=>a.id===id),m=medicines.find(a=>a.id===id);
  if(!x||!m)return;
  x.qty=Math.max(0,Math.min(Number(m.quantity),x.qty+d));
  if(!x.qty)cart=cart.filter(a=>a.id!==id);
  renderCart();
}

$("#placeCartOrder").onclick=async()=>{
  const items=cart.map(x=>({...x,m:medicines.find(a=>a.id===x.id)})).filter(x=>x.m);
  if(!items.length)return;

  const subtotal=currentCartTotal(items);
  if(subtotal<MIN_QUALIFYING_ORDER){
    $("#cartMsg").textContent=`Minimum ₹${MIN_QUALIFYING_ORDER} ka order chahiye. Abhi ${money(subtotal)} hai.`;
    toast(`Minimum order ₹${MIN_QUALIFYING_ORDER} hai`);
    return;
  }

  $("#cartMsg").textContent="Sending order…";
  try{
    const now=Date.now(),groupId=`${currentUser.uid}_${now}`;
    const reward=getRewardState();
    const discount=reward.available?Math.min(reward.discount,subtotal):0;
    const batch=writeBatch(db);

    for(const x of items){
      const lineTotal=Number(x.m.sellRate||0)*x.qty;
      const lineDiscount=subtotal?discount*(lineTotal/subtotal):0;
      batch.set(doc(collection(db,"orders")),{
        customerId:currentUser.uid,
        customerName:customer.name,
        medicalName:customer.medicalName,
        phone:customer.phone,
        medicineId:x.m.id,
        medicineName:x.m.name,
        quantity:x.qty,
        sellRateAtOrder:Number(x.m.sellRate),
        lineTotalAtOrder:lineTotal,
        orderTotalAtOrder:subtotal,
        status:"new",
        stockDeducted:false,
        orderGroupId:groupId,
        orderTimeMs:now,
        rewardApplied:Boolean(reward.available),
        rewardMilestone:reward.available?reward.milestone:0,
        discountAtOrder:lineDiscount,
        createdAt:serverTimestamp()
      });
    }

    await batch.commit();
    cart=[];renderCart();
    $("#cartMsg").textContent=discount
      ?`Order placed • ₹${discount.toFixed(2)} OFF applied ✓`
      :"Order placed successfully ✓";
    toast("Order placed successfully ✓");
    await loadOrders();
    setTimeout(()=>$("#cartDialog").close(),900);
  }catch(e){
    $("#cartMsg").textContent=e?.message||"Could not place order.";
  }
};

$("#search").addEventListener("input",renderMedicines);$("#clearSearch").onclick=()=>{$("#search").value="";renderMedicines()};$("#refreshBtn").onclick=async()=>{await loadMedicines();await loadOrders();toast("Updated ✓")};$("#logoutBtn").onclick=()=>signOut(auth).then(()=>location.replace("index.html"));$("#supportBtn").onclick=()=>$("#supportDialog").showModal();$("#closeSupport").onclick=()=>$("#supportDialog").close();$("#cartBtn").onclick=()=>{$("#cartMsg").textContent="";$("#cartDialog").showModal()};$("#closeCart").onclick=()=>$("#cartDialog").close();$("#profileBtn").onclick=()=>{$("#profileTitle").textContent=customer.name;$("#profileMedical").textContent=customer.medicalName||"";$("#profilePhone").textContent=customer.phone||"";$("#profileMsg").textContent="";$("#currentPassword").value="";$("#newPassword").value="";$("#profileDialog").showModal()};$("#closeProfile").onclick=()=>$("#profileDialog").close();
$("#profileForm").addEventListener("submit",async e=>{e.preventDefault();const oldp=$("#currentPassword").value,newp=$("#newPassword").value;if(!oldp||newp.length<6){$("#profileMsg").textContent="Current password aur 6+ character new password bharo.";return}try{const cred=EmailAuthProvider.credential(currentUser.email,oldp);await reauthenticateWithCredential(currentUser,cred);await updatePassword(currentUser,newp);$("#profileMsg").textContent="Password updated ✓";setTimeout(()=>$("#profileDialog").close(),600)}catch(e){$("#profileMsg").textContent="Password update failed. Current password check karo."}});
document.querySelectorAll(".tab").forEach(tab=>tab.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));tab.classList.add("active");const isOrders=tab.dataset.tab==="orders";$("#medicinesTab").hidden=isOrders;$("#ordersTab").hidden=!isOrders;localStorage.setItem("zenoCustomerTab",tab.dataset.tab)});function restoreTab(){const t=localStorage.getItem("zenoCustomerTab");if(!t)return;const b=document.querySelector(`.tab[data-tab="${t}"]`);if(b)b.click()}
let toastTimer;function toast(msg){$("#toast").textContent=msg;$("#toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("#toast").classList.remove("show"),2800)}function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
