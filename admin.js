import { auth, db, firebaseConfig, customerEmailFromLogin } from "./firebase.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, createUserWithEmailAndPassword, getAuth, getIdTokenResult } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { collection, doc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, deleteField, runTransaction } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
const $=s=>document.querySelector(s);const money=n=>`₹${Number(n||0).toFixed(2)}`;let medicines=[],customers=[],orders=[];const customerApp=initializeApp(firebaseConfig,"zeno-customer-creator");const customerAuth=getAuth(customerApp);
if($("#adminLoginForm"))$("#adminLoginForm").addEventListener("submit",async e=>{e.preventDefault();$("#adminLoginMsg").textContent="Signing in…";try{await signInWithEmailAndPassword(auth,$("#adminEmail").value.trim(),$("#adminPassword").value);location.replace("admin-dashboard.html")}catch{$("#adminLoginMsg").textContent="Admin login failed. Check email/password."}});
onAuthStateChanged(auth,async user=>{if(!user){if(location.pathname.endsWith("admin-dashboard.html"))location.replace("admin.html");return}if(location.pathname.endsWith("admin.html")){location.replace("admin-dashboard.html");return}try{const token=await getIdTokenResult(user,true);if(token.claims.admin!==true)throw new Error()}catch{await signOut(auth);location.replace("admin.html");return}if($("#adminApp")){await loadAll();restoreTab()}});
async function loadAll(){await Promise.all([loadMedicines(),loadCustomers(),loadOrders()]);stats()}
async function loadMedicines(){const s=await getDocs(query(collection(db,"medicines"),orderBy("name")));const ps=await getDocs(collection(db,"medicinePrivate"));const pm=new Map(ps.docs.map(d=>[d.id,d.data()]));medicines=s.docs.map(d=>({id:d.id,...d.data(),...(pm.get(d.id)||{})}));for(const d of s.docs){const x=d.data();if(x.purchaseRate!==undefined||x.gst!==undefined||x.transport!==undefined){await setDoc(doc(db,"medicinePrivate",d.id),{purchaseRate:Number(x.purchaseRate||0),gst:Number(x.gst||0),transport:Number(x.transport||0),updatedAt:serverTimestamp()},{merge:true});await updateDoc(doc(db,"medicines",d.id),{purchaseRate:deleteField(),gst:deleteField(),transport:deleteField()})}}renderMedicines()}
async function loadCustomers(){const s=await getDocs(collection(db,"customers"));customers=s.docs.map(d=>({id:d.id,...d.data()}));renderCustomers()}
async function loadOrders(){const s=await getDocs(collection(db,"orders"));orders=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));renderOrders()}
function stats(){const low=medicines.filter(m=>Number(m.quantity)<=10),exp=medicines.filter(m=>{if(!m.expiry)return false;const d=new Date(m.expiry),now=new Date();return d>=new Date(now.getFullYear(),now.getMonth(),now.getDate())&&d<=new Date(now.getFullYear(),now.getMonth(),now.getDate()+30)});$("#statMedicines").textContent=medicines.length;$("#statCustomers").textContent=customers.length;$("#statOrders").textContent=orders.filter(o=>o.status==="new").length;$("#statLow").textContent=low.length;$("#statExpiry").textContent=exp.length;$("#alertPanel").innerHTML=(low.length||exp.length)?`<div class="alert-box">${low.length?`⚠️ <b>${low.length}</b> low-stock medicine(s).`:""} ${exp.length?`⏳ <b>${exp.length}</b> medicine(s) expiring within 30 days.`:""}</div>`:"<div class='alert-box success-alert'>✓ Inventory looks healthy.</div>"}
function renderMedicines(){const term=$("#adminMedicineSearch").value.toLowerCase().trim();const list=medicines.filter(m=>((m.name||"").toLowerCase().includes(term)||(m.composition||"").toLowerCase().includes(term)||(m.category||"").toLowerCase().includes(term)));$("#adminMedicineTable").innerHTML=`<div class="table-scroll"><table><thead><tr><th>Image</th><th>Drug</th><th>Composition</th><th>Qty</th><th>Expiry</th><th>MRP</th><th>N. Rate</th><th>Purchase</th><th>GST</th><th>Transport</th><th>Stock</th><th>Actions</th></tr></thead><tbody>${list.map(m=>`<tr><td>${m.imageData?`<img class="table-thumb" src="${m.imageData}" alt="">`:`—`}</td><td><b>${esc(m.name)}</b><small>${esc(m.category||"")}</small></td><td>${esc(m.composition||"—")}</td><td>${m.quantity}</td><td>${esc(m.expiry||"—")}</td><td>${money(m.mrp)}</td><td>${money(m.sellRate)}</td><td>${money(m.purchaseRate)}</td><td>${Number(m.gst||0)}%</td><td>${money(m.transport)}</td><td><button class="stock-toggle ${m.available?"yes":"no"}" data-stock="${m.id}">${m.available?"ON":"OFF"}</button></td><td><button class="mini" data-edit="${m.id}">Edit</button><button class="mini danger" data-del="${m.id}">Delete</button></td></tr>`).join("")}</tbody></table></div>`;document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editMedicine(b.dataset.edit));document.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>deleteMedicine(b.dataset.del));document.querySelectorAll("[data-stock]").forEach(b=>b.onclick=()=>toggleStock(b.dataset.stock))}

const MIN_QUALIFYING_ORDER=1500;
const REWARD20=100;
const REWARD40=250;
const SIX_DAYS=6*24*60*60*1000;

function orderDate(o){return o.createdAt?.toDate?.()||(o.orderTimeMs?new Date(o.orderTimeMs):null)}

function rawOrderGroupsForCustomer(customerId){
  const list=orders.filter(o=>o.customerId===customerId&&o.status!=="cancelled")
    .sort((a,b)=>(orderDate(a)?.getTime()||0)-(orderDate(b)?.getTime()||0));
  const byId=new Map();
  for(const o of list){
    const key=o.orderGroupId||o.id;
    if(!byId.has(key))byId.set(key,{key,anchor:orderDate(o)?.getTime()||0,orders:[]});
    const g=byId.get(key);
    g.orders.push(o);
    g.anchor=Math.min(g.anchor,orderDate(o)?.getTime()||g.anchor);
  }
  return [...byId.values()].sort((a,b)=>a.anchor-b.anchor);
}

function rewardGroupsForCustomer(customerId){
  const raw=rawOrderGroupsForCustomer(customerId).filter(g=>{
    const total=g.orders.reduce((s,o)=>s+(Number(o.lineTotalAtOrder||0)||Number(o.sellRateAtOrder||0)*Number(o.quantity||0)),0);
    g.total=Number(g.orders[0]?.orderTotalAtOrder||total);
    return g.total>=MIN_QUALIFYING_ORDER;
  });
  const groups=[];
  for(const o of raw){
    let g=groups.at(-1);
    if(!g||o.anchor-g.anchor>SIX_DAYS){
      g={anchor:o.anchor,num:groups.length+1,ids:new Set(),orders:[],total:0};
      groups.push(g);
    }
    g.ids.add(o.key);g.orders.push(...o.orders);g.total+=o.total;
  }
  return groups;
}

function customerRewardSummary(customerId){
  const groups=rewardGroupsForCustomer(customerId);
  const completed=groups.filter(g=>g.orders.some(o=>o.status==="completed")).length;
  const used=groups.filter(g=>g.orders.some(o=>o.rewardApplied)).length;
  const unlocked40=completed>=40&&used<40;
  const unlocked20=completed>=20&&used<20;
  return {groups,completed,used,discount:unlocked40?REWARD40:(unlocked20?REWARD20:0)};
}

function renderCustomers(){
  $("#customerTable").innerHTML=`<div class="table-scroll"><table><thead>
  <tr><th>Medical</th><th>Customer</th><th>Phone</th><th>Login ID</th><th>Offer Progress</th><th>Access</th><th>Created</th></tr></thead>
  <tbody>${customers.map(c=>{
    const r=customerRewardSummary(c.id);
    return `<tr><td>${esc(c.medicalName)}</td><td><b>${esc(c.name)}</b></td><td>${esc(c.phone)}</td><td>${esc(c.loginId)}</td>
    <td><span class="offer-badge">${r.completed}/40 • ₹${r.discount} unlocked</span></td>
    <td><button class="stock-toggle ${c.active!==false?"yes":"no"}" data-customer="${c.id}">${c.active!==false?"ACTIVE":"BLOCKED"}</button></td>
    <td>${c.createdAt?.toDate?.().toLocaleDateString?.()||"-"}</td></tr>`;
  }).join("")}</tbody></table></div>`;
  document.querySelectorAll("[data-customer]").forEach(b=>b.onclick=()=>toggleCustomer(b.dataset.customer));
}

function renderOrders(){
  const grouped=new Map();
  orders.forEach(o=>{
    const g=rewardGroupsForCustomer(o.customerId).find(g=>g.ids.has(o.orderGroupId||o.id));
    grouped.set(o.id,g?.num||"-");
  });

  $("#orderTable").innerHTML=`<div class="table-scroll"><table><thead>
  <tr><th>Customer</th><th>Medical</th><th>Medicine</th><th>Qty</th><th>Amount</th><th>Bonus</th><th>6-Day Order #</th><th>Qualify</th><th>Status</th><th>Action</th></tr></thead>
  <tbody>${orders.map(o=>{
    const orderTotal=Number(o.orderTotalAtOrder||o.lineTotalAtOrder||Number(o.sellRateAtOrder||0)*Number(o.quantity||0));
    const qualifies=orderTotal>=MIN_QUALIFYING_ORDER;
    return `<tr><td><b>${esc(o.customerName)}</b><small>${esc(o.phone||"")}</small></td>
    <td>${esc(o.medicalName)}</td><td>${esc(o.medicineName)}</td><td>${o.quantity}</td>
    <td>${money(Math.max(0,Number(o.lineTotalAtOrder||Number(o.sellRateAtOrder||0)*Number(o.quantity||0))-Number(o.discountAtOrder||0)))}</td>
    <td>${o.discountAtOrder?`− ${money(o.discountAtOrder)}`:"—"}</td>
    <td><b>#${grouped.get(o.id)||"-"}</b></td>
    <td>${qualifies?"✓ ₹1500+":"— Below ₹1500"}</td>
    <td><span class="status ${o.status}">${o.status}</span></td>
    <td><select class="status-select" data-status="${o.id}">
      <option ${o.status==="new"?"selected":""}>new</option>
      <option ${o.status==="confirmed"?"selected":""}>confirmed</option>
      <option ${o.status==="completed"?"selected":""}>completed</option>
      <option ${o.status==="cancelled"?"selected":""}>cancelled</option>
    </select></td></tr>`;
  }).join("")}</tbody></table></div>
  <div class="offer-note admin-offer-summary">🎁 Offer: <b>₹${MIN_QUALIFYING_ORDER}+ order only.</b> 6 din ke andar ke saare qualifying orders = 1 order. <b>20 qualifying completed orders = ₹${REWARD20} OFF</b> • <b>40 = ₹${REWARD40} OFF</b>.</div>`;

  document.querySelectorAll("[data-status]").forEach(s=>s.onchange=()=>updateOrderStatus(s.dataset.status,s.value));
}

$("#adminMedicineSearch").oninput=renderMedicines;$("#clearAdminSearch").onclick=()=>{$("#adminMedicineSearch").value="";renderMedicines()};$("#addMedicineBtn").onclick=()=>openMedicine();$("#closeMedicine").onclick=()=>$("#medicineDialog").close();$("#addCustomerBtn").onclick=()=>{$("#customerForm").reset();$("#customerMsg").textContent="";$("#customerDialog").showModal()};$("#closeCustomer").onclick=()=>$("#customerDialog").close();$("#adminLogout").onclick=()=>signOut(auth).then(()=>location.replace("admin.html"));$("#supportBtn").onclick=()=>$("#supportDialog").showModal();$("#closeSupport").onclick=()=>$("#supportDialog").close();
$("#medicineForm").addEventListener("submit",async e=>{e.preventDefault();$("#medicineMsg").textContent="Saving…";try{const imageFile=$("#mImage").files[0];const publicData={name:$("#mName").value.trim(),category:$("#mCategory").value.trim(),quantity:Number($("#mQty").value),expiry:$("#mExp").value,mrp:Number($("#mMrp").value),sellRate:Number($("#mSell").value),available:$("#mAvailable").checked,composition:$("#mComposition").value.trim(),updatedAt:serverTimestamp()};const privateData={purchaseRate:Number($("#mPurchase").value),gst:Number($("#mGst").value),transport:Number($("#mTransport").value),updatedAt:serverTimestamp()};if(imageFile)publicData.imageData=await compressImage(imageFile);let id=$("#medicineId").value;if(id)await updateDoc(doc(db,"medicines",id),publicData);else{id=(await addDoc(collection(db,"medicines"),{...publicData,createdAt:serverTimestamp()})).id}await setDoc(doc(db,"medicinePrivate",id),privateData,{merge:true});$("#medicineMsg").textContent="Saved ✓";setTimeout(()=>$("#medicineDialog").close(),450);await loadMedicines();stats()}catch(err){$("#medicineMsg").textContent=err?.message||"Save failed."}});
function openMedicine(m=null){$("#medicineForm").reset();$("#medicineId").value=m?.id||"";$("#mImagePreview").hidden=true;$("#mImagePreview").removeAttribute("src");$("#medicineDialogTitle").textContent=m?"Edit Medicine":"Add Medicine";if(m){$("#mName").value=m.name||"";$("#mCategory").value=m.category||"";$("#mComposition").value=m.composition||"";$("#mQty").value=m.quantity??0;$("#mExp").value=m.expiry||"";$("#mMrp").value=m.mrp??0;$("#mSell").value=m.sellRate??0;$("#mPurchase").value=m.purchaseRate??0;$("#mGst").value=m.gst??0;$("#mTransport").value=m.transport??0;$("#mAvailable").checked=m.available!==false;if(m.imageData){$("#mImagePreview").src=m.imageData;$("#mImagePreview").hidden=false}}$("#medicineDialog").showModal()}
async function compressImage(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error("Image read failed"));reader.onload=()=>{const img=new Image();img.onerror=()=>reject(new Error("Invalid image"));img.onload=()=>{const max=600,scale=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement("canvas");c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext("2d").drawImage(img,0,0,c.width,c.height);const data=c.toDataURL("image/jpeg",.68);if(data.length>800000)return reject(new Error("Image too large. Choose a smaller photo."));resolve(data)};img.src=reader.result};reader.readAsDataURL(file)})}
$("#mImage").addEventListener("change",()=>{const f=$("#mImage").files[0];if(!f)return;const u=URL.createObjectURL(f);$("#mImagePreview").src=u;$("#mImagePreview").hidden=false});function editMedicine(id){openMedicine(medicines.find(m=>m.id===id))}async function deleteMedicine(id){if(!confirm("Delete this medicine?"))return;await deleteDoc(doc(db,"medicines",id));await deleteDoc(doc(db,"medicinePrivate",id));await loadMedicines();stats()}async function toggleStock(id){const m=medicines.find(x=>x.id===id);await updateDoc(doc(db,"medicines",id),{available:!m.available,updatedAt:serverTimestamp()});await loadMedicines();stats()}async function toggleCustomer(id){const c=customers.find(x=>x.id===id);await updateDoc(doc(db,"customers",id),{active:c.active===false,updatedAt:serverTimestamp()});await loadCustomers();toast(c.active===false?"Customer activated ✓":"Customer blocked ✓")}
async function updateOrderStatus(id,status){try{const ref=doc(db,"orders",id);if(status==="completed"){await runTransaction(db,async tx=>{const os=await tx.get(ref);if(!os.exists())throw new Error("Order not found");const o=os.data();if(o.status!=="completed"&&!o.stockDeducted){const mr=doc(db,"medicines",o.medicineId);const ms=await tx.get(mr);if(ms.exists()){const next=Math.max(0,Number(ms.data().quantity||0)-Number(o.quantity||0));tx.update(mr,{quantity:next,available:next>0,updatedAt:serverTimestamp()})}tx.update(ref,{status,stockDeducted:true,updatedAt:serverTimestamp()})}else tx.update(ref,{status,updatedAt:serverTimestamp()})})}else await updateDoc(ref,{status,updatedAt:serverTimestamp()});await loadAll();toast("Order status updated ✓")}catch(e){toast(e?.message||"Status update failed")}}
$("#customerForm").addEventListener("submit",async e=>{e.preventDefault();$("#customerMsg").textContent="Creating customer…";try{const medicalName=$("#cMedical").value.trim(),name=$("#cName").value.trim(),phone=$("#cPhone").value.trim(),loginId=$("#cLogin").value.trim().toLowerCase(),password=$("#cPassword").value;if(!medicalName||!name||!phone||!loginId||password.length<6)throw new Error("Sabhi fields bharo; password kam se kam 6 characters ka ho.");if(!/^[a-z0-9._-]+$/.test(loginId))throw new Error("Login ID me sirf a-z, 0-9, dot, underscore ya hyphen use karo.");if(customers.some(c=>(c.loginId||"").toLowerCase()===loginId))throw new Error("Ye Login ID pehle se maujood hai.");const cred=await createUserWithEmailAndPassword(customerAuth,customerEmailFromLogin(loginId),password);await setDoc(doc(db,"customers",cred.user.uid),{medicalName,name,phone,loginId,active:true,createdAt:serverTimestamp()});await signOut(customerAuth);$("#customerMsg").textContent="Customer created ✓";setTimeout(()=>$("#customerDialog").close(),600);await loadCustomers();stats()}catch(err){try{await signOut(customerAuth)}catch(_){}$("#customerMsg").textContent=err?.code==="auth/email-already-in-use"?"Ye Login ID pehle se registered hai.":(err.message||"Customer creation failed.")}});
function download(name,rows){const csv=rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$("#exportMedicines").onclick=()=>download("zeno-medicines.csv",[["Drug Name","Category","Composition","Quantity","Expiry","MRP","N Rate","Purchase Rate","GST","Transport","Available"],...medicines.map(m=>[m.name,m.category,m.composition,m.quantity,m.expiry,m.mrp,m.sellRate,m.purchaseRate,m.gst,m.transport,m.available])]);$("#exportOrders").onclick=()=>download("zeno-orders.csv",[["Customer","Medical","Medicine","Qty","Rate","Amount","Status","Date"],...orders.map(o=>[o.customerName,o.medicalName,o.medicineName,o.quantity,o.sellRateAtOrder,o.sellRateAtOrder*o.quantity,o.status,o.createdAt?.toDate?.().toLocaleString?.()||""]) ]);
document.querySelectorAll(".tab").forEach(tab=>tab.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));tab.classList.add("active");["adminMedicinesTab","adminCustomersTab","adminOrdersTab"].forEach(id=>$("#"+id).hidden=true);$("#"+({adminMedicines:"adminMedicinesTab",adminCustomers:"adminCustomersTab",adminOrders:"adminOrdersTab"}[tab.dataset.tab])).hidden=false;localStorage.setItem("zenoAdminTab",tab.dataset.tab)});function restoreTab(){const t=localStorage.getItem("zenoAdminTab");if(!t)return;const b=document.querySelector(`.tab[data-tab="${t}"]`);if(b)b.click()}function toast(msg){$("#toast").textContent=msg;$("#toast").classList.add("show");setTimeout(()=>$("#toast").classList.remove("show"),2600)}function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
