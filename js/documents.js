/**
 * ============================================================
 *  模块2：证件保单有效期管理 - 核心业务逻辑
 *  技术栈：原生JS + PapaParse + ECharts5
 *  数据全部在浏览器本地处理，无后端、无数据库
 * ============================================================
 */

/* ---------- 模块2全局状态 ---------- */
const documentsState = {
  rawData: [],       // 原始导入的全部数据
  cleanData: [],     // 清洗后的合规数据
  filteredData: [],  // 当前筛选后的数据
  charts: {}         // ECharts实例引用
};

const STORAGE_KEY_DOCUMENTS = 'family_ledger_documents';

// 合法的证件类型枚举
const VALID_DOC_TYPES = ['身份证件','房产证明','驾驶证件','医疗保险','人寿保险','车辆保险'];

// 预警天数阈值（用户可自定义，持久化到 localStorage）
const STORAGE_KEY_WARNING_DAYS = 'family_ledger_doc_warning_days';
let WARNING_DAYS = parseInt(localStorage.getItem(STORAGE_KEY_WARNING_DAYS), 10) || 90;

function getWarningDays() {
  return WARNING_DAYS;
}

function setWarningDays(days) {
  days = parseInt(days, 10);
  if (isNaN(days) || days < 1) days = 90;
  WARNING_DAYS = days;
  localStorage.setItem(STORAGE_KEY_WARNING_DAYS, days);
  // 重新计算所有条目的状态
  recalculateAllDocStatuses();
  refreshAllDocViews();
  updateWarningDaysUI();
}

/* ---------- 本地存储 ---------- */
function loadDocumentsData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DOCUMENTS);
    if (raw) {
      const data = JSON.parse(raw);
      documentsState.rawData = data.rawData || [];
      documentsState.cleanData = data.cleanData || [];
    }
  } catch (e) { console.warn('[证件] 读取本地存储失败', e); }
}

function saveDocumentsData() {
  try {
    const data = { rawData: documentsState.rawData, cleanData: documentsState.cleanData };
    localStorage.setItem(STORAGE_KEY_DOCUMENTS, JSON.stringify(data));
    if (typeof FamilySync !== 'undefined') FamilySync.notifyDataChanged();
  } catch (e) { console.warn('[证件] 保存本地存储失败', e); }
}

/* ---------- 工具函数 ---------- */
function escapeHtmlDoc(str) {
  if (!str && str !== 0) return '';
  const s = String(str);
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

/**
 * 解析日期，统一返回 YYYY-MM-DD 格式
 */
function parseDateDoc(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  const patterns = [
    /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/,
    /^(\d{4})年(\d{1,2})月(\d{1,2})日$/,
    /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/,
    /^(\d{2})(\d{2})(\d{2})$/
  ];

  let year, month, day;
  for (let i = 0; i < patterns.length; i++) {
    const match = trimmed.match(patterns[i]);
    if (match) {
      if (i === 2) { month = parseInt(match[1]); day = parseInt(match[2]); year = parseInt(match[3]); }
      else if (i === 3) { const yy = parseInt(match[1]); year = yy < 50 ? 2000+yy : 1900+yy; month = parseInt(match[2]); day = parseInt(match[3]); }
      else { year = parseInt(match[1]); month = parseInt(match[2]); day = parseInt(match[3]); }
      break;
    }
  }

  if (!year || !month || !day) return null;
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const dateObj = new Date(year, month - 1, day);
  if (dateObj.getFullYear() !== year || dateObj.getMonth() !== month - 1 || dateObj.getDate() !== day) return null;

  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

/**
 * 计算剩余天数（相对于今天）
 * @param {string} endDate - YYYY-MM-DD 到期日期
 * @returns {number} 剩余天数（负数表示已过期）
 */
function calcRemainingDays(endDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const diffTime = end.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/* ---------- 数据清洗 ---------- */
function cleanDocRow(row, index) {
  const rawRegDate = row['登记日期'];
  const rawName = row['证件/保单名称'];
  const rawType = row['证件类型'];
  const rawLocation = row['保管位置'];
  const rawStartDate = row['生效日期'];
  const rawEndDate = row['到期日期'];
  const rawNote = row['备注'] || '';

  const regDate = parseDateDoc(rawRegDate);
  if (!regDate) { console.warn(`[证件-清洗] 第${index}行：登记日期不合法 -> "${rawRegDate}"，已丢弃`); return null; }

  const startDate = parseDateDoc(rawStartDate);
  if (!startDate) { console.warn(`[证件-清洗] 第${index}行：生效日期不合法 -> "${rawStartDate}"，已丢弃`); return null; }

  const endDate = parseDateDoc(rawEndDate);
  if (!endDate) { console.warn(`[证件-清洗] 第${index}行：到期日期不合法 -> "${rawEndDate}"，已丢弃`); return null; }

  // 生效日期不能晚于到期日期
  if (new Date(startDate) > new Date(endDate)) {
    console.warn(`[证件-清洗] 第${index}行：生效日期晚于到期日期，已丢弃`);
    return null;
  }

  const trimmedType = rawType ? String(rawType).trim() : '';
  if (!VALID_DOC_TYPES.includes(trimmedType)) {
    console.warn(`[证件-清洗] 第${index}行：证件类型不合法 -> "${rawType}"，已丢弃`);
    return null;
  }

  const name = rawName ? String(rawName).trim() : '';
  if (!name) { console.warn(`[证件-清洗] 第${index}行：名称为空，已丢弃`); return null; }

  const location = (rawLocation && String(rawLocation).trim()) ? String(rawLocation).trim() : '未标注';

  const remainingDays = calcRemainingDays(endDate);
  // 判断状态
  let status = 'normal';
  if (remainingDays < 0) status = 'expired';
  else if (remainingDays <= WARNING_DAYS) status = 'warning';

  return {
    regDate, name, type: trimmedType, location,
    startDate, endDate, remainingDays, status,
    note: String(rawNote).trim(),
    expiryYear: parseInt(endDate.substring(0,4), 10),
    expiryMonth: parseInt(endDate.substring(5,7), 10)
  };
}

function batchCleanDocs(rawRows) {
  const rawData = [];
  const cleanData = [];
  let discarded = 0;

  rawRows.forEach((row, i) => {
    rawData.push({
      regDate: row['登记日期'] || '', name: row['证件/保单名称'] || '', type: row['证件类型'] || '',
      location: row['保管位置'] || '', startDate: row['生效日期'] || '', endDate: row['到期日期'] || '',
      note: row['备注'] || ''
    });
    const cleaned = cleanDocRow(row, i + 1);
    if (cleaned) cleanData.push(cleaned);
    else discarded++;
  });

  console.log(`[证件-清洗] 原始${rawRows.length}条 -> 合规${cleanData.length}条 -> 丢弃${discarded}条`);
  return { rawData, cleanData, discarded };
}

/* ---------- 筛选逻辑 ---------- */
function applyDocFilter() {
  const typeFilter = document.getElementById('docFilterType').value;
  const statusFilter = document.getElementById('docFilterStatus').value;
  const keyword = (document.getElementById('docFilterKeyword').value || '').trim().toLowerCase();

  let result = [...documentsState.cleanData];
  if (typeFilter !== 'all') result = result.filter(d => d.type === typeFilter);
  if (statusFilter !== 'all') result = result.filter(d => d.status === statusFilter);
  if (keyword) {
    result = result.filter(d =>
      d.name.toLowerCase().includes(keyword) ||
      d.location.toLowerCase().includes(keyword) ||
      d.note.toLowerCase().includes(keyword)
    );
  }
  return result;
}

function onDocFilterChange() {
  documentsState.filteredData = applyDocFilter();
  refreshAllDocViews();
}

/* ---------- UI渲染 ---------- */
function renderDocTypeBadge(type) {
  const map = {
    '身份证件': 'bg-info text-dark', '房产证明': 'bg-success',
    '驾驶证件': 'bg-warning text-dark', '医疗保险': 'bg-danger',
    '人寿保险': 'bg-primary', '车辆保险': 'bg-secondary'
  };
  const cls = map[type] || 'bg-light text-dark';
  return `<span class="badge ${cls}">${escapeHtmlDoc(type)}</span>`;
}

function renderDocStatusBadge(status, days) {
  if (status === 'expired') return '<span class="badge bg-danger">已过期</span>';
  if (status === 'warning') return `<span class="badge bg-warning text-dark">${days}天</span>`;
  return '<span class="badge bg-success">正常</span>';
}

function renderDocTable(data, tbodyId, isClean) {
  const tbody = document.getElementById(tbodyId);
  if (!data || data.length === 0) {
    const cols = isClean ? 8 : 7;
    tbody.innerHTML = `<tr><td colspan="${cols}" class="text-center text-muted py-3">暂无数据</td></tr>`;
    return;
  }

  const rows = data.map(d => {
    let rowClass = '';
    if (isClean) {
      if (d.status === 'expired') rowClass = 'row-expired';
      else if (d.status === 'warning') rowClass = 'row-warning';
    }

    if (isClean) {
      return `<tr class="${rowClass}">
        <td>${escapeHtmlDoc(d.regDate)}</td>
        <td>${escapeHtmlDoc(d.name)}</td>
        <td>${renderDocTypeBadge(d.type)}</td>
        <td>${escapeHtmlDoc(d.location)}</td>
        <td>${escapeHtmlDoc(d.startDate)}</td>
        <td>${escapeHtmlDoc(d.endDate)}</td>
        <td>${renderDocStatusBadge(d.status, d.remainingDays)}</td>
        <td class="text-muted small">${escapeHtmlDoc(d.note)}</td>
      </tr>`;
    } else {
      return `<tr>
        <td>${escapeHtmlDoc(d.regDate)}</td>
        <td>${escapeHtmlDoc(d.name)}</td>
        <td>${renderDocTypeBadge(d.type)}</td>
        <td>${escapeHtmlDoc(d.location)}</td>
        <td>${escapeHtmlDoc(d.startDate)}</td>
        <td>${escapeHtmlDoc(d.endDate)}</td>
        <td class="text-muted small">${escapeHtmlDoc(d.note)}</td>
      </tr>`;
    }
  });
  tbody.innerHTML = rows.join('');
}

/**
 * 渲染预警面板
 */
function renderAlertPanel() {
  const alertData = documentsState.cleanData.filter(d => d.status === 'warning' || d.status === 'expired');
  const panel = document.getElementById('docAlertPanel');
  const tbody = document.getElementById('docAlertBody');
  const countBadge = document.getElementById('docAlertCount');

  countBadge.textContent = `${alertData.length}项`;

  if (alertData.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  // 按剩余天数升序排列（最紧急的在前）
  alertData.sort((a, b) => a.remainingDays - b.remainingDays);

  const rows = alertData.map(d => {
    const rowClass = d.status === 'expired' ? 'row-expired' : 'row-warning';
    const daysText = d.status === 'expired'
      ? `<span class="text-danger fw-bold">已过期${Math.abs(d.remainingDays)}天</span>`
      : `<span class="text-warning fw-bold">${d.remainingDays}天</span>`;
    return `<tr class="${rowClass}">
      <td><strong>${escapeHtmlDoc(d.name)}</strong></td>
      <td>${renderDocTypeBadge(d.type)}</td>
      <td>${escapeHtmlDoc(d.location)}</td>
      <td>${escapeHtmlDoc(d.endDate)}</td>
      <td>${daysText}</td>
      <td class="small">${escapeHtmlDoc(d.note)}</td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('');
}

function updateDocStatsBadges() {
  const all = documentsState.cleanData;
  const total = all.length;
  const expired = all.filter(d => d.status === 'expired').length;
  const warning = all.filter(d => d.status === 'warning').length;
  const normal = total - expired - warning;

  document.getElementById('docTotalRecords').textContent = `📁 总数量：${total}项`;
  document.getElementById('docNormalCount').textContent = `✅ 正常：${normal}`;
  document.getElementById('docWarningCount').textContent = `⚠️ 预警：${warning}`;
  document.getElementById('docExpiredCount').textContent = `❌ 已过期：${expired}`;
  document.getElementById('docRawCount').textContent = `${documentsState.rawData.length}条`;
  document.getElementById('docCleanCount').textContent = `${total}条`;
}

/**
 * 重新计算所有 cleanData 的剩余天数与状态（预警阈值变化时调用）
 */
function recalculateAllDocStatuses() {
  documentsState.cleanData.forEach(d => {
    const remainingDays = calcRemainingDays(d.endDate);
    d.remainingDays = remainingDays;
    if (remainingDays < 0) d.status = 'expired';
    else if (remainingDays <= WARNING_DAYS) d.status = 'warning';
    else d.status = 'normal';
  });
}

/**
 * 更新 UI 中所有与预警天数相关的显示
 */
function updateWarningDaysUI() {
  // 更新输入框
  const input = document.getElementById('docWarningDaysInput');
  if (input) input.value = WARNING_DAYS;
  // 更新筛选下拉中的天数文案
  const statusSelect = document.getElementById('docFilterStatus');
  if (statusSelect) {
    const warningOpt = statusSelect.querySelector('option[value="warning"]');
    if (warningOpt) warningOpt.textContent = `即将到期（≤${WARNING_DAYS}天）`;
  }
  // 更新预警面板标题
  const alertHeader = document.querySelector('#docAlertPanel .card-header span');
  if (alertHeader) alertHeader.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-2"></i>即将到期预警（≤${WARNING_DAYS}天）`;
}

function refreshAllDocViews() {
  renderDocTable(documentsState.rawData, 'docRawBody', false);
  renderDocTable(documentsState.filteredData, 'docCleanBody', true);
  renderAlertPanel();
  updateDocStatsBadges();
  renderAllDocCharts();
}

/* ---------- ECharts 图表 ---------- */
function getDocChart(domId) {
  if (!documentsState.charts[domId]) {
    const dom = document.getElementById(domId);
    if (!dom) return null;
    documentsState.charts[domId] = echarts.init(dom);
  }
  return documentsState.charts[domId];
}

function resizeDocCharts() {
  Object.values(documentsState.charts).forEach(chart => {
    if (chart && !chart.isDisposed()) chart.resize();
  });
}

/**
 * 饼图：证件类型数量分布
 */
function renderDocPieChart() {
  const chart = getDocChart('chartDocPie');
  if (!chart) return;

  const typeCount = {};
  documentsState.cleanData.forEach(d => {
    typeCount[d.type] = (typeCount[d.type] || 0) + 1;
  });
  const pieData = Object.entries(typeCount).map(([name, value]) => ({ name, value }));

  const colorMap = {
    '身份证件': '#0dcaf0', '房产证明': '#198754',
    '驾驶证件': '#ffc107', '医疗保险': '#dc3545',
    '人寿保险': '#0d6efd', '车辆保险': '#6c757d'
  };

  chart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}：{c} 项 ({d}%)' },
    legend: { orient: 'horizontal', bottom: 10, textStyle: { fontSize: 11 } },
    series: [{
      name: '证件类型', type: 'pie', radius: ['40%','70%'], center: ['50%','45%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2, color: p => colorMap[p.name] || '#adb5bd' },
      label: { show: true, formatter: '{b}\n{c}项', fontSize: 11 },
      emphasis: { label: { fontSize: 16, fontWeight: 'bold' } },
      data: pieData
    }]
  });
}

/**
 * 柱状图：到期月份分布
 */
function renderDocExpiryMonthChart() {
  const chart = getDocChart('chartDocExpiryMonth');
  if (!chart) return;

  // 统计未来12个月的到期数量
  const today = new Date();
  const monthLabels = [];
  const monthCounts = [];

  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const label = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    monthLabels.push(label);
    monthCounts.push(0);
  }

  documentsState.cleanData.forEach(doc => {
    const expiryKey = `${doc.expiryYear}-${String(doc.expiryMonth).padStart(2,'0')}`;
    const idx = monthLabels.indexOf(expiryKey);
    if (idx >= 0) monthCounts[idx]++;
  });

  chart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: p => `${p[0].axisValue}<br/>到期数量：<b>${p[0].value} 项</b>` },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '8%', containLabel: true },
    xAxis: { type: 'category', data: monthLabels, axisLabel: { rotate: 45, fontSize: 10 } },
    yAxis: { type: 'value', name: '数量 (项)', minInterval: 1 },
    series: [{
      name: '到期数量', type: 'bar', data: monthCounts,
      itemStyle: {
        borderRadius: [6,6,0,0],
        color: function(params) {
          // 预警月份用红色，正常用蓝色
          const idx = params.dataIndex;
          return idx <= 2 ? '#dc3545' : '#0d6efd';
        }
      },
      label: { show: true, position: 'top', fontSize: 11, fontWeight: 'bold' }
    }]
  });
}

function renderAllDocCharts() {
  renderDocPieChart();
  renderDocExpiryMonthChart();
}

/* ---------- CSV导入 ---------- */
function importDocCSV(csvText) {
  Papa.parse(csvText, {
    header: true, skipEmptyLines: true, encoding: 'UTF-8',
    complete: function(results) {
      if (!results.data || results.data.length === 0) {
        showDocStatus('CSV文件为空或无有效数据', 'danger'); return;
      }
      const requiredHeaders = ['登记日期','证件/保单名称','证件类型','保管位置','生效日期','到期日期','备注'];
      const actualHeaders = results.meta.fields || [];
      const missingHeaders = requiredHeaders.filter(h => !actualHeaders.includes(h));
      if (missingHeaders.length > 0) {
        showDocStatus(`CSV表头不匹配，缺少字段：${missingHeaders.join('、')}`, 'danger'); return;
      }
      const { rawData, cleanData, discarded } = batchCleanDocs(results.data);
      documentsState.rawData = documentsState.rawData.concat(rawData);
      documentsState.cleanData = documentsState.cleanData.concat(cleanData);
      documentsState.filteredData = applyDocFilter();
      saveDocumentsData();
      refreshAllDocViews();
      showDocStatus(`导入成功！原始${results.data.length}条，合规${cleanData.length}条，丢弃${discarded}条`, 'success');
    },
    error: function(err) { showDocStatus(`CSV解析失败：${err.message}`, 'danger'); }
  });
}

function showDocStatus(msg, type) {
  const el = document.getElementById('docUploadStatus');
  const iconMap = { success:'check-circle', danger:'exclamation-circle', warning:'exclamation-triangle' };
  const icon = iconMap[type] || 'info-circle';
  el.innerHTML = `<i class="bi bi-${icon} text-${type} me-1"></i>${msg}`;
}

/* ---------- 事件绑定 ---------- */
function bindDocumentsEvents() {
  // CSV文件上传
  document.getElementById('csvDocInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    showDocStatus('正在读取文件...', 'warning');
    const reader = new FileReader();
    reader.onload = function(evt) { importDocCSV(evt.target.result.replace(/^\uFEFF/, '')); };
    reader.onerror = function() { showDocStatus('文件读取失败，请重试', 'danger'); };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  });

  // 加载示例数据
  document.getElementById('btnDocDemo').addEventListener('click', function() {
    importDocCSV(DEMO_DOC_CSV);
  });

  // 清空全部
  document.getElementById('btnDocClear').addEventListener('click', function() {
    if (documentsState.rawData.length === 0 && documentsState.cleanData.length === 0) {
      showDocStatus('没有数据需要清空', 'warning'); return;
    }
    if (confirm(`确定要清空全部数据吗？\n原始数据：${documentsState.rawData.length}条\n合规数据：${documentsState.cleanData.length}条\n此操作不可恢复！`)) {
      documentsState.rawData = [];
      documentsState.cleanData = [];
      documentsState.filteredData = [];
      saveDocumentsData();
      refreshAllDocViews();
      showDocStatus('已清空全部数据', 'success');
    }
  });

  // 手动新增
  document.getElementById('formDocAdd').addEventListener('submit', function(e) {
    e.preventDefault();
    const regDate = document.getElementById('docRegDate').value;
    const name = document.getElementById('docName').value.trim();
    const type = document.getElementById('docType').value;
    const location = document.getElementById('docLocation').value.trim() || '未标注';
    const startDate = document.getElementById('docStartDate').value;
    const endDate = document.getElementById('docEndDate').value;
    const note = document.getElementById('docNote').value.trim();

    if (!regDate || !name || !type || !startDate || !endDate) { alert('请填写所有必填字段！'); return; }

    if (new Date(startDate) > new Date(endDate)) {
      alert('生效日期不能晚于到期日期！'); return;
    }

    const remainingDays = calcRemainingDays(endDate);
    let status = 'normal';
    if (remainingDays < 0) status = 'expired';
    else if (remainingDays <= WARNING_DAYS) status = 'warning';

    const cleaned = {
      regDate, name, type, location, startDate, endDate, remainingDays, status, note,
      expiryYear: parseInt(endDate.substring(0,4), 10),
      expiryMonth: parseInt(endDate.substring(5,7), 10)
    };

    documentsState.rawData.push({ regDate, name, type, location, startDate, endDate, note });
    documentsState.cleanData.push(cleaned);
    saveDocumentsData();
    documentsState.filteredData = applyDocFilter();
    refreshAllDocViews();
    showDocStatus(`手动新增成功：${name}`, 'success');
    document.getElementById('formDocAdd').reset();
    document.getElementById('docType').value = '身份证件';
  });

  // 筛选控件
  document.getElementById('docFilterType').addEventListener('change', onDocFilterChange);
  document.getElementById('docFilterStatus').addEventListener('change', onDocFilterChange);
  document.getElementById('docFilterKeyword').addEventListener('input', function() {
    clearTimeout(window._docKeywordTimer);
    window._docKeywordTimer = setTimeout(onDocFilterChange, 300);
  });
  document.getElementById('btnDocReset').addEventListener('click', function() {
    document.getElementById('docFilterType').value = 'all';
    document.getElementById('docFilterStatus').value = 'all';
    document.getElementById('docFilterKeyword').value = '';
    onDocFilterChange();
  });

  // 预警天数输入
  document.getElementById('docWarningDaysInput')?.addEventListener('change', function() {
    const val = parseInt(this.value, 10);
    if (isNaN(val) || val < 1) {
      this.value = WARNING_DAYS;
      return;
    }
    setWarningDays(val);
  });
  // 回车确认
  document.getElementById('docWarningDaysInput')?.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { this.blur(); }
  });

  // 窗口大小变化
  window.addEventListener('resize', function() {
    clearTimeout(window._docResizeTimer);
    window._docResizeTimer = setTimeout(resizeDocCharts, 200);
  });
}

/* ---------- 示例CSV数据 ---------- */
const DEMO_DOC_CSV = `登记日期,证件/保单名称,证件类型,保管位置,生效日期,到期日期,备注
2020-03-15,身份证-张三,身份证件,书房抽屉,2020-03-15,2040-03-15,长期有效
2021-06-01,房产证-XX小区,房产证明,银行保险柜,2021-06-01,2099-12-31,永久产权
2022-01-10,驾驶证-张三,驾驶证件,随身钱包,2022-01-10,2028-01-10,首次申领
2023-05-20,社保卡-张三,身份证件,卧室床头柜,2023-05-20,2099-12-31,长期
2024-01-01,平安百万医疗险,医疗保险,文件柜A区,2024-01-01,2026-01-01,年度续保
2024-03-15,中国人寿终身寿险,人寿保险,文件柜B区,2024-03-15,2054-03-15,30年期
2024-06-01,人保车险-京A88888,车辆保险,车内手套箱,2024-06-01,2025-06-01,年度续保
2024-07-01,身份证-李四,身份证件,书房抽屉,2024-07-01,2044-07-01,配偶证件
2024-08-15,驾驶证-李四,驾驶证件,随身提包,2024-08-15,2030-08-15,配偶驾照
2024-09-01,太平医保补充险,医疗保险,文件柜A区,2024-09-01,2026-09-01,2年期
2024-10-10,房产证-YY小区,房产证明,银行保险柜,2024-10-10,2099-12-31,投资房产
2024-11-01,太平洋车险-京B66666,车辆保险,车内手套箱,2024-11-01,2025-11-01,第二辆车
2025-01-15,泰康养老险,人寿保险,文件柜B区,2025-01-15,2035-01-15,10年期
2025-02-01,众安门诊险,医疗保险,文件柜A区,2025-02-01,2026-02-01,年度续保
2025-03-01,身份证-王五,身份证件,书房抽屉,2025-03-01,2045-03-01,子女证件
2025-04-15,驾驶证-王五,驾驶证件,随身钱包,2025-04-15,2031-04-15,子女驾照
2025-05-01,阳光车险-京C12345,车辆保险,车内手套箱,2025-05-01,2026-05-01,第三辆车
2025-06-01,华夏重疾险,人寿保险,文件柜B区,2025-06-01,2045-06-01,20年期`;

/* ---------- 初始化 ---------- */
function initDocuments() {
  console.log('[台账-证件] 模块初始化');
  loadDocumentsData();
  bindDocumentsEvents();
  updateWarningDaysUI();
  documentsState.filteredData = applyDocFilter();
  refreshAllDocViews();
  if (
    documentsState.cleanData.length === 0 &&
    (typeof FamilyAuth === 'undefined' || FamilyAuth.shouldUseDemoData())
  ) {
    importDocCSV(DEMO_DOC_CSV);
  }
}
