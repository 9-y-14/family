/**
 * 家庭数据同步层：登录用户数据云端同步，未登录使用本地示例
 */
const FamilySync = (function () {
  const API_BASE = (typeof window !== 'undefined' && window.FAMILY_API_BASE) || '/api';
  const SESSION_KEY = 'family_auth_session';
  const MANAGER_KEY = 'family_manager_unlock';
  const LOCAL_PREFIX = 'family_user_data_';

  let serverUpdatedAt = 0;
  let saveTimer = null;
  let pulling = false;

  const MODULE_KEYS = {
    accounting: 'family_ledger_accounting',
    documents: 'family_manager_documents',
    emergency_items: 'family_manager_emergency_items',
    emergency_last_check: 'family_manager_emergency_last_check',
    complaints: 'family_manager_complaints',
    wishes: 'family_manager_wishes',
    week_wish_pick: 'family_manager_week_wish_pick',
    plant_members: 'family_manager_plant_members',
    plants: 'family_manager_plants',
    plant_week: 'family_manager_plant_week',
    claimed_wishes: 'family_manager_claimed_wishes',
    gift_history: 'family_ledger_gift_history'
  };

  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function getManagerUnlock() {
    try {
      const raw = sessionStorage.getItem(MANAGER_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.expiresAt && Date.now() > data.expiresAt) {
        sessionStorage.removeItem(MANAGER_KEY);
        return null;
      }
      return data;
    } catch (_) {
      return null;
    }
  }

  function authHeaders(includeManager) {
    const session = getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.token) headers.Authorization = 'Bearer ' + session.token;
    if (includeManager) {
      const mgr = getManagerUnlock();
      if (mgr?.managerToken) headers['X-Manager-Token'] = mgr.managerToken;
    }
    return headers;
  }

  function collectPayload() {
    const payload = {};
    Object.entries(MODULE_KEYS).forEach(([id, key]) => {
      try {
        const v = localStorage.getItem(key);
        if (v !== null) payload[id] = JSON.parse(v);
      } catch (_) {
        payload[id] = localStorage.getItem(key);
      }
    });
    return payload;
  }

  function applyPayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    Object.entries(MODULE_KEYS).forEach(([id, key]) => {
      if (payload[id] === undefined) {
        localStorage.removeItem(key);
        return;
      }
      const item = payload[id];
      if (typeof item === 'string' && id === 'emergency_last_check') {
        localStorage.setItem(key, item);
      } else if (typeof item === 'string') {
        localStorage.setItem(key, item);
      } else {
        localStorage.setItem(key, JSON.stringify(item));
      }
    });
  }

  function clearUserLocalData() {
    Object.values(MODULE_KEYS).forEach(key => localStorage.removeItem(key));
  }

  async function apiRequest(path, options = {}) {
    const url = API_BASE.replace(/\/$/, '') + path;
    const res = await fetch(url, options);
    let data = {};
    try {
      data = await res.json();
    } catch (_) {}
    return { ok: res.ok, status: res.status, data };
  }

  async function checkApiAvailable() {
    const { ok, data } = await apiRequest('/health', { method: 'GET' });
    return ok && data?.ok;
  }

  async function pullFromServer() {
    if (!FamilyAuth.isLoggedIn() || pulling) return { ok: false };
    pulling = true;
    try {
      const { ok, status, data } = await apiRequest('/data', {
        method: 'GET',
        headers: authHeaders(false)
      });
      if (status === 401) {
        FamilyAuth.logout(false);
        return { ok: false, unauthorized: true };
      }
      if (!ok) return { ok: false, offline: status === 0 || status >= 500 };
      applyPayload(data.payload || {});
      serverUpdatedAt = data.updatedAt || 0;
      return { ok: true };
    } finally {
      pulling = false;
    }
  }

  async function pushToServer() {
    if (!FamilyAuth.isLoggedIn()) return;
    if (FamilyAuth.isManager() && !FamilyAuth.isSafetyUnlocked()) return;

    let payload = collectPayload();
    if (FamilyAuth.isMember()) {
      const growthOnly = {};
      ['complaints', 'wishes', 'week_wish_pick', 'plant_members', 'plants', 'plant_week', 'claimed_wishes'].forEach(k => {
        if (payload[k] !== undefined) growthOnly[k] = payload[k];
      });
      payload = growthOnly;
    }
    const headers = FamilyAuth.isManager() ? authHeaders(true) : authHeaders(false);
    const { ok, status, data } = await apiRequest('/data', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ payload, clientUpdatedAt: serverUpdatedAt })
    });
    if (status === 401) {
      FamilyAuth.logout(false);
      return;
    }
    if (status === 409 && data.conflict) {
      applyPayload(data.serverPayload);
      serverUpdatedAt = data.updatedAt;
      if (typeof FamilyAuth.reloadAllModules === 'function') FamilyAuth.reloadAllModules();
      return;
    }
    if (ok && data.updatedAt) serverUpdatedAt = data.updatedAt;
  }

  function scheduleSave() {
    if (!FamilyAuth.isLoggedIn()) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => pushToServer(), 800);
  }

  async function pushGrowthOnly() {
    if (!FamilyAuth.isLoggedIn() || FamilyAuth.isManager()) return;
    const full = collectPayload();
    const growthOnly = {};
    ['complaints', 'wishes', 'week_wish_pick', 'plant_members', 'plants', 'plant_week', 'claimed_wishes'].forEach(k => {
      if (full[k] !== undefined) growthOnly[k] = full[k];
    });
    await apiRequest('/data', {
      method: 'PUT',
      headers: authHeaders(false),
      body: JSON.stringify({ payload: growthOnly, clientUpdatedAt: serverUpdatedAt })
    });
  }

  function notifyDataChanged() {
    scheduleSave();
  }

  return {
    MODULE_KEYS,
    getSession,
    pullFromServer,
    pushToServer,
    scheduleSave,
    notifyDataChanged,
    clearUserLocalData,
    applyPayload,
    collectPayload,
    checkApiAvailable,
    setManagerUnlock(managerToken, expiresIn) {
      sessionStorage.setItem(
        MANAGER_KEY,
        JSON.stringify({
          managerToken,
          expiresAt: Date.now() + (expiresIn || 1800) * 1000
        })
      );
    },
    clearManagerUnlock() {
      sessionStorage.removeItem(MANAGER_KEY);
    },
    isManagerUnlocked() {
      return !!getManagerUnlock();
    }
  };
})();
