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
    { date: lwStr, content: '想养一只小猫咪', member: '女儿', anonymous: false, likes: 3, status: 'pending', completedDate: '', completedNote: '', completedImage: '' },
    { date: lmStr, content: '希望爸爸少看手机多陪我玩', member: '儿子', anonymous: false, likes: 5, status: 'pending', completedDate: '', completedNote: '', completedImage: '' },
    { date: todayStr, content: '希望周末能睡到自然醒', member: '', anonymous: true, likes: 1, status: 'pending', completedDate: '', completedNote: '', completedImage: '' },
    { date: l2mStr, content: '想去海边露营', member: '妈妈', anonymous: false, likes: 4, status: 'completed', completedDate: lwStr, completedNote: '全家一起去了深圳西涌，超开心！', completedImage: '' },
    { date: l3mStr, content: '想要一辆新自行车', member: '儿子', anonymous: false, likes: 6, status: 'completed', completedDate: l2mStr, completedNote: '买了一辆蓝色山地车，每天骑车上学', completedImage: '' },
    { date: l4mStr, content: '想吃一顿海底捞', member: '爸爸', anonymous: false, likes: 2, status: 'completed', completedDate: l3mStr, completedNote: '全家人周末一起去吃了，番茄锅底yyds！', completedImage: '' },
  ];
}

/* ---------- 加载/保存 ---------- */
function loadGrowthData() {
  try {
    const rawC = localStorage.getItem(STORAGE_KEY_COMPLAINTS);
    if (rawC) {
      complaints = JSON.parse(rawC);
    } else {
      complaints = getDemoComplaints();
      saveComplaints();
    }
    const rawW = localStorage.getItem(STORAGE_KEY_WISHES);
    if (rawW) {
      wishes = JSON.parse(rawW);
    } else {
      wishes = getDemoWishes();
      saveWishes();
    }
  } catch (e) { console.warn('[成长互动] 读取数据失败', e); }
}

function saveComplaints() {
  try { localStorage.setItem(STORAGE_KEY_COMPLAINTS, JSON.stringify(complaints)); } catch (e) {}
}

function saveWishes() {
  try { localStorage.setItem(STORAGE_KEY_WISHES, JSON.stringify(wishes)); } catch (e) {}
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
  const pending = wishes.filter(w => w.status === 'pending');
  if (pending.length === 0) {
    document.getElementById('wishWeekContent').textContent = '暂无待完成心愿';
    document.getElementById('wishWeekMember').textContent = '';
    document.getElementById('wishWeekLikes').textContent = '';
    document.getElementById('wishWeekIcon').textContent = '💤';
    document.getElementById('wishWeekBadge').textContent = '无待选';
    return;
  }

  // 优先显示上次随机抽中的，否则随机选一个
  let picked = pending[Math.floor(Math.random() * pending.length)];
  try {
    const savedPick = localStorage.getItem('family_manager_week_wish_pick');
    if (savedPick) {
      const parsed = JSON.parse(savedPick);
      const found = pending.find(w => w.content === parsed.content && w.member === parsed.member && w.date === parsed.date);
      if (found) picked = found;
    }
  } catch (e) {}

  // 保存本周抽中
  try { localStorage.setItem('family_manager_week_wish_pick', JSON.stringify({ content: picked.content, member: picked.member, date: picked.date })); } catch (e) {}

  const memberDisplay = picked.anonymous ? '匿名' : (picked.member || '匿名');
  document.getElementById('wishWeekContent').textContent = picked.content;
  document.getElementById('wishWeekMember').textContent = '—— ' + memberDisplay;
  document.getElementById('wishWeekLikes').textContent = '❤️ ' + (picked.likes || 0) + ' 个点赞';
  document.getElementById('wishWeekIcon').textContent = '🎯';
  document.getElementById('wishWeekBadge').textContent = '本周心愿';
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
    else statusBadge = '<span class="badge bg-warning text-dark">待完成</span>';

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
    const memberDisplay = w.anonymous ? '匿名' : (w.member || '匿名');
    const imgHtml = w.completedImage
      ? `<img src="${w.completedImage}" style="width:100%;height:140px;object-fit:cover;border-radius:8px 8px 0 0;">`
      : `<div class="text-center py-4" style="background:linear-gradient(135deg,#e8f5e9,#c8e6c9);border-radius:8px 8px 0 0;height:140px;display:flex;align-items:center;justify-content:center;">
          <i class="bi bi-star-fill fs-1" style="color:#ff9800;"></i>
        </div>`;
    return `<div class="col-lg-3 col-md-4 col-sm-6">
      <div class="card border-0 shadow-sm h-100">
        ${imgHtml}
        <div class="card-body py-2 small">
          <div class="fw-bold">${escapeHtmlG(w.content)}</div>
          <div class="text-muted">${memberDisplay} · ${escapeHtmlG(w.completedDate)}</div>
          ${w.completedNote ? '<div class="text-muted mt-1" style="font-size:0.75rem;">' + escapeHtmlG(w.completedNote) + '</div>' : ''}
        </div>
      </div>
    </div>`;
  });
  wall.innerHTML = cards.join('');
}

function likeWish(idx) {
  wishes[idx].likes = (wishes[idx].likes || 0) + 1;
  saveWishes();
  renderWishList();
  renderWishStats();
}

function deleteWish(idx) {
  if (!confirm('确定删除这个心愿吗？')) return;
  wishes.splice(idx, 1);
  saveWishes();
  renderAllGrowth();
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

    wishes.push({
      date: new Date().toISOString().substring(0, 10),
      content, member,
      anonymous,
      likes: 0,
      status: 'pending',
      completedDate: '', completedNote: '', completedImage: ''
    });
    saveWishes();
    renderAllGrowth();

    document.getElementById('wishContent').value = '';
    document.getElementById('wishMember').value = '';
    document.getElementById('wishAnonymous').checked = false;
  });

  // 随机抽取本周落地心愿
  document.getElementById('btnWishRandomPick').addEventListener('click', function() {
    const pending = wishes.filter(w => w.status === 'pending');
    if (pending.length === 0) { alert('没有待完成的心愿可以抽取哦！'); return; }
    // 清除缓存，重新随机
    try { localStorage.removeItem('family_manager_week_wish_pick'); } catch (e) {}
    renderWishWeekPick();
  });

  // 检查过期心愿
  document.getElementById('btnWishCheckExpired').addEventListener('click', checkExpiredWishes);

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
