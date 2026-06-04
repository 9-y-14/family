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
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (session?.token) headers.Authorization = 'Bearer ' + session.token;
      const res = await fetch(API_BASE.replace(/\/$/, '') + path, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      console.error('[apiPost] 网络异常', e);
      return { ok: false, status: 0, data: { error: '网络连接失败，请检查网络' } };
    }
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

  async function forgotPassword(username, managerPin, newPassword) {
    const online = await checkApi();
    if (!online) return { ok: false, error: '无法连接服务器' };
    const { ok, data } = await apiPost('/auth/reset-password', { username, managerPin, newPassword });
    if (!ok) return { ok: false, error: data.error || '重置失败' };
    return { ok: true, message: data.message, familyName: data.familyName, role: data.role };
  }

  async function getInviteCode() {
    const { ok, data } = await apiPost('/auth/invite-code', {});
    if (!ok) return { ok: false, error: data.error || '获取失败' };
    return { ok: true, inviteCode: data.inviteCode, familyName: data.familyName };
  }

  async function regenerateInviteCode(managerPin) {
    const { ok, data } = await apiPost('/auth/invite-code', { managerPin, action: 'regenerate' });
    if (!ok) return { ok: false, error: data.error || '重设失败' };
    return { ok: true, inviteCode: data.inviteCode, familyName: data.familyName };
  }

  async function getMembers() {
    const res = await fetch(API_BASE.replace(/\/$/, '') + '/members', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + (session?.token || '') }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || '获取成员失败' };
    return { ok: true, members: data.members, count: data.count };
  }

  async function removeMember(memberId, managerPin) {
    const res = await fetch(API_BASE.replace(/\/$/, '') + '/members/' + memberId, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (session?.token || '')
      },
      body: JSON.stringify({ managerPin })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || '移除失败' };
    return { ok: true, message: data.message };
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
    FamilySync.startPolling();
    // 登录后自动将云端家庭成员导入种植争霸赛参赛列表
    if (typeof window !== 'undefined' && window.PlantingModule?.syncFromCloud) {
      setTimeout(() => window.PlantingModule.syncFromCloud(), 500);
    }
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
    FamilySync.stopPolling();
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
      const inviteBtn = document.getElementById('btnShowInviteCode');
      if (inviteBtn) {
        if (isManager()) inviteBtn.classList.remove('d-none');
        else inviteBtn.classList.add('d-none');
      }
      const memberBtn = document.getElementById('btnMemberManage');
      if (memberBtn) {
        if (isManager()) memberBtn.classList.remove('d-none');
        else memberBtn.classList.add('d-none');
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
      // 同步种植争霸赛的云端导入 UI 状态
      if (typeof window !== 'undefined' && window.PlantingModule?.updateSyncUI) {
        window.PlantingModule.updateSyncUI();
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

    // 忘记密码
    document.getElementById('linkToForgotPassword')?.addEventListener('click', e => {
      e.preventDefault();
      bootstrap.Modal.getInstance(document.getElementById('modalLogin'))?.hide();
      const err = document.getElementById('forgotPasswordError');
      const success = document.getElementById('forgotPasswordSuccess');
      const form = document.getElementById('formForgotPassword');
      if (err) err.classList.add('d-none');
      if (success) success.classList.add('d-none');
      if (form) form.style.display = '';
      document.getElementById('fpUsername').value = '';
      document.getElementById('fpManagerPin').value = '';
      document.getElementById('fpNewPassword').value = '';
      bootstrap.Modal.getOrCreateInstance(document.getElementById('modalForgotPassword')).show();
    });

    document.getElementById('linkBackToLoginFromFP')?.addEventListener('click', e => {
      e.preventDefault();
      bootstrap.Modal.getInstance(document.getElementById('modalForgotPassword'))?.hide();
      bootstrap.Modal.getOrCreateInstance(document.getElementById('modalLogin')).show();
    });

    document.getElementById('formForgotPassword')?.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = document.getElementById('btnForgotPasswordSubmit');
      const err = document.getElementById('forgotPasswordError');
      const success = document.getElementById('forgotPasswordSuccess');
      err.classList.add('d-none');
      success.classList.add('d-none');
      btn.disabled = true;
      const r = await forgotPassword(
        document.getElementById('fpUsername').value.trim(),
        document.getElementById('fpManagerPin').value,
        document.getElementById('fpNewPassword').value
      );
      btn.disabled = false;
      if (r.ok) {
        success.innerHTML = `<i class="bi bi-check-circle me-1"></i>${r.message}（家庭：${r.familyName}）<br><small>请使用新密码登录</small>`;
        success.classList.remove('d-none');
        document.getElementById('formForgotPassword').style.display = 'none';
      } else {
        err.textContent = r.error;
        err.classList.remove('d-none');
      }
    });

    // 邀请码管理
    document.getElementById('btnShowInviteCode')?.addEventListener('click', async () => {
      const err = document.getElementById('inviteCodeManageError');
      if (err) err.classList.add('d-none');
      document.getElementById('inviteCodeManageDisplay').textContent = '加载中...';
      document.getElementById('inviteCodeFamilyName').textContent = '';
      document.getElementById('inviteCodeReauthBox').classList.add('d-none');
      document.getElementById('formReauthInvite')?.reset();
      bootstrap.Modal.getOrCreateInstance(document.getElementById('modalInviteCodeManage')).show();
      const r = await getInviteCode();
      if (r.ok) {
        document.getElementById('inviteCodeManageDisplay').textContent = r.inviteCode;
        document.getElementById('inviteCodeFamilyName').textContent = '家庭：' + r.familyName;
      } else {
        document.getElementById('inviteCodeManageDisplay').textContent = '获取失败';
        if (err) { err.textContent = r.error; err.classList.remove('d-none'); }
      }
    });

    document.getElementById('btnCopyInviteCode')?.addEventListener('click', () => {
      const code = document.getElementById('inviteCodeManageDisplay').textContent;
      if (code && code !== '--------' && code !== '获取失败' && code !== '加载中...') {
        navigator.clipboard.writeText(code).then(() => {
          showToast('邀请码已复制到剪贴板', 'success');
        });
      }
    });

    document.getElementById('btnRegenerateInvite')?.addEventListener('click', () => {
      document.getElementById('inviteCodeReauthBox').classList.remove('d-none');
      document.getElementById('inviteCodeManageError')?.classList.add('d-none');
    });

    document.getElementById('btnCancelReauthInvite')?.addEventListener('click', () => {
      document.getElementById('inviteCodeReauthBox').classList.add('d-none');
      document.getElementById('formReauthInvite')?.reset();
    });

    document.getElementById('formReauthInvite')?.addEventListener('submit', async e => {
      e.preventDefault();
      const err = document.getElementById('inviteCodeManageError');
      if (err) err.classList.add('d-none');
      const r = await regenerateInviteCode(document.getElementById('inviteReauthPin').value);
      if (r.ok) {
        document.getElementById('inviteCodeManageDisplay').textContent = r.inviteCode;
        document.getElementById('inviteCodeFamilyName').textContent = '家庭：' + r.familyName;
        document.getElementById('inviteCodeReauthBox').classList.add('d-none');
        document.getElementById('formReauthInvite')?.reset();
        showToast('邀请码已重设，旧邀请码立即失效', 'warning');
      } else {
        if (err) { err.textContent = r.error; err.classList.remove('d-none'); }
      }
    });

    document.getElementById('btnShowJoin')?.addEventListener('click', () => {
      bootstrap.Modal.getOrCreateInstance(document.getElementById('modalJoin')).show();
    });

    // 成员管理
    document.getElementById('btnMemberManage')?.addEventListener('click', async () => {
      const err = document.getElementById('memberManageError');
      const succ = document.getElementById('memberManageSuccess');
      if (err) err.classList.add('d-none');
      if (succ) succ.classList.add('d-none');
      document.getElementById('memberRemoveConfirm').classList.add('d-none');
      document.getElementById('formRemoveMember')?.reset();

      // 加载邀请码
      const codeR = await getInviteCode();
      if (codeR.ok) {
        document.getElementById('memberInviteCode').textContent = codeR.inviteCode;
      }

      // 加载成员列表
      await refreshMemberList();

      bootstrap.Modal.getOrCreateInstance(document.getElementById('modalMemberManage')).show();
    });

    document.getElementById('btnCopyMemberInvite')?.addEventListener('click', () => {
      const code = document.getElementById('memberInviteCode').textContent;
      if (code && code !== '----') {
        navigator.clipboard.writeText(code).then(() => {
          showToast('邀请码已复制到剪贴板', 'success');
        });
      }
    });

    document.getElementById('btnCancelRemove')?.addEventListener('click', () => {
      document.getElementById('memberRemoveConfirm').classList.add('d-none');
      document.getElementById('formRemoveMember')?.reset();
      document.getElementById('memberManageError')?.classList.add('d-none');
    });

    document.getElementById('formRemoveMember')?.addEventListener('submit', async e => {
      e.preventDefault();
      const err = document.getElementById('memberManageError');
      const succ = document.getElementById('memberManageSuccess');
      if (err) err.classList.add('d-none');
      if (succ) succ.classList.add('d-none');

      const targetId = document.getElementById('memberRemoveConfirm').dataset.targetId;
      const pin = document.getElementById('removePin').value;
      if (!targetId || !pin) return;

      const r = await removeMember(targetId, pin);
      if (r.ok) {
        document.getElementById('memberRemoveConfirm').classList.add('d-none');
        document.getElementById('formRemoveMember')?.reset();
        showToast(r.message, 'success');
        // 联动清理种植争霸赛中的该成员
        if (typeof window !== 'undefined' && window.PlantingModule?.removeByCloudId) {
          window.PlantingModule.removeByCloudId(targetId);
        }
        await refreshMemberList();
      } else {
        if (err) { err.textContent = r.error; err.classList.remove('d-none'); }
      }
    });
  }

  async function refreshMemberList() {
    const container = document.getElementById('memberListContainer');
    if (!container) return;
    const r = await getMembers();
    if (!r.ok) {
      container.innerHTML = `<div class="text-center text-danger small py-3">${r.error}</div>`;
      document.getElementById('memberCount').textContent = '0';
      return;
    }
    document.getElementById('memberCount').textContent = r.count;
    if (r.members.length === 0) {
      container.innerHTML = '<div class="text-center text-muted small py-3">暂无成员，请分享邀请码</div>';
      return;
    }
    container.innerHTML = r.members.map(m => {
      const roleBadge = m.role === 'manager'
        ? '<span class="badge bg-warning text-dark">管理者</span>'
        : '<span class="badge bg-info text-dark">成员</span>';
      const selfBadge = m.isSelf ? ' <span class="badge bg-secondary">我</span>' : '';
      const removeBtn = (!m.isSelf && m.role !== 'manager')
        ? `<button class="btn btn-outline-danger btn-sm py-0 px-1 member-remove-btn" data-id="${m.id}" data-name="${m.displayName || m.username}" title="移除">
             <i class="bi bi-x-lg"></i>
           </button>`
        : '<span class="text-muted small">—</span>';
      return `
        <div class="d-flex align-items-center justify-content-between py-2 border-bottom">
          <div>
            <span class="fw-bold">${escapeHtml(m.displayName || m.username)}</span>
            <span class="text-muted small ms-2">@${escapeHtml(m.username)}</span>
            ${roleBadge}${selfBadge}
          </div>
          <div>${removeBtn}</div>
        </div>`;
    }).join('');

    // 绑定移除按钮
    container.querySelectorAll('.member-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        document.getElementById('memberManageError')?.classList.add('d-none');
        document.getElementById('memberManageSuccess')?.classList.add('d-none');
        const confirmBox = document.getElementById('memberRemoveConfirm');
        confirmBox.dataset.targetId = id;
        document.getElementById('removeTargetName').textContent = name;
        document.getElementById('removePin').value = '';
        confirmBox.classList.remove('d-none');
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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
        FamilySync.startPolling();
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
    forgotPassword,
    getInviteCode,
    regenerateInviteCode,
    getMembers,
    removeMember,
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
