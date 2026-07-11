const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

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
  }else{
    showSetup();
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

init();
