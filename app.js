// ── CONFIG ────────────────────────────────────────────────
const SUPABASE_URL  = AMPRO_CONFIG.supabase.url;
const SUPABASE_ANON = AMPRO_CONFIG.supabase.service;
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── ADMIN STATE ───────────────────────────────────────────
let adminSession = null;
let allUsers = [];
let allRanks = [];
let allTitles = [];

// ── LOGIN ─────────────────────────────────────────────────
async function doLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  if (!u || !p) return;

  // Show loading state
  const btn = document.querySelector('.login-btn');
  btn.textContent = 'Signing in...';
  btn.disabled = true;

  try {
    const { data, error } = await sb.from('admin_users')
      .select('*').eq('username', u).eq('password', p).limit(1);

    const user = data && data[0];

    if (user && !error) {
      adminSession = { username: user.username };
      sessionStorage.setItem('adminSession', JSON.stringify(adminSession));
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('adminApp').style.display = 'flex';
      document.getElementById('adminUsername').textContent = user.username;
      await initAdmin();
    } else {
      document.getElementById('loginError').style.display = 'block';
      setTimeout(() => document.getElementById('loginError').style.display = 'none', 3000);
    }
  } catch (err) {
    document.getElementById('loginError').style.display = 'block';
    setTimeout(() => document.getElementById('loginError').style.display = 'none', 3000);
  } finally {
    btn.textContent = 'Sign In';
    btn.disabled = false;
  }
}

function doLogout() {
  sessionStorage.removeItem('adminSession');
  adminSession = null;
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('adminApp').style.display = 'none';
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
}

// Check existing session
(async function checkSession() {
  const s = sessionStorage.getItem('adminSession');
  if (s) {
    adminSession = JSON.parse(s);
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminApp').style.display = 'flex';
    document.getElementById('adminUsername').textContent = adminSession.username;
    await initAdmin();
  }
})();

// ── INIT ──────────────────────────────────────────────────
async function initAdmin() {
  await Promise.all([loadAllUsers(), loadAllRanks(), loadAllTitles()]);
  loadOverview();
  populateNotifTargets();
}

async function loadAllUsers() {
  const { data } = await sb.from('users').select('*').order('points', { ascending: false });
  allUsers = data || [];
}
async function loadAllRanks() {
  const { data } = await sb.from('ranks').select('*').order('min_points');
  allRanks = data || [];
}
async function loadAllTitles() {
  const { data } = await sb.from('titles').select('*');
  allTitles = data || [];
}

function getRankForPoints(pts) {
  for (const r of [...allRanks].reverse()) {
    if (pts >= r.min_points) return r;
  }
  return allRanks[0] || { name: 'Dust', color: '#8e8e93' };
}

function avatarColor(name) {
  const colors = ['#6366f1','#a78bfa','#ec4899','#f97316','#22c55e','#0ea5e9','#f59e0b'];
  const i = name ? name.charCodeAt(0) % colors.length : 0;
  return colors[i];
}
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function timeAgo(iso) {
  if (!iso) return '';
  const d = (Date.now() - new Date(iso)) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  return new Date(iso).toLocaleDateString('en');
}

// ── NAVIGATION ────────────────────────────────────────────
function showAdminPage(page, el) {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('ap-' + page).classList.add('active');
  el.classList.add('active');
  const loaders = {
    overview: loadOverview,
    users: loadUsersTable,
    tasks: loadTasksTable,
    ranks: loadRanksTable,
    titles: loadTitlesTable,
    messages: loadMessages,
    submissions: loadSubmissions,
    deletions: loadDeletions,
    notify: () => populateNotifTargets(),
  };
  if (loaders[page]) loaders[page]();
  document.getElementById('adminSidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('adminSidebar').classList.toggle('open');
}

// ── OVERVIEW ──────────────────────────────────────────────
async function loadOverview() {
  await Promise.all([loadAllUsers(), loadAllRanks(), loadAllTitles()]);
  const [{ count: taskCount }, { count: msgCount }] = await Promise.all([
    sb.from('tasks').select('*', { count: 'exact', head: true }),
    sb.from('team_messages').select('*', { count: 'exact', head: true }),
  ]);
  document.getElementById('stat-users').textContent = allUsers.length;
  document.getElementById('stat-online').textContent = allUsers.filter(u => u.online).length;
  document.getElementById('stat-tasks').textContent = taskCount || 0;
  document.getElementById('stat-msgs').textContent = msgCount || 0;
  document.getElementById('stat-ranks').textContent = allRanks.length;
  document.getElementById('stat-titles').textContent = allTitles.length;

  const top5 = allUsers.slice(0, 5);
  document.getElementById('overviewTopUsers').innerHTML = top5.length
    ? top5.map((u, i) => {
        const rank = getRankForPoints(u.points || 0);
        const medals = ['🥇','🥈','🥉'];
        return `<tr>
          <td><span style="font-size:18px">${medals[i] || (i+1)}</span></td>
          <td><div class="user-cell">
            <div class="user-avatar-sm" style="${u.avatar_url ? '' : `background:${avatarColor(u.name)}`}">
              ${u.avatar_url ? `<img src="${u.avatar_url}"/>` : (u.name||'?')[0].toUpperCase()}
            </div>
            <div><div style="font-weight:600">${esc(u.name||u.username||'?')}</div>
            ${u.verified ? '<span style="font-size:11px;color:#a78bfa"><i class="fa-solid fa-certificate"></i> Verified</span>' : ''}</div>
          </div></td>
          <td><span class="points-badge"><i class="fa-solid fa-star"></i> ${(u.points||0).toLocaleString()}</span></td>
          <td><span style="color:${rank.color};font-weight:700">${esc(rank.name)}</span></td>
        </tr>`;
      }).join('')
    : `<tr class="empty-row"><td colspan="4">No users yet</td></tr>`;
}

// ── USERS TABLE ───────────────────────────────────────────
async function loadUsersTable() {
  await loadAllUsers();
  renderUsersTable(allUsers);
  populateTitleSelect('editUserTitle');
}

function renderUsersTable(users) {
  const body = document.getElementById('usersTableBody');
  if (!users.length) { body.innerHTML = `<tr class="empty-row"><td colspan="5">No users found</td></tr>`; return; }
  body.innerHTML = users.map(u => {
    const rank = getRankForPoints(u.points || 0);
    return `<tr>
      <td><div class="user-cell">
        <div class="user-avatar-sm" style="${u.avatar_url ? '' : `background:${avatarColor(u.name)}`}">
          ${u.avatar_url ? `<img src="${esc(u.avatar_url)}"/>` : (u.name||'?')[0].toUpperCase()}
        </div>
        <div>
          <div style="font-weight:600">${esc(u.name||u.username||'?')}</div>
          <div style="font-size:11px;color:var(--muted)">@${esc(u.username||'')} · ${esc(u.email||'')}</div>
        </div>
      </div></td>
      <td><span class="points-badge"><i class="fa-solid fa-star"></i> ${(u.points||0).toLocaleString()}</span></td>
      <td><span style="color:${rank.color};font-weight:700;font-size:12px">${esc(rank.name)}</span></td>
      <td>
        <span class="badge-pill ${u.online ? 'badge-online' : 'badge-offline'}">
          <i class="fa-solid fa-circle" style="font-size:6px"></i> ${u.online ? 'Online' : 'Offline'}
        </span>
        ${u.verified ? '<span class="badge-pill badge-verified" style="margin-left:4px"><i class="fa-solid fa-certificate" style="font-size:10px"></i> Verified</span>' : ''}
      </td>
      <td><div class="action-btns">
        <button class="btn-sm" onclick="openEditUser('${u.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-sm" onclick="openAwardTitle('${u.id}')"><i class="fa-solid fa-award"></i></button>
        <button class="btn-danger" onclick="deleteUser('${u.id}','${esc(u.name||u.username)}')"><i class="fa-solid fa-trash"></i></button>
      </div></td>
    </tr>`;
  }).join('');
}

function filterUsersTable(q) {
  const filtered = allUsers.filter(u =>
    (u.name||'').toLowerCase().includes(q.toLowerCase()) ||
    (u.username||'').toLowerCase().includes(q.toLowerCase()) ||
    (u.email||'').toLowerCase().includes(q.toLowerCase())
  );
  renderUsersTable(filtered);
}

function openEditUser(id) {
  const u = allUsers.find(x => x.id === id);
  if (!u) return;
  document.getElementById('editUserId').value = id;
  document.getElementById('editUserName').value = u.name || '';
  document.getElementById('editUserUsername').value = u.username || '';
  document.getElementById('editUserPoints').value = u.points || 0;
  document.getElementById('editUserBio').value = u.bio || '';
  document.getElementById('editUserVerified').checked = u.verified || false;
  populateTitleSelect('editUserTitle', u.title_id);
  openModal('userEditModal');
}

async function saveUser() {
  const id = document.getElementById('editUserId').value;
  const updates = {
    name:     document.getElementById('editUserName').value.trim(),
    username: document.getElementById('editUserUsername').value.trim(),
    points:   parseInt(document.getElementById('editUserPoints').value) || 0,
    bio:      document.getElementById('editUserBio').value.trim(),
    verified: document.getElementById('editUserVerified').checked,
    title_id: document.getElementById('editUserTitle').value || null,
  };
  const rank = getRankForPoints(updates.points);
  if (rank) updates.rank_id = rank.id;

  const { error } = await sb.from('users').update(updates).eq('id', id);
  if (error) { toast('Error: ' + error.message, true); return; }
  toast('User updated!');
  closeModal('userEditModal');
  await loadAllUsers();
  renderUsersTable(allUsers);
}

async function deleteUser(id, name) {
  if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
  const { error } = await sb.from('users').delete().eq('id', id);
  if (error) { toast('Error: ' + error.message, true); return; }
  toast('User deleted');
  await loadAllUsers();
  renderUsersTable(allUsers);
}

function openAwardTitle(userId) {
  document.getElementById('awardUserId').value = userId;
  populateTitleSelect('awardTitleSelect');
  openModal('awardTitleModal');
}

async function doAwardTitle() {
  const userId = document.getElementById('awardUserId').value;
  const titleId = document.getElementById('awardTitleSelect').value;
  if (!titleId) { toast('Select a title first', true); return; }
  const { error } = await sb.from('users').update({ title_id: titleId }).eq('id', userId);
  if (error) { toast('Error: ' + error.message, true); return; }
  await sb.from('user_titles').upsert({ user_id: userId, title_id: titleId }, { onConflict: 'user_id,title_id' });
  toast('Title awarded!');
  closeModal('awardTitleModal');
  await loadAllUsers();
  renderUsersTable(allUsers);
}

// ── TASKS TABLE ───────────────────────────────────────────
async function loadTasksTable() {
  const { data } = await sb.from('tasks').select('*, user:users(name,username)').order('created_at', { ascending: false });
  const tasks = data || [];
  const body = document.getElementById('tasksTableBody');
  if (!tasks.length) { body.innerHTML = `<tr class="empty-row"><td colspan="5">No tasks yet</td></tr>`; return; }
  body.innerHTML = tasks.map(t => {
    const statusColors = { pending:'#f59e0b', submitted:'#6366f1', approved:'#22c55e', rejected:'#ef4444' };
    const sc = statusColors[t.status] || '#fff';
    return `<tr>
      <td style="font-weight:600">${esc(t.title)}</td>
      <td>${esc(t.user?.name || t.user?.username || 'Unknown')}</td>
      <td><span class="points-badge"><i class="fa-solid fa-star"></i> ${t.points||0}</span></td>
      <td><span style="color:${sc};font-weight:700;font-size:12px;text-transform:capitalize">${t.status}</span></td>
      <td><div class="action-btns">
        <button class="btn-sm" onclick="openEditTask('${t.id}')"><i class="fa-solid fa-pen"></i></button>
        ${t.status === 'submitted' ? `<button class="btn-success" onclick="approveTask('${t.id}','${t.user_id}',${t.points||0})"><i class="fa-solid fa-check"></i> Approve</button>` : ''}
        <button class="btn-danger" onclick="deleteTask('${t.id}')"><i class="fa-solid fa-trash"></i></button>
      </div></td>
    </tr>`;
  }).join('');
  populateUserSelect('taskUser');
}

function openEditTask(id) {
  document.getElementById('editTaskId').value = id;
  document.getElementById('taskModalTitle').textContent = 'Edit Task';
  sb.from('tasks').select('*').eq('id', id).single().then(({ data }) => {
    if (!data) return;
    document.getElementById('taskTitle').value = data.title;
    document.getElementById('taskBody').value = data.body || '';
    document.getElementById('taskPoints').value = data.points || 0;
    document.getElementById('taskStatus').value = data.status;
    document.getElementById('taskLink').value = data.link || '';
    document.getElementById('taskUser').value = data.user_id;
    openModal('taskModal');
  });
}

async function saveTask() {
  const id = document.getElementById('editTaskId').value;
  const payload = {
    user_id: document.getElementById('taskUser').value,
    title:   document.getElementById('taskTitle').value.trim(),
    body:    document.getElementById('taskBody').value.trim(),
    points:  parseInt(document.getElementById('taskPoints').value) || 0,
    status:  document.getElementById('taskStatus').value,
    link:    document.getElementById('taskLink').value.trim() || null,
  };
  if (!payload.title) { toast('Task title is required', true); return; }

  if (id) {
    await sb.from('tasks').update(payload).eq('id', id);
  } else {
    await sb.from('tasks').insert(payload);
  }
  toast(id ? 'Task updated!' : 'Task created!');
  closeModal('taskModal');
  document.getElementById('editTaskId').value = '';
  document.getElementById('taskModalTitle').textContent = 'New Task';
  loadTasksTable();
}

async function approveTask(taskId, userId, points) {
  if (!confirm(`Approve this task and award ${points} points?`)) return;
  await sb.from('tasks').update({ status: 'approved' }).eq('id', taskId);
  const user = allUsers.find(u => u.id === userId);
  if (user) {
    const newPts = (user.points || 0) + points;
    const rank = getRankForPoints(newPts);
    await sb.from('users').update({ points: newPts, rank_id: rank?.id || null }).eq('id', userId);
    await sb.from('notifications').insert({ user_id: userId, title: 'Task Approved! 🎉', body: `You earned ${points} points!` });
  }
  toast(`Task approved! +${points} pts awarded`);
  await loadAllUsers();
  loadTasksTable();
}

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  await sb.from('tasks').delete().eq('id', id);
  toast('Task deleted');
  loadTasksTable();
}

// ── RANKS TABLE ───────────────────────────────────────────
async function loadRanksTable() {
  await loadAllRanks();
  const body = document.getElementById('ranksTableBody');
  body.innerHTML = allRanks.map(r => {
    const bg = r.gradient_from ? `linear-gradient(135deg,${r.gradient_from},${r.gradient_to})` : r.color;
    return `<tr>
      <td><span style="background:${bg};color:#fff;padding:4px 12px;border-radius:20px;font-weight:700;font-size:12px">${esc(r.name)}</span></td>
      <td>${(r.min_points||0).toLocaleString()}</td>
      <td>${r.max_points ? r.max_points.toLocaleString() : '∞'}</td>
      <td><code style="font-size:11px;color:#a78bfa">${esc(r.icon||'—')}</code></td>
      <td><div class="action-btns">
        <button class="btn-sm" onclick="openEditRank('${r.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-danger" onclick="deleteRank('${r.id}','${esc(r.name)}')"><i class="fa-solid fa-trash"></i></button>
      </div></td>
    </tr>`;
  }).join('') || `<tr class="empty-row"><td colspan="5">No ranks yet</td></tr>`;
}

function openEditRank(id) {
  const r = allRanks.find(x => x.id === id);
  if (!r) return;
  document.getElementById('editRankId').value = id;
  document.getElementById('rankModalTitle').textContent = 'Edit Rank';
  document.getElementById('rankName').value = r.name;
  document.getElementById('rankMin').value = r.min_points;
  document.getElementById('rankMax').value = r.max_points || '';
  document.getElementById('rankGradFrom').value = r.gradient_from || '#6366f1';
  document.getElementById('rankGradTo').value = r.gradient_to || '#a78bfa';
  document.getElementById('rankIcon').value = r.icon || '';
  openModal('rankModal');
}

async function saveRank() {
  const id = document.getElementById('editRankId').value;
  const from = document.getElementById('rankGradFrom').value;
  const to = document.getElementById('rankGradTo').value;
  const payload = {
    name: document.getElementById('rankName').value.trim(),
    min_points: parseInt(document.getElementById('rankMin').value) || 0,
    max_points: parseInt(document.getElementById('rankMax').value) || null,
    gradient_from: from, gradient_to: to,
    color: from,
    glow_color: from + '66',
    icon: document.getElementById('rankIcon').value.trim() || 'wind',
  };
  if (!payload.name) { toast('Rank name required', true); return; }
  if (id) {
    await sb.from('ranks').update(payload).eq('id', id);
  } else {
    await sb.from('ranks').insert(payload);
  }
  toast(id ? 'Rank updated!' : 'Rank created!');
  closeModal('rankModal');
  document.getElementById('editRankId').value = '';
  document.getElementById('rankModalTitle').textContent = 'New Rank';
  await loadAllRanks();
  loadRanksTable();
}

async function deleteRank(id, name) {
  if (!confirm(`Delete rank "${name}"?`)) return;
  await sb.from('ranks').delete().eq('id', id);
  toast('Rank deleted');
  await loadAllRanks();
  loadRanksTable();
}

// ── TITLES TABLE ──────────────────────────────────────────
async function loadTitlesTable() {
  await loadAllTitles();
  const body = document.getElementById('titlesTableBody');
  body.innerHTML = allTitles.map(t => {
    const bg = t.gradient_from ? `linear-gradient(135deg,${t.gradient_from},${t.gradient_to})` : 'rgba(255,255,255,.08)';
    const glow = t.glow_color || t.color + '66';
    return `<tr>
      <td><span style="color:${t.color};background:${bg};border:1px solid ${glow};padding:4px 12px;border-radius:20px;font-weight:700;font-size:12px">${esc(t.name)}</span></td>
      <td><div style="width:20px;height:20px;border-radius:50%;background:${t.color};border:1px solid rgba(255,255,255,.2)"></div></td>
      <td><code style="font-size:11px;color:#a78bfa">${t.animation || '—'}</code></td>
      <td><div class="action-btns">
        <button class="btn-sm" onclick="openEditTitle('${t.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-danger" onclick="deleteTitle('${t.id}','${esc(t.name)}')"><i class="fa-solid fa-trash"></i></button>
      </div></td>
    </tr>`;
  }).join('') || `<tr class="empty-row"><td colspan="4">No titles yet</td></tr>`;
}

function openEditTitle(id) {
  const t = allTitles.find(x => x.id === id);
  if (!t) return;
  document.getElementById('editTitleId').value = id;
  document.getElementById('titleModalTitle').textContent = 'Edit Title';
  document.getElementById('titleName').value = t.name;
  document.getElementById('titleColor').value = t.color || '#a78bfa';
  document.getElementById('titleGlow').value = t.glow_color || '#6366f1';
  document.getElementById('titleGradFrom').value = t.gradient_from || '#6366f1';
  document.getElementById('titleGradTo').value = t.gradient_to || '#a78bfa';
  document.getElementById('titleAnim').value = t.animation || '';
  openModal('titleModal');
}

async function saveTitle() {
  const id = document.getElementById('editTitleId').value;
  const payload = {
    name: document.getElementById('titleName').value.trim(),
    color: document.getElementById('titleColor').value,
    glow_color: document.getElementById('titleGlow').value,
    gradient_from: document.getElementById('titleGradFrom').value,
    gradient_to: document.getElementById('titleGradTo').value,
    animation: document.getElementById('titleAnim').value || null,
  };
  if (!payload.name) { toast('Title name required', true); return; }
  if (id) {
    await sb.from('titles').update(payload).eq('id', id);
  } else {
    await sb.from('titles').insert(payload);
  }
  toast(id ? 'Title updated!' : 'Title created!');
  closeModal('titleModal');
  document.getElementById('editTitleId').value = '';
  document.getElementById('titleModalTitle').textContent = 'New Title';
  await loadAllTitles();
  loadTitlesTable();
}

async function deleteTitle(id, name) {
  if (!confirm(`Delete title "${name}"?`)) return;
  await sb.from('titles').delete().eq('id', id);
  toast('Title deleted');
  await loadAllTitles();
  loadTitlesTable();
}

// ── MESSAGES ──────────────────────────────────────────────
async function loadMessages() {
  const { data } = await sb.from('team_messages').select('*, sender:users(name,username,avatar_url)').order('created_at', { ascending: false }).limit(50);
  const msgs = data || [];
  const body = document.getElementById('msgsTableBody');
  body.innerHTML = msgs.length
    ? msgs.map(m => `<tr>
        <td><div class="user-cell">
          <div class="user-avatar-sm" style="background:${avatarColor(m.sender?.name)};font-size:11px">
            ${m.sender?.avatar_url ? `<img src="${m.sender.avatar_url}"/>` : (m.sender?.name||'?')[0]}
          </div>
          ${esc(m.sender?.name||m.sender?.username||'?')}
        </div></td>
        <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.content||'[media]')}</td>
        <td><code style="font-size:11px;color:#a78bfa">${m.type||'text'}</code></td>
        <td style="color:var(--muted);font-size:12px">${timeAgo(m.created_at)}</td>
        <td><button class="btn-danger" onclick="deleteMessage('${m.id}')"><i class="fa-solid fa-trash"></i></button></td>
      </tr>`).join('')
    : `<tr class="empty-row"><td colspan="5">No messages yet</td></tr>`;
}

async function deleteMessage(id) {
  if (!confirm('Delete this message?')) return;
  await sb.from('team_messages').delete().eq('id', id);
  toast('Message deleted');
  loadMessages();
}

// ── SUBMISSIONS ───────────────────────────────────────────
async function loadSubmissions() {
  const { data } = await sb.from('tasks').select('*, user:users(name,username,points)').eq('status', 'submitted').order('updated_at', { ascending: false });
  const subs = data || [];
  const body = document.getElementById('submissionsBody');
  body.innerHTML = subs.length
    ? subs.map(t => `<tr>
        <td>${esc(t.user?.name||t.user?.username||'?')}</td>
        <td style="font-weight:600">${esc(t.title)}</td>
        <td><span class="points-badge"><i class="fa-solid fa-star"></i> ${t.points||0}</span></td>
        <td><span style="color:#6366f1;font-weight:700;font-size:12px">Submitted</span></td>
        <td><div class="action-btns">
          <button class="btn-success" onclick="approveTask('${t.id}','${t.user_id}',${t.points||0})"><i class="fa-solid fa-check"></i> Approve</button>
          <button class="btn-danger" onclick="rejectTask('${t.id}')"><i class="fa-solid fa-xmark"></i> Reject</button>
        </div></td>
      </tr>`).join('')
    : `<tr class="empty-row"><td colspan="5">No pending submissions</td></tr>`;
}

async function rejectTask(id) {
  await sb.from('tasks').update({ status: 'rejected' }).eq('id', id);
  toast('Task rejected');
  loadSubmissions();
}

// ── DELETE REQUESTS ───────────────────────────────────────
async function loadDeletions() {
  const { data } = await sb.from('delete_requests').select('*, user:users(name,username)').order('created_at', { ascending: false });
  const reqs = data || [];
  const body = document.getElementById('deletionsBody');
  body.innerHTML = reqs.length
    ? reqs.map(r => `<tr>
        <td>${esc(r.user?.name||r.user?.username||'?')}</td>
        <td style="color:var(--muted)">${esc(r.reason||'No reason given')}</td>
        <td style="color:var(--muted);font-size:12px">${timeAgo(r.created_at)}</td>
        <td><span style="color:${r.status==='pending'?'#f59e0b':r.status==='approved'?'#22c55e':'#ef4444'};font-weight:700;font-size:12px;text-transform:capitalize">${r.status}</span></td>
        <td><div class="action-btns">
          ${r.status === 'pending' ? `
            <button class="btn-success" onclick="handleDeleteReq('${r.id}','${r.user_id}','approved')"><i class="fa-solid fa-check"></i></button>
            <button class="btn-danger" onclick="handleDeleteReq('${r.id}','${r.user_id}','rejected')"><i class="fa-solid fa-xmark"></i></button>
          ` : '—'}
        </div></td>
      </tr>`).join('')
    : `<tr class="empty-row"><td colspan="5">No delete requests</td></tr>`;
}

async function handleDeleteReq(reqId, userId, action) {
  await sb.from('delete_requests').update({ status: action }).eq('id', reqId);
  if (action === 'approved') {
    if (!confirm('This will delete the user account. Confirm?')) return;
    await sb.from('users').delete().eq('id', userId);
    toast('User account deleted');
  } else {
    toast('Request rejected');
  }
  await loadAllUsers();
  loadDeletions();
}

// ── NOTIFICATIONS ─────────────────────────────────────────
function populateNotifTargets() {
  const sel = document.getElementById('notifTarget');
  sel.innerHTML = '<option value="all">All Users</option>' +
    allUsers.map(u => `<option value="${u.id}">${esc(u.name||u.username||u.id)}</option>`).join('');
}

async function sendNotification() {
  const target = document.getElementById('notifTarget').value;
  const title  = document.getElementById('notifTitle').value.trim();
  const body   = document.getElementById('notifBody').value.trim();
  if (!title || !body) { toast('Title and message required', true); return; }

  const notifs = target === 'all'
    ? allUsers.map(u => ({ user_id: u.id, title, body }))
    : [{ user_id: target, title, body }];

  const { error } = await sb.from('notifications').insert(notifs);
  if (error) { toast('Error: ' + error.message, true); return; }

  toast(`Notification sent to ${target === 'all' ? 'all ' + allUsers.length + ' users' : '1 user'}!`);
  document.getElementById('notifTitle').value = '';
  document.getElementById('notifBody').value = '';
}

// ── HELPERS ───────────────────────────────────────────────
function populateUserSelect(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  sel.innerHTML = '<option value="">Select user...</option>' +
    allUsers.map(u => `<option value="${u.id}">${esc(u.name||u.username||u.id)}</option>`).join('');
}

function populateTitleSelect(selId, currentId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  sel.innerHTML = '<option value="">No Title</option>' +
    allTitles.map(t => `<option value="${t.id}" ${t.id === currentId ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.add('hidden'); });
});

// Open task modal - reset
document.querySelector('[onclick="openModal(\'taskModal\')"]')?.addEventListener('click', () => {
  document.getElementById('editTaskId').value = '';
  document.getElementById('taskModalTitle').textContent = 'New Task';
  document.getElementById('taskTitle').value = '';
  document.getElementById('taskBody').value = '';
  document.getElementById('taskPoints').value = '';
  document.getElementById('taskStatus').value = 'pending';
  document.getElementById('taskLink').value = '';
  populateUserSelect('taskUser');
});

function toast(msg, isError = false) {
  const t = document.getElementById('adminToast');
  t.textContent = msg;
  t.style.borderColor = isError ? 'rgba(239,68,68,.3)' : 'rgba(99,102,241,.3)';
  t.style.color = isError ? '#ef4444' : '#a78bfa';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}
