/**
 * ============================================================
 *  模块：家庭真心话 · 破冰站 + 心愿储蓄罐
 *  功能：真心话记录、关键词统计、心愿管理、随机抽取、心愿完成墙
 * ============================================================
 */

const STORAGE_KEY_COMPLAINTS = 'family_manager_complaints';
const STORAGE_KEY_WISHES = 'family_manager_wishes';

/* ---------- 状态 ---------- */
let complaints = [];   // 真心话列表
let wishes = [];       // 心愿列表

/* ---------- 真心话示例数据 ---------- */
function getDemoComplaints() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const todayStr = y + '-' + m + '-' + d;
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().substring(0, 10);
  const lastWeek = new Date(today); lastWeek.setDate(lastWeek.getDate() - 7);
  const lwStr = lastWeek.toISOString().substring(0, 10);
  const twoWeeksAgo = new Date(today); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const twStr = twoWeeksAgo.toISOString().substring(0, 10);
  const threeWeeksAgo = new Date(today); threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
  const thwStr = threeWeeksAgo.toISOString().substring(0, 10);

  return [
    { date: thwStr, problem: '最近工作太忙，回家都没精力陪孩子玩', request: '希望周末能全家一起出去', member: '爸爸', anonymous: false, responded: true },
    { date: twStr, problem: '每天下班回家还要做饭洗碗，太累了', request: '希望家人能轮流洗碗', member: '妈妈', anonymous: false, responded: true },
    { date: lwStr, problem: '上次家长会你说我不够关心孩子学习', request: '希望能互相理解', member: '妈妈', anonymous: false, responded: false },
    { date: yStr, problem: '我觉得最近零花钱太少了', request: '希望每周能多给10块钱', member: '', anonymous: true, responded: false },
    { date: todayStr, problem: '我想跟爸爸妈妈道歉，上次不应该摔门', request: '', member: '', anonymous: true, responded: false },
  ];
}

/* ---------- 心愿示例数据 ---------- */
function getDemoWishes() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const todayStr = y + '-' + m + '-' + d;
  const lastWeek = new Date(today); lastWeek.setDate(lastWeek.getDate() - 7);
  const lwStr = lastWeek.toISOString().substring(0, 10);
  const lastMonth = new Date(today); lastMonth.setMonth(lastMonth.getMonth() - 1);
  const lmStr = lastMonth.toISOString().substring(0, 10);
  const last2m = new Date(today); last2m.setMonth(last2m.getMonth() - 2);
  const l2mStr = last2m.toISOString().substring(0, 10);
  const last3m = new Date(today); last3m.setMonth(last3m.getMonth() - 3);
  const l3mStr = last3m.toISOString().substring(0, 10);
  const last4m = new Date(today); last4m.setMonth(last4m.getMonth() - 4);
  const l4mStr = last4m.toISOString().substring(0, 10);

  return [
    { date: lwStr, content: '想养一只小猫咪', member: '女儿', anonymous: false, likes: 3, status: 'pending', completedDate: '', completedNote: '', completedImage: '', plantDraw: null },
    { date: lmStr, content: '希望爸爸少看手机多陪我玩', member: '儿子', anonymous: false, likes: 5, status: 'pending', completedDate: '', completedNote: '', completedImage: '', plantDraw: null },
    { date: todayStr, content: '想买一套乐高城市系列积木', member: '儿子', anonymous: false, likes: 4, status: 'pending', completedDate: '', completedNote: '', completedImage: '', plantDraw: null },
    { date: lwStr, content: '周末想去游乐园坐过山车', member: '儿子', anonymous: false, likes: 7, status: 'pending', completedDate: '', completedNote: '', completedImage: '', plantDraw: null },
    { date: lmStr, content: '希望能学会游泳', member: '儿子', anonymous: false, likes: 2, status: 'pending', completedDate: '', completedNote: '', completedImage: '', plantDraw: null },
    { date: todayStr, content: '希望周末能睡到自然醒', member: '', anonymous: true, likes: 1, status: 'pending', completedDate: '', completedNote: '', completedImage: '', plantDraw: null },
    { date: l2mStr, content: '想去海边露营', member: '妈妈', anonymous: false, likes: 4, status: 'completed', completedDate: lwStr, completedNote: '全家一起去了深圳西涌，超开心！', completedImage: '', plantDraw: null },
    { date: l3mStr, content: '想要一辆新自行车', member: '儿子', anonymous: false, likes: 6, status: 'completed', completedDate: l2mStr, completedNote: '买了一辆蓝色山地车，每天骑车上学', completedImage: '', plantDraw: null },
    { date: l4mStr, content: '想吃一顿海底捞', member: '爸爸', anonymous: false, likes: 2, status: 'completed', completedDate: l3mStr, completedNote: '全家人周末一起去吃了，番茄锅底yyds！', completedImage: '', plantDraw: null },
  ];
}

/** 儿子提出的心愿示例（与种植争霸「儿子」成员 m3 关联） */
function getSonDemoWishes() {
  return getDemoWishes().filter(w => w.member === '儿子');
}

function appendMissingSonDemoWishes() {
  if (typeof FamilyAuth !== 'undefined' && !FamilyAuth.shouldUseDemoData()) return;
  const hasSon = wishes.some(w => !w.anonymous && (w.member || '').trim() === '儿子');
  if (hasSon) return;
  getSonDemoWishes().forEach(w => {
    wishes.push(attachWishMeta({ ...w, plantMemberId: 'm3', plantDraw: w.plantDraw || null }));
  });
  saveWishes();
}

function loadWishDemoData() {
  if (wishes.length > 0) {
    if (!confirm('将加载完整示例心愿（含儿子、女儿、爸妈等），已有心愿数据将被替换。确定继续？')) return;
  }
  wishes = getDemoWishes().map(w => attachWishMeta({ ...w, plantMemberId: w.member === '儿子' ? 'm3' : resolvePlantMemberId(w.member, w.anonymous) }));
  saveWishes();
  renderAllGrowth();
  if (typeof renderAllPlanting === 'function') renderAllPlanting();
  alert('已加载示例心愿，其中儿子提出的心愿共 ' + getSonDemoWishes().length + ' 条。');
}

/* ---------- 加载/保存 ---------- */
function loadGrowthData() {
  const useDemo = typeof FamilyAuth === 'undefined' || FamilyAuth.shouldUseDemoData();
  try {
    const rawC = localStorage.getItem(STORAGE_KEY_COMPLAINTS);
    if (rawC) {
      complaints = JSON.parse(rawC);
    } else if (useDemo) {
      complaints = getDemoComplaints();
      saveComplaints();
    } else {
      complaints = [];
    }
    const rawW = localStorage.getItem(STORAGE_KEY_WISHES);
    if (rawW) {
      wishes = JSON.parse(rawW);
    } else if (useDemo) {
      wishes = getDemoWishes();
      saveWishes();
    } else {
      wishes = [];
    }
    ensureWishIds();
    appendMissingSonDemoWishes();
  } catch (e) { console.warn('[成长互动] 读取数据失败', e); }
}

function ensureWishIds() {
  wishes.forEach(w => {
    if (!w.id) w.id = 'w' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    if (w.plantDraw && !w.plantDraw.weekStart) w.plantDraw = null;
  });
}

function getPlantMembersFromStorage() {
  try {
    const raw = localStorage.getItem('family_manager_plant_members');
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function resolvePlantMemberId(memberName, anonymous) {
  if (anonymous || !memberName) return '';
  const members = getPlantMembersFromStorage();
  const found = members.find(m => m.name === memberName.trim());
  return found ? found.id : '';
}

function attachWishMeta(wish) {
  if (!wish.id) wish.id = 'w' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  wish.plantMemberId = resolvePlantMemberId(wish.member, wish.anonymous);
  if (!wish.plantDraw) wish.plantDraw = null;
  return wish;
}

function getPlantWeekMonday() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().substring(0, 10);
}

function readPlantWeekState() {
  try {
    const raw = localStorage.getItem('family_manager_plant_week');
    if (!raw) return { weekStart: getPlantWeekMonday(), draw: null };
    const data = JSON.parse(raw);
    return { weekStart: data.weekStart || getPlantWeekMonday(), draw: data.draw || null };
  } catch (_) {
    return { weekStart: getPlantWeekMonday(), draw: null };
  }
}

function findWishById(wishId) {
  return wishes.find(w => w.id === wishId) || null;
}

function getWishDrawnForPlantWeek(weekStart) {
  const w = wishes.find(x => x.plantDraw && x.plantDraw.weekStart === weekStart);
  if (w) return w;
  const state = readPlantWeekState();
  if (state.draw && state.draw.weekStart === weekStart && state.draw.wishId) {
    return findWishById(state.draw.wishId);
  }
  return null;
}

function deleteWishesForPlantMember(memberId, memberName) {
  const name = (memberName || '').trim();
  const removedIds = [];
  wishes = wishes.filter(w => {
    const byId = memberId && w.plantMemberId === memberId;
    const byName = name && !w.anonymous && (w.member || '').trim() === name;
    if (byId || byName) {
      removedIds.push(w.id);
      return false;
    }
    return true;
  });
  if (removedIds.length) {
    cleanupAfterWishRemoved(removedIds);
    saveWishes();
  }
  return removedIds.length;
}

function cleanupAfterWishRemoved(removedIds) {
  const idSet = new Set(removedIds);
  try {
    const raw = localStorage.getItem('family_manager_plant_week');
    if (raw) {
      const weekData = JSON.parse(raw);
      if (weekData.draw && idSet.has(weekData.draw.wishId)) {
        weekData.draw = null;
        localStorage.setItem('family_manager_plant_week', JSON.stringify(weekData));
      }
    }
  } catch (_) {}
  try {
    const raw = localStorage.getItem('family_manager_claimed_wishes');
    if (raw) {
      let claimed = JSON.parse(raw);
      claimed = claimed.filter(c => !c.wishId || !idSet.has(c.wishId));
      localStorage.setItem('family_manager_claimed_wishes', JSON.stringify(claimed));
    }
  } catch (_) {}
  try { localStorage.removeItem('family_manager_week_wish_pick'); } catch (_) {}
}

function assignWishPlantDraw(wishId, drawInfo) {
  const wish = findWishById(wishId);
  if (!wish) return null;
  wish.plantDraw = {
    weekStart: drawInfo.weekStart,
    bestMemberId: drawInfo.bestMemberId,
    bestMemberName: drawInfo.bestMemberName,
    drawnAt: drawInfo.drawnAt || new Date().toISOString().substring(0, 10)
  };
  saveWishes();
  return wish;
}

function drawWishForBestGrower(bestMember, weekStart) {
  ensureWishIds();
  const pool = wishes.filter(w => w.status === 'pending' && !(w.plantDraw && w.plantDraw.weekStart === weekStart));
  if (pool.length === 0) return null;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  assignWishPlantDraw(picked.id, {
    weekStart,
    bestMemberId: bestMember.id,
    bestMemberName: bestMember.name
  });
  try {
    const raw = localStorage.getItem('family_manager_plant_week');
    const weekData = raw ? JSON.parse(raw) : { weekStart, careCounts: {} };
    weekData.draw = {
      weekStart,
      wishId: picked.id,
      bestMemberId: bestMember.id,
      bestMemberName: bestMember.name,
      drawnAt: new Date().toISOString().substring(0, 10)
    };
    localStorage.setItem('family_manager_plant_week', JSON.stringify(weekData));
    if (typeof FamilySync !== 'undefined') FamilySync.notifyDataChanged();
  } catch (_) {}
  return picked;
}

/** 种植争霸模块调用的统一心愿接口 */
window.WishJar = {
  getWishes() {
    ensureWishIds();
    return wishes;
  },
  reloadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_WISHES);
      if (raw) wishes = JSON.parse(raw);
      ensureWishIds();
    } catch (_) {}
    return wishes;
  },
  save: saveWishes,
  findById: findWishById,
  deleteByPlantMember: deleteWishesForPlantMember,
  drawForBestGrower: drawWishForBestGrower,
  getDrawnForWeek: getWishDrawnForPlantWeek,
  getWeekMonday: getPlantWeekMonday,
  readPlantWeekState,
  renderGrowth: function () {
    if (typeof renderAllGrowth === 'function') renderAllGrowth();
  }
};

function saveComplaints() {
  try {
    localStorage.setItem(STORAGE_KEY_COMPLAINTS, JSON.stringify(complaints));
    if (typeof FamilySync !== 'undefined') FamilySync.notifyDataChanged();
  } catch (e) {}
}

function saveWishes() {
  try {
    localStorage.setItem(STORAGE_KEY_WISHES, JSON.stringify(wishes));
    if (typeof FamilySync !== 'undefined') FamilySync.notifyDataChanged();
  } catch (e) {}
}

/* ---------- 工具函数 ---------- */
function escapeHtmlG(str) {
  if (!str && str !== 0) return '';
  const s = String(str);
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

/* ============================================================
 *  真心话 · 破冰站
 * ============================================================ */
function renderComplaintRank() {
  const tbody = document.getElementById('cpRankBody');
  // 提取关键词（取真心话前6个字作为关键词）
  const keywordMap = {};
  complaints.forEach(c => {
    const keyword = c.problem.length > 6 ? c.problem.substring(0, 6) + '...' : c.problem;
    if (!keywordMap[keyword]) {
      keywordMap[keyword] = { problem: c.problem, request: c.request, member: c.anonymous ? '匿名' : (c.member || '匿名'), count: 0, responded: c.responded };
    }
    keywordMap[keyword].count++;
  });

  const entries = Object.entries(keywordMap).sort((a, b) => b[1].count - a[1].count);
  document.getElementById('cpTotalCount').textContent = complaints.length + '条';

  if (entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">还没有真心话，做第一个勇敢的人吧</td></tr>';
    return;
  }

  const rows = entries.map(([keyword, data], i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
    const statusBadge = data.responded
      ? '<span class="badge bg-success">已回应</span>'
      : '<span class="badge bg-warning text-dark">待回应</span>';
    return `<tr>
      <td>${medal}</td>
      <td title="${escapeHtmlG(data.problem)}">${escapeHtmlG(keyword)}</td>
      <td>${escapeHtmlG(data.request || '-')}</td>
      <td>${escapeHtmlG(data.member)}</td>
      <td>${data.count}</td>
      <td>${statusBadge}</td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('');
}

function renderComplaintList() {
  const tbody = document.getElementById('cpListBody');
  document.getElementById('cpTotalCount').textContent = complaints.length + '条';

  if (complaints.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">暂无记录</td></tr>';
    return;
  }

  const rows = complaints.map((c, idx) => {
    const memberDisplay = c.anonymous ? '匿名' : (c.member || '匿名');
    const statusBadge = c.responded
      ? '<span class="badge bg-success">已回应</span>'
      : '<button class="btn btn-outline-success btn-sm py-0 px-1" onclick="respondComplaint(' + idx + ')" title="标记已回应"><i class="bi bi-chat-heart"></i></button>';
    return `<tr>
      <td>${escapeHtmlG(c.date)}</td>
      <td>${escapeHtmlG(c.problem)}</td>
      <td>${escapeHtmlG(c.request || '-')}</td>
      <td>${escapeHtmlG(memberDisplay)}</td>
      <td>${statusBadge}</td>
      <td>
        <button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="deleteComplaint(${idx})" title="删除">
          <i class="bi bi-trash3"></i>
        </button>
      </td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('');
}

function respondComplaint(idx) {
  complaints[idx].responded = true;
  saveComplaints();
  renderAllGrowth();
}

function deleteComplaint(idx) {
  if (!confirm('确定删除这条真心话吗？')) return;
  complaints.splice(idx, 1);
  saveComplaints();
  renderAllGrowth();
}

/* ============================================================
 *  心愿储蓄罐
 * ============================================================ */
function renderWishStats() {
  const pending = wishes.filter(w => w.status === 'pending');
  const done = wishes.filter(w => w.status === 'completed');
  const expired = wishes.filter(w => w.status === 'expired');
  const totalLikes = wishes.reduce((sum, w) => sum + (w.likes || 0), 0);

  document.getElementById('wishTotalCount').textContent = wishes.length;
  document.getElementById('wishDoneCount').textContent = done.length;
  document.getElementById('wishLikeCount').textContent = totalLikes;
  document.getElementById('wishExpiredCount').textContent = expired.length;
}

function renderWishWeekPick() {
  const weekStart = getPlantWeekMonday();
  const drawn = getWishDrawnForPlantWeek(weekStart);

  if (drawn) {
    const memberDisplay = drawn.anonymous ? '匿名' : (drawn.member || '匿名');
    const grower = drawn.plantDraw?.bestMemberName || '最佳种植者';
    document.getElementById('wishWeekContent').textContent = drawn.content;
    document.getElementById('wishWeekMember').textContent = '提出：' + memberDisplay + ' · 由「' + grower + '」抽取';
    document.getElementById('wishWeekLikes').textContent = '❤️ ' + (drawn.likes || 0) + ' 个点赞';
    document.getElementById('wishWeekIcon').textContent = '🌿';
    document.getElementById('wishWeekBadge').textContent = '种植争霸已关联';
    return;
  }

  const pending = wishes.filter(w => w.status === 'pending' && !(w.plantDraw && w.plantDraw.weekStart === weekStart));
  if (pending.length === 0) {
    document.getElementById('wishWeekContent').textContent = '暂无待抽取心愿';
    document.getElementById('wishWeekMember').textContent = '';
    document.getElementById('wishWeekLikes').textContent = '';
    document.getElementById('wishWeekIcon').textContent = '💤';
    document.getElementById('wishWeekBadge').textContent = '无待选';
    return;
  }

  document.getElementById('wishWeekContent').textContent = '待阳台种植争霸抽取';
  document.getElementById('wishWeekMember').textContent = '本周共 ' + pending.length + ' 个心愿待选';
  document.getElementById('wishWeekLikes').textContent = '请最佳种植者前往种植区抽取';
  document.getElementById('wishWeekIcon').textContent = '🎯';
  document.getElementById('wishWeekBadge').textContent = '待抽取';
}

function renderWishList() {
  const tbody = document.getElementById('wishListBody');

  if (wishes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">心愿罐还是空的，快来放入第一个心愿吧</td></tr>';
    return;
  }

  const rows = wishes.map((w, idx) => {
    const memberDisplay = w.anonymous ? '匿名' : (w.member || '匿名');
    let statusBadge = '';
    if (w.status === 'completed') statusBadge = '<span class="badge bg-success">已完成</span>';
    else if (w.status === 'expired') statusBadge = '<span class="badge bg-danger">已过期</span>';
    else if (w.plantDraw && w.plantDraw.weekStart === getPlantWeekMonday()) {
      statusBadge = '<span class="badge bg-info text-dark" title="已由' + escapeHtmlG(w.plantDraw.bestMemberName || '最佳种植者') + '抽取">种植已抽取</span>';
    } else statusBadge = '<span class="badge bg-warning text-dark">待完成</span>';

    const actionBtns = [];
    if (w.status === 'pending') {
      actionBtns.push('<button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="likeWish(' + idx + ')" title="点赞"><i class="bi bi-heart"></i> ' + (w.likes || 0) + '</button>');
      actionBtns.push('<button class="btn btn-outline-success btn-sm py-0 px-1 ms-1" onclick="openCompleteWish(' + idx + ')" title="标记完成"><i class="bi bi-check-lg"></i></button>');
    }
    actionBtns.push('<button class="btn btn-outline-danger btn-sm py-0 px-1 ms-1" onclick="deleteWish(' + idx + ')" title="删除"><i class="bi bi-trash3"></i></button>');

    return `<tr>
      <td>${escapeHtmlG(w.date)}</td>
      <td>${escapeHtmlG(w.content)}</td>
      <td>${escapeHtmlG(memberDisplay)}</td>
      <td>❤️ ${w.likes || 0}</td>
      <td>${statusBadge}</td>
      <td>${actionBtns.join('')}</td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('');
}

function renderCompletedWishWall() {
  const wall = document.getElementById('completedWishWall');
  const badge = document.getElementById('completedWishCountBadge');
  const completed = wishes.filter(w => w.status === 'completed');

  badge.textContent = completed.length;

  if (completed.length === 0) {
    wall.innerHTML = `<div class="col-12 text-center text-muted py-4">
      <i class="bi bi-camera fs-1 d-block mb-2"></i>
      还没有已完成的心愿记录<br>
      <small>在心愿列表中点击"完成"并上传照片来记录美好瞬间</small>
    </div>`;
    return;
  }

  const cards = completed.map(w => {
    const idx = wishes.findIndex(x => x === w);
    const memberDisplay = w.anonymous ? '匿名' : (w.member || '匿名');
    const notePreview = w.completedNote
      ? escapeHtmlG(w.completedNote.length > 36 ? w.completedNote.substring(0, 36) + '…' : w.completedNote)
      : '';
    const imgHtml = w.completedImage
      ? `<img src="${w.completedImage}" alt="" class="wish-wall-thumb">`
      : `<div class="wish-wall-thumb-placeholder">
          <i class="bi bi-star-fill fs-1" style="color:#ff9800;"></i>
        </div>`;
    return `<div class="col-lg-3 col-md-4 col-sm-6">
      <div class="card border-0 shadow-sm h-100 wish-wall-card" role="button" tabindex="0"
           data-wish-idx="${idx}" onclick="openCompletedWishDetail(${idx})"
           onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openCompletedWishDetail(${idx});}">
        ${imgHtml}
        <div class="card-body py-2 small">
          <div class="fw-bold text-truncate">${escapeHtmlG(w.content)}</div>
          <div class="text-muted">${escapeHtmlG(memberDisplay)} · ${escapeHtmlG(w.completedDate)}</div>
          ${notePreview ? '<div class="text-muted mt-1 wish-wall-note-preview">' + notePreview + '</div>' : ''}
          <div class="text-success mt-2" style="font-size:0.7rem;"><i class="bi bi-zoom-in me-1"></i>点击查看详情</div>
        </div>
      </div>
    </div>`;
  });
  wall.innerHTML = cards.join('');
}

function openCompletedWishDetail(idx) {
  const w = wishes[idx];
  if (!w || w.status !== 'completed') return;

  const memberDisplay = w.anonymous ? '匿名' : (w.member || '匿名');
  document.getElementById('viewWishContent').textContent = w.content;
  document.getElementById('viewWishMember').textContent = '提出者：' + memberDisplay;
  document.getElementById('viewWishDate').textContent = '完成于 ' + (w.completedDate || '—');
  document.getElementById('viewWishLikes').textContent = '❤️ ' + (w.likes || 0) + ' 赞';
  document.getElementById('viewWishProposed').textContent = '提出日期：' + (w.date || '—');

  const noteBox = document.getElementById('viewWishNoteBox');
  const noteEl = document.getElementById('viewWishNote');
  if (w.completedNote && w.completedNote.trim()) {
    noteBox.style.display = 'block';
    noteEl.textContent = w.completedNote;
  } else {
    noteBox.style.display = 'none';
    noteEl.textContent = '';
  }

  const img = document.getElementById('viewWishImage');
  const placeholder = document.getElementById('viewWishImagePlaceholder');
  if (w.completedImage) {
    img.src = w.completedImage;
    img.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    img.src = '';
    img.style.display = 'none';
    placeholder.style.display = 'flex';
  }

  bootstrap.Modal.getOrCreateInstance(document.getElementById('modalViewCompletedWish')).show();
}

function likeWish(idx) {
  wishes[idx].likes = (wishes[idx].likes || 0) + 1;
  saveWishes();
  renderWishList();
  renderWishStats();
}

function deleteWish(idx) {
  if (!confirm('确定删除这个心愿吗？')) return;
  const removed = wishes[idx];
  wishes.splice(idx, 1);
  if (removed && removed.id) cleanupAfterWishRemoved([removed.id]);
  saveWishes();
  renderAllGrowth();
  if (typeof renderAllPlanting === 'function') renderAllPlanting();
}

function checkExpiredWishes() {
  const now = new Date();
  let expiredCount = 0;
  wishes.forEach(w => {
    if (w.status === 'pending') {
      const created = new Date(w.date);
      const diffMonths = (now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth());
      if (diffMonths >= 3) {
        w.status = 'expired';
        expiredCount++;
      }
    }
  });
  if (expiredCount > 0) {
    saveWishes();
    renderAllGrowth();
    alert('已标记 ' + expiredCount + ' 个超过3个月未完成的心愿为"已过期"。');
  } else {
    alert('✅ 没有超过3个月未完成的心愿，太棒了！');
  }
}

/* ---------- 完成心愿弹窗 ---------- */
let currentCompleteWishIdx = -1;
let wishCompleteImage = '';

function openCompleteWish(idx) {
  currentCompleteWishIdx = idx;
  const w = wishes[idx];
  document.getElementById('modalCompleteWishContent').textContent = w.content;
  document.getElementById('modalCompleteWishDate').value = new Date().toISOString().substring(0, 10);
  document.getElementById('modalCompleteWishNote').value = '';
  wishCompleteImage = '';
  document.getElementById('wishUploadPlaceholder').style.display = 'block';
  document.getElementById('wishImagePreview').style.display = 'none';
  document.getElementById('wishImagePreviewImg').src = '';

  const modal = new bootstrap.Modal(document.getElementById('modalCompleteWish'));
  modal.show();
}

function bindWishModalEvents() {
  // 上传图片
  const uploadArea = document.getElementById('wishUploadPlaceholder');
  const fileInput = document.getElementById('wishImageInput');
  const preview = document.getElementById('wishImagePreview');
  const previewImg = document.getElementById('wishImagePreviewImg');
  const placeholder = document.getElementById('wishUploadPlaceholder');

  if (uploadArea) {
    uploadArea.addEventListener('click', function() { fileInput.click(); });
  }

  if (fileInput) {
    fileInput.addEventListener('change', function() {
      const file = this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        wishCompleteImage = e.target.result;
        previewImg.src = wishCompleteImage;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
      };
      reader.readAsDataURL(file);
    });
  }

  document.getElementById('btnRemoveWishImage').addEventListener('click', function() {
    wishCompleteImage = '';
    preview.style.display = 'none';
    placeholder.style.display = 'block';
    fileInput.value = '';
  });

  document.getElementById('btnConfirmCompleteWish').addEventListener('click', function() {
    const completedDate = document.getElementById('modalCompleteWishDate').value;
    const completedNote = document.getElementById('modalCompleteWishNote').value.trim();

    if (!completedDate) { alert('请选择完成日期'); return; }

    wishes[currentCompleteWishIdx].status = 'completed';
    wishes[currentCompleteWishIdx].completedDate = completedDate;
    wishes[currentCompleteWishIdx].completedNote = completedNote;
    wishes[currentCompleteWishIdx].completedImage = wishCompleteImage;
    saveWishes();
    renderAllGrowth();

    const modal = bootstrap.Modal.getInstance(document.getElementById('modalCompleteWish'));
    modal.hide();
    alert('🎉 心愿完成！已记录到心愿墙。');
  });
}

/* ---------- 汇总渲染 ---------- */
function renderAllGrowth() {
  renderComplaintRank();
  renderComplaintList();
  renderWishStats();
  renderWishWeekPick();
  renderWishList();
  renderCompletedWishWall();
}

/* ---------- 事件绑定 ---------- */
function bindGrowthEvents() {
  // 添加真心话
  document.getElementById('formComplaintAdd').addEventListener('submit', function(e) {
    e.preventDefault();
    const problem = document.getElementById('cpProblem').value.trim();
    const request = document.getElementById('cpRequest').value.trim();
    const member = document.getElementById('cpMember').value.trim();
    const anonymous = document.getElementById('cpAnonymous').checked;

    if (!problem) { alert('请写下你想说的真心话！'); return; }

    complaints.push({
      date: new Date().toISOString().substring(0, 10),
      problem, request,
      member: member || '',
      anonymous,
      responded: false
    });
    saveComplaints();
    renderAllGrowth();

    document.getElementById('cpProblem').value = '';
    document.getElementById('cpRequest').value = '';
    document.getElementById('cpMember').value = '';
    document.getElementById('cpAnonymous').checked = false;
  });

  // 添加心愿
  document.getElementById('formWishAdd').addEventListener('submit', function(e) {
    e.preventDefault();
    const content = document.getElementById('wishContent').value.trim();
    const member = document.getElementById('wishMember').value.trim();
    const anonymous = document.getElementById('wishAnonymous').checked;

    if (!content) { alert('请填写心愿内容！'); return; }
    if (!member) { alert('请填写提出家庭成员！'); return; }

    wishes.push(attachWishMeta({
      date: new Date().toISOString().substring(0, 10),
      content, member,
      anonymous,
      likes: 0,
      status: 'pending',
      completedDate: '', completedNote: '', completedImage: '',
      plantDraw: null
    }));
    saveWishes();
    renderAllGrowth();

    document.getElementById('wishContent').value = '';
    document.getElementById('wishMember').value = '';
    document.getElementById('wishAnonymous').checked = false;
  });

  // 刷新本周落地心愿（与种植争霸抽取结果同步）
  document.getElementById('btnWishRandomPick').addEventListener('click', function() {
    const drawn = getWishDrawnForPlantWeek(getPlantWeekMonday());
    if (drawn) {
      renderWishWeekPick();
      alert('本周心愿已由「' + (drawn.plantDraw?.bestMemberName || '最佳种植者') + '」在种植争霸中抽取：\n' + drawn.content);
      return;
    }
    alert('本周尚未抽取心愿。\n请前往「阳台种植争霸赛」，由本周最佳种植者点击「为最佳种植者抽取心愿」。');
  });

  // 检查过期心愿
  document.getElementById('btnWishCheckExpired').addEventListener('click', checkExpiredWishes);

  document.getElementById('btnWishDemo')?.addEventListener('click', loadWishDemoData);

  // 完成心愿弹窗事件
  bindWishModalEvents();
}

/* ---------- 初始化 ---------- */
function initGrowthModule() {
  console.log('[成长互动] 模块初始化');
  loadGrowthData();
  bindGrowthEvents();
  renderAllGrowth();
}
