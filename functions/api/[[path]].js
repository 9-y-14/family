/**
 * Cloudflare Pages Function - 家庭全能管家 API
 * 路由: /api/*
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8'
};

const PBKDF2_ITERATIONS = 100000;
const TOKEN_TTL_SEC = 7 * 24 * 60 * 60;
const MANAGER_TOKEN_TTL_SEC = 30 * 60;

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (!env.DB) {
    return json({ error: '数据库未配置，请在 Cloudflare Pages 绑定 D1 数据库' }, 503);
  }
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const route = parts[0] || '';

  try {
    if (route === 'health') return json({ ok: true, service: 'family-manager-api' });

    if (route === 'auth') {
      const action = parts[1] || '';
      if (request.method === 'POST' && action === 'register') return registerManager(request, env);
      if (request.method === 'POST' && action === 'join') return joinFamily(request, env);
      if (request.method === 'POST' && action === 'login') return login(request, env);
      if (request.method === 'POST' && action === 'manager-verify') return verifyManagerPin(request, env);
    }

    const user = await authenticate(request, env);
    if (!user) return json({ error: '未登录或登录已过期' }, 401);

    if (route === 'me' && request.method === 'GET') {
      return json({
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          role: user.role,
          familyId: user.family_id,
          familyName: user.family_name
        }
      });
    }

    if (route === 'data') {
      if (request.method === 'GET') return getFamilyData(user, env);
      if (request.method === 'PUT') return putFamilyData(request, user, env);
    }

    return json({ error: '接口不存在' }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: err.message || '服务器错误' }, 500);
  }
}

/* ---------- 注册 / 登录 ---------- */

async function registerManager(request, env) {
  const body = await parseJson(request);
  const { familyName, username, password, displayName, managerPin } = body;
  if (!familyName?.trim() || !username?.trim() || !password || !managerPin) {
    return json({ error: '请填写家庭名称、用户名、密码和管理者验证码' }, 400);
  }
  if (String(managerPin).length < 4) {
    return json({ error: '管理者验证码至少 4 位' }, 400);
  }
  if (password.length < 6) {
    return json({ error: '密码至少 6 位' }, 400);
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username.trim()).first();
  if (existing) return json({ error: '用户名已被使用' }, 409);

  const familyId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const inviteCode = generateInviteCode();
  const now = Date.now();
  const pinHash = await hashSecret(String(managerPin));
  const passHash = await hashSecret(password);

  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO families (id, name, invite_code, manager_pin_hash, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(familyId, familyName.trim(), inviteCode, pinHash, now),
    env.DB.prepare(
      'INSERT INTO users (id, family_id, username, password_hash, role, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, familyId, username.trim(), passHash, 'manager', (displayName || username).trim(), now),
    env.DB.prepare('INSERT INTO family_data (family_id, payload, updated_at) VALUES (?, ?, ?)').bind(familyId, '{}', now)
  ]);

  const token = await signToken({ sub: userId, role: 'manager', fid: familyId }, env);
  return json({
    token,
    inviteCode,
    user: {
      id: userId,
      username: username.trim(),
      displayName: (displayName || username).trim(),
      role: 'manager',
      familyId,
      familyName: familyName.trim()
    }
  });
}

async function joinFamily(request, env) {
  const body = await parseJson(request);
  const { inviteCode, username, password, displayName } = body;
  if (!inviteCode?.trim() || !username?.trim() || !password) {
    return json({ error: '请填写邀请码、用户名和密码' }, 400);
  }
  if (password.length < 6) return json({ error: '密码至少 6 位' }, 400);

  const family = await env.DB.prepare('SELECT id, name FROM families WHERE invite_code = ?')
    .bind(inviteCode.trim().toUpperCase()).first();
  if (!family) return json({ error: '邀请码无效' }, 404);

  const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username.trim()).first();
  if (existing) return json({ error: '用户名已被使用' }, 409);

  const userId = crypto.randomUUID();
  const now = Date.now();
  const passHash = await hashSecret(password);

  await env.DB.prepare(
    'INSERT INTO users (id, family_id, username, password_hash, role, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(userId, family.id, username.trim(), passHash, 'member', (displayName || username).trim(), now).run();

  const token = await signToken({ sub: userId, role: 'member', fid: family.id }, env);
  return json({
    token,
    user: {
      id: userId,
      username: username.trim(),
      displayName: (displayName || username).trim(),
      role: 'member',
      familyId: family.id,
      familyName: family.name
    }
  });
}

async function login(request, env) {
  const body = await parseJson(request);
  const { username, password } = body;
  if (!username?.trim() || !password) return json({ error: '请输入用户名和密码' }, 400);

  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.password_hash, u.role, u.display_name, u.family_id, f.name AS family_name
     FROM users u JOIN families f ON f.id = u.family_id WHERE u.username = ?`
  ).bind(username.trim()).first();
  if (!row) return json({ error: '用户名或密码错误' }, 401);

  const ok = await verifySecret(password, row.password_hash);
  if (!ok) return json({ error: '用户名或密码错误' }, 401);

  const token = await signToken({ sub: row.id, role: row.role, fid: row.family_id }, env);
  return json({
    token,
    user: {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      familyId: row.family_id,
      familyName: row.family_name
    }
  });
}

async function verifyManagerPin(request, env) {
  const user = await authenticate(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  if (user.role !== 'manager') return json({ error: '仅家庭管理者可验证' }, 403);

  const body = await parseJson(request);
  const { managerPin } = body;
  if (!managerPin) return json({ error: '请输入管理者验证码' }, 400);

  const family = await env.DB.prepare('SELECT manager_pin_hash FROM families WHERE id = ?')
    .bind(user.family_id).first();
  if (!family) return json({ error: '家庭不存在' }, 404);

  const ok = await verifySecret(String(managerPin), family.manager_pin_hash);
  if (!ok) return json({ error: '管理者验证码错误' }, 401);

  const managerToken = await signToken(
    { sub: user.id, role: 'manager', fid: user.family_id, mgr: true },
    env,
    MANAGER_TOKEN_TTL_SEC
  );
  return json({ managerToken, expiresIn: MANAGER_TOKEN_TTL_SEC });
}

/* ---------- 家庭数据同步 ---------- */

async function getFamilyData(user, env) {
  const row = await env.DB.prepare('SELECT payload, updated_at FROM family_data WHERE family_id = ?')
    .bind(user.family_id).first();
  let payload = {};
  if (row?.payload) {
    try { payload = JSON.parse(row.payload); } catch (_) { payload = {}; }
  }
  if (user.role === 'member') {
    const filtered = {};
    GROWTH_MODULE_KEYS.forEach(k => {
      if (payload[k] !== undefined) filtered[k] = payload[k];
    });
    payload = filtered;
  }
  return json({ payload, updatedAt: row?.updated_at || 0 });
}

const GROWTH_MODULE_KEYS = new Set([
  'complaints', 'wishes', 'week_wish_pick', 'plant_members', 'plants', 'plant_week', 'claimed_wishes'
]);

const SAFETY_MODULE_KEYS = new Set([
  'accounting', 'documents', 'emergency_items', 'emergency_last_check', 'gift_history'
]);

async function putFamilyData(request, user, env) {
  const body = await parseJson(request);
  const { payload, clientUpdatedAt } = body;
  if (!payload || typeof payload !== 'object') return json({ error: '无效的数据格式' }, 400);

  const row = await env.DB.prepare('SELECT payload, updated_at FROM family_data WHERE family_id = ?')
    .bind(user.family_id).first();

  let serverPayload = {};
  if (row?.payload) {
    try { serverPayload = JSON.parse(row.payload); } catch (_) {}
  }

  if (row && clientUpdatedAt && row.updated_at > clientUpdatedAt) {
    return json({
      conflict: true,
      serverPayload,
      updatedAt: row.updated_at,
      message: '服务器数据更新，已返回最新版本'
    }, 409);
  }

  let merged = { ...serverPayload };

  if (user.role === 'manager') {
    const mgr = await authenticateManager(request, env);
    if (!mgr) return json({ error: '请先完成管理者身份认证' }, 403);
    merged = { ...merged, ...payload };
  } else {
    for (const key of Object.keys(payload)) {
      if (!GROWTH_MODULE_KEYS.has(key)) {
        return json({ error: '普通成员仅可同步温情成长互动区数据' }, 403);
      }
      merged[key] = payload[key];
    }
  }

  const now = Date.now();
  const jsonStr = JSON.stringify(merged);
  await env.DB.prepare(
    `INSERT INTO family_data (family_id, payload, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(family_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
  ).bind(user.family_id, jsonStr, now).run();

  return json({ ok: true, updatedAt: now });
}

/* ---------- 认证 ---------- */

async function authenticate(request, env) {
  const token = extractBearer(request);
  if (!token) return null;
  const payload = await verifyToken(token, env);
  if (!payload?.sub) return null;

  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.role, u.display_name, u.family_id, f.name AS family_name
     FROM users u JOIN families f ON f.id = u.family_id WHERE u.id = ?`
  ).bind(payload.sub).first();
  return row || null;
}

async function authenticateManager(request, env) {
  const mgrHeader = request.headers.get('X-Manager-Token');
  if (!mgrHeader) return null;
  const payload = await verifyToken(mgrHeader, env);
  if (!payload?.mgr) return null;
  return authenticate(request, env);
}

/* ---------- 密码 / JWT 工具 ---------- */

async function hashSecret(text) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(text, salt);
  const hash = await crypto.subtle.exportKey('raw', key);
  return `pbkdf2:${bufToB64(salt)}:${bufToB64(new Uint8Array(hash))}`;
}

async function verifySecret(text, stored) {
  const parts = stored.split(':');
  if (parts[0] !== 'pbkdf2' || parts.length !== 3) return false;
  const salt = b64ToBuf(parts[1]);
  const expected = b64ToBuf(parts[2]);
  const key = await deriveKey(text, salt);
  const hash = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  if (hash.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ expected[i];
  return diff === 0;
}

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    256
  );
  return crypto.subtle.importKey('raw', bits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function signToken(payload, env, ttl = TOKEN_TTL_SEC) {
  const secret = getJwtSecret(env);
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttl };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(body));
  const sig = await hmacSign(`${h}.${p}`, secret);
  return `${h}.${p}.${sig}`;
}

async function verifyToken(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const secret = getJwtSecret(env);
  const expected = await hmacSign(`${parts[0]}.${parts[1]}`, secret);
  if (parts[2] !== expected) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function getJwtSecret(env) {
  return env.JWT_SECRET || 'family-manager-dev-secret-change-in-production';
}

async function hmacSign(data, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return b64urlBuf(new Uint8Array(sig));
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (let i = 0; i < 8; i++) code += chars[bytes[i] % chars.length];
  return code;
}

function extractBearer(request) {
  const h = request.headers.get('Authorization') || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

async function parseJson(request) {
  try { return await request.json(); } catch (_) { return {}; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

function bufToB64(buf) {
  let s = '';
  buf.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s);
}

function b64ToBuf(b64) {
  const s = atob(b64);
  const buf = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) buf[i] = s.charCodeAt(i);
  return buf;
}

function b64url(str) {
  return b64urlBuf(new TextEncoder().encode(str));
}

function b64urlBuf(buf) {
  let s = bufToB64(buf);
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return b64ToBuf(s);
}
