/**
 * ============================================================
 *  模块1：人情往来记账 - 核心业务逻辑
 *  技术栈：原生JS + PapaParse + ECharts5
 *  数据全部在浏览器本地处理，无后端、无数据库
 *  支持：送礼（支出）/ 收礼（收入）双向记录
 * ============================================================
 */

/* ---------- 模块1全局状态 ---------- */
const accountingState = {
  rawData: [],       // 原始导入的全部数据（未经清洗）
  cleanData: [],     // 清洗后的合规数据
  filteredData: [],  // 当前筛选后的数据
  charts: {}         // 存放ECharts实例引用
};

const STORAGE_KEY_ACCOUNTING = 'family_ledger_accounting';

// 合法的事件类型枚举
const VALID_GIFT_TYPES = ['喜事', '白事', '节日送礼'];

// 合法的收支类型
const VALID_DIRECTIONS = ['支出', '收入'];

// 四季月份划分
const SEASON_MAP = { '春季': [3,4,5], '夏季': [6,7,8], '秋季': [9,10,11], '冬季': [12,1,2] };

/* ---------- 本地存储 ---------- */
function loadAccountingData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACCOUNTING);
    if (raw) {
      const data = JSON.parse(raw);
      accountingState.rawData = (data.rawData || []).map(d => ({
        ...d,
        direction: d.direction || '支出'
      }));
      accountingState.cleanData = (data.cleanData || []).map(d => ({
        ...d,
        direction: d.direction || '支出'
      }));
      // 对已有数据进行去重（清理历史重复数据）
      const beforeCount = accountingState.cleanData.length;
      accountingState.cleanData = deduplicateData(accountingState.cleanData);
      if (accountingState.cleanData.length < beforeCount) {
        console.log(`[记账-加载] 历史数据去重：${beforeCount}条 -> ${accountingState.cleanData.length}条，剔除${beforeCount - accountingState.cleanData.length}条重复`);
      }
    }
  } catch (e) { console.warn('[记账] 读取本地存储失败', e); }
}

function saveAccountingData() {
  try {
    const data = { rawData: accountingState.rawData, cleanData: accountingState.cleanData };
    localStorage.setItem(STORAGE_KEY_ACCOUNTING, JSON.stringify(data));
    if (typeof FamilySync !== 'undefined') FamilySync.notifyDataChanged();
  } catch (e) { console.warn('[记账] 保存本地存储失败', e); }
}

/* ---------- 删除单条记录 ---------- */
function deleteGiftRecord(filteredIndex) {
  const target = accountingState.filteredData[filteredIndex];
  if (!target) return;

  // 构建确认信息
  const dirText = target.direction === '收入' ? '收入' : '支出';
  const confirmMsg = `确认删除以下记录吗？\n\n` +
    `日期：${target.date}\n` +
    `对象：${target.name}\n` +
    `类型：${target.type}\n` +
    `收支：${dirText}\n` +
    `金额：¥${target.amount.toFixed(2)}\n` +
    `地区：${target.region}\n` +
    (target.note ? `备注：${target.note}\n` : '') +
    `\n此操作不可恢复！`;

  if (!confirm(confirmMsg)) return;

  // 在 cleanData 中找到对应索引并删除（用多重匹配确保精确）
  const cleanIdx = accountingState.cleanData.findIndex(d =>
    d.date === target.date &&
    d.name === target.name &&
    d.type === target.type &&
    d.direction === target.direction &&
    d.amount === target.amount &&
    d.region === target.region &&
    d.note === target.note
  );

  if (cleanIdx !== -1) {
    const removed = accountingState.cleanData.splice(cleanIdx, 1)[0];
    // 同步删除 rawData 中对应记录
    const rawIdx = accountingState.rawData.findIndex(d =>
      String(d.date) === String(target.date) &&
      String(d.name) === String(target.name) &&
      String(d.type) === String(target.type) &&
      String(d.region) === String(target.region) &&
      String(d.note) === String(target.note)
    );
    if (rawIdx !== -1) accountingState.rawData.splice(rawIdx, 1);

    saveAccountingData();
    accountingState.filteredData = applyFilter();
    refreshAllViews();
    showStatus(`已删除：${removed.name} - ¥${removed.amount.toFixed(2)}`, 'warning');
  }
}

/* ---------- 历史记忆 ---------- */
function loadHistory() {
  try {
    const raw = localStorage.getItem('family_ledger_gift_history');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { names: [], regions: [] };
}

function saveHistory(name, region) {
  try {
    const history = loadHistory();
    if (name && !history.names.includes(name)) {
      history.names.unshift(name);
      if (history.names.length > 50) history.names.pop();
    }
    if (region && region !== '未知地区' && !history.regions.includes(region)) {
      history.regions.unshift(region);
      if (history.regions.length > 50) history.regions.pop();
    }
    localStorage.setItem('family_ledger_gift_history', JSON.stringify(history));
  } catch (e) {}
}

function updateDatalists() {
  const history = loadHistory();
  const nameList = document.getElementById('giftNameList');
  const regionList = document.getElementById('giftRegionList');
  if (nameList) nameList.innerHTML = history.names.map(n => `<option value="${escapeHtml(n)}">`).join('');
  if (regionList) regionList.innerHTML = history.regions.map(r => `<option value="${escapeHtml(r)}">`).join('');
}

function syncHistoryFromData() {
  const history = loadHistory();
  accountingState.cleanData.forEach(d => {
    if (d.name && !history.names.includes(d.name)) history.names.push(d.name);
    if (d.region && d.region !== '未知地区' && !history.regions.includes(d.region)) history.regions.push(d.region);
  });
  if (history.names.length > 50) history.names = history.names.slice(-50);
  if (history.regions.length > 50) history.regions = history.regions.slice(-50);
  try { localStorage.setItem('family_ledger_gift_history', JSON.stringify(history)); } catch (e) {}
}

/* ---------- 工具函数 ---------- */
function escapeHtml(str) {
  if (!str && str !== 0) return '';
  const s = String(str);
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

/**
 * 检查是否存在完全重复的记录（日期、往来对象、事件类型、收支类型、金额、所在地区、备注全部相同）
 * @param {Object} record - 待检查的记录 { date, name, type, direction, amount, region, note }
 * @param {Array} existingData - 已有的数据数组
 * @returns {boolean} true=存在重复
 */
function isDuplicateRecord(record, existingData) {
  return existingData.some(d =>
    d.date === record.date &&
    d.name === record.name &&
    d.type === record.type &&
    d.direction === record.direction &&
    d.amount === record.amount &&
    d.region === record.region &&
    (d.note || '') === (record.note || '')
  );
}

/**
 * 对数据数组进行去重，只保留第一条完全重复的记录
 * @param {Array} data - 需要去重的数据数组
 * @returns {Array} 去重后的数据
 */
function deduplicateData(data) {
  const result = [];
  data.forEach(d => {
    if (!isDuplicateRecord(d, result)) {
      result.push(d);
    }
  });
  return result;
}

/**
 * 解析日期，统一返回 YYYY-MM-DD 格式
 */
function parseDate(dateStr) {
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
 * 解析金额，返回数字或null
 */
function parseAmount(val) {
  if (val === undefined || val === null || val === '') return null;
  const num = parseFloat(String(val).replace(/[^\d.-]/g, '').trim());
  if (isNaN(num) || num < 0 || num > 1000000) return null;
  return Math.round(num * 100) / 100;
}

/* ---------- 数据清洗 ---------- */
function cleanRow(row, index) {
  const rawDate = row['日期'] || row['随礼日期'];
  const rawName = row['往来对象'] || row['送礼对象'];
  const rawType = row['事件类型'];
  const rawDirection = row['收支类型'];
  const rawAmount = row['金额'] || row['礼金金额'];
  const rawRegion = row['所在地区'];
  const rawNote = row['备注'] || '';

  const date = parseDate(rawDate);
  if (!date) { console.warn(`[记账-清洗] 第${index}行：日期不合法 -> "${rawDate}"，已丢弃`); return null; }

  const amount = parseAmount(rawAmount);
  if (amount === null) { console.warn(`[记账-清洗] 第${index}行：金额不合法 -> "${rawAmount}"，已丢弃`); return null; }

  const trimmedType = rawType ? String(rawType).trim() : '';
  if (!VALID_GIFT_TYPES.includes(trimmedType)) { console.warn(`[记账-清洗] 第${index}行：事件类型不合法 -> "${rawType}"，已丢弃`); return null; }

  // 收支类型校验：兼容旧CSV无此字段，默认"支出"
  let direction = '支出';
  if (rawDirection !== undefined && rawDirection !== null && rawDirection !== '') {
    const trimmedDir = String(rawDirection).trim();
    if (VALID_DIRECTIONS.includes(trimmedDir)) {
      direction = trimmedDir;
    } else {
      console.warn(`[记账-清洗] 第${index}行：收支类型不合法 -> "${rawDirection}"，默认设为"支出"`);
    }
  }

  const name = rawName ? String(rawName).trim() : '';
  if (!name) { console.warn(`[记账-清洗] 第${index}行：往来对象为空，已丢弃`); return null; }

  const region = (rawRegion && String(rawRegion).trim()) ? String(rawRegion).trim() : '未知地区';

  return {
    date, name, type: trimmedType, direction, amount, region,
    note: String(rawNote).trim(),
    year: parseInt(date.substring(0,4), 10),
    month: parseInt(date.substring(5,7), 10)
  };
}

function batchClean(rawRows) {
  const rawData = [];
  const cleanData = [];
  let discarded = 0;
  let duplicateCount = 0;

  rawRows.forEach((row, i) => {
    rawData.push({
      date: row['日期'] || row['随礼日期'] || '',
      name: row['往来对象'] || row['送礼对象'] || '',
      type: row['事件类型'] || '',
      direction: row['收支类型'] || '',
      amount: row['金额'] || row['礼金金额'] || '',
      region: row['所在地区'] || '',
      note: row['备注'] || ''
    });
    const cleaned = cleanRow(row, i + 1);
    if (!cleaned) {
      discarded++;
    } else if (isDuplicateRecord(cleaned, accountingState.cleanData.concat(cleanData))) {
      // 与已有数据或本批次已通过的数据重复，跳过
      duplicateCount++;
      console.warn(`[记账-清洗] 第${i + 1}行：与已有数据完全重复（日期="${cleaned.date}", 对象="${cleaned.name}", 类型="${cleaned.type}", 收支="${cleaned.direction}", 金额="${cleaned.amount}", 地区="${cleaned.region}"），已跳过`);
    } else {
      cleanData.push(cleaned);
    }
  });

  console.log(`[记账-清洗] 原始${rawRows.length}条 -> 合规${cleanData.length}条 -> 丢弃${discarded}条 -> 去重${duplicateCount}条`);
  return { rawData, cleanData, discarded, duplicateCount };
}

/* ---------- 聚合统计 ---------- */
function aggregateByMonth(data, directionFilter) {
  const result = {};
  data.forEach(d => {
    if (directionFilter && d.direction !== directionFilter) return;
    const key = `${d.year}-${String(d.month).padStart(2,'0')}`;
    result[key] = (result[key] || 0) + d.amount;
  });
  return result;
}

function aggregateByType(data, directionFilter) {
  const result = {};
  data.forEach(d => {
    if (directionFilter && d.direction !== directionFilter) return;
    result[d.type] = (result[d.type] || 0) + d.amount;
  });
  return result;
}

function aggregateByRegion(data, directionFilter) {
  const result = {};
  data.forEach(d => {
    if (directionFilter && d.direction !== directionFilter) return;
    result[d.region] = (result[d.region] || 0) + d.amount;
  });
  return result;
}

function aggregateByYear(data, directionFilter) {
  const result = {};
  data.forEach(d => {
    if (directionFilter && d.direction !== directionFilter) return;
    result[d.year] = (result[d.year] || 0) + d.amount;
  });
  return result;
}

function aggregateBySeason(data, directionFilter) {
  const result = { '春季': { out: 0, in: 0 }, '夏季': { out: 0, in: 0 }, '秋季': { out: 0, in: 0 }, '冬季': { out: 0, in: 0 } };
  data.forEach(d => {
    let season;
    if (d.month >= 3 && d.month <= 5) season = '春季';
    else if (d.month >= 6 && d.month <= 8) season = '夏季';
    else if (d.month >= 9 && d.month <= 11) season = '秋季';
    else season = '冬季';
    if (d.direction === '收入') result[season].in += d.amount;
    else result[season].out += d.amount;
  });
  return result;
}

function aggregateByDirection(data) {
  const result = { '支出': 0, '收入': 0 };
  data.forEach(d => { result[d.direction] += d.amount; });
  return result;
}

/* ---------- 筛选逻辑 ---------- */
function applyFilter() {
  const yearFilter = document.getElementById('giftFilterYear').value;
  const typeFilter = document.getElementById('giftFilterType').value;
  const directionFilter = document.getElementById('giftFilterDirection').value;
  const keyword = (document.getElementById('giftFilterKeyword').value || '').trim().toLowerCase();

  let result = [...accountingState.cleanData];
  if (yearFilter !== 'all') result = result.filter(d => d.year === parseInt(yearFilter, 10));
  if (typeFilter !== 'all') result = result.filter(d => d.type === typeFilter);
  if (directionFilter !== 'all') result = result.filter(d => d.direction === directionFilter);
  if (keyword) {
    result = result.filter(d =>
      d.name.toLowerCase().includes(keyword) ||
      d.region.toLowerCase().includes(keyword) ||
      d.note.toLowerCase().includes(keyword)
    );
  }
  return result;
}

function onFilterChange() {
  accountingState.filteredData = applyFilter();
  refreshFilteredViews();
  updateFilterSummary();
}

/* 更新筛选条件摘要提示 */
function updateFilterSummary() {
  const summaryEl = document.getElementById('giftFilterSummary');
  if (!summaryEl) return;
  const yearFilter = document.getElementById('giftFilterYear').value;
  const typeFilter = document.getElementById('giftFilterType').value;
  const directionFilter = document.getElementById('giftFilterDirection').value;
  const keyword = (document.getElementById('giftFilterKeyword').value || '').trim();

  const parts = [];
  if (yearFilter !== 'all') parts.push(`${yearFilter}年`);
  if (typeFilter !== 'all') parts.push(typeFilter);
  if (directionFilter !== 'all') parts.push(directionFilter);
  if (keyword) parts.push(`"${keyword}"`);

  if (parts.length === 0) {
    summaryEl.textContent = '(显示全部数据)';
  } else {
    summaryEl.textContent = `筛选：${parts.join(' · ')}`;
  }
}

/* ---------- UI渲染 ---------- */
function renderTypeBadge(type) {
  const map = { '喜事': 'bg-success', '白事': 'bg-secondary', '节日送礼': 'bg-warning text-dark' };
  const cls = map[type] || 'bg-light text-dark';
  return `<span class="badge ${cls}">${escapeHtml(type)}</span>`;
}

function renderDirectionBadge(direction) {
  if (direction === '收入') {
    return '<span class="badge bg-success"><i class="bi bi-arrow-down-circle me-1"></i>收入</span>';
  }
  return '<span class="badge bg-danger"><i class="bi bi-arrow-up-circle me-1"></i>支出</span>';
}

function renderTable(data, tbodyId, isClean) {
  const tbody = document.getElementById(tbodyId);
  const thead = tbody.closest('table').querySelector('thead tr');
  const hasActionCol = thead.querySelector('.th-action');

  // 动态控制操作列表头
  if (isClean && !hasActionCol) {
    thead.insertAdjacentHTML('beforeend', '<th class="th-action" style="width:50px;">操作</th>');
  } else if (!isClean && hasActionCol) {
    hasActionCol.remove();
  }

  if (!data || data.length === 0) {
    const colSpan = isClean ? 8 : 7;
    tbody.innerHTML = `<tr><td colspan="${colSpan}" class="text-center text-muted py-3">暂无数据</td></tr>`;
    return;
  }
  const rows = data.map((d, idx) => {
    const amountVal = isClean ? d.amount.toFixed(2) : d.amount;
    const amountClass = isClean
      ? (d.direction === '收入' ? 'text-success fw-bold' : 'text-danger fw-bold')
      : '';
    const rowClass = isClean ? (d.direction === '收入' ? 'row-income' : 'row-outcome') : '';
    const actionCell = isClean
      ? `<td><button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="deleteGiftRecord(${idx})" title="删除此条记录" style="font-size:0.75rem;"><i class="bi bi-trash3"></i></button></td>`
      : '';
    return `<tr class="${rowClass}">
      <td>${escapeHtml(d.date)}</td>
      <td>${escapeHtml(d.name)}</td>
      <td>${renderTypeBadge(d.type)}</td>
      <td>${renderDirectionBadge(d.direction)}</td>
      <td class="${amountClass}">${d.direction === '收入' ? '+' : '-'}¥${escapeHtml(String(amountVal))}</td>
      <td>${escapeHtml(d.region)}</td>
      <td class="text-muted small">${escapeHtml(d.note)}</td>
      ${actionCell}
    </tr>`;
  });
  tbody.innerHTML = rows.join('');
}

function updateStatsBadges() {
  const data = accountingState.filteredData;
  const totalOut = data.filter(d => d.direction === '支出').reduce((sum, d) => sum + d.amount, 0);
  const totalIn = data.filter(d => d.direction === '收入').reduce((sum, d) => sum + d.amount, 0);
  const netAmount = totalIn - totalOut;

  document.getElementById('giftTotalRecords').textContent = `📋 总记录：${data.length}条`;
  document.getElementById('giftOutAmount').textContent = `📤 总支出：¥${totalOut.toFixed(2)}`;
  document.getElementById('giftInAmount').textContent = `📥 总收入：¥${totalIn.toFixed(2)}`;

  const netEl = document.getElementById('giftNetAmount');
  netEl.textContent = `💰 净收支：¥${netAmount >= 0 ? '+' : ''}${netAmount.toFixed(2)}`;
  netEl.className = `badge ${netAmount >= 0 ? 'bg-success' : 'bg-danger'}`;
  netEl.style.cssText = 'font-size:0.8rem;padding:6px 14px;';

  document.getElementById('giftRawCount').textContent = `${accountingState.rawData.length}条`;
  document.getElementById('giftCleanCount').textContent = `${accountingState.cleanData.length}条`;
}

/* ---------- 收支查询功能 ---------- */

/**
 * 月度收支查询：查询指定年月的总收支
 */
function queryMonthly() {
  const year = document.getElementById('queryMonthYear').value;
  const month = document.getElementById('queryMonthMonth').value;
  const resultEl = document.getElementById('queryMonthResult');

  if (!year) {
    resultEl.innerHTML = '<div class="text-center text-warning small py-3"><i class="bi bi-exclamation-circle me-1"></i>请先选择年份</div>';
    return;
  }

  const yearNum = parseInt(year, 10);
  let data;

  if (month === 'all') {
    // 查询全年各月汇总
    data = accountingState.cleanData.filter(d => d.year === yearNum);
    if (data.length === 0) {
      resultEl.innerHTML = `<div class="text-center text-muted small py-3"><i class="bi bi-info-circle me-1"></i>${yearNum}年暂无数据</div>`;
      return;
    }

    // 按月分组统计
    const monthlyMap = {};
    for (let m = 1; m <= 12; m++) {
      monthlyMap[m] = { out: 0, in: 0, count: 0 };
    }
    data.forEach(d => {
      if (d.direction === '收入') {
        monthlyMap[d.month].in += d.amount;
      } else {
        monthlyMap[d.month].out += d.amount;
      }
      monthlyMap[d.month].count++;
    });

    let tableRows = '';
    let yearTotalOut = 0, yearTotalIn = 0, yearTotalCount = 0;
    for (let m = 1; m <= 12; m++) {
      const mData = monthlyMap[m];
      if (mData.count > 0) {
        const net = mData.in - mData.out;
        const netClass = net >= 0 ? 'text-success' : 'text-danger';
        const netSign = net >= 0 ? '+' : '';
        tableRows += `<tr>
          <td><span class="badge bg-danger">${m}月</span></td>
          <td class="text-danger fw-bold">¥${mData.out.toFixed(2)}</td>
          <td class="text-success fw-bold">¥${mData.in.toFixed(2)}</td>
          <td class="${netClass} fw-bold">¥${netSign}${net.toFixed(2)}</td>
          <td>${mData.count}笔</td>
        </tr>`;
        yearTotalOut += mData.out;
        yearTotalIn += mData.in;
        yearTotalCount += mData.count;
      }
    }

    const yearNet = yearTotalIn - yearTotalOut;
    const yearNetClass = yearNet >= 0 ? 'text-success' : 'text-danger';
    const yearNetSign = yearNet >= 0 ? '+' : '';

    resultEl.innerHTML = `
      <div class="fw-bold mb-2 text-danger"><i class="bi bi-calendar3 me-1"></i>${yearNum}年 各月收支明细</div>
      <div class="table-responsive" style="max-height:320px;overflow-y:auto;">
        <table class="table table-sm table-borderless mb-2 small">
          <thead><tr class="text-muted"><th>月份</th><th>支出</th><th>收入</th><th>净额</th><th>笔数</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      <div class="border-top pt-2 mt-1 d-flex gap-3 flex-wrap">
        <span class="badge bg-secondary">共 ${yearTotalCount} 笔</span>
        <span class="badge bg-danger">总支出：¥${yearTotalOut.toFixed(2)}</span>
        <span class="badge bg-success">总收入：¥${yearTotalIn.toFixed(2)}</span>
        <span class="badge bg-${yearNet >= 0 ? 'success' : 'danger'}">净收支：¥${yearNetSign}${yearNet.toFixed(2)}</span>
      </div>`;

  } else {
    // 查询单月
    const monthNum = parseInt(month, 10);
    data = accountingState.cleanData.filter(d => d.year === yearNum && d.month === monthNum);

    if (data.length === 0) {
      resultEl.innerHTML = `<div class="text-center text-muted small py-3"><i class="bi bi-info-circle me-1"></i>${yearNum}年${monthNum}月暂无数据</div>`;
      return;
    }

    const totalOut = data.filter(d => d.direction === '支出').reduce((s, d) => s + d.amount, 0);
    const totalIn = data.filter(d => d.direction === '收入').reduce((s, d) => s + d.amount, 0);
    const net = totalIn - totalOut;
    const netClass = net >= 0 ? 'text-success' : 'text-danger';
    const netSign = net >= 0 ? '+' : '';

    // 按事件类型分组
    const typeMap = {};
    data.forEach(d => {
      if (!typeMap[d.type]) typeMap[d.type] = { out: 0, in: 0 };
      if (d.direction === '收入') typeMap[d.type].in += d.amount;
      else typeMap[d.type].out += d.amount;
    });

    let typeRows = '';
    Object.entries(typeMap).forEach(([type, amounts]) => {
      const typeNet = amounts.in - amounts.out;
      const tNetClass = typeNet >= 0 ? 'text-success' : 'text-danger';
      typeRows += `<tr>
        <td>${renderTypeBadge(type)}</td>
        <td class="text-danger">¥${amounts.out.toFixed(2)}</td>
        <td class="text-success">¥${amounts.in.toFixed(2)}</td>
        <td class="${tNetClass} fw-bold">¥${typeNet >= 0 ? '+' : ''}${typeNet.toFixed(2)}</td>
      </tr>`;
    });

    // 明细列表
    let detailRows = '';
    data.sort((a, b) => a.date.localeCompare(b.date)).forEach(d => {
      const dirIcon = d.direction === '收入'
        ? '<i class="bi bi-arrow-down-circle-fill text-success"></i>'
        : '<i class="bi bi-arrow-up-circle-fill text-danger"></i>';
      detailRows += `<tr>
        <td>${escapeHtml(d.date)}</td>
        <td>${escapeHtml(d.name)}</td>
        <td>${renderTypeBadge(d.type)}</td>
        <td>${dirIcon} ${escapeHtml(d.direction)}</td>
        <td class="${d.direction === '收入' ? 'text-success' : 'text-danger'} fw-bold">¥${d.amount.toFixed(2)}</td>
      </tr>`;
    });

    resultEl.innerHTML = `
      <div class="fw-bold mb-2 text-danger"><i class="bi bi-calendar-month me-1"></i>${yearNum}年${monthNum}月 收支详情</div>
      <div class="d-flex gap-2 flex-wrap mb-2">
        <span class="badge bg-secondary">共 ${data.length} 笔</span>
        <span class="badge bg-danger">支出：¥${totalOut.toFixed(2)}</span>
        <span class="badge bg-success">收入：¥${totalIn.toFixed(2)}</span>
        <span class="badge bg-${net >= 0 ? 'success' : 'danger'}">净额：¥${netSign}${net.toFixed(2)}</span>
      </div>
      ${Object.keys(typeMap).length > 0 ? `
      <div class="small mb-2"><span class="text-muted">按事件类型：</span></div>
      <table class="table table-sm table-borderless small mb-2">
        <thead><tr class="text-muted"><th>类型</th><th>支出</th><th>收入</th><th>净额</th></tr></thead>
        <tbody>${typeRows}</tbody>
      </table>` : ''}
      <div class="small mb-1"><span class="text-muted">明细记录：</span></div>
      <div class="table-responsive" style="max-height:250px;overflow-y:auto;">
        <table class="table table-sm table-borderless small mb-0">
          <thead><tr class="text-muted"><th>日期</th><th>对象</th><th>类型</th><th>收支</th><th>金额</th></tr></thead>
          <tbody>${detailRows}</tbody>
        </table>
      </div>`;
  }
}

/**
 * 年度收支查询：按年份汇总总收支
 */
function queryYearly() {
  const year = document.getElementById('queryYearYear').value;
  const resultEl = document.getElementById('queryYearResult');

  let data;
  if (year === 'all') {
    // 全部年份汇总
    data = accountingState.cleanData;
    if (data.length === 0) {
      resultEl.innerHTML = '<div class="text-center text-muted small py-3"><i class="bi bi-info-circle me-1"></i>暂无任何数据</div>';
      return;
    }

    const yearMap = {};
    data.forEach(d => {
      if (!yearMap[d.year]) yearMap[d.year] = { out: 0, in: 0, count: 0 };
      if (d.direction === '收入') yearMap[d.year].in += d.amount;
      else yearMap[d.year].out += d.amount;
      yearMap[d.year].count++;
    });

    const sortedYears = Object.keys(yearMap).sort();
    let tableRows = '';
    let grandOut = 0, grandIn = 0, grandCount = 0;

    sortedYears.forEach(y => {
      const yd = yearMap[y];
      const net = yd.in - yd.out;
      const netClass = net >= 0 ? 'text-success' : 'text-danger';
      const netSign = net >= 0 ? '+' : '';
      tableRows += `<tr>
        <td><span class="badge bg-danger">${y}年</span></td>
        <td class="text-danger fw-bold">¥${yd.out.toFixed(2)}</td>
        <td class="text-success fw-bold">¥${yd.in.toFixed(2)}</td>
        <td class="${netClass} fw-bold">¥${netSign}${net.toFixed(2)}</td>
        <td>${yd.count}笔</td>
      </tr>`;
      grandOut += yd.out;
      grandIn += yd.in;
      grandCount += yd.count;
    });

    const grandNet = grandIn - grandOut;
    const gNetClass = grandNet >= 0 ? 'text-success' : 'text-danger';
    const gNetSign = grandNet >= 0 ? '+' : '';

    resultEl.innerHTML = `
      <div class="fw-bold mb-2 text-danger"><i class="bi bi-bar-chart-fill me-1"></i>全部年份 年度收支对比</div>
      <div class="table-responsive" style="max-height:320px;overflow-y:auto;">
        <table class="table table-sm table-borderless mb-2 small">
          <thead><tr class="text-muted"><th>年份</th><th>总支出</th><th>总收入</th><th>净额</th><th>笔数</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      <div class="border-top pt-2 mt-1 d-flex gap-3 flex-wrap">
        <span class="badge bg-secondary">总计 ${grandCount} 笔</span>
        <span class="badge bg-danger">总支出：¥${grandOut.toFixed(2)}</span>
        <span class="badge bg-success">总收入：¥${grandIn.toFixed(2)}</span>
        <span class="badge bg-${grandNet >= 0 ? 'success' : 'danger'}">净收支：¥${gNetSign}${grandNet.toFixed(2)}</span>
      </div>`;

  } else {
    // 单年汇总
    const yearNum = parseInt(year, 10);
    data = accountingState.cleanData.filter(d => d.year === yearNum);

    if (data.length === 0) {
      resultEl.innerHTML = `<div class="text-center text-muted small py-3"><i class="bi bi-info-circle me-1"></i>${yearNum}年暂无数据</div>`;
      return;
    }

    const totalOut = data.filter(d => d.direction === '支出').reduce((s, d) => s + d.amount, 0);
    const totalIn = data.filter(d => d.direction === '收入').reduce((s, d) => s + d.amount, 0);
    const net = totalIn - totalOut;
    const netClass = net >= 0 ? 'text-success' : 'text-danger';
    const netSign = net >= 0 ? '+' : '';

    // 按月分组
    const monthMap = {};
    for (let m = 1; m <= 12; m++) monthMap[m] = { out: 0, in: 0, count: 0 };
    data.forEach(d => {
      if (d.direction === '收入') monthMap[d.month].in += d.amount;
      else monthMap[d.month].out += d.amount;
      monthMap[d.month].count++;
    });

    let monthRows = '';
    for (let m = 1; m <= 12; m++) {
      const md = monthMap[m];
      if (md.count > 0) {
        const mNet = md.in - md.out;
        const mNetClass = mNet >= 0 ? 'text-success' : 'text-danger';
        monthRows += `<tr>
          <td><span class="text-muted">${m}月</span></td>
          <td class="text-danger">¥${md.out.toFixed(2)}</td>
          <td class="text-success">¥${md.in.toFixed(2)}</td>
          <td class="${mNetClass} fw-bold">¥${mNet >= 0 ? '+' : ''}${mNet.toFixed(2)}</td>
          <td>${md.count}笔</td>
        </tr>`;
      }
    }

    // 按事件类型分组
    const typeMap = {};
    data.forEach(d => {
      if (!typeMap[d.type]) typeMap[d.type] = { out: 0, in: 0 };
      if (d.direction === '收入') typeMap[d.type].in += d.amount;
      else typeMap[d.type].out += d.amount;
    });

    let typeRows = '';
    Object.entries(typeMap).forEach(([type, amounts]) => {
      const tNet = amounts.in - amounts.out;
      const tNetClass = tNet >= 0 ? 'text-success' : 'text-danger';
      typeRows += `<tr>
        <td>${renderTypeBadge(type)}</td>
        <td class="text-danger">¥${amounts.out.toFixed(2)}</td>
        <td class="text-success">¥${amounts.in.toFixed(2)}</td>
        <td class="${tNetClass} fw-bold">¥${tNet >= 0 ? '+' : ''}${tNet.toFixed(2)}</td>
      </tr>`;
    });

    resultEl.innerHTML = `
      <div class="fw-bold mb-2 text-danger"><i class="bi bi-calendar-check me-1"></i>${yearNum}年 年度收支总览</div>
      <div class="d-flex gap-2 flex-wrap mb-2">
        <span class="badge bg-secondary">共 ${data.length} 笔</span>
        <span class="badge bg-danger">总支出：¥${totalOut.toFixed(2)}</span>
        <span class="badge bg-success">总收入：¥${totalIn.toFixed(2)}</span>
        <span class="badge bg-${net >= 0 ? 'success' : 'danger'}">净收支：¥${netSign}${net.toFixed(2)}</span>
      </div>
      ${Object.keys(typeMap).length > 0 ? `
      <div class="small mb-1"><span class="text-muted">按事件类型：</span></div>
      <table class="table table-sm table-borderless small mb-2">
        <thead><tr class="text-muted"><th>类型</th><th>支出</th><th>收入</th><th>净额</th></tr></thead>
        <tbody>${typeRows}</tbody>
      </table>` : ''}
      <div class="small mb-1"><span class="text-muted">各月明细：</span></div>
      <div class="table-responsive" style="max-height:220px;overflow-y:auto;">
        <table class="table table-sm table-borderless small mb-0">
          <thead><tr class="text-muted"><th>月份</th><th>支出</th><th>收入</th><th>净额</th><th>笔数</th></tr></thead>
          <tbody>${monthRows}</tbody>
        </table>
      </div>`;
  }
}

function updateFilterYears() {
  const select = document.getElementById('giftFilterYear');
  const years = [...new Set(accountingState.cleanData.map(d => d.year))].sort();
  const currentVal = select.value;
  select.innerHTML = '<option value="all">全部年份</option>';
  years.forEach(y => { select.innerHTML += `<option value="${y}">${y}年</option>`; });
  if ([...select.options].some(o => o.value === currentVal)) select.value = currentVal;

  // 同步更新查询面板的年份下拉
  updateQueryYearDropdowns(years);
}

function updateQueryYearDropdowns(years) {
  const monthYearSelect = document.getElementById('queryMonthYear');
  const yearSelect = document.getElementById('queryYearYear');
  if (!years) {
    years = [...new Set(accountingState.cleanData.map(d => d.year))].sort();
  }

  if (monthYearSelect) {
    const curMonth = monthYearSelect.value;
    monthYearSelect.innerHTML = '<option value="">--选择年份--</option>';
    years.forEach(y => { monthYearSelect.innerHTML += `<option value="${y}">${y}年</option>`; });
    if ([...monthYearSelect.options].some(o => o.value === curMonth)) monthYearSelect.value = curMonth;
  }

  if (yearSelect) {
    const curYear = yearSelect.value;
    yearSelect.innerHTML = '<option value="all">全部年份</option>';
    years.forEach(y => { yearSelect.innerHTML += `<option value="${y}">${y}年</option>`; });
    if ([...yearSelect.options].some(o => o.value === curYear)) yearSelect.value = curYear;
  }
}

/* 仅刷新表格/徽章/图表，不重建年份下拉（筛选变化时用） */
function refreshFilteredViews() {
  renderTable(accountingState.rawData, 'giftRawBody', false);
  renderTable(accountingState.filteredData, 'giftCleanBody', true);
  updateStatsBadges();
  renderAllCharts();
}

/* 完整刷新所有视图（数据变更时用） */
function refreshAllViews() {
  renderTable(accountingState.rawData, 'giftRawBody', false);
  renderTable(accountingState.filteredData, 'giftCleanBody', true);
  updateStatsBadges();
  updateFilterYears();
  renderAllCharts();
  updateFilterSummary();
}

/* ---------- ECharts 图表 ---------- */
function getChart(domId) {
  if (!accountingState.charts[domId]) {
    const dom = document.getElementById(domId);
    if (!dom) return null;
    accountingState.charts[domId] = echarts.init(dom);
  }
  return accountingState.charts[domId];
}

function resizeAllCharts() {
  Object.values(accountingState.charts).forEach(chart => {
    if (chart && !chart.isDisposed()) chart.resize();
  });
}

function renderMonthlyChart() {
  const chart = getChart('chartGiftMonthly');
  if (!chart) return;
  const data = accountingState.filteredData;

  if (data.length === 0) {
    chart.setOption({ title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: '#999', fontSize: 14 } } }, true);
    return;
  }

  // 按月度分别统计支出和收入
  const outData = aggregateByMonth(data, '支出');
  const inData = aggregateByMonth(data, '收入');
  const allKeys = [...new Set([...Object.keys(outData), ...Object.keys(inData)])].sort();
  const outValues = allKeys.map(k => outData[k] ? parseFloat(outData[k].toFixed(2)) : 0);
  const inValues = allKeys.map(k => inData[k] ? parseFloat(inData[k].toFixed(2)) : 0);

  chart.setOption({
    tooltip: { trigger: 'axis', formatter: function(params) {
      let html = params[0].axisValue;
      params.forEach(p => { html += `<br/>${p.marker}${p.seriesName}：<b>¥${p.value.toFixed(2)}</b>`; });
      return html;
    }},
    legend: { data: ['支出', '收入'], top: 5, textStyle: { fontSize: 11 } },
    grid: { left: '3%', right: '4%', bottom: '12%', top: '15%', containLabel: true },
    dataZoom: allKeys.length > 12 ? [{ type: 'slider', bottom: 5, height: 12, start: 0, end: 100 }] : [],
    xAxis: { type: 'category', data: allKeys, axisLabel: { rotate: 45, fontSize: 10 }, boundaryGap: false },
    yAxis: { type: 'value', name: '金额 (元)', axisLabel: { formatter: '¥{value}' } },
    series: [
      {
        name: '支出', type: 'line', data: outValues, smooth: true,
        symbol: 'circle', symbolSize: 5,
        lineStyle: { color: '#dc3545', width: 2 },
        itemStyle: { color: '#dc3545' },
        areaStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1, [
          { offset: 0, color: 'rgba(220,53,69,0.25)' }, { offset: 1, color: 'rgba(220,53,69,0.02)' }
        ])}
      },
      {
        name: '收入', type: 'line', data: inValues, smooth: true,
        symbol: 'diamond', symbolSize: 5,
        lineStyle: { color: '#198754', width: 2 },
        itemStyle: { color: '#198754' },
        areaStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1, [
          { offset: 0, color: 'rgba(25,135,84,0.25)' }, { offset: 1, color: 'rgba(25,135,84,0.02)' }
        ])}
      }
    ]
  }, true);
}

function renderPieChart() {
  const chart = getChart('chartGiftPie');
  if (!chart) return;
  const data = accountingState.filteredData;

  if (data.length === 0) {
    chart.setOption({ title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: '#999', fontSize: 14 } } }, true);
    return;
  }

  const typeData = aggregateByType(data);
  const pieData = Object.entries(typeData).map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }));
  const colorMap = { '喜事': '#198754', '白事': '#6c757d', '节日送礼': '#ffc107' };

  chart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}：¥{c} ({d}%)' },
    legend: { orient: 'horizontal', bottom: 10, textStyle: { fontSize: 12 } },
    series: [{
      name: '事件类型', type: 'pie', radius: ['40%','70%'], center: ['50%','45%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2, color: p => colorMap[p.name] || '#adb5bd' },
      label: { show: true, formatter: '{b}\n¥{c}', fontSize: 11 },
      emphasis: { label: { fontSize: 16, fontWeight: 'bold' } },
      data: pieData
    }]
  }, true);
}

function renderRegionChart() {
  const chart = getChart('chartGiftRegion');
  if (!chart) return;
  const data = accountingState.filteredData;

  if (data.length === 0) {
    chart.setOption({ title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: '#999', fontSize: 14 } } }, true);
    return;
  }

  const regionData = aggregateByRegion(data);
  const sorted = Object.entries(regionData).sort((a,b) => b[1] - a[1]).slice(0, 15);
  const regions = sorted.map(d => d[0]);
  const amounts = sorted.map(d => parseFloat(d[1].toFixed(2)));

  chart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: p => `${p[0].name}<br/>礼金总额：<b>¥${p[0].value.toFixed(2)}</b>` },
    grid: { left: '3%', right: '8%', bottom: '3%', top: '3%', containLabel: true },
    xAxis: { type: 'value', name: '金额 (元)', axisLabel: { formatter: '¥{value}' } },
    yAxis: { type: 'category', data: regions.reverse(), axisLabel: { fontSize: 11 }, inverse: true },
    series: [{
      name: '地区开销', type: 'bar', data: amounts.reverse(),
      itemStyle: { color: new echarts.graphic.LinearGradient(0,0,1,0, [
        { offset: 0, color: '#dc3545' }, { offset: 1, color: '#ff6b6b' }
      ]), borderRadius: [0,4,4,0] },
      label: { show: true, position: 'right', formatter: '¥{c}', fontSize: 10 }
    }]
  }, true);
}

function renderSeasonChart() {
  const chart = getChart('chartGiftSeason');
  if (!chart) return;
  const data = accountingState.filteredData;

  if (data.length === 0) {
    chart.setOption({ title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: '#999', fontSize: 14 } } }, true);
    return;
  }

  const seasonData = aggregateBySeason(data);
  const seasons = ['春季','夏季','秋季','冬季'];
  const outValues = seasons.map(s => parseFloat(seasonData[s].out.toFixed(2)));
  const inValues = seasons.map(s => parseFloat(seasonData[s].in.toFixed(2)));

  chart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: function(params) {
        const s = params[0].name;
        let html = `${s}（${SEASON_MAP[s].join('、')}月）`;
        params.forEach(p => { html += `<br/>${p.marker}${p.seriesName}：<b>¥${p.value.toFixed(2)}</b>`; });
        return html;
      }
    },
    legend: { data: ['支出', '收入'], top: 5, textStyle: { fontSize: 11 } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
    xAxis: { type: 'category', data: seasons, axisLabel: { fontSize: 12 } },
    yAxis: { type: 'value', name: '金额 (元)', axisLabel: { formatter: '¥{value}' } },
    series: [
      {
        name: '支出', type: 'bar', barWidth: '35%', barGap: '10%',
        data: outValues.map(v => ({ value: v, itemStyle: { color: '#dc3545', borderRadius: [6,6,0,0] } })),
        label: { show: true, position: 'top', formatter: p => p.value > 0 ? '¥' + p.value : '', fontSize: 10, fontWeight: 'bold' }
      },
      {
        name: '收入', type: 'bar', barWidth: '35%',
        data: inValues.map(v => ({ value: v, itemStyle: { color: '#198754', borderRadius: [6,6,0,0] } })),
        label: { show: true, position: 'top', formatter: p => p.value > 0 ? '¥' + p.value : '', fontSize: 10, fontWeight: 'bold' }
      }
    ]
  }, true);
}

function renderInOutChart() {
  const chart = getChart('chartGiftInOut');
  if (!chart) return;
  const data = accountingState.filteredData;

  if (data.length === 0) {
    chart.setOption({ title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: '#999', fontSize: 14 } } }, true);
    return;
  }

  const outData = aggregateByMonth(data, '支出');
  const inData = aggregateByMonth(data, '收入');
  const allKeys = [...new Set([...Object.keys(outData), ...Object.keys(inData)])].sort();
  const netValues = allKeys.map(k => {
    const out = outData[k] || 0;
    const income = inData[k] || 0;
    return parseFloat((income - out).toFixed(2));
  });

  chart.setOption({
    tooltip: { trigger: 'axis', formatter: function(p) {
      const v = p[0].value;
      return `${p[0].axisValue}<br/>净收支：<b style="color:${v >= 0 ? '#198754' : '#dc3545'}">¥${v >= 0 ? '+' : ''}${v.toFixed(2)}</b>`;
    }},
    grid: { left: '3%', right: '4%', bottom: '12%', top: '8%', containLabel: true },
    dataZoom: allKeys.length > 12 ? [{ type: 'slider', bottom: 5, height: 12, start: 0, end: 100 }] : [],
    xAxis: { type: 'category', data: allKeys, axisLabel: { rotate: 45, fontSize: 10 }, boundaryGap: false },
    yAxis: { type: 'value', name: '净额 (元)', axisLabel: { formatter: '¥{value}' } },
    series: [{
      name: '净收支', type: 'bar',
      data: netValues.map(v => ({
        value: v,
        itemStyle: { color: v >= 0 ? '#198754' : '#dc3545', borderRadius: [4,4,0,0] }
      })),
      label: { show: true, position: 'top', formatter: p => p.value !== 0 ? '¥' + p.value : '', fontSize: 10 }
    }]
  }, true);
}

function renderDirectionPieChart() {
  const chart = getChart('chartGiftDirectionPie');
  if (!chart) return;
  const data = accountingState.filteredData;

  if (data.length === 0) {
    chart.setOption({ title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: '#999', fontSize: 14 } } }, true);
    return;
  }

  const dirData = aggregateByDirection(data);
  const pieData = [
    { name: '支出', value: parseFloat(dirData['支出'].toFixed(2)), itemStyle: { color: '#dc3545' } },
    { name: '收入', value: parseFloat(dirData['收入'].toFixed(2)), itemStyle: { color: '#198754' } }
  ];

  chart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}：¥{c} ({d}%)' },
    legend: { orient: 'horizontal', bottom: 10, textStyle: { fontSize: 12 } },
    series: [{
      name: '收支类型', type: 'pie', radius: ['40%','70%'], center: ['50%','45%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { show: true, formatter: '{b}\n¥{c}', fontSize: 11 },
      emphasis: { label: { fontSize: 16, fontWeight: 'bold' } },
      data: pieData
    }]
  }, true);
}

function renderAllCharts() {
  renderMonthlyChart();
  renderPieChart();
  renderRegionChart();
  renderSeasonChart();
  renderInOutChart();
  renderDirectionPieChart();
}

/* ---------- CSV导入 ---------- */
function importCSV(csvText) {
  Papa.parse(csvText, {
    header: true, skipEmptyLines: true, encoding: 'UTF-8',
    complete: function(results) {
      if (!results.data || results.data.length === 0) {
        showStatus('CSV文件为空或无有效数据', 'danger'); return;
      }
      // 兼容旧格式和新格式的CSV表头
      const requiredHeadersV1 = ['随礼日期','送礼对象','事件类型','礼金金额','所在地区','备注'];
      const requiredHeadersV2 = ['日期','往来对象','事件类型','收支类型','金额','所在地区','备注'];
      const actualHeaders = results.meta.fields || [];

      const isV1 = requiredHeadersV1.every(h => actualHeaders.includes(h));
      const isV2 = requiredHeadersV2.every(h => actualHeaders.includes(h));

      if (!isV1 && !isV2) {
        showStatus(`CSV表头不匹配，请确保包含以下字段之一：\n旧格式：${requiredHeadersV1.join('、')}\n新格式：${requiredHeadersV2.join('、')}`, 'danger'); return;
      }
      const { rawData, cleanData, discarded, duplicateCount } = batchClean(results.data);
      accountingState.rawData = accountingState.rawData.concat(rawData);
      accountingState.cleanData = accountingState.cleanData.concat(cleanData);
      // 全局去重：确保合并后的数据没有重复
      const beforeDedup = accountingState.cleanData.length;
      accountingState.cleanData = deduplicateData(accountingState.cleanData);
      const globalDup = beforeDedup - accountingState.cleanData.length;
      accountingState.filteredData = applyFilter();
      syncHistoryFromData();
      updateDatalists();
      saveAccountingData();
      refreshAllViews();
      const dupMsg = duplicateCount > 0 ? `，重复跳过${duplicateCount}条` : '';
      const globalDupMsg = globalDup > 0 ? `，全局去重${globalDup}条` : '';
      showStatus(`导入成功！原始${results.data.length}条，合规${cleanData.length}条，丢弃${discarded}条${dupMsg}${globalDupMsg}`, 'success');
    },
    error: function(err) { showStatus(`CSV解析失败：${err.message}`, 'danger'); }
  });
}

function showStatus(msg, type) {
  const el = document.getElementById('giftUploadStatus');
  const iconMap = { success:'check-circle', danger:'exclamation-circle', warning:'exclamation-triangle' };
  const icon = iconMap[type] || 'info-circle';
  el.innerHTML = `<i class="bi bi-${icon} text-${type} me-1"></i>${msg}`;
}

/* ---------- 事件绑定 ---------- */
function bindAccountingEvents() {
  // CSV文件上传
  document.getElementById('csvGiftInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    showStatus('正在读取文件...', 'warning');
    const reader = new FileReader();
    reader.onload = function(evt) { importCSV(evt.target.result.replace(/^\uFEFF/, '')); };
    reader.onerror = function() { showStatus('文件读取失败，请重试', 'danger'); };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  });

  // 加载示例数据
  document.getElementById('btnGiftDemo').addEventListener('click', function() {
    importCSV(DEMO_GIFT_CSV);
  });

  // 清空全部
  document.getElementById('btnGiftClear').addEventListener('click', function() {
    if (accountingState.rawData.length === 0 && accountingState.cleanData.length === 0) {
      showStatus('没有数据需要清空', 'warning'); return;
    }
    if (confirm(`确定要清空全部数据吗？\n原始数据：${accountingState.rawData.length}条\n合规数据：${accountingState.cleanData.length}条\n此操作不可恢复！`)) {
      accountingState.rawData = [];
      accountingState.cleanData = [];
      accountingState.filteredData = [];
      saveAccountingData();
      refreshAllViews();
      showStatus('已清空全部数据', 'success');
    }
  });

  // 手动添加
  document.getElementById('formGiftAdd').addEventListener('submit', function(e) {
    e.preventDefault();
    const dateVal = document.getElementById('giftDate').value;
    const nameVal = document.getElementById('giftName').value.trim();
    const typeVal = document.getElementById('giftType').value;
    const directionVal = document.getElementById('giftDirection').value;
    const amountVal = document.getElementById('giftAmount').value;
    const regionVal = document.getElementById('giftRegion').value.trim() || '未知地区';
    const noteVal = document.getElementById('giftNote').value.trim();

    if (!dateVal || !nameVal || !typeVal || !directionVal || !amountVal) { alert('请填写所有必填字段！'); return; }
    const amount = parseFloat(amountVal);
    if (isNaN(amount) || amount < 0) { alert('金额必须为非负数字！'); return; }

    const roundedAmount = Math.round(amount * 100) / 100;
    // 去重检查：不允许日期、对象、类型、收支、金额、地区全部相同
    if (isDuplicateRecord({
      date: dateVal, name: nameVal, type: typeVal, direction: directionVal,
      amount: roundedAmount, region: regionVal
    }, accountingState.cleanData)) {
      alert(`已存在完全相同的记录！\n日期：${dateVal}\n对象：${nameVal}\n类型：${typeVal}\n收支：${directionVal}\n金额：¥${roundedAmount.toFixed(2)}\n地区：${regionVal}\n\n请勿重复添加。`);
      return;
    }

    const cleaned = {
      date: dateVal, name: nameVal, type: typeVal, direction: directionVal,
      amount: roundedAmount, region: regionVal, note: noteVal,
      year: parseInt(dateVal.substring(0,4), 10), month: parseInt(dateVal.substring(5,7), 10)
    };
    accountingState.rawData.push({ date: dateVal, name: nameVal, type: typeVal, direction: directionVal, amount: String(roundedAmount), region: regionVal, note: noteVal });
    accountingState.cleanData.push(cleaned);
    saveHistory(nameVal, regionVal !== '未知地区' ? regionVal : '');
    updateDatalists();
    saveAccountingData();
    accountingState.filteredData = applyFilter();
    refreshAllViews();
    showStatus(`手动添加成功：${nameVal} - ${directionVal} ¥${roundedAmount.toFixed(2)}`, 'success');

    // 快速连续添加：仅清空往来对象和金额，保留日期/收支类型/事件类型/地区
    document.getElementById('giftName').value = '';
    document.getElementById('giftAmount').value = '';
    document.getElementById('giftNote').value = '';
    document.getElementById('giftName').focus();
  });

  // 筛选控件
  document.getElementById('giftFilterYear').addEventListener('change', onFilterChange);
  document.getElementById('giftFilterType').addEventListener('change', onFilterChange);
  document.getElementById('giftFilterDirection').addEventListener('change', onFilterChange);
  document.getElementById('giftFilterKeyword').addEventListener('input', function() {
    clearTimeout(window._giftKeywordTimer);
    window._giftKeywordTimer = setTimeout(onFilterChange, 300);
  });
  document.getElementById('btnGiftReset').addEventListener('click', function() {
    document.getElementById('giftFilterYear').value = 'all';
    document.getElementById('giftFilterType').value = 'all';
    document.getElementById('giftFilterDirection').value = 'all';
    document.getElementById('giftFilterKeyword').value = '';
    onFilterChange();
  });

  // 收支查询按钮
  document.getElementById('btnQueryMonth').addEventListener('click', queryMonthly);
  document.getElementById('btnQueryYear').addEventListener('click', queryYearly);

  // 窗口大小变化
  window.addEventListener('resize', function() {
    clearTimeout(window._giftResizeTimer);
    window._giftResizeTimer = setTimeout(resizeAllCharts, 200);
  });
}

/* ---------- 示例CSV数据（含收支类型） ---------- */
const DEMO_GIFT_CSV = `日期,往来对象,事件类型,收支类型,金额,所在地区,备注
2023-01-15,张三,喜事,支出,500,北京,同事结婚
2023-02-20,李四,白事,支出,300,上海,亲戚白事
2023-03-08,王五,节日送礼,支出,200,广州,春节拜年
2023-04-12,赵六,喜事,收入,2000,深圳,女儿出嫁收礼
2023-05-01,孙七,节日送礼,支出,150,杭州,劳动节送礼
2023-06-18,周八,喜事,支出,600,成都,表妹结婚
2023-07-22,吴九,白事,支出,400,武汉,邻居白事
2023-08-30,郑十,节日送礼,收入,800,南京,中秋节收礼
2023-09-10,陈一,喜事,支出,1000,北京,好友婚礼
2023-10-25,林二,白事,收入,1500,上海,白事收礼
2023-11-11,黄三,节日送礼,支出,250,广州,双十一聚会
2023-12-20,何四,喜事,支出,700,深圳,同学结婚
2024-01-08,刘五,节日送礼,支出,350,杭州,元旦送礼
2024-02-14,杨六,喜事,支出,900,成都,同事结婚
2024-03-05,吕七,白事,支出,450,武汉,亲戚白事
2024-04-18,马八,喜事,收入,3000,南京,儿子结婚收礼
2024-05-20,朱九,节日送礼,支出,280,北京,520节日
2024-06-15,许十,白事,支出,600,上海,邻居白事
2024-07-30,谢一,喜事,支出,1200,广州,表弟结婚
2024-08-08,冯二,节日送礼,收入,600,深圳,七夕收礼
2024-09-12,韩三,喜事,支出,850,杭州,好友婚礼
2024-10-01,曹四,节日送礼,收入,1000,成都,国庆收礼
2024-11-20,邓五,白事,支出,350,武汉,远亲白事
2024-12-25,彭六,节日送礼,支出,200,南京,圣诞送礼
2025-01-01,萧七,喜事,收入,5000,北京,亲弟结婚收礼
2025-02-10,蔡八,节日送礼,支出,380,上海,春节送礼
2025-03-15,潘九,白事,支出,500,广州,亲戚白事
2025-04-22,田十,喜事,支出,650,深圳,同事结婚
2025-05-08,胡一,节日送礼,收入,400,杭州,母亲节收礼
2025-06-28,范二,喜事,支出,1100,成都,好友婚礼
2025-07-15,方三,白事,收入,800,武汉,白事收礼
2025-08-18,石四,节日送礼,支出,450,南京,中秋送礼
2025-09-25,姚五,喜事,支出,750,北京,同学结婚
2025-10-10,谭六,白事,支出,550,上海,远亲白事
2025-11-05,廖七,节日送礼,支出,260,广州,感恩节送礼
2025-12-30,邹八,喜事,收入,3500,深圳,表妹结婚收礼
2023-02-28,金九,喜事,支出,880,杭州,朋友婚礼
2023-07-07,陆十,喜事,收入,2800,成都,乔迁之喜收礼
2024-03-22,崔一,节日送礼,支出,180,武汉,春分送礼
2024-09-30,苏二,白事,支出,480,南京,亲戚白事
2025-05-15,姜三,节日送礼,收入,700,北京,端午收礼
2025-08-25,魏四,喜事,支出,1050,上海,好友婚礼`;

/* ---------- 初始化 ---------- */
function initAccounting() {
  console.log('[台账-记账] 模块初始化');
  loadAccountingData();
  updateDatalists();
  bindAccountingEvents();
  accountingState.filteredData = applyFilter();
  refreshAllViews();
  // 未登录时无数据则加载示例；登录用户默认为空白
  if (
    accountingState.cleanData.length === 0 &&
    (typeof FamilyAuth === 'undefined' || FamilyAuth.shouldUseDemoData())
  ) {
    importCSV(DEMO_GIFT_CSV);
  }
}
