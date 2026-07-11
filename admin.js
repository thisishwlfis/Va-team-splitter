const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ============================================================
   관리자 화면 비밀번호 잠금 (보조 장치)
   ⚠️ 이 값은 브라우저 코드에 그대로 남아있으므로 진짜 보안이 아닙니다.
   실수로 admin.html 링크를 눌러본 사람을 막는 정도의 용도입니다.
   실제 데이터 변경 권한은 이 브라우저에 저장하는 GitHub 토큰이 담당합니다.

   비밀번호를 바꾸려면: 브라우저 콘솔에서 아래를 실행해 해시를 구한 뒤
   ADMIN_PASSWORD_HASH 값을 교체하세요.
     crypto.subtle.digest('SHA-256', new TextEncoder().encode('원하는비밀번호'))
       .then(b => console.log(Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')))
   ============================================================ */
const ADMIN_PASSWORD_HASH = 'cbbd43db7343c78595d233d851d89a0f5435dd6c7cf6b57e0dbfd48ff5bf6aaa';
const ADMIN_SESSION_KEY = 'teamsplit_admin_unlocked';

async function sha256Hex(str){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isUnlocked(){
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1';
}

function showLogin(){
  $('#loginPanel').classList.remove('hidden');
  $('#setupPanel').classList.add('hidden');
  $('#editorPanel').classList.add('hidden');
}

$('#btnLogin').addEventListener('click', attemptLogin);
$('#loginPassword').addEventListener('keydown', (e) => {
  if(e.key === 'Enter') attemptLogin();
});

async function attemptLogin(){
  const errBox = $('#loginError');
  errBox.classList.add('hidden');
  const pw = $('#loginPassword').value;
  if(ADMIN_PASSWORD_HASH === 'REPLACE_WITH_YOUR_SHA256_HASH'){
    errBox.classList.remove('hidden');
    errBox.innerHTML = '<strong>설정 필요</strong><br>admin.js 상단의 ADMIN_PASSWORD_HASH가 아직 설정되지 않았습니다.';
    return;
  }
  const hash = await sha256Hex(pw);
  if(hash === ADMIN_PASSWORD_HASH){
    sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
    $('#loginPanel').classList.add('hidden');
    $('#loginPassword').value = '';
    init();
  }else{
    errBox.classList.remove('hidden');
    errBox.innerHTML = '<strong>비밀번호가 올바르지 않습니다.</strong>';
  }
}

const TIER_RANKS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal'];
const TIER_OPTIONS = TIER_RANKS.flatMap(rank => [1, 2, 3].map(n => `${rank} ${n}`));
TIER_OPTIONS.push('Radiant');

const TIER_COLORS = {
  Iron:      { bg: 'linear-gradient(135deg,#5B5E66,#34363B)', text: '#FFFFFF' },
  Bronze:    { bg: 'linear-gradient(135deg,#B27C4A,#7A4D26)', text: '#FFFFFF' },
  Silver:    { bg: 'linear-gradient(135deg,#D7D9DD,#A6AAB1)', text: '#26272B' },
  Gold:      { bg: 'linear-gradient(135deg,#F7D573,#DDAA2A)', text: '#3A2C00' },
  Platinum:  { bg: 'linear-gradient(135deg,#33D0C3,#0E8377)', text: '#FFFFFF' },
  Diamond:   { bg: 'linear-gradient(135deg,#C1A2FF,#7C4DFF)', text: '#FFFFFF' },
  Ascendant: { bg: 'linear-gradient(135deg,#42DA84,#0F8C48)', text: '#FFFFFF' },
  Immortal:  { bg: 'linear-gradient(135deg,#C13E7B,#6E1339)', text: '#FFFFFF' },
  Radiant:   { bg: 'linear-gradient(135deg,#FFEBA8,#FFD65C)', text: '#5C4300' }
};

let currentSha = null;
let players = [];

function init(){
  if(GitHubStore.hasConfig()){
    showEditor();
    loadPlayers();
    loadPendingRequests();
  }else{
    showSetup();
  }
}

function boot(){
  if(isUnlocked()){
    init();
  }else{
    showLogin();
  }
}

function showSetup(prefill){
  $('#setupPanel').classList.remove('hidden');
  $('#editorPanel').classList.add('hidden');
  const cfg = prefill || GitHubStore.getConfig() || {};
  $('#cfgOwner').value = cfg.owner || '';
  $('#cfgRepo').value = cfg.repo || '';
  $('#cfgBranch').value = cfg.branch || 'main';
  $('#cfgPath').value = cfg.path || 'data/players.json';
  $('#cfgToken').value = '';
}

function showEditor(){
  $('#setupPanel').classList.add('hidden');
  $('#editorPanel').classList.remove('hidden');
}

$('#btnSaveConfig').addEventListener('click', () => {
  const cfg = {
    owner: $('#cfgOwner').value.trim(),
    repo: $('#cfgRepo').value.trim(),
    branch: $('#cfgBranch').value.trim() || 'main',
    path: $('#cfgPath').value.trim() || 'data/players.json',
    token: $('#cfgToken').value.trim()
  };
  if(!cfg.owner || !cfg.repo || !cfg.token){
    alert('owner, repo, token은 필수입니다.');
    return;
  }
  GitHubStore.saveConfig(cfg);
  showEditor();
  loadPlayers();
});

$('#btnReconfigure').addEventListener('click', () => {
  showSetup();
});

async function loadPlayers(){
  const status = $('#editorStatus');
  const errBox = $('#adminError');
  errBox.classList.add('hidden');
  status.textContent = '불러오는 중...';
  try{
    const cfg = GitHubStore.getConfig();
    const result = await GitHubStore.fetchFile(cfg);
    currentSha = result.sha;
    players = result.players || [];
    status.textContent = `${players.length}명 불러옴`;
    renderRows();
  }catch(err){
    status.textContent = '';
    errBox.classList.remove('hidden');
    errBox.innerHTML = `<strong>불러오기 실패</strong><br>${escapeHtml(err.message)}`;
  }
}

function renderRows(){
  const wrap = $('#playerRows');
  wrap.innerHTML = '';
  players.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'admin-row';

    const { rank, num } = parseTier(p.tier);
    const c = tierColor(rank);
    const triggerLabel = rank ? (rank === 'Radiant' ? 'Radiant' : `${rank} ${num || ''}`.trim()) : '티어 선택';
    const triggerStyle = rank
      ? `background:${c.bg}; color:${c.text};`
      : `background:#F0F0F2; color:#9A9BA3; border:1.5px dashed #D8D9DE;`;

    row.innerHTML = `
      <input type="text" data-field="tag" data-idx="${idx}" value="${escapeAttr(p.tag)}" placeholder="닉네임#태그" />
      <input type="text" data-field="name" data-idx="${idx}" value="${escapeAttr(p.name)}" placeholder="실명" />
      <button type="button" class="tier-trigger" data-idx="${idx}" style="${triggerStyle}">${escapeHtml(triggerLabel)}</button>
      <button class="row-delete" data-idx="${idx}" aria-label="삭제">✕</button>
      <div class="tier-panel" data-idx="${idx}">
        <div class="tier-panel-inner">${buildTierGroupsHtml(idx, p.tier)}</div>
      </div>
    `;
    wrap.appendChild(row);
  });

  wrap.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.idx);
      const field = inp.dataset.field;
      players[idx][field] = inp.value;
    });
  });
  wrap.querySelectorAll('.row-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      players.splice(idx, 1);
      renderRows();
    });
  });
  wireTierPickers(wrap);
}

/* ---------------- CUSTOM TIER PICKER (inline expanding panel) ---------------- */
function parseTier(value){
  if(!value) return { rank:null, num:null };
  if(value === 'Radiant') return { rank:'Radiant', num:null };
  const parts = value.split(' ');
  return { rank: parts[0], num: parts[1] || null };
}

function tierColor(rank){
  return TIER_COLORS[rank] || { bg:'#E7E7EA', text:'#6B6D76' };
}

function buildTierGroupsHtml(idx, currentValue){
  const { rank, num } = parseTier(currentValue);

  const groupsHtml = TIER_RANKS.map(r => {
    const rc = tierColor(r);
    const numsHtml = [1,2,3].map(n => {
      const active = (rank === r && String(num) === String(n));
      return `<button type="button" class="tier-num-btn ${active ? 'active' : ''}" data-idx="${idx}" data-rank="${r}" data-num="${n}">${n}</button>`;
    }).join('');
    return `
      <div class="tier-group">
        <span class="tier-chip" style="background:${rc.bg}; color:${rc.text};">${r}</span>
        <div class="tier-nums">${numsHtml}</div>
      </div>`;
  }).join('');

  const radiantActive = rank === 'Radiant';
  const rc = tierColor('Radiant');
  const radiantHtml = `
    <div class="tier-group tier-group-radiant">
      <button type="button" class="tier-chip tier-chip-btn ${radiantActive ? 'active' : ''}" style="background:${rc.bg}; color:${rc.text};" data-idx="${idx}" data-rank="Radiant" data-num="">Radiant</button>
    </div>`;

  return groupsHtml + radiantHtml;
}

function closeAllTierPanels(scope){
  (scope || document).querySelectorAll('.tier-panel.open').forEach(p => p.classList.remove('open'));
}

function wireTierPickers(wrap){
  wrap.querySelectorAll('.tier-trigger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = btn.dataset.idx;
      const panel = wrap.querySelector(`.tier-panel[data-idx="${idx}"]`);
      const wasOpen = panel.classList.contains('open');
      closeAllTierPanels(wrap);
      if(!wasOpen) panel.classList.add('open');
    });
  });

  wrap.querySelectorAll('.tier-num-btn, .tier-chip-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      const rank = btn.dataset.rank;
      const num = btn.dataset.num;
      players[idx].tier = rank === 'Radiant' ? 'Radiant' : `${rank} ${num}`;
      renderRows();
    });
  });
}

document.addEventListener('click', (e) => {
  if(!e.target.closest('.tier-panel') && !e.target.closest('.tier-trigger')){
    closeAllTierPanels(document);
  }
});

$('#btnAddRow').addEventListener('click', () => {
  players.push({ tag:'', name:'', tier:'' });
  renderRows();
  const inputs = $$('#playerRows .admin-row input[data-field="tag"]');
  if(inputs.length) inputs[inputs.length - 1].focus();
});

$('#btnSave').addEventListener('click', async () => {
  const msgBox = $('#saveMsg');
  msgBox.classList.add('hidden');

  const cleaned = players
    .map(p => ({ tag: (p.tag||'').trim(), name: (p.name||'').trim(), tier: (p.tier||'').trim() }))
    .filter(p => p.tag !== '');

  const btn = $('#btnSave');
  btn.disabled = true;
  btn.textContent = '저장 중...';

  try{
    const cfg = GitHubStore.getConfig();
    const result = await GitHubStore.saveFile(cfg, cleaned, currentSha);
    currentSha = result.content ? result.content.sha : currentSha;
    players = cleaned;
    renderRows();
    $('#editorStatus').textContent = `${players.length}명 · 마지막 저장: 방금`;
    msgBox.classList.remove('hidden');
    msgBox.style.background = '#F3FBF4';
    msgBox.style.borderColor = '#BEE3C4';
    msgBox.style.color = '#1E7A32';
    msgBox.innerHTML = '<strong>저장 완료.</strong> GitHub Pages에 반영되기까지 약 30초~1분 정도 걸릴 수 있습니다.';
  }catch(err){
    msgBox.classList.remove('hidden');
    msgBox.style.background = '';
    msgBox.style.borderColor = '';
    msgBox.style.color = '';
    msgBox.innerHTML = `<strong>저장 실패</strong><br>${escapeHtml(err.message)}`;
  }finally{
    btn.disabled = false;
    btn.textContent = 'GitHub에 저장';
  }
});

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function escapeAttr(str){ return escapeHtml(str); }

/* ---------------- PENDING REGISTRATION REQUESTS ---------------- */

async function loadPendingRequests(){
  const status = $('#pendingStatus');
  const list = $('#pendingList');
  status.textContent = '불러오는 중...';
  try{
    const cfg = GitHubStore.getConfig();
    const pending = await GitHubStore.fetchPendingRequests(cfg);
    status.textContent = `${pending.length}건 대기 중`;
    renderPendingList(pending);
  }catch(err){
    status.textContent = '';
    list.innerHTML = `<div class="load-error">${escapeHtml(err.message)}</div>`;
  }
}

function renderPendingList(pending){
  const list = $('#pendingList');
  list.innerHTML = '';
  if(pending.length === 0){
    list.innerHTML = '<div class="pending-empty">대기 중인 신청이 없습니다.</div>';
    return;
  }
  pending.forEach(issue => {
    const card = document.createElement('div');
    card.className = 'pending-card';
    const rowsHtml = issue.players.map(p => `
      <div class="pending-player-row">
        <span class="p-tag">${escapeHtml(p.tag || '')}</span>
        <span class="p-name">${escapeHtml(p.name || '-')}</span>
        <span class="p-tier">${escapeHtml(p.tier || '-')}</span>
      </div>
    `).join('');
    card.innerHTML = `
      <div class="pending-card-head">
        <span class="pending-card-title">${escapeHtml(issue.title)}</span>
        <span class="pending-card-time">${new Date(issue.createdAt).toLocaleString('ko-KR')}</span>
      </div>
      ${rowsHtml}
      <div class="pending-card-actions">
        <button class="btn-approve" data-issue="${issue.number}">승인 · 명단에 추가</button>
        <button class="btn-reject" data-issue="${issue.number}">반려</button>
        <a href="${issue.url}" target="_blank" class="mini-btn" style="text-decoration:none; align-self:center;">이슈 보기</a>
      </div>
    `;
    list.appendChild(card);

    card.querySelector('.btn-approve').addEventListener('click', () => approveRequest(issue));
    card.querySelector('.btn-reject').addEventListener('click', () => rejectRequest(issue));
  });
}

async function approveRequest(issue){
  const cfg = GitHubStore.getConfig();
  const buttons = $$(`.pending-card-actions button[data-issue="${issue.number}"]`);
  buttons.forEach(b => b.disabled = true);
  try{
    const additions = issue.players
      .map(p => ({ tag:(p.tag||'').trim(), name:(p.name||'').trim(), tier:(p.tier||'').trim() }))
      .filter(p => p.tag !== '');
    const merged = players.concat(additions);
    const result = await GitHubStore.saveFile(cfg, merged, currentSha);
    currentSha = result.content ? result.content.sha : currentSha;
    players = merged;
    renderRows();
    $('#editorStatus').textContent = `${players.length}명 · 마지막 저장: 방금`;

    await GitHubStore.closeIssue(cfg, issue.number, '승인되어 참가자 명단에 반영되었습니다.');
    loadPendingRequests();
  }catch(err){
    alert(`승인 처리 실패: ${err.message}`);
    buttons.forEach(b => b.disabled = false);
  }
}

async function rejectRequest(issue){
  if(!confirm('이 신청을 반려하시겠습니까? (명단에는 추가되지 않고 이슈만 닫힙니다)')) return;
  const cfg = GitHubStore.getConfig();
  const buttons = $$(`.pending-card-actions button[data-issue="${issue.number}"]`);
  buttons.forEach(b => b.disabled = true);
  try{
    await GitHubStore.closeIssue(cfg, issue.number, '반려되어 명단에 반영되지 않았습니다.');
    loadPendingRequests();
  }catch(err){
    alert(`반려 처리 실패: ${err.message}`);
    buttons.forEach(b => b.disabled = false);
  }
}

$('#btnRefreshPending').addEventListener('click', loadPendingRequests);

boot();
