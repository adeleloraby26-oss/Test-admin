/* ============================================================
   AM PRO — Admin Panel Logic  (admin.js)
   ============================================================ */

// ── Supabase Init ─────────────────────────────────────────────
const { createClient } = supabase;
const sb = createClient(
  "https://tzojjwnqodcrhwjaasja.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6b2pqd25xb2Rjcmh3amFhc2phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NzA2ODAsImV4cCI6MjA5MzI0NjY4MH0.G4IGSUgjVIKTNVszU5GpxNaD0VUnSmzUXe8p7uUl418"
);

// ── Ranks (same as dashboard) ─────────────────────────────────
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

// ── State ─────────────────────────────────────────────────────
let allUsers    = [];
let allTasks    = [];
let adminUser   = null;
let modalTarget = null;   // uid for currently open modal

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, type) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "show " + (type || "ok");
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.className = ""; }, 3200);
}

// ── Modal helpers ─────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.remove("hidden"); }
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }

// Close any modal when clicking the dark overlay
document.querySelectorAll(".overlay").forEach(function (o) {
  o.addEventListener("click", function (e) {
    if (e.target === o) o.classList.add("hidden");
  });
});

// ── Logout ────────────────────────────────────────────────────
document.getElementById("logoutBtn").addEventListener("click", async function () {
  await sb.auth.signOut();
  window.location.href = "../auth/index.html";
});

// ── Boot ──────────────────────────────────────────────────────
(async function boot() {
  const { data: { session } } = await sb.auth.getSession();

  if (!session) {
    window.location.href = "../auth/index.html";
    return;
  }

  const { data: me } = await sb.from("users").select("*").eq("id", session.user.id).single();

  if (!me || !me.is_admin) {
    document.getElementById("accessDenied").style.display = "block";
    return;
  }

  adminUser = me;
  document.getElementById("adminName").textContent = me.name || me.username || "Admin";
  document.getElementById("adminContent").style.display = "block";

  await loadAll();
})();

// ── Load all data ─────────────────────────────────────────────
async function loadAll() {
  const [{ data: users }, { data: tasks }] = await Promise.all([
    sb.from("users").select("*").order("level", { ascending: false }),
    sb.from("tasks").select("*")
  ]);

  allUsers = users || [];
  allTasks = tasks || [];

  // Update stats
  document.getElementById("statUsers").textContent    = allUsers.length;
  document.getElementById("statVerified").textContent = allUsers.filter(u => u.verified).length;
  document.getElementById("statTasks").textContent    = allTasks.length;
  document.getElementById("statAdmins").textContent   = allUsers.filter(u => u.is_admin).length;
  document.getElementById("userCountLabel").textContent = " · " + allUsers.length + " total";

  renderUsers(allUsers);
}

// ── Search filter ─────────────────────────────────────────────
window.filterUsers = function () {
  const q = document.getElementById("searchInput").value.toLowerCase();
  const filtered = allUsers.filter(u =>
    (u.name     || "").toLowerCase().includes(q) ||
    (u.username || "").toLowerCase().includes(q) ||
    (u.field    || "").toLowerCase().includes(q)
  );
  renderUsers(filtered);
};

// ── Render user cards ─────────────────────────────────────────
function renderUsers(list) {
  const el = document.getElementById("userList");

  if (!list.length) {
    el.innerHTML = '<div class="empty-state">No members found.</div>';
    return;
  }

  el.innerHTML = list.map(function (u) {
    const level = u.level || 1;
    const rank  = getRank(level);
    const color = avatarColor(u.name);
    const tc    = badgeTxtColor(rank.color);

    const avatarInner = u.avatar_url
      ? '<img src="' + esc(u.avatar_url) + '" alt="' + esc(u.name) + '">'
      : '<span style="color:' + color + '">' + (u.name || "?")[0].toUpperCase() + '</span>';

    // Tasks for this user
    const userTasks = allTasks.filter(t => t.user_id === u.id);
    const taskHTML = userTasks.length
      ? userTasks.map(t =>
          '<div class="task-item">' +
            '<span class="task-done-ico">' + (t.done ? "✅" : "⬜") + '</span>' +
            '<span class="task-txt' + (t.done ? " done" : "") + '">' + esc(t.text || "Task") + '</span>' +
            '<button class="task-del" onclick="deleteTask(\'' + esc(t.id) + '\',\'' + esc(u.id) + '\')" title="Delete task">' +
              '<i class="fa-solid fa-trash"></i>' +
            '</button>' +
          '</div>'
        ).join("")
      : '<div style="font-size:12px;color:var(--text-dim);padding:4px 0">No tasks assigned yet</div>';

    // Self-protection: admin can't remove themselves or change their own admin status
    const isSelf = (u.id === adminUser.id);

    const verifyBtn =
      '<button class="btn ' + (u.verified ? "btn-red" : "btn-green") + '" ' +
      'onclick="toggleVerify(\'' + esc(u.id) + '\',' + u.verified + ')">' +
        (u.verified ? "✕ Unverify" : "✓ Verify") +
      '</button>';

    const adminBtn = isSelf ? "" :
      '<button class="btn ' + (u.is_admin ? "btn-red" : "") + '" ' +
      'style="' + (u.is_admin ? "" : "background:rgba(255,149,0,.1);border:1px solid rgba(255,149,0,.25);color:#ff9500") + '" ' +
      'onclick="toggleAdmin(\'' + esc(u.id) + '\',' + u.is_admin + ')">' +
        (u.is_admin ? "✕ Remove Admin" : "🛡 Make Admin") +
      '</button>';

    const rankBtn =
      '<button class="btn btn-ghost" onclick="openRankModal(\'' + esc(u.id) + '\',' + level + ')">⬆ Level</button>';

    const pwBtn =
      '<button class="btn btn-ghost" onclick="openPwModal(\'' + esc(u.id) + '\')">🔑 Password</button>';

    const deleteBtn = isSelf ? "" :
      '<button class="btn btn-red" onclick="openDeleteModal(\'' + esc(u.id) + '\',\'' + esc(u.name || u.username) + '\')">' +
        '<i class="fa-solid fa-trash"></i> Delete' +
      '</button>';

    return (
      '<div class="user-card" id="uc-' + esc(u.id) + '">' +

        // ── Top row
        '<div class="user-row">' +
          '<div class="u-avatar" style="background:' + color + '18;box-shadow:0 0 0 2px ' + rank.color + '55">' +
            avatarInner +
          '</div>' +
          '<div class="u-info">' +
            '<div class="u-name">' +
              esc(u.name || "—") +
              (u.verified ? ' <i class="fa-solid fa-circle-check verified-ico" title="Verified"></i>' : "") +
              (u.is_admin ? ' <i class="fa-solid fa-shield-halved admin-ico" title="Admin"></i>' : "") +
            '</div>' +
            '<div class="u-sub">@' + esc(u.username || "—") + ' · ' + esc(u.field || "—") + ' · Lv ' + level + '</div>' +
            (u.bio ? '<div class="u-bio">' + esc(u.bio) + '</div>' : "") +
          '</div>' +
          '<span class="rank-badge" style="background:' + rank.color + ';color:' + tc + '">' + rank.name + '</span>' +
        '</div>' +

        // ── Action buttons
        '<div class="u-actions">' +
          verifyBtn + adminBtn + rankBtn + pwBtn + deleteBtn +
        '</div>' +

        // ── Tasks panel
        '<div class="task-subcard">' +
          '<div class="task-sub-hdr">' +
            '<span>Tasks (' + userTasks.length + ')</span>' +
            '<button class="btn btn-blue" style="font-size:10px;padding:5px 12px" ' +
              'onclick="openAddTask(\'' + esc(u.id) + '\')">+ Add Task</button>' +
          '</div>' +
          '<div id="tasks-' + esc(u.id) + '">' + taskHTML + '</div>' +
          '<div id="addtask-' + esc(u.id) + '" style="display:none">' +
            '<div class="add-task-form">' +
              '<input class="add-task-input" id="taskinput-' + esc(u.id) + '" placeholder="Task description…" ' +
                'onkeydown="taskKeydown(event,\'' + esc(u.id) + '\')">' +
              '<button class="btn btn-blue" style="font-size:11px;padding:6px 14px" ' +
                'onclick="submitTask(\'' + esc(u.id) + '\')">Add</button>' +
              '<button class="btn btn-ghost" style="font-size:11px;padding:6px 12px;color:var(--text-dim)" ' +
                'onclick="closeAddTask(\'' + esc(u.id) + '\')">✕</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

      '</div>'
    );
  }).join("");
}

// ── Toggle Verify ─────────────────────────────────────────────
window.toggleVerify = async function (uid, current) {
  const { error } = await sb.from("users").update({ verified: !current }).eq("id", uid);
  if (error) { toast("Error: " + error.message, "err"); return; }
  toast(current ? "Verification removed" : "✓ Account verified", "ok");
  await loadAll();
};

// ── Toggle Admin ──────────────────────────────────────────────
window.toggleAdmin = async function (uid, current) {
  const { error } = await sb.from("users").update({ is_admin: !current }).eq("id", uid);
  if (error) { toast("Error: " + error.message, "err"); return; }
  toast(current ? "Admin removed" : "🛡 Admin granted", "ok");
  await loadAll();
};

// ── Change Rank / Level ───────────────────────────────────────
window.openRankModal = function (uid, currentLevel) {
  modalTarget = uid;
  document.getElementById("rankInput").value = currentLevel;
  openModal("rankModal");
};

window.confirmChangeRank = async function () {
  const lvl = parseInt(document.getElementById("rankInput").value, 10);
  if (!lvl || lvl < 1 || lvl > 999) { toast("Enter a valid level (1–999)", "err"); return; }
  const { error } = await sb.from("users").update({ level: lvl }).eq("id", modalTarget);
  if (error) { toast("Error: " + error.message, "err"); return; }
  closeModal("rankModal");
  toast("✓ Level updated to " + lvl, "ok");
  await loadAll();
};

// ── Change Password ───────────────────────────────────────────
window.openPwModal = function (uid) {
  modalTarget = uid;
  document.getElementById("pwInput").value = "";
  openModal("pwModal");
};

window.confirmChangePassword = async function () {
  const pw = document.getElementById("pwInput").value.trim();
  if (pw.length < 6) { toast("Password must be at least 6 characters", "err"); return; }

  // Requires Supabase Edge Function or RPC "admin_update_password"
  // See: SUPABASE_POLICIES.sql for setup notes
  const { error } = await sb.rpc("admin_update_password", {
    target_user_id: modalTarget,
    new_password:   pw
  });

  closeModal("pwModal");

  if (error) {
    console.warn("[AM-PRO] Password RPC error:", error.message);
    toast("⚠ Use Supabase Dashboard → Auth → Users to reset password", "err");
    return;
  }

  toast("✓ Password updated", "ok");
};

// ── Delete Account ────────────────────────────────────────────
window.openDeleteModal = function (uid, name) {
  modalTarget = uid;
  document.getElementById("deleteTargetName").textContent = name;
  openModal("deleteModal");
};

window.confirmDelete = async function () {
  const uid = modalTarget;
  closeModal("deleteModal");

  // 1. Delete all tasks
  await sb.from("tasks").delete().eq("user_id", uid);

  // 2. Delete user row from users table
  const { error: rowErr } = await sb.from("users").delete().eq("id", uid);
  if (rowErr) { toast("Error deleting user row: " + rowErr.message, "err"); return; }

  // 3. Remove avatar files from storage
  await sb.storage.from("avatars").remove([
    uid + "/avatar.jpg",
    uid + "/avatar.jpeg",
    uid + "/avatar.png",
    uid + "/avatar.webp",
    uid + "/avatar.gif"
  ]);

  // 4. Delete from auth (requires admin_delete_user RPC with service role)
  const { error: authErr } = await sb.rpc("admin_delete_user", { target_user_id: uid });
  if (authErr) {
    console.warn("[AM-PRO] Auth deletion needs service role RPC:", authErr.message);
    toast("✓ User data deleted. Remove from Auth → Users in Supabase Dashboard", "err");
  } else {
    toast("✓ Account fully deleted", "ok");
  }

  await loadAll();
};

// ── Tasks: Add / Delete ───────────────────────────────────────
window.openAddTask = function (uid) {
  const el = document.getElementById("addtask-" + uid);
  if (el) {
    el.style.display = "block";
    const inp = document.getElementById("taskinput-" + uid);
    if (inp) inp.focus();
  }
};

window.closeAddTask = function (uid) {
  const el = document.getElementById("addtask-" + uid);
  if (el) el.style.display = "none";
};

window.taskKeydown = function (e, uid) {
  if (e.key === "Enter")  window.submitTask(uid);
  if (e.key === "Escape") window.closeAddTask(uid);
};

window.submitTask = async function (uid) {
  const inp  = document.getElementById("taskinput-" + uid);
  const text = inp ? inp.value.trim() : "";
  if (!text) return;

  const { error } = await sb.from("tasks").insert({ user_id: uid, text: text, done: false });
  if (error) { toast("Error: " + error.message, "err"); return; }
  toast("✓ Task added", "ok");
  await loadAll();
};

window.deleteTask = async function (taskId) {
  const { error } = await sb.from("tasks").delete().eq("id", taskId);
  if (error) { toast("Error: " + error.message, "err"); return; }
  toast("Task deleted", "ok");
  await loadAll();
};
