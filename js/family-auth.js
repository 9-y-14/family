/**
 * 家庭用户认证：登录、注册、家庭加入、管理者台账区认证
 */
const FamilyAuth = (function () {
  const SESSION_KEY = 'family_auth_session';
  const API_BASE = (typeof window !== 'undefined' && window.FAMILY_API_BASE) || '/api';

  let session = null;
  let apiOnline = null;

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      session = raw ? JSON.parse(raw) : null;
    } catch (_) {
      session = null;
    }
    return session;
  }

  function saveSession(data) {
    session = data;
    if (data) sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    else sessionStorage.removeItem(SESSION_KEY);
    updateNavbar();
  }

  function isLoggedIn() {
    return !!session?.token;
  }

  function isManager() {
    return session?.user?.role === 'manager';
  }

  function isMember() {
    return session?.user?.role === 'member';
  }

  function getUser() {
    return session?.user || null;
  }

  function isSafetyUnlocked() {
    return isManager() && FamilySync.isManagerUnlocked();
  }

  function canAccessSafetyZone() {
    if (!isLoggedIn()) return true;
    return isManager() && isSafetyUnlocked();
  }

  function shouldUseDemoData() {
    return !isLoggedIn();
  }

  async function apiPost(path, body) {
    const res = await fetch(API_BASE.replace(/\/$/, '') + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  async function checkApi() {
    if (apiOnline !== null) return apiOnline;
    apiOnline = await FamilySync.checkApiAvailable();
    return apiOnline;
  }

  async function login(username, password) {
    const online = await checkApi();
    if (!online) {
      return { ok: false, error: '无法连接服务器。部署到 Cloudflare 并配置 D1 后即可使用账号登录与多端同步。' };
    }
    const { ok, data } = await apiPost('/auth/login', { username, password });
    if (!ok) return { ok: false, error: data.error || '登录失败' };
    await onLoginSuccess(data);
    return { ok: true };
  }

  async function registerManager(form) {
    const online = await checkApi();
    if (!online) {
      return { ok: false, error: '无法连接服务器，请确认已部署 API 并绑定 D1 数据库。' };
    }
    const { ok, data } = await apiPost('/auth/register', form);
    if (!ok) return { ok: false, error: data.error || '注册失败' };
    await onLoginSuccess(data);
    return { ok: true, inviteCode: data.inviteCode };
  }

  async function joinFamily(form) {
    const online = await checkApi();
    if (!online) {
      return { ok: false, error: '无法连接服务器，请确认已部署 API。' };
    }
    const { ok, data } = await apiPost('/auth/join', form);
    if (!ok) return { ok: false, error: data.error || '加入失败' };
    await onLoginSuccess(data);
    return { ok: true };
  }

  async function verifyManagerPin(pin) {
    if (!isManager()) return { ok: false, error: '仅家庭管理者可验证' };
    const res = await fetch(API_BASE.replace(/\/$/, '') + '/auth/manager-verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.token
      },
      body: JSON.stringify({ managerPin: pin })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || '验证失败' };
    FamilySync.setManagerUnlock(data.managerToken, data.expiresIn);
    return { ok: true };
  }

  async function onLoginSuccess(data) {
    FamilySync.clearManagerUnlock();
    saveSession({ token: data.token, user: data.user });
    FamilySync.clearUserLocalData();
    const pull = await FamilySync.pullFromServer();
    if (!pull.ok && !pull.unauthorized) {
      console.warn('[认证] 云端拉取失败，使用空白本地数据');
    }
    resetModuleFlags();
    reloadAllModules();
    if (isManager()) {
      showManagerVerifyModal(() => {
        switchZoneForAuth('safety');
      });
    } else {
      switchZoneForAuth('growth');
    }
  }

  function logout(showMessage) {
    FamilySync.clearManagerUnlock();
    saveSession(null);
    resetModuleFlags();
    reloadAllModules();
    switchZoneForAuth('safety');
    if (showMessage !== false) {
      showToast('已退出登录，当前显示为示例数据', 'info');
    }
  }

  function resetModuleFlags() {
    if (typeof zoneInitialized !== 'undefined') {
      zoneInitialized.safety = false;
      zoneInitialized.growth = false;
    }
    if (typeof safetySubTabInitialized !== 'undefined') {
      Object.keys(safetySubTabInitialized).forEach(k => { safetySubTabInitialized[k] = false; });
    }
    if (typeof growthSubTabInitialized !== 'undefined') {
      Object.keys(growthSubTabInitialized).forEach(k => { growthSubTabInitialized[k] = false; });
    }
  }

  function reloadAllModules() {
    updateNavbar();
    updateSafetyVisibility();
    if (typeof switchZone === 'function') {
      const zone = isLoggedIn() && isMember() ? 'growth' : 'safety';
      switchZone(zone);
    }
  }

  function updateNavbar() {
    const guest = document.getElementById('authGuest');
    const userBar = document.getElementById('authUser');
    const userLabel = document.getElementById('authUserLabel');
    const navSafety = document.getElementById('navSafety');
    const hint = document.getElementById('dataModeHint');
    const reauth = document.getElementById('btnManagerReauth');
    const safetyBadge = document.getElementById('safetyDataBadge');
    if (!guest || !userBar) return;

    if (isLoggedIn()) {
      guest.classList.add('d-none');
      userBar.classList.remove('d-none');
      const u = getUser();
      const roleText = u.role === 'manager' ? '管理者' : '成员';
      userLabel.textContent = `${u.displayName || u.username} · ${u.familyName || '我的家庭'} (${roleText})`;
      if (navSafety) {
        if (isMember()) navSafety.closest('.nav-item').classList.add('d-none');
        else navSafety.closest('.nav-item').classList.remove('d-none');
      }
      if (reauth) {
        if (isManager()) reauth.classList.remove('d-none');
        else reauth.classList.add('d-none');
      }
      if (hint) {
        hint.innerHTML = isMember()
          ? '<i class="bi bi-cloud-check me-1"></i>已登录 · 家庭云同步 · 仅成长互动区'
          : '<i class="bi bi-cloud-check me-1"></i>已登录 · 家庭云同步';
      }
      if (safetyBadge) {
        safetyBadge.innerHTML = isMember()
          ? '<i class="bi bi-shield-x me-1"></i>台账区对普通成员不可见'
          : '<i class="bi bi-shield-lock me-1"></i>真实家庭台账 · 需管理者认证访问';
      }
    } else {
      guest.classList.remove('d-none');
      userBar.classList.add('d-none');
      if (navSafety) navSafety.closest('.nav-item').classList.remove('d-none');
      if (reauth) reauth.classList.add('d-none');
      if (hint) hint.innerHTML = '<i class="bi bi-eye me-1"></i>未登录：示例数据预览';
      if (safetyBadge) {
        safetyBadge.innerHTML = '<i class="bi bi-info-circle me-1"></i>未登录时为示例数据；登录后仅管理者可访问真实台账';
      }
    }
  }

  function updateSafetyVisibility() {
    const zone = document.getElementById('zoneSafety');
    const lock = document.getElementById('safetyZoneLock');
    if (!zone) return;

    if (!isLoggedIn()) {
      if (lock) lock.style.display = 'none';
      zone.classList.remove('pe-none', 'opacity-50');
      return;
    }

    if (isMember()) {
      if (lock) {
        lock.style.display = 'flex';
        lock.querySelector('.lock-title').textContent = '居家安全资产台账区仅家庭管理者可见';
        lock.querySelector('.lock-desc').textContent =
          '您当前为普通家庭成员，无法查看或修改人情往来、证件保单、家庭药品等敏感台账数据。';
      }
      zone.classList.add('d-none');
      return;
    }

    if (isManager() && !isSafetyUnlocked()) {
      zone.classList.remove('d-none');
      if (lock) {
        lock.style.display = 'flex';
        lock.querySelector('.lock-title').textContent = '需要家庭管理者认证';
        lock.querySelector('.lock-desc').textContent =
          '居家安全资产台账区包含敏感家庭数据，请输入注册时设置的管理者验证码以解锁访问。';
      }
      zone.classList.add('pe-none', 'opacity-50');
      return;
    }

    if (lock) lock.style.display = 'none';
    zone.classList.remove('pe-none', 'opacity-50', 'd-none');
  }

  function switchZoneForAuth(zoneName) {
    if (isLoggedIn() && isMember() && zoneName === 'safety') {
      showToast('普通成员无法访问居家安全资产台账区', 'warning');
      zoneName = 'growth';
    }
    if (isLoggedIn() && isManager() && zoneName === 'safety' && !isSafetyUnlocked()) {
      showManagerVerifyModal(() => {
        if (typeof switchZone === 'function') switchZone('safety');
        updateSafetyVisibility();
      });
      return;
    }
    if (typeof switchZone === 'function') switchZone(zoneName);
    updateSafetyVisibility();
  }

  function showToast(msg, type) {
    const el = document.getElementById('authToast');
    if (!el) return;
    el.className = `toast align-items-center text-bg-${type || 'primary'} border-0 show`;
    el.querySelector('.toast-body').textContent = msg;
    const t = bootstrap.Toast.getOrCreateInstance(el, { delay: 4000 });
    t.show();
  }

  function bindAuthUI() {
    document.getElementById('btnShowLogin')?.addEventListener('click', () => {
      bootstrap.Modal.getOrCreateInstance(document.getElementById('modalLogin')).show();
    });
    document.getElementById('btnShowRegister')?.addEventListener('click', () => {
      bootstrap.Modal.getOrCreateInstance(document.getElementById('modalRegister')).show();
    });
    document.getElementById('btnShowJoin')?.addEventListener('click', () => {
      bootstrap.Modal.getOrCreateInstance(document.getElementById('modalJoin')).show();
    });
    document.getElementById('btnLogout')?.addEventListener('click', () => logout(true));

    document.getElementById('formLogin')?.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = document.getElementById('btnLoginSubmit');
      btn.disabled = true;
      const err = document.getElementById('loginError');
      err.classList.add('d-none');
      const r = await login(
        document.getElementById('loginUsername').value.trim(),
        document.getElementById('loginPassword').value
      );
      btn.disabled = false;
      if (r.ok) {
        bootstrap.Modal.getInstance(document.getElementById('modalLogin'))?.hide();
        showToast('登录成功，已同步家庭数据', 'success');
      } else {
        err.textContent = r.error;
        err.classList.remove('d-none');
      }
    });

    document.getElementById('formRegister')?.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = document.getElementById('btnRegisterSubmit');
      const err = document.getElementById('registerError');
      err.classList.add('d-none');
      const pin = document.getElementById('regManagerPin').value;
      const pin2 = document.getElementById('regManagerPin2').value;
      if (pin !== pin2) {
        err.textContent = '两次管理者验证码不一致';
        err.classList.remove('d-none');
        return;
      }
      btn.disabled = true;
      const r = await registerManager({
        familyName: document.getElementById('regFamilyName').value.trim(),
        username: document.getElementById('regUsername').value.trim(),
        password: document.getElementById('regPassword').value,
        displayName: document.getElementById('regDisplayName').value.trim(),
        managerPin: pin
      });
      btn.disabled = false;
      if (r.ok) {
        bootstrap.Modal.getInstance(document.getElementById('modalRegister'))?.hide();
        document.getElementById('inviteCodeDisplay').textContent = r.inviteCode || '—';
        bootstrap.Modal.getOrCreateInstance(document.getElementById('modalInviteCode')).show();
        showToast('家庭创建成功', 'success');
      } else {
        err.textContent = r.error;
        err.classList.remove('d-none');
      }
    });

    document.getElementById('formJoin')?.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = document.getElementById('btnJoinSubmit');
      const err = document.getElementById('joinError');
      err.classList.add('d-none');
      btn.disabled = true;
      const r = await joinFamily({
        inviteCode: document.getElementById('joinInviteCode').value.trim().toUpperCase(),
        username: document.getElementById('joinUsername').value.trim(),
        password: document.getElementById('joinPassword').value,
        displayName: document.getElementById('joinDisplayName').value.trim()
      });
      btn.disabled = false;
      if (r.ok) {
        bootstrap.Modal.getInstance(document.getElementById('modalJoin'))?.hide();
        showToast('已加入家庭', 'success');
      } else {
        err.textContent = r.error;
        err.classList.remove('d-none');
      }
    });

    document.getElementById('formManagerVerify')?.addEventListener('submit', async e => {
      e.preventDefault();
      const err = document.getElementById('managerVerifyError');
      err.classList.add('d-none');
      const r = await verifyManagerPin(document.getElementById('managerPinInput').value);
      if (r.ok) {
        bootstrap.Modal.getInstance(document.getElementById('modalManagerVerify'))?.hide();
        updateSafetyVisibility();
        showToast('管理者认证成功，可访问台账区', 'success');
        if (window._managerVerifyCallback) {
          window._managerVerifyCallback();
          window._managerVerifyCallback = null;
        }
      } else {
        err.textContent = r.error;
        err.classList.remove('d-none');
      }
    });

    document.getElementById('btnManagerReauth')?.addEventListener('click', () => {
      FamilySync.clearManagerUnlock();
      updateSafetyVisibility();
      showManagerVerifyModal();
    });

    document.getElementById('btnUnlockSafetyFromLock')?.addEventListener('click', () => {
      showManagerVerifyModal(() => {
        updateSafetyVisibility();
        if (typeof switchZone === 'function') switchZone('safety');
      });
    });

    document.getElementById('linkToJoinFromLogin')?.addEventListener('click', e => {
      e.preventDefault();
      bootstrap.Modal.getInstance(document.getElementById('modalLogin'))?.hide();
      bootstrap.Modal.getOrCreateInstance(document.getElementById('modalJoin')).show();
    });

    document.getElementById('btnShowJoin')?.addEventListener('click', () => {
      bootstrap.Modal.getOrCreateInstance(document.getElementById('modalJoin')).show();
    });
  }

  function showManagerVerifyModal(onSuccess) {
    if (!isManager()) return;
    window._managerVerifyCallback = onSuccess || null;
    document.getElementById('managerPinInput').value = '';
    document.getElementById('managerVerifyError')?.classList.add('d-none');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalManagerVerify')).show();
  }

  function init() {
    loadSession();
    bindAuthUI();
    updateNavbar();
    updateSafetyVisibility();
    if (isLoggedIn()) {
      FamilySync.pullFromServer().then(() => {
        resetModuleFlags();
        reloadAllModules();
      });
    }
  }

  return {
    init,
    isLoggedIn,
    isManager,
    isMember,
    getUser,
    isSafetyUnlocked,
    canAccessSafetyZone,
    shouldUseDemoData,
    logout,
    login,
    verifyManagerPin,
    showManagerVerifyModal,
    reloadAllModules,
    updateSafetyVisibility,
    switchZoneForAuth,
    showToast
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  FamilyAuth.init();
});
