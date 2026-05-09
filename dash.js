// ====================================================
// SUPABASE INIT
// ====================================================
const { createClient } = supabase;
const sb = createClient(
  "https://tzojjwnqodcrhwjaasja.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6b2pqd25xb2Rjcmh3amFhc2phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NzA2ODAsImV4cCI6MjA5MzI0NjY4MH0.G4IGSUgjVIKTNVszU5GpxNaD0VUnSmzUXe8p7uUl418"
);

// ====================================================
// RANKS
// ====================================================
const RANKS = [
  { name:"Dust",        max:5,      color:"#8e8e93" },
  { name:"Stone",       max:6,      color:"#636366" },
  { name:"Iron",        max:6,      color:"#aeaeb2" },
  { name:"Bronze",      max:7,      color:"#a2845e" },
  { name:"Silver",      max:7,      color:"#cfd3d6" },
  { name:"Gold",        max:7,      color:"#ffcc00" },
  { name:"Platinum",    max:8,      color:"#e5e5ea" },
  { name:"Diamond",     max:8,      color:"#007aff" },
  { name:"Emerald",     max:9,      color:"#34c759" },
  { name:"Sapphire",    max:9,      color:"#5856d6" },
  { name:"Obsidian",    max:10,     color:"#3a3a3c" },
  { name:"Mythic",      max:10,     color:"#ff2d55" },
  { name:"Legend",      max:10,     color:"#af52de" },
  { name:"Master",      max:12,     color:"#5ac8fa" },
  { name:"Grandmaster", max:15,     color:"#ff9500" },
  { name:"Imperial",    max:20,     color:"#ffd60a" },
  { name:"Royal",       max:20,     color:"#bf5af2" },
  { name:"Founder",     max:999999, color:"#64d2ff" }
];

function getRank(level) {
  let sum = 0;
  for (const r of RANKS) {
    if (level <= sum + r.max) return { ...r, sub: level - sum };
    sum += r.max;
  }
  return { ...RANKS[RANKS.length - 1], sub: 1 };
}

function avatarColor(name) {
  const pool = ["#007aff","#30d158","#ff9500","#ff2d55","#5856d6","#64d2ff","#af52de","#ffd60a"];
  let h = 0;
  for (const c of (name || "?")) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return pool[h % pool.length];
}

function badgeTxtColor(hex) {
  const light = ["#ffcc00","#e5e5ea","#cfd3d6","#aeaeb2","#ffd60a","#64d2ff","#5ac8fa","#30d158","#34c759"];
  return light.includes(hex) ? "#000" : "#fff";
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ====================================================
// VERIFICATION BADGE HTML
// ====================================================
function verifyBadge(size) {
  size = size || 16;
  return '<i class="fa-solid fa-circle-check verify-badge" style="font-size:' + size + 'px;color:#007aff;" title="Verified Account"></i>';
}

// ====================================================
// STATE
// ====================================================
let allMembers       = [];
let currentUser      = null;
let currentMemberTab = 'leaderboard';
let isGuest          = false; // true if not logged in

// ====================================================
// LOGOUT
// ====================================================
document.addEventListener("DOMContentLoaded", function() {
  var btn = document.getElementById("logoutBtn");
  if (btn) {
    btn.addEventListener("click", async function() {
      await sb.auth.signOut();
      window.location.href = "../auth/index.html";
    });
  }
});

// ====================================================
// SESSION CHECK — supports guests (no session)
// ====================================================
(async function() {
  try {
    const { data, error } = await sb.auth.getSession();
    if (error) console.error("[AM-PRO] getSession error:", error);

    if (data && data.session) {
      isGuest = false;
      await initDashboard(data.session.user.id);
    } else {
      // Guest mode: can view leaderboard & profiles, but not edit
      isGuest = true;
      await initGuestMode();
    }
  } catch(e) {
    console.error("[AM-PRO] session error:", e);
  }
})();

// ====================================================
// GUEST MODE — view only
// ====================================================
async function initGuestMode() {
  const c = document.querySelector(".container");

  // Show a guest banner instead of welcome card
  const welcomeCard = document.querySelector(".welcome-card");
  if (welcomeCard) {
    welcomeCard.innerHTML =
      '<div style="text-align:center;padding:10px 0">' +
        '<div style="font-size:13px;color:rgba(255,255,255,.4);margin-bottom:10px;">You are browsing as a guest</div>' +
        '<a href="../auth/index.html" style="background:var(--apple-blue,#007aff);color:#fff;border:none;padding:9px 22px;text-decoration:none;border-radius:10px;font-size:13px;font-weight:700;display:inline-block">Sign In to Access Your Profile</a>' +
      '</div>';
  }

  // Hide My Tasks section
  const tasksSection = document.querySelector(".section-header");
  const tasksList    = document.getElementById("tasksList");
  if (tasksSection) tasksSection.style.display = "none";
  if (tasksList)    tasksList.style.display    = "none";

  // Load members
  const { data: members } = await sb.from("users").select("*").order("level", { ascending: false });
  allMembers = members || [];
  document.getElementById("memberCount").textContent = allMembers.length + " MEMBERS";
  renderLeaderboard(allMembers);
}

// ====================================================
// INIT DASHBOARD (logged in)
// ====================================================
async function initDashboard(uid) {
  const [
    { data: me },
    { data: members },
    { data: tasks }
  ] = await Promise.all([
    sb.from("users").select("*").eq("id", uid).single(),
    sb.from("users").select("*").order("level", { ascending: false }),
    sb.from("tasks").select("*").eq("user_id", uid)
  ]);

  currentUser = me;

  if (me) {
    const rank  = getRank(me.level || 1);
    const color = rank.color;
    const tc    = badgeTxtColor(color);
    const vBadge = me.verified ? verifyBadge(18) : "";

    document.getElementById("userName").innerHTML = esc(me.username || me.name || "AM PRO Member") + " " + vBadge;
    document.getElementById("greetingText").innerText = "Welcome back, " + (me.name || me.username || "");

    const rd = document.getElementById("userRankDisplay");
    rd.innerText        = rank.name + " · Level " + (me.level||1) + " · Sub-" + rank.sub;
    rd.style.background = color;
    rd.style.color      = tc;

    // Bio display on welcome card
    if (me.bio && me.bio.trim()) {
      let bioEl = document.getElementById("userBioDisplay");
      if (!bioEl) {
        bioEl = document.createElement("div");
        bioEl.id = "userBioDisplay";
        bioEl.style.cssText = "font-size:13px;color:rgba(255,255,255,.55);margin-top:8px;font-style:italic;line-height:1.5;max-width:320px;margin-left:auto;margin-right:auto;text-align:center;";
        document.getElementById("userRankDisplay").after(bioEl);
      }
      bioEl.textContent = me.bio;
    }

    injectProfileEditUI(me, uid);
  }

  renderTasks(tasks || []);

  allMembers = members || [];
  document.getElementById("memberCount").textContent = allMembers.length + " MEMBERS";
  renderLeaderboard(allMembers);

  // Realtime tasks
  sb.channel("tasks-rt-" + uid)
    .on("postgres_changes",
        { event:"*", schema:"public", table:"tasks", filter:"user_id=eq." + uid },
        async () => {
          const { data: updated } = await sb.from("tasks").select("*").eq("user_id", uid);
          renderTasks(updated || []);
        })
    .subscribe();
}

// ====================================================
// INJECT PROFILE EDIT UI
// ====================================================
function injectProfileEditUI(me, uid) {
  if (document.getElementById("profileEditWrap")) return;

  const welcomeCard = document.querySelector(".welcome-card");
  if (!welcomeCard) return;

  const color = avatarColor(me.name || "?");
  const init  = (me.name || me.username || "?")[0].toUpperCase();
  const rank  = getRank(me.level || 1);

  const avatarDiv = document.createElement("div");
  avatarDiv.id = "profileEditWrap";
  avatarDiv.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:14px;";

  const avatarInnerHTML = me.avatar_url
    ? '<img src="' + esc(me.avatar_url) + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;position:relative;z-index:1;">'
    : '<span style="font-size:28px;font-weight:900;color:' + color + '">' + init + '</span>';

  avatarDiv.innerHTML =
    '<div id="myAvatarCircle" style="width:72px;height:72px;border-radius:50%;background:' + color + '18;box-shadow:0 0 0 3px ' + rank.color + '66;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;cursor:pointer;" onclick="document.getElementById(\'avatarFileInput\').click()" title="Change photo">' +
      avatarInnerHTML +
      '<div class="avatar-hover-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0);border-radius:50%;display:flex;align-items:center;justify-content:center;transition:background .2s;">' +
        '<svg class="avatar-cam-icon" style="opacity:0;transition:opacity .2s;width:22px;height:22px;" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>' +
      '</div>' +
    '</div>' +
    '<input type="file" id="avatarFileInput" accept="image/*" style="display:none" onchange="uploadAvatar(this)">' +
    '<div id="avatarUploadStatus" style="font-size:11px;color:rgba(255,255,255,.4);min-height:16px;"></div>';

  welcomeCard.insertBefore(avatarDiv, welcomeCard.firstChild);

  // Hover effect
  const circle  = avatarDiv.querySelector("#myAvatarCircle");
  const overlay = avatarDiv.querySelector(".avatar-hover-overlay");
  const camIcon = avatarDiv.querySelector(".avatar-cam-icon");
  if (circle && overlay && camIcon) {
    circle.addEventListener("mouseenter", function() {
      overlay.style.background = "rgba(0,0,0,.45)";
      camIcon.style.opacity    = "1";
    });
    circle.addEventListener("mouseleave", function() {
      overlay.style.background = "rgba(0,0,0,0)";
      camIcon.style.opacity    = "0";
    });
  }

  // Bio section
  const bioSection = document.createElement("div");
  bioSection.style.cssText = "margin-top:14px;width:100%;max-width:320px;";
  bioSection.innerHTML =
    '<textarea id="bioTextarea" placeholder="Write something about yourself… (visible to everyone)" style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:12px;color:#fff;font-family:\'Inter\',sans-serif;font-size:13px;padding:10px 12px;resize:none;outline:none;min-height:60px;line-height:1.5;box-sizing:border-box;" maxlength="160">' + esc(me.bio || "") + '</textarea>' +
    '<div style="display:flex;justify-content:flex-end;margin-top:6px;">' +
      '<button onclick="saveBio()" style="background:var(--apple-blue,#007aff);color:#fff;border:none;border-radius:10px;font-family:\'Inter\',sans-serif;font-size:12px;font-weight:700;padding:7px 20px;cursor:pointer;">Save Bio</button>' +
    '</div>';

  welcomeCard.appendChild(bioSection);
}

// ====================================================
// UPLOAD AVATAR — fixed policy path
// ====================================================
window.uploadAvatar = async function(input) {
  const file = input.files[0];
  if (!file) return;

  const statusEl     = document.getElementById("avatarUploadStatus");
  const avatarCircle = document.getElementById("myAvatarCircle");
  if (statusEl) { statusEl.textContent = "Uploading…"; statusEl.style.color = "rgba(255,255,255,.4)"; }

  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { if (statusEl) { statusEl.textContent = "Not signed in"; statusEl.style.color = "#ff3b30"; } return; }
    const uid = session.user.id;

    // Always use jpg extension to avoid bucket policy issues with exotic types
    const ext  = file.name.split(".").pop().toLowerCase() || "jpg";
    const path = uid + "/avatar." + ext;

    // Delete old file first to avoid conflicts
    await sb.storage.from("avatars").remove([path]);

    const { error: upErr } = await sb.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (upErr) {
      console.error("[AM-PRO] storage upload error:", upErr);
      throw new Error(upErr.message || "Storage upload failed");
    }

    const { data: urlData } = sb.storage.from("avatars").getPublicUrl(path);
    const publicUrl = urlData.publicUrl + "?t=" + Date.now();

    const { error: dbErr } = await sb.from("users").update({ avatar_url: publicUrl }).eq("id", uid);
    if (dbErr) {
      console.error("[AM-PRO] db update error:", dbErr);
      throw new Error(dbErr.message || "Profile update failed");
    }

    // Update avatar in UI
    if (avatarCircle) {
      const old = avatarCircle.querySelector("span, img");
      if (old) old.remove();
      const img = document.createElement("img");
      img.src = publicUrl;
      img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%;position:relative;z-index:1;";
      avatarCircle.insertBefore(img, avatarCircle.firstChild);
    }

    if (statusEl) { statusEl.textContent = "Photo updated ✓"; statusEl.style.color = "#30d158"; }
    setTimeout(function() { if (statusEl) statusEl.textContent = ""; }, 3000);

    if (currentUser) currentUser.avatar_url = publicUrl;

    // Refresh leaderboard
    const { data: members } = await sb.from("users").select("*").order("level", { ascending: false });
    allMembers = members || [];
    if (currentMemberTab === "leaderboard") renderLeaderboard(allMembers);
    else renderProfilesGrid(allMembers);

  } catch(e) {
    console.error("[AM-PRO] avatar upload error:", e);
    if (statusEl) { statusEl.textContent = "❌ " + (e.message || "Upload failed"); statusEl.style.color = "#ff3b30"; }
  }

  // Reset input so same file can be re-selected
  input.value = "";
};

// ====================================================
// SAVE BIO
// ====================================================
window.saveBio = async function() {
  const bioTextarea = document.getElementById("bioTextarea");
  const bio = (bioTextarea || {}).value || "";
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;

  const btn = document.querySelector("button[onclick='saveBio()']");
  if (btn) { btn.textContent = "Saving…"; btn.disabled = true; }

  const { error } = await sb.from("users")
    .update({ bio: bio.trim() })
    .eq("id", session.user.id);

  if (error) {
    console.error("[AM-PRO] saveBio error:", error);
    if (btn) { btn.textContent = "❌ Error"; btn.disabled = false; }
    setTimeout(function() { if (btn) btn.textContent = "Save Bio"; }, 2500);
    return;
  }

  if (currentUser) currentUser.bio = bio.trim();

  // Update bio display on welcome card
  let bioEl = document.getElementById("userBioDisplay");
  if (!bioEl && bio.trim()) {
    bioEl = document.createElement("div");
    bioEl.id = "userBioDisplay";
    bioEl.style.cssText = "font-size:13px;color:rgba(255,255,255,.55);margin-top:8px;font-style:italic;line-height:1.5;max-width:320px;margin-left:auto;margin-right:auto;text-align:center;";
    document.getElementById("userRankDisplay").after(bioEl);
  }
  if (bioEl) {
    bioEl.textContent = bio.trim();
    bioEl.style.display = bio.trim() ? "block" : "none";
  }

  if (btn) { btn.textContent = "Saved ✓"; btn.disabled = false; }
  setTimeout(function() { if (btn) btn.textContent = "Save Bio"; }, 2000);

  // Refresh members so bio shows everywhere
  const { data: members } = await sb.from("users").select("*").order("level", { ascending: false });
  allMembers = members || [];
  if (currentMemberTab === "leaderboard") renderLeaderboard(allMembers);
  else renderProfilesGrid(allMembers);
};

// ====================================================
// RENDER MY TASKS
// ====================================================
function renderTasks(tasks) {
  const list    = document.getElementById("tasksList");
  const countEl = document.getElementById("taskCount");
  if (!list) return;

  if (!tasks || !tasks.length) {
    list.innerHTML = '<div class="empty-state">No tasks right now. Enjoy your day! ✨</div>';
    if (countEl) countEl.innerText = "0 TASKS";
    return;
  }

  const pending = tasks.filter(function(t) { return !t.done; }).length;
  if (countEl) countEl.innerText = pending + " / " + tasks.length + " TASKS";

  list.innerHTML = tasks.map(function(t) {
    return '<div class="task-card' + (t.done ? " done" : "") + '" id="tc-' + t.id + '">' +
      '<button class="task-icon" onclick="toggleDone(\'' + t.id + '\', ' + t.done + ')" title="' + (t.done ? "Mark as pending" : "Mark as done") + '">' +
        '<svg viewBox="0 0 14 14"><polyline points="2,7 5.5,10.5 12,3"/></svg>' +
      '</button>' +
      '<div class="task-content">' +
        '<h4>' + esc(t.text || "New Task") + '</h4>' +
        '<p>' + (t.done ? "Completed ✓" : "Official task from team management") + '</p>' +
      '</div>' +
    '</div>';
  }).join("");
}

// ====================================================
// TOGGLE TASK DONE
// ====================================================
window.toggleDone = async function(taskId, currentDone) {
  const newDone = !currentDone;
  const card    = document.getElementById("tc-" + taskId);
  if (!card) return;

  if (newDone) {
    card.classList.add("done");
    card.querySelector(".task-content p").textContent = "Completed ✓";
  } else {
    card.classList.remove("done");
    card.querySelector(".task-content p").textContent = "Official task from team management";
  }

  const { error } = await sb.from("tasks").update({ done: newDone }).eq("id", taskId);
  if (error) {
    if (newDone) card.classList.remove("done"); else card.classList.add("done");
    console.error("[AM-PRO] toggleDone error:", error);
  }
};

// ====================================================
// RENDER LEADERBOARD — bio visible to all
// ====================================================
function renderLeaderboard(list) {
  const el = document.getElementById("panel-leaderboard");
  if (!el) return;

  if (!list.length) {
    el.innerHTML = '<div class="empty-state">No members yet.</div>';
    return;
  }

  el.innerHTML = list.map(function(m, i) {
    const level    = m.level || 1;
    const rank     = getRank(level);
    const color    = avatarColor(m.name);
    const pos      = i + 1;
    const posClass = pos === 1 ? "gold" : pos === 2 ? "silver" : pos === 3 ? "bronze" : "";
    const medal    = pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : "#" + pos;
    const tc       = badgeTxtColor(rank.color);
    const vBadge   = m.verified ? verifyBadge(14) : "";

    const avatarInner = m.avatar_url
      ? '<img src="' + esc(m.avatar_url) + '" alt="' + esc(m.name) + '">'
      : '<span style="color:' + color + ';font-size:16px;font-weight:800">' + (m.name||"?")[0].toUpperCase() + '</span>';

    // ✅ Bio always shown to everyone
    const bioLine = m.bio && m.bio.trim()
      ? '<div class="lb-bio" style="font-size:11px;color:rgba(255,255,255,.38);margin-top:3px;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;">' + esc(m.bio) + '</div>'
      : "";

    return '<div class="lb-row" onclick="openProfile(\'' + esc(m.id) + '\')">' +
      '<div class="lb-pos ' + posClass + '">' + medal + '</div>' +
      '<div class="lb-avatar" style="background:' + color + '18;box-shadow:0 0 0 2px ' + rank.color + '55">' + avatarInner + '</div>' +
      '<div class="lb-info">' +
        '<div class="lb-name">' + esc(m.name || "—") + " " + vBadge + '</div>' +
        '<div class="lb-sub">@' + esc(m.username || "—") + ' · ' + esc(m.field || "—") + '</div>' +
        bioLine +
      '</div>' +
      '<span class="lb-rank-badge" style="background:' + rank.color + ';color:' + tc + '">' + rank.name + '</span>' +
      '<div class="lb-level">Lv ' + level + '</div>' +
    '</div>';
  }).join("");
}

// ====================================================
// RENDER PROFILES GRID — bio visible to all
// ====================================================
function renderProfilesGrid(list) {
  const el = document.getElementById("panel-profiles");
  if (!el) return;

  if (!list.length) {
    el.innerHTML = '<div class="empty-state" style="grid-column:1/-1">No members yet.</div>';
    return;
  }

  el.innerHTML = list.map(function(m, i) {
    const level  = m.level || 1;
    const rank   = getRank(level);
    const color  = avatarColor(m.name);
    const pos    = i + 1;
    const tc     = badgeTxtColor(rank.color);
    const vBadge = m.verified ? verifyBadge(13) : "";

    const avatarInner = m.avatar_url
      ? '<img src="' + esc(m.avatar_url) + '" alt="' + esc(m.name) + '">'
      : '<span style="color:' + color + ';font-size:22px;font-weight:800">' + (m.name||"?")[0].toUpperCase() + '</span>';

    // ✅ Bio always shown to everyone
    const bioLine = m.bio && m.bio.trim()
      ? '<div class="pcard-bio" style="font-size:11px;color:rgba(255,255,255,.38);font-style:italic;line-height:1.4;padding:0 4px;word-break:break-word;">' + esc(m.bio) + '</div>'
      : "";

    return '<div class="pcard" onclick="openProfile(\'' + esc(m.id) + '\')" style="border-color:' + rank.color + '22">' +
      '<div class="pcard-avatar" style="background:' + color + '18;box-shadow:0 0 0 2.5px ' + rank.color + '66,0 6px 18px ' + color + '18">' + avatarInner + '</div>' +
      '<div class="pcard-name">' + esc(m.name || "—") + " " + vBadge + '</div>' +
      '<div class="pcard-user">@' + esc(m.username || "—") + '</div>' +
      bioLine +
      '<span class="pcard-rank" style="background:' + rank.color + ';color:' + tc + '">' + rank.name + '</span>' +
      '<div class="pcard-pos">' + (pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : "#" + pos) + ' · Lv ' + level + '</div>' +
    '</div>';
  }).join("");
}

// ====================================================
// SWITCH MEMBER TAB
// ====================================================
window.switchMemberTab = function(tab, btn) {
  currentMemberTab = tab;
  document.querySelectorAll(".stab").forEach(function(b) { b.classList.remove("active"); });
  btn.classList.add("active");

  const lb = document.getElementById("panel-leaderboard");
  const pg = document.getElementById("panel-profiles");

  if (tab === "leaderboard") {
    lb.style.display = "flex";
    pg.style.display = "none";
    renderLeaderboard(allMembers);
  } else {
    lb.style.display = "none";
    pg.style.display = "grid";
    renderProfilesGrid(allMembers);
  }
};

// ====================================================
// OPEN PROFILE MODAL — bio visible to all, tasks hidden
// ====================================================
window.openProfile = async function(uid) {
  const m = allMembers.find(function(x) { return x.id === uid; });
  if (!m) return;

  const level = m.level || 1;
  const rank  = getRank(level);
  const color = avatarColor(m.name);
  const tc    = badgeTxtColor(rank.color);

  const pmAv = document.getElementById("pmAvatar");
  pmAv.style.background = color + "18";
  pmAv.style.boxShadow  = "0 0 0 3px " + rank.color + "66, 0 10px 30px " + color + "22";

  if (m.avatar_url) {
    pmAv.innerHTML = '<img src="' + esc(m.avatar_url) + '" alt="' + esc(m.name) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
  } else {
    const init = (m.name || m.username || "?")[0].toUpperCase();
    pmAv.innerHTML = '<span style="color:' + color + ';font-size:32px;font-weight:900">' + init + '</span>';
  }

  const vBadge = m.verified ? verifyBadge(20) : "";
  document.getElementById("pmName").innerHTML = esc(m.name || "—") + " " + vBadge;
  document.getElementById("pmUser").textContent = "@" + (m.username || "—");
  document.getElementById("pmLevel").textContent = level;
  document.getElementById("pmField").textContent = m.field || "—";

  // ✅ Bio in modal — always visible
  var pmBioEl = document.getElementById("pmBio");
  if (!pmBioEl) {
    pmBioEl = document.createElement("div");
    pmBioEl.id = "pmBio";
    pmBioEl.style.cssText = "font-size:13px;color:rgba(255,255,255,.55);text-align:center;margin-bottom:12px;font-style:italic;line-height:1.5;padding:0 8px;";
    document.getElementById("pmUser").after(pmBioEl);
  }
  pmBioEl.textContent = m.bio || "";
  pmBioEl.style.display = (m.bio && m.bio.trim()) ? "block" : "none";

  const pmRank = document.getElementById("pmRank");
  pmRank.textContent      = rank.name + " · Sub-" + rank.sub;
  pmRank.style.background = rank.color;
  pmRank.style.color      = tc;

  // Tasks count only
  document.getElementById("pmTasksWrap").style.display = "none";
  document.getElementById("pmTasks").textContent = "…";

  document.getElementById("profileOverlay").classList.remove("hidden");

  const { data: tasks } = await sb.from("tasks").select("id").eq("user_id", uid);
  document.getElementById("pmTasks").textContent = (tasks || []).length;
};

window.closePM = function(e) {
  if (e.target.id === "profileOverlay")
    document.getElementById("profileOverlay").classList.add("hidden");
};

window.closePMbtn = function() {
  document.getElementById("profileOverlay").classList.add("hidden");
};
