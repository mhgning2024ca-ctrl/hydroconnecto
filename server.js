try {
  require('dotenv').config();
} catch (e) {
  console.warn('dotenv non chargé localement; variables lues depuis l’environnement.');
}

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_VERCEL = Boolean(process.env.VERCEL);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PUBLIC_DIR = path.join(__dirname, 'public');
// Sur Vercel, le dossier de la fonction est en lecture seule.
// Les fichiers uploadés temporairement doivent aller dans /tmp.
const UPLOAD_DIR = IS_VERCEL ? path.join('/tmp', 'hydroconnecto-uploads') : path.join(PUBLIC_DIR, 'uploads');
const ASSET_DIR = path.join(PUBLIC_DIR, 'assets');
const LOGO_PATH = path.join(ASSET_DIR, 'logo-hydroconnecto.png');
const PUBLIC_STORAGE_BUCKETS = new Set(['galerie', 'equipe', 'avatars']);
const PRIVATE_STORAGE_BUCKETS = new Set(['demandes-devis', 'documents', 'factures', 'devis', 'recus']);
const CSRF_COOKIE = 'hydro_csrf';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!IS_VERCEL) fs.mkdirSync(ASSET_DIR, { recursive: true });

validateRuntimeSecurity();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (IS_PRODUCTION) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
});
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const allowed = getAllowedOrigins();
    return cb(null, allowed.includes(origin));
  },
  credentials: true
}));
app.use(bodyParser.json({ limit: '25mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '25mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET || 'hydroconnecto-dev-secret'));
app.use(express.static(PUBLIC_DIR, {
  etag: true,
  maxAge: IS_PRODUCTION ? '1d' : 0,
  setHeaders(res, filePath) {
    if (/\.(png|jpg|jpeg|webp|gif|css|js)$/i.test(filePath)) {
      res.setHeader('Cache-Control', IS_PRODUCTION ? 'public, max-age=86400, stale-while-revalidate=604800' : 'no-cache');
    }
  }
}));
app.use(csrfProtection);

function sendIndexFile(req, res) {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  return res.status(500).type('text/plain').send('Fichier public/index.html introuvable dans le déploiement Vercel. Vérifier vercel.json includeFiles.');
}

app.get('/', sendIndexFile);
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/favicon.png', (req, res) => res.status(204).end());


function getAllowedOrigins() {
  const configured = String(process.env.ALLOWED_ORIGINS || process.env.APP_URL || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
  if (process.env.VERCEL_URL) configured.push(`https://${process.env.VERCEL_URL}`);
  const local = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
  return [...new Set([...configured, ...local])];
}

function isWeakSecret(value = '') {
  const v = String(value || '').trim();
  return !v || v.length < 32 || [
    'hydroconnecto-dev-secret',
    'hydroconnecto-local-secret-cookie-a-changer-en-production',
    'change-moi-123'
  ].includes(v);
}

function validateRuntimeSecurity() {
  if (!IS_PRODUCTION) return;
  const problems = [];
  if (isWeakSecret(process.env.COOKIE_SECRET)) problems.push('COOKIE_SECRET doit être unique et contenir au moins 32 caractères.');
  if (!process.env.ADMIN_PASSWORD_HASH && String(process.env.ADMIN_PASSWORD || '').trim() === 'change-moi-123') {
    problems.push('ADMIN_PASSWORD par défaut interdit en production.');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    problems.push('SUPABASE_SERVICE_ROLE_KEY requis en production pour garder les fichiers privés côté serveur.');
  }
  if (String(process.env.NOTIFICATION_WHATSAPP_ENABLED || '').toLowerCase() === 'true') {
    const provider = String(process.env.WHATSAPP_PROVIDER || 'meta').toLowerCase();
    if (provider === 'meta' && (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN)) {
      problems.push('WhatsApp activé: WHATSAPP_PHONE_NUMBER_ID et WHATSAPP_ACCESS_TOKEN requis.');
    }
    if (provider === 'generic' && !process.env.WHATSAPP_API_URL) {
      problems.push('WhatsApp generic activé: WHATSAPP_API_URL requis.');
    }
  }
  if (process.env.PAYMENT_API_URL && (!process.env.PAYMENT_API_KEY || !process.env.PAYMENT_WEBHOOK_SECRET)) {
    problems.push('Paiement API: PAYMENT_API_KEY et PAYMENT_WEBHOOK_SECRET requis.');
  }
  if (!process.env.ALLOWED_ORIGINS && !process.env.APP_URL && !process.env.VERCEL_URL) {
    console.warn('⚠️ ALLOWED_ORIGINS ou APP_URL non défini : seules les requêtes sans Origin et localhost seront acceptées.');
  }
  if (problems.length) throw new Error(`Configuration sécurité invalide: ${problems.join(' ')}`);
}

function secureCookieOptions(extra = {}) {
  return {
    sameSite: 'strict',
    secure: IS_PRODUCTION,
    ...extra
  };
}

function createCsrfToken(res) {
  const token = crypto.randomBytes(32).toString('base64url');
  res.cookie(CSRF_COOKIE, token, secureCookieOptions({
    httpOnly: false,
    maxAge: 1000 * 60 * 60 * 8
  }));
  return token;
}

function csrfProtection(req, res, next) {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next();
  if (req.path === '/api/auth/login') return next();
  if (req.path.startsWith('/api/public/')) return next();
  if (req.path.startsWith('/api/webhooks/')) return next();
  if (!req.path.startsWith('/api/')) return next();

  const headerToken = String(req.headers['x-csrf-token'] || '').trim();
  const cookieToken = String(req.cookies?.[CSRF_COOKIE] || '').trim();
  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return res.status(403).json({ error: 'Protection sécurité invalide. Recharge la page puis réessaie.' });
  }
  next();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const N = 16384;
  const r = 8;
  const p = 1;
  const key = crypto.scryptSync(String(password), salt, 64, { N, r, p }).toString('base64url');
  return `scrypt$${N}$${r}$${p}$${salt}$${key}`;
}

function safeCompare(a = '', b = '') {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyPassword(password, stored) {
  const value = String(stored || '');
  if (!value) return false;
  if (!value.startsWith('scrypt$')) return safeCompare(String(password), value);
  const [, nRaw, rRaw, pRaw, salt, key] = value.split('$');
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!N || !r || !p || !salt || !key) return false;
  const derived = crypto.scryptSync(String(password), salt, 64, { N, r, p }).toString('base64url');
  return safeCompare(derived, key);
}

function isPasswordHash(value = '') {
  return String(value || '').startsWith('scrypt$');
}

const loginAttempts = new Map();
function getClientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() || 'unknown';
}
function checkLoginRateLimit(req, res) {
  const key = `${getClientIp(req)}:${String(req.body?.email || '').trim().toLowerCase()}`;
  const now = Date.now();
  const current = loginAttempts.get(key) || { count: 0, first: now, blockedUntil: 0 };
  if (current.blockedUntil > now) {
    const seconds = Math.ceil((current.blockedUntil - now) / 1000);
    res.status(429).json({ error: `Trop de tentatives. Réessaie dans ${seconds} secondes.` });
    return false;
  }
  if (now - current.first > 15 * 60 * 1000) {
    loginAttempts.set(key, { count: 1, first: now, blockedUntil: 0 });
    return true;
  }
  current.count += 1;
  if (current.count > 7) current.blockedUntil = now + 15 * 60 * 1000;
  loginAttempts.set(key, current);
  if (current.blockedUntil > now) {
    res.status(429).json({ error: 'Trop de tentatives. Connexion temporairement bloquée.' });
    return false;
  }
  return true;
}
function clearLoginRateLimit(req) {
  const key = `${getClientIp(req)}:${String(req.body?.email || '').trim().toLowerCase()}`;
  loginAttempts.delete(key);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
// Clé serveur recommandée pour les uploads persistants Supabase Storage.
// Ne jamais exposer SUPABASE_SERVICE_ROLE_KEY côté navigateur.
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
}) : null;

if (!supabase) {
  console.warn('⚠️ Supabase non configuré. Crée .env avec SUPABASE_URL et SUPABASE_KEY.');
}

const COMPANY = {
  nom: 'HydroConnecto',
  responsable: 'Moustapha Gning',
  telephone: '+221 77 743 61 53',
  whatsapp: '+221 77 743 61 53',
  email: 'hydroconnecto-mig@gmail.com',
  adresses: 'Route de Mboro / Route de Thiès',
  ville: 'Thiès',
  pays: 'Sénégal',
  slogan: 'Spécialiste hydraulique, pneumatique et réparation d’engins',
  devise: 'FCFA'
};

const DESIGNER = {
  nom: 'Mouhammadoul Hadi Gning',
  roles: 'Concepteur | Développeur en technologie numérique | Administrateur de bases de données',
  email: 'mhgning2024ca@gmail.com'
};

function requireSupabase(res) {
  if (!supabase) {
    res.status(500).json({
      error: 'Supabase non configuré',
      message: 'Crée un fichier .env avec SUPABASE_URL et SUPABASE_KEY, puis redémarre npm start.'
    });
    return false;
  }
  return true;
}

function isDemoGalleryRow(row = {}) {
  const url = String(row.url || row.url_fichier || row.public_url || '').toLowerCase();
  const titre = String(row.titre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const demoTitles = new Set([
    'diagnostic', 'confection de flexible', 'reparation de pompe', 'maintenance corrective',
    'maintenance preventive', 'main-d’œuvre', 'main-doeuvre', 'main-d oeuvre',
    'installation hydraulique', 'installation pneumatique', 'a changer', 'à changer'
  ]);
  return !url || url.includes('/assets/services/') || url.includes('/assets/images/hero-accueil') ||
    url.includes('/assets/banner-hydroconnecto') || url.includes('banner-hydroconnecto') ||
    demoTitles.has(titre);
}

function encodeStoragePath(value = '') {
  return String(value || '')
    .split('/')
    .filter(Boolean)
    .map(part => encodeURIComponent(part))
    .join('/');
}

function normalizeMediaUrl(req, row = {}) {
  const bucket = String(row.bucket || row.photo_bucket || row.audio_bucket || '').trim();
  const storagePath = String(row.chemin_storage || row.photo_path || row.audio_path || '').trim();
  const directUrl = String(row.url || row.photo_url || row.audio_url || row.url_fichier || row.public_url || '').trim();

  // Média Supabase : passer par le serveur pour éviter les images cassées si le bucket n'est pas public.
  if (bucket && bucket !== 'local' && storagePath) {
    return `/api/storage/${encodeURIComponent(bucket)}/${encodeStoragePath(storagePath)}`;
  }

  // Média local ou URL externe.
  if (directUrl) return directUrl;

  return '';
}

function normalizeGalleryRow(req, row = {}) {
  const mediaUrl = normalizeMediaUrl(req, row);
  return {
    ...row,
    url: mediaUrl,
    public_url: mediaUrl,
    media_url: mediaUrl,
    storage_proxy_url: mediaUrl
  };
}

function getMimeFromName(filePath = '') {
  const ext = path.extname(filePath).toLowerCase();
  if (['.jpg', '.jpeg'].includes(ext)) return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.ogg') return 'audio/ogg';
  return 'application/octet-stream';
}

function getAdminUser(req) {
  const raw = req.signedCookies?.hydro_admin_user;
  if (!raw) {
    return { name: process.env.ADMIN_NAME || COMPANY.responsable, role: process.env.ADMIN_ROLE || 'directeur', email: process.env.ADMIN_EMAIL || 'admin@hydroconnecto.local' };
  }
  try { return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')); }
  catch { return { name: process.env.ADMIN_NAME || COMPANY.responsable, role: process.env.ADMIN_ROLE || 'directeur', email: process.env.ADMIN_EMAIL || 'admin@hydroconnecto.local' }; }
}

function isAdmin(req) {
  return req.signedCookies && req.signedCookies.hydro_admin === 'ok';
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Connexion administrateur requise' });
  next();
}

const DEFAULT_ROLE_PERMISSIONS = {
  super_administrateur: ['*'],
  administrateur: ['dashboard.view','dashboard.finance','dashboard.stock','dashboard.demandes','dashboard.interventions','demandes_devis.*','clients.*','engins.*','produits.*','services.*','interventions.*','documents.*','devis.*','factures.*','paiements.*','galerie.*','equipe.*','journal.view','users.*','exports.*','entreprise.view','profile.*','fournisseurs.*','commandes_fournisseurs.*'],
  directeur: ['dashboard.view','dashboard.finance','dashboard.stock','dashboard.demandes','dashboard.interventions','demandes_devis.*','clients.*','engins.*','produits.*','services.*','interventions.*','documents.*','devis.*','factures.*','paiements.*','galerie.*','equipe.*','journal.view','users.view','users.create','users.update','users.approve','exports.*','entreprise.view','profile.*','fournisseurs.*','commandes_fournisseurs.*'],
  responsable: ['dashboard.view','dashboard.demandes','dashboard.interventions','dashboard.stock','demandes_devis.view','demandes_devis.update','clients.*','engins.*','interventions.*','devis.view','devis.create','devis.update','galerie.view','entreprise.view','profile.*','produits.view'],
  comptable: ['dashboard.view','dashboard.finance','clients.view','documents.*','devis.view','factures.*','paiements.*','exports.*','entreprise.view','profile.*','fournisseurs.view','commandes_fournisseurs.view'],
  chef_atelier: ['dashboard.view','dashboard.interventions','dashboard.stock','interventions.*','engins.view','produits.view','services.view','equipe.view','entreprise.view','profile.*'],
  technicien: ['dashboard.view','dashboard.interventions','interventions.view','interventions.view_assigned','interventions.update_status','interventions.add_report','engins.view','services.view','entreprise.view','profile.*'],
  magasinier_stock: ['dashboard.view','dashboard.stock','produits.*','services.view','interventions.view','entreprise.view','profile.*','fournisseurs.view','commandes_fournisseurs.view','commandes_fournisseurs.receive'],
  commercial: ['dashboard.view','dashboard.demandes','demandes_devis.*','clients.view','clients.create','devis.view','devis.create','galerie.view','entreprise.view','profile.*'],
  assistant_administratif: ['dashboard.view','dashboard.demandes','demandes_devis.view','demandes_devis.update','clients.view','galerie.view','equipe.view','entreprise.view','profile.*'],
  lecture_seule: ['dashboard.view','demandes_devis.view','clients.view','engins.view','produits.view','services.view','interventions.view','documents.view','devis.view','factures.view','paiements.view','galerie.view','equipe.view','entreprise.view','profile.view']
};

function permissionMatches(granted, needed) {
  if (!granted || !needed) return false;
  if (granted === '*' || granted === needed) return true;
  if (granted.endsWith('.*')) {
    const prefix = granted.slice(0, -2);
    return needed === prefix || needed.startsWith(prefix + '.');
  }
  if (granted === '*.view' && needed.endsWith('.view')) return true;
  return false;
}

async function getPermissionsForRole(role = 'lecture_seule') {
  const normalizedRole = String(role || 'lecture_seule').trim();
  const fallback = DEFAULT_ROLE_PERMISSIONS[normalizedRole] || DEFAULT_ROLE_PERMISSIONS.lecture_seule;

  if (!supabase) return fallback;

  try {
    const { data, error } = await supabase.from('role_permissions').select('permission').eq('role', normalizedRole);
    if (error) {
      console.warn('Permissions rôle non lues, fallback utilisé:', error.message);
      return fallback;
    }
    const permissions = (data || []).map(x => x.permission).filter(Boolean);
    return permissions.length ? permissions : fallback;
  } catch (e) {
    console.warn('Permissions rôle non lues, fallback utilisé:', e.message);
    return fallback;
  }
}

function parsePermissionList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(x => String(x).trim()).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(x => String(x).trim()).filter(Boolean);
    } catch {}
    return value.split(',').map(x => x.trim()).filter(Boolean);
  }
  return [];
}

function uniqPermissions(list = []) {
  return [...new Set((list || []).map(x => String(x).trim()).filter(Boolean))];
}

async function getExtraPermissionsForUser(userId) {
  if (!supabase || !userId) return [];
  const nowIso = new Date().toISOString();
  const extras = [];

  try {
    const { data, error } = await supabase
      .from('utilisateur_permissions_extra')
      .select('permission, module, date_debut, date_fin, motif, actif')
      .eq('user_id', userId)
      .eq('actif', true);

    if (!error && Array.isArray(data)) {
      for (const p of data) {
        if (p.date_debut && p.date_debut > nowIso) continue;
        if (p.date_fin && p.date_fin < nowIso) continue;
        if (p.permission) extras.push(p.permission);
      }
    }
  } catch (e) {
    console.warn('Permissions extra table non lue:', e.message);
  }

  try {
    const { data, error } = await supabase
      .from('utilisateurs_admin')
      .select('permissions_extra')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data?.permissions_extra) extras.push(...parsePermissionList(data.permissions_extra));
  } catch (e) {
    console.warn('Permissions extra JSON non lues:', e.message);
  }

  return uniqPermissions(extras);
}

async function getEffectivePermissions(user = {}) {
  const rolePermissions = await getPermissionsForRole(user.role || 'lecture_seule');
  const extraPermissions = await getExtraPermissionsForUser(user.id);
  return uniqPermissions([...(rolePermissions || []), ...(extraPermissions || [])]);
}

async function getPermissionSourceForUser(user = {}, permissionNeeded = '') {
  const rolePermissions = await getPermissionsForRole(user.role || 'lecture_seule');
  if (rolePermissions.some(p => permissionMatches(p, permissionNeeded))) return 'role';
  const extraPermissions = await getExtraPermissionsForUser(user.id);
  if (extraPermissions.some(p => permissionMatches(p, permissionNeeded))) return 'permission_extra';
  return 'aucune';
}


function inferPermission(req) {
  const method = req.method.toUpperCase();
  const path = req.path;

  const action =
    method === 'GET' ? 'view' :
    method === 'POST' ? 'create' :
    method === 'PUT' || method === 'PATCH' ? 'update' :
    method === 'DELETE' ? 'delete' : 'view';

  if (path === '/api/dashboard') return 'dashboard.view';
  if (path.startsWith('/api/entreprise')) return 'entreprise.view';
  if (path.startsWith('/api/categories')) return 'produits.view';

  if (path.startsWith('/api/demandes-devis')) {
    if (path.includes('/convert-client')) return 'clients.create';
    return `demandes_devis.${action}`;
  }

  if (path.startsWith('/api/clients')) return `clients.${action}`;
  if (path.startsWith('/api/engins')) return `engins.${action}`;
  if (path.startsWith('/api/produits')) return `produits.${action}`;
  if (path.startsWith('/api/services')) return `services.${action}`;
  if (path.startsWith('/api/equipe')) return `equipe.${action}`;
  if (path.startsWith('/api/interventions')) {
    if (path.includes('/status')) return 'interventions.update_status';
    return `interventions.${action}`;
  }

  if (path.startsWith('/api/devis')) return `devis.${action}`;
  if (path.startsWith('/api/factures')) return `factures.${action}`;
  if (path.startsWith('/api/paiements')) return `paiements.${action}`;
  if (path.startsWith('/api/pdf')) return 'documents.view';

  if (path.startsWith('/api/galerie')) return `galerie.${action}`;

  if (path.startsWith('/api/users')) {
    if (method === 'GET') return 'users.view';
    if (method === 'POST') return 'users.create';
    if (path.includes('/permissions-extra')) return 'users.update';
    if (method === 'PUT' || method === 'PATCH') return 'users.update';
    if (method === 'DELETE') return 'users.delete';
    return 'users.view';
  }

  if (path.startsWith('/api/profile')) {
    if (method === 'GET') return 'profile.view';
    return 'profile.update';
  }

  if (path.startsWith('/api/fournisseurs')) return `fournisseurs.${action}`;
  if (path.startsWith('/api/commandes-fournisseurs')) {
    if (path.includes('/receive')) return 'commandes_fournisseurs.receive';
    return `commandes_fournisseurs.${action}`;
  }

  if (path.startsWith('/api/journal')) return 'journal.view';
  if (path.startsWith('/api/export')) return 'exports.view';

  return null;
}

async function hasPermission(req, neededPermission) {
  if (!neededPermission) return true;
  if (!isAdmin(req)) return false;

  const user = getAdminUser(req);
  const permissions = await getEffectivePermissions(user);
  return permissions.some(permission => permissionMatches(permission, neededPermission));
}

async function requirePermission(req, res, neededPermission) {
  if (!neededPermission) return true;

  const ok = await hasPermission(req, neededPermission);
  if (!ok) {
    res.status(403).json({
      error: `Accès refusé : permission requise (${neededPermission})`,
      permission: neededPermission
    });
    return false;
  }

  return true;
}

function asyncRoute(handler, options = { admin: true }) {
  return async (req, res, next) => {
    if (!requireSupabase(res)) return;
    if (options.admin && !isAdmin(req)) return res.status(401).json({ error: 'Connexion administrateur requise' });

    if (options.admin) {
      const neededPermission = options.permission || inferPermission(req);
      const allowed = await requirePermission(req, res, neededPermission);
      if (!allowed) return;
    }

    try { await handler(req, res, next); }
    catch (error) { console.error(error); res.status(500).json({ error: error.message || 'Erreur serveur' }); }
  };
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const normalized = String(value).replace(',', '.').replace(/\s/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}
function toNullablePercent(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return toNumber(value);
}

function money(value) {
  const n = Math.round(toNumber(value) || 0);
  const formatted = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${formatted} FCFA`;
}

function pad(n, len = 6) { return String(n).padStart(len, '0'); }

async function nextNumero(prefix, table) {
  const year = new Date().getFullYear();
  if (!supabase || !table) return `${prefix}-${year}-${Date.now().toString().slice(-6)}`;
  const like = `${prefix}-${year}-%`;
  const { count } = await supabase.from(table).select('id', { count: 'exact', head: true }).like(prefix === 'REC' ? 'numero_recu' : 'numero', like);
  return `${prefix}-${year}-${pad((count || 0) + 1)}`;
}

async function getEntreprise() {
  let { data, error } = await supabase.from('entreprises').select('*').eq('nom', COMPANY.nom).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) {
    const legacy = await supabase.from('entreprises').select('*').eq('nom', 'B HydroConnecto').limit(1).maybeSingle();
    if (legacy.error) throw legacy.error;
    if (legacy.data) {
      await supabase.from('entreprises').update({ nom: COMPANY.nom, slogan: COMPANY.slogan, telephone: COMPANY.telephone, whatsapp: COMPANY.whatsapp, email: COMPANY.email, adresse: COMPANY.adresses, ville: COMPANY.ville, pays: COMPANY.pays, devise: COMPANY.devise }).eq('id', legacy.data.id);
      data = { ...legacy.data, nom: COMPANY.nom };
    }
  }
  if (data) return { ...COMPANY, ...data };
  const { data: created, error: createError } = await supabase.from('entreprises').insert({
    nom: COMPANY.nom, slogan: COMPANY.slogan, pays: COMPANY.pays, ville: COMPANY.ville,
    telephone: COMPANY.telephone, whatsapp: COMPANY.whatsapp, email: COMPANY.email,
    adresse: COMPANY.adresses, devise: COMPANY.devise, logo_url: '/assets/logo-hydroconnecto.png'
  }).select('*').single();
  if (createError) throw createError;
  return { ...COMPANY, ...created };
}

async function tableCount(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) return 0;
  return count || 0;
}

async function insertWithEntreprise(table, payload, req, logLabel) {
  const entreprise = await getEntreprise();
  const { data, error } = await supabase.from(table).insert({ ...payload, entreprise_id: entreprise.id }).select('*').single();
  if (error) throw error;
  if (req && logLabel) await logAction(req, `Création ${logLabel}`, table, data.id, { numero: data.numero, nom: data.nom || data.titre || data.numero });
  return data;
}

function softActiveFilter(query) { return query.or('actif.is.null,actif.eq.true'); }
async function listActive(table, order = 'created_at', ascending = false) {
  let q = supabase.from(table).select('*');
  if (['produits', 'services', 'clients', 'employes', 'categories_produits'].includes(table)) q = softActiveFilter(q);
  if (order) q = q.order(order, { ascending });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

function sanitizeFileName(original) {
  const ext = path.extname(original || '').toLowerCase();
  const base = path.basename(original || 'media', ext)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50) || 'media';
  return `${Date.now()}-${base}${ext}`;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, sanitizeFileName(file.originalname))
});
const upload = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^(image|video|audio)\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Seuls les fichiers image, vidéo ou audio sont autorisés'));
  }
});

async function storeUploadedFile(file, bucket = 'galerie', folder = '') {
  if (!file) return null;
  const localUrl = `/uploads/${file.filename}`;
  const storagePath = `${folder ? folder.replace(/^\/+|\/+$/g, '') + '/' : ''}${file.filename}`;

  if (!supabase) {
    return {
      url: localUrl,
      bucket: 'local',
      path: storagePath,
      mime_type: file.mimetype,
      size: file.size,
      local: true,
      storage_error: 'Supabase non configuré : fichier conservé localement seulement'
    };
  }

  try {
    const buffer = await fs.promises.readFile(file.path);
    const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
      contentType: file.mimetype,
      upsert: true
    });
    if (error) throw error;

    // URL backend proxy : évite les médias cassés quand le bucket n'est pas public.
    const proxyUrl = `/api/storage/${encodeURIComponent(bucket)}/${encodeStoragePath(storagePath)}`;

    return {
      url: proxyUrl,
      bucket,
      path: storagePath,
      mime_type: file.mimetype,
      size: file.size,
      local: false
    };
  } catch (e) {
    console.warn(`Upload Supabase Storage échoué (${bucket}):`, e.message);
    return {
      url: localUrl,
      bucket: 'local',
      path: storagePath,
      mime_type: file.mimetype,
      size: file.size,
      local: true,
      storage_error: e.message
    };
  }
}


async function logAction(req, action, tableConcernee = null, enregistrementId = null, details = {}) {
  if (!supabase) return;
  try {
    const entreprise = await getEntreprise();
    const user = isAdmin(req) ? getAdminUser(req) : { name: 'Visiteur public', role: 'public', email: '' };
    const payload = {
      entreprise_id: entreprise.id,
      utilisateur_nom: user.name || 'Admin',
      utilisateur_role: user.role || 'admin',
      utilisateur_email: user.email || '',
      action,
      table_concernee: tableConcernee,
      details: { ...details, ip: req.ip, user_agent: req.headers['user-agent'] }
    };
    if (enregistrementId) payload.enregistrement_id = enregistrementId;
    const { error } = await supabase.from('journal_actions').insert(payload);
    if (error && !/(utilisateur_nom|utilisateur_role|utilisateur_email)/i.test(error.message || '')) console.warn('Journal non enregistré:', error.message);
    if (error && /(utilisateur_nom|utilisateur_role|utilisateur_email)/i.test(error.message || '')) {
      delete payload.utilisateur_nom; delete payload.utilisateur_role; delete payload.utilisateur_email;
      await supabase.from('journal_actions').insert(payload);
    }
  } catch (e) { console.warn('Journal non enregistré:', e.message); }
}

function normalizePhone(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.length === 9 && digits.startsWith('7')) return `221${digits}`;
  return digits;
}

async function insertBestEffort(table, payload) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from(table).insert(payload).select('*').single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn(`${table} non enregistré:`, e.message);
    return null;
  }
}

async function sendWhatsAppText(to, message, meta = {}) {
  const enabled = String(process.env.NOTIFICATION_WHATSAPP_ENABLED || 'false').toLowerCase() === 'true';
  const target = normalizePhone(to || process.env.WHATSAPP_TO || COMPANY.whatsapp);
  const provider = String(process.env.WHATSAPP_PROVIDER || 'meta').toLowerCase();
  const payloadLog = { canal: 'whatsapp', destinataire: target, message, meta, statut: 'ignore' };

  if (!enabled || !target || !message) {
    await insertBestEffort('notification_logs', { ...payloadLog, statut: 'ignore', reponse: { reason: 'disabled_or_missing_target' } });
    return { sent: false, skipped: true };
  }

  try {
    let response;
    if (provider === 'generic') {
      const url = process.env.WHATSAPP_API_URL;
      if (!url) throw new Error('WHATSAPP_API_URL manquant');
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.WHATSAPP_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` } : {})
        },
        body: JSON.stringify({ to: target, message, meta })
      });
    } else {
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const token = process.env.WHATSAPP_ACCESS_TOKEN;
      if (!phoneNumberId || !token) throw new Error('WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN manquant');
      response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: target,
          type: 'text',
          text: { preview_url: false, body: message }
        })
      });
    }

    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    if (!response.ok) throw new Error(body.error?.message || body.message || `WhatsApp HTTP ${response.status}`);
    await insertBestEffort('notification_logs', { ...payloadLog, statut: 'envoye', reponse: body });
    return { sent: true, response: body };
  } catch (e) {
    await insertBestEffort('notification_logs', { ...payloadLog, statut: 'erreur', erreur: e.message });
    console.warn('Notification WhatsApp non envoyée:', e.message);
    return { sent: false, error: e.message };
  }
}

function buildAppUrl(pathname = '/') {
  const base = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${PORT}`);
  return `${String(base).replace(/\/+$/, '')}${pathname.startsWith('/') ? pathname : '/' + pathname}`;
}

async function createPaymentRequest({ facture, montant, telephone, callbackPath = '/api/webhooks/payment' }) {
  const provider = String(process.env.PAYMENT_PROVIDER || 'generic').toLowerCase();
  const apiUrl = process.env.PAYMENT_API_URL;
  const apiKey = process.env.PAYMENT_API_KEY;
  const secret = process.env.PAYMENT_SECRET;
  if (!apiUrl || !apiKey) throw new Error('PAYMENT_API_URL ou PAYMENT_API_KEY manquant');

  const externalRef = `HC-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
  const body = {
    provider,
    amount: Math.round(toNumber(montant || facture?.solde || facture?.total || 0)),
    currency: COMPANY.devise,
    reference: externalRef,
    customer_phone: normalizePhone(telephone || facture?.clients?.telephone || ''),
    customer_name: facture?.clients?.entreprise_nom || facture?.clients?.nom || '',
    description: `Paiement facture ${facture?.numero || externalRef}`,
    callback_url: buildAppUrl(callbackPath),
    return_url: buildAppUrl('/admin/login')
  };

  const signature = secret
    ? crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex')
    : '';

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(signature ? { 'X-HydroConnecto-Signature': signature } : {})
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let result;
  try { result = text ? JSON.parse(text) : {}; } catch { result = { raw: text }; }
  if (!response.ok) throw new Error(result.error || result.message || `Paiement HTTP ${response.status}`);
  return { externalRef, request: body, response: result };
}

function verifyWebhookSignature(req) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return true;
  const sent = String(req.headers['x-payment-signature'] || req.headers['x-hydroconnecto-signature'] || '');
  if (!sent) return false;
  const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body || {})).digest('hex');
  return safeCompare(sent, expected);
}

app.get(['/admin', '/admin/login'], sendIndexFile);

app.get('/api/health', (req, res) => {
  res.json({ app: 'HydroConnecto ERP Pro v2.2.2.6 PRO', status: 'ok', supabase: Boolean(supabase), admin: isAdmin(req), time: new Date().toISOString() });
});
app.get('/api/config', (req, res) => res.json({ company: COMPANY, designer: DESIGNER, admin: isAdmin(req) }));

async function sendLoginSuccess(req, res, user, source = 'env') {
  const permissions = await getEffectivePermissions(user);
  const safeUser = {
    id: user.id || null,
    name: user.name || user.nom_complet || COMPANY.responsable,
    role: user.role || 'directeur',
    email: String(user.email || '').trim().toLowerCase(),
    permissions
  };

  res.cookie('hydro_admin', 'ok', {
    ...secureCookieOptions(),
    signed: true,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 8
  });

  res.cookie('hydro_admin_user', Buffer.from(JSON.stringify(safeUser)).toString('base64url'), {
    ...secureCookieOptions(),
    signed: true,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 8
  });
  const csrfToken = createCsrfToken(res);

  try {
    await logAction(req, 'Connexion administrateur', 'auth', safeUser.id, {
      email: safeUser.email,
      role: safeUser.role,
      source
    });
  } catch (e) {
    console.warn('Journal connexion non enregistré:', e.message);
  }

  return res.json({ success: true, user: safeUser, csrfToken });
}

app.post('/api/auth/login', async (req, res) => {
  if (!checkLoginRateLimit(req, res)) return;
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '').trim();

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  // 1) Compte directeur défini dans .env
  const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@hydroconnecto.local').trim().toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || 'change-moi-123').trim();
  const adminPasswordHash = String(process.env.ADMIN_PASSWORD_HASH || '').trim();

  const adminPasswordOk = adminPasswordHash ? verifyPassword(password, adminPasswordHash) : verifyPassword(password, adminPassword);
  if (email === adminEmail && adminPasswordOk) {
    clearLoginRateLimit(req);
    return sendLoginSuccess(req, res, {
      name: process.env.ADMIN_NAME || COMPANY.responsable,
      role: process.env.ADMIN_ROLE || 'directeur',
      email: adminEmail
    }, 'env');
  }

  // 2) Comptes créés dans l'admin : table Supabase utilisateurs_admin
  //    Avant cette correction, ces comptes étaient créés mais jamais acceptés à la connexion.
  if (supabase) {
    const { data: dbUser, error } = await supabase
      .from('utilisateurs_admin')
      .select('id, nom_complet, email, role, statut, password_temp, permissions_extra, telephone, adresse, photo_url, must_change_password')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error('Erreur recherche utilisateur admin:', error.message);
    }

    if (dbUser) {
      const statut = String(dbUser.statut || 'en_attente').toLowerCase();

      if (statut !== 'approuve') {
        return res.status(403).json({ error: `Compte utilisateur non approuvé ou désactivé (${statut}).` });
      }

      const dbPassword = String(dbUser.password_temp || '').trim();

      if (!dbPassword) {
        return res.status(401).json({ error: 'Aucun mot de passe défini pour cet utilisateur' });
      }

      if (verifyPassword(password, dbPassword)) {
        if (!isPasswordHash(dbPassword)) {
          try {
            await supabase
              .from('utilisateurs_admin')
              .update({ password_temp: hashPassword(password), updated_at: new Date().toISOString() })
              .eq('id', dbUser.id);
          } catch (e) {
            console.warn('Migration hash mot de passe non appliquée:', e.message);
          }
        }
        try {
          await supabase
            .from('utilisateurs_admin')
            .update({ derniere_connexion: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', dbUser.id);
        } catch (e) {
          console.warn('Dernière connexion non mise à jour:', e.message);
        }

        clearLoginRateLimit(req);
        return sendLoginSuccess(req, res, {
          id: dbUser.id,
          name: dbUser.nom_complet || dbUser.email,
          role: dbUser.role || 'lecture_seule',
          email: dbUser.email,
          telephone: dbUser.telephone || '',
          adresse: dbUser.adresse || '',
          photo_url: dbUser.photo_url || '',
          must_change_password: Boolean(dbUser.must_change_password)
        }, 'utilisateurs_admin');
      }
    }
  }

  return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
});

app.post('/api/auth/logout', async (req, res) => {
  if (isAdmin(req)) await logAction(req, 'Déconnexion administrateur', 'auth');
  res.clearCookie('hydro_admin'); res.clearCookie('hydro_admin_user'); res.clearCookie(CSRF_COOKIE);
  res.json({ success: true });
});
app.get('/api/auth/me', async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Non connecté' });
  const user = getAdminUser(req);
  user.permissions = await getEffectivePermissions(user);
  createCsrfToken(res);
  res.json(user);
});

app.get('/api/auth/permissions', async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Non connecté' });
  const user = getAdminUser(req);
  res.json({ role: user.role || 'lecture_seule', permissions: await getPermissionsForRole(user.role || 'lecture_seule') });
});

// Profil utilisateur connecté
app.get('/api/profile', asyncRoute(async (req, res) => {
  const user = getAdminUser(req);
  if (!user.id) return res.json(user);

  const { data, error } = await supabase
    .from('utilisateurs_admin')
    .select('id, nom_complet, email, role, statut, telephone, adresse, photo_url, must_change_password, permissions_extra, derniere_connexion')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  const profile = data || user;
  res.json({ ...profile, permissions: await getEffectivePermissions({ ...user, ...profile }) });
}));

app.put('/api/profile', upload.single('photo'), asyncRoute(async (req, res) => {
  const user = getAdminUser(req);
  if (!user.id) return res.status(403).json({ error: 'Le compte principal .env ne peut pas être modifié ici.' });

  const payload = {
    nom_complet: req.body.nom_complet || user.name,
    email: String(req.body.email || user.email).trim().toLowerCase(),
    telephone: req.body.telephone || '',
    adresse: req.body.adresse || '',
    updated_at: new Date().toISOString()
  };

  if (req.body.password) {
    payload.password_temp = hashPassword(String(req.body.password).trim());
    payload.must_change_password = false;
  }

  if (req.file) {
    const uploadedPhoto = await storeUploadedFile(req.file, 'avatars', 'profiles');
    payload.photo_url = uploadedPhoto?.url || `/uploads/${req.file.filename}`;
    payload.photo_bucket = uploadedPhoto?.bucket || null;
    payload.photo_path = uploadedPhoto?.path || null;
  }

  const { data, error } = await supabase
    .from('utilisateurs_admin')
    .update(payload)
    .eq('id', user.id)
    .select('*')
    .single();

  if (error) throw error;
  await logAction(req, 'Modification profil utilisateur', 'profile', data.id, { champs: Object.keys(payload).filter(k => k !== 'password_temp') });
  res.json({ success: true, user: data });
}));

// Proxy média Supabase Storage : évite les images cassées si le bucket n'est pas public.
app.get('/api/storage/:bucket/*', asyncRoute(async (req, res) => {
  if (!supabase) return res.status(404).send('Supabase Storage non configuré');

  const bucket = req.params.bucket;
  const storagePath = req.params[0];

  if (!bucket || !storagePath) {
    return res.status(400).send('Chemin média invalide');
  }
  if (!PUBLIC_STORAGE_BUCKETS.has(bucket)) {
    if (!PRIVATE_STORAGE_BUCKETS.has(bucket)) return res.status(404).send('Bucket non autorisé');
    if (!isAdmin(req)) return res.status(401).send('Connexion administrateur requise');
    const allowed = await requirePermission(req, res, bucket === 'demandes-devis' ? 'demandes_devis.view' : 'documents.view');
    if (!allowed) return;
  }

  const { data, error } = await supabase.storage.from(bucket).download(storagePath);

  if (error) {
    console.error('Erreur lecture média Supabase:', bucket, storagePath, error.message);
    return res.status(404).send('Média introuvable ou bucket non autorisé. Vérifie SUPABASE_SERVICE_ROLE_KEY ou les policies Storage.');
  }

  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mime = data.type || getMimeFromName(storagePath);

  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buffer);
}, { admin: false }));

// Données publiques
app.get('/api/public/services', asyncRoute(async (req, res) => res.json(await listActive('services', 'nom', true)), { admin: false }));
app.get('/api/public/galerie', asyncRoute(async (req, res) => {
  const { data, error } = await supabase.from('galerie').select('*').eq('visible', true).order('created_at', { ascending: false });
  if (error) throw error;
  res.json((data || []).filter(row => !isDemoGalleryRow(row)).map(row => normalizeGalleryRow(req, row)));
}, { admin: false }));
app.get('/api/public/equipe', asyncRoute(async (req, res) => {
  const { data, error } = await supabase.from('equipe_site').select('*').eq('visible', true).order('ordre', { ascending: true });
  if (error) throw error; res.json(data || []);
}, { admin: false }));

app.post('/api/public/demandes-devis', upload.single('audio'), asyncRoute(async (req, res) => {
  const besoin = String(req.body.besoin || '').trim();
  const uploadedAudio = req.file ? await storeUploadedFile(req.file, 'demandes-devis', 'audios') : null;
  const audioUrl = uploadedAudio?.url || null;
  if (!besoin && !audioUrl) return res.status(400).json({ error: 'Écris un besoin ou ajoute un message vocal.' });
  const entreprise = await getEntreprise();
  const payload = {
    entreprise_id: entreprise.id,
    nom_complet: req.body.nom_complet,
    telephone: req.body.telephone,
    besoin,
    audio_url: audioUrl,
    audio_bucket: uploadedAudio?.bucket || null,
    audio_path: uploadedAudio?.path || null,
    statut: 'nouvelle'
  };
  const { data, error } = await supabase.from('demandes_devis').insert(payload).select('*').single();
  if (error) throw error;
  await logAction(req, 'Nouvelle demande de devis publique', 'demandes_devis', data.id, { nom: data.nom_complet, telephone: data.telephone });
  await sendWhatsAppText(process.env.WHATSAPP_TO || COMPANY.whatsapp, `Nouvelle demande HydroConnecto\nClient: ${data.nom_complet || '-'}\nTéléphone: ${data.telephone || '-'}\nBesoin: ${besoin || 'Message vocal joint'}`, { type: 'demande_devis', id: data.id });
  res.status(201).json({ success: true, message: 'Votre demande a été envoyée avec succès.', demande: data });
}, { admin: false }));

// Dashboard
app.get('/api/dashboard', asyncRoute(async (req, res) => {
  const user = getAdminUser(req);
  const canFinance = await hasPermission(req, 'dashboard.finance');
  const canStock = await hasPermission(req, 'dashboard.stock') || await hasPermission(req, 'produits.view');
  const canDemandes = await hasPermission(req, 'dashboard.demandes') || await hasPermission(req, 'demandes_devis.view');
  const canInterventions = await hasPermission(req, 'dashboard.interventions') || await hasPermission(req, 'interventions.view');
  const canUsers = await hasPermission(req, 'users.view');

  const [clients, produits, services, interventions, factures, commandes, demandes, journal] = await Promise.all([
    tableCount('clients'),
    tableCount('produits'),
    tableCount('services'),
    canInterventions ? tableCount('interventions') : Promise.resolve(null),
    canFinance ? tableCount('factures') : Promise.resolve(null),
    tableCount('commandes'),
    canDemandes ? tableCount('demandes_devis') : Promise.resolve(null),
    canUsers ? tableCount('journal_actions') : Promise.resolve(null)
  ]);

  const response = {
    role: user.role || 'lecture_seule',
    permissions: await getEffectivePermissions(user),
    clients, produits, services, interventions, factures, commandes, demandes, journal,
    nouvellesDemandes: 0,
    chiffreAffaires: null,
    impayes: null,
    stockFaible: [],
    interventionsEnCours: [],
    mesInterventions: [],
    facturationApreparer: [],
    commandesFournisseursOuvertes: []
  };

  if (canFinance) {
    const { data: facturesData } = await supabase.from('factures').select('total, montant_paye, solde, statut');
    response.chiffreAffaires = (facturesData || []).reduce((sum, f) => sum + toNumber(f.total), 0);
    response.impayes = (facturesData || []).reduce((sum, f) => sum + toNumber(f.solde), 0);
    const { data: facturationApreparer } = await supabase
      .from('interventions')
      .select('id, numero, statut, date_intervention, clients(nom, entreprise_nom), engins(type_engin, marque, modele)')
      .in('statut', ['terminee', 'fin_intervention'])
      .order('date_intervention', { ascending: false })
      .limit(10);
    response.facturationApreparer = facturationApreparer || [];
  }

  if (canStock) {
    const { data: stockFaible } = await supabase
      .from('produits')
      .select('id, nom, quantite_stock, stock_minimum')
      .filter('quantite_stock', 'lte', 'stock_minimum')
      .limit(10);
    response.stockFaible = stockFaible || [];
    try {
      const { data: commandesFournisseursOuvertes } = await supabase
        .from('commandes_fournisseurs')
        .select('id, numero, statut, total, date_commande, fournisseurs(nom)')
        .not('statut', 'in', '("livree","annulee")')
        .order('date_commande', { ascending: false })
        .limit(10);
      response.commandesFournisseursOuvertes = commandesFournisseursOuvertes || [];
    } catch {}
  }

  if (canDemandes) {
    const { count: nouvellesDemandes } = await supabase
      .from('demandes_devis')
      .select('*', { count: 'exact', head: true })
      .eq('statut', 'nouvelle');
    response.nouvellesDemandes = nouvellesDemandes || 0;
  }

  if (canInterventions) {
    const activeStatuses = ['assignee', 'debut_intervention', 'en_cours', 'pause', 'planifiee'];
    const { data: interventionsEnCours } = await supabase
      .from('interventions')
      .select('id, numero, statut, date_intervention, probleme_signale, clients(nom, entreprise_nom), engins(type_engin, marque, modele)')
      .in('statut', activeStatuses)
      .order('date_intervention', { ascending: true })
      .limit(15);
    response.interventionsEnCours = interventionsEnCours || [];

    if (user.email || user.id) {
      try {
        const { data: assignedRows } = await supabase
          .from('intervention_intervenants')
          .select('intervention_id, role_intervention, statut_intervention, equipe_site(nom_complet, email), interventions(id, numero, statut, date_intervention, probleme_signale, clients(nom, entreprise_nom), engins(type_engin, marque, modele))')
          .or(`employe_id.eq.${user.id},equipe_id.eq.${user.id}`)
          .limit(20);
        response.mesInterventions = (assignedRows || []).map(r => ({ ...(r.interventions || {}), role_intervention: r.role_intervention, statut_intervention: r.statut_intervention })).filter(x => x.id);
      } catch {}
    }
  }

  res.json(response);
}));

app.get('/api/entreprise', asyncRoute(async (req, res) => res.json(await getEntreprise())));
app.get('/api/categories', asyncRoute(async (req, res) => res.json(await listActive('categories_produits', 'nom', true))));

// Demandes de devis admin
app.get('/api/demandes-devis', asyncRoute(async (req, res) => {
  let q = supabase.from('demandes_devis').select('*').order('created_at', { ascending: false });
  if (req.query.statut) q = q.eq('statut', req.query.statut);
  const { data, error } = await q;
  if (error) throw error; res.json(data || []);
}));
app.put('/api/demandes-devis/:id/status', asyncRoute(async (req, res) => {
  const statut = req.body.statut || 'vue';
  const { data, error } = await supabase.from('demandes_devis').update({ statut, updated_at: new Date().toISOString() }).eq('id', req.params.id).select('*').single();
  if (error) throw error;
  await logAction(req, `Changement statut demande devis: ${statut}`, 'demandes_devis', data.id, { nom: data.nom_complet });
  res.json(data);
}));

app.put('/api/demandes-devis/:id', asyncRoute(async (req, res) => {
  const payload = {
    nom_complet: req.body.nom_complet,
    telephone: req.body.telephone,
    besoin: req.body.besoin || '',
    notes_admin: req.body.notes_admin || req.body.notes || null,
    updated_at: new Date().toISOString()
  };
  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
  const { data, error } = await supabase.from('demandes_devis').update(payload).eq('id', req.params.id).select('*').single();
  if (error) throw error;
  await logAction(req, 'Modification demande de devis', 'demandes_devis', data.id, { nom: data.nom_complet });
  res.json(data);
}));
app.delete('/api/demandes-devis/:id', asyncRoute(async (req, res) => {
  const { data, error } = await supabase.from('demandes_devis').update({ statut: 'archivee', updated_at: new Date().toISOString() }).eq('id', req.params.id).select('*').single();
  if (error) throw error;
  await logAction(req, 'Archivage demande de devis', 'demandes_devis', data.id, { nom: data.nom_complet });
  res.json({ success: true, data });
}));
app.delete('/api/demandes-devis/:id/permanent', asyncRoute(async (req, res) => {
  const { error } = await supabase.from('demandes_devis').delete().eq('id', req.params.id);
  if (error) throw error;
  await logAction(req, 'Suppression définitive demande de devis', 'demandes_devis', req.params.id);
  res.json({ success: true });
}));

app.post('/api/demandes-devis/:id/convert-client', asyncRoute(async (req, res) => {
  const { data: demande, error: dError } = await supabase.from('demandes_devis').select('*').eq('id', req.params.id).single();
  if (dError) throw dError;
  const client = await insertWithEntreprise('clients', {
    type_client: 'particulier', nom: demande.nom_complet, entreprise_nom: demande.nom_complet,
    telephone: demande.telephone, whatsapp: demande.telephone, observations: `Créé depuis demande de devis: ${demande.besoin || ''}`,
    actif: true
  }, req, 'client depuis demande');
  await supabase.from('demandes_devis').update({ statut: 'convertie_client', client_id: client.id, updated_at: new Date().toISOString() }).eq('id', req.params.id);
  res.status(201).json(client);
}));

// Produits
app.get('/api/produits', asyncRoute(async (req, res) => {
  let q = supabase.from('produits').select('*, categories_produits(nom)').order('nom', { ascending: true });
  q = q.or('actif.is.null,actif.eq.true');
  const { data, error } = await q; if (error) throw error; res.json(data || []);
}));
app.post('/api/produits', asyncRoute(async (req, res) => {
  const payload = {
    categorie_id: req.body.categorie_id || null, nom: req.body.nom, description: req.body.description || '', unite: req.body.unite || 'unité',
    prix_unitaire: toNumber(req.body.prix_unitaire), cout_achat: toNumber(req.body.cout_achat), quantite_stock: toNumber(req.body.quantite_stock), stock_minimum: toNumber(req.body.stock_minimum), actif: true
  };
  res.status(201).json(await insertWithEntreprise('produits', payload, req, 'produit'));
}));
app.put('/api/produits/:id', asyncRoute(async (req, res) => {
  const payload = { categorie_id: req.body.categorie_id || null, nom: req.body.nom, description: req.body.description || '', unite: req.body.unite || 'unité', prix_unitaire: toNumber(req.body.prix_unitaire), cout_achat: toNumber(req.body.cout_achat), quantite_stock: toNumber(req.body.quantite_stock), stock_minimum: toNumber(req.body.stock_minimum) };
  const { data, error } = await supabase.from('produits').update(payload).eq('id', req.params.id).select('*').single();
  if (error) throw error; await logAction(req, 'Modification produit', 'produits', data.id, { nom: data.nom }); res.json(data);
}));
app.delete('/api/produits/:id', asyncRoute(async (req, res) => {
  const { error } = await supabase.from('produits').update({ actif: false }).eq('id', req.params.id);
  if (error) throw error; await logAction(req, 'Archivage produit', 'produits', req.params.id); res.json({ success: true });
}));
app.delete('/api/produits/:id/permanent', asyncRoute(async (req, res) => {
  const { error } = await supabase.from('produits').delete().eq('id', req.params.id);
  if (error) throw error; await logAction(req, 'Suppression définitive produit', 'produits', req.params.id); res.json({ success: true });
}));

// Services
app.get('/api/services', asyncRoute(async (req, res) => res.json(await listActive('services', 'nom', true))));
app.post('/api/services', asyncRoute(async (req, res) => {
  const payload = { nom: req.body.nom, description: req.body.description || '', prix_unitaire: toNumber(req.body.prix_unitaire), unite: req.body.unite || 'service', actif: true };
  res.status(201).json(await insertWithEntreprise('services', payload, req, 'service'));
}));
app.put('/api/services/:id', asyncRoute(async (req, res) => {
  const payload = { nom: req.body.nom, description: req.body.description || '', prix_unitaire: toNumber(req.body.prix_unitaire), unite: req.body.unite || 'service' };
  const { data, error } = await supabase.from('services').update(payload).eq('id', req.params.id).select('*').single();
  if (error) throw error; await logAction(req, 'Modification service', 'services', data.id, { nom: data.nom }); res.json(data);
}));
app.delete('/api/services/:id', asyncRoute(async (req, res) => {
  const { error } = await supabase.from('services').update({ actif: false }).eq('id', req.params.id);
  if (error) throw error; await logAction(req, 'Archivage service', 'services', req.params.id); res.json({ success: true });
}));
app.delete('/api/services/:id/permanent', asyncRoute(async (req, res) => {
  const { error } = await supabase.from('services').delete().eq('id', req.params.id);
  if (error) throw error; await logAction(req, 'Suppression définitive service', 'services', req.params.id); res.json({ success: true });
}));

// Clients
app.get('/api/clients', asyncRoute(async (req, res) => res.json(await listActive('clients', 'created_at', false))));
app.post('/api/clients', asyncRoute(async (req, res) => {
  const payload = {
    type_client: req.body.type_client || 'entreprise', nom: req.body.nom, entreprise_nom: req.body.entreprise_nom || req.body.nom,
    telephone: req.body.telephone || '', whatsapp: req.body.whatsapp || req.body.telephone || '', email: req.body.email || '', adresse: req.body.adresse || '', ville: req.body.ville || '',
    personne_contact: req.body.personne_contact || '', observations: req.body.observations || '', actif: true
  };
  res.status(201).json(await insertWithEntreprise('clients', payload, req, 'client'));
}));
app.put('/api/clients/:id', asyncRoute(async (req, res) => {
  const payload = { nom: req.body.nom, entreprise_nom: req.body.entreprise_nom || req.body.nom, telephone: req.body.telephone || '', whatsapp: req.body.whatsapp || req.body.telephone || '', email: req.body.email || '', adresse: req.body.adresse || '', ville: req.body.ville || '', observations: req.body.observations || '' };
  const { data, error } = await supabase.from('clients').update(payload).eq('id', req.params.id).select('*').single();
  if (error) throw error; await logAction(req, 'Modification client', 'clients', data.id, { nom: data.nom }); res.json(data);
}));
app.delete('/api/clients/:id', asyncRoute(async (req, res) => {
  const { error } = await supabase.from('clients').update({ actif: false }).eq('id', req.params.id);
  if (error) throw error; await logAction(req, 'Archivage client', 'clients', req.params.id); res.json({ success: true });
}));
app.delete('/api/clients/:id/permanent', asyncRoute(async (req, res) => {
  const { error } = await supabase.from('clients').delete().eq('id', req.params.id);
  if (error) throw error; await logAction(req, 'Suppression définitive client', 'clients', req.params.id); res.json({ success: true });
}));

// Engins
app.get('/api/engins', asyncRoute(async (req, res) => {
  let q = supabase.from('engins').select('*, clients(nom, entreprise_nom, telephone)').order('created_at', { ascending: false });
  if (req.query.client_id) q = q.eq('client_id', req.query.client_id);
  const { data, error } = await q; if (error) throw error; res.json(data || []);
}));
app.post('/api/engins', asyncRoute(async (req, res) => {
  const typeEngin = req.body.type_engin === 'Autre' && req.body.type_engin_autre ? req.body.type_engin_autre : req.body.type_engin;
  const payload = { client_id: req.body.client_id || null, type_engin: typeEngin, marque: req.body.marque || '', modele: req.body.modele || '', annee: req.body.annee ? Number(req.body.annee) : null, numero_serie: req.body.numero_serie || '', immatriculation: req.body.immatriculation || '', kilometrage: toNumber(req.body.kilometrage), heures_fonctionnement: toNumber(req.body.heures_fonctionnement), observations: req.body.observations || '', actif: true };
  const { data, error } = await supabase.from('engins').insert(payload).select('*').single();
  if (error) throw error; await logAction(req, 'Création engin', 'engins', data.id, { type_engin: data.type_engin }); res.status(201).json(data);
}));
app.put('/api/engins/:id', asyncRoute(async (req, res) => {
  const typeEngin = req.body.type_engin === 'Autre' && req.body.type_engin_autre ? req.body.type_engin_autre : req.body.type_engin;
  const payload = { client_id: req.body.client_id || null, type_engin: typeEngin, marque: req.body.marque || '', modele: req.body.modele || '', annee: req.body.annee ? Number(req.body.annee) : null, numero_serie: req.body.numero_serie || '', immatriculation: req.body.immatriculation || '', kilometrage: toNumber(req.body.kilometrage), heures_fonctionnement: toNumber(req.body.heures_fonctionnement), observations: req.body.observations || '' };
  const { data, error } = await supabase.from('engins').update(payload).eq('id', req.params.id).select('*').single();
  if (error) throw error; await logAction(req, 'Modification engin', 'engins', data.id, { type_engin: data.type_engin }); res.json(data);
}));
app.delete('/api/engins/:id', asyncRoute(async (req, res) => {
  const { error } = await supabase.from('engins').update({ actif: false }).eq('id', req.params.id);
  if (error) throw error; await logAction(req, 'Archivage engin', 'engins', req.params.id); res.json({ success: true });
}));
app.delete('/api/engins/:id/permanent', asyncRoute(async (req, res) => {
  const { error } = await supabase.from('engins').delete().eq('id', req.params.id);
  if (error) throw error; await logAction(req, 'Suppression définitive engin', 'engins', req.params.id); res.json({ success: true });
}));

// Équipe / employés visibles et utilisables comme intervenants
app.get('/api/equipe', asyncRoute(async (req, res) => {
  const { data, error } = await supabase.from('equipe_site').select('*').order('ordre', { ascending: true });
  if (error) throw error; res.json(data || []);
}));
app.post('/api/equipe', upload.single('photo'), asyncRoute(async (req, res) => {
  const uploadedPhoto = req.file ? await storeUploadedFile(req.file, 'equipe', 'photos') : null;
  const photoUrl = uploadedPhoto?.url || (req.body.photo_url || '');
  const fonction = req.body.fonction === 'Autre' && req.body.fonction_autre ? req.body.fonction_autre : req.body.fonction;
  const payload = {
    nom_complet: req.body.nom_complet, fonction: fonction || '', description: req.body.description || '', photo_url: photoUrl, photo_bucket: uploadedPhoto?.bucket || null, photo_path: uploadedPhoto?.path || null,
    ordre: req.body.ordre ? Number(req.body.ordre) : 0, visible: req.body.visible !== 'false' && req.body.visible !== undefined,
    statut: req.body.statut || 'actif', telephone: req.body.telephone || '', email: req.body.email || '',
    specialites: Array.isArray(req.body.specialites) ? req.body.specialites.join(', ') : (req.body.specialites || ''),
    informations_personnelles: req.body.informations_personnelles || ''
  };
  let { data, error } = await supabase.from('equipe_site').insert(payload).select('*').single();
  if (error && /(statut|telephone|email|specialites|informations_personnelles)/i.test(error.message || '')) {
    const fallback = { nom_complet: payload.nom_complet, fonction: payload.fonction, description: `${payload.description}\n${payload.specialites}\n${payload.informations_personnelles}`.trim(), photo_url: payload.photo_url, ordre: payload.ordre, visible: payload.visible };
    const retry = await supabase.from('equipe_site').insert(fallback).select('*').single(); data = retry.data; error = retry.error;
  }
  if (error) throw error; await logAction(req, 'Ajout membre équipe', 'equipe_site', data.id, { nom: data.nom_complet }); res.status(201).json(data);
}));
app.put('/api/equipe/:id', upload.single('photo'), asyncRoute(async (req, res) => {
  const fonction = req.body.fonction === 'Autre' && req.body.fonction_autre ? req.body.fonction_autre : req.body.fonction;
  const payload = { nom_complet: req.body.nom_complet, fonction: fonction || '', description: req.body.description || '', ordre: req.body.ordre ? Number(req.body.ordre) : 0, visible: req.body.visible !== 'false' && req.body.visible !== undefined, statut: req.body.statut || 'actif', telephone: req.body.telephone || '', email: req.body.email || '', specialites: Array.isArray(req.body.specialites) ? req.body.specialites.join(', ') : (req.body.specialites || ''), informations_personnelles: req.body.informations_personnelles || '' };
  if (req.file) { const uploadedPhoto = await storeUploadedFile(req.file, 'equipe', 'photos'); payload.photo_url = uploadedPhoto?.url || `/uploads/${req.file.filename}`; payload.photo_bucket = uploadedPhoto?.bucket || null; payload.photo_path = uploadedPhoto?.path || null; }
  const { data, error } = await supabase.from('equipe_site').update(payload).eq('id', req.params.id).select('*').single();
  if (error) throw error; await logAction(req, 'Modification membre équipe', 'equipe_site', data.id, { nom: data.nom_complet }); res.json(data);
}));
app.put('/api/equipe/:id/visibility', asyncRoute(async (req, res) => {
  const visible = Boolean(req.body.visible);
  const { data, error } = await supabase.from('equipe_site').update({ visible }).eq('id', req.params.id).select('*').single();
  if (error) throw error; await logAction(req, visible ? 'Réaffichage membre équipe' : 'Masquage membre équipe', 'equipe_site', data.id, { nom: data.nom_complet }); res.json(data);
}));
app.delete('/api/equipe/:id', asyncRoute(async (req, res) => {
  const { error } = await supabase.from('equipe_site').update({ visible: false }).eq('id', req.params.id);
  if (error) throw error; await logAction(req, 'Masquage membre équipe', 'equipe_site', req.params.id); res.json({ success: true });
}));
app.delete('/api/equipe/:id/permanent', asyncRoute(async (req, res) => {
  const { error } = await supabase.from('equipe_site').delete().eq('id', req.params.id);
  if (error) throw error; await logAction(req, 'Suppression définitive membre équipe', 'equipe_site', req.params.id); res.json({ success: true });
}));

// Interventions avec plusieurs intervenants et pièces utilisées
app.get('/api/interventions', asyncRoute(async (req, res) => {
  const { data, error } = await supabase.from('interventions').select('*, clients(nom, entreprise_nom), engins(type_engin, marque, modele)').order('created_at', { ascending: false });
  if (error) throw error;
  const ids = (data || []).map(x => x.id);
  let intervenants = [], pieces = [];
  if (ids.length) {
    const r1 = await supabase.from('intervention_intervenants').select('*, equipe_site(nom_complet, fonction)').in('intervention_id', ids);
    if (!r1.error) intervenants = r1.data || [];
    const r2 = await supabase.from('intervention_pieces').select('*, produits(nom, unite)').in('intervention_id', ids);
    if (!r2.error) pieces = r2.data || [];
  }
  res.json((data || []).map(i => ({ ...i, intervenants: intervenants.filter(x => x.intervention_id === i.id), pieces: pieces.filter(x => x.intervention_id === i.id) })));
}));
app.post('/api/interventions', asyncRoute(async (req, res) => {
  const entreprise = await getEntreprise();
  const payload = {
    entreprise_id: entreprise.id, numero: req.body.numero || await nextNumero('INT', 'interventions'), client_id: req.body.client_id || null, engin_id: req.body.engin_id || null,
    statut: req.body.statut || 'planifiee', date_intervention: req.body.date_intervention || new Date().toISOString().slice(0, 10),
    probleme_signale: req.body.probleme_signale || '', diagnostic: req.body.diagnostic || '', travaux_realises: req.body.travaux_realises || '',
    pieces_utilisees: req.body.pieces_utilisees || ''
  };
  let { data, error } = await supabase.from('interventions').insert(payload).select('*').single();
  if (error && /invalid input value for enum/i.test(error.message || '')) {
    payload.statut = payload.statut === 'terminee' || payload.statut === 'fin_intervention' ? 'terminee' : payload.statut === 'annulee' ? 'annulee' : 'en_cours';
    const retry = await supabase.from('interventions').insert(payload).select('*').single(); data = retry.data; error = retry.error;
  }
  if (error) throw error;

  const intervenants = Array.isArray(req.body.intervenants) ? req.body.intervenants.filter(x => x.equipe_id || x.employe_id) : [];
  if (intervenants.length) {
    const rows = intervenants.map(x => ({ intervention_id: data.id, equipe_id: x.equipe_id || x.employe_id, role_intervention: x.role_intervention || x.role || '', statut_intervention: x.statut_intervention || 'assigne', date_debut: x.date_debut || null, date_fin: x.date_fin || null, notes: x.notes || '' }));
    const { error: intError } = await supabase.from('intervention_intervenants').insert(rows);
    if (intError) throw intError;
  }

  const pieces = Array.isArray(req.body.pieces) ? req.body.pieces.filter(x => x.produit_id && toNumber(x.quantite) > 0) : [];
  if (pieces.length) {
    const rows = pieces.map(x => ({ intervention_id: data.id, produit_id: x.produit_id, quantite: toNumber(x.quantite), prix_unitaire: toNumber(x.prix_unitaire), notes: x.notes || '' }));
    const { error: pError } = await supabase.from('intervention_pieces').insert(rows);
    if (pError) throw pError;
    for (const p of rows) {
      const { data: product } = await supabase.from('produits').select('quantite_stock, nom').eq('id', p.produit_id).single();
      if (product) await supabase.from('produits').update({ quantite_stock: Math.max(0, toNumber(product.quantite_stock) - toNumber(p.quantite)) }).eq('id', p.produit_id);
      await supabase.from('mouvements_stock').insert({ produit_id: p.produit_id, type_mouvement: 'sortie', quantite: p.quantite, motif: `Pièce utilisée intervention ${data.numero}`, reference_document: data.numero });
    }
  }
  await logAction(req, 'Création intervention', 'interventions', data.id, { numero: data.numero, intervenants: intervenants.length, pieces: pieces.length });
  res.status(201).json(data);
}));
app.put('/api/interventions/:id', asyncRoute(async (req, res) => {
  const payload = {
    client_id: req.body.client_id || null,
    engin_id: req.body.engin_id || null,
    statut: req.body.statut || 'planifiee',
    date_intervention: req.body.date_intervention || null,
    probleme_signale: req.body.probleme_signale || '',
    diagnostic: req.body.diagnostic || '',
    travaux_realises: req.body.travaux_realises || ''
  };
  const { data, error } = await supabase.from('interventions').update(payload).eq('id', req.params.id).select('*').single();
  if (error) throw error;
  if (Array.isArray(req.body.intervenants)) {
    await supabase.from('intervention_intervenants').delete().eq('intervention_id', req.params.id);
    const rows = req.body.intervenants.filter(x=>x.employe_id).map(x => ({ intervention_id: req.params.id, employe_id: x.employe_id, role_intervention: x.role_intervention || '', statut_intervention: x.statut_intervention || 'assigne', date_debut: x.date_debut || null, date_fin: x.date_fin || null, notes: x.notes || '' }));
    if (rows.length) await supabase.from('intervention_intervenants').insert(rows);
  }
  if (Array.isArray(req.body.pieces)) {
    await supabase.from('intervention_pieces').delete().eq('intervention_id', req.params.id);
    const rows = req.body.pieces.filter(x=>x.produit_id).map(x => ({ intervention_id: req.params.id, produit_id: x.produit_id, quantite: toNumber(x.quantite), prix_unitaire: toNumber(x.prix_unitaire), notes: x.notes || '' }));
    if (rows.length) await supabase.from('intervention_pieces').insert(rows);
  }
  await logAction(req, 'Modification intervention', 'interventions', data.id, { numero: data.numero });
  res.json(data);
}));
app.delete('/api/interventions/:id/permanent', asyncRoute(async (req, res) => {
  await supabase.from('intervention_intervenants').delete().eq('intervention_id', req.params.id);
  await supabase.from('intervention_pieces').delete().eq('intervention_id', req.params.id);
  const { error } = await supabase.from('interventions').delete().eq('id', req.params.id);
  if (error) throw error;
  await logAction(req, 'Suppression définitive intervention', 'interventions', req.params.id);
  res.json({ success: true });
}));
app.put('/api/interventions/:id/status', asyncRoute(async (req, res) => {
  const statut = req.body.statut || 'en_cours';
  const { data, error } = await supabase.from('interventions').update({ statut }).eq('id', req.params.id).select('*').single();
  if (error) throw error; await logAction(req, `Changement statut intervention: ${statut}`, 'interventions', data.id, { numero: data.numero }); res.json(data);
}));

function computeDocumentTotals(body) {
  const lignes = Array.isArray(body.lignes) ? body.lignes : [];
  const sousTotalLignes = lignes.reduce((sum, l) => sum + (toNumber(l.quantite) * toNumber(l.prix_unitaire) - toNumber(l.remise)), 0);
  const remise = toNumber(body.remise);
  const taxableBase = Math.max(0, sousTotalLignes - remise);
  const taxePourcentage = toNullablePercent(body.taxe_pourcentage);
  const taxeMontant = Math.round(taxableBase * (toNumber(taxePourcentage) / 100));
  const total = Math.max(0, taxableBase + taxeMontant);
  const montantPaye = toNumber(body.montant_paye);
  const solde = Math.max(0, total - montantPaye);
  return { lignes, sousTotal: sousTotalLignes, remise, taxePourcentage, taxeMontant, total, montantPaye, solde };
}

async function insertDocument(table, linesTable, lineFk, prefix, dateField, body, req) {
  const entreprise = await getEntreprise();
  const totals = computeDocumentTotals(body);
  const payload = {
    entreprise_id: entreprise.id, numero: body.numero || await nextNumero(prefix, table), client_id: body.client_id || null, intervention_id: body.intervention_id || null,
    [dateField]: body[dateField] || new Date().toISOString().slice(0, 10),
    statut: totals.solde <= 0 && table === 'factures' ? 'payee' : (body.statut || 'brouillon'),
    sous_total: totals.sousTotal, remise: totals.remise, taxe: totals.taxeMontant, total: totals.total, notes: body.notes || ''
  };
  if (table === 'factures') { payload.montant_paye = totals.montantPaye; payload.solde = totals.solde; payload.statut = totals.solde <= 0 ? 'payee' : 'impayee'; }
  if (totals.taxePourcentage !== null) payload.taxe_pourcentage = totals.taxePourcentage;

  let { data, error } = await supabase.from(table).insert(payload).select('*').single();
  if (error && /taxe_pourcentage/i.test(error.message || '')) {
    delete payload.taxe_pourcentage; payload.notes = `${payload.notes || ''}\nTaxe pourcentage: ${toNumber(totals.taxePourcentage)}%`.trim();
    const retry = await supabase.from(table).insert(payload).select('*').single(); data = retry.data; error = retry.error;
  }
  if (error) throw error;

  const linesPayload = totals.lignes.filter(l => l.designation && toNumber(l.quantite) > 0).map(l => ({
    [lineFk]: data.id, type_ligne: l.type_ligne || 'service', produit_id: l.produit_id || null, service_id: l.service_id || null,
    designation: l.designation, quantite: toNumber(l.quantite) || 1, prix_unitaire: toNumber(l.prix_unitaire), remise: toNumber(l.remise)
  }));
  if (linesPayload.length) {
    const { error: lineError } = await supabase.from(linesTable).insert(linesPayload);
    if (lineError) throw lineError;
  }
  await logAction(req, `Création ${table === 'factures' ? 'facture' : 'devis'}`, table, data.id, { numero: data.numero, total: data.total });
  try {
    if (body.client_id) {
      const { data: client } = await supabase.from('clients').select('nom, entreprise_nom, telephone, whatsapp').eq('id', body.client_id).maybeSingle();
      const typeLabel = table === 'factures' ? 'facture' : 'devis';
      await sendWhatsAppText(client?.whatsapp || client?.telephone, `HydroConnecto: votre ${typeLabel} ${data.numero} est créé.\nMontant: ${money(data.total)}\nContact: ${COMPANY.telephone}`, { type: typeLabel, id: data.id, numero: data.numero });
    }
  } catch (e) {
    console.warn('Notification document non envoyée:', e.message);
  }
  return data;
}

// Devis / Factures / Paiements
app.get('/api/devis', asyncRoute(async (req, res) => {
  const { data, error } = await supabase.from('devis').select('*, clients(nom, entreprise_nom, telephone)').order('created_at', { ascending: false });
  if (error) throw error; res.json(data || []);
}));
app.post('/api/devis', asyncRoute(async (req, res) => res.status(201).json(await insertDocument('devis', 'lignes_devis', 'devis_id', 'DEV', 'date_devis', req.body, req))));
app.get('/api/factures', asyncRoute(async (req, res) => {
  const { data, error } = await supabase.from('factures').select('*, clients(nom, entreprise_nom, telephone)').order('created_at', { ascending: false });
  if (error) throw error; res.json(data || []);
}));
app.post('/api/factures', asyncRoute(async (req, res) => res.status(201).json(await insertDocument('factures', 'lignes_facture', 'facture_id', 'FAC', 'date_facture', req.body, req))));
app.get('/api/paiements', asyncRoute(async (req, res) => {
  const { data, error } = await supabase.from('paiements').select('*, factures(numero, total, solde, clients(nom, entreprise_nom, telephone))').order('created_at', { ascending: false });
  if (error) throw error; res.json(data || []);
}));
app.post('/api/paiements', asyncRoute(async (req, res) => {
  const payload = { facture_id: req.body.facture_id || null, numero_recu: req.body.numero_recu || await nextNumero('REC', 'paiements'), montant: toNumber(req.body.montant), methode: req.body.methode || 'especes', reference: req.body.reference || '', date_paiement: req.body.date_paiement || new Date().toISOString().slice(0, 10), notes: req.body.notes || '' };
  const { data, error } = await supabase.from('paiements').insert(payload).select('*').single();
  if (error) throw error;
  if (payload.facture_id) {
    const { data: facture } = await supabase.from('factures').select('numero,montant_paye,total,clients(nom, entreprise_nom, telephone, whatsapp)').eq('id', payload.facture_id).single();
    if (facture) {
      const montantPaye = toNumber(facture.montant_paye) + toNumber(payload.montant);
      const solde = Math.max(0, toNumber(facture.total) - montantPaye);
      await supabase.from('factures').update({ montant_paye: montantPaye, solde, statut: solde <= 0 ? 'payee' : 'impayee' }).eq('id', payload.facture_id);
      await sendWhatsAppText(facture.clients?.whatsapp || facture.clients?.telephone, `HydroConnecto: paiement reçu pour la facture ${facture.numero}.\nMontant: ${money(payload.montant)}\nSolde restant: ${money(solde)}`, { type: 'paiement', id: data.id, facture_id: payload.facture_id });
    }
  }
  await logAction(req, 'Création reçu / paiement', 'paiements', data.id, { numero: data.numero_recu, montant: data.montant });
  res.status(201).json(data);
}));

app.post('/api/payments/initiate', asyncRoute(async (req, res) => {
  const factureId = req.body.facture_id;
  if (!factureId) return res.status(400).json({ error: 'facture_id requis' });
  const { data: facture, error } = await supabase
    .from('factures')
    .select('*, clients(nom, entreprise_nom, telephone, whatsapp)')
    .eq('id', factureId)
    .single();
  if (error) throw error;
  const montant = toNumber(req.body.montant || facture.solde || facture.total);
  if (montant <= 0) return res.status(400).json({ error: 'Montant de paiement invalide' });

  const payment = await createPaymentRequest({
    facture,
    montant,
    telephone: req.body.telephone || facture.clients?.whatsapp || facture.clients?.telephone
  });

  await insertBestEffort('payment_transactions', {
    facture_id: factureId,
    provider: process.env.PAYMENT_PROVIDER || 'generic',
    external_reference: payment.externalRef,
    montant,
    devise: COMPANY.devise,
    statut: 'initie',
    request_payload: payment.request,
    response_payload: payment.response
  });

  const checkoutUrl = payment.response.checkout_url || payment.response.payment_url || payment.response.url || '';
  if (checkoutUrl) {
    await sendWhatsAppText(facture.clients?.whatsapp || facture.clients?.telephone, `HydroConnecto: lien de paiement facture ${facture.numero}\nMontant: ${money(montant)}\n${checkoutUrl}`, { type: 'payment_link', facture_id: factureId, reference: payment.externalRef });
  }
  await logAction(req, 'Initialisation paiement API', 'factures', factureId, { numero: facture.numero, montant, reference: payment.externalRef });
  res.status(201).json({ success: true, reference: payment.externalRef, checkout_url: checkoutUrl, provider_response: payment.response });
}, { admin: true, permission: 'paiements.create' }));

app.post('/api/webhooks/payment', asyncRoute(async (req, res) => {
  if (!verifyWebhookSignature(req)) return res.status(401).json({ error: 'Signature webhook invalide' });
  const body = req.body || {};
  const reference = String(body.reference || body.external_reference || body.transaction_id || '').trim();
  const status = String(body.status || body.statut || '').toLowerCase();
  const paid = ['paid', 'payee', 'success', 'successful', 'completed', 'valide'].includes(status);

  await insertBestEffort('payment_webhook_events', {
    provider: process.env.PAYMENT_PROVIDER || 'generic',
    external_reference: reference,
    event_type: status || 'unknown',
    payload: body
  });

  if (!paid || !reference) return res.json({ received: true, applied: false });

  const { data: tx } = await supabase
    .from('payment_transactions')
    .select('*, factures(numero,total,montant_paye,solde,clients(telephone,whatsapp))')
    .eq('external_reference', reference)
    .maybeSingle();

  if (!tx?.facture_id) return res.json({ received: true, applied: false, reason: 'transaction_not_found' });

  const montant = toNumber(body.amount || body.montant || tx.montant);
  const numeroRecu = await nextNumero('REC', 'paiements');
  const { data: paiement, error } = await supabase.from('paiements').insert({
    facture_id: tx.facture_id,
    numero_recu: numeroRecu,
    montant,
    methode: process.env.PAYMENT_PROVIDER || 'api',
    reference,
    date_paiement: new Date().toISOString().slice(0, 10),
    notes: 'Paiement confirmé par webhook API'
  }).select('*').single();
  if (error) throw error;

  const facture = tx.factures || {};
  const montantPaye = toNumber(facture.montant_paye) + montant;
  const solde = Math.max(0, toNumber(facture.total) - montantPaye);
  await supabase.from('factures').update({ montant_paye: montantPaye, solde, statut: solde <= 0 ? 'payee' : 'impayee' }).eq('id', tx.facture_id);
  await supabase.from('payment_transactions').update({ statut: 'payee', webhook_payload: body, paiement_id: paiement.id, updated_at: new Date().toISOString() }).eq('id', tx.id);
  await sendWhatsAppText(facture.clients?.whatsapp || facture.clients?.telephone, `HydroConnecto: paiement confirmé pour la facture ${facture.numero}.\nMontant: ${money(montant)}\nReçu: ${numeroRecu}`, { type: 'payment_webhook', paiement_id: paiement.id, reference });
  res.json({ received: true, applied: true, paiement_id: paiement.id });
}, { admin: false }));



// Modification simple des documents depuis l'admin (notes + statut, sans casser les lignes)
app.put('/api/devis/:id', asyncRoute(async (req, res) => {
  const payload = { notes: req.body.notes || '', statut: req.body.statut || 'brouillon' };
  if (req.body.date_devis) payload.date_devis = req.body.date_devis;
  const { data, error } = await supabase.from('devis').update(payload).eq('id', req.params.id).select('*').single();
  if (error) throw error;
  await logAction(req, 'Modification devis', 'devis', data.id, { numero: data.numero, statut: data.statut });
  res.json(data);
}));
app.put('/api/factures/:id', asyncRoute(async (req, res) => {
  const payload = { notes: req.body.notes || '', statut: req.body.statut || 'brouillon' };
  if (req.body.date_facture) payload.date_facture = req.body.date_facture;
  if (req.body.montant_paye !== undefined && req.body.montant_paye !== '') {
    payload.montant_paye = toNumber(req.body.montant_paye);
    const { data: current } = await supabase.from('factures').select('total').eq('id', req.params.id).single();
    if (current) payload.solde = Math.max(0, toNumber(current.total) - payload.montant_paye);
  }
  const { data, error } = await supabase.from('factures').update(payload).eq('id', req.params.id).select('*').single();
  if (error) throw error;
  await logAction(req, 'Modification facture', 'factures', data.id, { numero: data.numero, statut: data.statut });
  res.json(data);
}));
app.put('/api/paiements/:id', asyncRoute(async (req, res) => {
  const payload = { notes: req.body.notes || '', };
  if (req.body.statut) payload.notes = `${payload.notes}\nStatut: ${req.body.statut}`.trim();
  if (req.body.montant !== undefined && req.body.montant !== '') payload.montant = toNumber(req.body.montant);
  if (req.body.methode) payload.methode = req.body.methode;
  if (req.body.date_paiement) payload.date_paiement = req.body.date_paiement;
  const { data, error } = await supabase.from('paiements').update(payload).eq('id', req.params.id).select('*').single();
  if (error) throw error;
  await logAction(req, 'Modification reçu / paiement', 'paiements', data.id, { numero: data.numero_recu });
  res.json(data);
}));

// Actions documents: archiver/annuler/supprimer dans l’admin
app.put('/api/devis/:id/status', asyncRoute(async (req, res) => {
  const statut = req.body.statut || 'archivee';
  const { data, error } = await supabase.from('devis').update({ statut }).eq('id', req.params.id).select('*').single();
  if (error) throw error;
  await logAction(req, `Changement statut devis: ${statut}`, 'devis', data.id, { numero: data.numero });
  res.json(data);
}));
app.delete('/api/devis/:id/permanent', asyncRoute(async (req, res) => {
  await supabase.from('lignes_devis').delete().eq('devis_id', req.params.id);
  const { error } = await supabase.from('devis').delete().eq('id', req.params.id);
  if (error) throw error;
  await logAction(req, 'Suppression définitive devis', 'devis', req.params.id);
  res.json({ success: true });
}));
app.put('/api/factures/:id/status', asyncRoute(async (req, res) => {
  const statut = req.body.statut || 'archivee';
  const { data, error } = await supabase.from('factures').update({ statut }).eq('id', req.params.id).select('*').single();
  if (error) throw error;
  await logAction(req, `Changement statut facture: ${statut}`, 'factures', data.id, { numero: data.numero });
  res.json(data);
}));
app.delete('/api/factures/:id/permanent', asyncRoute(async (req, res) => {
  await supabase.from('lignes_facture').delete().eq('facture_id', req.params.id);
  const { error } = await supabase.from('factures').delete().eq('id', req.params.id);
  if (error) throw error;
  await logAction(req, 'Suppression définitive facture', 'factures', req.params.id);
  res.json({ success: true });
}));
app.put('/api/paiements/:id/status', asyncRoute(async (req, res) => {
  const { data, error } = await supabase.from('paiements').update({ notes: `Statut: ${req.body.statut || 'archivee'}` }).eq('id', req.params.id).select('*').single();
  if (error) throw error;
  await logAction(req, 'Archivage reçu / paiement', 'paiements', data.id, { numero: data.numero_recu });
  res.json(data);
}));
app.delete('/api/paiements/:id/permanent', asyncRoute(async (req, res) => {
  const { error } = await supabase.from('paiements').delete().eq('id', req.params.id);
  if (error) throw error;
  await logAction(req, 'Suppression définitive reçu / paiement', 'paiements', req.params.id);
  res.json({ success: true });
}));

async function getFullDocument(table, linesTable, id) {
  const select = table === 'paiements' ? '*, factures(*, clients(*), entreprises(*))' : '*, clients(*), entreprises(*)';
  const { data: doc, error } = await supabase.from(table).select(select).eq('id', id).single();
  if (error) throw error;
  let lignes = [];
  if (linesTable) {
    const fk = table === 'devis' ? 'devis_id' : 'facture_id';
    const { data: lines, error: lineError } = await supabase.from(linesTable).select('*').eq(fk, id);
    if (lineError) throw lineError;
    lignes = lines || [];
  }
  return { doc, lignes };
}


function fitOneLine(doc, text, maxWidth, maxChars = 160) {
  let safe = String(text || '').replace(/\s+/g, ' ').trim();

  if (safe.length > maxChars) {
    safe = safe.slice(0, maxChars - 1) + '…';
  }

  while (safe.length > 10 && doc.widthOfString(safe) > maxWidth) {
    safe = safe.slice(0, -2) + '…';
  }

  return safe;
}


function safePdfLine(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function writeFitCentered(doc, text, x, y, width, options = {}) {
  const font = options.font || 'Helvetica';
  const color = options.color || '#FFFFFF';
  let size = options.size || 7;
  const minSize = options.minSize || 4.5;
  const height = options.height || 9;

  let safe = safePdfLine(text);

  doc.font(font).fontSize(size);
  while (size > minSize && doc.widthOfString(safe) > width) {
    size -= 0.15;
    doc.fontSize(size);
  }

  while (safe.length > 8 && doc.widthOfString(safe) > width) {
    safe = safe.slice(0, -2) + '…';
  }

  doc.fillColor(color).font(font).fontSize(size).text(safe, x, y, {
    width,
    height,
    align: 'center',
    lineBreak: false,
    ellipsis: true
  });
}

function drawHeaderFooter(doc, title, numero, entreprise) {
  const night = '#071B3A';
  const yellow = '#F5C400';
  const width = doc.page.width;
  const pageHeight = doc.page.height;

  doc.save();

  // HEADER
  doc.rect(0, 0, width, 88).fill(night);

  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, 42, 12, { fit: [66, 64] });
  }

  doc.fillColor('#FFFFFF')
    .fontSize(18)
    .font('Helvetica-Bold')
    .text(entreprise.nom || COMPANY.nom, 125, 18, {
      width: 265,
      lineBreak: false,
      height: 22,
      ellipsis: true
    });

  doc.fontSize(9)
    .font('Helvetica')
    .text(entreprise.slogan || COMPANY.slogan, 125, 42, {
      width: 300,
      lineBreak: false,
      height: 11,
      ellipsis: true
    });

  doc.text(
    'Tél : ' + (entreprise.telephone || COMPANY.telephone) + ' | Courriel : ' + (entreprise.email || COMPANY.email),
    125,
    58,
    {
      width: 330,
      lineBreak: false,
      height: 11,
      ellipsis: true
    }
  );

  doc.text(
    (entreprise.adresse || COMPANY.adresses) + ', ' + (entreprise.ville || COMPANY.ville) + ', ' + (entreprise.pays || COMPANY.pays),
    125,
    73,
    {
      width: 330,
      lineBreak: false,
      height: 11,
      ellipsis: true
    }
  );

  doc.fillColor(yellow)
    .fontSize(20)
    .font('Helvetica-Bold')
    .text(title, 410, 24, {
      width: 140,
      align: 'right',
      lineBreak: false,
      height: 24,
      ellipsis: true
    });

  doc.fillColor('#FFFFFF')
    .fontSize(9)
    .font('Helvetica')
    .text('N° ' + (numero || ''), 410, 52, {
      width: 140,
      align: 'right',
      lineBreak: false,
      height: 12,
      ellipsis: true
    });

  // FOOTER V5 : plus haut, 5 lignes propres, aucune ligne coupée.
  const footerHeight = 122;
  const footerY = pageHeight - footerHeight;
  const footerX = 24;
  const footerWidth = width - 48;

  doc.rect(0, footerY, width, footerHeight).fill(night);
  doc.rect(0, footerY, width, 3).fill(yellow);

  const p1 = COMPANY.nom + ' | Responsable : ' + COMPANY.responsable + ' | Téléphone : ' + COMPANY.telephone;
  const p2 = 'Courriel : ' + COMPANY.email + ' | Adresse : ' + COMPANY.adresses + ', ' + COMPANY.ville + ', ' + COMPANY.pays;
  const p3 = 'Conception et développement : ' + DESIGNER.nom;
  const p4 = 'Courriel : ' + DESIGNER.email;
  const p5 = 'Concepteur | Développeur en technologie numérique | Administrateur de bases de données';

  writeFitCentered(doc, p1, footerX, footerY + 17, footerWidth, {
    font: 'Helvetica',
    size: 7.0,
    minSize: 5.0,
    color: '#FFFFFF',
    height: 9
  });

  writeFitCentered(doc, p2, footerX, footerY + 33, footerWidth, {
    font: 'Helvetica',
    size: 6.8,
    minSize: 4.9,
    color: '#FFFFFF',
    height: 9
  });

  writeFitCentered(doc, p3, footerX, footerY + 56, footerWidth, {
    font: 'Helvetica-Bold',
    size: 6.5,
    minSize: 4.8,
    color: yellow,
    height: 8
  });

  writeFitCentered(doc, p4, footerX, footerY + 70, footerWidth, {
    font: 'Helvetica-Bold',
    size: 6.5,
    minSize: 4.8,
    color: yellow,
    height: 8
  });

  writeFitCentered(doc, p5, footerX, footerY + 84, footerWidth, {
    font: 'Helvetica-Bold',
    size: 6.2,
    minSize: 4.5,
    color: yellow,
    height: 8
  });

  doc.x = 42;
  doc.y = 112;

  doc.restore();
}

function drawTableHeader(doc, y) {
  const night = '#071B3A';
  doc.fillColor('#FFFFFF').rect(42, y, 510, 24).fill(night);
  doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold');
  doc.text('Désignation', 52, y + 8, { width: 205 });
  doc.text('Catégorie', 260, y + 8, { width: 58 });
  doc.text('Qté', 322, y + 8, { width: 40, align: 'right' });
  doc.text('Prix unitaire', 370, y + 8, { width: 80, align: 'right' });
  doc.text('Total', 460, y + 8, { width: 82, align: 'right' });
}

function drawDocumentPdf(res, type, record, lignes) {
  const isReceipt = type === 'recu';
  const entreprise = isReceipt ? (record.factures?.entreprises || COMPANY) : (record.entreprises || COMPANY);
  const client = isReceipt ? (record.factures?.clients || {}) : (record.clients || {});
  const title = type === 'facture' ? 'FACTURE' : type === 'devis' ? 'DEVIS' : 'REÇU';
  const numero = isReceipt ? record.numero_recu : record.numero;
  const file = `${numero || title}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${file}"`);

  const doc = new PDFDocument({ margin: 42, size: 'A4', bufferPages: true });
  doc.pipe(res);
  const night = '#071B3A', gray = '#F4F6F8';

  let y = 112;
  doc.fillColor('#111827').fontSize(10).font('Helvetica-Bold').text(`N° ${numero || ''}`, 420, y, { width: 130, align: 'right' });
  const date = isReceipt ? record.date_paiement : (record.date_facture || record.date_devis);
  doc.font('Helvetica').text(`Date : ${date || ''}`, 420, y + 16, { width: 130, align: 'right' });
  doc.roundedRect(42, y, 250, 74, 6).fillAndStroke(gray, '#E5E7EB');
  doc.fillColor(night).fontSize(11).font('Helvetica-Bold').text('Client', 55, y + 12);
  doc.fillColor('#111827').fontSize(9).font('Helvetica').text(client.entreprise_nom || client.nom || 'Client non renseigné', 55, y + 32, { width: 220 });
  if (client.telephone) doc.text(`Téléphone : ${client.telephone}`, 55, y + 46, { width: 220 });
  if (client.adresse) doc.text(`Adresse : ${client.adresse}`, 55, y + 60, { width: 220 });

  if (!isReceipt) {
    y = 220;
    drawTableHeader(doc, y);
    y += 34;
    doc.fillColor('#111827').font('Helvetica').fontSize(9);
    (lignes || []).forEach((l, idx) => {
      if (y > 680) { doc.addPage(); y = 120; drawTableHeader(doc, y); y += 34; doc.fillColor('#111827').font('Helvetica').fontSize(9); }
      if (idx % 2 === 0) doc.rect(42, y - 6, 510, 23).fill('#FAFAFA').fillColor('#111827');
      const lineTotal = l.total !== undefined ? l.total : (toNumber(l.quantite) * toNumber(l.prix_unitaire) - toNumber(l.remise));
      doc.text(l.designation, 52, y, { width: 200 });
      doc.text(l.type_ligne || '', 260, y, { width: 58 });
      doc.text(String(l.quantite || ''), 322, y, { width: 40, align: 'right' });
      doc.text(money(l.prix_unitaire), 370, y, { width: 80, align: 'right' });
      doc.text(money(lineTotal), 460, y, { width: 82, align: 'right' });
      y += 24;
    });
    if (y > 550) { doc.addPage(); y = 130; }
    y = Math.max(y + 16, 430);
    doc.roundedRect(325, y, 227, 122, 6).strokeColor('#E5E7EB').stroke();
    y += 14;
    const pct = record.taxe_pourcentage === null || record.taxe_pourcentage === undefined ? 0 : toNumber(record.taxe_pourcentage);
    const rows = [['Sous-total', money(record.sous_total)], ['Remise', money(record.remise)], [`Taxe (${pct} %)`, money(record.taxe)], ['Total', money(record.total)], ...(type === 'facture' ? [['Payé', money(record.montant_paye)], ['Solde', money(record.solde)]] : [])];
    rows.forEach(([label, value], i) => { doc.fillColor(i === 3 ? night : '#111827').font(i === 3 ? 'Helvetica-Bold' : 'Helvetica').fontSize(i === 3 ? 11 : 10); doc.text(label, 340, y, { width: 100 }); doc.text(value, 440, y, { width: 95, align: 'right' }); y += 18; });
    doc.fillColor('#111827').fontSize(9).font('Helvetica').text('Signature / Cachet', 42, 645);
    doc.roundedRect(42, 665, 180, 45, 4).strokeColor('#D1D5DB').stroke();
  } else {
    const boxY = 230;
    doc.roundedRect(90, boxY, 415, 145, 8).fillAndStroke('#FAFAFA', '#E5E7EB');
    doc.fillColor(night).fontSize(14).font('Helvetica-Bold').text('Détails du paiement', 110, boxY + 20);
    doc.fillColor('#111827').fontSize(11).font('Helvetica');
    doc.text(`Montant reçu : ${money(record.montant)}`, 110, boxY + 55);
    doc.text(`Méthode : ${record.methode || 'espèces'}`, 110, boxY + 78);
    doc.text(`Référence : ${record.reference || '-'}`, 110, boxY + 101);
    doc.text(`Facture liée : ${record.factures?.numero || '-'}`, 110, boxY + 124);
    doc.fontSize(9).text('Signature / Cachet', 42, 645);
    doc.roundedRect(42, 665, 180, 45, 4).strokeColor('#D1D5DB').stroke();
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    drawHeaderFooter(doc, title, numero, entreprise);
  }
  doc.end();
}
app.get('/api/pdf/factures/:id', asyncRoute(async (req, res) => { const { doc, lignes } = await getFullDocument('factures', 'lignes_facture', req.params.id); drawDocumentPdf(res, 'facture', doc, lignes); }));
app.get('/api/pdf/devis/:id', asyncRoute(async (req, res) => { const { doc, lignes } = await getFullDocument('devis', 'lignes_devis', req.params.id); drawDocumentPdf(res, 'devis', doc, lignes); }));
app.get('/api/pdf/paiements/:id', asyncRoute(async (req, res) => { const { doc } = await getFullDocument('paiements', null, req.params.id); drawDocumentPdf(res, 'recu', doc, []); }));

// Galerie
app.get('/api/galerie', asyncRoute(async (req, res) => {
  const { data, error } = await supabase.from('galerie').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  res.json((data || []).filter(row => !isDemoGalleryRow(row)).map(row => normalizeGalleryRow(req, row)));
}));
app.post('/api/galerie', upload.single('media'), asyncRoute(async (req, res) => {
  const uploadedMedia = req.file ? await storeUploadedFile(req.file, 'galerie', 'medias') : null;
  const mediaUrl = uploadedMedia?.url || req.body.url;
  if (!mediaUrl) return res.status(400).json({ error: 'Image ou vidéo requise' });
  const typeMedia = req.file ? (req.file.mimetype.startsWith('video/') ? 'video' : 'photo') : (req.body.type_media || 'photo');
  const payload = { titre: req.body.titre, categorie: req.body.categorie || 'Réalisation', description: req.body.description || '', url: mediaUrl, type_media: typeMedia, bucket: uploadedMedia?.bucket || null, chemin_storage: uploadedMedia?.path || null, mime_type: uploadedMedia?.mime_type || null, taille_fichier: uploadedMedia?.size || null, visible: req.body.visible !== 'false' };
  const inserted = await insertWithEntreprise('galerie', payload, req, 'média galerie');
  const normalized = normalizeGalleryRow(req, inserted);
  if (uploadedMedia?.storage_error) normalized.storage_warning = `Stockage Supabase non utilisé : ${uploadedMedia.storage_error}. Le fichier est visible localement mais doit être envoyé dans Supabase Storage pour rester disponible après changement de dossier ou déploiement.`;
  res.status(201).json(normalized);
}));
app.put('/api/galerie/:id', upload.single('media'), asyncRoute(async (req, res) => {
  const payload = { titre: req.body.titre, categorie: req.body.categorie || 'Réalisation', description: req.body.description || '' };
  if (req.file) {
    const uploadedMedia = await storeUploadedFile(req.file, 'galerie', 'medias');
    payload.url = uploadedMedia?.url;
    payload.type_media = req.file.mimetype.startsWith('video/') ? 'video' : 'photo';
    payload.bucket = uploadedMedia?.bucket || null;
    payload.chemin_storage = uploadedMedia?.path || null;
    payload.mime_type = uploadedMedia?.mime_type || null;
    payload.taille_fichier = uploadedMedia?.size || null;
  }
  const { data, error } = await supabase.from('galerie').update(payload).eq('id', req.params.id).select('*').single();
  if (error) throw error;
  await logAction(req, 'Modification média galerie', 'galerie', data.id, { titre: data.titre });
  res.json(normalizeGalleryRow(req, data));
}));
app.delete('/api/galerie/:id', asyncRoute(async (req, res) => { const { error } = await supabase.from('galerie').update({ visible: false }).eq('id', req.params.id); if (error) throw error; await logAction(req, 'Archivage média galerie', 'galerie', req.params.id); res.json({ success: true }); }));
app.patch('/api/galerie/:id/visible', asyncRoute(async (req, res) => { const visible = req.body.visible !== false; const { data, error } = await supabase.from('galerie').update({ visible }).eq('id', req.params.id).select('*').single(); if (error) throw error; await logAction(req, visible ? 'Réactivation média galerie' : 'Archivage média galerie', 'galerie', req.params.id); res.json(data); }));
app.delete('/api/galerie/:id/permanent', asyncRoute(async (req, res) => { const { error } = await supabase.from('galerie').delete().eq('id', req.params.id); if (error) throw error; await logAction(req, 'Suppression définitive média galerie', 'galerie', req.params.id); res.json({ success: true }); }));


// Utilisateurs / rôles / approbations (v2.2.1)
app.get('/api/users', asyncRoute(async (req, res) => {
  const { data, error } = await supabase.from('utilisateurs_admin').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  const users = data || [];
  let extras = [];
  try {
    const extraResult = await supabase.from('utilisateur_permissions_extra').select('*').eq('actif', true);
    extras = extraResult.error ? [] : (extraResult.data || []);
  } catch {}
  res.json(users.map(u => ({
    ...u,
    permissions_extra_rows: extras.filter(x => x.user_id === u.id),
    permissions_extra_effectives: uniqPermissions([...parsePermissionList(u.permissions_extra), ...extras.filter(x => x.user_id === u.id).map(x => x.permission)])
  })));
}));

app.post('/api/users', asyncRoute(async (req, res) => {
  const entreprise = await getEntreprise();
  const extraPermissions = parsePermissionList(req.body.permissions_extra);
  const passwordTemp = String(req.body.password_temp || '').trim();
  const payload = {
    entreprise_id: entreprise.id,
    nom_complet: req.body.nom_complet,
    email: String(req.body.email || '').trim().toLowerCase(),
    role: req.body.role || 'lecture_seule',
    statut: req.body.statut || 'en_attente',
    password_temp: passwordTemp ? hashPassword(passwordTemp) : null,
    permissions_extra: extraPermissions,
    telephone: req.body.telephone || '',
    adresse: req.body.adresse || '',
    must_change_password: true
  };
  const { data, error } = await supabase.from('utilisateurs_admin').insert(payload).select('*').single();
  if (error) throw error;

  if (extraPermissions.length) {
    const rows = extraPermissions.map(permission => ({
      user_id: data.id, permission, module: permission.split('.')[0],
      motif: req.body.motif_permissions_extra || 'Accès supplémentaire attribué à la création',
      date_debut: req.body.permissions_date_debut || null,
      date_fin: req.body.permissions_date_fin || null,
      actif: true,
      ajoute_par: getAdminUser(req).email || getAdminUser(req).name || 'admin'
    }));
    const extraInsert = await supabase.from('utilisateur_permissions_extra').insert(rows);
    if (extraInsert.error) console.warn('Permissions extra non enregistrées dans table dédiée:', extraInsert.error.message);
  }

  await logAction(req, 'Création compte utilisateur', 'utilisateurs_admin', data.id, { email: data.email, role: data.role, statut: data.statut, permissions_extra: extraPermissions });
  res.status(201).json(data);
}));

app.put('/api/users/:id', asyncRoute(async (req, res) => {
  const extraPermissions = parsePermissionList(req.body.permissions_extra);
  const payload = {
    nom_complet: req.body.nom_complet,
    email: String(req.body.email || '').trim().toLowerCase(),
    role: req.body.role || 'lecture_seule',
    statut: req.body.statut || 'en_attente',
    telephone: req.body.telephone || '',
    adresse: req.body.adresse || '',
    permissions_extra: extraPermissions,
    updated_at: new Date().toISOString()
  };
  if (req.body.password_temp) {
    payload.password_temp = hashPassword(String(req.body.password_temp).trim());
    payload.must_change_password = true;
  }

  const { data, error } = await supabase.from('utilisateurs_admin').update(payload).eq('id', req.params.id).select('*').single();
  if (error) throw error;

  try { await supabase.from('utilisateur_permissions_extra').update({ actif: false }).eq('user_id', req.params.id); } catch {}
  if (extraPermissions.length) {
    const rows = extraPermissions.map(permission => ({
      user_id: req.params.id, permission, module: permission.split('.')[0],
      motif: req.body.motif_permissions_extra || 'Modification accès supplémentaires',
      date_debut: req.body.permissions_date_debut || null,
      date_fin: req.body.permissions_date_fin || null,
      actif: true,
      ajoute_par: getAdminUser(req).email || getAdminUser(req).name || 'admin'
    }));
    const extraInsert = await supabase.from('utilisateur_permissions_extra').insert(rows);
    if (extraInsert.error) console.warn('Permissions extra non enregistrées dans table dédiée:', extraInsert.error.message);
  }

  await logAction(req, 'Modification utilisateur et accès', 'utilisateurs_admin', data.id, { email: data.email, role: data.role, statut: data.statut, permissions_extra: extraPermissions });
  res.json(data);
}));

app.put('/api/users/:id/status', asyncRoute(async (req, res) => {
  const statut = req.body.statut || 'en_attente';
  const { data, error } = await supabase.from('utilisateurs_admin').update({ statut, updated_at: new Date().toISOString() }).eq('id', req.params.id).select('*').single();
  if (error) throw error;
  await logAction(req, `Changement statut utilisateur: ${statut}`, 'utilisateurs_admin', data.id, { email: data.email, role: data.role });
  res.json(data);
}));

app.put('/api/users/:id/permissions-extra', asyncRoute(async (req, res) => {
  const permissions = parsePermissionList(req.body.permissions_extra);
  const payload = { permissions_extra: permissions, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('utilisateurs_admin').update(payload).eq('id', req.params.id).select('*').single();
  if (error) throw error;
  try { await supabase.from('utilisateur_permissions_extra').update({ actif: false }).eq('user_id', req.params.id); } catch {}
  if (permissions.length) {
    const rows = permissions.map(permission => ({
      user_id: req.params.id, permission, module: permission.split('.')[0],
      motif: req.body.motif || 'Accès supplémentaire individuel',
      date_debut: req.body.date_debut || null,
      date_fin: req.body.date_fin || null,
      actif: true,
      ajoute_par: getAdminUser(req).email || getAdminUser(req).name || 'admin'
    }));
    const extraInsert = await supabase.from('utilisateur_permissions_extra').insert(rows);
    if (extraInsert.error) console.warn('Permissions extra table non mise à jour:', extraInsert.error.message);
  }
  await logAction(req, 'Modification accès supplémentaires utilisateur', 'utilisateurs_admin', req.params.id, { permissions });
  res.json({ success: true, user: data, permissions_extra: permissions });
}));


// Fournisseurs et commandes fournisseurs
app.get('/api/fournisseurs', asyncRoute(async (req, res) => {
  const { data, error } = await supabase.from('fournisseurs').select('*').order('nom', { ascending: true });
  if (error) throw error;
  const ids = (data || []).map(x => x.id);
  let stats = [];
  if (ids.length) {
    const { data: commandes } = await supabase.from('commandes_fournisseurs').select('fournisseur_id, statut, total').in('fournisseur_id', ids);
    stats = commandes || [];
  }
  res.json((data || []).map(f => ({
    ...f,
    nb_commandes: stats.filter(c => c.fournisseur_id === f.id).length,
    commandes_ouvertes: stats.filter(c => c.fournisseur_id === f.id && !['livree','annulee'].includes(c.statut)).length,
    total_commandes: stats.filter(c => c.fournisseur_id === f.id).reduce((sum, c) => sum + toNumber(c.total), 0)
  })));
}));

app.post('/api/fournisseurs', asyncRoute(async (req, res) => {
  const payload = { nom: req.body.nom, contact: req.body.contact || '', telephone: req.body.telephone || '', email: req.body.email || '', adresse: req.body.adresse || '', statut: req.body.statut || 'actif', notes: req.body.notes || '' };
  const { data, error } = await supabase.from('fournisseurs').insert(payload).select('*').single();
  if (error) throw error;
  await logAction(req, 'Création fournisseur', 'fournisseurs', data.id, { nom: data.nom });
  res.status(201).json(data);
}));

app.put('/api/fournisseurs/:id', asyncRoute(async (req, res) => {
  const payload = { nom: req.body.nom, contact: req.body.contact || '', telephone: req.body.telephone || '', email: req.body.email || '', adresse: req.body.adresse || '', statut: req.body.statut || 'actif', notes: req.body.notes || '', updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('fournisseurs').update(payload).eq('id', req.params.id).select('*').single();
  if (error) throw error;
  await logAction(req, 'Modification fournisseur', 'fournisseurs', data.id, { nom: data.nom });
  res.json(data);
}));

app.get('/api/commandes-fournisseurs', asyncRoute(async (req, res) => {
  const { data, error } = await supabase.from('commandes_fournisseurs').select('*, fournisseurs(nom, telephone, email)').order('date_commande', { ascending: false });
  if (error) throw error;
  res.json(data || []);
}));

app.post('/api/commandes-fournisseurs', asyncRoute(async (req, res) => {
  const lignes = Array.isArray(req.body.lignes) ? req.body.lignes : [];
  const total = lignes.reduce((sum, l) => sum + (toNumber(l.quantite) * toNumber(l.prix_unitaire)), 0);
  const payload = {
    numero: req.body.numero || await nextNumero('CF', 'commandes_fournisseurs'),
    fournisseur_id: req.body.fournisseur_id || null,
    statut: req.body.statut || 'brouillon',
    date_commande: req.body.date_commande || new Date().toISOString().slice(0, 10),
    date_livraison_prevue: req.body.date_livraison_prevue || null,
    notes: req.body.notes || '',
    lignes,
    total
  };
  const { data, error } = await supabase.from('commandes_fournisseurs').insert(payload).select('*').single();
  if (error) throw error;
  await logAction(req, 'Création commande fournisseur', 'commandes_fournisseurs', data.id, { numero: data.numero, total });
  res.status(201).json(data);
}));

app.put('/api/commandes-fournisseurs/:id/status', asyncRoute(async (req, res) => {
  const statut = req.body.statut || 'envoyee';
  const { data, error } = await supabase.from('commandes_fournisseurs').update({ statut, updated_at: new Date().toISOString() }).eq('id', req.params.id).select('*').single();
  if (error) throw error;
  await logAction(req, `Changement statut commande fournisseur: ${statut}`, 'commandes_fournisseurs', data.id, { numero: data.numero });
  res.json(data);
}));

app.post('/api/commandes-fournisseurs/:id/receive', asyncRoute(async (req, res) => {
  const { data: commande, error } = await supabase.from('commandes_fournisseurs').select('*').eq('id', req.params.id).single();
  if (error) throw error;
  const lignes = Array.isArray(commande.lignes) ? commande.lignes : [];
  for (const l of lignes) {
    if (!l.produit_id || toNumber(l.quantite) <= 0) continue;
    const { data: produit } = await supabase.from('produits').select('quantite_stock').eq('id', l.produit_id).single();
    const nouveauStock = toNumber(produit?.quantite_stock) + toNumber(l.quantite);
    await supabase.from('produits').update({ quantite_stock: nouveauStock }).eq('id', l.produit_id);
    await supabase.from('mouvements_stock').insert({ produit_id: l.produit_id, type_mouvement: 'entree', quantite: toNumber(l.quantite), motif: `Réception commande fournisseur ${commande.numero}`, reference_document: commande.numero });
  }
  const { data, error: updateError } = await supabase.from('commandes_fournisseurs').update({ statut: 'livree', date_livraison_reelle: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }).eq('id', req.params.id).select('*').single();
  if (updateError) throw updateError;
  await logAction(req, 'Réception commande fournisseur vers stock', 'commandes_fournisseurs', data.id, { numero: data.numero, total: data.total });
  res.json(data);
}));

// Journal
app.get('/api/journal', asyncRoute(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 500);
  const { data, error } = await supabase.from('journal_actions').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error; res.json(data || []);
}));

function normalizeRows(rows) {
  return (rows || []).map(row => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      if (v && typeof v === 'object') out[k] = JSON.stringify(v);
      else out[k] = v ?? '';
    }
    return out;
  });
}
function csvEscape(v) { return `"${String(v ?? '').replace(/"/g, '""')}"`; }
function sendCsv(res, filename, rows) {
  const normalized = normalizeRows(rows);
  const cols = normalized.length ? Object.keys(normalized[0]) : ['message'];
  const body = [cols.join(','), ...normalized.map(r => cols.map(c => csvEscape(r[c])).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.send('\ufeff' + body);
}
function sendXls(res, filename, rows) {
  const normalized = normalizeRows(rows);
  const cols = normalized.length ? Object.keys(normalized[0]) : ['message'];
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${normalized.map(r => `<tr>${cols.map(c => `<td>${String(r[c] ?? '').replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]))}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xls"`);
  res.send(html);
}
function sendExportPdf(res, filename, title, rows) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  const doc = new PDFDocument({ margin: 42, size: 'A4' });
  doc.pipe(res);
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#071B3A').text(title);
  doc.moveDown(); doc.fontSize(9).font('Helvetica');
  const normalized = normalizeRows(rows).slice(0, 200);
  normalized.forEach((r, idx) => {
    if (doc.y > 720) doc.addPage();
    doc.font('Helvetica-Bold').text(`#${idx + 1}`);
    doc.font('Helvetica').text(Object.entries(r).slice(0, 8).map(([k, v]) => `${k}: ${v}`).join(' | '), { width: 510 });
    doc.moveDown(0.4);
  });
  doc.end();
}
async function getExportData(resource) {
  const map = {
    clients: () => supabase.from('clients').select('*').order('created_at', { ascending: false }),
    factures: () => supabase.from('factures').select('*, clients(nom, entreprise_nom, telephone)').order('created_at', { ascending: false }),
    paiements: () => supabase.from('paiements').select('*, factures(numero)').order('created_at', { ascending: false }),
    interventions: () => supabase.from('interventions').select('*, clients(nom, entreprise_nom), engins(type_engin, marque, modele)').order('created_at', { ascending: false }),
    stock: () => supabase.from('produits').select('*, categories_produits(nom)').order('nom', { ascending: true }),
    journal: () => supabase.from('journal_actions').select('*').order('created_at', { ascending: false }).limit(500),
    demandes: () => supabase.from('demandes_devis').select('*').order('created_at', { ascending: false })
  };
  if (!map[resource]) throw new Error('Ressource export inconnue');
  const { data, error } = await map[resource]();
  if (error) throw error;
  return data || [];
}
app.get('/api/export/:resource.:format', asyncRoute(async (req, res) => {
  const { resource, format } = req.params;
  const rows = await getExportData(resource);
  const filename = `hydroconnecto_${resource}_${new Date().toISOString().slice(0,10)}`;
  await logAction(req, `Export ${resource} ${format}`, resource, null, { count: rows.length });
  if (format === 'csv') return sendCsv(res, filename, rows);
  if (format === 'xls') return sendXls(res, filename, rows);
  if (format === 'pdf') return sendExportPdf(res, filename, `Export ${resource}`, rows);
  res.status(400).json({ error: 'Format export non supporté' });
}));


if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HydroConnecto ERP Pro lancé sur le port ${PORT}`);
    console.log(`Site public lancé`);
    console.log(`Admin privé : /admin/login`);
  });
}
