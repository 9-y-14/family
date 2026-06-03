/**
 * ============================================================
 *  家庭人情收礼账单统计平台 - 核心业务逻辑
 *  技术栈：原生JS + Tesseract.js(OCR) + PapaParse + ECharts5
 *  数据全部在浏览器本地处理，无后端、无数据库
 * ============================================================
 */

/* ---------- 全局状态 ---------- */
const incomeState = {
  rawData: [],       // 原始导入的全部数据（未经清洗）
  cleanData: [],     // 清洗后的合规数据
  filteredData: [],  // 当前筛选后的数据
  ocrParsedData: [], // OCR识别后解析出的待确认数据
  charts: {}         // 存放4个ECharts实例引用
};

// localStorage存储键名（收礼页面独立）
const STORAGE_KEY_HISTORY_INCOME = 'hbmd_income_picker_history';

// 合法的事件类型枚举
const VALID_EVENT_TYPES_INCOME = ['喜事', '白事', '节日收礼'];

/**
 * 从localStorage读取历史输入记忆
 * @returns {object} { names: [], regions: [] }
 */
function loadHistoryIncome() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY_INCOME);
    if (raw) {
      const data = JSON.parse(raw);
      return { names: data.names || [], regions: data.regions || [] };
    }
  } catch (e) {
    console.warn('[收礼-记忆] 读取历史记录失败', e);
  }
  return { names: [], regions: [] };
}

/**
 * 保存历史输入记忆到localStorage
 */
function saveHistoryIncome(name, region) {
  try {
    const history = loadHistoryIncome();
    if (name && !history.names.includes(name)) {
      history.names.unshift(name);
      if (history.names.length > 50) history.names.pop();
    }
    if (region && !history.regions.includes(region)) {
      history.regions.unshift(region);
      if (history.regions.length > 50) history.regions.pop();
    }
    localStorage.setItem(STORAGE_KEY_HISTORY_INCOME, JSON.stringify(history));
  } catch (e) {
    console.warn('[收礼-记忆] 保存历史记录失败', e);
  }
}

/**
 * 从清洗后的数据中提取已有的名称/地区，合并到历史记忆中
 */
function syncHistoryFromDataIncome() {
  const history = loadHistoryIncome();
  incomeState.cleanData.forEach(d => {
    if (d.name && !history.names.includes(d.name)) {
      history.names.push(d.name);
    }
    if (d.region && d.region !== '未知地区' && !history.regions.includes(d.region)) {
      history.regions.push(d.region);
    }
  });
  if (history.names.length > 50) history.names = history.names.slice(-50);
  if (history.regions.length > 50) history.regions = history.regions.slice(-50);
  try {
    localStorage.setItem(STORAGE_KEY_HISTORY_INCOME, JSON.stringify(history));
  } catch (e) { /* ignore */ }
}

/**
 * 更新datalist下拉建议
 */
function updateDatalistsIncome() {
  const history = loadHistoryIncome();
  const nameList = document.getElementById('nameListIncome');
  if (nameList) {
    nameList.innerHTML = history.names.map(n => `<option value="${escapeHtmlIncome(n)}">`).join('');
  }
  const regionList = document.getElementById('regionListIncome');
  if (regionList) {
    regionList.innerHTML = history.regions.map(r => `<option value="${escapeHtmlIncome(r)}">`).join('');
  }
}

/* ---------- 工具函数 ---------- */

/**
 * 判断日期字符串是否合法，统一为 YYYY-MM-DD
 */
function parseDateIncome(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (trimmed === '') return null;

  // 多种格式匹配
  const patterns = [
    /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/,     // 2024-01-15
    /^(\d{4})年(\d{1,2})月(\d{1,2})日$/,             // 2024年1月5日
    /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/,       // 01-15-2024
    /^(\d{2})(\d{2})(\d{2})$/                        // 240115
  ];

  let year, month, day;
  for (let i = 0; i < patterns.length; i++) {
    const match = trimmed.match(patterns[i]);
    if (match) {
      if (i === 2) {
        month = parseInt(match[1], 10);
        day = parseInt(match[2], 10);
        year = parseInt(match[3], 10);
      } else if (i === 3) {
        const yy = parseInt(match[1], 10);
        year = yy < 50 ? 2000 + yy : 1900 + yy;
        month = parseInt(match[2], 10);
        day = parseInt(match[3], 10);
      } else {
        year = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        day = parseInt(match[3], 10);
      }
      break;
    }
  }

  if (!year || !month || !day) return null;
  if (year < 2000 || year > 2099) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const dateObj = new Date(year, month - 1, day);
  if (dateObj.getFullYear() !== year || dateObj.getMonth() !== month - 1 || dateObj.getDate() !== day) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 解析金额
 */
function parseAmountIncome(val) {
  if (val === undefined || val === null || val === '') return null;
  const num = parseFloat(String(val).replace(/[^\d.-]/g, '').trim());
  if (isNaN(num) || num < 0) return null;
  if (num > 1000000) return null;
  return Math.round(num * 100) / 100;
}

/**
 * 判断事件类型
 */
function parseEventTypeIncome(val) {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  return VALID_EVENT_TYPES_INCOME.includes(trimmed) ? trimmed : null;
}

/**
 * HTML转义
 */
function escapeHtmlIncome(str) {
  if (!str && str !== 0) return '';
  const s = String(str);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/**
 * 渲染事件类型徽章
 */
function renderTypeBadgeIncome(type) {
  const map = { '喜事': 'bg-success', '白事': 'bg-secondary', '节日收礼': 'bg-warning text-dark' };
  const cls = map[type] || 'bg-light text-dark';
  return `<span class="badge ${cls}">${escapeHtmlIncome(type)}</span>`;
}

/* ---------- 数据清洗核心 ---------- */

/**
 * 清洗单条记录
 */
function cleanRowIncome(row, index) {
  const rawDate = row['收礼日期'] || row['date'];
  const rawName = row['送礼人'] || row['name'];
  const rawType = row['事件类型'] || row['type'];
  const rawAmount = row['礼金金额'] || row['amount'];
  const rawRegion = row['所在地区'] || row['region'];
  const rawNote = row['备注'] || row['note'] || '';

  const date = parseDateIncome(rawDate);
  if (!date) { console.warn(`[收礼-清洗] 第${index}行：日期不合法，已丢弃`); return null; }

  const amount = parseAmountIncome(rawAmount);
  if (amount === null) { console.warn(`[收礼-清洗] 第${index}行：金额不合法，已丢弃`); return null; }

  const eventType = parseEventTypeIncome(rawType);
  if (!eventType) { console.warn(`[收礼-清洗] 第${index}行：事件类型不合法，已丢弃`); return null; }

  const name = rawName ? String(rawName).trim() : '';
  if (!name) { console.warn(`[收礼-清洗] 第${index}行：送礼人为空，已丢弃`); return null; }

  const region = (rawRegion && String(rawRegion).trim()) ? String(rawRegion).trim() : '未知地区';

  return {
    date, name, type: eventType, amount,
    region, note: String(rawNote).trim(),
    year: parseInt(date.substring(0, 4), 10),
    month: parseInt(date.substring(5, 7), 10)
  };
}

/**
 * 批量清洗
 */
function batchCleanIncome(rawRows) {
  const rawData = [];
  const cleanData = [];
  let discarded = 0;

  rawRows.forEach((row, i) => {
    rawData.push({
      date: row['收礼日期'] || row['date'] || '',
      name: row['送礼人'] || row['name'] || '',
      type: row['事件类型'] || row['type'] || '',
      amount: row['礼金金额'] || row['amount'] || '',
      region: row['所在地区'] || row['region'] || '',
      note: row['备注'] || row['note'] || ''
    });
    const cleaned = cleanRowIncome(row, i + 1);
    if (cleaned) { cleanData.push(cleaned); } else { discarded++; }
  });

  console.log(`[收礼-清洗] 原始${rawRows.length}条 -> 合规${cleanData.length}条 -> 丢弃${discarded}条`);
  return { rawData, cleanData, discarded };
}

/* ---------- OCR 图片识别处理 ---------- */

/**
 * OCR识别结果文本中解析收礼记录
 * 策略：按行扫描，尝试匹配 "日期,人名,事件,金额,地区,备注" 模式
 * 同时支持自由文本中提取：日期+金额+人名 组合
 */
function parseOCRText(text) {
  const records = [];
  if (!text || !text.trim()) return records;

  const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 3);

  for (const line of lines) {
    // 尝试逗号分隔格式
    if (line.includes(',') || line.includes('，')) {
      const parts = line.split(/[,，]/).map(s => s.trim());
      if (parts.length >= 4) {
        const record = {
          '收礼日期': parts[0] || '',
          '送礼人': parts[1] || '',
          '事件类型': parts[2] || '',
          '礼金金额': parts[3] || '',
          '所在地区': parts[4] || '',
          '备注': parts[5] || ''
        };
        records.push(record);
        continue;
      }
    }

    // 尝试空格/制表符分隔
    if (line.includes('\t') || line.match(/\s{2,}/)) {
      const parts = line.split(/[\t]+|\s{2,}/).map(s => s.trim()).filter(s => s);
      if (parts.length >= 4) {
        const record = {
          '收礼日期': parts[0] || '',
          '送礼人': parts[1] || '',
          '事件类型': parts[2] || '',
          '礼金金额': parts[3] || '',
          '所在地区': parts[4] || '',
          '备注': parts.slice(5).join(' ') || ''
        };
        records.push(record);
        continue;
      }
    }

    // 自由文本解析：查找日期模式 + 金额模式 + 人名
    const dateMatch = line.match(/(\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日)/);
    const amountMatch = line.match(/(\d+\.?\d*)\s*元?/);
    const nameMatch = line.match(/[从给自]?([\u4e00-\u9fa5]{2,4})(?:送|随|给)/);

    if (dateMatch && amountMatch) {
      const record = {
        '收礼日期': dateMatch[0],
        '送礼人': nameMatch ? nameMatch[1] : '未知',
        '事件类型': '喜事', // 默认
        '礼金金额': amountMatch[1],
        '所在地区': '',
        '备注': line
      };
      records.push(record);
    }
  }

  console.log(`[收礼-OCR解析] 从文本中解析出 ${records.length} 条记录`);
  return records;
}

/**
 * 执行OCR识别
 */
function performOCR(file) {
  const statusEl = document.getElementById('ocrStatus');
  const progressBar = document.getElementById('ocrProgressBar');
  const progressBarInner = progressBar.querySelector('.progress-bar');
  const resultBox = document.getElementById('ocrResultBox');
  const resultText = document.getElementById('ocrResultText');
  const btnConfirm = document.getElementById('btnConfirmOCR');
  const btnStart = document.getElementById('btnStartOCR');

  // 显示进度条
  progressBar.style.display = 'block';
  progressBarInner.style.width = '0%';
  progressBarInner.textContent = '0%';
  resultBox.style.display = 'none';
  btnConfirm.disabled = true;
  btnStart.disabled = true;
  statusEl.innerHTML = '<i class="bi bi-hourglass-split me-1 text-primary"></i>正在进行OCR识别，请耐心等待...';

  // 使用Tesseract.js进行OCR
  Tesseract.recognize(
    file,
    'chi_sim+eng', // 中文简体 + 英文
    {
      logger: function(m) {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          progressBarInner.style.width = pct + '%';
          progressBarInner.textContent = pct + '%';
        }
      }
    }
  ).then(function(result) {
    progressBar.style.display = 'none';
    btnStart.disabled = false;

    const text = result.data.text;
    if (!text || !text.trim()) {
      statusEl.innerHTML = '<i class="bi bi-exclamation-circle text-warning me-1"></i>未能识别到文字，请尝试更清晰的图片';
      resultBox.style.display = 'none';
      btnConfirm.disabled = true;
      return;
    }

    // 显示识别结果
    resultText.textContent = text;
    resultBox.style.display = 'block';

    // 解析识别文本
    incomeState.ocrParsedData = parseOCRText(text);

    if (incomeState.ocrParsedData.length === 0) {
      statusEl.innerHTML = '<i class="bi bi-exclamation-triangle text-warning me-1"></i>识别成功，但未能解析出收礼记录格式。可查看下方文本手动录入。';
      btnConfirm.disabled = true;
    } else {
      statusEl.innerHTML = `<i class="bi bi-check-circle text-success me-1"></i>OCR识别完成，解析出 <b>${incomeState.ocrParsedData.length}</b> 条记录，请确认导入`;
      btnConfirm.disabled = false;
    }
  }).catch(function(err) {
    progressBar.style.display = 'none';
    btnStart.disabled = false;
    btnConfirm.disabled = true;
    statusEl.innerHTML = '<i class="bi bi-x-circle text-danger me-1"></i>OCR识别失败：' + err.message;
    console.error('[收礼-OCR] 识别错误：', err);
  });
}

/* ---------- 聚合统计 ---------- */

function aggregateByMonthIncome(data) {
  const result = {};
  data.forEach(d => {
    const key = `${d.year}-${String(d.month).padStart(2, '0')}`;
    result[key] = (result[key] || 0) + d.amount;
  });
  return result;
}

function aggregateByTypeIncome(data) {
  const result = {};
  data.forEach(d => { result[d.type] = (result[d.type] || 0) + d.amount; });
  return result;
}

function aggregateByRegionIncome(data) {
  const result = {};
  data.forEach(d => { result[d.region] = (result[d.region] || 0) + d.amount; });
  return result;
}

function aggregateByPersonIncome(data) {
  const result = {};
  data.forEach(d => { result[d.name] = (result[d.name] || 0) + d.amount; });
  return result;
}

/* ---------- UI渲染 ---------- */

function renderTableIncome(data, tbodyId, isClean) {
  const tbody = document.getElementById(tbodyId);
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">暂无数据</td></tr>';
    return;
  }
  const rows = data.map(d => {
    const amountClass = isClean ? 'text-success fw-bold' : '';
    return `<tr>
      <td>${escapeHtmlIncome(isClean ? d.date : d.date)}</td>
      <td>${escapeHtmlIncome(d.name)}</td>
      <td>${renderTypeBadgeIncome(d.type)}</td>
      <td class="${amountClass}">¥${escapeHtmlIncome(String(isClean ? d.amount.toFixed(2) : d.amount))}</td>
      <td>${escapeHtmlIncome(d.region)}</td>
      <td class="text-muted small">${escapeHtmlIncome(d.note)}</td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('');
}

function updateStatsBadgesIncome() {
  const data = incomeState.filteredData;
  const totalAmount = data.reduce((sum, d) => sum + d.amount, 0);
  document.getElementById('statsTotalRecordsIncome').textContent = `总记录：${data.length}条`;
  document.getElementById('statsTotalAmountIncome').textContent = `总收礼：¥${totalAmount.toFixed(2)}`;
  document.getElementById('rawCountIncome').textContent = `${incomeState.rawData.length}条`;
  document.getElementById('cleanCountIncome').textContent = `${incomeState.cleanData.length}条`;
}

function updateFilterYearsIncome() {
  const select = document.getElementById('filterYearIncome');
  const years = [...new Set(incomeState.cleanData.map(d => d.year))].sort();
  const currentVal = select.value;
  select.innerHTML = '<option value="all">全部年份</option>';
  years.forEach(y => { select.innerHTML += `<option value="${y}">${y}年</option>`; });
  if ([...select.options].some(o => o.value === currentVal)) {
    select.value = currentVal;
  }
}

/* ---------- 筛选逻辑 ---------- */

function applyFilterIncome() {
  const yearFilter = document.getElementById('filterYearIncome').value;
  const typeFilter = document.getElementById('filterTypeIncome').value;
  const keyword = (document.getElementById('filterKeywordIncome').value || '').trim().toLowerCase();

  let result = [...incomeState.cleanData];
  if (yearFilter !== 'all') result = result.filter(d => d.year === parseInt(yearFilter, 10));
  if (typeFilter !== 'all') result = result.filter(d => d.type === typeFilter);
  if (keyword) {
    result = result.filter(d =>
      d.name.toLowerCase().includes(keyword) ||
      d.region.toLowerCase().includes(keyword) ||
      d.note.toLowerCase().includes(keyword)
    );
  }
  return result;
}

function onFilterChangeIncome() {
  incomeState.filteredData = applyFilterIncome();
  refreshAllViewsIncome();
}

function refreshAllViewsIncome() {
  renderTableIncome(incomeState.rawData, 'rawTableBodyIncome', false);
  renderTableIncome(incomeState.filteredData, 'cleanTableBodyIncome', true);
  updateStatsBadgesIncome();
  updateFilterYearsIncome();
  renderAllChartsIncome();
}

/* ---------- ECharts 图表渲染 ---------- */

function getChartInstanceIncome(domId) {
  if (!incomeState.charts[domId]) {
    const dom = document.getElementById(domId);
    if (!dom) return null;
    incomeState.charts[domId] = echarts.init(dom);
  }
  return incomeState.charts[domId];
}

function resizeAllChartsIncome() {
  Object.values(incomeState.charts).forEach(chart => {
    if (chart && !chart.isDisposed()) chart.resize();
  });
}

/**
 * 图表1：月度收礼折线图
 */
function renderMonthlyChartIncome() {
  const chart = getChartInstanceIncome('chartMonthlyIncome');
  if (!chart) return;
  const monthlyData = aggregateByMonthIncome(incomeState.filteredData);
  const sortedKeys = Object.keys(monthlyData).sort();
  const values = sortedKeys.map(k => parseFloat(monthlyData[k].toFixed(2)));

  chart.setOption({
    tooltip: { trigger: 'axis', formatter: p => `${p[0].axisValue}<br/>收礼总额：<b>¥${p[0].value.toFixed(2)}</b>` },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '8%', containLabel: true },
    xAxis: { type: 'category', data: sortedKeys, axisLabel: { rotate: 45, fontSize: 10 }, boundaryGap: false },
    yAxis: { type: 'value', name: '金额 (元)', axisLabel: { formatter: '¥{value}' } },
    series: [{
      name: '月度收礼', type: 'line', data: values, smooth: true,
      symbol: 'circle', symbolSize: 6,
      lineStyle: { color: '#0d6efd', width: 2 },
      itemStyle: { color: '#0d6efd' },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(13,110,253,0.3)' },
        { offset: 1, color: 'rgba(13,110,253,0.02)' }
      ])}
    }]
  });
}

/**
 * 图表2：事件分类饼图
 */
function renderPieChartIncome() {
  const chart = getChartInstanceIncome('chartPieIncome');
  if (!chart) return;
  const typeData = aggregateByTypeIncome(incomeState.filteredData);
  const pieData = Object.entries(typeData).map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }));
  const colorMap = { '喜事': '#198754', '白事': '#6c757d', '节日收礼': '#ffc107' };

  chart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}：¥{c} ({d}%)' },
    legend: { orient: 'horizontal', bottom: 10, textStyle: { fontSize: 12 } },
    series: [{
      name: '事件类型', type: 'pie', radius: ['40%', '70%'], center: ['50%', '45%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2,
        color: p => colorMap[p.name] || '#adb5bd'
      },
      label: { show: true, formatter: '{b}\n¥{c}', fontSize: 11 },
      emphasis: { label: { fontSize: 16, fontWeight: 'bold' } },
      data: pieData
    }]
  });
}

/**
 * 图表3：地区收礼排行
 */
function renderRegionChartIncome() {
  const chart = getChartInstanceIncome('chartRegionIncome');
  if (!chart) return;
  const regionData = aggregateByRegionIncome(incomeState.filteredData);
  const sorted = Object.entries(regionData).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const regions = sorted.map(d => d[0]);
  const amounts = sorted.map(d => parseFloat(d[1].toFixed(2)));

  chart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: p => `${p[0].name}<br/>收礼总额：<b>¥${p[0].value.toFixed(2)}</b>` },
    grid: { left: '3%', right: '8%', bottom: '3%', top: '3%', containLabel: true },
    xAxis: { type: 'value', name: '金额 (元)', axisLabel: { formatter: '¥{value}' } },
    yAxis: { type: 'category', data: regions.reverse(), axisLabel: { fontSize: 11 }, inverse: true },
    series: [{
      name: '地区收礼', type: 'bar', data: amounts.reverse(),
      itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
        { offset: 0, color: '#0d6efd' }, { offset: 1, color: '#6ea8fe' }
      ]), borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', formatter: '¥{c}', fontSize: 10 }
    }]
  });
}

/**
 * 图表4：送礼人金额排行Top10
 */
function renderPersonChartIncome() {
  const chart = getChartInstanceIncome('chartPersonIncome');
  if (!chart) return;
  const personData = aggregateByPersonIncome(incomeState.filteredData);
  const sorted = Object.entries(personData).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const persons = sorted.map(d => d[0]);
  const amounts = sorted.map(d => parseFloat(d[1].toFixed(2)));

  chart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: p => `${p[0].name}<br/>收礼总额：<b>¥${p[0].value.toFixed(2)}</b>` },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '8%', containLabel: true },
    xAxis: { type: 'category', data: persons, axisLabel: { rotate: 30, fontSize: 11 } },
    yAxis: { type: 'value', name: '金额 (元)', axisLabel: { formatter: '¥{value}' } },
    series: [{
      name: '送礼人', type: 'bar', data: amounts,
      itemStyle: { borderRadius: [6, 6, 0, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#198754' }, { offset: 1, color: '#75b798' }
        ])
      },
      label: { show: true, position: 'top', formatter: '¥{c}', fontSize: 10, fontWeight: 'bold' }
    }]
  });
}

function renderAllChartsIncome() {
  renderMonthlyChartIncome();
  renderPieChartIncome();
  renderRegionChartIncome();
  renderPersonChartIncome();
}

/* ---------- CSV导入 ---------- */

function importCSVIncome(csvText) {
  Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    encoding: 'UTF-8',
    complete: function(results) {
      if (!results.data || results.data.length === 0) {
        showStatusIncome('CSV文件为空或无有效数据', 'danger');
        return;
      }
      const requiredHeaders = ['收礼日期', '送礼人', '事件类型', '礼金金额', '所在地区', '备注'];
      const actualHeaders = results.meta.fields || [];
      const missingHeaders = requiredHeaders.filter(h => !actualHeaders.includes(h));
      if (missingHeaders.length > 0) {
        showStatusIncome(`CSV表头不匹配，缺少字段：${missingHeaders.join('、')}`, 'danger');
        return;
      }
      const { rawData, cleanData, discarded } = batchCleanIncome(results.data);
      incomeState.rawData = incomeState.rawData.concat(rawData);
      incomeState.cleanData = incomeState.cleanData.concat(cleanData);
      incomeState.filteredData = applyFilterIncome();
      syncHistoryFromDataIncome();
      updateDatalistsIncome();
      refreshAllViewsIncome();
      showStatusIncome(`导入成功！原始${results.data.length}条，合规${cleanData.length}条，丢弃${discarded}条`, 'success');
    },
    error: function(err) {
      showStatusIncome(`CSV解析失败：${err.message}`, 'danger');
    }
  });
}

function showStatusIncome(msg, type) {
  const el = document.getElementById('uploadStatusIncome');
  const iconMap = { success: 'check-circle', danger: 'exclamation-circle', warning: 'exclamation-triangle' };
  const icon = iconMap[type] || 'info-circle';
  el.innerHTML = `<i class="bi bi-${icon} text-${type} me-1"></i>${msg}`;
}

/* ---------- 批量录入辅助函数 ---------- */

/**
 * 在批量录入区增加一行（送礼人+金额）
 */
function addBatchRowIncome() {
  const container = document.getElementById('batchRowsContainerIncome');
  const idx = container.children.length + 1;
  const row = document.createElement('div');
  row.className = 'batch-row d-flex gap-1 mb-1 align-items-center';
  row.innerHTML = `
    <span class="small text-muted" style="width:20px;flex-shrink:0;">${idx}.</span>
    <input type="text" class="form-control form-control-sm batch-name" placeholder="送礼人" list="nameListIncome" style="min-width:0;">
    <input type="number" class="form-control form-control-sm batch-amount" placeholder="金额" min="0" step="0.01" style="width:80px;flex-shrink:0;">
    <button type="button" class="btn btn-outline-danger btn-sm batch-del-row" style="flex-shrink:0;padding:0 4px;font-size:0.7rem;" title="删除此行">&times;</button>
  `;
  // 删除行事件
  row.querySelector('.batch-del-row').addEventListener('click', function() {
    row.remove();
    refreshBatchRowNumbersIncome();
  });
  container.appendChild(row);
}

/**
 * 批量行删除后重新编号
 */
function refreshBatchRowNumbersIncome() {
  const rows = document.querySelectorAll('#batchRowsContainerIncome .batch-row');
  rows.forEach((row, i) => {
    const span = row.querySelector('span');
    if (span) span.textContent = (i + 1) + '.';
  });
}

/* ---------- 事件绑定 ---------- */

function bindEventsIncome() {
  // CSV文件上传
  document.getElementById('csvFileInputIncome').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    showStatusIncome('正在读取文件...', 'warning');
    const reader = new FileReader();
    reader.onload = function(evt) {
      importCSVIncome(evt.target.result.replace(/^\uFEFF/, ''));
    };
    reader.onerror = function() { showStatusIncome('文件读取失败，请重试', 'danger'); };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  });

  // 加载示例数据
  document.getElementById('btnLoadDemoIncome').addEventListener('click', function() {
    importCSVIncome(DEMO_INCOME_CSV_DATA);
  });

  // 清空全部
  document.getElementById('btnClearAllIncome').addEventListener('click', function() {
    if (incomeState.rawData.length === 0 && incomeState.cleanData.length === 0) {
      showStatusIncome('没有数据需要清空', 'warning');
      return;
    }
    if (confirm(`确定要清空全部数据吗？\n原始数据：${incomeState.rawData.length}条\n合规数据：${incomeState.cleanData.length}条\n此操作不可恢复！`)) {
      incomeState.rawData = [];
      incomeState.cleanData = [];
      incomeState.filteredData = [];
      refreshAllViewsIncome();
      showStatusIncome('已清空全部数据', 'success');
    }
  });

  // OCR图片选择 - 预览
  document.getElementById('ocrImageInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    // 预览图片
    const reader = new FileReader();
    reader.onload = function(evt) {
      document.getElementById('ocrPreview').src = evt.target.result;
      document.getElementById('ocrPreviewContainer').style.display = 'block';
      document.getElementById('ocrResultBox').style.display = 'none';
      document.getElementById('btnConfirmOCR').disabled = true;
      document.getElementById('ocrStatus').innerHTML = '<i class="bi bi-check-circle text-success me-1"></i>图片已加载，点击"开始识别"';
      incomeState.ocrParsedData = [];
      // 存储文件引用供OCR使用
      incomeState._ocrFile = file;
    };
    reader.readAsDataURL(file);
  });

  // 开始OCR识别
  document.getElementById('btnStartOCR').addEventListener('click', function() {
    if (!incomeState._ocrFile) {
      document.getElementById('ocrStatus').innerHTML = '<i class="bi bi-exclamation-circle text-warning me-1"></i>请先选择礼簿图片';
      return;
    }
    performOCR(incomeState._ocrFile);
  });

  // 确认导入OCR结果
  document.getElementById('btnConfirmOCR').addEventListener('click', function() {
    if (!incomeState.ocrParsedData || incomeState.ocrParsedData.length === 0) {
      alert('没有可导入的识别数据');
      return;
    }
    const { rawData, cleanData, discarded } = batchCleanIncome(incomeState.ocrParsedData);
    incomeState.rawData = incomeState.rawData.concat(rawData);
    incomeState.cleanData = incomeState.cleanData.concat(cleanData);
    incomeState.filteredData = applyFilterIncome();
    syncHistoryFromDataIncome();
    updateDatalistsIncome();
    refreshAllViewsIncome();
    document.getElementById('ocrStatus').innerHTML = `<i class="bi bi-check-circle text-success me-1"></i>已导入 ${cleanData.length} 条OCR识别记录（丢弃 ${discarded} 条）`;
    document.getElementById('btnConfirmOCR').disabled = true;
    incomeState.ocrParsedData = [];
  });

  // 手动添加
  document.getElementById('manualAddFormIncome').addEventListener('submit', function(e) {
    e.preventDefault();
    const dateVal = document.getElementById('inputDateIncome').value;
    const nameVal = document.getElementById('inputNameIncome').value.trim();
    const typeVal = document.getElementById('inputTypeIncome').value;
    const amountVal = document.getElementById('inputAmountIncome').value;
    const regionVal = document.getElementById('inputRegionIncome').value.trim() || '未知地区';
    const noteVal = document.getElementById('inputNoteIncome').value.trim();

    if (!dateVal || !nameVal || !typeVal || !amountVal) {
      alert('请填写所有必填字段！');
      return;
    }
    const amount = parseFloat(amountVal);
    if (isNaN(amount) || amount < 0) {
      alert('礼金金额必须为非负数字！');
      return;
    }

    const cleaned = {
      date: dateVal, name: nameVal, type: typeVal,
      amount: Math.round(amount * 100) / 100, region: regionVal, note: noteVal,
      year: parseInt(dateVal.substring(0, 4), 10),
      month: parseInt(dateVal.substring(5, 7), 10)
    };

    incomeState.rawData.push({
      date: dateVal, name: nameVal, type: typeVal,
      amount: String(amount), region: regionVal, note: noteVal
    });
    incomeState.cleanData.push(cleaned);
    saveHistoryIncome(nameVal, regionVal !== '未知地区' ? regionVal : '');
    updateDatalistsIncome();
    incomeState.filteredData = applyFilterIncome();
    refreshAllViewsIncome();
    showStatusIncome(`手动添加成功：${nameVal} - ¥${amount.toFixed(2)}`, 'success');
    document.getElementById('manualAddFormIncome').reset();
    document.getElementById('inputTypeIncome').value = '喜事';
  });

  // 筛选控件
  document.getElementById('filterYearIncome').addEventListener('change', onFilterChangeIncome);
  document.getElementById('filterTypeIncome').addEventListener('change', onFilterChangeIncome);
  document.getElementById('filterKeywordIncome').addEventListener('input', function() {
    clearTimeout(window._keywordTimerIncome);
    window._keywordTimerIncome = setTimeout(onFilterChangeIncome, 300);
  });
  document.getElementById('btnResetFilterIncome').addEventListener('click', function() {
    document.getElementById('filterYearIncome').value = 'all';
    document.getElementById('filterTypeIncome').value = 'all';
    document.getElementById('filterKeywordIncome').value = '';
    onFilterChangeIncome();
  });

  // 窗口大小变化重绘
  window.addEventListener('resize', function() {
    clearTimeout(window._resizeTimerIncome);
    window._resizeTimerIncome = setTimeout(resizeAllChartsIncome, 200);
  });
}

/* ---------- 示例CSV数据 ---------- */
const DEMO_INCOME_CSV_DATA = `收礼日期,送礼人,事件类型,礼金金额,所在地区,备注
2023-01-18,张三,喜事,1000,北京,婚礼收礼
2023-02-22,李四,白事,500,上海,白事吊唁金
2023-03-10,王五,节日收礼,300,广州,春节收礼
2023-04-15,赵六,喜事,1200,深圳,婚礼红包
2023-05-05,孙七,节日收礼,200,杭州,劳动节
2023-06-20,周八,喜事,800,成都,表姐婚礼
2023-07-25,吴九,白事,600,武汉,白事
2023-08-28,郑十,节日收礼,400,南京,中秋收礼
2023-09-12,陈一,喜事,1500,北京,婚礼
2023-10-28,林二,白事,700,上海,吊唁
2023-11-15,黄三,节日收礼,350,广州,双十一
2023-12-22,何四,喜事,900,深圳,同学婚礼
2024-01-10,刘五,节日收礼,450,杭州,元旦收礼
2024-02-16,杨六,喜事,1100,成都,婚礼
2024-03-08,吕七,白事,550,武汉,白事金
2024-04-20,马八,喜事,650,南京,婚礼
2024-05-22,朱九,节日收礼,380,北京,520收礼
2024-06-18,许十,白事,800,上海,吊唁
2024-07-28,谢一,喜事,1600,广州,表弟婚礼
2024-08-10,冯二,节日收礼,500,深圳,七夕收礼
2024-09-15,韩三,喜事,950,杭州,婚礼
2024-10-05,曹四,节日收礼,600,成都,国庆
2024-11-22,邓五,白事,450,武汉,白事
2024-12-28,彭六,节日收礼,300,南京,圣诞收礼
2025-01-05,萧七,喜事,2000,北京,亲弟婚礼
2025-02-12,蔡八,节日收礼,480,上海,春节收礼
2025-03-18,潘九,白事,650,广州,白事
2025-04-25,田十,喜事,750,深圳,婚礼
2025-05-10,胡一,节日收礼,400,杭州,母亲节
2025-06-25,范二,喜事,1300,成都,婚礼
2025-07-18,方三,白事,520,武汉,吊唁
2025-08-20,石四,节日收礼,550,南京,中秋
2025-09-28,姚五,喜事,850,北京,同学婚礼
2025-10-12,谭六,白事,680,上海,吊唁
2025-11-08,廖七,节日收礼,360,广州,感恩节
2025-12-26,邹八,喜事,1050,深圳,表妹婚礼`;

/* ---------- 页面初始化 ---------- */

document.addEventListener('DOMContentLoaded', function() {
  console.log('[收礼-初始化] 家庭人情收礼账单统计平台启动');
  console.log('[收礼-初始化] 技术栈：HTML5 + Bootstrap5 + Tesseract.js(OCR) + PapaParse + ECharts5');
  console.log('[收礼-初始化] 数据模式：纯前端本地处理，无后端无数据库');

  // 加载历史记忆
  updateDatalistsIncome();

  // 绑定事件
  bindEventsIncome();

  // 初始化图表
  renderAllChartsIncome();

  // 自动加载示例数据
  importCSVIncome(DEMO_INCOME_CSV_DATA);

  console.log('[收礼-初始化] 完成，已加载示例数据');
});
