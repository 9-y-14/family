/**
 * ============================================================
 *  家庭全能管家 - 导航切换主控
 *  负责分区切换 + 子Tab切换逻辑
 * ============================================================
 */

/* ---------- 初始化标记 ---------- */
let zoneInitialized = {
  safety: false,
  growth: false
};

let safetySubTabInitialized = {
  accounting: false,
  documents: false,
  emergency: false
};

let growthSubTabInitialized = {
  complaint: false,
  wish: false,
  planting: false
};

/* ---------- 分区切换 ---------- */
function switchZone(zoneName) {
  const zoneSafety = document.getElementById('zoneSafety');
  const zoneGrowth = document.getElementById('zoneGrowth');
  const navSafety = document.getElementById('navSafety');
  const navGrowth = document.getElementById('navGrowth');

  // 隐藏所有分区
  zoneSafety.style.display = 'none';
  zoneGrowth.style.display = 'none';
  navSafety.classList.remove('active');
  navGrowth.classList.remove('active');

  if (zoneName === 'safety') {
    if (typeof FamilyAuth !== 'undefined' && FamilyAuth.isLoggedIn() && FamilyAuth.isMember()) {
      zoneName = 'growth';
    } else if (
      typeof FamilyAuth !== 'undefined' &&
      FamilyAuth.isLoggedIn() &&
      FamilyAuth.isManager() &&
      !FamilyAuth.isSafetyUnlocked()
    ) {
      if (typeof FamilyAuth.showManagerVerifyModal === 'function') {
        FamilyAuth.showManagerVerifyModal(() => switchZone('safety'));
      }
      zoneGrowth.style.display = 'block';
      navGrowth.classList.add('active');
      if (!zoneInitialized.growth) {
        zoneInitialized.growth = true;
        initGrowthSubTab('complaint');
      }
      if (typeof FamilyAuth.updateSafetyVisibility === 'function') FamilyAuth.updateSafetyVisibility();
      return;
    }
    zoneSafety.style.display = 'block';
    navSafety.classList.add('active');

    if (!zoneInitialized.safety) {
      zoneInitialized.safety = true;
      // 初始化第一个子Tab（人情往来）
      initSafetySubTab('accounting');
    }
    if (typeof FamilyAuth !== 'undefined' && FamilyAuth.updateSafetyVisibility) FamilyAuth.updateSafetyVisibility();
  } else if (zoneName === 'growth') {
    zoneGrowth.style.display = 'block';
    navGrowth.classList.add('active');

    if (!zoneInitialized.growth) {
      zoneInitialized.growth = true;
      // 初始化第一个子Tab（真心话）
      initGrowthSubTab('complaint');
    }
  }

  try { localStorage.setItem('family_manager_active_zone', zoneName); } catch (e) {}
}

/* ---------- 分区1 子Tab初始化 ---------- */
function initSafetySubTab(subTabName) {
  if (subTabName === 'accounting' && !safetySubTabInitialized.accounting) {
    safetySubTabInitialized.accounting = true;
    if (typeof initAccounting === 'function') initAccounting();
  } else if (subTabName === 'documents' && !safetySubTabInitialized.documents) {
    safetySubTabInitialized.documents = true;
    if (typeof initDocuments === 'function') initDocuments();
  } else if (subTabName === 'emergency' && !safetySubTabInitialized.emergency) {
    safetySubTabInitialized.emergency = true;
    if (typeof initEmergencyModule === 'function') initEmergencyModule();
  }

  // 重绘图表（如果已初始化）
  if (subTabName === 'accounting' && safetySubTabInitialized.accounting) {
    if (typeof resizeAllCharts === 'function') {
      setTimeout(resizeAllCharts, 200);
    }
  } else if (subTabName === 'documents' && safetySubTabInitialized.documents) {
    if (typeof resizeDocCharts === 'function') {
      setTimeout(resizeDocCharts, 200);
    }
  }
}

/* ---------- 分区2 子Tab初始化 ---------- */
function initGrowthSubTab(subTabName) {
  if (subTabName === 'complaint' && !growthSubTabInitialized.complaint) {
    growthSubTabInitialized.complaint = true;
    if (typeof initGrowthModule === 'function') initGrowthModule();
  } else if (subTabName === 'wish' && !growthSubTabInitialized.wish) {
    growthSubTabInitialized.wish = true;
    // 心愿和真心话共用 growth.js
    if (!growthSubTabInitialized.complaint) {
      growthSubTabInitialized.complaint = true;
      if (typeof initGrowthModule === 'function') initGrowthModule();
    }
  } else if (subTabName === 'planting' && !growthSubTabInitialized.planting) {
    growthSubTabInitialized.planting = true;
    if (typeof initPlantingModule === 'function') initPlantingModule();
  }
}

/* ---------- 事件绑定 ---------- */
function bindAllEvents() {
  // 分区导航切换
  document.querySelectorAll('.navbar-nav .nav-link[data-zone]').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const zone = this.getAttribute('data-zone');
      if (typeof FamilyAuth !== 'undefined' && FamilyAuth.isLoggedIn()) {
        FamilyAuth.switchZoneForAuth(zone);
      } else {
        switchZone(zone);
      }
    });
  });

  // 分区1 子Tab切换
  document.querySelectorAll('#safetySubTabs button[data-bs-toggle="tab"]').forEach(btn => {
    btn.addEventListener('shown.bs.tab', function(e) {
      const targetId = e.target.getAttribute('data-bs-target').replace('#', '');
      const subTabMap = {
        'subTabAccounting': 'accounting',
        'subTabDocuments': 'documents',
        'subTabEmergency': 'emergency'
      };
      const subTabName = subTabMap[targetId];
      if (subTabName) initSafetySubTab(subTabName);
    });
  });

  // 分区2 子Tab切换
  document.querySelectorAll('#growthSubTabs button[data-bs-toggle="tab"]').forEach(btn => {
    btn.addEventListener('shown.bs.tab', function(e) {
      const targetId = e.target.getAttribute('data-bs-target').replace('#', '');
      const subTabMap = {
        'subTabComplaint': 'complaint',
        'subTabWish': 'wish',
        'subTabPlanting': 'planting'
      };
      const subTabName = subTabMap[targetId];
      if (subTabName) initGrowthSubTab(subTabName);
    });
  });
}

/* ---------- 页面启动 ---------- */
document.addEventListener('DOMContentLoaded', function() {
  console.log('[家庭全能管家] 平台启动');
  bindAllEvents();

  // 恢复上次选中的分区；登录成员默认成长区
  let activeZone = 'safety';
  try {
    const saved = localStorage.getItem('family_manager_active_zone');
    if (saved === 'growth') activeZone = 'growth';
  } catch (e) {}
  if (typeof FamilyAuth !== 'undefined' && FamilyAuth.isLoggedIn() && FamilyAuth.isMember()) {
    activeZone = 'growth';
  }

  switchZone(activeZone);
});
