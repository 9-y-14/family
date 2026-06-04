/**
 * ============================================================
 *  家庭人情随礼账单统计平台 - 核心业务逻辑
 *  技术栈：原生JS + PapaParse + ECharts5
 *  数据全部在浏览器本地处理，无后端、无数据库
 * ============================================================
 */

/* ---------- 全局状态 ---------- */
const state = {
  rawData: [],      // 原始导入的全部数据（未经清洗）
  cleanData: [],    // 清洗后的合规数据
  filteredData: [], // 当前筛选后的数据
  charts: {}        // 存放4个ECharts实例引用
};

// localStorage存储键名
const STORAGE_KEY_HISTORY = 'hbmd_leaf_picker_history';

/**
 * 从localStorage读取历史输入记忆
 * @returns {object} { names: [], regions: [] }
 */
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (raw) {
      const data = JSON.parse(raw);
      return {
        names: data.names || [],
        regions: data.regions || []
      };
    }
  } catch (e) {
    console.warn('[记忆] 读取历史记录失败', e);
  }
  return { names: [], regions: [] };
}

/**
 * 保存历史输入记忆到localStorage
 * @param {string} name - 送礼对象名称
 * @param {string} region - 所在地区
 */
function saveHistory(name, region) {
  try {
    const history = loadHistory();
    // 去重追加，限制最多存储50条
    if (name && !history.names.includes(name)) {
      history.names.unshift(name);
      if (history.names.length > 50) history.names.pop();
    }
    if (region && !history.regions.includes(region)) {
      history.regions.unshift(region);
      if (history.regions.length > 50) history.regions.pop();
    }
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
  } catch (e) {
    console.warn('[记忆] 保存历史记录失败', e);
  }
}

/**
 * 从清洗后的数据中提取已有的名称/地区，合并到历史记忆中
 */
function syncHistoryFromData() {
  const history = loadHistory();
  state.cleanData.forEach(d => {
    if (d.name && !history.names.includes(d.name)) {
      history.names.push(d.name);
    }
    if (d.region && d.region !== '未知地区' && !history.regions.includes(d.region)) {
      history.regions.push(d.region);
    }
  });
  // 限制50条
  if (history.names.length > 50) history.names = history.names.slice(-50);
  if (history.regions.length > 50) history.regions = history.regions.slice(-50);
  try {
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
  } catch (e) { /* ignore */ }
}

/**
 * 更新datalist下拉建议
 */
function updateDatalists() {
  const history = loadHistory();

  // 更新送礼对象建议列表
  const nameList = document.getElementById('nameList');
  if (nameList) {
    nameList.innerHTML = history.names.map(n => `<option value="${escapeHtml(n)}">`).join('');
  }

  // 更新所在地区建议列表
  const regionList = document.getElementById('regionList');
  if (regionList) {
    regionList.innerHTML = history.regions.map(r => `<option value="${escapeHtml(r)}">`).join('');
  }
}

// 合法的事件类型枚举
const VALID_EVENT_TYPES = ['喜事', '白事', '节日送礼'];

// 四个季节的月份划分：春3-5, 夏6-8, 秋9-11, 冬12-2
const SEASON_MAP = {
  '春季': [3, 4, 5],
  '夏季': [6, 7, 8],
  '秋季': [9, 10, 11],
  '冬季': [12, 1, 2]
};

/* ---------- 工具函数 ---------- */

/**
 * 判断日期字符串是否合法，支持多种格式
 * @param {string} dateStr - 原始日期字符串
 * @returns {string|null} 返回 YYYY-MM-DD 格式日期，非法返回 null
 */
function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (trimmed === '') return null;

  // 尝试匹配 YYYY-MM-DD 或 YYYY/MM/DD 或 YYYY.MM.DD 或 YYYY年MM月DD日
  const patterns = [
    /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/,    // 2024-01-15 / 2024/1/5
    /^(\d{4})年(\d{1,2})月(\d{1,2})日$/,            // 2024年1月5日
    /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/,      // 01-15-2024 (美式)
    /^(\d{2})(\d{2})(\d{2})$/                       // 240115 (YYMMDD)
  ];

  let year, month, day;

  for (let i = 0; i < patterns.length; i++) {
    const match = trimmed.match(patterns[i]);
    if (match) {
      if (i === 2) {
        // 美式格式 MM-DD-YYYY
        month = parseInt(match[1], 10);
        day = parseInt(match[2], 10);
        year = parseInt(match[3], 10);
      } else if (i === 3) {
        // YYMMDD
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

  // 年份合理范围：2000-2099
  if (year < 2000 || year > 2099) return null;
  // 月份范围
  if (month < 1 || month > 12) return null;
  // 日期范围
  if (day < 1 || day > 31) return null;

  // 使用Date验证日期合法性（处理闰年2月29日等情况）
  const dateObj = new Date(year, month - 1, day);
  if (
    dateObj.getFullYear() !== year ||
    dateObj.getMonth() !== month - 1 ||
    dateObj.getDate() !== day
  ) {
    return null;
  }

  // 返回统一格式 YYYY-MM-DD
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 判断礼金金额是否合法（非负、非空、有效数字）
 * @param {string|number} val - 金额值
 * @returns {number|null} 合法返回数字，非法返回null
 */
function parseAmount(val) {
  if (val === undefined || val === null || val === '') return null;
  const num = parseFloat(String(val).replace(/[^\d.-]/g, '').trim());
  if (isNaN(num) || num < 0) return null;
  // 金额上限：单笔不超过100万
  if (num > 1000000) return null;
  return Math.round(num * 100) / 100; // 保留两位小数
}

/**
 * 判断事件类型是否合法
 * @param {string} val
 * @returns {string|null}
 */
function parseEventType(val) {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  return VALID_EVENT_TYPES.includes(trimmed) ? trimmed : null;
}

/* ---------- 数据清洗核心 ---------- */

/**
 * 清洗单条CSV记录
 * @param {object} row - PapaParse解析的单行对象 { '随礼日期': ..., '送礼对象': ..., ... }
 * @param {number} index - 行号（用于日志）
 * @returns {object|null} 清洗后的合规数据对象，不合法返回null
 */
function cleanRow(row, index) {
  // 读取原始字段
  const rawDate = row['随礼日期'];
  const rawName = row['送礼对象'];
  const rawType = row['事件类型'];
  const rawAmount = row['礼金金额'];
  const rawRegion = row['所在地区'];
  const rawNote = row['备注'] || '';

  // 逐字段清洗
  const date = parseDate(rawDate);
  if (!date) {
    console.warn(`[清洗] 第${index}行：日期不合法 -> "${rawDate}"，已丢弃`);
    return null;
  }

  const amount = parseAmount(rawAmount);
  if (amount === null) {
    console.warn(`[清洗] 第${index}行：金额不合法 -> "${rawAmount}"，已丢弃`);
    return null;
  }

  const eventType = parseEventType(rawType);
  if (!eventType) {
    console.warn(`[清洗] 第${index}行：事件类型不合法 -> "${rawType}"，已丢弃`);
    return null;
  }

  const name = rawName ? String(rawName).trim() : '';
  if (!name) {
    console.warn(`[清洗] 第${index}行：送礼对象为空，已丢弃`);
    return null;
  }

  // 所在地区为选填，空值设为"未知地区"
  const region = (rawRegion && String(rawRegion).trim()) ? String(rawRegion).trim() : '未知地区';

  // 返回清洗后的合规数据
  return {
    date: date,           // YYYY-MM-DD
    name: name,           // 送礼对象
    type: eventType,      // 喜事|白事|节日送礼
    amount: amount,       // 礼金金额（数字）
    region: region,       // 所在地区
    note: String(rawNote).trim(), // 备注
    year: parseInt(date.substring(0, 4), 10),  // 年份（便于筛选）
    month: parseInt(date.substring(5, 7), 10)   // 月份（便于统计）
  };
}

/**
 * 批量清洗数据：删除空数据、异常负数金额、错误日期格式
 * @param {Array} rawRows - PapaParse解析后的原始行数组
 * @returns {object} { rawData, cleanData, discarded }
 */
function batchClean(rawRows) {
  const rawData = [];
  const cleanData = [];
  let discarded = 0;

  rawRows.forEach((row, i) => {
    // 保留原始行数据用于展示
    const rawRecord = {
      date: row['随礼日期'] || '',
      name: row['送礼对象'] || '',
      type: row['事件类型'] || '',
      amount: row['礼金金额'] || '',
      region: row['所在地区'] || '',
      note: row['备注'] || ''
    };
    rawData.push(rawRecord);

    // 执行清洗
    const cleaned = cleanRow(row, i + 1);
    if (cleaned) {
      cleanData.push(cleaned);
    } else {
      discarded++;
    }
  });

  console.log(`[清洗] 原始${rawRows.length}条 -> 合规${cleanData.length}条 -> 丢弃${discarded}条`);
  return { rawData, cleanData, discarded };
}

/* ---------- 聚合统计（前端JS批量运算） ---------- */

/**
 * 按年份聚合总礼金
 * @param {Array} data - 清洗后数据
 * @returns {object} { '2024': 8888, '2025': 9999 }
 */
function aggregateByYear(data) {
  const result = {};
  data.forEach(d => {
    result[d.year] = (result[d.year] || 0) + d.amount;
  });
  return result;
}

/**
 * 按年月聚合月度消费走势
 * @param {Array} data
 * @returns {Map} key: 'YYYY-MM', value: 总金额
 */
function aggregateByMonth(data) {
  const result = {};
  data.forEach(d => {
    const key = `${d.year}-${String(d.month).padStart(2, '0')}`;
    result[key] = (result[key] || 0) + d.amount;
  });
  return result;
}

/**
 * 按事件类型聚合
 * @param {Array} data
 * @returns {object} { '喜事': 888, '白事': 666, ... }
 */
function aggregateByType(data) {
  const result = {};
  data.forEach(d => {
    result[d.type] = (result[d.type] || 0) + d.amount;
  });
  return result;
}

/**
 * 按地区聚合
 * @param {Array} data
 * @returns {object} { '北京': 888, '上海': 666, ... }
 */
function aggregateByRegion(data) {
  const result = {};
  data.forEach(d => {
    result[d.region] = (result[d.region] || 0) + d.amount;
  });
  return result;
}

/**
 * 按四季聚合
 * 春季：3-5月, 夏季：6-8月, 秋季：9-11月, 冬季：12-2月
 * @param {Array} data
 * @returns {object} { '春季': 888, '夏季': 666, ... }
 */
function aggregateBySeason(data) {
  const result = { '春季': 0, '夏季': 0, '秋季': 0, '冬季': 0 };
  data.forEach(d => {
    if (d.month >= 3 && d.month <= 5) result['春季'] += d.amount;
    else if (d.month >= 6 && d.month <= 8) result['夏季'] += d.amount;
    else if (d.month >= 9 && d.month <= 11) result['秋季'] += d.amount;
    else result['冬季'] += d.amount; // 12, 1, 2
  });
  return result;
}

/* ---------- UI渲染 ---------- */

/**
 * 渲染数据表格
 * @param {Array} data - 数据数组
 * @param {string} tbodyId - tbody元素ID
 * @param {boolean} isClean - 是否为清洗后数据（控制金额格式化）
 */
function renderTable(data, tbodyId, isClean) {
  const tbody = document.getElementById(tbodyId);
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">暂无数据</td></tr>';
    return;
  }

  const rows = data.map((d, i) => {
    const dateVal = isClean ? d.date : d.date;
    const amountVal = isClean ? d.amount.toFixed(2) : d.amount;
    // 清洗后数据的金额用绿色高亮
    const amountClass = isClean ? 'text-success fw-bold' : '';
    return `
      <tr>
        <td>${escapeHtml(dateVal)}</td>
        <td>${escapeHtml(d.name)}</td>
        <td>${renderTypeBadge(d.type)}</td>
        <td class="${amountClass}">¥${escapeHtml(String(amountVal))}</td>
        <td>${escapeHtml(d.region)}</td>
        <td class="text-muted small">${escapeHtml(d.note)}</td>
      </tr>`;
  });

  tbody.innerHTML = rows.join('');
}

/**
 * 渲染事件类型徽章
 * @param {string} type
 * @returns {string} HTML字符串
 */
function renderTypeBadge(type) {
  const map = {
    '喜事': 'bg-success',
    '白事': 'bg-secondary',
    '节日送礼': 'bg-warning text-dark'
  };
  const cls = map[type] || 'bg-light text-dark';
  return `<span class="badge ${cls}">${escapeHtml(type)}</span>`;
}

/**
 * HTML转义，防止XSS
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str && str !== 0) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 更新统计数据徽章
 */
function updateStatsBadges() {
  const data = state.filteredData;
  const totalAmount = data.reduce((sum, d) => sum + d.amount, 0);
  document.getElementById('statsTotalRecords').textContent = `总记录：${data.length}条`;
  document.getElementById('statsTotalAmount').textContent = `总礼金：¥${totalAmount.toFixed(2)}`;
  document.getElementById('rawCount').textContent = `${state.rawData.length}条`;
  document.getElementById('cleanCount').textContent = `${state.cleanData.length}条`;
}

/**
 * 更新筛选下拉框中的年份选项
 */
function updateFilterYears() {
  const select = document.getElementById('filterYear');
  const years = [...new Set(state.cleanData.map(d => d.year))].sort();
  const currentVal = select.value;
  select.innerHTML = '<option value="all">全部年份</option>';
  years.forEach(y => {
    select.innerHTML += `<option value="${y}">${y}年</option>`;
  });
  // 恢复之前的选择
  if ([...select.options].some(o => o.value === currentVal)) {
    select.value = currentVal;
  }
}

/* ---------- 筛选逻辑 ---------- */

/**
 * 根据筛选条件过滤数据
 * @returns {Array} 筛选后的数据
 */
function applyFilter() {
  const yearFilter = document.getElementById('filterYear').value;
  const typeFilter = document.getElementById('filterType').value;
  const keyword = (document.getElementById('filterKeyword').value || '').trim().toLowerCase();

  let result = [...state.cleanData];

  if (yearFilter !== 'all') {
    result = result.filter(d => d.year === parseInt(yearFilter, 10));
  }
  if (typeFilter !== 'all') {
    result = result.filter(d => d.type === typeFilter);
  }
  // 关键字模糊搜索：人名、地区、备注
  if (keyword) {
    result = result.filter(d =>
      d.name.toLowerCase().includes(keyword) ||
      d.region.toLowerCase().includes(keyword) ||
      d.note.toLowerCase().includes(keyword)
    );
  }

  return result;
}

/**
 * 筛选变更时刷新全部视图
 */
function onFilterChange() {
  state.filteredData = applyFilter();
  refreshAllViews();
}

/**
 * 刷新所有视图：表格 + 图表 + 统计
 */
function refreshAllViews() {
  renderTable(state.rawData, 'rawTableBody', false);
  renderTable(state.filteredData, 'cleanTableBody', true);
  updateStatsBadges();
  updateFilterYears();
  renderAllCharts();
}

/* ---------- ECharts 图表渲染 ---------- */

/**
 * 初始化/获取ECharts实例
 * @param {string} domId - DOM元素ID
 * @returns {object} ECharts实例
 */
function getChartInstance(domId) {
  if (!state.charts[domId]) {
    const dom = document.getElementById(domId);
    if (!dom) return null;
    state.charts[domId] = echarts.init(dom);
  }
  return state.charts[domId];
}

/**
 * 销毁并重新初始化所有图表（响应窗口大小变化）
 */
function resizeAllCharts() {
  Object.values(state.charts).forEach(chart => {
    if (chart && !chart.isDisposed()) {
      chart.resize();
    }
  });
}

/**
 * 图表1：月度花销折线图
 */
function renderMonthlyChart() {
  const chart = getChartInstance('chartMonthly');
  if (!chart) return;

  const monthlyData = aggregateByMonth(state.filteredData);
  // 按时间排序
  const sortedKeys = Object.keys(monthlyData).sort();
  const values = sortedKeys.map(k => parseFloat(monthlyData[k].toFixed(2)));

  chart.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: function(params) {
        return `${params[0].axisValue}<br/>礼金总额：<b>¥${params[0].value.toFixed(2)}</b>`;
      }
    },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '8%', containLabel: true },
    xAxis: {
      type: 'category',
      data: sortedKeys,
      axisLabel: { rotate: 45, fontSize: 10 },
      boundaryGap: false
    },
    yAxis: {
      type: 'value',
      name: '金额 (元)',
      axisLabel: { formatter: '¥{value}' }
    },
    series: [{
      name: '月度花销',
      type: 'line',
      data: values,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { color: '#dc3545', width: 2 },
      itemStyle: { color: '#dc3545' },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(220,53,69,0.3)' },
          { offset: 1, color: 'rgba(220,53,69,0.02)' }
        ])
      }
    }]
  });
}

/**
 * 图表2：事件分类饼图
 */
function renderPieChart() {
  const chart = getChartInstance('chartPie');
  if (!chart) return;

  const typeData = aggregateByType(state.filteredData);
  const pieData = Object.entries(typeData).map(([name, value]) => ({
    name, value: parseFloat(value.toFixed(2))
  }));

  // 定义事件类型对应的颜色
  const colorMap = { '喜事': '#198754', '白事': '#6c757d', '节日送礼': '#ffc107' };

  chart.setOption({
    tooltip: {
      trigger: 'item',
      formatter: '{b}：¥{c} ({d}%)'
    },
    legend: {
      orient: 'horizontal',
      bottom: 10,
      textStyle: { fontSize: 12 }
    },
    series: [{
      name: '事件类型',
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 6,
        borderColor: '#fff',
        borderWidth: 2,
        color: function(params) {
          return colorMap[params.name] || '#adb5bd';
        }
      },
      label: {
        show: true,
        formatter: '{b}\n¥{c}',
        fontSize: 11
      },
      emphasis: {
        label: { fontSize: 16, fontWeight: 'bold' }
      },
      data: pieData
    }]
  });
}

/**
 * 图表3：地区开销柱状图（横向，排行）
 */
function renderRegionChart() {
  const chart = getChartInstance('chartRegion');
  if (!chart) return;

  const regionData = aggregateByRegion(state.filteredData);
  // 按金额降序排列，取前15个地区
  const sorted = Object.entries(regionData)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  const regions = sorted.map(d => d[0]);
  const amounts = sorted.map(d => parseFloat(d[1].toFixed(2)));

  chart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: function(params) {
        return `${params[0].name}<br/>礼金总额：<b>¥${params[0].value.toFixed(2)}</b>`;
      }
    },
    grid: { left: '3%', right: '8%', bottom: '3%', top: '3%', containLabel: true },
    xAxis: {
      type: 'value',
      name: '金额 (元)',
      axisLabel: { formatter: '¥{value}' }
    },
    yAxis: {
      type: 'category',
      data: regions.reverse(),
      axisLabel: { fontSize: 11 },
      inverse: true
    },
    series: [{
      name: '地区开销',
      type: 'bar',
      data: amounts.reverse(),
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: '#dc3545' },
          { offset: 1, color: '#ff6b6b' }
        ]),
        borderRadius: [0, 4, 4, 0]
      },
      label: {
        show: true,
        position: 'right',
        formatter: '¥{c}',
        fontSize: 10
      }
    }]
  });
}

/**
 * 图表4：四季支出柱状图
 */
function renderSeasonChart() {
  const chart = getChartInstance('chartSeason');
  if (!chart) return;

  const seasonData = aggregateBySeason(state.filteredData);
  const seasons = ['春季', '夏季', '秋季', '冬季'];
  const values = seasons.map(s => parseFloat(seasonData[s].toFixed(2)));
  // 四季颜色
  const colors = ['#28a745', '#dc3545', '#fd7e14', '#0d6efd'];

  chart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: function(params) {
        const s = params[0].name;
        const v = params[0].value;
        const months = SEASON_MAP[s].join('、');
        return `${s}（${months}月）<br/>礼金总额：<b>¥${v.toFixed(2)}</b>`;
      }
    },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '8%', containLabel: true },
    xAxis: {
      type: 'category',
      data: seasons,
      axisLabel: { fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      name: '金额 (元)',
      axisLabel: { formatter: '¥{value}' }
    },
    series: [{
      name: '四季支出',
      type: 'bar',
      data: values.map((v, i) => ({
        value: v,
        itemStyle: {
          color: colors[i],
          borderRadius: [6, 6, 0, 0]
        }
      })),
      barWidth: '50%',
      label: {
        show: true,
        position: 'top',
        formatter: '¥{c}',
        fontSize: 11,
        fontWeight: 'bold'
      }
    }]
  });
}

/**
 * 渲染全部4个图表
 */
function renderAllCharts() {
  renderMonthlyChart();
  renderPieChart();
  renderRegionChart();
  renderSeasonChart();
}

/* ---------- CSV导入处理 ---------- */

/**
 * 解析并导入CSV文件内容
 * @param {string} csvText - CSV文本内容
 */
function importCSV(csvText) {
  // 使用PapaParse解析CSV，header:true 自动将第一行作为字段名
  Papa.parse(csvText, {
    header: true,           // 首行为表头
    skipEmptyLines: true,   // 跳过空行
    encoding: 'UTF-8',
    complete: function(results) {
      if (!results.data || results.data.length === 0) {
        showStatus('CSV文件为空或无有效数据', 'danger');
        return;
      }

      // 检查表头是否匹配
      const requiredHeaders = ['随礼日期', '送礼对象', '事件类型', '礼金金额', '所在地区', '备注'];
      const actualHeaders = results.meta.fields || [];
      const missingHeaders = requiredHeaders.filter(h => !actualHeaders.includes(h));

      if (missingHeaders.length > 0) {
        showStatus(`CSV表头不匹配，缺少字段：${missingHeaders.join('、')}`, 'danger');
        console.error('期望表头：', requiredHeaders, '实际表头：', actualHeaders);
        return;
      }

      // 批量清洗数据
      const { rawData, cleanData, discarded } = batchClean(results.data);

      // 更新全局状态（追加模式）
      state.rawData = state.rawData.concat(rawData);
      state.cleanData = state.cleanData.concat(cleanData);
      state.filteredData = applyFilter();

      // 同步历史记忆并更新datalist
      syncHistoryFromData();
      updateDatalists();

      // 刷新UI
      refreshAllViews();
      showStatus(`导入成功！原始${results.data.length}条，合规${cleanData.length}条，丢弃${discarded}条`, 'success');
    },
    error: function(err) {
      showStatus(`CSV解析失败：${err.message}`, 'danger');
      console.error('PapaParse解析错误：', err);
    }
  });
}

/**
 * 显示上传状态信息
 * @param {string} msg - 状态文本
 * @param {string} type - bootstrap颜色类型
 */
function showStatus(msg, type) {
  const el = document.getElementById('uploadStatus');
  const iconMap = { success: 'check-circle', danger: 'exclamation-circle', warning: 'exclamation-triangle' };
  const icon = iconMap[type] || 'info-circle';
  el.innerHTML = `<i class="bi bi-${icon} text-${type} me-1"></i>${msg}`;
}

/* ---------- 事件绑定 ---------- */

/**
 * 初始化所有事件监听器
 */
function bindEvents() {
  // CSV文件上传
  document.getElementById('csvFileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    showStatus('正在读取文件...', 'warning');

    const reader = new FileReader();
    reader.onload = function(evt) {
      const csvText = evt.target.result;
      // 尝试用UTF-8解码，如果是BOM头则去除
      const cleanedText = csvText.replace(/^\uFEFF/, '');
      importCSV(cleanedText);
    };
    reader.onerror = function() {
      showStatus('文件读取失败，请重试', 'danger');
    };
    reader.readAsText(file, 'UTF-8');
    // 重置input以便可以重复选择同一文件
    e.target.value = '';
  });

  // 加载示例数据
  document.getElementById('btnLoadDemo').addEventListener('click', function() {
    importCSV(DEMO_CSV_DATA);
  });

  // 清空全部数据
  document.getElementById('btnClearAll').addEventListener('click', function() {
    if (state.rawData.length === 0 && state.cleanData.length === 0) {
      showStatus('没有数据需要清空', 'warning');
      return;
    }
    if (confirm(`确定要清空全部数据吗？\n原始数据：${state.rawData.length}条\n合规数据：${state.cleanData.length}条\n此操作不可恢复！`)) {
      state.rawData = [];
      state.cleanData = [];
      state.filteredData = [];
      refreshAllViews();
      showStatus('已清空全部数据', 'success');
    }
  });

  // 手动添加账单
  document.getElementById('manualAddForm').addEventListener('submit', function(e) {
    e.preventDefault();

    const dateVal = document.getElementById('inputDate').value;
    const nameVal = document.getElementById('inputName').value.trim();
    const typeVal = document.getElementById('inputType').value;
    const amountVal = document.getElementById('inputAmount').value;
    const regionVal = document.getElementById('inputRegion').value.trim() || '未知地区';
    const noteVal = document.getElementById('inputNote').value.trim();

    // 表单验证（所在地区为选填）
    if (!dateVal || !nameVal || !typeVal || !amountVal) {
      alert('请填写所有必填字段！');
      return;
    }

    const amount = parseFloat(amountVal);
    if (isNaN(amount) || amount < 0) {
      alert('礼金金额必须为非负数字！');
      return;
    }

    // 构造清洗后的记录
    const cleaned = {
      date: dateVal,
      name: nameVal,
      type: typeVal,
      amount: Math.round(amount * 100) / 100,
      region: regionVal,
      note: noteVal,
      year: parseInt(dateVal.substring(0, 4), 10),
      month: parseInt(dateVal.substring(5, 7), 10)
    };

    // 同时添加到原始数据和清洗后数据
    state.rawData.push({
      date: dateVal, name: nameVal, type: typeVal,
      amount: String(amount), region: regionVal, note: noteVal
    });
    state.cleanData.push(cleaned);

    // 保存输入记忆
    saveHistory(nameVal, regionVal !== '未知地区' ? regionVal : '');
    updateDatalists();

    state.filteredData = applyFilter();
    refreshAllViews();
    showStatus(`手动添加成功：${nameVal} - ¥${amount.toFixed(2)}`, 'success');

    // 重置表单
    document.getElementById('manualAddForm').reset();
    document.getElementById('inputType').value = '喜事';
  });

  // 筛选控件
  document.getElementById('filterYear').addEventListener('change', onFilterChange);
  document.getElementById('filterType').addEventListener('change', onFilterChange);
  // 关键字搜索：输入时防抖300ms
  document.getElementById('filterKeyword').addEventListener('input', function() {
    clearTimeout(window._keywordTimer);
    window._keywordTimer = setTimeout(onFilterChange, 300);
  });
  document.getElementById('btnResetFilter').addEventListener('click', function() {
    document.getElementById('filterYear').value = 'all';
    document.getElementById('filterType').value = 'all';
    document.getElementById('filterKeyword').value = '';
    onFilterChange();
  });

  // 窗口大小变化时重绘图表
  window.addEventListener('resize', function() {
    clearTimeout(window._resizeTimer);
    window._resizeTimer = setTimeout(resizeAllCharts, 200);
  });
}

/* ---------- 示例CSV数据 ---------- */

/**
 * 内置示例数据，方便测试
 * 涵盖多年度、多类型、多地区、多季节的数据
 */
const DEMO_CSV_DATA = `随礼日期,送礼对象,事件类型,礼金金额,所在地区,备注
2023-01-15,张三,喜事,500,北京,同事结婚
2023-02-20,李四,白事,300,上海,亲戚白事
2023-03-08,王五,节日送礼,200,广州,春节拜年
2023-04-12,赵六,喜事,800,深圳,朋友婚礼
2023-05-01,孙七,节日送礼,150,杭州,劳动节送礼
2023-06-18,周八,喜事,600,成都,表妹结婚
2023-07-22,吴九,白事,400,武汉,邻居白事
2023-08-30,郑十,节日送礼,300,南京,中秋节送礼
2023-09-10,陈一,喜事,1000,北京,好友婚礼
2023-10-25,林二,白事,500,上海,远亲白事
2023-11-11,黄三,节日送礼,250,广州,双十一聚会
2023-12-20,何四,喜事,700,深圳,同学结婚
2024-01-08,刘五,节日送礼,350,杭州,元旦送礼
2024-02-14,杨六,喜事,900,成都,同事结婚
2024-03-05,吕七,白事,450,武汉,亲戚白事
2024-04-18,马八,喜事,550,南京,朋友婚礼
2024-05-20,朱九,节日送礼,280,北京,520节日
2024-06-15,许十,白事,600,上海,邻居白事
2024-07-30,谢一,喜事,1200,广州,表弟结婚
2024-08-08,冯二,节日送礼,400,深圳,七夕送礼
2024-09-12,韩三,喜事,850,杭州,好友婚礼
2024-10-01,曹四,节日送礼,500,成都,国庆送礼
2024-11-20,邓五,白事,350,武汉,远亲白事
2024-12-25,彭六,节日送礼,200,南京,圣诞送礼
2025-01-01,萧七,喜事,1500,北京,亲弟结婚
2025-02-10,蔡八,节日送礼,380,上海,春节送礼
2025-03-15,潘九,白事,500,广州,亲戚白事
2025-04-22,田十,喜事,650,深圳,同事结婚
2025-05-08,胡一,节日送礼,300,杭州,母亲节送礼
2025-06-28,范二,喜事,1100,成都,好友婚礼
2025-07-15,方三,白事,420,武汉,邻居白事
2025-08-18,石四,节日送礼,450,南京,中秋送礼
2025-09-25,姚五,喜事,750,北京,同学结婚
2025-10-10,谭六,白事,550,上海,远亲白事
2025-11-05,廖七,节日送礼,260,广州,感恩节送礼
2025-12-30,邹八,喜事,950,深圳,表妹结婚
2023-02-28,金九,喜事,880,杭州,朋友婚礼
2023-07-07,陆十,喜事,720,成都,同事结婚
2024-03-22,崔一,节日送礼,180,武汉,春分送礼
2024-09-30,苏二,白事,480,南京,亲戚白事
2025-05-15,姜三,节日送礼,320,北京,端午送礼
2025-08-25,魏四,喜事,1050,上海,好友婚礼`;

/* ---------- 页面初始化 ---------- */

/**
 * 页面加载完成后初始化
 */
document.addEventListener('DOMContentLoaded', function() {
  console.log('[初始化] 家庭人情随礼账单统计平台启动');
  console.log('[初始化] 技术栈：HTML5 + Bootstrap5 + PapaParse + ECharts5');
  console.log('[初始化] 数据模式：纯前端本地处理，无后端无数据库');

  // 加载历史输入记忆，更新datalist
  updateDatalists();

  // 绑定事件
  bindEvents();

  // 初始化图表（空数据）
  renderAllCharts();

  // 自动加载示例数据（仅未登录时显示）
  if (typeof FamilyAuth === 'undefined' || FamilyAuth.shouldUseDemoData()) {
    importCSV(DEMO_CSV_DATA);
    console.log('[初始化] 已加载示例数据');
  } else {
    console.log('[初始化] 已登录，跳过示例数据');
  }
});
