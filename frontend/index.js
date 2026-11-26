// Set this to your deployed HTTPS API URL when publishing.
const API_BASE = "http://127.0.0.1:5000/api";
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");
const $ = (id) => document.getElementById(id);
let token = localStorage.getItem("cg_token") || "";
let me = null;
let activeChat = null;
let toastTimer;

function authHeaders(json=true) {
  const h = {};
  if (json) h["Content-Type"] = "application/json";
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
async function api(path, options={}) {
  const res = await fetch(API_BASE + path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`);
  return data;
}
function notify(message) {
  const t = $("toast"); t.textContent = message; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}
function setStatus(id, text, ok=false) {
  const el = $(id); el.textContent = text; el.classList.toggle("ok", ok);
}
function initials(text="CG") { return text.trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase() || "CG"; }
function safe(text="") {
  return String(text).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function imageUrl(url) { return url ? (url.startsWith("http") ? url : API_ORIGIN + url) : ""; }
function showApp() {
  $("authView").classList.add("hidden"); $("appView").classList.remove("hidden");
  $("sidebarUser").textContent = `@${me.username} · ${me.name}`;
  $("topAvatar").textContent = initials(me.name);
  showView("feed"); loadFeed();
}
function showAuth() {
  $("appView").classList.add("hidden"); $("authView").classList.remove("hidden");
}
function selectTab(tab) {
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active", b.dataset.tab===tab));
  $("loginForm").classList.toggle("hidden", tab!=="login");
  $("registerForm").classList.toggle("hidden", tab!=="register");
}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>selectTab(b.dataset.tab)));
document.querySelectorAll(".show-pass").forEach(b=>b.addEventListener("click",()=>{
  const input=$(b.dataset.target); input.type=input.type==="password"?"text":"password"; b.textContent=input.type==="password"?"Show":"Hide";
}));
$("loginForm").addEventListener("submit", async e=>{
  e.preventDefault(); setStatus("loginStatus","Signing in…");
  try {
    const data=await api("/auth/login",{method:"POST",headers:authHeaders(),body:JSON.stringify({identifier:$("loginIdentifier").value,password:$("loginPassword").value})});
    token=data.token; localStorage.setItem("cg_token",token); me=data.user; setStatus("loginStatus","",true); showApp();
  } catch(err) { setStatus("loginStatus",err.message); }
});
$("registerForm").addEventListener("submit", async e=>{
  e.preventDefault(); setStatus("registerStatus","Creating account…");
  try {
    const data=await api("/auth/register",{method:"POST",headers:authHeaders(),body:JSON.stringify({name:$("regName").value,username:$("regUsername").value,email:$("regEmail").value,password:$("regPassword").value})});
    token=data.token; localStorage.setItem("cg_token",token); me=data.user; showApp();
  } catch(err) { setStatus("registerStatus",err.message); }
});
$("logoutBtn").addEventListener("click",()=>{token="";me=null;activeChat=null;localStorage.removeItem("cg_token");showAuth();notify("You have signed out.");});
function showView(view) {
  const titles={feed:"Your feed",explore:"Explore",messages:"Messages",profile:"My profile"};
  document.querySelectorAll(".content-view").forEach(el=>el.classList.add("hidden"));
  $(view+"View").classList.remove("hidden"); $("viewTitle").textContent=titles[view]||"CHAT GENZ";
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  if(view==="explore") $("exploreSearch").focus();
  if(view==="messages") $("messageSearch").focus();
  if(view==="profile") loadProfile();
}
document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
$("topAvatar").addEventListener("click",()=>showView("profile"));
$("topSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){showView("explore");$("exploreSearch").value=e.target.value;searchUsers(e.target.value);}});
$("exploreSearch").addEventListener("input",e=>searchUsers(e.target.value));
$("messageSearch").addEventListener("input",e=>searchMessagePeople(e.target.value));
$("newPostBtn").addEventListener("click",()=>openPostDialog());
$("bannerPostBtn").addEventListener("click",()=>openPostDialog());
$("closePost").addEventListener("click",()=> $("postDialog").close());
function openPostDialog(){ $("postStatus").textContent=""; $("postForm").reset(); $("postDialog").showModal(); }
function empty(text){return `<div class="empty-state">${safe(text)}</div>`;}
function personCard(u, messageButton=true) {
  return `<article class="person-card"><div class="person-avatar">${safe(initials(u.name))}</div><div class="person-info"><strong>${safe(u.name)}</strong><small>@${safe(u.username)}</small><p>${safe(u.bio||"Ready to connect.")}</p></div>${messageButton&&u.username!==me.username?`<button class="small-btn" data-chat="${safe(u.username)}">Message</button>`:""}</article>`;
}
function attachChatButtons(root=document) {
  root.querySelectorAll("[data-chat]").forEach(b=>b.addEventListener("click",()=>openChat(b.dataset.chat)));
}
async function loadFeed() {
  $("feedList").innerHTML=empty("Loading posts…");
  try {
    const data=await api("/posts");
    if(!data.posts.length){$("feedList").innerHTML=empty("No posts yet. Be the first to share a moment!");return;}
    $("feedList").innerHTML=data.posts.map(p=>`<article class="post-card"><div class="post-meta"><div class="person-avatar">${safe(initials(p.user.name))}</div><div class="post-author">${safe(p.user.name)}<small>@${safe(p.user.username)}</small></div></div><img class="post-image" loading="lazy" src="${safe(imageUrl(p.image_url))}" alt="Post image"><p class="post-caption">${safe(p.caption||"")}</p></article>`).join("");
  } catch(err){$("feedList").innerHTML=empty(err.message);}
}
let searchDelay;
async function searchUsers(query) {
  clearTimeout(searchDelay);
  searchDelay=setTimeout(async()=>{
    const q=query.trim(); if(!q){$("searchResults").innerHTML=empty("Type a name or username to find people.");return;}
    $("searchResults").innerHTML=empty("Searching…");
    try {const data=await api("/users/search?q="+encodeURIComponent(q));
      $("searchResults").innerHTML=data.users.length?data.users.map(u=>personCard(u)).join(""):empty("No matching users found.");
      attachChatButtons($("searchResults"));
    }catch(err){$("searchResults").innerHTML=empty(err.message);}
  },220);
}
async function searchMessagePeople(query) {
  const q=query.trim(); if(!q){$("messagePeople").innerHTML=`<p class="muted small">Search for someone to message.</p>`;return;}
  try {
    const data=await api("/users/search?q="+encodeURIComponent(q));
    $("messagePeople").innerHTML=data.users.filter(u=>u.username!==me.username).map(u=>`<button class="message-person ${activeChat===u.username?"active":""}" data-person="${safe(u.username)}"><span class="person-avatar">${safe(initials(u.name))}</span><span>@${safe(u.username)}</span></button>`).join("")||`<p class="muted small">No users found.</p>`;
    $("messagePeople").querySelectorAll("[data-person]").forEach(b=>b.addEventListener("click",()=>openChat(b.dataset.person)));
  } catch(err){notify(err.message);}
}
async function openChat(username) {
  activeChat=username; $("chatHeader").textContent=`Private conversation with @${username}`;
  $("messageInput").disabled=false; $("sendMessageBtn").disabled=false;
  await refreshConversation();
  $("messageSearch").value=username; await searchMessagePeople(username);
}
async function refreshConversation() {
  if(!activeChat)return;
  try {
    const data=await api("/messages/"+encodeURIComponent(activeChat),{headers:authHeaders(false)});
    $("chatMessages").innerHTML=data.messages.map(m=>`<div class="bubble ${m.sender===me.username?"mine":""}">${safe(m.body)}<small>${safe(m.sender)} · ${safe(new Date(m.created_at).toLocaleString())}</small></div>`).join("")||empty("Say hello to start your conversation.");
    $("chatMessages").scrollTop=$("chatMessages").scrollHeight;
  }catch(err){$("chatMessages").innerHTML=empty(err.message);}
}
$("messageForm").addEventListener("submit",async e=>{
  e.preventDefault(); const body=$("messageInput").value.trim(); if(!body||!activeChat)return;
  $("sendMessageBtn").disabled=true;
  try {await api("/messages",{method:"POST",headers:authHeaders(),body:JSON.stringify({recipient_username:activeChat,body})});$("messageInput").value="";await refreshConversation();}
  catch(err){notify(err.message);} finally{$("sendMessageBtn").disabled=false;}
});
$("postForm").addEventListener("submit",async e=>{
  e.preventDefault(); const file=$("postImage").files[0]; if(!file)return;
  if(file.size>5*1024*1024){setStatus("postStatus","Image must be 5 MB or smaller.");return;}
  const form=new FormData();form.append("image",file);form.append("caption",$("postCaption").value);
  setStatus("postStatus","Uploading…");
  try {const res=await fetch(API_BASE+"/posts",{method:"POST",headers:{Authorization:`Bearer ${token}`},body:form});const data=await res.json();if(!res.ok)throw new Error(data.error||"Upload failed");$("postDialog").close();notify("Your post has been shared!");loadFeed();}
  catch(err){setStatus("postStatus",err.message);}
});
async function loadProfile() {
  const [userData,postData]=await Promise.all([
    api("/me",{headers:authHeaders(false)}),
    api("/posts/user/"+encodeURIComponent(me.username)).catch(()=>({posts:[]}))
  ]);
  me={...me,...userData.user,email:userData.email};
  $("profileContent").innerHTML=`<div class="profile-card"><div class="profile-big-avatar">${safe(initials(me.name))}</div><div class="profile-details"><h3>${safe(me.name)}</h3><span class="muted">@${safe(me.username)}</span><div class="profile-stats"><span><strong>${postData.posts.length}</strong> posts</span><span><strong>CHAT GENZ</strong> member</span></div><p>${safe(me.bio||"Welcome to my CHAT GENZ profile.")}</p><button class="small-btn" id="editProfileBtn">Edit profile</button></div></div><div class="section-heading"><h3>Your posts</h3><span>${postData.posts.length} shared</span></div><div class="post-list">${postData.posts.length?postData.posts.map(p=>`<article class="post-card"><img class="post-image" loading="lazy" src="${safe(imageUrl(p.image_url))}" alt="Your post"><p class="post-caption">${safe(p.caption)}</p></article>`).join(""):empty("Your posts will appear here after you share one.")}</div>`;
  $("editProfileBtn").addEventListener("click",editProfile);
}
async function editProfile() {
  const name=prompt("Your display name:",me.name); if(name===null)return;
  const bio=prompt("Your bio (up to 280 characters):",me.bio||"");if(bio===null)return;
  try {const data=await api("/me",{method:"PATCH",headers:authHeaders(),body:JSON.stringify({name,bio})});me=data.user;$("sidebarUser").textContent=`@${me.username} · ${me.name}`;$("topAvatar").textContent=initials(me.name);loadProfile();notify("Profile updated.");}
  catch(err){notify(err.message);}
}
async function boot() {
  if(!token){showAuth();return;}
  try {const data=await api("/me",{headers:authHeaders(false)});me=data.user;me.email=data.email;showApp();}
  catch(_){token="";localStorage.removeItem("cg_token");showAuth();}
}
boot();
