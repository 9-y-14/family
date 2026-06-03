/**
 * ============================================================
 *  模块：家庭药品检查表
 *  功能：家庭药品管理 + 半年盘点提醒 + 药品缺口清单 + 药品搜索
 * ============================================================
 */

const STORAGE_KEY_EMERGENCY_ITEMS = 'family_manager_emergency_items';
const STORAGE_KEY_EMERGENCY_LAST_CHECK = 'family_manager_emergency_last_check';

/* ---------- 状态 ---------- */
let emItems = [];        // 家庭药品列表
let emLastCheckDate = null; // 上次盘点日期
let emSearchKeyword = ''; // 当前搜索关键词

/* ---------- 示例数据 ---------- */
function getDemoEmergencyItems() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const todayStr = y + '-' + m + '-' + d;
  // 构造不同过期状态的日期
  const future2y = (y + 2) + '-' + m + '-' + d;
  const future3y = (y + 3) + '-' + m + '-' + d;
  const past1m = new Date(today); past1m.setMonth(past1m.getMonth() - 1);
  const past1mStr = past1m.toISOString().substring(0, 10);
  const past3m = new Date(today); past3m.setMonth(past3m.getMonth() - 3);
  const past3mStr = past3m.toISOString().substring(0, 10);
  const future2w = new Date(today); future2w.setDate(future2w.getDate() + 14);
  const future2wStr = future2w.toISOString().substring(0, 10);
  const future3m = new Date(today); future3m.setMonth(future3m.getMonth() + 3);
  const future3mStr = future3m.toISOString().substring(0, 10);
  const future6m = new Date(today); future6m.setMonth(future6m.getMonth() + 6);
  const future6mStr = future6m.toISOString().substring(0, 10);
  const future1y = (y + 1) + '-' + m + '-' + d;

  return [
    // 解热镇痛类
    { name: '布洛芬', spec: '缓释胶囊0.3g×24粒', purchaseDate: '2025-11-15', expiryDate: future1y, lastCheckDate: todayStr },
    { name: '对乙酰氨基酚', spec: '片剂0.5g×20片', purchaseDate: '2026-01-10', expiryDate: future2y, lastCheckDate: todayStr },
    // 感冒咳嗽类
    { name: '感冒灵颗粒', spec: '10g×9袋', purchaseDate: '2025-10-20', expiryDate: future2wStr, lastCheckDate: todayStr },
    { name: '连花清瘟胶囊', spec: '0.35g×36粒', purchaseDate: '2025-12-05', expiryDate: future3mStr, lastCheckDate: '' },
    { name: '氨溴索口服液', spec: '100ml/瓶', purchaseDate: '2026-03-01', expiryDate: future6mStr, lastCheckDate: todayStr },
    // 抗生素类
    { name: '阿莫西林', spec: '胶囊0.5g×24粒', purchaseDate: '2025-09-10', expiryDate: past1mStr, lastCheckDate: '' },
    { name: '头孢克肟', spec: '片剂0.1g×6片', purchaseDate: '2025-08-15', expiryDate: past3mStr, lastCheckDate: todayStr },
    // 消化系统类
    { name: '蒙脱石散', spec: '3g×10袋', purchaseDate: '2026-05-01', expiryDate: future3mStr, lastCheckDate: todayStr },
    { name: '奥美拉唑', spec: '肠溶片20mg×14片', purchaseDate: '2026-02-20', expiryDate: future2y, lastCheckDate: todayStr },
    { name: '健胃消食片', spec: '0.8g×32片', purchaseDate: '2026-04-10', expiryDate: future1y, lastCheckDate: '' },
    // 抗过敏类
    { name: '氯雷他定', spec: '片剂10mg×12片', purchaseDate: '2025-12-10', expiryDate: future2y, lastCheckDate: todayStr },
    { name: '西替利嗪', spec: '片剂10mg×6片', purchaseDate: '2026-03-18', expiryDate: future3y, lastCheckDate: todayStr },
    // 外用药类
    { name: '云南白药喷雾剂', spec: '50g+60g套装', purchaseDate: '2026-01-05', expiryDate: future3y, lastCheckDate: todayStr },
    { name: '红霉素软膏', spec: '10g/支', purchaseDate: '2026-02-28', expiryDate: future1y, lastCheckDate: todayStr },
    { name: '莫匹罗星软膏', spec: '5g/支', purchaseDate: '2026-04-22', expiryDate: future2y, lastCheckDate: todayStr },
    { name: '炉甘石洗剂', spec: '100ml/瓶', purchaseDate: '2025-11-08', expiryDate: future1y, lastCheckDate: todayStr },
    { name: '复方醋酸地塞米松乳膏', spec: '20g/支', purchaseDate: '2025-06-30', expiryDate: past1mStr, lastCheckDate: '' },
    // 慢性病/心脑血管类
    { name: '硝苯地平缓释片', spec: '30mg×7片', purchaseDate: '2026-04-01', expiryDate: future2y, lastCheckDate: todayStr },
    { name: '二甲双胍', spec: '0.5g×20片', purchaseDate: '2026-05-20', expiryDate: future3y, lastCheckDate: '' },
    { name: '速效救心丸', spec: '40mg×60丸', purchaseDate: '2026-03-15', expiryDate: future2y, lastCheckDate: todayStr },
    // 维生素/营养补充类
    { name: '维生素C片', spec: '0.1g×100片', purchaseDate: '2026-01-20', expiryDate: future2y, lastCheckDate: todayStr },
    { name: '复合维生素B片', spec: '100片/瓶', purchaseDate: '2025-09-15', expiryDate: past3mStr, lastCheckDate: '' },
  ];
}

/* ---------- 加载/保存 ---------- */
function loadEmergencyData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EMERGENCY_ITEMS);
    if (raw) {
      emItems = JSON.parse(raw);
    } else {
      // 首次加载，填充示例数据
      emItems = getDemoEmergencyItems();
      saveEmergencyItems();
    }
    const checkRaw = localStorage.getItem(STORAGE_KEY_EMERGENCY_LAST_CHECK);
    if (checkRaw) emLastCheckDate = checkRaw;
  } catch (e) { console.warn('[家庭药品] 读取数据失败', e); }
}

function saveEmergencyItems() {
  try { localStorage.setItem(STORAGE_KEY_EMERGENCY_ITEMS, JSON.stringify(emItems)); } catch (e) {}
}

function saveEmergencyLastCheck() {
  try { localStorage.setItem(STORAGE_KEY_EMERGENCY_LAST_CHECK, emLastCheckDate); } catch (e) {}
}

/* ---------- 计算下次盘点日期（半年后） ---------- */
function getNextCheckDate() {
  if (!emLastCheckDate) {
    // 首次：以当前日期为准
    const now = new Date();
    emLastCheckDate = now.toISOString().substring(0, 10);
    saveEmergencyLastCheck();
  }
  const lastCheck = new Date(emLastCheckDate);
  const nextCheck = new Date(lastCheck);
  nextCheck.setMonth(nextCheck.getMonth() + 6);
  return nextCheck;
}

function updateEmergencyCheckCountdown() {
  const nextCheck = getNextCheckDate();
  const now = new Date();
  const diffTime = nextCheck.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const countdownEl = document.getElementById('emCheckCountdown');
  const badgeEl = document.getElementById('emNextCheckBadge');

  if (diffDays <= 0) {
    countdownEl.textContent = '⚠️ 请盘点';
    countdownEl.style.color = '#dc3545';
    badgeEl.textContent = '盘点逾期';
    badgeEl.className = 'badge bg-danger';
  } else if (diffDays <= 30) {
    countdownEl.textContent = diffDays + '天';
    countdownEl.style.color = '#ff9800';
    badgeEl.textContent = '即将盘点';
    badgeEl.className = 'badge bg-warning text-dark';
  } else {
    countdownEl.textContent = diffDays + '天';
    countdownEl.style.color = '#4caf50';
    badgeEl.textContent = '正常';
    badgeEl.className = 'badge bg-success';
  }
}

/* ---------- 判断物资状态 ---------- */
function getItemStatus(item) {
  if (!item.expiryDate) return 'normal';
  const now = new Date();
  const expiry = new Date(item.expiryDate);
  const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 30) return 'warning';
  return 'normal';
}

function renderStatusBadge(status) {
  if (status === 'expired') return '<span class="badge bg-danger">已过期</span>';
  if (status === 'warning') return '<span class="badge bg-warning text-dark">即将过期</span>';
  return '<span class="badge bg-success">正常</span>';
}

/* ---------- 渲染药品清单 ---------- */
function renderEmergencyItems() {
  const tbody = document.getElementById('emItemsBody');
  const resultInfo = document.getElementById('emSearchResultInfo');

  // 根据搜索关键词过滤
  let filteredItems = emItems;
  if (emSearchKeyword) {
    const keyword = emSearchKeyword.toLowerCase();
    filteredItems = emItems.filter(item => item.name.toLowerCase().includes(keyword));
    if (filteredItems.length < emItems.length) {
      resultInfo.style.display = 'inline-block';
      resultInfo.textContent = '🔍 搜索"' + escapeHtmlEm(emSearchKeyword) + '"：找到 ' + filteredItems.length + ' 项（共' + emItems.length + '项）';
    } else {
      resultInfo.style.display = 'inline-block';
      resultInfo.textContent = '🔍 搜索"' + escapeHtmlEm(emSearchKeyword) + '"：共 ' + filteredItems.length + ' 项';
    }
  } else {
    resultInfo.style.display = 'none';
  }

  document.getElementById('emItemCount').textContent = emItems.length + '项';

  if (filteredItems.length === 0) {
    if (emSearchKeyword) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">未找到匹配"<strong>' + escapeHtmlEm(emSearchKeyword) + '</strong>"的药品</td></tr>';
    } else {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">暂无药品，请添加</td></tr>';
    }
    renderShortageList();
    return;
  }

  const rows = filteredItems.map((item) => {
    // 找到原始索引
    const idx = emItems.indexOf(item);
    const status = getItemStatus(item);
    let rowClass = '';
    if (status === 'expired') rowClass = 'row-emergency-expired';
    else if (status === 'warning') rowClass = 'row-emergency-warning';

    // 搜索高亮
    const displayName = emSearchKeyword
      ? item.name.replace(new RegExp('(' + emSearchKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>')
      : escapeHtmlEm(item.name);

    return `<tr class="${rowClass}">
      <td><strong>${displayName}</strong></td>
      <td>${escapeHtmlEm(item.spec || '-')}</td>
      <td>${escapeHtmlEm(item.purchaseDate)}</td>
      <td>${escapeHtmlEm(item.expiryDate || '-')}</td>
      <td>${escapeHtmlEm(item.lastCheckDate || '-')}</td>
      <td>${renderStatusBadge(status)}</td>
      <td>
        <button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="deleteEmItem(${idx})" title="删除">
          <i class="bi bi-trash3"></i>
        </button>
        <button class="btn btn-outline-warning btn-sm py-0 px-1 ms-1" onclick="checkEmItem(${idx})" title="标记检查">
          <i class="bi bi-check-circle"></i>
        </button>
      </td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('');
  renderShortageList();
  updateSearchDatalist();
}

/* ---------- 生成药品缺口清单 ---------- */
function renderShortageList() {
  const card = document.getElementById('emShortageCard');
  const tbody = document.getElementById('emShortageBody');
  const alertEl = document.getElementById('emShortageAlert');
  const alertText = document.getElementById('emShortageText');

  // 必备药品清单
  const essentialItems = ['布洛芬', '对乙酰氨基酚', '阿莫西林', '感冒灵颗粒', '蒙脱石散', '氯雷他定', '云南白药喷雾剂', '红霉素软膏', '硝苯地平缓释片', '速效救心丸', '二甲双胍'];
  const existingNames = emItems.map(i => i.name);
  const missingItems = essentialItems.filter(ei => !existingNames.some(en => en.includes(ei)));

  // 已过期药品
  const expiredItems = emItems.filter(item => getItemStatus(item) === 'expired');
  // 即将过期药品
  const warningItems = emItems.filter(item => getItemStatus(item) === 'warning');

  const shortageRows = [];
  missingItems.forEach(name => {
    shortageRows.push(`<tr><td><strong>${name}</strong></td><td><span class="badge bg-secondary">缺少必备药品</span></td><td>1份</td></tr>`);
  });
  expiredItems.forEach(item => {
    shortageRows.push(`<tr><td><strong>${escapeHtmlEm(item.name)}</strong></td><td><span class="badge bg-danger">已过期</span></td><td>替换1份</td></tr>`);
  });
  warningItems.forEach(item => {
    shortageRows.push(`<tr><td><strong>${escapeHtmlEm(item.name)}</strong></td><td><span class="badge bg-warning text-dark">即将过期</span></td><td>1份备用</td></tr>`);
  });

  const totalShortage = missingItems.length + expiredItems.length + warningItems.length;

  if (totalShortage > 0) {
    card.style.display = 'block';
    tbody.innerHTML = shortageRows.join('');
    alertEl.style.display = 'block';
    alertText.textContent = `共发现 ${totalShortage} 项药品缺口，请及时采购补充！`;
  } else {
    card.style.display = 'none';
    alertEl.style.display = 'none';
  }
}

/* ---------- 搜索功能 ---------- */
function updateSearchDatalist() {
  const datalist = document.getElementById('emSearchList');
  const names = [...new Set(emItems.map(i => i.name))];
  datalist.innerHTML = names.map(n => '<option value="' + escapeHtmlEm(n) + '">').join('');
}

function performEmSearch() {
  const keyword = document.getElementById('emSearchKeyword').value.trim();
  emSearchKeyword = keyword;
  renderEmergencyItems();
}

function resetEmSearch() {
  document.getElementById('emSearchKeyword').value = '';
  emSearchKeyword = '';
  renderEmergencyItems();
}

/* ---------- 操作函数 ---------- */
function deleteEmItem(idx) {
  if (!confirm('确定删除该药品吗？')) return;
  emItems.splice(idx, 1);
  saveEmergencyItems();
  renderEmergencyItems();
}

function checkEmItem(idx) {
  const today = new Date().toISOString().substring(0, 10);
  emItems[idx].lastCheckDate = today;
  saveEmergencyItems();
  renderEmergencyItems();
}

function doEmergencyCheck() {
  const today = new Date().toISOString().substring(0, 10);
  emLastCheckDate = today;
  saveEmergencyLastCheck();
  updateEmergencyCheckCountdown();
  renderEmergencyItems();
  alert(`✅ 盘点完成！\n盘点日期：${today}\n下次盘点提醒：半年后\n\n请查看药品缺口清单，及时采购补充。`);
}

/* ---------- 工具函数 ---------- */
function escapeHtmlEm(str) {
  if (!str && str !== 0) return '';
  const s = String(str);
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

/* ---------- 事件绑定 ---------- */
function bindEmergencyEvents() {
  // 添加药品
  document.getElementById('formEmergencyAdd').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('emItemName').value.trim();
    const spec = document.getElementById('emSpec').value.trim();
    const purchaseDate = document.getElementById('emPurchaseDate').value;
    const expiryDate = document.getElementById('emExpiryDate').value;
    const lastCheckDate = document.getElementById('emLastCheckDate').value;

    if (!name || !purchaseDate) { alert('请填写药品名称和采购日期！'); return; }

    emItems.push({
      name, spec: spec || '', purchaseDate,
      expiryDate: expiryDate || '', lastCheckDate: lastCheckDate || ''
    });
    saveEmergencyItems();
    renderEmergencyItems();

    // 清空表单
    document.getElementById('emItemName').value = '';
    document.getElementById('emSpec').value = '';
    document.getElementById('emPurchaseDate').value = '';
    document.getElementById('emExpiryDate').value = '';
    document.getElementById('emLastCheckDate').value = '';
    document.getElementById('emItemName').focus();
  });

  // 立即盘点
  document.getElementById('btnEmCheckNow').addEventListener('click', doEmergencyCheck);

  // 搜索药品
  document.getElementById('emSearchKeyword').addEventListener('input', function() {
    performEmSearch();
  });
  document.getElementById('emSearchKeyword').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); performEmSearch(); }
  });
  document.getElementById('btnEmSearchReset').addEventListener('click', resetEmSearch);
}

/* ---------- 初始化 ---------- */
function initEmergencyModule() {
  console.log('[家庭药品] 模块初始化');
  loadEmergencyData();
  bindEmergencyEvents();
  updateEmergencyCheckCountdown();
  updateSearchDatalist();
  renderEmergencyItems();

  // 检查是否需要弹窗提醒盘点
  const nextCheck = getNextCheckDate();
  const now = new Date();
  if (nextCheck.getTime() <= now.getTime()) {
    setTimeout(() => {
      const doCheck = confirm(
        '⚠️ 家庭药品半年盘点提醒\n\n' +
        '距离上次盘点已超过6个月，建议立即进行全量盘点核查。\n' +
        '点击"确定"开始盘点，或"取消"稍后处理。'
      );
      if (doCheck) doEmergencyCheck();
    }, 500);
  }
}
