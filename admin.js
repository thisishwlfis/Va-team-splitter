const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

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
    row.innerHTML = `
      <input type="text" data-field="tag" data-idx="${idx}" value="${escapeAttr(p.tag)}" placeholder="닉네임#태그" />
      <input type="text" data-field="name" data-idx="${idx}" value="${escapeAttr(p.name)}" placeholder="실명" />
      <input type="text" data-field="tier" data-idx="${idx}" value="${escapeAttr(p.tier)}" placeholder="최고티어" />
      <button class="row-delete" data-idx="${idx}" aria-label="삭제">✕</button>
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
}

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
