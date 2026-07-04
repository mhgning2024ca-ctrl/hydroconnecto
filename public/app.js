const state = {
  admin: false,
  clients: [],
  engins: [],
  categories: [],
  produits: [],
  services: [],
  factures: [],
  devis: [],
  paiements: [],
  equipe: [],
  demandes: [],
  interventions: [],
  journal: [],
  fournisseurs: [],
  commandesFournisseurs: [],
  profile: null,
  documentMode: 'facture',
  permissions: [],
  role: 'lecture_seule'
};

const enginTypes = [
  'Camion', 'Excavatrice', 'Chargeuse', 'Grue', 'Pelle mécanique', 'Dumper / Tombereau',
  'Bulldozer', 'Tracteur', 'Niveleuse', 'Compacteur', 'Chariot élévateur', 'Compresseur',
  'Groupe électrogène', 'Autre'
];
const fonctions = ['Directeur', 'Responsable', 'Administrateur', 'Comptable', 'Chef d’atelier', 'Technicien hydraulique', 'Technicien pneumatique', 'Mécanicien', 'Magasinier', 'Assistant administratif', 'Commercial', 'Stagiaire', 'Autre'];
const specialites = ['Hydraulique', 'Pneumatique', 'Confection de flexibles', 'Réparation de vérins', 'Réparation de pompes', 'Engins lourds', 'Camions', 'Maintenance industrielle', 'Diagnostic', 'Soudure', 'Stock/Magasin', 'Comptabilité', 'Administration', 'Relation client', 'Autre'];
const interventionStatus = ['planifiee', 'assignee', 'debut_intervention', 'en_cours', 'pause', 'fin_intervention', 'terminee', 'facturee', 'annulee'];
const demandeStatus = ['nouvelle', 'vue', 'en_traitement', 'convertie_client', 'convertie_devis', 'traitee', 'archivee'];

const $ = (id) => document.getElementById(id);
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

function permissionMatchesClient(granted, needed) {
  if (!granted || !needed) return false;
  if (granted === '*' || granted === needed) return true;
  if (granted.endsWith('.*')) {
    const prefix = granted.slice(0, -2);
    return needed === prefix || needed.startsWith(prefix + '.');
  }
  if (granted === '*.view' && needed.endsWith('.view')) return true;
  return false;
}

function hasUiPermission(needed) {
  if (!needed) return true;
  const permissions = Array.isArray(state.permissions) ? state.permissions : [];
  return permissions.some(p => permissionMatchesClient(p, needed));
}

function permissionForAdminTab(tab) {
  return {
    dashboard: 'dashboard.view',
    demandes: 'demandes_devis.view',
    clients: 'clients.view',
    engins: 'engins.view',
    produits: 'produits.view',
    services: 'services.view',
    interventions: 'interventions.view',
    documents: 'documents.view',
    galerieAdmin: 'galerie.view',
    equipeAdmin: 'equipe.view',
    journal: 'journal.view',
    usersAdmin: 'users.view',
    exports: 'exports.view'
  }[tab] || null;
}

function setAdminPermissions(user = {}) {
  state.permissions = Array.isArray(user.permissions) ? user.permissions : [];
  state.role = user.role || 'lecture_seule';
  applyAdminPermissions();
}

function applyAdminPermissions() {
  qsa('.admin-tab[data-admin]').forEach(btn => {
    const tab = btn.dataset.admin;
    const permission = permissionForAdminTab(tab);
    const allowed = !permission || hasUiPermission(permission);
    btn.classList.toggle('hidden', !allowed);
    btn.disabled = !allowed;
  });

  const active = qs('.admin-tab.active');
  if (active && active.classList.contains('hidden')) {
    const firstAllowed = qsa('.admin-tab[data-admin]').find(btn => !btn.classList.contains('hidden'));
    if (firstAllowed) firstAllowed.click();
  }
}


function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function money(value) {
  const n = Math.round(Number(String(value ?? 0).replace(/\s/g, '').replace(',', '.')) || 0);
  const formatted = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${formatted} FCFA`;
}
function getCookie(name) {
  return document.cookie.split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.split('=').slice(1).join('=') || '';
}
function formToObject(form) { return Object.fromEntries(new FormData(form).entries()); }
function normalizeText(v) { return String(v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function statusLabel(s) { return String(s || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()); }
async function api(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };
  const csrf = decodeURIComponent(getCookie('hydro_csrf'));
  if (csrf && !['GET', 'HEAD', 'OPTIONS'].includes(method) && url.startsWith('/api/') && !url.startsWith('/api/public/') && url !== '/api/auth/login') {
    headers['X-CSRF-Token'] = csrf;
  }
  const res = await fetch(url, { credentials: 'include', ...options, headers });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!res.ok) throw new Error(data.error || data.message || 'Erreur');
  return data;
}
async function jsonApi(url, method, body) { return api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
function toast(message) { alert(message); }
function optionList(items, valueKey = 'id', labelFn = x => x.nom, placeholder = 'Sélectionner') {
  return `<option value="">${placeholder}</option>` + (items || []).map(x => `<option value="${escapeHtml(x[valueKey])}">${escapeHtml(labelFn(x))}</option>`).join('');
}
function selectedMulti(select) { return [...(select?.selectedOptions || [])].map(o => o.value); }

function initMenu() {
  $('menuBtn')?.addEventListener('click', () => $('publicNav').classList.toggle('open'));
  qsa('#publicNav a').forEach(a => a.addEventListener('click', () => $('publicNav').classList.remove('open')));
  $('adminMenuBtn')?.addEventListener('click', () => qs('.admin-sidebar').classList.toggle('open'));
}
function showPublic() { $('publicHeader').classList.remove('hidden'); $('publicApp').classList.remove('hidden'); $('adminApp').classList.add('hidden'); }
function showLogin() {
  const publicHeader = $('publicHeader');
  const publicApp = $('publicApp');
  const adminApp = $('adminApp');
  const adminLogin = $('adminLogin');
  const adminPanel = $('adminPanel');

  publicHeader?.classList.add('hidden');
  publicApp?.classList.add('hidden');
  adminApp?.classList.remove('hidden');

  // Important : aucun contenu privé ne doit rester visible avant authentification.
  adminPanel?.classList.add('hidden');
  adminPanel?.setAttribute('aria-hidden', 'true');

  adminLogin?.classList.remove('hidden');
  adminLogin?.removeAttribute('aria-hidden');
}
function showAdminPanel() {
  const publicHeader = $('publicHeader');
  const publicApp = $('publicApp');
  const adminApp = $('adminApp');
  const adminLogin = $('adminLogin');
  const adminPanel = $('adminPanel');

  publicHeader?.classList.add('hidden');
  publicApp?.classList.add('hidden');
  adminApp?.classList.remove('hidden');

  adminLogin?.classList.add('hidden');
  adminLogin?.setAttribute('aria-hidden', 'true');

  adminPanel?.classList.remove('hidden');
  adminPanel?.removeAttribute('aria-hidden');

  applyAdminPermissions();
  activateAdminPage('dashboard');
}
async function detectRoute() {
  if (location.pathname.startsWith('/admin')) {
    try {
      const me = await api('/api/auth/me');
      state.admin = true;
      setAdminPermissions(me);
      $('adminUser').textContent = `${me.name || 'Admin'} • ${me.role || 'directeur'}`;
      showAdminPanel();
      await loadAdminBasics();
    } catch { showLogin(); }
  } else { showPublic(); await loadPublicData(); }
}

async function loadPublicData() {
  try {
    const [services, galerie, equipe] = await Promise.all([api('/api/public/services'), api('/api/public/galerie'), api('/api/public/equipe')]);
    renderPublicServices(services); renderPublicGallery(galerie); renderPublicTeam(equipe);
  } catch (e) { console.warn(e); }
}
function renderPublicServices(services) {
  const fallback = [
    { nom: 'Confection de flexible', description: 'Fabrication ou remplacement de flexibles hydrauliques.' },
    { nom: 'Réparation hydraulique', description: 'Diagnostic et réparation de systèmes hydrauliques.' },
    { nom: 'Réparation de vérin', description: 'Réparation de vérins et composants.' },
    { nom: 'Maintenance préventive', description: 'Entretien périodique des engins.' }
  ];
  const items = services?.length ? services.slice(0, 8) : fallback;
  $('publicServices').innerHTML = items.map(s => `<article class="card"><h3>${escapeHtml(s.nom)}</h3><p>${escapeHtml(s.description || 'Service professionnel HydroConnecto.')}</p></article>`).join('');
}
function renderPublicGallery(items) {
  if (!items?.length) { $('publicGallery').innerHTML = '<p class="meta">La galerie sera alimentée depuis l’espace admin.</p>'; return; }
  $('publicGallery').innerHTML = items.map(g => {
    const media = g.type_media === 'video' ? `<video src="${escapeHtml(g.url)}" controls></video>` : `<img src="${escapeHtml(g.url)}" alt="${escapeHtml(g.titre)}" />`;
    return `<article class="gallery-card">${media}<h3>${escapeHtml(g.titre)}</h3><p class="meta">${escapeHtml(g.categorie || '')}</p><p>${escapeHtml(g.description || '')}</p></article>`;
  }).join('');
}
function renderPublicTeam(items) {
  if (!items?.length) { $('publicTeam').innerHTML = '<p class="meta">La page équipe sera alimentée depuis l’espace admin.</p>'; return; }
  $('publicTeam').innerHTML = items.map(m => {
    const initials = (m.nom_complet || 'HC').split(' ').map(x => x[0]).join('').slice(0,2).toUpperCase();
    const img = m.photo_url ? `<img src="${escapeHtml(m.photo_url)}" alt="${escapeHtml(m.nom_complet)}" />` : `<div class="avatar-placeholder">${escapeHtml(initials)}</div>`;
    return `<article class="team-card">${img}<h3>${escapeHtml(m.nom_complet)}</h3><p class="eyebrow">${escapeHtml(m.fonction || '')}</p><p>${escapeHtml(m.description || '')}</p><p class="meta">${escapeHtml(m.specialites || '')}</p></article>`;
  }).join('');
}

function activateAdminPage(name) {
  qsa('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.admin === name));
  qsa('.admin-page').forEach(p => p.classList.toggle('active', p.id === `admin-${name}`));
  qs('.admin-sidebar')?.classList.remove('open');
  const loaders = { dashboard: loadDashboard, demandes: loadDemandes, clients: loadClients, engins: loadEngins, produits: loadProduits, services: loadServices, interventions: loadInterventions, documents: loadDocuments, galerieAdmin: loadGalerieAdmin, equipeAdmin: loadEquipeAdmin, journal: loadJournal, usersAdmin: loadUsersAdmin, exports: renderExports };
  loaders[name]?.();
}
async function loadAdminBasics() {
  await Promise.all([loadClients(), loadCategories(), loadProduits(), loadServices(), loadFactures(), loadEquipeAdmin(true), loadDemandes(true)]);
  updateSelects();
  await loadDashboard();
}
async function loadDashboard() {
  try {
    const d = await api('/api/dashboard');
    $('statsGrid').innerHTML = [
      ['Demandes', d.demandes], ['Nouvelles', d.nouvellesDemandes], ['Clients', d.clients], ['Produits', d.produits], ['Interventions', d.interventions], ['Factures', d.factures], ['CA', money(d.chiffreAffaires)], ['Impayés', money(d.impayes)]
    ].map(([k,v]) => `<div class="stat-card"><span>${k}</span><strong>${v}</strong></div>`).join('');
    $('stockFaible').innerHTML = d.stockFaible?.length ? d.stockFaible.map(p => `<p>${escapeHtml(p.nom)} — stock ${p.quantite_stock} / minimum ${p.stock_minimum}</p>`).join('') : '<p class="meta">Aucune alerte stock faible.</p>';
    $('dashboardAlerts').innerHTML = d.nouvellesDemandes ? `<p><strong>🔔 ${d.nouvellesDemandes} nouvelle(s) demande(s) de devis.</strong></p>` : '<p class="meta">Aucune nouvelle demande.</p>';
    updateDemandeBadge(d.nouvellesDemandes || 0);
  } catch(e) { console.warn(e); }
}
function updateDemandeBadge(count) {
  const b = $('demandeBadge'); if (!b) return;
  b.textContent = count;
  b.classList.toggle('hidden', !count);
}

async function loadCategories() { state.categories = await api('/api/categories'); updateSelects(); }
async function loadClients() { state.clients = await api('/api/clients'); renderClients(); updateSelects(); }
async function loadEngins(clientId) { state.engins = await api(clientId ? `/api/engins?client_id=${clientId}` : '/api/engins'); renderEngins(); updateSelects(); }
async function loadProduits() { state.produits = await api('/api/produits'); renderProduits(); updateSelects(); }
async function loadServices() { state.services = await api('/api/services'); renderServices(); updateSelects(); }
async function loadInterventions() { state.interventions = await api('/api/interventions'); renderInterventions(); }
async function loadFactures() { state.factures = await api('/api/factures'); updateSelects(); }
async function loadDevis() { state.devis = await api('/api/devis'); }
async function loadPaiements() { state.paiements = await api('/api/paiements'); }
async function loadDemandes(silent = false) { state.demandes = await api('/api/demandes-devis'); renderDemandes(); if (!silent) await loadDashboard(); }
async function loadJournal() { const limit = $('journalLimit')?.value || 50; state.journal = await api(`/api/journal?limit=${limit}`); renderJournal(); }

function updateSelects() {
  const clientOptions = optionList(state.clients, 'id', c => c.entreprise_nom || c.nom, 'Sélectionner un client');
  ['enginClientSelect','interventionClientSelect','documentClientSelect'].forEach(id => { if ($(id)) $(id).innerHTML = clientOptions; });
  if ($('categorieProduitSelect')) $('categorieProduitSelect').innerHTML = optionList(state.categories, 'id', c => c.nom, 'Sans catégorie');
  if ($('paiementFactureSelect')) $('paiementFactureSelect').innerHTML = optionList(state.factures, 'id', f => `${f.numero} — ${f.clients?.entreprise_nom || f.clients?.nom || 'Client'} — Solde ${money(f.solde)}`, 'Sélectionner facture');
  if ($('typeEnginSelect')) $('typeEnginSelect').innerHTML = optionList(enginTypes.map(x => ({ id: x, nom: x })), 'id', x => x.nom, 'Choisir un type');
  if ($('fonctionSelect')) $('fonctionSelect').innerHTML = optionList(fonctions.map(x => ({ id: x, nom: x })), 'id', x => x.nom, 'Choisir une fonction');
  if ($('specialitesSelect')) $('specialitesSelect').innerHTML = specialites.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  updateInterventionEngins();
}
function updateInterventionEngins() {
  const clientId = $('interventionClientSelect')?.value;
  const filtered = clientId ? state.engins.filter(e => e.client_id === clientId) : [];
  if ($('interventionEnginSelect')) $('interventionEnginSelect').innerHTML = optionList(filtered, 'id', e => `${e.type_engin} ${e.marque || ''} ${e.modele || ''}`.trim(), filtered.length ? 'Sélectionner un engin' : 'Aucun engin pour ce client');
}

function filtered(items, searchId, keys = []) {
  const term = normalizeText($(searchId)?.value || '');
  if (!term) return items;
  return items.filter(item => keys.some(k => normalizeText(typeof k === 'function' ? k(item) : item[k]).includes(term)));
}
function renderClients() {
  if (!$('clientsList')) return;
  let items = filtered(state.clients, 'clientSearch', ['nom','entreprise_nom','telephone','email','adresse','ville']);
  const sort = $('clientSort')?.value;
  if (sort === 'nom_asc') items.sort((a,b) => (a.entreprise_nom || a.nom || '').localeCompare(b.entreprise_nom || b.nom || ''));
  if (sort === 'nom_desc') items.sort((a,b) => (b.entreprise_nom || b.nom || '').localeCompare(a.entreprise_nom || a.nom || ''));
  $('clientsList').innerHTML = items.map(c => `<article class="item-card"><h3>${escapeHtml(c.entreprise_nom || c.nom)}</h3><p class="meta">${escapeHtml(c.telephone || '')} ${escapeHtml(c.email || '')}</p><p>${escapeHtml(c.adresse || '')}</p></article>`).join('') || '<p class="meta">Aucun client.</p>';
}
function renderEngins() {
  if (!$('enginsList')) return;
  const items = filtered(state.engins, 'enginSearch', ['type_engin','marque','modele','immatriculation', e => e.clients?.entreprise_nom || e.clients?.nom || '']);
  $('enginsList').innerHTML = items.map(e => `<article class="item-card"><h3>${escapeHtml(e.type_engin)} ${escapeHtml(e.marque || '')} ${escapeHtml(e.modele || '')}</h3><p class="meta">Client : ${escapeHtml(e.clients?.entreprise_nom || e.clients?.nom || '')}</p><p>Immatriculation : ${escapeHtml(e.immatriculation || '-')} | Heures : ${escapeHtml(e.heures_fonctionnement || '-')}</p></article>`).join('') || '<p class="meta">Aucun engin.</p>';
}
function renderProduits() {
  if (!$('produitsList')) return;
  let items = filtered(state.produits, 'produitSearch', ['nom','description', p => p.categories_produits?.nom || '']);
  const sort = $('produitSort')?.value;
  if (sort === 'stock_asc') items.sort((a,b) => Number(a.quantite_stock || 0) - Number(b.quantite_stock || 0));
  if (sort === 'prix_desc') items.sort((a,b) => Number(b.prix_unitaire || 0) - Number(a.prix_unitaire || 0));
  if (sort === 'nom_asc') items.sort((a,b) => (a.nom || '').localeCompare(b.nom || ''));
  $('produitsList').innerHTML = items.map(p => `<article class="item-card"><h3>${escapeHtml(p.nom)}</h3><p class="meta">${escapeHtml(p.categories_produits?.nom || 'Sans catégorie')} • ${money(p.prix_unitaire)} • Stock ${p.quantite_stock || 0}</p><p>${escapeHtml(p.description || '')}</p><div class="item-actions"><button class="btn small secondary" onclick="editProduit('${p.id}')">Modifier</button><button class="btn small danger" onclick="deleteProduit('${p.id}')">Archiver</button></div></article>`).join('') || '<p class="meta">Aucun produit.</p>';
}
function renderServices() {
  if (!$('servicesList')) return;
  const items = filtered(state.services, 'serviceSearch', ['nom','description','unite']);
  $('servicesList').innerHTML = items.map(s => `<article class="item-card"><h3>${escapeHtml(s.nom)}</h3><p class="meta">${money(s.prix_unitaire)} • ${escapeHtml(s.unite || 'service')}</p><p>${escapeHtml(s.description || '')}</p><div class="item-actions"><button class="btn small secondary" onclick="editService('${s.id}')">Modifier</button><button class="btn small danger" onclick="deleteService('${s.id}')">Archiver</button></div></article>`).join('') || '<p class="meta">Aucun service.</p>';
}
function renderInterventions() {
  if (!$('interventionsList')) return;
  let items = filtered(state.interventions, 'interventionSearch', ['numero','statut','probleme_signale', i => i.clients?.entreprise_nom || i.clients?.nom || '', i => i.engins?.type_engin || '']);
  const st = $('interventionFilter')?.value;
  if (st) items = items.filter(i => i.statut === st);
  $('interventionsList').innerHTML = items.map(i => {
    const intervenants = (i.intervenants || []).map(x => `${x.equipe_site?.nom_complet || 'Intervenant'} (${statusLabel(x.statut_intervention)})`).join(' • ');
    const pieces = (i.pieces || []).map(x => `${x.produits?.nom || 'Pièce'} x${x.quantite}`).join(' • ');
    return `<article class="item-card"><h3>${escapeHtml(i.numero)}</h3><p><span class="status-pill">${escapeHtml(statusLabel(i.statut))}</span></p><p class="meta">${escapeHtml(i.clients?.entreprise_nom || i.clients?.nom || '')} • ${escapeHtml(i.engins?.type_engin || '')}</p><p>${escapeHtml(i.probleme_signale || '')}</p><p class="meta"><strong>Intervenants :</strong> ${escapeHtml(intervenants || 'Non renseigné')}</p><p class="meta"><strong>Pièces :</strong> ${escapeHtml(pieces || 'Aucune')}</p></article>`;
  }).join('') || '<p class="meta">Aucune intervention.</p>';
}

function renderDemandes() {
  if (!$('demandesList')) return;
  let items = filtered(state.demandes, 'demandeSearch', ['nom_complet','telephone','besoin','statut']);
  const st = $('demandeFilter')?.value;
  if (st) items = items.filter(x => x.statut === st);
  $('demandesList').innerHTML = items.map(d => {
    const wa = `https://wa.me/${String(d.telephone || '').replace(/\D/g, '')}`;
    const audio = d.audio_url ? `<audio class="audio-player" src="${escapeHtml(d.audio_url)}" controls></audio>` : '<p class="meta">Aucun vocal</p>';
    return `<article class="item-card"><h3>${escapeHtml(d.nom_complet)}</h3><p><span class="status-pill ${d.statut === 'nouvelle' ? 'warn' : d.statut === 'traitee' ? 'ok' : ''}">${escapeHtml(statusLabel(d.statut))}</span></p><p class="meta">${escapeHtml(d.telephone)} • ${escapeHtml(new Date(d.created_at).toLocaleString('fr-FR'))}</p><p>${escapeHtml(d.besoin || '')}</p>${audio}<div class="item-actions"><a class="btn small primary" href="${wa}" target="_blank">WhatsApp</a><button class="btn small secondary" onclick="updateDemandeStatus('${d.id}','en_traitement')">En traitement</button><button class="btn small secondary" onclick="convertDemandeClient('${d.id}')">Créer client</button><button class="btn small success" onclick="updateDemandeStatus('${d.id}','traitee')">Traitée</button><button class="btn small danger" onclick="updateDemandeStatus('${d.id}','archivee')">Archiver</button></div></article>`;
  }).join('') || '<p class="meta">Aucune demande.</p>';
}
window.updateDemandeStatus = async function(id, statut){ await jsonApi(`/api/demandes-devis/${id}/status`, 'PUT', { statut }); await loadDemandes(); };
window.convertDemandeClient = async function(id){ await api(`/api/demandes-devis/${id}/convert-client`, { method: 'POST' }); await loadDemandes(); await loadClients(); toast('Client créé depuis la demande.'); };

window.editProduit = function(id) {
  const p = state.produits.find(x => x.id === id); if (!p) return;
  const f = $('produitForm'); f.id.value = p.id; f.nom.value = p.nom || ''; f.categorie_id.value = p.categorie_id || ''; f.unite.value = p.unite || 'unité'; f.prix_unitaire.value = p.prix_unitaire || 0; f.cout_achat.value = p.cout_achat || 0; f.quantite_stock.value = p.quantite_stock || 0; f.stock_minimum.value = p.stock_minimum || 0; f.description.value = p.description || '';
  $('produitSubmitBtn').textContent = 'Enregistrer modification'; $('produitCancelBtn').classList.remove('hidden');
};
window.deleteProduit = async function(id) { if (!confirm('Archiver ce produit ?')) return; await api(`/api/produits/${id}`, { method: 'DELETE' }); await loadProduits(); };
window.editService = function(id) { const s = state.services.find(x => x.id === id); if (!s) return; const f = $('serviceForm'); f.id.value = s.id; f.nom.value = s.nom || ''; f.unite.value = s.unite || 'service'; f.prix_unitaire.value = s.prix_unitaire || 0; f.description.value = s.description || ''; $('serviceSubmitBtn').textContent = 'Enregistrer modification'; $('serviceCancelBtn').classList.remove('hidden'); };
window.deleteService = async function(id) { if (!confirm('Archiver ce service ?')) return; await api(`/api/services/${id}`, { method: 'DELETE' }); await loadServices(); };
function resetProduitForm() { $('produitForm').reset(); $('produitForm').id.value = ''; $('produitSubmitBtn').textContent = '+ Ajouter produit'; $('produitCancelBtn').classList.add('hidden'); }
function resetServiceForm() { $('serviceForm').reset(); $('serviceForm').id.value = ''; $('serviceSubmitBtn').textContent = '+ Ajouter service'; $('serviceCancelBtn').classList.add('hidden'); }

function addIntervenantRow(row = {}) {
  const div = document.createElement('div');
  div.className = 'intervenant-row';
  div.innerHTML = `
    <label>Intervenant<select class="int-person">${optionList(state.equipe.filter(e => (e.statut || 'actif') === 'actif'), 'id', e => `${e.nom_complet} — ${e.fonction || ''}`, 'Choisir')}</select></label>
    <label>Rôle<select class="int-role"><option>Responsable intervention</option><option>Technicien hydraulique</option><option>Technicien pneumatique</option><option>Mécanicien</option><option>Assistant</option></select></label>
    <label>Statut<select class="int-status">${interventionStatus.map(s => `<option value="${s}">${statusLabel(s)}</option>`).join('')}</select></label>
    <label>Début<input class="int-start" type="datetime-local" /></label>
    <label>Fin<input class="int-end" type="datetime-local" /></label>
    <label>Notes<input class="int-notes" /></label>
    <button type="button" class="btn small danger">×</button>`;
  $('intervenantRows').appendChild(div);
  qs('.btn.danger', div).addEventListener('click', () => div.remove());
}
function collectIntervenants() {
  return qsa('.intervenant-row').map(r => ({
    equipe_id: qs('.int-person', r).value,
    role_intervention: qs('.int-role', r).value,
    statut_intervention: qs('.int-status', r).value,
    date_debut: qs('.int-start', r).value || null,
    date_fin: qs('.int-end', r).value || null,
    notes: qs('.int-notes', r).value || ''
  })).filter(x => x.equipe_id);
}
function addPieceRow() {
  const div = document.createElement('div');
  div.className = 'piece-row';
  div.innerHTML = `
    <label>Produit<select class="piece-product">${optionList(state.produits, 'id', p => `${p.nom} — stock ${p.quantite_stock || 0}`, 'Choisir')}</select></label>
    <label>Qté<input class="piece-qte" type="number" step="0.01" value="1" /></label>
    <label>Prix<input class="piece-price" type="number" step="0.01" value="0" /></label>
    <label>Notes<input class="piece-notes" /></label>
    <button type="button" class="btn small danger">×</button>`;
  $('pieceRows').appendChild(div);
  qs('.piece-product', div).addEventListener('change', () => { const p = state.produits.find(x => x.id === qs('.piece-product', div).value); if (p) qs('.piece-price', div).value = p.prix_unitaire || 0; });
  qs('.btn.danger', div).addEventListener('click', () => div.remove());
}
function collectPieces() {
  return qsa('.piece-row').map(r => ({
    produit_id: qs('.piece-product', r).value,
    quantite: qs('.piece-qte', r).value,
    prix_unitaire: qs('.piece-price', r).value,
    notes: qs('.piece-notes', r).value || ''
  })).filter(x => x.produit_id && Number(x.quantite) > 0);
}

function initForms() {
  $('publicQuoteForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('publicQuoteMessage');
    try {
      await api('/api/public/demandes-devis', { method: 'POST', body: new FormData(e.target) });
      e.target.reset();
      msg.textContent = 'Votre demande a été envoyée avec succès. HydroConnecto vous contactera bientôt.';
      msg.className = 'form-message ok';
    } catch(err) { msg.textContent = err.message; msg.className = 'form-message err'; }
  });
  $('loginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const me = await jsonApi('/api/auth/login', 'POST', formToObject(e.target));
      state.admin = true;
      setAdminPermissions(me.user || {});
      $('adminUser').textContent = `${me.user.name} • ${me.user.role}`;
      history.replaceState(null, '', '/admin');
      showAdminPanel();
      await loadAdminBasics();
    } catch(err) { toast(err.message); }
  });
  $('logoutBtn')?.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.warn('Déconnexion serveur non confirmée:', err.message);
    }
    state.admin = false;
    history.replaceState(null, '', '/admin/login');
    showLogin();
  });
  qsa('.admin-tab').forEach(b => b.addEventListener('click', () => activateAdminPage(b.dataset.admin)));

  $('clientForm')?.addEventListener('submit', async e => { e.preventDefault(); try { await jsonApi('/api/clients', 'POST', formToObject(e.target)); e.target.reset(); await loadClients(); toast('Client ajouté.'); } catch(err){ toast(err.message); } });
  $('enginForm')?.addEventListener('submit', async e => { e.preventDefault(); try { await jsonApi('/api/engins', 'POST', formToObject(e.target)); e.target.reset(); $('enginAutreWrap').classList.add('hidden'); await loadEngins(); toast('Engin ajouté.'); } catch(err){ toast(err.message); } });
  $('typeEnginSelect')?.addEventListener('change', e => $('enginAutreWrap').classList.toggle('hidden', e.target.value !== 'Autre'));
  $('fonctionSelect')?.addEventListener('change', e => $('fonctionAutreWrap').classList.toggle('hidden', e.target.value !== 'Autre'));

  $('produitForm')?.addEventListener('submit', async e => { e.preventDefault(); const data = formToObject(e.target); try { if (data.id) await jsonApi(`/api/produits/${data.id}`, 'PUT', data); else await jsonApi('/api/produits', 'POST', data); resetProduitForm(); await loadProduits(); toast('Produit enregistré.'); } catch(err){ toast(err.message); } });
  $('produitCancelBtn')?.addEventListener('click', resetProduitForm);
  $('serviceForm')?.addEventListener('submit', async e => { e.preventDefault(); const data = formToObject(e.target); try { if (data.id) await jsonApi(`/api/services/${data.id}`, 'PUT', data); else await jsonApi('/api/services', 'POST', data); resetServiceForm(); await loadServices(); toast('Service enregistré.'); } catch(err){ toast(err.message); } });
  $('serviceCancelBtn')?.addEventListener('click', resetServiceForm);

  $('interventionClientSelect')?.addEventListener('change', updateInterventionEngins);
  $('addIntervenantBtn')?.addEventListener('click', () => addIntervenantRow());
  $('addPieceBtn')?.addEventListener('click', () => addPieceRow());
  $('interventionForm')?.addEventListener('submit', async e => { e.preventDefault(); try { const body = { ...formToObject(e.target), intervenants: collectIntervenants(), pieces: collectPieces() }; await jsonApi('/api/interventions', 'POST', body); e.target.reset(); $('intervenantRows').innerHTML=''; $('pieceRows').innerHTML=''; await loadInterventions(); await loadProduits(); toast('Intervention créée.'); } catch(err){ toast(err.message); } });
  $('quickClientBtn')?.addEventListener('click', openQuickClientModal);
  $('quickEnginBtn')?.addEventListener('click', openQuickEnginModal);

  qsa('.doc-tab').forEach(b => b.addEventListener('click', () => setDocumentMode(b.dataset.doc)));
  $('addLineBtn')?.addEventListener('click', () => addDocumentLine());
  $('documentForm')?.addEventListener('input', updateTotalPreview);
  $('documentForm')?.addEventListener('submit', submitDocumentForm);

  $('galerieForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const data = new FormData(e.target);
      const id = data.get('id');
      const result = id
        ? await api(`/api/galerie/${id}`, { method: 'PUT', body: data })
        : await api('/api/galerie', { method: 'POST', body: data });
      resetGalerieForm();
      await loadGalerieAdmin();
      await loadPublicData();
      toast(result?.storage_warning || (id ? 'Média modifié.' : 'Média ajouté à la galerie.'));
    } catch(err){ toast(err.message); }
  });
  $('galerieCancelBtn')?.addEventListener('click', resetGalerieForm);
  $('equipeForm')?.addEventListener('submit', async e => { e.preventDefault(); try { const fd = new FormData(e.target); fd.set('specialites', getSelectedSpecialites().join(', ')); const id = fd.get('id'); await api(id ? `/api/equipe/${id}` : '/api/equipe', { method: id ? 'PUT' : 'POST', body: fd }); e.target.reset(); setSelectedSpecialites([]); await loadEquipeAdmin(); await loadPublicData(); toast('Membre enregistré.'); } catch(err){ toast(err.message); } });

  ['clientSearch','clientSort'].forEach(id => $(id)?.addEventListener('input', renderClients));
  ['enginSearch'].forEach(id => $(id)?.addEventListener('input', renderEngins));
  ['produitSearch','produitSort'].forEach(id => $(id)?.addEventListener('input', renderProduits));
  ['serviceSearch','serviceSort'].forEach(id => $(id)?.addEventListener('input', renderServices));
  ['enginSearch','enginSort'].forEach(id => $(id)?.addEventListener('input', renderEngins));
  ['galerieSearch','galerieSort'].forEach(id => $(id)?.addEventListener('input', renderGalerieAdmin));
  ['interventionSearch','interventionFilter'].forEach(id => $(id)?.addEventListener('input', renderInterventions));
  ['demandeSearch','demandeFilter'].forEach(id => $(id)?.addEventListener('input', renderDemandes));
  ['journalSearch'].forEach(id => $(id)?.addEventListener('input', renderJournal));
  $('journalLimit')?.addEventListener('change', loadJournal);
  $('equipeFilter')?.addEventListener('change', renderEquipeAdmin);
}

function setDocumentMode(mode) {
  state.documentMode = mode;
  qsa('.doc-tab').forEach(b => b.classList.toggle('active', b.dataset.doc === mode));
  $('documentsHistory').classList.toggle('hidden', mode !== 'historique');
  $('documentForm').classList.toggle('hidden', mode === 'historique');
  $('documentSuccess').classList.add('hidden');
  if (mode === 'historique') { renderDocumentsHistory(); return; }
  $('documentForm').mode.value = mode;
  qsa('.recu-only').forEach(x => x.classList.toggle('hidden', mode !== 'recu'));
  qsa('.not-recu').forEach(x => x.classList.toggle('hidden', mode === 'recu'));
  qsa('.facture-only').forEach(x => x.classList.toggle('hidden', mode !== 'facture'));
  $('documentSubmitBtn').textContent = mode === 'facture' ? 'Créer la facture' : mode === 'devis' ? 'Créer le devis' : 'Créer le reçu';
  if (mode !== 'recu' && !$('documentLines').children.length) addDocumentLine();
  updateTotalPreview();
}
function addDocumentLine(line = {}) {
  const div = document.createElement('div');
  div.className = 'line-row';
  div.innerHTML = `<label>Type<select class="line-type"><option value="service">Service</option><option value="produit">Produit</option></select></label><label>Désignation<select class="line-designation"></select></label><label>Qté<input class="line-qte" type="number" step="0.01" value="${line.quantite || 1}" /></label><label>Prix<input class="line-prix" type="number" step="0.01" value="${line.prix_unitaire || 0}" /></label><label>Remise<input class="line-remise" type="number" step="0.01" value="${line.remise || 0}" /></label><button type="button" class="btn small danger">×</button>`;
  $('documentLines').appendChild(div);
  const type = qs('.line-type', div); const des = qs('.line-designation', div);
  type.addEventListener('change', () => fillLineOptions(div));
  des.addEventListener('change', () => applySelectedLine(div));
  div.addEventListener('input', updateTotalPreview);
  qs('.btn.danger', div).addEventListener('click', () => { div.remove(); updateTotalPreview(); });
  fillLineOptions(div);
}
function fillLineOptions(row) {
  const type = qs('.line-type', row).value;
  const items = type === 'produit' ? state.produits : state.services;
  qs('.line-designation', row).innerHTML = optionList(items, 'id', x => `${x.nom} — ${money(x.prix_unitaire)}`, 'Choisir');
}
function applySelectedLine(row) { const type = qs('.line-type', row).value; const id = qs('.line-designation', row).value; const item = (type === 'produit' ? state.produits : state.services).find(x => x.id === id); if (item) qs('.line-prix', row).value = item.prix_unitaire || 0; updateTotalPreview(); }
function collectLines() {
  return qsa('.line-row').map(row => {
    const type = qs('.line-type', row).value;
    const id = qs('.line-designation', row).value;
    const item = (type === 'produit' ? state.produits : state.services).find(x => x.id === id);
    return { type_ligne: type, produit_id: type === 'produit' ? id || null : null, service_id: type === 'service' ? id || null : null, designation: item?.nom || 'Ligne manuelle', quantite: qs('.line-qte', row).value, prix_unitaire: qs('.line-prix', row).value, remise: qs('.line-remise', row).value };
  }).filter(l => l.designation && Number(l.quantite) > 0);
}
function updateTotalPreview() {
  if (!$('totalPreview')) return;
  const form = $('documentForm');
  const lines = collectLines();
  const sous = lines.reduce((s,l)=>s + Number(l.quantite||0)*Number(l.prix_unitaire||0)-Number(l.remise||0),0);
  const remise = Number(form.remise?.value || 0);
  const pct = form.taxe_pourcentage?.value === '' ? 0 : Number(form.taxe_pourcentage?.value || 0);
  const taxable = Math.max(0, sous - remise);
  const taxe = Math.round(taxable * pct / 100);
  const total = taxable + taxe;
  const paye = Number(form.montant_paye?.value || 0);
  $('totalPreview').innerHTML = state.documentMode === 'recu' ? 'Le reçu enregistre uniquement le paiement.' : `Sous-total : ${money(sous)} | Remise : ${money(remise)} | Taxe : ${pct || 0}% = ${money(taxe)} | Total : ${money(total)}${state.documentMode === 'facture' ? ' | Solde : ' + money(Math.max(0,total-paye)) : ''}`;
}
async function submitDocumentForm(e) {
  e.preventDefault();
  try {
    const form = e.target; const base = formToObject(form); const mode = state.documentMode; let data;
    if (mode === 'facture' || mode === 'devis') { const dateField = mode === 'facture' ? 'date_facture' : 'date_devis'; data = await jsonApi(`/api/${mode === 'facture' ? 'factures' : 'devis'}`, 'POST', { ...base, [dateField]: base.date, lignes: collectLines() }); }
    else { data = await jsonApi('/api/paiements', 'POST', { ...base, date_paiement: base.date }); }
    form.reset(); $('documentLines').innerHTML = ''; if (mode !== 'recu') addDocumentLine(); await loadDocuments(); showDocumentSuccess(mode, data);
  } catch(err) { toast(err.message); }
}
function showDocumentSuccess(mode, data) {
  const type = mode === 'facture' ? 'factures' : mode === 'devis' ? 'devis' : 'paiements';
  const pdf = `/api/pdf/${type}/${data.id}`;
  const label = mode === 'facture' ? 'Facture' : mode === 'devis' ? 'Devis' : 'Reçu';
  $('documentSuccess').classList.remove('hidden');
  $('documentSuccess').innerHTML = `<h3>${label} créé avec succès.</h3><p>Utilise les boutons ci-dessous.</p><div class="item-actions"><a class="btn primary" target="_blank" href="${pdf}">Voir PDF</a><a class="btn secondary" download href="${pdf}">Télécharger PDF</a><button class="btn secondary" onclick="setDocumentMode('${mode}')">Créer un autre</button><button class="btn secondary" onclick="setDocumentMode('historique')">Voir historique</button></div>`;
}
async function loadDocuments() { await Promise.all([loadFactures(), loadDevis(), loadPaiements()]); }
async function renderDocumentsHistory() {
  await loadDocuments();
  const f = state.factures.map(x => ({ type: 'factures', label: 'Facture', id: x.id, numero: x.numero, total: x.total, client: x.clients?.entreprise_nom || x.clients?.nom || '' }));
  const d = state.devis.map(x => ({ type: 'devis', label: 'Devis', id: x.id, numero: x.numero, total: x.total, client: x.clients?.entreprise_nom || x.clients?.nom || '' }));
  const r = state.paiements.map(x => ({ type: 'paiements', label: 'Reçu', id: x.id, numero: x.numero_recu, total: x.montant, client: x.factures?.clients?.entreprise_nom || x.factures?.clients?.nom || '' }));
  $('documentsHistory').innerHTML = [...f, ...d, ...r].map(x => `<article class="item-card"><h3>${x.label} ${escapeHtml(x.numero)}</h3><p class="meta">${escapeHtml(x.client)} • Montant : ${money(x.total)}</p><a class="btn small primary" target="_blank" href="/api/pdf/${x.type}/${x.id}">PDF</a></article>`).join('') || '<p class="meta">Aucun document.</p>';
}

async function loadGalerieAdmin() {
  state.galerie = await api('/api/galerie');
  renderGalerieAdmin();
}

window.deleteGalerie = async function(id){ if(!confirm('Supprimer ce média ?')) return; await api(`/api/galerie/${id}`, { method:'DELETE' }); await loadGalerieAdmin(); await loadPublicData(); };

async function loadEquipeAdmin(silent = false) { state.equipe = await api('/api/equipe'); renderEquipeAdmin(); updateSelects(); if (!silent) await loadPublicData(); }
function renderEquipeAdmin() {
  const filter = $('equipeFilter')?.value || '';
  let items = [...state.equipe];
  if (filter === 'visible') items = items.filter(x => x.visible);
  if (filter === 'masque') items = items.filter(x => !x.visible);
  if (filter === 'actif') items = items.filter(x => (x.statut || 'actif') === 'actif');
  if (filter === 'inactif') items = items.filter(x => (x.statut || '') === 'inactif');
  $('equipeAdminList').innerHTML = items.map(m => `<article class="team-card">${m.photo_url ? `<img src="${escapeHtml(m.photo_url)}" />` : `<div class="avatar-placeholder">${escapeHtml((m.nom_complet||'HC').slice(0,2).toUpperCase())}</div>`}<h3>${escapeHtml(m.nom_complet)}</h3><p class="eyebrow">${escapeHtml(m.fonction || '')}</p><p class="meta">Statut : ${escapeHtml(m.statut || 'actif')} | Visible : ${m.visible ? 'Oui' : 'Non'}</p><p>${escapeHtml(m.description || '')}</p><p class="meta">${escapeHtml(m.specialites || '')}</p><button class="btn small ${m.visible ? 'danger' : 'success'}" onclick="toggleEquipe('${m.id}', ${m.visible ? 'false' : 'true'})">${m.visible ? 'Masquer' : 'Réafficher'}</button></article>`).join('') || '<p class="meta">Aucun membre.</p>';
}
window.toggleEquipe = async function(id, visible){ await jsonApi(`/api/equipe/${id}/visibility`, 'PUT', { visible }); await loadEquipeAdmin(); };

function renderJournal() {
  if (!$('journalList')) return;
  const items = filtered(state.journal, 'journalSearch', ['action','table_concernee','utilisateur_nom','utilisateur_role']);
  $('journalList').innerHTML = items.map(j => `<article class="log-card"><h3>${escapeHtml(j.action)}</h3><p class="meta">${escapeHtml(new Date(j.created_at).toLocaleString('fr-FR'))} • ${escapeHtml(j.utilisateur_nom || 'Admin')} • ${escapeHtml(j.utilisateur_role || '')}</p><p>Module : <strong>${escapeHtml(j.table_concernee || '-')}</strong></p><p class="meta">${escapeHtml(JSON.stringify(j.details || {}))}</p></article>`).join('') || '<p class="meta">Aucune action enregistrée.</p>';
}
function renderExports() {
  const resources = [ ['clients','Clients'], ['factures','Factures'], ['paiements','Paiements / reçus'], ['interventions','Interventions'], ['stock','Stock / produits'], ['demandes','Demandes de devis'], ['journal','Journal des actions'] ];
  $('exportGrid').innerHTML = resources.map(([key, label]) => `<div class="export-card"><h3>${label}</h3><div class="item-actions"><a class="btn small secondary" href="/api/export/${key}.csv">CSV</a><a class="btn small secondary" href="/api/export/${key}.xls">Excel</a><a class="btn small primary" href="/api/export/${key}.pdf">PDF</a></div></div>`).join('');
}

function openQuickClientModal() {
  $('quickModalContent').innerHTML = `<h2>Nouveau client rapide</h2><form id="quickClientForm" class="form-grid"><label>Nom<input name="nom" required></label><label>Téléphone<input name="telephone"></label><label class="span-2">Adresse<input name="adresse"></label><button class="btn primary">Ajouter</button><button type="button" class="btn secondary" onclick="quickModal.close()">Annuler</button></form>`;
  $('quickModal').showModal();
  $('quickClientForm').addEventListener('submit', async e => { e.preventDefault(); await jsonApi('/api/clients', 'POST', formToObject(e.target)); await loadClients(); $('quickModal').close(); });
}
function openQuickEnginModal() {
  const clientId = $('interventionClientSelect').value;
  if (!clientId) return toast('Choisis d’abord un client.');
  $('quickModalContent').innerHTML = `<h2>Nouvel engin rapide</h2><form id="quickEnginForm" class="form-grid"><input type="hidden" name="client_id" value="${escapeHtml(clientId)}"><label>Type<select name="type_engin" id="quickTypeEngin">${optionList(enginTypes.map(x=>({id:x,nom:x})), 'id', x=>x.nom, 'Choisir')}</select></label><label id="quickAutreWrap" class="hidden">Nom personnalisé<input name="type_engin_autre"></label><label>Marque<input name="marque"></label><label>Modèle<input name="modele"></label><button class="btn primary">Ajouter</button><button type="button" class="btn secondary" onclick="quickModal.close()">Annuler</button></form>`;
  $('quickModal').showModal();
  $('quickTypeEngin').addEventListener('change', e => $('quickAutreWrap').classList.toggle('hidden', e.target.value !== 'Autre'));
  $('quickEnginForm').addEventListener('submit', async e => { e.preventDefault(); await jsonApi('/api/engins', 'POST', formToObject(e.target)); await loadEngins(clientId); $('quickModal').close(); updateInterventionEngins(); });
}

function init() {
  initMenu(); initForms(); updateSelects(); detectRoute();
  if ($('documentLines')) addDocumentLine();
}
// init delayed until v2.2.2.6 overrides are declared

// === HydroConnecto v2.2.2.6 overrides: services, galerie, spécialités, users ===
const serviceImageMapV221 = {
  'diagnostic': '/assets/services/diagnostic.png',
  'confection de flexible': '/assets/services/confection-flexible.png',
  'confection flexible': '/assets/services/confection-flexible.png',
  'réparation de pompe': '/assets/services/reparation-pompe.png',
  'reparation de pompe': '/assets/services/reparation-pompe.png',
  'maintenance corrective': '/assets/services/maintenance-corrective.png',
  'maintenance préventive': '/assets/services/maintenance-preventive.png',
  'maintenance preventive': '/assets/services/maintenance-preventive.png',
  'main-d’œuvre': '/assets/services/main-oeuvre.png',
  'main-d’oeuvre': '/assets/services/main-oeuvre.png',
  'main-d\'oeuvre': '/assets/services/main-oeuvre.png',
  'installation hydraulique': '/assets/services/installation-hydraulique.png',
  'installation pneumatique': '/assets/services/installation-pneumatique.png'
};
function serviceImg(s) {
  const name = normalizeText(s.nom || '');
  for (const [k, v] of Object.entries(serviceImageMapV221)) if (name.includes(normalizeText(k))) return s.image_url || v;
  return s.image_url || '/assets/services/diagnostic.png';
}
function renderPublicServices(services) {
  const fallback = [
    { nom: 'Diagnostic', categorie: 'Atelier / Terrain', description: 'Identifier rapidement la panne pour mieux la résoudre. Nos services de diagnostic hydraulique et pneumatique permettent de détecter efficacement les anomalies, pertes de pression ou dysfonctionnements.' },
    { nom: 'Confection de flexible', categorie: 'Atelier / Sur site', description: 'Des flexibles sur mesure, fiables et durables. Nous réalisons la fabrication et le remplacement de flexibles hydrauliques avec précision, rapidité et professionnalisme.' },
    { nom: 'Réparation de pompe', categorie: 'Atelier', description: 'Une réparation soignée pour retrouver toute la puissance de vos équipements. Chaque intervention est réalisée avec attention afin de restaurer la performance du système.' },
    { nom: 'Maintenance corrective', categorie: 'Atelier / Terrain', description: 'Intervenir vite pour remettre vos équipements en état et minimiser l’immobilisation avec une réparation fiable et durable.' },
    { nom: 'Maintenance préventive', categorie: 'Atelier / Terrain', description: 'Prévenir les pannes avant qu’elles ne surviennent grâce à un suivi régulier et un entretien périodique des engins et systèmes.' },
    { nom: 'Main-d’œuvre', categorie: 'Atelier / Terrain', description: 'Une équipe compétente à votre service pour les projets, interventions et travaux techniques.' },
    { nom: 'Installation hydraulique', categorie: 'Atelier / Terrain', description: 'Une installation fiable pour des performances durables, avec rigueur, précision et respect des normes de sécurité.' },
    { nom: 'Installation pneumatique', categorie: 'Atelier / Terrain', description: 'Des systèmes pneumatiques bien installés pour un fonctionnement optimal, efficace et sécurisé.' }
  ];
  const items = services?.length ? services.slice(0, 8) : fallback;
  $('publicServices').innerHTML = items.map(s => `<article class="service-card-full"><div class="service-image-box"><img src="${escapeHtml(serviceImg(s))}" alt="${escapeHtml(s.nom)}"></div><div class="service-content"><h3>${escapeHtml(s.nom)}</h3><p class="service-category">${escapeHtml(s.categorie || 'Atelier / Terrain')}</p><p>${escapeHtml(s.description || 'Service professionnel HydroConnecto.')}</p><a class="btn primary service-btn" href="#devis-public">Demander un devis</a></div></article>`).join('');
}
function renderPublicGallery(items) {
  if (!items?.length) { $('publicGallery').innerHTML = '<p class="meta">La galerie sera alimentée depuis l’espace admin.</p>'; return; }
  $('publicGallery').innerHTML = items.map(g => {
    const mediaUrl = g.url || g.url_fichier || g.public_url;
    const media = g.type_media === 'video' ? `<div class="gallery-media"><video src="${escapeHtml(mediaUrl)}" controls preload="metadata"></video></div>` : `<div class="gallery-media"><img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(g.titre || '')}" /></div>`;
    return `<article class="gallery-card">${media}<h3>${escapeHtml(g.titre)}</h3><p class="meta">${escapeHtml(g.categorie || '')}</p><p>${escapeHtml(g.description || '')}</p><a class="media-open-link" href="${escapeHtml(mediaUrl)}" target="_blank" rel="noreferrer">Voir en grand</a></article>`;
  }).join('');
}
function renderGalerieAdmin() {
  if (!$('galerieAdminList')) return;
  $('galerieAdminList').innerHTML = (state.galerie || []).map(g => {
    const mediaUrl = g.url || g.url_fichier || g.public_url;
    const media = g.type_media === 'video' ? `<div class="gallery-media"><video src="${escapeHtml(mediaUrl)}" controls></video></div>` : `<div class="gallery-media"><img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(g.titre || '')}" /></div>`;
    return `<article class="gallery-card">${media}<h3>${escapeHtml(g.titre)}</h3><p class="meta">${escapeHtml(g.categorie || '')}</p><p>${escapeHtml(g.description || '')}</p><div class="item-actions"><a class="btn small secondary" href="${escapeHtml(mediaUrl)}" target="_blank">Voir en grand</a><button class="btn small danger" onclick="deleteGalerie('${g.id}')">Supprimer</button></div></article>`;
  }).join('') || '<p class="meta">Aucun média.</p>';
}

function initSpecialitesUI() {
  const wrap = $('specialitesCheckboxes'); if (!wrap) return;
  wrap.innerHTML = specialites.map(s => `<label class="chip-check"><input type="checkbox" value="${escapeHtml(s)}"> ${escapeHtml(s)}</label>`).join('');
  qsa('input[type="checkbox"]', wrap).forEach(cb => cb.addEventListener('change', updateSpecialitesChips));
  updateSpecialitesChips();
}
function getSelectedSpecialites() { return qsa('#specialitesCheckboxes input:checked').map(cb => cb.value); }
function setSelectedSpecialites(values = []) {
  const set = new Set(Array.isArray(values) ? values.map(x => String(x).trim()) : String(values || '').split(',').map(x => x.trim()).filter(Boolean));
  qsa('#specialitesCheckboxes input').forEach(cb => cb.checked = set.has(cb.value));
  updateSpecialitesChips();
}
function updateSpecialitesChips() {
  const selected = getSelectedSpecialites();
  if ($('specialitesHidden')) $('specialitesHidden').value = selected.join(', ');
  if ($('selectedSpecialitesChips')) $('selectedSpecialitesChips').innerHTML = selected.length ? selected.map(s => `<span class="selected-chip">${escapeHtml(s)} <button type="button" onclick="removeSpecialite('${escapeHtml(s)}')">×</button></span>`).join('') : '<span class="meta">Aucune spécialité sélectionnée.</span>';
}
window.removeSpecialite = function(value) { qsa('#specialitesCheckboxes input').forEach(cb => { if (cb.value === value) cb.checked = false; }); updateSpecialitesChips(); };

async function loadUsersAdmin() { try { state.users = await api('/api/users'); renderUsersAdmin(); } catch(e) { if ($('usersAdminList')) $('usersAdminList').innerHTML = `<p class="meta">${escapeHtml(e.message || 'Module utilisateurs non disponible.')}</p>`; } }
function renderUsersAdmin() {
  if (!$('usersAdminList')) return;
  let items = filtered(state.users || [], 'userSearch', ['nom_complet','email','role','statut']);
  const st = $('userStatusFilter')?.value; if (st) items = items.filter(u => u.statut === st);
  $('usersAdminList').innerHTML = items.map(u => `<article class="item-card"><h3>${escapeHtml(u.nom_complet)}</h3><p class="meta">${escapeHtml(u.email)} • ${escapeHtml(u.role)} • <strong>${escapeHtml(u.statut)}</strong></p><div class="item-actions"><button class="btn small success" onclick="updateUserStatus('${u.id}','approuve')">Approuver</button><button class="btn small secondary" onclick="updateUserStatus('${u.id}','suspendu')">Suspendre</button><button class="btn small danger" onclick="updateUserStatus('${u.id}','desactive')">Désactiver</button></div></article>`).join('') || '<p class="meta">Aucun utilisateur.</p>';
}
window.updateUserStatus = async function(id, statut) { await jsonApi(`/api/users/${id}/status`, 'PUT', { statut }); await loadUsersAdmin(); toast('Statut utilisateur mis à jour.'); };

// compléments d'initialisation v2.2.2.6
setTimeout(() => {
  initSpecialitesUI();
  $('userAccountForm')?.addEventListener('submit', async e => { e.preventDefault(); try { await jsonApi('/api/users', 'POST', formToObject(e.target)); e.target.reset(); await loadUsersAdmin(); toast('Compte créé / en attente.'); } catch(err){ toast(err.message); } });
  ['userSearch','userStatusFilter'].forEach(id => $(id)?.addEventListener('input', renderUsersAdmin));
}, 0);

// === v2.2.2.6 admin action overrides ===
function resetClientForm(){ const f=$('clientForm'); if(!f) return; f.reset(); f.id.value=''; $('clientSubmitBtn') && ($('clientSubmitBtn').textContent='+ Ajouter client'); $('clientCancelBtn')?.classList.add('hidden'); }
function resetEnginForm(){ const f=$('enginForm'); if(!f) return; f.reset(); f.id.value=''; $('enginSubmitBtn') && ($('enginSubmitBtn').textContent='+ Ajouter engin'); $('enginCancelBtn')?.classList.add('hidden'); }
window.editClient=function(id){ const c=state.clients.find(x=>x.id===id); if(!c) return; const f=$('clientForm'); f.id.value=c.id; f.nom.value=c.entreprise_nom||c.nom||''; f.telephone.value=c.telephone||''; f.email.value=c.email||''; f.ville.value=c.ville||''; f.adresse.value=c.adresse||''; f.observations.value=c.observations||''; $('clientSubmitBtn').textContent='Enregistrer modification'; $('clientCancelBtn').classList.remove('hidden'); f.scrollIntoView({behavior:'smooth',block:'start'}); };
window.deleteClient=async function(id){ if(!confirm('Archiver ce client ?')) return; await api(`/api/clients/${id}`,{method:'DELETE'}); await loadClients(); toast('Client archivé.'); };
window.editEngin=function(id){ const e=state.engins.find(x=>x.id===id); if(!e) return; const f=$('enginForm'); f.id.value=e.id; f.client_id.value=e.client_id||''; f.type_engin.value=enginTypes.includes(e.type_engin)?e.type_engin:'Autre'; if(f.type_engin.value==='Autre'){ $('enginAutreWrap').classList.remove('hidden'); f.type_engin_autre.value=e.type_engin||''; } f.marque.value=e.marque||''; f.modele.value=e.modele||''; f.annee.value=e.annee||''; f.numero_serie.value=e.numero_serie||''; f.immatriculation.value=e.immatriculation||''; f.kilometrage.value=e.kilometrage||0; f.heures_fonctionnement.value=e.heures_fonctionnement||0; f.observations.value=e.observations||''; $('enginSubmitBtn').textContent='Enregistrer modification'; $('enginCancelBtn').classList.remove('hidden'); f.scrollIntoView({behavior:'smooth',block:'start'}); };
window.deleteEngin=async function(id){ if(!confirm('Archiver cet engin ?')) return; await api(`/api/engins/${id}`,{method:'DELETE'}); await loadEngins(); toast('Engin archivé.'); };
window.archiveIntervention=async function(id){ if(!confirm('Archiver / annuler cette intervention ?')) return; await jsonApi(`/api/interventions/${id}/status`,'PUT',{statut:'annulee'}); await loadInterventions(); };

const originalInitFormsV221 = initForms;
initForms = function(){
  originalInitFormsV221();
  $('clientCancelBtn')?.addEventListener('click', resetClientForm);
  $('enginCancelBtn')?.addEventListener('click', resetEnginForm);
  const cf=$('clientForm'); if(cf) cf.addEventListener('submit', async e=>{ const id=cf.id?.value; if(!id) return; e.preventDefault(); try{ await jsonApi(`/api/clients/${id}`,'PUT',formToObject(cf)); resetClientForm(); await loadClients(); toast('Client modifié.'); }catch(err){ toast(err.message); } }, true);
  const ef=$('enginForm'); if(ef) ef.addEventListener('submit', async e=>{ const id=ef.id?.value; if(!id) return; e.preventDefault(); try{ await jsonApi(`/api/engins/${id}`,'PUT',formToObject(ef)); resetEnginForm(); await loadEngins(); toast('Engin modifié.'); }catch(err){ toast(err.message); } }, true);
};
function renderClients() {
  if (!$('clientsList')) return;
  let items = filtered(state.clients, 'clientSearch', ['nom','entreprise_nom','telephone','email','adresse','ville']);
  const sort = $('clientSort')?.value;
  if (sort === 'nom_asc') items.sort((a,b) => (a.entreprise_nom || a.nom || '').localeCompare(b.entreprise_nom || b.nom || ''));
  if (sort === 'nom_desc') items.sort((a,b) => (b.entreprise_nom || b.nom || '').localeCompare(a.entreprise_nom || a.nom || ''));
  $('clientsList').innerHTML = items.map(c => `<article class="item-card"><h3>${escapeHtml(c.entreprise_nom || c.nom)}</h3><p class="meta">${escapeHtml(c.telephone || '')} ${escapeHtml(c.email || '')}</p><p>${escapeHtml(c.adresse || '')}</p><div class="item-actions"><button class="btn small secondary" onclick="editClient('${c.id}')">Modifier</button><button class="btn small danger" onclick="deleteClient('${c.id}')">Archiver</button></div></article>`).join('') || '<p class="meta">Aucun client.</p>';
}
function renderEngins() {
  if (!$('enginsList')) return;
  const items = filtered(state.engins, 'enginSearch', ['type_engin','marque','modele','immatriculation', e => e.clients?.entreprise_nom || e.clients?.nom || '']);
  $('enginsList').innerHTML = items.map(e => `<article class="item-card"><h3>${escapeHtml(e.type_engin)} ${escapeHtml(e.marque || '')} ${escapeHtml(e.modele || '')}</h3><p class="meta">Client : ${escapeHtml(e.clients?.entreprise_nom || e.clients?.nom || '')}</p><p>Immatriculation : ${escapeHtml(e.immatriculation || '-')} | Heures : ${escapeHtml(e.heures_fonctionnement || '-')}</p><div class="item-actions"><button class="btn small secondary" onclick="editEngin('${e.id}')">Modifier</button><button class="btn small danger" onclick="deleteEngin('${e.id}')">Archiver</button></div></article>`).join('') || '<p class="meta">Aucun engin.</p>';
}
function renderInterventions() {
  if (!$('interventionsList')) return;
  let items = filtered(state.interventions, 'interventionSearch', ['numero','statut','probleme_signale', i => i.clients?.entreprise_nom || i.clients?.nom || '', i => i.engins?.type_engin || '']);
  const st = $('interventionFilter')?.value;
  if (st) items = items.filter(i => i.statut === st);
  $('interventionsList').innerHTML = items.map(i => { const intervenants=(i.intervenants||[]).map(x=>`${x.equipe_site?.nom_complet||'Intervenant'} (${statusLabel(x.statut_intervention)})`).join(' • '); const pieces=(i.pieces||[]).map(x=>`${x.produits?.nom||'Pièce'} x${x.quantite}`).join(' • '); return `<article class="item-card"><h3>${escapeHtml(i.numero)}</h3><p><span class="status-pill">${escapeHtml(statusLabel(i.statut))}</span></p><p class="meta">${escapeHtml(i.clients?.entreprise_nom || i.clients?.nom || '')} • ${escapeHtml(i.engins?.type_engin || '')}</p><p>${escapeHtml(i.probleme_signale || '')}</p><p class="meta"><strong>Intervenants :</strong> ${escapeHtml(intervenants || 'Non renseigné')}</p><p class="meta"><strong>Pièces :</strong> ${escapeHtml(pieces || 'Aucune')}</p><div class="item-actions"><button class="btn small secondary" onclick="jsonApi('/api/interventions/${i.id}/status','PUT',{statut:'en_cours'}).then(loadInterventions)">En cours</button><button class="btn small success" onclick="jsonApi('/api/interventions/${i.id}/status','PUT',{statut:'terminee'}).then(loadInterventions)">Terminer</button><button class="btn small danger" onclick="archiveIntervention('${i.id}')">Archiver/Annuler</button></div></article>`; }).join('') || '<p class="meta">Aucune intervention.</p>';
}



// === HOTFIX v2.2.2.6.1 : services exacts + actions admin galerie/services/engins ===
const HYDRO_SERVICE_ORDER = [
  { key:'diagnostic', nom:'Diagnostic', categorie:'Atelier / Terrain', image:'/assets/services/diagnostic.png', description:'Identifier rapidement la panne pour mieux la résoudre. Nos services de diagnostic hydraulique et pneumatique permettent de détecter efficacement les anomalies, pertes de pression ou dysfonctionnements. Nous vous aidons à trouver la bonne solution dès le départ, afin d’éviter les arrêts prolongés et les coûts inutiles.' },
  { key:'confection de flexible', nom:'Confection de flexible', categorie:'Atelier / Sur site', image:'/assets/services/confection-flexible.png', description:'Des flexibles sur mesure, fiables et durables. Nous réalisons la fabrication et le remplacement de flexibles hydrauliques avec précision, rapidité et professionnalisme. Grâce à notre savoir-faire, vous bénéficiez de solutions adaptées à vos équipements pour garantir performance, sécurité et continuité de travail.' },
  { key:'réparation de pompe', nom:'Réparation de pompe', categorie:'Atelier', image:'/assets/services/reparation-pompe.png', description:'Une réparation soignée pour retrouver toute la puissance de vos équipements. Nous intervenons sur la réparation de pompes hydrauliques avec précision, expertise et professionnalisme afin de restaurer la performance de votre système et garantir une solution fiable et durable.' },
  { key:'maintenance corrective', nom:'Maintenance corrective', categorie:'Atelier / Terrain', image:'/assets/services/maintenance-corrective.png', description:'Intervenir vite pour remettre vos équipements en état. En cas de panne ou de dysfonctionnement, nous réalisons les réparations nécessaires afin de rétablir rapidement le bon fonctionnement de vos systèmes et minimiser l’immobilisation de vos équipements.' },
  { key:'maintenance préventive', nom:'Maintenance préventive', categorie:'Atelier / Terrain', image:'/assets/services/maintenance-preventive.png', description:'Prévenir les pannes avant qu’elles ne surviennent. La maintenance préventive permet d’assurer l’entretien périodique de vos engins et systèmes afin de prolonger leur durée de vie et d’éviter les arrêts imprévus.' },
  { key:'main-d’œuvre', nom:'Main-d’œuvre', categorie:'Atelier / Terrain', image:'/assets/services/main-oeuvre.png', description:'Une équipe compétente à votre service. Notre main-d’œuvre qualifiée met son expertise au service de vos projets, interventions et travaux techniques. Avec HydroConnecto, vous profitez d’un accompagnement sérieux et efficace.' },
  { key:'installation hydraulique', nom:'Installation hydraulique', categorie:'Atelier / Terrain', image:'/assets/services/installation-hydraulique.png', description:'Une installation fiable pour des performances durables. Nous assurons l’installation de systèmes hydrauliques avec rigueur et précision, en tenant compte des normes de sécurité et des besoins spécifiques de chaque client.' },
  { key:'installation pneumatique', nom:'Installation pneumatique', categorie:'Atelier / Terrain', image:'/assets/services/installation-pneumatique.png', description:'Des systèmes pneumatiques bien installés pour un fonctionnement optimal. HydroConnecto prend en charge l’installation de vos équipements pneumatiques avec professionnalisme et souci du détail.' }
];
function serviceRecordFor(def, records){
  const found = (records || []).find(s => normalizeText(s.nom || '').includes(normalizeText(def.key)) || normalizeText(def.key).includes(normalizeText(s.nom || '')));
  return { ...def, ...(found || {}), nom: def.nom, categorie: found?.categorie || def.categorie, description: found?.description || def.description, image_url: found?.image_url || def.image };
}
renderPublicServices = function(services) {
  const items = HYDRO_SERVICE_ORDER.map(def => serviceRecordFor(def, services));
  const target = $('publicServices'); if (!target) return;
  target.innerHTML = items.map(s => `<article class="service-card-full"><div class="service-image-box"><img src="${escapeHtml(s.image_url || s.image)}" alt="${escapeHtml(s.nom)}"></div><div class="service-content"><h3>${escapeHtml(s.nom)}</h3><p class="service-category">${escapeHtml(s.categorie || 'Atelier / Terrain')}</p><p>${escapeHtml(s.description || '')}</p><a class="btn primary service-btn" href="#devis-public">Demander un devis</a></div></article>`).join('');
};
function sortByText(items, getter, direction='asc'){
  return [...items].sort((a,b)=>String(getter(a)||'').localeCompare(String(getter(b)||''),'fr',{sensitivity:'base'})*(direction==='desc'?-1:1));
}
function sortByNumber(items, getter, direction='asc'){
  return [...items].sort((a,b)=>(Number(getter(a)||0)-Number(getter(b)||0))*(direction==='desc'?-1:1));
}
renderServices = function() {
  if (!$('servicesList')) return;
  let items = filtered(state.services, 'serviceSearch', ['nom','description','unite']);
  const sort = $('serviceSort')?.value || 'nom_asc';
  if (sort === 'nom_asc') items = sortByText(items, x=>x.nom, 'asc');
  if (sort === 'nom_desc') items = sortByText(items, x=>x.nom, 'desc');
  if (sort === 'prix_asc') items = sortByNumber(items, x=>x.prix_unitaire, 'asc');
  if (sort === 'prix_desc') items = sortByNumber(items, x=>x.prix_unitaire, 'desc');
  $('servicesList').innerHTML = items.map(s => `<article class="item-card"><h3>${escapeHtml(s.nom)}</h3><p class="meta">${money(s.prix_unitaire)} • ${escapeHtml(s.unite || 'service')}</p><p>${escapeHtml(s.description || '')}</p><div class="item-actions"><button class="btn small secondary" onclick="editService('${s.id}')">Modifier</button><button class="btn small danger" onclick="deleteService('${s.id}')">Archiver</button><button class="btn small danger-outline" onclick="hardDeleteService('${s.id}')">Supprimer</button></div></article>`).join('') || '<p class="meta">Aucun service.</p>';
};
window.hardDeleteService = async function(id){ if(!confirm('Supprimer définitivement ce service ? Cette action peut échouer si le service est déjà utilisé.')) return; await api(`/api/services/${id}/permanent`,{method:'DELETE'}); await loadServices(); toast('Service supprimé.'); };

renderEngins = function() {
  if (!$('enginsList')) return;
  let items = filtered(state.engins, 'enginSearch', ['type_engin','marque','modele','immatriculation', e => e.clients?.entreprise_nom || e.clients?.nom || '']);
  const sort = $('enginSort')?.value || 'date_desc';
  if (sort === 'type_asc') items = sortByText(items, x=>x.type_engin, 'asc');
  if (sort === 'client_asc') items = sortByText(items, x=>x.clients?.entreprise_nom || x.clients?.nom || '', 'asc');
  if (sort === 'marque_asc') items = sortByText(items, x=>x.marque || '', 'asc');
  $('enginsList').innerHTML = items.map(e => `<article class="item-card"><h3>${escapeHtml(e.type_engin)} ${escapeHtml(e.marque || '')} ${escapeHtml(e.modele || '')}</h3><p class="meta">Client : ${escapeHtml(e.clients?.entreprise_nom || e.clients?.nom || '')}</p><p>Immatriculation : ${escapeHtml(e.immatriculation || '-')} | Heures : ${escapeHtml(e.heures_fonctionnement || '-')}</p><div class="item-actions"><button class="btn small secondary" onclick="editEngin('${e.id}')">Modifier</button><button class="btn small danger" onclick="deleteEngin('${e.id}')">Archiver</button><button class="btn small danger-outline" onclick="hardDeleteEngin('${e.id}')">Supprimer</button></div></article>`).join('') || '<p class="meta">Aucun engin.</p>';
};
window.hardDeleteEngin = async function(id){ if(!confirm('Supprimer définitivement cet engin ? Cette action peut échouer si l’engin est lié à des interventions.')) return; await api(`/api/engins/${id}/permanent`,{method:'DELETE'}); await loadEngins(); toast('Engin supprimé.'); };

function resetGalerieForm(){ const f=$('galerieForm'); if(!f) return; f.reset(); if(f.id) f.id.value=''; const media=f.media; if(media) media.required=true; $('galerieSubmitBtn') && ($('galerieSubmitBtn').textContent='Ajouter à la galerie'); $('galerieCancelBtn')?.classList.add('hidden'); }
window.editGalerie=function(id){ const g=(state.galerie||[]).find(x=>x.id===id); if(!g) return; const f=$('galerieForm'); f.id.value=g.id; f.titre.value=g.titre||''; f.categorie.value=g.categorie||''; f.description.value=g.description||''; if(f.media) f.media.required=false; $('galerieSubmitBtn').textContent='Enregistrer modification'; $('galerieCancelBtn').classList.remove('hidden'); f.scrollIntoView({behavior:'smooth',block:'start'}); };
window.archiveGalerie=async function(id){ if(!confirm('Masquer / archiver ce média ?')) return; await api(`/api/galerie/${id}`,{method:'DELETE'}); await loadGalerieAdmin(); await loadPublicData(); toast('Média archivé.'); };
window.hardDeleteGalerie=async function(id){ if(!confirm('Supprimer définitivement ce média ?')) return; await api(`/api/galerie/${id}/permanent`,{method:'DELETE'}); await loadGalerieAdmin(); await loadPublicData(); toast('Média supprimé.'); };
renderGalerieAdmin = function() {
  if (!$('galerieAdminList')) return;
  let items = filtered(state.galerie || [], 'galerieSearch', ['titre','categorie','description','type_media']);
  const sort=$('galerieSort')?.value || 'date_desc';
  if(sort==='titre_asc') items=sortByText(items,x=>x.titre,'asc');
  if(sort==='categorie_asc') items=sortByText(items,x=>x.categorie,'asc');
  $('galerieAdminList').innerHTML = items.map(g => {
    const mediaUrl = g.url || g.url_fichier || g.public_url;
    const media = g.type_media === 'video' ? `<div class="gallery-media"><video src="${escapeHtml(mediaUrl)}" controls></video></div>` : `<div class="gallery-media"><img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(g.titre || '')}" /></div>`;
    return `<article class="gallery-card">${media}<h3>${escapeHtml(g.titre)}</h3><p class="meta">${escapeHtml(g.categorie || '')}</p><p>${escapeHtml(g.description || '')}</p><div class="item-actions"><a class="btn small secondary" href="${escapeHtml(mediaUrl)}" target="_blank">Voir</a><button class="btn small secondary" onclick="editGalerie('${g.id}')">Modifier</button><button class="btn small danger" onclick="archiveGalerie('${g.id}')">Archiver</button><button class="btn small danger-outline" onclick="hardDeleteGalerie('${g.id}')">Supprimer</button></div></article>`;
  }).join('') || '<p class="meta">Aucun média.</p>';
};




// === CORRECTIF INTÉGRAL v2.2.2.6 : rendu forcé et actions visibles partout ===
const HC_VERSION_FIX = 'v2.2.2.6-correctif-integral';

function dateValue(x){ return new Date(x.created_at || x.date_facture || x.date_devis || x.date_paiement || 0).getTime() || 0; }

// Demandes de devis : trier + actions visibles
const _oldRenderDemandes = renderDemandes;
renderDemandes = function() {
  if (!$('demandesList')) return;
  let items = filtered(state.demandes, 'demandeSearch', ['nom_complet','telephone','besoin','statut']);
  const st = $('demandeFilter')?.value;
  if (st) items = items.filter(x => x.statut === st);
  const sort = $('demandeSort')?.value || 'date_desc';
  if (sort === 'date_desc') items.sort((a,b)=>dateValue(b)-dateValue(a));
  if (sort === 'date_asc') items.sort((a,b)=>dateValue(a)-dateValue(b));
  if (sort === 'nom_asc') items = sortByText(items, x=>x.nom_complet, 'asc');
  if (sort === 'statut_asc') items = sortByText(items, x=>x.statut, 'asc');
  $('demandesList').innerHTML = items.map(d => {
    const wa = `https://wa.me/${String(d.telephone || '').replace(/\D/g, '')}`;
    const audio = d.audio_url ? `<audio class="audio-player" src="${escapeHtml(d.audio_url)}" controls></audio>` : '<p class="meta">Aucun vocal</p>';
    return `<article class="item-card"><h3>${escapeHtml(d.nom_complet)}</h3><p><span class="status-pill ${d.statut === 'nouvelle' ? 'warn' : d.statut === 'traitee' ? 'ok' : ''}">${escapeHtml(statusLabel(d.statut))}</span></p><p class="meta">${escapeHtml(d.telephone)} • ${escapeHtml(new Date(d.created_at).toLocaleString('fr-FR'))}</p><p>${escapeHtml(d.besoin || '')}</p>${audio}<div class="item-actions"><a class="btn small primary" href="${wa}" target="_blank">WhatsApp</a><button class="btn small secondary" onclick="editDemande('${d.id}')">Modifier</button><button class="btn small secondary" onclick="updateDemandeStatus('${d.id}','en_traitement')">En traitement</button><button class="btn small secondary" onclick="convertDemandeClient('${d.id}')">Créer client</button><button class="btn small success" onclick="updateDemandeStatus('${d.id}','traitee')">Traitée</button><button class="btn small danger" onclick="archiveDemande('${d.id}')">Archiver</button><button class="btn small danger-outline" onclick="hardDeleteDemande('${d.id}')">Supprimer</button></div></article>`;
  }).join('') || '<p class="meta">Aucune demande.</p>';
};
window.editDemande = function(id){ const d=(state.demandes||[]).find(x=>x.id===id); if(!d) return; const nom=prompt('Nom complet', d.nom_complet||''); if(nom===null) return; const tel=prompt('Téléphone', d.telephone||''); if(tel===null) return; const besoin=prompt('Besoin / message', d.besoin||''); if(besoin===null) return; jsonApi(`/api/demandes-devis/${id}`,'PUT',{nom_complet:nom,telephone:tel,besoin}).then(loadDemandes).then(()=>toast('Demande modifiée.')).catch(e=>toast(e.message)); };
window.archiveDemande = async function(id){ if(!confirm('Archiver cette demande ?')) return; await api(`/api/demandes-devis/${id}`,{method:'DELETE'}); await loadDemandes(); toast('Demande archivée.'); };
window.hardDeleteDemande = async function(id){ if(!confirm('Supprimer définitivement cette demande ?')) return; await api(`/api/demandes-devis/${id}/permanent`,{method:'DELETE'}); await loadDemandes(); toast('Demande supprimée.'); };

// Documents : historique avec tri + actions PDF / annuler / supprimer
renderDocumentsHistory = async function() {
  await loadDocuments();
  const f = state.factures.map(x => ({ ...x, type:'factures', label:'Facture', numero:x.numero, total:x.total, client:x.clients?.entreprise_nom || x.clients?.nom || '', created_at:x.created_at || x.date_facture }));
  const d = state.devis.map(x => ({ ...x, type:'devis', label:'Devis', numero:x.numero, total:x.total, client:x.clients?.entreprise_nom || x.clients?.nom || '', created_at:x.created_at || x.date_devis }));
  const r = state.paiements.map(x => ({ ...x, type:'paiements', label:'Reçu', numero:x.numero_recu, total:x.montant, client:x.factures?.clients?.entreprise_nom || x.factures?.clients?.nom || '', created_at:x.created_at || x.date_paiement }));
  let items = [...f, ...d, ...r];
  const search = normalizeText($('documentSearch')?.value || '');
  if(search) items = items.filter(x => normalizeText(`${x.numero} ${x.client} ${x.label}`).includes(search));
  const sort = $('documentSort')?.value || 'date_desc';
  if(sort==='date_desc') items.sort((a,b)=>dateValue(b)-dateValue(a));
  if(sort==='numero_asc') items=sortByText(items,x=>x.numero,'asc');
  if(sort==='client_asc') items=sortByText(items,x=>x.client,'asc');
  if(sort==='montant_desc') items=sortByNumber(items,x=>x.total,'desc');
  const tools=$('documentsTools'); if(tools) tools.classList.remove('hidden');
  $('documentsHistory').innerHTML = items.map(x => `<article class="item-card"><h3>${x.label} ${escapeHtml(x.numero)}</h3><p class="meta">${escapeHtml(x.client)} • Montant : ${money(x.total)} • ${escapeHtml(statusLabel(x.statut || ''))}</p><div class="item-actions"><a class="btn small primary" target="_blank" href="/api/pdf/${x.type}/${x.id}">Voir PDF</a><a class="btn small secondary" download href="/api/pdf/${x.type}/${x.id}">Télécharger</a><button class="btn small danger" onclick="archiveDocument('${x.type}','${x.id}')">Archiver/Annuler</button><button class="btn small danger-outline" onclick="hardDeleteDocument('${x.type}','${x.id}')">Supprimer</button></div></article>`).join('') || '<p class="meta">Aucun document.</p>';
};
window.archiveDocument = async function(type,id){ if(!confirm('Archiver / annuler ce document ?')) return; await jsonApi(`/api/${type}/${id}/status`,'PUT',{statut:'archivee'}); await renderDocumentsHistory(); toast('Document archivé.'); };
window.hardDeleteDocument = async function(type,id){ if(!confirm('Supprimer définitivement ce document ?')) return; await api(`/api/${type}/${id}/permanent`,{method:'DELETE'}); await renderDocumentsHistory(); toast('Document supprimé.'); };

// Services publics : toujours 8 services exacts, même si la base contient autre chose
renderPublicServices = function(services) {
  const items = HYDRO_SERVICE_ORDER.map(def => serviceRecordFor(def, services));
  const target = $('publicServices'); if (!target) return;
  target.innerHTML = items.map(s => `<article class="service-card-full"><div class="service-image-box"><img src="${escapeHtml(s.image_url || s.image)}?v=2212" alt="${escapeHtml(s.nom)}"></div><div class="service-content"><h3>${escapeHtml(s.nom)}</h3><p class="service-category">${escapeHtml(s.categorie || 'Atelier / Terrain')}</p><p>${escapeHtml(s.description || '')}</p><a class="btn primary service-btn" href="#devis-public">Demander un devis</a></div></article>`).join('');
};

// Ajout des listeners manquants pour que tri/recherche réagisse tout de suite
function initFinalFixListeners(){
  ['demandeSort'].forEach(id => $(id)?.addEventListener('change', renderDemandes));
  ['documentSearch'].forEach(id => $(id)?.addEventListener('input', renderDocumentsHistory));
  ['documentSort'].forEach(id => $(id)?.addEventListener('change', renderDocumentsHistory));
  const topbar = document.querySelector('.admin-topbar strong');
  if (topbar) topbar.textContent = 'HydroConnecto ERP Pro v2.2.2.6 CORRECTIF INTÉGRAL';
}

// Lancement après chargement de toutes les corrections v2.2.2.6
init();
initFinalFixListeners();

// === HydroConnecto v2.2.2.6 GALERIE CORRIGÉE : actions complètes + 8 services exacts ===
(function hydroFinal2214Legacy(){
  const FINAL_VERSION = 'HydroConnecto ERP Pro v2.2.2.6 PRO';
  const finalTopbar = document.querySelector('.admin-topbar strong');
  if (finalTopbar) finalTopbar.textContent = FINAL_VERSION;

  const EXACT_SERVICES_8 = [
    { nom: 'Diagnostic', slug: 'diagnostic', image: '/assets/services/diagnostic.png', categorie: 'Atelier / Terrain', description: 'Identifier rapidement la panne pour mieux la résoudre. Nos services de diagnostic hydraulique et pneumatique permettent de détecter les anomalies, pertes de pression et dysfonctionnements afin de proposer la bonne solution dès le départ.' },
    { nom: 'Confection de flexible', slug: 'confection-flexible', image: '/assets/services/confection-flexible.png', categorie: 'Atelier / Sur site', description: 'Des flexibles sur mesure, fiables et durables. Nous réalisons la fabrication et le remplacement de flexibles hydrauliques avec précision, rapidité et professionnalisme.' },
    { nom: 'Réparation de pompe', slug: 'reparation-pompe', image: '/assets/services/reparation-pompe.png', categorie: 'Atelier', description: 'Réparation soignée de pompes hydrauliques pour retrouver toute la puissance de vos équipements. Chaque intervention vise une solution fiable et durable.' },
    { nom: 'Maintenance corrective', slug: 'maintenance-corrective', image: '/assets/services/maintenance-corrective.png', categorie: 'Atelier / Terrain', description: 'Intervenir vite après une panne ou un dysfonctionnement afin de remettre vos équipements en état et réduire l’immobilisation.' },
    { nom: 'Maintenance préventive', slug: 'maintenance-preventive', image: '/assets/services/maintenance-preventive.png', categorie: 'Atelier / Terrain', description: 'Prévenir les pannes avant qu’elles ne surviennent grâce à un entretien périodique des engins et systèmes hydrauliques/pneumatiques.' },
    { nom: 'Main-d’œuvre', slug: 'main-oeuvre', image: '/assets/services/main-oeuvre.png', categorie: 'Atelier / Terrain', description: 'Une équipe compétente à votre service pour vos projets, interventions et travaux techniques avec sérieux, efficacité et professionnalisme.' },
    { nom: 'Installation hydraulique', slug: 'installation-hydraulique', image: '/assets/services/installation-hydraulique.png', categorie: 'Atelier / Terrain', description: 'Installation fiable de systèmes hydrauliques avec rigueur, précision et respect des besoins spécifiques de chaque client.' },
    { nom: 'Installation pneumatique', slug: 'installation-pneumatique', image: '/assets/services/installation-pneumatique.png', categorie: 'Atelier / Terrain', description: 'Installation professionnelle de systèmes pneumatiques pour une mise en service efficace, sécurisée et durable.' }
  ];
  window.HYDRO_EXACT_SERVICES_8 = EXACT_SERVICES_8;

  window.renderPublicServices = function renderPublicServicesFinal() {
    const target = $('publicServices');
    if (!target) return;
    target.innerHTML = EXACT_SERVICES_8.map(s => `
      <article class="service-card-full">
        <div class="service-image-box"><img src="${escapeHtml(s.image)}?v=2214-legacy" alt="${escapeHtml(s.nom)}"></div>
        <div class="service-content">
          <h3>${escapeHtml(s.nom)}</h3>
          <p class="service-category">${escapeHtml(s.categorie)}</p>
          <p>${escapeHtml(s.description)}</p>
          <a class="btn primary service-btn" href="#devis-public">Demander un devis</a>
        </div>
      </article>`).join('');
  };

  function dateVal(x){ return new Date(x.created_at || x.date_intervention || x.date_facture || x.date_devis || x.date_paiement || 0).getTime() || 0; }
  function sortTxt(items, fn, dir='asc'){ return [...items].sort((a,b)=>String(fn(a)||'').localeCompare(String(fn(b)||''),'fr',{sensitivity:'base'})*(dir==='desc'?-1:1)); }
  function sortNum(items, fn, dir='asc'){ return [...items].sort((a,b)=>(Number(fn(a)||0)-Number(fn(b)||0))*(dir==='desc'?-1:1)); }
  function safeList(arr){ return Array.isArray(arr) ? arr : []; }

  // Clients: modifier / archiver / supprimer / trier
  window.hardDeleteClient = async function(id){ if(!confirm('Supprimer définitivement ce client ? Cette action peut échouer si le client possède des factures, engins ou interventions.')) return; await api(`/api/clients/${id}/permanent`,{method:'DELETE'}); await loadClients(); toast('Client supprimé.'); };
  window.renderClients = function(){
    if (!$('clientsList')) return;
    let items = filtered(state.clients, 'clientSearch', ['nom','entreprise_nom','telephone','email','adresse','ville']);
    const sort = $('clientSort')?.value || 'date_desc';
    if (sort === 'nom_asc') items = sortTxt(items, x=>x.entreprise_nom || x.nom, 'asc');
    if (sort === 'nom_desc') items = sortTxt(items, x=>x.entreprise_nom || x.nom, 'desc');
    if (sort === 'date_desc') items.sort((a,b)=>dateVal(b)-dateVal(a));
    $('clientsList').innerHTML = items.map(c => `<article class="item-card"><h3>${escapeHtml(c.entreprise_nom || c.nom)}</h3><p class="meta">${escapeHtml(c.telephone || '')} ${escapeHtml(c.email || '')}</p><p>${escapeHtml(c.adresse || '')}</p><div class="item-actions"><button class="btn small secondary" onclick="editClient('${c.id}')">Modifier</button><button class="btn small danger" onclick="deleteClient('${c.id}')">Archiver</button><button class="btn small danger-outline" onclick="hardDeleteClient('${c.id}')">Supprimer</button></div></article>`).join('') || '<p class="meta">Aucun client.</p>';
  };

  // Produits: modifier / archiver / supprimer / trier
  window.hardDeleteProduit = async function(id){ if(!confirm('Supprimer définitivement ce produit ? Cette action peut échouer si le produit est déjà utilisé.')) return; await api(`/api/produits/${id}/permanent`,{method:'DELETE'}); await loadProduits(); toast('Produit supprimé.'); };
  window.renderProduits = function(){
    if (!$('produitsList')) return;
    let items = filtered(state.produits, 'produitSearch', ['nom','description','unite']);
    const sort = $('produitSort')?.value || 'nom_asc';
    if (sort === 'stock_asc') items = sortNum(items, x=>x.quantite_stock, 'asc');
    if (sort === 'prix_desc') items = sortNum(items, x=>x.prix_unitaire, 'desc');
    if (sort === 'nom_asc') items = sortTxt(items, x=>x.nom, 'asc');
    $('produitsList').innerHTML = items.map(p => `<article class="item-card"><h3>${escapeHtml(p.nom)}</h3><p class="meta">${escapeHtml(p.categories_produits?.nom || 'Sans catégorie')} • ${money(p.prix_unitaire)} • Stock ${p.quantite_stock || 0}</p><p>${escapeHtml(p.description || '')}</p><div class="item-actions"><button class="btn small secondary" onclick="editProduit('${p.id}')">Modifier</button><button class="btn small danger" onclick="deleteProduit('${p.id}')">Archiver</button><button class="btn small danger-outline" onclick="hardDeleteProduit('${p.id}')">Supprimer</button></div></article>`).join('') || '<p class="meta">Aucun produit.</p>';
  };

  // Services: modifier / archiver / supprimer / trier
  window.renderServices = function(){
    if (!$('servicesList')) return;
    let items = filtered(state.services, 'serviceSearch', ['nom','description','unite']);
    const sort = $('serviceSort')?.value || 'nom_asc';
    if (sort === 'nom_asc') items = sortTxt(items, x=>x.nom, 'asc');
    if (sort === 'nom_desc') items = sortTxt(items, x=>x.nom, 'desc');
    if (sort === 'prix_asc') items = sortNum(items, x=>x.prix_unitaire, 'asc');
    if (sort === 'prix_desc') items = sortNum(items, x=>x.prix_unitaire, 'desc');
    $('servicesList').innerHTML = items.map(s => `<article class="item-card"><h3>${escapeHtml(s.nom)}</h3><p class="meta">${money(s.prix_unitaire)} • ${escapeHtml(s.unite || 'service')}</p><p>${escapeHtml(s.description || '')}</p><div class="item-actions"><button class="btn small secondary" onclick="editService('${s.id}')">Modifier</button><button class="btn small danger" onclick="deleteService('${s.id}')">Archiver</button><button class="btn small danger-outline" onclick="hardDeleteService('${s.id}')">Supprimer</button></div></article>`).join('') || '<p class="meta">Aucun service.</p>';
  };

  // Engins: modifier / archiver / supprimer / trier
  window.renderEngins = function(){
    if (!$('enginsList')) return;
    let items = filtered(state.engins, 'enginSearch', ['type_engin','marque','modele','immatriculation','numero_serie']);
    const sort = $('enginSort')?.value || 'date_desc';
    if (sort === 'type_asc') items = sortTxt(items, x=>x.type_engin, 'asc');
    if (sort === 'client_asc') items = sortTxt(items, x=>x.clients?.entreprise_nom || x.clients?.nom || '', 'asc');
    if (sort === 'marque_asc') items = sortTxt(items, x=>x.marque || '', 'asc');
    if (sort === 'date_desc') items.sort((a,b)=>dateVal(b)-dateVal(a));
    $('enginsList').innerHTML = items.map(e => `<article class="item-card"><h3>${escapeHtml(e.type_engin)} ${escapeHtml(e.marque || '')} ${escapeHtml(e.modele || '')}</h3><p class="meta">Client : ${escapeHtml(e.clients?.entreprise_nom || e.clients?.nom || '')}</p><p>Immatriculation : ${escapeHtml(e.immatriculation || '-')} | Heures : ${escapeHtml(e.heures_fonctionnement || '-')}</p><div class="item-actions"><button class="btn small secondary" onclick="editEngin('${e.id}')">Modifier</button><button class="btn small danger" onclick="deleteEngin('${e.id}')">Archiver</button><button class="btn small danger-outline" onclick="hardDeleteEngin('${e.id}')">Supprimer</button></div></article>`).join('') || '<p class="meta">Aucun engin.</p>';
  };

  // Interventions: modifier / archiver / supprimer / trier
  window.editIntervention = function(id){
    const i = safeList(state.interventions).find(x=>x.id===id); if(!i) return;
    const f = $('interventionForm'); if(!f) return;
    f.id.value = i.id || '';
    f.client_id.value = i.client_id || '';
    updateInterventionEngins();
    setTimeout(()=>{ if(f.engin_id) f.engin_id.value = i.engin_id || ''; }, 50);
    f.statut.value = i.statut || 'planifiee';
    f.date_intervention.value = (i.date_intervention || '').slice(0,10);
    f.probleme_signale.value = i.probleme_signale || '';
    f.diagnostic.value = i.diagnostic || '';
    f.travaux_realises.value = i.travaux_realises || '';
    f.scrollIntoView({behavior:'smooth', block:'start'});
    toast('Intervention chargée pour modification.');
  };
  window.hardDeleteIntervention = async function(id){ if(!confirm('Supprimer définitivement cette intervention ?')) return; await api(`/api/interventions/${id}/permanent`,{method:'DELETE'}); await loadInterventions(); toast('Intervention supprimée.'); };
  window.renderInterventions = function(){
    if (!$('interventionsList')) return;
    let items = filtered(state.interventions, 'interventionSearch', ['numero','probleme_signale','diagnostic','travaux_realises']);
    const st = $('interventionFilter')?.value; if (st) items = items.filter(x=>x.statut===st);
    const sort = $('interventionSort')?.value || 'date_desc';
    if(sort==='date_desc') items.sort((a,b)=>dateVal(b)-dateVal(a));
    if(sort==='date_asc') items.sort((a,b)=>dateVal(a)-dateVal(b));
    if(sort==='client_asc') items=sortTxt(items,x=>x.clients?.entreprise_nom || x.clients?.nom || '', 'asc');
    if(sort==='statut_asc') items=sortTxt(items,x=>x.statut || '', 'asc');
    $('interventionsList').innerHTML = items.map(i => { const intervenants = safeList(i.intervenants).map(x=>x.equipe_site?.nom_complet || 'Intervenant').join(' • '); const pieces = safeList(i.pieces).map(x=>`${x.produits?.nom||'Pièce'} x${x.quantite}`).join(' • '); return `<article class="item-card"><h3>${escapeHtml(i.numero)}</h3><p><span class="status-pill">${escapeHtml(statusLabel(i.statut))}</span></p><p class="meta">${escapeHtml(i.clients?.entreprise_nom || i.clients?.nom || '')} • ${escapeHtml(i.engins?.type_engin || '')}</p><p>${escapeHtml(i.probleme_signale || '')}</p><p class="meta"><strong>Intervenants :</strong> ${escapeHtml(intervenants || 'Non renseigné')}</p><p class="meta"><strong>Pièces :</strong> ${escapeHtml(pieces || 'Aucune')}</p><div class="item-actions"><button class="btn small secondary" onclick="editIntervention('${i.id}')">Modifier</button><button class="btn small secondary" onclick="jsonApi('/api/interventions/${i.id}/status','PUT',{statut:'en_cours'}).then(loadInterventions)">En cours</button><button class="btn small success" onclick="jsonApi('/api/interventions/${i.id}/status','PUT',{statut:'terminee'}).then(loadInterventions)">Terminer</button><button class="btn small danger" onclick="archiveIntervention('${i.id}')">Archiver/Annuler</button><button class="btn small danger-outline" onclick="hardDeleteIntervention('${i.id}')">Supprimer</button></div></article>`; }).join('') || '<p class="meta">Aucune intervention.</p>';
  };

  // Galerie: modifier / archiver / supprimer / trier + full media visible
  window.renderGalerieAdmin = function(){
    if (!$('galerieAdminList')) return;
    let items = filtered(state.galerie || [], 'galerieSearch', ['titre','categorie','description','type_media']);
    const sort=$('galerieSort')?.value || 'date_desc';
    if(sort==='titre_asc') items=sortTxt(items,x=>x.titre,'asc');
    if(sort==='categorie_asc') items=sortTxt(items,x=>x.categorie,'asc');
    if(sort==='date_desc') items.sort((a,b)=>dateVal(b)-dateVal(a));
    $('galerieAdminList').innerHTML = items.map(g => {
      const mediaUrl = g.url || g.url_fichier || g.public_url || '';
      const media = g.type_media === 'video' ? `<div class="gallery-media"><video src="${escapeHtml(mediaUrl)}" controls></video></div>` : `<div class="gallery-media"><img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(g.titre || '')}" /></div>`;
      return `<article class="gallery-card">${media}<h3>${escapeHtml(g.titre)}</h3><p class="meta">${escapeHtml(g.categorie || '')}</p><p>${escapeHtml(g.description || '')}</p><div class="item-actions"><a class="btn small secondary" href="${escapeHtml(mediaUrl)}" target="_blank">Voir</a><button class="btn small secondary" onclick="editGalerie('${g.id}')">Modifier</button><button class="btn small danger" onclick="archiveGalerie('${g.id}')">Archiver</button><button class="btn small danger-outline" onclick="hardDeleteGalerie('${g.id}')">Supprimer</button></div></article>`;
    }).join('') || '<p class="meta">Aucun média.</p>';
  };

  // Équipe: recherche/tri + modifier/masquer/supprimer + spécialités visibles
  window.editEquipe = function(id){
    const m=safeList(state.equipe).find(x=>x.id===id); if(!m) return;
    const f=$('equipeForm'); if(!f) return;
    f.id.value=m.id||''; f.nom_complet.value=m.nom_complet||''; f.fonction.value=m.fonction||''; f.statut.value=m.statut||'actif'; f.ordre.value=m.ordre||0; f.telephone.value=m.telephone||''; f.email.value=m.email||''; f.informations_personnelles.value=m.informations_personnelles||''; f.description.value=m.description||''; f.visible.checked=!!m.visible;
    const specs=String(m.specialites||'').split(',').map(x=>x.trim()).filter(Boolean);
    qsa('#specialitesCheckboxes input[type="checkbox"]').forEach(cb=>{ cb.checked=specs.includes(cb.value); });
    updateSpecialitesHidden();
    f.scrollIntoView({behavior:'smooth',block:'start'});
  };
  window.hardDeleteEquipe = async function(id){ if(!confirm('Supprimer définitivement ce membre ?')) return; await api(`/api/equipe/${id}/permanent`,{method:'DELETE'}); await loadEquipeAdmin(); toast('Membre supprimé.'); };
  window.renderEquipeAdmin = function(){
    if (!$('equipeAdminList')) return;
    const filter = $('equipeFilter')?.value || '';
    let items = filtered(state.equipe || [], 'equipeSearch', ['nom_complet','fonction','specialites','description','telephone','email']);
    if (filter === 'visible') items = items.filter(x => x.visible);
    if (filter === 'masque') items = items.filter(x => !x.visible);
    if (filter === 'actif') items = items.filter(x => (x.statut || 'actif') === 'actif');
    if (filter === 'inactif') items = items.filter(x => (x.statut || '') === 'inactif');
    const sort=$('equipeSort')?.value || 'ordre_asc';
    if(sort==='ordre_asc') items=sortNum(items,x=>x.ordre,'asc');
    if(sort==='nom_asc') items=sortTxt(items,x=>x.nom_complet,'asc');
    if(sort==='fonction_asc') items=sortTxt(items,x=>x.fonction,'asc');
    $('equipeAdminList').innerHTML = items.map(m => `<article class="team-card">${m.photo_url ? `<img src="${escapeHtml(m.photo_url)}" />` : `<div class="avatar-placeholder">${escapeHtml((m.nom_complet||'HC').slice(0,2).toUpperCase())}</div>`}<h3>${escapeHtml(m.nom_complet)}</h3><p class="eyebrow">${escapeHtml(m.fonction || '')}</p><p class="meta">Statut : ${escapeHtml(m.statut || 'actif')} | Visible : ${m.visible ? 'Oui' : 'Non'}</p><p>${escapeHtml(m.description || '')}</p><p class="meta">${escapeHtml(m.specialites || '')}</p><div class="item-actions"><button class="btn small secondary" onclick="editEquipe('${m.id}')">Modifier</button><button class="btn small ${m.visible ? 'danger' : 'success'}" onclick="toggleEquipe('${m.id}', ${m.visible ? 'false' : 'true'})">${m.visible ? 'Masquer/Archiver' : 'Réafficher'}</button><button class="btn small danger-outline" onclick="hardDeleteEquipe('${m.id}')">Supprimer</button></div></article>`).join('') || '<p class="meta">Aucun membre.</p>';
  };

  // Form intervention: POST ou PUT selon id
  const interventionForm = $('interventionForm');
  if (interventionForm && !interventionForm.dataset.final2214legacy) {
    interventionForm.dataset.final2214legacy = 'true';
    interventionForm.addEventListener('submit', async e => {
      const id = e.target.id?.value;
      if (!id) return; // laisse le handler original créer
      e.preventDefault();
      e.stopImmediatePropagation();
      try {
        await jsonApi(`/api/interventions/${id}`, 'PUT', { ...formToObject(e.target), intervenants: collectIntervenants(), pieces: collectPieces() });
        e.target.reset();
        e.target.id.value='';
        await loadInterventions();
        toast('Intervention modifiée.');
      } catch(err){ toast(err.message); }
    }, true);
  }

  ['clientSearch','clientSort'].forEach(id=>$(id)?.addEventListener(id.endsWith('Sort')?'change':'input', renderClients));
  ['produitSearch','produitSort'].forEach(id=>$(id)?.addEventListener(id.endsWith('Sort')?'change':'input', renderProduits));
  ['serviceSearch','serviceSort'].forEach(id=>$(id)?.addEventListener(id.endsWith('Sort')?'change':'input', renderServices));
  ['enginSearch','enginSort'].forEach(id=>$(id)?.addEventListener(id.endsWith('Sort')?'change':'input', renderEngins));
  ['interventionSearch','interventionFilter','interventionSort'].forEach(id=>$(id)?.addEventListener(id==='interventionSearch'?'input':'change', renderInterventions));
  ['galerieSearch','galerieSort'].forEach(id=>$(id)?.addEventListener(id==='galerieSearch'?'input':'change', renderGalerieAdmin));
  ['equipeSearch','equipeFilter','equipeSort'].forEach(id=>$(id)?.addEventListener(id==='equipeSearch'?'input':'change', renderEquipeAdmin));

  // Re-render immédiat si la page publique est déjà chargée avant ce bloc.
  window.renderPublicServices();
})();

// === HydroConnecto v2.2.2.6 GALERIE CORRIGÉE : corrections imposées par le client ===
(function hydroFinal2214Definitif(){
  const FINAL_VERSION = 'HydroConnecto ERP Pro v2.2.2.6 PRO';
  const topbar = document.querySelector('.admin-topbar strong');
  if (topbar) topbar.textContent = FINAL_VERSION;

  const EXACT_SERVICES_8 = [
    { nom: 'Diagnostic', image: '/assets/services/diagnostic.png', categorie: 'Atelier / Terrain', description: 'Identifier rapidement la panne pour mieux la résoudre. Nos services de diagnostic hydraulique et pneumatique permettent de détecter les anomalies, pertes de pression et dysfonctionnements afin de proposer la bonne solution dès le départ.' },
    { nom: 'Confection de flexible', image: '/assets/services/confection-flexible.png', categorie: 'Atelier / Sur site', description: 'Fabrication ou remplacement de flexibles hydrauliques sur mesure avec précision, rapidité et professionnalisme pour garantir performance, sécurité et continuité de travail.' },
    { nom: 'Installation hydraulique', image: '/assets/services/installation-hydraulique.png', categorie: 'Atelier / Terrain', description: 'Installation fiable de systèmes hydrauliques avec rigueur, précision et respect des besoins spécifiques de chaque client.' },
    { nom: 'Installation pneumatique', image: '/assets/services/installation-pneumatique.png', categorie: 'Atelier / Terrain', description: 'Installation professionnelle de systèmes pneumatiques pour une mise en service efficace, sécurisée et durable.' },
    { nom: 'Main-d’œuvre', image: '/assets/services/main-oeuvre.png', categorie: 'Atelier / Terrain', description: 'Une main-d’œuvre qualifiée et engagée pour vos projets, interventions et travaux techniques avec sérieux, efficacité et professionnalisme.' },
    { nom: 'Maintenance corrective', image: '/assets/services/maintenance-corrective.png', categorie: 'Atelier / Terrain', description: 'Intervenir vite après une panne ou un dysfonctionnement afin de remettre vos équipements en état et réduire l’immobilisation.' },
    { nom: 'Maintenance préventive', image: '/assets/services/maintenance-preventive.png', categorie: 'Atelier / Terrain', description: 'Prévenir les pannes avant qu’elles ne surviennent grâce à un entretien périodique des engins et systèmes hydrauliques/pneumatiques.' },
    { nom: 'Réparation de pompe', image: '/assets/services/reparation-pompe.png', categorie: 'Atelier', description: 'Réparation soignée de pompes hydrauliques pour retrouver toute la puissance de vos équipements et garantir une solution fiable et durable.' }
  ];
  window.HYDRO_EXACT_SERVICES_8 = EXACT_SERVICES_8;

  window.renderPublicServices = function renderPublicServicesExactFinal(){
    const target = $('publicServices');
    if (!target) return;
    target.innerHTML = EXACT_SERVICES_8.map((s, index) => `
      <article class="service-card-full" data-service-order="${index + 1}">
        <div class="service-image-box">
          <img src="${escapeHtml(s.image)}?v=2215-galerie-fix" alt="${escapeHtml(s.nom)}">
        </div>
        <div class="service-content">
          <h3>${escapeHtml(s.nom)}</h3>
          <p class="service-category">${escapeHtml(s.categorie)}</p>
          <p>${escapeHtml(s.description)}</p>
          <a class="btn primary service-btn" href="#devis-public">Demander un devis</a>
        </div>
      </article>`).join('');
  };

  function finalDateVal(x){ return new Date(x?.created_at || x?.date_intervention || x?.date_facture || x?.date_devis || x?.date_paiement || 0).getTime() || 0; }
  function finalSortTxt(items, fn, dir='asc'){ return [...items].sort((a,b)=>String(fn(a)||'').localeCompare(String(fn(b)||''),'fr',{sensitivity:'base'})*(dir==='desc'?-1:1)); }
  function finalSortNum(items, fn, dir='asc'){ return [...items].sort((a,b)=>(Number(fn(a)||0)-Number(fn(b)||0))*(dir==='desc'?-1:1)); }
  function safeItems(arr){ return Array.isArray(arr) ? arr : []; }

  // Correction modification Clients : si un id est chargé, PUT au lieu de recréer.
  const clientForm = $('clientForm');
  if (clientForm && !clientForm.dataset.final2214Edit) {
    clientForm.dataset.final2214Edit = 'true';
    clientForm.addEventListener('submit', async (e) => {
      const id = e.target.id?.value;
      if (!id) return;
      e.preventDefault(); e.stopImmediatePropagation();
      try {
        await jsonApi(`/api/clients/${id}`, 'PUT', formToObject(e.target));
        e.target.reset(); e.target.id.value = '';
        $('clientSubmitBtn').textContent = '+ Ajouter client';
        $('clientCancelBtn')?.classList.add('hidden');
        await loadClients();
        toast('Client modifié.');
      } catch (err) { toast(err.message); }
    }, true);
  }

  const enginForm = $('enginForm');
  if (enginForm && !enginForm.dataset.final2214Edit) {
    enginForm.dataset.final2214Edit = 'true';
    enginForm.addEventListener('submit', async (e) => {
      const id = e.target.id?.value;
      if (!id) return;
      e.preventDefault(); e.stopImmediatePropagation();
      try {
        await jsonApi(`/api/engins/${id}`, 'PUT', formToObject(e.target));
        e.target.reset(); e.target.id.value = '';
        $('enginSubmitBtn').textContent = '+ Ajouter engin';
        $('enginCancelBtn')?.classList.add('hidden');
        await loadEngins();
        toast('Engin modifié.');
      } catch (err) { toast(err.message); }
    }, true);
  }

  // Actions + tri visibles sur tous les modules demandés.
  window.renderClients = function renderClientsFinal(){
    if (!$('clientsList')) return;
    let items = filtered(state.clients, 'clientSearch', ['nom','entreprise_nom','telephone','email','adresse','ville']);
    const sort = $('clientSort')?.value || 'date_desc';
    if (sort === 'nom_asc') items = finalSortTxt(items, x=>x.entreprise_nom || x.nom, 'asc');
    if (sort === 'nom_desc') items = finalSortTxt(items, x=>x.entreprise_nom || x.nom, 'desc');
    if (sort === 'date_desc') items.sort((a,b)=>finalDateVal(b)-finalDateVal(a));
    $('clientsList').innerHTML = items.map(c => `<article class="item-card"><h3>${escapeHtml(c.entreprise_nom || c.nom)}</h3><p class="meta">${escapeHtml(c.telephone || '')} ${escapeHtml(c.email || '')}</p><p>${escapeHtml(c.adresse || '')}</p><div class="item-actions"><button class="btn small secondary" onclick="editClient('${c.id}')">Modifier</button><button class="btn small danger" onclick="deleteClient('${c.id}')">Archiver</button><button class="btn small danger-outline" onclick="hardDeleteClient('${c.id}')">Supprimer</button></div></article>`).join('') || '<p class="meta">Aucun client.</p>';
  };

  window.renderEngins = function renderEnginsFinal(){
    if (!$('enginsList')) return;
    let items = filtered(state.engins, 'enginSearch', ['type_engin','marque','modele','immatriculation','numero_serie', e=>e.clients?.entreprise_nom || e.clients?.nom || '']);
    const sort = $('enginSort')?.value || 'date_desc';
    if (sort === 'type_asc') items = finalSortTxt(items, x=>x.type_engin, 'asc');
    if (sort === 'client_asc') items = finalSortTxt(items, x=>x.clients?.entreprise_nom || x.clients?.nom || '', 'asc');
    if (sort === 'marque_asc') items = finalSortTxt(items, x=>x.marque || '', 'asc');
    if (sort === 'date_desc') items.sort((a,b)=>finalDateVal(b)-finalDateVal(a));
    $('enginsList').innerHTML = items.map(e => `<article class="item-card"><h3>${escapeHtml(e.type_engin)} ${escapeHtml(e.marque || '')} ${escapeHtml(e.modele || '')}</h3><p class="meta">Client : ${escapeHtml(e.clients?.entreprise_nom || e.clients?.nom || '')}</p><p>Immatriculation : ${escapeHtml(e.immatriculation || '-')} | Heures : ${escapeHtml(e.heures_fonctionnement || '-')}</p><div class="item-actions"><button class="btn small secondary" onclick="editEngin('${e.id}')">Modifier</button><button class="btn small danger" onclick="deleteEngin('${e.id}')">Archiver</button><button class="btn small danger-outline" onclick="hardDeleteEngin('${e.id}')">Supprimer</button></div></article>`).join('') || '<p class="meta">Aucun engin.</p>';
  };

  window.renderServices = function renderServicesFinal(){
    if (!$('servicesList')) return;
    let items = filtered(state.services, 'serviceSearch', ['nom','description','unite']);
    const sort = $('serviceSort')?.value || 'nom_asc';
    if (sort === 'nom_asc') items = finalSortTxt(items, x=>x.nom, 'asc');
    if (sort === 'nom_desc') items = finalSortTxt(items, x=>x.nom, 'desc');
    if (sort === 'prix_asc') items = finalSortNum(items, x=>x.prix_unitaire, 'asc');
    if (sort === 'prix_desc') items = finalSortNum(items, x=>x.prix_unitaire, 'desc');
    $('servicesList').innerHTML = items.map(s => `<article class="item-card"><h3>${escapeHtml(s.nom)}</h3><p class="meta">${money(s.prix_unitaire)} • ${escapeHtml(s.unite || 'service')}</p><p>${escapeHtml(s.description || '')}</p><div class="item-actions"><button class="btn small secondary" onclick="editService('${s.id}')">Modifier</button><button class="btn small danger" onclick="deleteService('${s.id}')">Archiver</button><button class="btn small danger-outline" onclick="hardDeleteService('${s.id}')">Supprimer</button></div></article>`).join('') || '<p class="meta">Aucun service.</p>';
  };

  window.renderProduits = function renderProduitsFinal(){
    if (!$('produitsList')) return;
    let items = filtered(state.produits, 'produitSearch', ['nom','description','unite', p=>p.categories_produits?.nom || '']);
    const sort = $('produitSort')?.value || 'nom_asc';
    if (sort === 'stock_asc') items = finalSortNum(items, x=>x.quantite_stock, 'asc');
    if (sort === 'prix_desc') items = finalSortNum(items, x=>x.prix_unitaire, 'desc');
    if (sort === 'nom_asc') items = finalSortTxt(items, x=>x.nom, 'asc');
    $('produitsList').innerHTML = items.map(p => `<article class="item-card"><h3>${escapeHtml(p.nom)}</h3><p class="meta">${escapeHtml(p.categories_produits?.nom || 'Sans catégorie')} • ${money(p.prix_unitaire)} • Stock ${p.quantite_stock || 0}</p><p>${escapeHtml(p.description || '')}</p><div class="item-actions"><button class="btn small secondary" onclick="editProduit('${p.id}')">Modifier</button><button class="btn small danger" onclick="deleteProduit('${p.id}')">Archiver</button><button class="btn small danger-outline" onclick="hardDeleteProduit('${p.id}')">Supprimer</button></div></article>`).join('') || '<p class="meta">Aucun produit.</p>';
  };

  window.renderDemandes = function renderDemandesFinal(){
    if (!$('demandesList')) return;
    let items = filtered(state.demandes, 'demandeSearch', ['nom_complet','telephone','besoin','statut']);
    const st = $('demandeFilter')?.value; if (st) items = items.filter(x => x.statut === st);
    const sort = $('demandeSort')?.value || 'date_desc';
    if (sort === 'date_desc') items.sort((a,b)=>finalDateVal(b)-finalDateVal(a));
    if (sort === 'date_asc') items.sort((a,b)=>finalDateVal(a)-finalDateVal(b));
    if (sort === 'nom_asc') items = finalSortTxt(items, x=>x.nom_complet, 'asc');
    if (sort === 'statut_asc') items = finalSortTxt(items, x=>x.statut, 'asc');
    $('demandesList').innerHTML = items.map(d => {
      const wa = `https://wa.me/${String(d.telephone || '').replace(/\D/g, '')}`;
      const audio = d.audio_url ? `<audio class="audio-player" src="${escapeHtml(d.audio_url)}" controls></audio>` : '<p class="meta">Aucun vocal</p>';
      return `<article class="item-card"><h3>${escapeHtml(d.nom_complet)}</h3><p><span class="status-pill ${d.statut === 'nouvelle' ? 'warn' : d.statut === 'traitee' ? 'ok' : ''}">${escapeHtml(statusLabel(d.statut))}</span></p><p class="meta">${escapeHtml(d.telephone)} • ${escapeHtml(new Date(d.created_at).toLocaleString('fr-FR'))}</p><p>${escapeHtml(d.besoin || '')}</p>${audio}<div class="item-actions"><a class="btn small primary" href="${wa}" target="_blank">WhatsApp</a><button class="btn small secondary" onclick="editDemande('${d.id}')">Modifier</button><button class="btn small secondary" onclick="updateDemandeStatus('${d.id}','en_traitement')">En traitement</button><button class="btn small secondary" onclick="convertDemandeClient('${d.id}')">Créer client</button><button class="btn small success" onclick="updateDemandeStatus('${d.id}','traitee')">Traitée</button><button class="btn small danger" onclick="archiveDemande('${d.id}')">Archiver</button><button class="btn small danger-outline" onclick="hardDeleteDemande('${d.id}')">Supprimer</button></div></article>`;
    }).join('') || '<p class="meta">Aucune demande.</p>';
  };

  window.editDocument = async function(type, id){
    const collections = { factures: state.factures, devis: state.devis, paiements: state.paiements };
    const current = safeItems(collections[type]).find(x => x.id === id);
    if (!current) return toast('Document introuvable.');
    const notes = prompt('Notes / observation du document', current.notes || '');
    if (notes === null) return;
    const statut = prompt('Statut du document', current.statut || 'brouillon');
    if (statut === null) return;
    try {
      await jsonApi(`/api/${type}/${id}`, 'PUT', { notes, statut });
      await renderDocumentsHistory();
      toast('Document modifié.');
    } catch (err) { toast(err.message); }
  };

  window.renderDocumentsHistory = async function renderDocumentsHistoryFinal(){
    await loadDocuments();
    const f = safeItems(state.factures).map(x => ({ ...x, type:'factures', label:'Facture', numero:x.numero, total:x.total, client:x.clients?.entreprise_nom || x.clients?.nom || '', created_at:x.created_at || x.date_facture }));
    const d = safeItems(state.devis).map(x => ({ ...x, type:'devis', label:'Devis', numero:x.numero, total:x.total, client:x.clients?.entreprise_nom || x.clients?.nom || '', created_at:x.created_at || x.date_devis }));
    const r = safeItems(state.paiements).map(x => ({ ...x, type:'paiements', label:'Reçu', numero:x.numero_recu, total:x.montant, client:x.factures?.clients?.entreprise_nom || x.factures?.clients?.nom || '', created_at:x.created_at || x.date_paiement }));
    let items = [...f, ...d, ...r];
    const search = normalizeText($('documentSearch')?.value || '');
    if (search) items = items.filter(x => normalizeText(`${x.numero} ${x.client} ${x.label} ${x.statut || ''}`).includes(search));
    const sort = $('documentSort')?.value || 'date_desc';
    if (sort === 'date_desc') items.sort((a,b)=>finalDateVal(b)-finalDateVal(a));
    if (sort === 'numero_asc') items = finalSortTxt(items, x=>x.numero, 'asc');
    if (sort === 'client_asc') items = finalSortTxt(items, x=>x.client, 'asc');
    if (sort === 'montant_desc') items = finalSortNum(items, x=>x.total, 'desc');
    $('documentsTools')?.classList.remove('hidden');
    $('documentsHistory').innerHTML = items.map(x => {
      const paymentAction = x.type === 'factures' && Number(x.solde || 0) > 0
        ? `<button class="btn small success" onclick="initiatePayment('${x.id}')">Paiement API</button>`
        : '';
      return `<article class="item-card"><h3>${x.label} ${escapeHtml(x.numero)}</h3><p class="meta">${escapeHtml(x.client)} • Montant : ${money(x.total)} • Solde : ${money(x.solde || 0)} • ${escapeHtml(statusLabel(x.statut || ''))}</p><div class="item-actions"><button class="btn small secondary" onclick="editDocument('${x.type}','${x.id}')">Modifier</button>${paymentAction}<a class="btn small primary" target="_blank" href="/api/pdf/${x.type}/${x.id}">Voir PDF</a><a class="btn small secondary" download href="/api/pdf/${x.type}/${x.id}">Télécharger</a><button class="btn small danger" onclick="archiveDocument('${x.type}','${x.id}')">Archiver/Annuler</button><button class="btn small danger-outline" onclick="hardDeleteDocument('${x.type}','${x.id}')">Supprimer</button></div></article>`;
    }).join('') || '<p class="meta">Aucun document.</p>';
  };

  window.initiatePayment = async function(id) {
    if (!confirm('Envoyer une demande de paiement API pour cette facture ?')) return;
    try {
      const result = await jsonApi('/api/payments/initiate', 'POST', { facture_id: id });
      if (result.checkout_url) window.open(result.checkout_url, '_blank', 'noopener,noreferrer');
      toast(result.checkout_url ? 'Lien de paiement généré et notification envoyée si WhatsApp est configuré.' : 'Demande de paiement envoyée à l’API.');
    } catch (err) { toast(err.message); }
  };

  window.renderGalerieAdmin = function renderGalerieAdminFinal(){
    if (!$('galerieAdminList')) return;
    let items = filtered(state.galerie || [], 'galerieSearch', ['titre','categorie','description','type_media']);
    const sort = $('galerieSort')?.value || 'date_desc';
    if (sort === 'titre_asc') items = finalSortTxt(items, x=>x.titre, 'asc');
    if (sort === 'categorie_asc') items = finalSortTxt(items, x=>x.categorie, 'asc');
    if (sort === 'date_desc') items.sort((a,b)=>finalDateVal(b)-finalDateVal(a));
    $('galerieAdminList').innerHTML = items.map(g => {
      const mediaUrl = g.url || g.url_fichier || g.public_url || '';
      const media = g.type_media === 'video' ? `<div class="gallery-media"><video src="${escapeHtml(mediaUrl)}" controls></video></div>` : `<div class="gallery-media"><img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(g.titre || '')}" /></div>`;
      return `<article class="gallery-card">${media}<h3>${escapeHtml(g.titre)}</h3><p class="meta">${escapeHtml(g.categorie || '')}</p><p>${escapeHtml(g.description || '')}</p><div class="item-actions"><a class="btn small secondary" href="${escapeHtml(mediaUrl)}" target="_blank">Voir</a><button class="btn small secondary" onclick="editGalerie('${g.id}')">Modifier</button><button class="btn small danger" onclick="archiveGalerie('${g.id}')">Archiver</button><button class="btn small danger-outline" onclick="hardDeleteGalerie('${g.id}')">Supprimer</button></div></article>`;
    }).join('') || '<p class="meta">Aucun média.</p>';
  };

  window.renderEquipeAdmin = function renderEquipeAdminFinal(){
    if (!$('equipeAdminList')) return;
    const filter = $('equipeFilter')?.value || '';
    let items = filtered(state.equipe || [], 'equipeSearch', ['nom_complet','fonction','specialites','description','telephone','email']);
    if (filter === 'visible') items = items.filter(x => x.visible);
    if (filter === 'masque') items = items.filter(x => !x.visible);
    if (filter === 'actif') items = items.filter(x => (x.statut || 'actif') === 'actif');
    if (filter === 'inactif') items = items.filter(x => (x.statut || '') === 'inactif');
    const sort = $('equipeSort')?.value || 'ordre_asc';
    if (sort === 'ordre_asc') items = finalSortNum(items, x=>x.ordre, 'asc');
    if (sort === 'nom_asc') items = finalSortTxt(items, x=>x.nom_complet, 'asc');
    if (sort === 'fonction_asc') items = finalSortTxt(items, x=>x.fonction, 'asc');
    $('equipeAdminList').innerHTML = items.map(m => `<article class="team-card">${m.photo_url ? `<img src="${escapeHtml(m.photo_url)}" />` : `<div class="avatar-placeholder">${escapeHtml((m.nom_complet||'HC').slice(0,2).toUpperCase())}</div>`}<h3>${escapeHtml(m.nom_complet)}</h3><p class="eyebrow">${escapeHtml(m.fonction || '')}</p><p class="meta">Statut : ${escapeHtml(m.statut || 'actif')} | Visible : ${m.visible ? 'Oui' : 'Non'}</p><p>${escapeHtml(m.description || '')}</p><p class="meta">${escapeHtml(m.specialites || '')}</p><div class="item-actions"><button class="btn small secondary" onclick="editEquipe('${m.id}')">Modifier</button><button class="btn small ${m.visible ? 'danger' : 'success'}" onclick="toggleEquipe('${m.id}', ${m.visible ? 'false' : 'true'})">${m.visible ? 'Masquer/Archiver' : 'Réafficher'}</button><button class="btn small danger-outline" onclick="hardDeleteEquipe('${m.id}')">Supprimer</button></div></article>`).join('') || '<p class="meta">Aucun membre.</p>';
  };

  // Listeners finaux de tri/recherche, incluant les modules déjà demandés.
  [
    ['clientSearch','input',renderClients], ['clientSort','change',renderClients],
    ['enginSearch','input',renderEngins], ['enginSort','change',renderEngins],
    ['produitSearch','input',renderProduits], ['produitSort','change',renderProduits],
    ['serviceSearch','input',renderServices], ['serviceSort','change',renderServices],
    ['demandeSearch','input',renderDemandes], ['demandeFilter','change',renderDemandes], ['demandeSort','change',renderDemandes],
    ['interventionSearch','input',renderInterventions], ['interventionFilter','change',renderInterventions], ['interventionSort','change',renderInterventions],
    ['galerieSearch','input',renderGalerieAdmin], ['galerieSort','change',renderGalerieAdmin],
    ['equipeSearch','input',renderEquipeAdmin], ['equipeFilter','change',renderEquipeAdmin], ['equipeSort','change',renderEquipeAdmin],
    ['documentSearch','input',renderDocumentsHistory], ['documentSort','change',renderDocumentsHistory]
  ].forEach(([id,event,fn]) => $(id)?.addEventListener(event, fn));

  renderPublicServices();
})();

// === HydroConnecto v2.2.2.6 : CORRECTION RÉELLE GALERIE + ACCUEIL + ADMIN ===
(function(){
  const VERSION = 'HydroConnecto ERP Pro v2.2.2.6 PRO';

  const _showPublic = window.showPublic || showPublic;
  const _showLogin = window.showLogin || showLogin;
  const _showAdminPanel = window.showAdminPanel || showAdminPanel;

  window.showPublic = showPublic = function(){
    document.body.classList.remove('admin-body');
    _showPublic();
  };
  window.showLogin = showLogin = function(){
    document.body.classList.add('admin-body');
    _showLogin();
  };
  window.showAdminPanel = showAdminPanel = function(){
    document.body.classList.add('admin-body');
    _showAdminPanel();
    const title = document.querySelector('.admin-topbar strong');
    if (title) title.textContent = VERSION;
  };

  function isOldDemoGallery(g){
    const u = String(g.url || g.url_fichier || g.public_url || '').toLowerCase();
    const t = String(g.titre || '').toLowerCase().trim();
    return u.includes('/assets/services/') || u.includes('/assets/images/hero-accueil') || u.includes('/assets/banner-hydroconnecto') ||
      ['diagnostic','confection de flexible','reparation de pompe','réparation de pompe','maintenance corrective','maintenance preventive','maintenance préventive','main-d’œuvre','main-d\'œuvre','installation hydraulique','installation pneumatique'].includes(t);
  }

  window.restoreGalerie = async function(id){
    try {
      await api(`/api/galerie/${id}/visible`, { method:'PATCH', body: JSON.stringify({ visible: true }), headers: { 'Content-Type': 'application/json' } });
      await loadGalerieAdmin();
      await loadPublicData();
      toast('Média réactivé.');
    } catch(err){ toast(err.message); }
  };

  window.archiveGalerie = async function(id){
    if(!confirm('Archiver / masquer ce média ?')) return;
    await api(`/api/galerie/${id}`, { method:'DELETE' });
    await loadGalerieAdmin();
    await loadPublicData();
    toast('Média archivé.');
  };

  window.hardDeleteGalerie = async function(id){
    if(!confirm('Supprimer définitivement ce média ?')) return;
    await api(`/api/galerie/${id}/permanent`, { method:'DELETE' });
    await loadGalerieAdmin();
    await loadPublicData();
    toast('Média supprimé définitivement.');
  };

  window.renderGalerieAdmin = renderGalerieAdmin = function renderGalerieAdminV2215(){
    if (!$('galerieAdminList')) return;

    let items = Array.isArray(state.galerie) ? [...state.galerie] : [];
    items = items.filter(g => !isOldDemoGallery(g));

    const q = normalizeText($('galerieSearch')?.value || '');
    if (q) items = items.filter(g => normalizeText(`${g.titre || ''} ${g.categorie || ''} ${g.description || ''} ${g.type_media || ''}`).includes(q));

    const sort = $('galerieSort')?.value || 'date_desc';
    if (sort === 'titre_asc') items.sort((a,b)=>String(a.titre||'').localeCompare(String(b.titre||''),'fr'));
    if (sort === 'categorie_asc') items.sort((a,b)=>String(a.categorie||'').localeCompare(String(b.categorie||''),'fr'));
    if (sort === 'date_desc') items.sort((a,b)=>new Date(b.created_at || 0)-new Date(a.created_at || 0));

    if (!items.length) {
      $('galerieAdminList').innerHTML = '<div class="panel"><h3>Galerie vide</h3><p class="meta">Les anciennes images de démonstration ont été retirées. Ajoute maintenant tes vraies photos/vidéos depuis l’ordinateur.</p></div>';
      return;
    }

    $('galerieAdminList').innerHTML = items.map(g => {
      const mediaUrl = g.url || g.url_fichier || g.public_url || '';
      const isVideo = String(g.type_media || '').toLowerCase().includes('video') || /\.(mp4|webm|mov)$/i.test(mediaUrl);
      const media = mediaUrl
        ? (isVideo
          ? `<div class="gallery-media admin-gallery-media"><video src="${escapeHtml(mediaUrl)}" controls preload="metadata"></video></div>`
          : `<div class="gallery-media admin-gallery-media"><img loading="lazy" src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(g.titre || 'Média galerie')}" onerror="this.closest('.gallery-media').classList.add('media-missing'); this.remove();" /></div>`)
        : `<div class="gallery-media admin-gallery-media media-missing"><span>Fichier introuvable</span></div>`;

      const visible = g.visible !== false;
      const status = visible ? '<span class="status-pill ok">Visible</span>' : '<span class="status-pill warn">Archivé</span>';
      const archiveOrRestore = visible
        ? `<button class="btn small danger" onclick="archiveGalerie('${g.id}')">Archiver</button>`
        : `<button class="btn small success" onclick="restoreGalerie('${g.id}')">Réactiver</button>`;

      return `<article class="gallery-card admin-gallery-card">
        <div class="gallery-card-head">
          <div>
            <h3>${escapeHtml(g.titre || 'Sans titre')}</h3>
            <p class="meta">${escapeHtml(g.categorie || 'Galerie')} • ${status}</p>
          </div>
          <div class="item-actions admin-gallery-actions">
            ${mediaUrl ? `<a class="btn small secondary" href="${escapeHtml(mediaUrl)}" target="_blank" rel="noreferrer">Voir</a>` : ''}
            <button class="btn small secondary" onclick="editGalerie('${g.id}')">Modifier</button>
            ${archiveOrRestore}
            <button class="btn small danger-outline" onclick="hardDeleteGalerie('${g.id}')">Supprimer</button>
          </div>
        </div>
        ${media}
        ${g.description ? `<p>${escapeHtml(g.description)}</p>` : ''}
      </article>`;
    }).join('');
  };

  document.addEventListener('DOMContentLoaded', () => {
    const title = document.querySelector('.admin-topbar strong');
    if (title) title.textContent = VERSION;
    $('galerieSearch')?.addEventListener('input', renderGalerieAdmin);
    $('galerieSort')?.addEventListener('change', renderGalerieAdmin);
  });
})();




/* ===== HYDROCONNECTO PRO v2.2.2.6 — Galerie média persistante ===== */
function galleryMediaHtml(g, admin = false) {
  const mediaUrl = g.url || g.media_url || g.storage_proxy_url || g.url_fichier || g.public_url || '';
  const title = g.titre || 'Média galerie';
  const type = String(g.type_media || g.mime_type || '').toLowerCase();
  const isVideo = type.includes('video') || /\.(mp4|webm|mov)$/i.test(mediaUrl);
  const isAudio = type.includes('audio') || /\.(mp3|wav|ogg)$/i.test(mediaUrl);

  if (!mediaUrl) {
    return `<div class="gallery-media media-missing"><span>Fichier média manquant</span></div>`;
  }

  const onImgError = "this.closest('.gallery-media').classList.add('media-missing'); this.closest('.gallery-media').innerHTML='<span>Média indisponible<br><small>Vérifie Supabase Storage ou réimporte le fichier.</small></span>';";

  if (isVideo) {
    return `<div class="gallery-media${admin ? ' admin-gallery-media' : ''}"><video src="${escapeHtml(mediaUrl)}" controls preload="metadata"></video></div>`;
  }

  if (isAudio) {
    return `<div class="gallery-media${admin ? ' admin-gallery-media' : ''}"><audio src="${escapeHtml(mediaUrl)}" controls></audio></div>`;
  }

  return `<div class="gallery-media${admin ? ' admin-gallery-media' : ''}"><img loading="lazy" src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(title)}" onerror="${onImgError}" /></div>`;
}

renderPublicGallery = function renderPublicGalleryV2221(items) {
  if (!items?.length) {
    $('publicGallery').innerHTML = '<p class="meta">La galerie sera alimentée depuis l’espace admin.</p>';
    return;
  }

  $('publicGallery').innerHTML = items.map(g => {
    const mediaUrl = g.url || g.media_url || g.storage_proxy_url || g.url_fichier || g.public_url || '';
    return `<article class="gallery-card">
      ${galleryMediaHtml(g, false)}
      <h3>${escapeHtml(g.titre || 'Sans titre')}</h3>
      <p class="meta">${escapeHtml(g.categorie || '')}</p>
      ${g.description ? `<p>${escapeHtml(g.description)}</p>` : ''}
      ${mediaUrl ? `<a class="media-open-link" href="${escapeHtml(mediaUrl)}" target="_blank" rel="noreferrer">Voir en grand</a>` : ''}
    </article>`;
  }).join('');
};

window.renderGalerieAdmin = renderGalerieAdmin = function renderGalerieAdminV2221(){
  if (!$('galerieAdminList')) return;

  let items = Array.isArray(state.galerie) ? [...state.galerie] : [];
  items = items.filter(g => !isOldDemoGallery(g));

  const q = normalizeText($('galerieSearch')?.value || '');
  if (q) items = items.filter(g => normalizeText(`${g.titre || ''} ${g.categorie || ''} ${g.description || ''} ${g.type_media || ''}`).includes(q));

  const sort = $('galerieSort')?.value || 'date_desc';
  if (sort === 'titre_asc') items.sort((a,b)=>String(a.titre||'').localeCompare(String(b.titre||''),'fr'));
  if (sort === 'categorie_asc') items.sort((a,b)=>String(a.categorie||'').localeCompare(String(b.categorie||''),'fr'));
  if (sort === 'date_desc') items.sort((a,b)=>new Date(b.created_at || 0)-new Date(a.created_at || 0));

  if (!items.length) {
    $('galerieAdminList').innerHTML = '<div class="panel"><h3>Galerie vide</h3><p class="meta">Ajoute tes vraies photos/vidéos depuis l’ordinateur.</p></div>';
    return;
  }

  $('galerieAdminList').innerHTML = items.map(g => {
    const mediaUrl = g.url || g.media_url || g.storage_proxy_url || g.url_fichier || g.public_url || '';
    const visible = g.visible !== false;
    const status = visible ? '<span class="status-pill ok">Visible</span>' : '<span class="status-pill warn">Archivé</span>';
    const archiveOrRestore = visible
      ? `<button class="btn small danger" onclick="archiveGalerie('${g.id}')">Archiver</button>`
      : `<button class="btn small success" onclick="restoreGalerie('${g.id}')">Réactiver</button>`;

    return `<article class="gallery-card admin-gallery-card">
      <div class="gallery-card-head">
        <div>
          <h3>${escapeHtml(g.titre || 'Sans titre')}</h3>
          <p class="meta">${escapeHtml(g.categorie || 'Galerie')} • ${status}</p>
        </div>
        <div class="item-actions admin-gallery-actions">
          ${mediaUrl ? `<a class="btn small secondary" href="${escapeHtml(mediaUrl)}" target="_blank" rel="noreferrer">Voir</a>` : ''}
          <button class="btn small secondary" onclick="editGalerie('${g.id}')">Modifier</button>
          ${archiveOrRestore}
          <button class="btn small danger-outline" onclick="hardDeleteGalerie('${g.id}')">Supprimer</button>
        </div>
      </div>
      ${galleryMediaHtml(g, true)}
      ${g.description ? `<p>${escapeHtml(g.description)}</p>` : ''}
      ${g.bucket === 'local' ? `<p class="meta warning-text">⚠ Média stocké localement : configure Supabase Storage pour le rendre persistant après changement de dossier ou déploiement.</p>` : ''}
    </article>`;
  }).join('');
};

// ===== v2.2.2.6 workflow permissions fournisseurs profil =====
function hasAnyUiPermission(list = []) { return list.some(permission => hasUiPermission(permission)); }
function canSeeFinance() { return hasAnyUiPermission(['dashboard.finance', 'factures.view', 'paiements.view']); }
function canSeeStock() { return hasAnyUiPermission(['dashboard.stock', 'produits.view']); }
function canSeeInterventionsDashboard() { return hasAnyUiPermission(['dashboard.interventions', 'interventions.view']); }

const EXTRA_PERMISSION_LABELS = {
  'dashboard.finance': 'Dashboard financier',
  'dashboard.stock': 'Dashboard stock',
  'dashboard.interventions': 'Dashboard interventions',
  'demandes_devis.*': 'Demandes / communications',
  'clients.*': 'Clients',
  'engins.*': 'Engins',
  'produits.*': 'Stock / produits',
  'services.*': 'Services',
  'interventions.*': 'Interventions complètes',
  'interventions.assign_team': 'Assignation équipe',
  'interventions.change_schedule': 'Planification intervention',
  'documents.*': 'Documents',
  'factures.*': 'Factures',
  'paiements.*': 'Paiements / reçus',
  'galerie.*': 'Galerie',
  'equipe.*': 'Équipe',
  'fournisseurs.*': 'Fournisseurs',
  'commandes_fournisseurs.*': 'Commandes fournisseurs',
  'users.*': 'Utilisateurs / rôles',
  'journal.view': 'Journal',
  'exports.*': 'Exports'
};

function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed; } catch {}
  return String(value).split(',').map(x => x.trim()).filter(Boolean);
}
function selectedMultiValues(select) { return [...(select?.selectedOptions || [])].map(o => o.value).filter(Boolean); }
function setMultiValues(select, values = []) {
  const set = new Set(Array.isArray(values) ? values : parseList(values));
  [...(select?.options || [])].forEach(o => { o.selected = set.has(o.value); });
}

const oldPermissionForAdminTab = permissionForAdminTab;
permissionForAdminTab = function(tab) {
  return {
    dashboard: 'dashboard.view',
    demandes: 'demandes_devis.view',
    clients: 'clients.view',
    engins: 'engins.view',
    produits: 'produits.view',
    services: 'services.view',
    interventions: 'interventions.view',
    documents: 'documents.view',
    galerieAdmin: 'galerie.view',
    equipeAdmin: 'equipe.view',
    fournisseurs: 'fournisseurs.view',
    journal: 'journal.view',
    usersAdmin: 'users.view',
    profile: 'profile.view',
    exports: 'exports.view'
  }[tab] || oldPermissionForAdminTab(tab);
};

loadAdminBasics = async function loadAdminBasicsV2224() {
  await Promise.all([
    loadCategories(),
    hasUiPermission('clients.view') ? loadClients() : Promise.resolve(),
    hasUiPermission('produits.view') ? loadProduits() : Promise.resolve(),
    hasUiPermission('services.view') ? loadServices() : Promise.resolve(),
    hasUiPermission('factures.view') ? loadFactures() : Promise.resolve(),
    hasUiPermission('equipe.view') ? loadEquipeAdmin(true) : Promise.resolve(),
    hasUiPermission('demandes_devis.view') ? loadDemandes(true) : Promise.resolve(),
    hasUiPermission('fournisseurs.view') ? loadFournisseurs(true) : Promise.resolve()
  ]);
  updateSelects();
  await loadDashboard();
};

activateAdminPage = function activateAdminPageV2224(name) {
  qsa('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.admin === name));
  qsa('.admin-page').forEach(p => p.classList.toggle('active', p.id === `admin-${name}`));
  qs('.admin-sidebar')?.classList.remove('open');
  const loaders = { dashboard: loadDashboard, demandes: loadDemandes, clients: loadClients, engins: loadEngins, produits: loadProduits, services: loadServices, interventions: loadInterventions, documents: loadDocuments, fournisseurs: loadFournisseurs, galerieAdmin: loadGalerieAdmin, equipeAdmin: loadEquipeAdmin, journal: loadJournal, usersAdmin: loadUsersAdmin, profile: loadProfile, exports: renderExports };
  loaders[name]?.();
};

loadDashboard = async function loadDashboardV2224() {
  try {
    const d = await api('/api/dashboard');
    const stats = [];
    if (hasUiPermission('demandes_devis.view') || d.demandes !== null) stats.push(['Demandes', d.demandes ?? 0], ['Nouvelles demandes', d.nouvellesDemandes ?? 0]);
    if (hasUiPermission('clients.view')) stats.push(['Clients', d.clients ?? 0]);
    if (hasUiPermission('produits.view')) stats.push(['Produits', d.produits ?? 0]);
    if (canSeeInterventionsDashboard()) stats.push(['Interventions', d.interventions ?? 0]);
    if (canSeeFinance()) stats.push(['Factures', d.factures ?? 0], ['CA', money(d.chiffreAffaires || 0)], ['Impayés', money(d.impayes || 0)]);
    $('statsGrid').innerHTML = stats.map(([k,v]) => `<div class="stat-card"><span>${escapeHtml(k)}</span><strong>${v}</strong></div>`).join('');

    const alerts = [];
    if ((d.nouvellesDemandes || 0) > 0 && hasUiPermission('demandes_devis.view')) alerts.push(`<p><strong>🔔 ${d.nouvellesDemandes} nouvelle(s) demande(s).</strong></p>`);
    if ((d.stockFaible || []).length && canSeeStock()) alerts.push(`<p><strong>⚠ ${d.stockFaible.length} produit(s) en stock faible.</strong></p>`);
    if ((d.facturationApreparer || []).length && canSeeFinance()) alerts.push(`<p><strong>🧾 ${d.facturationApreparer.length} intervention(s) terminée(s) à facturer.</strong></p>`);
    $('dashboardAlerts').innerHTML = alerts.join('') || '<p class="meta">Aucune alerte prioritaire pour tes accès.</p>';

    $('stockFaible').innerHTML = canSeeStock()
      ? ((d.stockFaible || []).length ? d.stockFaible.map(p => `<p>${escapeHtml(p.nom)} — stock ${p.quantite_stock} / minimum ${p.stock_minimum}</p>`).join('') : '<p class="meta">Aucune alerte stock faible.</p>')
      : '<p class="meta">Stock masqué selon tes permissions.</p>';

    renderDashboardWorkBlocks(d);
    updateDemandeBadge(d.nouvellesDemandes || 0);
  } catch(e) { console.warn(e); }
};

function renderDashboardWorkBlocks(d = {}) {
  let box = $('dashboardWorkBlocks');
  if (!box) {
    const alertsPanel = $('dashboardAlerts')?.closest('.panel');
    if (!alertsPanel) return;
    box = document.createElement('div');
    box.id = 'dashboardWorkBlocks';
    box.className = 'dashboard-work-blocks';
    alertsPanel.after(box);
  }
  const blocks = [];
  if (canSeeInterventionsDashboard()) {
    blocks.push(`<div class="panel"><h3>Interventions en cours</h3>${(d.interventionsEnCours || []).length ? d.interventionsEnCours.map(i => `<p><strong>${escapeHtml(i.numero)}</strong> — ${escapeHtml(statusLabel(i.statut))} — ${escapeHtml(i.clients?.entreprise_nom || i.clients?.nom || '')}</p>`).join('') : '<p class="meta">Aucune intervention en cours.</p>'}</div>`);
    blocks.push(`<div class="panel"><h3>Mes interventions assignées</h3>${(d.mesInterventions || []).length ? d.mesInterventions.map(i => `<p><strong>${escapeHtml(i.numero)}</strong> — ${escapeHtml(statusLabel(i.statut))} — ${escapeHtml(i.probleme_signale || '')}</p>`).join('') : '<p class="meta">Aucune intervention assignée à ton compte.</p>'}</div>`);
  }
  if (canSeeFinance()) {
    blocks.push(`<div class="panel"><h3>Interventions terminées à facturer</h3>${(d.facturationApreparer || []).length ? d.facturationApreparer.map(i => `<p><strong>${escapeHtml(i.numero)}</strong> — ${escapeHtml(i.clients?.entreprise_nom || i.clients?.nom || '')}</p>`).join('') : '<p class="meta">Aucune intervention prête à facturer.</p>'}</div>`);
  }
  if (canSeeStock() && (d.commandesFournisseursOuvertes || []).length) {
    blocks.push(`<div class="panel"><h3>Commandes fournisseurs ouvertes</h3>${d.commandesFournisseursOuvertes.map(c => `<p><strong>${escapeHtml(c.numero)}</strong> — ${escapeHtml(c.fournisseurs?.nom || '')} — ${escapeHtml(statusLabel(c.statut))}</p>`).join('')}</div>`);
  }
  box.innerHTML = blocks.join('');
}

renderInterventions = function renderInterventionsV2224() {
  if (!$('interventionsList')) return;
  let items = filtered(state.interventions, 'interventionSearch', ['numero','statut','probleme_signale', i => i.clients?.entreprise_nom || i.clients?.nom || '', i => i.engins?.type_engin || '']);
  const st = $('interventionFilter')?.value;
  if (st) items = items.filter(i => i.statut === st);
  const canUpdate = hasUiPermission('interventions.update');
  const canUpdateStatus = hasUiPermission('interventions.update_status');
  const canDelete = hasUiPermission('interventions.delete');
  $('interventionsList').innerHTML = items.map(i => {
    const intervenants = (i.intervenants || []).map(x => `${x.equipe_site?.nom_complet || 'Intervenant'} (${statusLabel(x.statut_intervention)})`).join(' • ');
    const pieces = (i.pieces || []).map(x => `${x.produits?.nom || 'Pièce'} x${x.quantite}`).join(' • ');
    const actions = [
      canUpdateStatus ? `<button class="btn small secondary" onclick="updateInterventionStatus('${i.id}','en_cours')">En cours</button>` : '',
      canUpdateStatus ? `<button class="btn small success" onclick="updateInterventionStatus('${i.id}','terminee')">Terminer</button>` : '',
      canUpdate ? `<button class="btn small secondary" onclick="editIntervention?.('${i.id}')">Modifier</button>` : '',
      canDelete ? `<button class="btn small danger" onclick="deleteInterventionPermanent?.('${i.id}')">Supprimer</button>` : ''
    ].filter(Boolean).join('');
    return `<article class="item-card"><h3>${escapeHtml(i.numero)}</h3><p><span class="status-pill">${escapeHtml(statusLabel(i.statut))}</span></p><p class="meta">${escapeHtml(i.clients?.entreprise_nom || i.clients?.nom || '')} • ${escapeHtml(i.engins?.type_engin || '')}</p><p>${escapeHtml(i.probleme_signale || '')}</p><p class="meta"><strong>Intervenants :</strong> ${escapeHtml(intervenants || 'Non renseigné')}</p><p class="meta"><strong>Pièces :</strong> ${escapeHtml(pieces || 'Aucune')}</p>${actions ? `<div class="item-actions">${actions}</div>` : ''}</article>`;
  }).join('') || '<p class="meta">Aucune intervention.</p>';
};

window.updateInterventionStatus = async function(id, statut){ await jsonApi(`/api/interventions/${id}/status`, 'PUT', { statut }); await loadInterventions(); await loadDashboard(); toast('Statut intervention mis à jour.'); };

renderUsersAdmin = function renderUsersAdminV2224() {
  if (!$('usersAdminList')) return;
  let items = filtered(state.users || [], 'userSearch', ['nom_complet','email','role','statut']);
  const st = $('userStatusFilter')?.value; if (st) items = items.filter(u => u.statut === st);
  $('usersAdminList').innerHTML = items.map(u => {
    const extras = parseList(u.permissions_extra_effectives || u.permissions_extra).map(p => EXTRA_PERMISSION_LABELS[p] || p).join(', ');
    return `<article class="item-card">
      <h3>${escapeHtml(u.nom_complet)}</h3>
      <p class="meta">${escapeHtml(u.email)} • ${escapeHtml(u.role)} • <strong>${escapeHtml(u.statut)}</strong></p>
      <p class="meta"><strong>Accès supplémentaires :</strong> ${escapeHtml(extras || 'Aucun')}</p>
      <div class="item-actions">
        <button class="btn small success" onclick="updateUserStatus('${u.id}','approuve')">Approuver</button>
        <button class="btn small secondary" onclick="editUserAccount('${u.id}')">Modifier</button>
        <button class="btn small secondary" onclick="updateUserStatus('${u.id}','suspendu')">Suspendre</button>
        <button class="btn small danger" onclick="updateUserStatus('${u.id}','desactive')">Désactiver</button>
      </div>
    </article>`;
  }).join('') || '<p class="meta">Aucun utilisateur.</p>';
};

window.editUserAccount = function(id) {
  const u = (state.users || []).find(x => x.id === id);
  if (!u) return;
  const f = $('userAccountForm');
  f.dataset.editId = id;
  f.nom_complet.value = u.nom_complet || '';
  f.email.value = u.email || '';
  f.role.value = u.role || 'lecture_seule';
  f.statut.value = u.statut || 'en_attente';
  if (f.telephone) f.telephone.value = u.telephone || '';
  if (f.adresse) f.adresse.value = u.adresse || '';
  if (f.password_temp) f.password_temp.value = '';
  setMultiValues($('userExtraPermissionsSelect'), u.permissions_extra_effectives || u.permissions_extra || []);
  $('userSubmitBtn') && ($('userSubmitBtn').textContent = 'Enregistrer utilisateur');
  $('userCancelBtn')?.classList.remove('hidden');
  f.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.resetUserAccountForm = function() {
  const f = $('userAccountForm'); if (!f) return;
  f.reset(); delete f.dataset.editId;
  setMultiValues($('userExtraPermissionsSelect'), []);
  $('userSubmitBtn') && ($('userSubmitBtn').textContent = 'Créer le compte');
  $('userCancelBtn')?.classList.add('hidden');
};

async function loadProfile() {
  try {
    state.profile = await api('/api/profile');
    const f = $('profileForm');
    if (f && state.profile) {
      f.nom_complet.value = state.profile.nom_complet || state.profile.name || '';
      f.email.value = state.profile.email || '';
      f.telephone.value = state.profile.telephone || '';
      f.adresse.value = state.profile.adresse || '';
    }
    if ($('profilePermissionsBox')) {
      const perms = state.profile?.permissions || state.permissions || [];
      $('profilePermissionsBox').innerHTML = `<h3>Mes accès</h3><p class="meta">${escapeHtml(perms.join(', ') || 'Aucune permission chargée.')}</p>`;
    }
  } catch (e) { toast(e.message); }
}

async function loadFournisseurs(silent = false) {
  if (!hasUiPermission('fournisseurs.view')) return;
  try {
    const [fournisseurs, commandes] = await Promise.all([api('/api/fournisseurs'), api('/api/commandes-fournisseurs')]);
    state.fournisseurs = fournisseurs || [];
    state.commandesFournisseurs = commandes || [];
    updateFournisseurSelects();
    renderFournisseurs();
    if (!silent) await loadDashboard();
  } catch (e) {
    if ($('fournisseursList')) $('fournisseursList').innerHTML = `<p class="meta">${escapeHtml(e.message)}</p>`;
  }
}

function updateFournisseurSelects() {
  if ($('commandeFournisseurSelect')) $('commandeFournisseurSelect').innerHTML = optionList(state.fournisseurs || [], 'id', f => f.nom);
  if ($('commandeProduitSelect')) $('commandeProduitSelect').innerHTML = optionList(state.produits || [], 'id', p => `${p.nom} — stock ${p.quantite_stock ?? 0}`);
}

function renderFournisseurs() {
  if (!$('fournisseursList')) return;
  const q = normalizeText($('fournisseurSearch')?.value || '');
  const fournisseurs = (state.fournisseurs || []).filter(f => !q || normalizeText(`${f.nom} ${f.contact} ${f.telephone} ${f.email}`).includes(q));
  $('fournisseursList').innerHTML = `<h3>Fournisseurs</h3>` + (fournisseurs.map(f => `<article class="item-card">
    <h3>${escapeHtml(f.nom)}</h3>
    <p class="meta">${escapeHtml(f.contact || '')} • ${escapeHtml(f.telephone || '')} • ${escapeHtml(f.email || '')}</p>
    <p><strong>Commandes :</strong> ${f.nb_commandes || 0} • <strong>Ouvertes :</strong> ${f.commandes_ouvertes || 0} • <strong>Total :</strong> ${money(f.total_commandes || 0)}</p>
    <div class="item-actions"><button class="btn small secondary" onclick="editFournisseur('${f.id}')">Modifier</button></div>
  </article>`).join('') || '<p class="meta">Aucun fournisseur.</p>');
  if ($('commandesFournisseursList')) {
    const commandes = (state.commandesFournisseurs || []).filter(c => !q || normalizeText(`${c.numero} ${c.statut} ${c.fournisseurs?.nom || ''}`).includes(q));
    $('commandesFournisseursList').innerHTML = `<h3>Commandes fournisseurs</h3>` + (commandes.map(c => `<article class="item-card">
      <h3>${escapeHtml(c.numero)}</h3>
      <p><span class="status-pill">${escapeHtml(statusLabel(c.statut))}</span></p>
      <p class="meta">${escapeHtml(c.fournisseurs?.nom || '')} • ${escapeHtml(c.date_commande || '')}</p>
      <p><strong>Total achat :</strong> ${money(c.total || 0)}</p>
      <div class="item-actions">
        <button class="btn small secondary" onclick="updateCommandeFournisseurStatus('${c.id}','confirmee')">Confirmée</button>
        <button class="btn small secondary" onclick="updateCommandeFournisseurStatus('${c.id}','en_livraison')">En livraison</button>
        <button class="btn small success" onclick="receiveCommandeFournisseur('${c.id}')">Réceptionner vers stock</button>
      </div>
    </article>`).join('') || '<p class="meta">Aucune commande fournisseur.</p>');
  }
}

window.editFournisseur = function(id) {
  const f = (state.fournisseurs || []).find(x => x.id === id);
  if (!f) return;
  const form = $('fournisseurForm');
  form.id.value = f.id;
  form.nom.value = f.nom || '';
  form.contact.value = f.contact || '';
  form.telephone.value = f.telephone || '';
  form.email.value = f.email || '';
  form.adresse.value = f.adresse || '';
  form.statut.value = f.statut || 'actif';
  form.notes.value = f.notes || '';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.updateCommandeFournisseurStatus = async function(id, statut) {
  await jsonApi(`/api/commandes-fournisseurs/${id}/status`, 'PUT', { statut });
  await loadFournisseurs();
  toast('Statut commande fournisseur mis à jour.');
};

window.receiveCommandeFournisseur = async function(id) {
  if (!confirm('Réceptionner cette commande et ajouter les quantités au stock ?')) return;
  await api(`/api/commandes-fournisseurs/${id}/receive`, { method: 'POST' });
  await loadProduits();
  await loadFournisseurs();
  toast('Commande réceptionnée et stock mis à jour.');
};

setTimeout(() => {
  $('userAccountForm')?.addEventListener('submit', async e => {
    if (!$('userExtraPermissionsSelect')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    try {
      const obj = formToObject(e.target);
      obj.permissions_extra = selectedMultiValues($('userExtraPermissionsSelect'));
      const id = e.target.dataset.editId;
      if (id) await jsonApi(`/api/users/${id}`, 'PUT', obj);
      else await jsonApi('/api/users', 'POST', obj);
      resetUserAccountForm();
      await loadUsersAdmin();
      toast(id ? 'Utilisateur modifié.' : 'Compte créé / en attente.');
    } catch(err){ toast(err.message); }
  }, true);
  $('userCancelBtn')?.addEventListener('click', resetUserAccountForm);

  $('profileForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const data = new FormData(e.target);
      await api('/api/profile', { method: 'PUT', body: data });
      await loadProfile();
      toast('Profil mis à jour.');
    } catch (err) { toast(err.message); }
  });

  $('fournisseurForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const obj = formToObject(e.target);
      const id = obj.id; delete obj.id;
      if (id) await jsonApi(`/api/fournisseurs/${id}`, 'PUT', obj);
      else await jsonApi('/api/fournisseurs', 'POST', obj);
      e.target.reset();
      await loadFournisseurs();
      toast(id ? 'Fournisseur modifié.' : 'Fournisseur ajouté.');
    } catch (err) { toast(err.message); }
  });

  $('commandeFournisseurForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const obj = formToObject(e.target);
      obj.lignes = [{ produit_id: obj.produit_id, quantite: Number(obj.quantite || 0), prix_unitaire: Number(obj.prix_unitaire || 0) }];
      delete obj.id; delete obj.produit_id; delete obj.quantite; delete obj.prix_unitaire;
      await jsonApi('/api/commandes-fournisseurs', 'POST', obj);
      e.target.reset();
      await loadFournisseurs();
      toast('Commande fournisseur créée.');
    } catch (err) { toast(err.message); }
  });

  $('fournisseurSearch')?.addEventListener('input', renderFournisseurs);
}, 0);
