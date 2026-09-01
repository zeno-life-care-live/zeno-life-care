import { auth, db, firebaseConfig, customerEmailFromLogin } from "./firebase.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, createUserWithEmailAndPassword, getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
 collection, doc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, getDoc, deleteField
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const $=s=>document.querySelector(s);
const money=n=>`₹${Number(n||0).toFixed(2)}`;
let medicines=[], customers=[], orders=[];
const customerApp = initializeApp(firebaseConfig, "zeno-customer-creator");
const customerAuth = getAuth(customerApp);

$("#adminLoginForm").addEventListener("submit",async e=>{
 e.preventDefault(); $("#adminLoginMsg").textContent="Signing in…";
 try{
  await signInWithEmailAndPassword(auth,$("#adminEmail").value,$("#adminPassword").value);
 }catch(err){$("#adminLoginMsg").textContent="Admin login failed."}
});

onAuthStateChanged(auth,async user=>{
 if(!user){$("#adminLogin").hidden=false;$("#adminApp").hidden=true;return}
 $("#adminLogin").hidden=true;$("#adminApp").hidden=false;
 await loadAll();
});

async function loadAll(){ await Promise.all([loadMedicines(),loadCustomers(),loadOrders()]); stats(); }

async function loadMedicines(){
 const s=await getDocs(query(collection(db,"medicines"),orderBy("name")));
 const privateSnap=await getDocs(collection(db,"medicinePrivate"));
 const privateMap=new Map(privateSnap.docs.map(d=>[d.id,d.data()]));
 medicines=s.docs.map(d=>({id:d.id,...d.data(),...(privateMap.get(d.id)||{})}));
 renderMedicines();
 // One-time migration for medicines saved by older versions.
 for(const d of s.docs){
  const x=d.data();
  if(x.purchaseRate!==undefined || x.gst!==undefined || x.transport!==undefined){
   await setDoc(doc(db,"medicinePrivate",d.id),{purchaseRate:Number(x.purchaseRate||0),gst:Number(x.gst||0),transport:Number(x.transport||0),updatedAt:serverTimestamp()},{merge:true});
   await updateDoc(doc(db,"medicines",d.id),{purchaseRate:deleteField(),gst:deleteField(),transport:deleteField()});
  }
 }
 if(s.docs.some(d=>d.data().purchaseRate!==undefined || d.data().gst!==undefined || d.data().transport!==undefined)) await loadMedicines();
}
async function loadCustomers(){
 const s=await getDocs(collection(db,"customers")); customers=s.docs.map(d=>({id:d.id,...d.data()})); renderCustomers();
}
async function loadOrders(){
 const s=await getDocs(collection(db,"orders")); orders=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)); renderOrders();
}
function stats(){
 $("#statMedicines").textContent=medicines.length;
 $("#statCustomers").textContent=customers.length;
 $("#statOrders").textContent=orders.filter(o=>o.status==="new").length;
}
function renderMedicines(){
 const term=$("#adminMedicineSearch").value.toLowerCase().trim();
 const list=medicines.filter(m=>m.name.toLowerCase().includes(term));
 $("#adminMedicineTable").innerHTML=`<div class="table-scroll"><table><thead><tr><th>Name</th><th>Qty</th><th>Expiry</th><th>MRP</th><th>Sell</th><th>Purchase</th><th>GST</th><th>Transport</th><th>Stock</th><th>Actions</th></tr></thead><tbody>${
 list.map(m=>`<tr><td><b>${esc(m.name)}</b></td><td>${m.quantity}</td><td>${m.expiry}</td><td>${money(m.mrp)}</td><td>${money(m.sellRate)}</td><td>${money(m.purchaseRate)}</td><td>${m.gst}%</td><td>${money(m.transport)}</td><td><button class="stock-toggle ${m.available?"yes":"no"}" data-stock="${m.id}">${m.available?"ON":"OFF"}</button></td><td><button class="mini" data-edit="${m.id}">Edit</button><button class="mini danger" data-del="${m.id}">Delete</button></td></tr>`).join("")}</tbody></table></div>`;
 document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editMedicine(b.dataset.edit));
 document.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>deleteMedicine(b.dataset.del));
 document.querySelectorAll("[data-stock]").forEach(b=>b.onclick=()=>toggleStock(b.dataset.stock));
}
function renderCustomers(){
 $("#customerTable").innerHTML=`<div class="table-scroll"><table><thead><tr><th>Medical</th><th>Customer</th><th>Phone</th><th>Login ID</th><th>Created</th></tr></thead><tbody>${
 customers.map(c=>`<tr><td>${esc(c.medicalName)}</td><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td><b>${esc(c.loginId)}</b></td><td>${c.createdAt?.toDate?.().toLocaleDateString?.()||"-"}</td></tr>`).join("")}</tbody></table></div>`;
}
function renderOrders(){
 $("#orderTable").innerHTML=`<div class="table-scroll"><table><thead><tr><th>Customer</th><th>Medical</th><th>Medicine</th><th>Qty</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>${
 orders.map(o=>`<tr><td>${esc(o.customerName)}</td><td>${esc(o.medicalName)}</td><td>${esc(o.medicineName)}</td><td>${o.quantity}</td><td>${money(o.sellRateAtOrder*o.quantity)}</td><td><span class="status ${o.status}">${o.status}</span></td><td><select class="status-select" data-status="${o.id}"><option ${o.status==="new"?"selected":""}>new</option><option ${o.status==="confirmed"?"selected":""}>confirmed</option><option ${o.status==="completed"?"selected":""}>completed</option><option ${o.status==="cancelled"?"selected":""}>cancelled</option></select></td></tr>`).join("")}</tbody></table></div>`;
 document.querySelectorAll("[data-status]").forEach(s=>s.onchange=()=>updateOrderStatus(s.dataset.status,s.value));
}
$("#adminMedicineSearch").oninput=renderMedicines;
$("#addMedicineBtn").onclick=()=>openMedicine();
$("#closeMedicine").onclick=()=>$("#medicineDialog").close();
$("#addCustomerBtn").onclick=()=>{$("#customerForm").reset();$("#customerMsg").textContent="";$("#customerDialog").showModal()};
$("#closeCustomer").onclick=()=>$("#customerDialog").close();
$("#adminLogout").onclick=()=>signOut(auth);

$("#medicineForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const imageFile=$("#mImage").files[0];
 const publicData={
  name:$("#mName").value.trim(), quantity:Number($("#mQty").value), expiry:$("#mExp").value,
  mrp:Number($("#mMrp").value), sellRate:Number($("#mSell").value), available:$("#mAvailable").checked,
  updatedAt:serverTimestamp()
 };
 const privateData={purchaseRate:Number($("#mPurchase").value),gst:Number($("#mGst").value),transport:Number($("#mTransport").value),updatedAt:serverTimestamp()};
 if(imageFile) publicData.imageData=await compressImage(imageFile);
 try{
  let id=$("#medicineId").value;
  if(id){
   await updateDoc(doc(db,"medicines",id),publicData);
  }else{
   const ref=await addDoc(collection(db,"medicines"),{...publicData,createdAt:serverTimestamp()});
   id=ref.id;
  }
  await setDoc(doc(db,"medicinePrivate",id),privateData,{merge:true});
  $("#medicineDialog").close(); await loadMedicines(); stats();
 }catch(err){$("#medicineMsg").textContent=err?.message||"Save failed. Check Firestore rules."}
});

function openMedicine(m=null){
 $("#medicineForm").reset(); $("#medicineId").value=m?.id||"";
 $("#mImagePreview").hidden=true; $("#mImagePreview").removeAttribute("src");
 $("#medicineDialogTitle").textContent=m?"Edit Medicine":"Add Medicine";
 if(m){$("#mName").value=m.name;$("#mQty").value=m.quantity;$("#mExp").value=m.expiry;$("#mMrp").value=m.mrp;$("#mSell").value=m.sellRate;$("#mPurchase").value=m.purchaseRate;$("#mGst").value=m.gst;$("#mTransport").value=m.transport;$("#mAvailable").checked=!!m.available; if(m.imageData){$("#mImagePreview").src=m.imageData;$("#mImagePreview").hidden=false}}
 $("#medicineDialog").showModal();
}
async function compressImage(file){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error("Image read failed"));
  reader.onload=()=>{
   const img=new Image();
   img.onerror=()=>reject(new Error("Invalid image"));
   img.onload=()=>{
    const max=700, scale=Math.min(1,max/Math.max(img.width,img.height));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(img.width*scale)); canvas.height=Math.max(1,Math.round(img.height*scale));
    canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
    const data=canvas.toDataURL("image/jpeg",0.72);
    if(data.length>850000) return reject(new Error("Image too large. Choose a smaller photo."));
    resolve(data);
   };
   img.src=reader.result;
  };
  reader.readAsDataURL(file);
 });
}
$("#mImage").addEventListener("change",()=>{
 const file=$("#mImage").files[0];
 if(!file){return}
 const url=URL.createObjectURL(file);
 $("#mImagePreview").src=url; $("#mImagePreview").hidden=false;
});
function editMedicine(id){openMedicine(medicines.find(m=>m.id===id))}
async function deleteMedicine(id){if(!confirm("Delete this medicine?"))return;await deleteDoc(doc(db,"medicines",id));await deleteDoc(doc(db,"medicinePrivate",id));await loadMedicines();stats()}
async function toggleStock(id){const m=medicines.find(x=>x.id===id);await updateDoc(doc(db,"medicines",id),{available:!m.available,updatedAt:serverTimestamp()});await loadMedicines()}
async function updateOrderStatus(id,status){await updateDoc(doc(db,"orders",id),{status,updatedAt:serverTimestamp()});await loadOrders();stats()}

$("#customerForm").addEventListener("submit",async e=>{
 e.preventDefault();
 $("#customerMsg").textContent="Creating customer…";
 try{
  const medicalName=$("#cMedical").value.trim();
  const name=$("#cName").value.trim();
  const phone=$("#cPhone").value.trim();
  const loginId=$("#cLogin").value.trim().toLowerCase();
  const password=$("#cPassword").value;
  if(!medicalName || !name || !phone || !loginId || password.length < 6) throw new Error("Sabhi fields bharo; password kam se kam 6 characters ka ho.");
  if(!/^[a-z0-9._-]+$/.test(loginId)) throw new Error("Login ID me sirf a-z, 0-9, dot, underscore ya hyphen use karo.");
  if(customers.some(c=>(c.loginId||"").toLowerCase()===loginId)) throw new Error("Ye Login ID pehle se maujood hai.");

  // Secondary Firebase app creates the customer without logging the admin out.
  const cred=await createUserWithEmailAndPassword(customerAuth, customerEmailFromLogin(loginId), password);
  await setDoc(doc(db,"customers",cred.user.uid),{
    medicalName,name,phone,loginId,createdAt:serverTimestamp()
  });
  await signOut(customerAuth);
  $("#customerMsg").textContent="Customer created ✓";
  setTimeout(()=>$("#customerDialog").close(),700); await loadCustomers(); stats();
 }catch(err){
  try{ await signOut(customerAuth); }catch(_){}
  const msg=err?.code==="auth/email-already-in-use" ? "Ye Login ID pehle se registered hai." : (err.message||"Customer creation failed.");
  $("#customerMsg").textContent=msg;
 }
});

document.querySelectorAll(".tab").forEach(tab=>tab.onclick=()=>{
 document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));tab.classList.add("active");
 ["adminMedicinesTab","adminCustomersTab","adminOrdersTab"].forEach(id=>$("#"+id).hidden=true);
 $("#"+({adminMedicines:"adminMedicinesTab",adminCustomers:"adminCustomersTab",adminOrders:"adminOrdersTab"}[tab.dataset.tab])).hidden=false;
});
function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
