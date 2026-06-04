/**
 * ============================================================
 *  模块：阳台种植争霸赛（桌宠版）
 *  功能：家庭成员管理、种植物、自动生长、照料互动、
 *        排行榜、最佳种植者抽取心愿
 * ============================================================
 */

const STORAGE_KEY_PLANT_MEMBERS = 'family_manager_plant_members';
const STORAGE_KEY_PLANTS = 'family_manager_plants';
const STORAGE_KEY_PLANT_WEEK = 'family_manager_plant_week';

/* ---------- 状态 ---------- */
let plantMembers = [];    // 参赛家庭成员
let plants = [];          // 植物列表
let plantWeekStart = null; // 本周起始日期
let plantWeekCareCounts = {}; // 本周照料计数 {memberId: count}
let plantWeekDraw = null; // 本周心愿抽取 { weekStart, wishId, bestMemberId, bestMemberName, drawnAt }

/* ---------- 成长阶段 ---------- */
const GROWTH_STAGES = [
  { min: 0,   max: 9,   name: '种子',     icon: '🌱', color: '#8d6e63' },
  { min: 10,  max: 24,  name: '发芽',     icon: '🌿', color: '#66bb6a' },
  { min: 25,  max: 49,  name: '幼苗',     icon: '🪴', color: '#43a047' },
  { min: 50,  max: 79,  name: '成株',     icon: '🌳', color: '#2e7d32' },
  { min: 80,  max: 109, name: '开花',     icon: '🌸', color: '#e91e63' },
  { min: 110, max: 999, name: '结果',     icon: '🍎', color: '#f44336' },
];

const CARE_ACTIONS = [
  { id: 'water', label: '💧 浇水', growthBonus: 3 },
  { id: 'fertilize', label: '🧪 施肥', growthBonus: 5 },
  { id: 'sunshine', label: '☀️ 晒太阳', growthBonus: 2 },
  { id: 'prune', label: '✂️ 修剪', growthBonus: 4 },
];

/* ---------- 示例数据 ---------- */
function getDemoPlantMembers() {
  return [
    { id: 'm1', name: '爸爸', avatar: '👨' },
    { id: 'm2', name: '妈妈', avatar: '👩' },
    { id: 'm3', name: '儿子', avatar: '👦' },
    { id: 'm4', name: '女儿', avatar: '👧' },
  ];
}

function getDemoPlants() {
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
  const oneHourAgo = new Date(today); oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  const ohStr = oneHourAgo.toISOString();
  const twoHoursAgo = new Date(today); twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);
  const thStr = twoHoursAgo.toISOString();
  const halfHourAgo = new Date(today); halfHourAgo.setMinutes(halfHourAgo.getMinutes() - 30);
  const hhStr = halfHourAgo.toISOString();

  return [
    { id: 'p1', memberId: 'm1', name: '小番茄', type: '蔬菜', plantDate: l2mStr, growth: 72, lastGrowthTime: today.toISOString(),
      lastWater: ohStr, lastFertilize: thStr, lastSunshine: '', lastPrune: '' },
    { id: 'p2', memberId: 'm2', name: '薄荷', type: '香草', plantDate: lmStr, growth: 35, lastGrowthTime: today.toISOString(),
      lastWater: hhStr, lastFertilize: '', lastSunshine: '', lastPrune: '' },
    { id: 'p3', memberId: 'm3', name: '向日葵', type: '观赏', plantDate: lwStr, growth: 8, lastGrowthTime: today.toISOString(),
      lastWater: '', lastFertilize: '', lastSunshine: '', lastPrune: '' },
    { id: 'p4', memberId: 'm4', name: '草莓', type: '水果', plantDate: lmStr, growth: 55, lastGrowthTime: today.toISOString(),
      lastWater: ohStr, lastFertilize: '', lastSunshine: hhStr, lastPrune: '' },
    { id: 'p5', memberId: 'm1', name: '辣椒', type: '蔬菜', plantDate: l2mStr, growth: 95, lastGrowthTime: today.toISOString(),
      lastWater: thStr, lastFertilize: ohStr, lastSunshine: '', lastPrune: hhStr },
    { id: 'p6', memberId: 'm2', name: '多肉', type: '观赏', plantDate: lwStr, growth: 12, lastGrowthTime: today.toISOString(),
      lastWater: '', lastFertilize: '', lastSunshine: hhStr, lastPrune: '' },
  ];
}

/* ---------- 加载/保存 ---------- */
function loadPlantData() {
  const useDemo = typeof FamilyAuth === 'undefined' || FamilyAuth.shouldUseDemoData();
  try {
    const rawM = localStorage.getItem(STORAGE_KEY_PLANT_MEMBERS);
    if (rawM) {
      plantMembers = JSON.parse(rawM);
    } else if (useDemo) {
      plantMembers = getDemoPlantMembers();
      savePlantMembers();
    } else {
      plantMembers = [];
    }
    const rawP = localStorage.getItem(STORAGE_KEY_PLANTS);
    if (rawP) {
      plants = JSON.parse(rawP);
      applyOfflineGrowth();
    } else if (useDemo) {
      plants = getDemoPlants();
      savePlants();
    } else {
      plants = [];
    }
    const rawW = localStorage.getItem(STORAGE_KEY_PLANT_WEEK);
    if (rawW) {
      const weekData = JSON.parse(rawW);
      plantWeekStart = weekData.weekStart;
      plantWeekCareCounts = weekData.careCounts || {};
      plantWeekDraw = weekData.draw || null;
    } else if (useDemo) {
      plantWeekStart = getWeekMonday();
      plantWeekCareCounts = { m1: 5, m2: 3, m4: 4, m3: 1 };
      plantWeekDraw = null;
      savePlantWeek();
    } else {
      plantWeekStart = getWeekMonday();
      plantWeekCareCounts = {};
      plantWeekDraw = null;
    }
    checkWeekReset();
    migrateLegacyPlantClaimed();
  } catch (e) { console.warn('[种植争霸] 读取数据失败', e); }
}

function savePlantMembers() {
  try {
    localStorage.setItem(STORAGE_KEY_PLANT_MEMBERS, JSON.stringify(plantMembers));
    if (typeof FamilySync !== 'undefined') FamilySync.notifyDataChanged();
  } catch (e) {}
}

function savePlants() {
  try {
    localStorage.setItem(STORAGE_KEY_PLANTS, JSON.stringify(plants));
    if (typeof FamilySync !== 'undefined') FamilySync.notifyDataChanged();
  } catch (e) {}
}

function savePlantWeek() {
  try {
    localStorage.setItem(STORAGE_KEY_PLANT_WEEK, JSON.stringify({
      weekStart: plantWeekStart,
      careCounts: plantWeekCareCounts,
      draw: plantWeekDraw
    }));
    if (typeof FamilySync !== 'undefined') FamilySync.notifyDataChanged();
  } catch (e) {}
}

/** 迁移旧版「按成员ID标记已抽取」到 wishId 关联 */
function migrateLegacyPlantClaimed() {
  if (plantWeekDraw && plantWeekDraw.wishId) return;
  try {
    const claimedKey = 'family_manager_plant_claimed_' + plantWeekStart;
    const legacyMemberId = localStorage.getItem(claimedKey);
    if (!legacyMemberId || typeof WishJar === 'undefined') return;
    const drawn = WishJar.getDrawnForWeek(plantWeekStart);
    if (drawn) {
      plantWeekDraw = {
        weekStart: plantWeekStart,
        wishId: drawn.id,
        bestMemberId: drawn.plantDraw?.bestMemberId || legacyMemberId,
        bestMemberName: drawn.plantDraw?.bestMemberName || '',
        drawnAt: drawn.plantDraw?.drawnAt || ''
      };
      savePlantWeek();
      localStorage.removeItem(claimedKey);
    }
  } catch (_) {}
}

/* ---------- 离线增长 ---------- */
function applyOfflineGrowth() {
  const now = new Date();
  plants.forEach(plant => {
    if (!plant.lastGrowthTime) {
      plant.lastGrowthTime = now.toISOString();
      plant.growth = plant.growth || 0;
      return;
    }
    const lastTime = new Date(plant.lastGrowthTime);
    const hoursPassed = Math.floor((now.getTime() - lastTime.getTime()) / (1000 * 60 * 60));
    if (hoursPassed > 0) {
      plant.growth = (plant.growth || 0) + hoursPassed;
      plant.lastGrowthTime = now.toISOString();
    }
  });
  savePlants();
}

/* ---------- 本周重置 ---------- */
function getWeekMonday() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().substring(0, 10);
}

function checkWeekReset() {
  const thisMonday = getWeekMonday();
  if (plantWeekStart !== thisMonday) {
    plantWeekStart = thisMonday;
    plantWeekCareCounts = {};
    plantWeekDraw = null;
    savePlantWeek();
  }
}

/* ---------- 工具函数 ---------- */
function escapeHtmlP(str) {
  if (!str && str !== 0) return '';
  const s = String(str);
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function getGrowthStage(growth) {
  for (let i = GROWTH_STAGES.length - 1; i >= 0; i--) {
    if (growth >= GROWTH_STAGES[i].min) return GROWTH_STAGES[i];
  }
  return GROWTH_STAGES[0];
}

function getMemberById(id) {
  return plantMembers.find(m => m.id === id);
}

function canCare(plant, careType) {
  const lastField = 'last' + careType.charAt(0).toUpperCase() + careType.slice(1);
  const lastTime = plant[lastField];
  if (!lastTime) return true;
  const elapsed = Date.now() - new Date(lastTime).getTime();
  return elapsed >= 60 * 60 * 1000; // 1小时冷却
}

/* ============================================================
 *  渲染
 * ============================================================ */

/* ---------- 成员列表 ---------- */
function renderPlantMembers() {
  const container = document.getElementById('plantMemberList');
  const select = document.getElementById('plantMemberId');
  const filterSelect = document.getElementById('plantFilterMember');

  if (plantMembers.length === 0) {
    container.innerHTML = '<div class="text-center text-muted py-2 small">暂无家庭成员</div>';
    select.innerHTML = '<option value="">--选择成员--</option>';
    filterSelect.innerHTML = '<option value="all">全部成员</option>';
    return;
  }

  container.innerHTML = plantMembers.map(m => `
    <div class="d-flex align-items-center justify-content-between mb-2 p-2 rounded" style="background:#f1f8e9;">
      <span><span class="me-2">${m.avatar || '👤'}</span><strong>${escapeHtmlP(m.name)}</strong></span>
      <button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="deletePlantMember('${m.id}')" title="删除">
        <i class="bi bi-trash3"></i>
      </button>
    </div>
  `).join('');

  select.innerHTML = '<option value="">--选择成员--</option>' + plantMembers.map(m => `<option value="${m.id}">${escapeHtmlP(m.name)}</option>`).join('');
  filterSelect.innerHTML = '<option value="all">全部成员</option>' + plantMembers.map(m => `<option value="${m.id}">${escapeHtmlP(m.name)}</option>`).join('');
}

/* ---------- 植物卡片 ---------- */
function renderPlantCards() {
  const container = document.getElementById('plantCards');
  const filterMemberId = document.getElementById('plantFilterMember').value;

  let filteredPlants = plants;
  if (filterMemberId !== 'all') {
    filteredPlants = plants.filter(p => p.memberId === filterMemberId);
  }

  if (filteredPlants.length === 0) {
    container.innerHTML = '<div class="col-12 text-center text-muted py-4">🌿 还没有植物，快种下第一棵吧！</div>';
    return;
  }

  const cards = filteredPlants.map(plant => {
    const member = getMemberById(plant.memberId);
    const stage = getGrowthStage(plant.growth);
    const progressPct = Math.min(100, Math.round((plant.growth - stage.min) / (stage.max - stage.min + 1) * 100));
    const memberName = member ? member.name : '未知';
    const memberAvatar = member ? (member.avatar || '👤') : '👤';

    // 照料按钮
    const careButtons = CARE_ACTIONS.map(action => {
      const careType = action.id;
      const available = canCare(plant, careType);
      const btnClass = available ? 'btn-outline-success' : 'btn-outline-secondary';
      const title = available ? action.label + ' (+' + action.growthBonus + ')' : action.label + ' (冷却中)';
      return `<button class="btn ${btnClass} btn-sm py-0 px-1" ${available ? '' : 'disabled'}
        onclick="${available ? "carePlant('" + plant.id + "','" + careType + "')" : ''}"
        title="${title}" style="font-size:0.65rem;">${action.label}</button>`;
    });

    return `<div class="col-xl-3 col-lg-4 col-md-6">
      <div class="card border-0 shadow-sm h-100 plant-card" style="border-top:3px solid ${stage.color};transition:transform 0.2s;">
        <div class="card-body text-center py-3">
          <div class="plant-icon mb-2" style="font-size:3rem;transition:transform 0.3s;">${stage.icon}</div>
          <h6 class="fw-bold mb-1">${escapeHtmlP(plant.name)}</h6>
          <div class="small text-muted mb-1">${memberAvatar} ${escapeHtmlP(memberName)} · ${escapeHtmlP(plant.type || '其他')}</div>
          <div class="small mb-2">
            <span class="badge" style="background:${stage.color};color:#fff;">${stage.name}</span>
            <span class="ms-1 text-muted">成长值: ${plant.growth}</span>
          </div>
          <div class="progress mb-2" style="height:6px;">
            <div class="progress-bar" style="width:${progressPct}%;background:${stage.color};" role="progressbar"></div>
          </div>
          <div class="small text-muted mb-2">📅 ${escapeHtmlP(plant.plantDate)}</div>
          <div class="d-flex flex-wrap gap-1 justify-content-center">
            ${careButtons.join('')}
          </div>
        </div>
        <div class="card-footer bg-white border-top text-center py-1">
          <button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="deletePlant('${plant.id}')" title="移除植物" style="font-size:0.65rem;">
            <i class="bi bi-trash3 me-1"></i>移除
          </button>
        </div>
      </div>
    </div>`;
  });
  container.innerHTML = cards.join('');
}

/* ---------- 排行榜 ---------- */
function renderRanking() {
  const tbody = document.getElementById('rankingBody');
  const weekLabel = document.getElementById('weekLabel');
  weekLabel.textContent = '(' + getWeekMonday() + ' ~ 本周日)';

  // 计算每个成员的排名数据
  const memberStats = plantMembers.map(m => {
    const memberPlants = plants.filter(p => p.memberId === m.id);
    const totalGrowth = memberPlants.reduce((sum, p) => sum + (p.growth || 0), 0);
    const weekCare = plantWeekCareCounts[m.id] || 0;
    return { ...m, plantCount: memberPlants.length, weekCare, totalGrowth };
  });

  memberStats.sort((a, b) => b.weekCare - a.weekCare || b.totalGrowth - a.totalGrowth);

  if (memberStats.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">本周还没有人照料植物，快来互动吧！</td></tr>';
    updateBestGrower(null);
    return;
  }

  const rows = memberStats.map((m, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
    return `<tr>
      <td><strong>${medal}</strong></td>
      <td>${m.avatar || '👤'} ${escapeHtmlP(m.name)}</td>
      <td>${m.plantCount}</td>
      <td><span class="fw-bold text-success">${m.weekCare}次</span></td>
      <td>${m.totalGrowth}</td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('');

  // 更新最佳种植者
  const best = memberStats[0];
  if (best && best.weekCare > 0) {
    updateBestGrower(best);
  } else {
    updateBestGrower(null);
  }
}

function updateBestGrower(best) {
  const panel = document.getElementById('bestGrowerPanel');
  if (!best) {
    document.getElementById('bgAvatar').textContent = '🏆';
    document.getElementById('bgName').textContent = '--';
    document.getElementById('bgScore').textContent = '--';
    document.getElementById('bgWish').textContent = '--';
    document.getElementById('btnDrawWish').disabled = true;
    return;
  }

  document.getElementById('bgAvatar').textContent = best.avatar || '🏆';
  document.getElementById('bgName').textContent = best.name;
  document.getElementById('bgScore').textContent = '本周照料 ' + best.weekCare + ' 次 · 总成长值 ' + best.totalGrowth;

  const drawBtn = document.getElementById('btnDrawWish');
  const drawnWish = getDrawnWishForCurrentWeek();

  if (plantWeekDraw && plantWeekDraw.bestMemberId === best.id && drawnWish) {
    document.getElementById('bgWish').textContent = drawnWish.content;
    drawBtn.disabled = true;
    drawBtn.textContent = '✅ 本周已抽取';
  } else if (plantWeekDraw && drawnWish) {
    document.getElementById('bgWish').textContent = '本周已由「' + (plantWeekDraw.bestMemberName || '其他成员') + '」抽取';
    drawBtn.disabled = true;
    drawBtn.textContent = '✅ 本周已抽取';
  } else {
    document.getElementById('bgWish').textContent = '点击从心愿罐抽取';
    drawBtn.disabled = false;
    drawBtn.textContent = '🎁 为最佳种植者抽取心愿';
  }
}

function getDrawnWishForCurrentWeek() {
  if (typeof WishJar !== 'undefined') {
    WishJar.reloadFromStorage();
    return WishJar.getDrawnForWeek(plantWeekStart);
  }
  if (plantWeekDraw && plantWeekDraw.wishId) {
    try {
      const raw = localStorage.getItem('family_manager_wishes');
      const all = raw ? JSON.parse(raw) : [];
      return all.find(w => w.id === plantWeekDraw.wishId) || null;
    } catch (_) {}
  }
  return null;
}

/* ---------- 已领取心愿记录 ---------- */
function renderClaimedWishes() {
  const tbody = document.getElementById('claimedWishBody');
  const countEl = document.getElementById('claimedWishCount');

  try {
    const raw = localStorage.getItem('family_manager_claimed_wishes');
    const claimed = raw ? JSON.parse(raw) : [];
    countEl.textContent = claimed.length + '条';

    if (claimed.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-2 small">暂无已领取的心愿记录</td></tr>';
      return;
    }

    tbody.innerHTML = claimed.map(c => {
      let wishText = c.wish || '';
      if (c.wishId && typeof WishJar !== 'undefined') {
        const linked = WishJar.findById(c.wishId);
        if (linked) wishText = linked.content;
      }
      return `<tr>
      <td>${escapeHtmlP(c.date)}</td>
      <td>${escapeHtmlP(c.member)}</td>
      <td>${escapeHtmlP(wishText)}</td>
    </tr>`;
    }).join('');
  } catch (e) {}
}

/* ============================================================
 *  操作函数
 * ============================================================ */

function addPlantMember() {
  const nameInput = document.getElementById('plantMemberName');
  const name = nameInput.value.trim();
  if (!name) { alert('请输入成员名称'); return; }

  const id = 'm' + Date.now();
  const avatars = ['👨', '👩', '👦', '👧', '👴', '👵'];
  const avatar = avatars[Math.floor(Math.random() * avatars.length)];

  plantMembers.push({ id, name, avatar });
  savePlantMembers();
  if (typeof WishJar !== 'undefined') {
    WishJar.reloadFromStorage();
    const list = WishJar.getWishes();
    let changed = false;
    list.forEach(w => {
      if (!w.anonymous && (w.member || '').trim() === name) {
        w.plantMemberId = id;
        changed = true;
      }
    });
    if (changed) {
      WishJar.save();
      WishJar.renderGrowth();
    }
  }
  renderPlantMembers();
  renderRanking();
  nameInput.value = '';
}

function deletePlantMember(id) {
  const member = plantMembers.find(m => m.id === id);
  const msg = member
    ? '确定删除成员「' + member.name + '」吗？\n· 其所有植物将被移除\n· 其在心愿储蓄罐中提出的心愿也将一并删除'
    : '确定删除该成员吗？其所有植物与关联心愿也将被移除。';
  if (!confirm(msg)) return;

  if (typeof WishJar !== 'undefined') {
    const removed = WishJar.deleteByPlantMember(id, member ? member.name : '');
    if (removed > 0) WishJar.renderGrowth();
  }

  plantMembers = plantMembers.filter(m => m.id !== id);
  plants = plants.filter(p => p.memberId !== id);
  delete plantWeekCareCounts[id];
  if (plantWeekDraw && plantWeekDraw.bestMemberId === id) plantWeekDraw = null;

  savePlantMembers();
  savePlants();
  savePlantWeek();
  renderAllPlanting();
}

function addPlant() {
  const memberId = document.getElementById('plantMemberId').value;
  const name = document.getElementById('plantName').value.trim();
  const type = document.getElementById('plantType').value;
  let plantDate = document.getElementById('plantDate').value;

  if (!memberId) { alert('请选择种植者！'); return; }
  if (!name) { alert('请输入植物名称！'); return; }
  if (!plantDate) { plantDate = new Date().toISOString().substring(0, 10); }

  plants.push({
    id: 'p' + Date.now(),
    memberId, name, type, plantDate,
    growth: 0,
    lastGrowthTime: new Date().toISOString(),
    lastWater: '', lastFertilize: '', lastSunshine: '', lastPrune: ''
  });
  savePlants();
  renderAllPlanting();

  document.getElementById('plantName').value = '';
}

function carePlant(plantId, careType) {
  const plant = plants.find(p => p.id === plantId);
  if (!plant) return;

  if (!canCare(plant, careType)) {
    alert('该照料操作还在冷却中（1小时），请稍后再来！');
    return;
  }

  const action = CARE_ACTIONS.find(a => a.id === careType);
  plant.growth = (plant.growth || 0) + action.growthBonus;

  const lastField = 'last' + careType.charAt(0).toUpperCase() + careType.slice(1);
  plant[lastField] = new Date().toISOString();

  // 更新本周照料计数
  plantWeekCareCounts[plant.memberId] = (plantWeekCareCounts[plant.memberId] || 0) + 1;

  savePlants();
  savePlantWeek();
  renderAllPlanting();

  // 动画提示
  showCareToast(action.label + ' +' + action.growthBonus);
}

function showCareToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;background:#4caf50;color:#fff;padding:10px 20px;border-radius:8px;font-weight:bold;animation:fadeInOut 1.5s ease;';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { document.body.removeChild(toast); }, 1500);
}

function deletePlant(plantId) {
  if (!confirm('确定移除这棵植物吗？')) return;
  plants = plants.filter(p => p.id !== plantId);
  savePlants();
  renderAllPlanting();
}

/* ---------- 抽取心愿 ---------- */
function drawWishForBest() {
  // 获取本周第一名
  const memberStats = plantMembers.map(m => {
    const memberPlants = plants.filter(p => p.memberId === m.id);
    const totalGrowth = memberPlants.reduce((sum, p) => sum + (p.growth || 0), 0);
    const weekCare = plantWeekCareCounts[m.id] || 0;
    return { ...m, plantCount: memberPlants.length, weekCare, totalGrowth };
  });
  memberStats.sort((a, b) => b.weekCare - a.weekCare || b.totalGrowth - a.totalGrowth);
  const best = memberStats[0];

  if (!best || best.weekCare === 0) {
    alert('本周还没有人照料植物！');
    return;
  }

  if (plantWeekDraw && plantWeekDraw.weekStart === plantWeekStart) {
    alert('本周已经为最佳种植者抽取过心愿了！');
    return;
  }

  if (typeof WishJar === 'undefined') {
    alert('心愿储蓄罐模块未加载，请刷新页面后重试。');
    return;
  }

  WishJar.reloadFromStorage();
  const picked = WishJar.drawForBestGrower(best, plantWeekStart);
  if (!picked) {
    alert('心愿储蓄罐中暂无待完成的心愿！先去放入一些心愿吧。');
    return;
  }

  plantWeekDraw = {
    weekStart: plantWeekStart,
    wishId: picked.id,
    bestMemberId: best.id,
    bestMemberName: best.name,
    drawnAt: new Date().toISOString().substring(0, 10)
  };
  savePlantWeek();

  document.getElementById('bgWish').textContent = picked.content;
  document.getElementById('btnDrawWish').disabled = true;
  document.getElementById('btnDrawWish').textContent = '✅ 本周已抽取';

  let claimed = [];
  try {
    const raw = localStorage.getItem('family_manager_claimed_wishes');
    claimed = raw ? JSON.parse(raw) : [];
  } catch (e) {}
  claimed.unshift({
    date: new Date().toISOString().substring(0, 10),
    member: best.name,
    wish: picked.content,
    wishId: picked.id
  });
  try {
    localStorage.setItem('family_manager_claimed_wishes', JSON.stringify(claimed));
    if (typeof FamilySync !== 'undefined') FamilySync.notifyDataChanged();
  } catch (e) {}

  WishJar.renderGrowth();
  renderClaimedWishes();
  alert('🎉 恭喜 ' + best.name + ' 成为本周最佳种植者！\n已从心愿储蓄罐抽取：' + picked.content);
}

function resetPlantWeek() {
  if (!confirm('确定重置本周数据吗？照料次数与本周心愿抽取将清零。')) return;
  plantWeekStart = getWeekMonday();
  plantWeekCareCounts = {};
  plantWeekDraw = null;
  savePlantWeek();
  if (typeof WishJar !== 'undefined') WishJar.renderGrowth();
  renderAllPlanting();
}

/* ---------- 汇总渲染 ---------- */
function renderAllPlanting() {
  renderPlantMembers();
  renderPlantCards();
  renderRanking();
  renderClaimedWishes();
}

/* ---------- 云端成员同步 ---------- */
async function syncPlantMembersFromCloud() {
  if (typeof FamilyAuth === 'undefined' || !FamilyAuth.isLoggedIn()) return;
  if (!FamilyAuth.isManager() && !FamilyAuth.isMember()) return;

  const r = await FamilyAuth.getMembers();
  if (!r.ok || !r.members || r.members.length === 0) {
    console.log('[种植争霸] 云端无成员数据，跳过同步');
    return;
  }

  const avatars = ['👨', '👩', '👦', '👧', '👴', '👵'];
  let addedCount = 0;

  r.members.forEach(m => {
    // 用云端成员ID去重：在 plantMembers 中查找是否已有该云端ID
    const cloudId = 'cloud_' + m.id;
    const exists = plantMembers.some(pm => pm.cloudId === cloudId);
    if (exists) return;

    // 检查是否有同名成员（避免一人两号）
    const nameExists = plantMembers.some(pm => pm.name === (m.displayName || m.username));
    if (nameExists) return;

    const avatar = avatars[Math.floor(Math.random() * avatars.length)];
    plantMembers.push({
      id: 'm' + Date.now() + '_' + addedCount,
      cloudId: cloudId,
      name: m.displayName || m.username,
      avatar: avatar
    });
    addedCount++;
  });

  if (addedCount > 0) {
    savePlantMembers();
    renderAllPlanting();
    if (typeof FamilyAuth !== 'undefined' && typeof FamilyAuth.showToast === 'function') {
      FamilyAuth.showToast(`已从云端导入 ${addedCount} 位家庭成员`, 'success');
    }
    console.log(`[种植争霸] 从云端同步了 ${addedCount} 位成员`);
  }
}

function updatePlantSyncUI() {
  const loggedInEl = document.getElementById('plantSyncLoggedIn');
  const guestEl = document.getElementById('plantSyncGuest');

  if (typeof FamilyAuth === 'undefined' || !FamilyAuth.isLoggedIn()) {
    if (loggedInEl) loggedInEl.classList.add('d-none');
    if (guestEl) guestEl.classList.remove('d-none');
  } else {
    if (loggedInEl) loggedInEl.classList.remove('d-none');
    if (guestEl) guestEl.classList.add('d-none');
  }
}

function removePlantMemberByCloudId(cloudUserId) {
  const cloudId = 'cloud_' + cloudUserId;
  const removed = plantMembers.filter(m => m.cloudId === cloudId);
  if (removed.length === 0) return;

  removed.forEach(member => {
    // 清理该成员的相关数据
    if (typeof WishJar !== 'undefined') {
      WishJar.reloadFromStorage();
      WishJar.deleteByPlantMember(member.id, member.name);
    }
    plants = plants.filter(p => p.memberId !== member.id);
    delete plantWeekCareCounts[member.id];
    if (plantWeekDraw && plantWeekDraw.bestMemberId === member.id) plantWeekDraw = null;
  });

  plantMembers = plantMembers.filter(m => m.cloudId !== cloudId);
  savePlantMembers();
  savePlants();
  savePlantWeek();
  renderAllPlanting();
  console.log(`[种植争霸] 已移除云端成员对应参赛者: ${removed.map(r => r.name).join(', ')}`);
}

/* ---------- 事件绑定 ---------- */
function bindPlantingEvents() {
  document.getElementById('btnAddMember').addEventListener('click', addPlantMember);
  document.getElementById('plantMemberName').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); addPlantMember(); }
  });

  document.getElementById('formPlantAdd').addEventListener('submit', function(e) {
    e.preventDefault();
    addPlant();
  });

  document.getElementById('plantFilterMember').addEventListener('change', function() {
    renderPlantCards();
  });

  document.getElementById('btnDrawWish').addEventListener('click', drawWishForBest);
  document.getElementById('btnResetWeek').addEventListener('click', resetPlantWeek);

  // 云端同步按钮
  document.getElementById('btnSyncFromCloud')?.addEventListener('click', syncPlantMembersFromCloud);

  // 未登录引导：点击创建家庭
  document.getElementById('linkPlantToRegister')?.addEventListener('click', e => {
    e.preventDefault();
    if (typeof FamilyAuth !== 'undefined') {
      bootstrap.Modal.getOrCreateInstance(document.getElementById('modalRegister')).show();
    }
  });

  // 未登录引导：点击加入家庭
  document.getElementById('linkPlantToJoin')?.addEventListener('click', e => {
    e.preventDefault();
    if (typeof FamilyAuth !== 'undefined') {
      bootstrap.Modal.getOrCreateInstance(document.getElementById('modalJoin')).show();
    }
  });
}

// 暴露给 family-auth 调用（登录/移除时联动）
window.PlantingModule = {
  syncFromCloud: syncPlantMembersFromCloud,
  updateSyncUI: updatePlantSyncUI,
  removeByCloudId: removePlantMemberByCloudId
};

/* ---------- 定时自动增长 ---------- */
let plantGrowthInterval = null;

function startPlantAutoGrowth() {
  if (plantGrowthInterval) clearInterval(plantGrowthInterval);
  plantGrowthInterval = setInterval(() => {
    const now = new Date();
    plants.forEach(plant => {
      if (!plant.lastGrowthTime) {
        plant.lastGrowthTime = now.toISOString();
        return;
      }
      const lastTime = new Date(plant.lastGrowthTime);
      const hoursPassed = Math.floor((now.getTime() - lastTime.getTime()) / (1000 * 60 * 60));
      if (hoursPassed > 0) {
        plant.growth = (plant.growth || 0) + hoursPassed;
        plant.lastGrowthTime = now.toISOString();
      }
    });
    savePlants();
    renderPlantCards();
  }, 60000); // 每分钟检查一次
}

/* ---------- 初始化 ---------- */
function initPlantingModule() {
  console.log('[种植争霸] 模块初始化');
  loadPlantData();
  bindPlantingEvents();
  renderAllPlanting();
  updatePlantSyncUI();
  startPlantAutoGrowth();
}
