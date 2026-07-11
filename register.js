/* ============================================================
   register.js
   일반 참가자용 "등록 신청" 폼.
   보안을 위해 이 페이지는 GitHub 쓰기 토큰을 전혀 사용하지 않습니다.
   대신 신청 내용을 GitHub "새 이슈 작성" 화면에 미리 채워 넣고,
   방문자가 직접 GitHub 계정으로 로그인해 "Submit new issue"를
   눌러 제출하는 방식입니다. 관리자는 admin.html에서 이 이슈들을
   확인하고 승인/반려할 수 있습니다.

   ⚠️ 아래 3줄(OWNER, REPO, BRANCH)은 이 사이트를 배포하는 사람이
   자신의 저장소 정보로 한 번만 수정하면 됩니다. owner/repo 이름은
   민감정보가 아니며(이미 사이트 주소에 노출됨), 토큰은 여기 들어가지 않습니다.
   ============================================================ */
const OWNER = 'thisishwlfis';
const REPO = 'Va-team-splitter';
const REG_LABEL = 'registration-pending';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const TIER_RANKS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal'];

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

let players = [{ tag:'', name:'', tier:'' }];

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

function renderRows(){
  const wrap = $('#playerRows');
  wrap.innerHTML = '';
  players.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'admin-row no-delete';

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
  wireTierPickers(wrap);
}

$('#btnAddRow').addEventListener('click', () => {
  players.push({ tag:'', name:'', tier:'' });
  renderRows();
  const inputs = $$('#playerRows .admin-row input[data-field="tag"]');
  if(inputs.length) inputs[inputs.length - 1].focus();
});

$('#btnSubmit').addEventListener('click', () => {
  const msgBox = $('#submitMsg');
  msgBox.classList.add('hidden');

  const cleaned = players
    .map(p => ({ tag: (p.tag||'').trim(), name: (p.name||'').trim(), tier: (p.tier||'').trim() }))
    .filter(p => p.tag !== '');

  if(cleaned.length === 0){
    msgBox.classList.remove('hidden');
    msgBox.innerHTML = '<strong>닉네임#태그를 최소 1명 이상 입력해주세요.</strong>';
    return;
  }
  if(OWNER === 'YOUR_GITHUB_ID' || REPO === 'YOUR_REPO_NAME'){
    msgBox.classList.remove('hidden');
    msgBox.innerHTML = '<strong>사이트 설정 오류</strong><br>register.js 상단의 OWNER/REPO 값이 아직 설정되지 않았습니다. 관리자에게 문의하세요.';
    return;
  }

  const title = cleaned.length === 1
    ? `[등록신청] ${cleaned[0].tag}`
    : `[등록신청] ${cleaned[0].tag} 외 ${cleaned.length - 1}명`;

  const listText = cleaned.map(p =>
    `- **${p.tag}** / 실명: ${p.name || '-'} / 최고티어: ${p.tier || '-'}`
  ).join('\n');

  const body =
`### 참가자 등록 신청

${listText}

---
관리자는 참가자 관리 페이지의 "등록 신청 대기 목록"에서 이 신청을 승인/반려할 수 있습니다.

<!-- REG_DATA
${JSON.stringify(cleaned)}
-->`;

  const url = `https://github.com/${OWNER}/${REPO}/issues/new`
    + `?title=${encodeURIComponent(title)}`
    + `&body=${encodeURIComponent(body)}`
    + `&labels=${encodeURIComponent(REG_LABEL)}`;

  window.open(url, '_blank');

  msgBox.classList.remove('hidden');
  msgBox.style.background = '#F3FBF4';
  msgBox.style.borderColor = '#BEE3C4';
  msgBox.style.color = '#1E7A32';
  msgBox.innerHTML = '<strong>새 탭이 열렸습니다.</strong> GitHub 화면에서 "Submit new issue" 버튼을 눌러야 신청이 최종 접수됩니다.';
});

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function escapeAttr(str){ return escapeHtml(str); }

renderRows();
