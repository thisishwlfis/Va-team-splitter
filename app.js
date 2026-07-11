/* ============================================================
   내전 팀 나누기 - app.js
   users.xlsx 컬럼: 닉네임#태그 / 실명 / 최고티어
   ============================================================ */

const state = {
  players: [],        // {tag, name, tier}
  selected: [],        // array of tag strings (max 10)
  teamOf: {},           // tag -> 1 | 2 | null
  side: {}              // 1 -> 'attack'|'defense', 2 -> ...
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function showScreen(n){
  [1,2,3].forEach(i=>{
    $(`#screen-${i}`).classList.toggle('hidden', i !== n);
  });
  $$('#stepTrack .step').forEach(s=>{
    s.classList.toggle('active', Number(s.dataset.step) === n);
  });
}

/* ---------------- TIER BADGE FUNCTION ---------------- */
function getTierBadgeHtml(tier) {
  if (!tier) return '';
  
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
  
  const parts = tier.split(' ');
  const rank = parts[0];
  const num = parts[1] || '';
  
  let abbr = '';
  if (rank === 'Radiant') {
    abbr = 'R';
  } else if (rank === 'Immortal') {
    abbr = 'IM' + num;
  } else {
    abbr = rank.charAt(0) + num;
  }
  
  const c = TIER_COLORS[rank] || { bg:'#E7E7EA', text:'#6B6D76' };
  
  return `<span class="tier-badge" style="background:${c.bg}; color:${c.text};">${abbr}</span>`;
}

function getPlayerByTag(tag) {
  return state.players.find(p => p.tag === tag);
}

/* ---------------- LOAD DATA ---------------- */
async function loadPlayers(){
  try{
    const res = await fetch(`data/players.json?t=${Date.now()}`);
    if(!res.ok) throw new Error('data/players.json을 찾을 수 없습니다.');
    const raw = await res.json();

    state.players = raw
      .filter(r => r.tag && String(r.tag).trim() !== '')
      .map(r => ({
        tag: String(r.tag).trim(),
        name: String(r.name || '').trim(),
        tier: String(r.tier || '').trim()
      }));

    if(state.players.length === 0){
      throw new Error('참가자 데이터가 비어 있습니다. "참가자 관리" 페이지에서 추가해주세요.');
    }

    renderPlayerGrid();
  }catch(err){
    const box = $('#loadError');
    box.classList.remove('hidden');
    box.innerHTML = `<strong>데이터 로드 실패</strong><br>${err.message}<br><br>
      <a href="admin.html">참가자 관리</a> 페이지에서 데이터를 확인하거나 새로 추가해주세요.`;
  }
}

/* ---------------- SCREEN 1 : SELECT ---------------- */
function renderPlayerGrid(){
  const grid = $('#playerGrid');

  if(!$('#searchContainer')){
    const searchWrap = document.createElement('div');
    searchWrap.id = 'searchContainer';
    searchWrap.className = 'search-container';
    searchWrap.innerHTML = `
      <input type="text" id="playerSearch" placeholder="닉네임 또는 실명 검색..." autocomplete="off" />
      <div id="searchDropdown" class="search-dropdown hidden"></div>
    `;
    grid.parentNode.insertBefore(searchWrap, grid);

    const searchInput = $('#playerSearch');
    const searchDropdown = $('#searchDropdown');

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase().replace(/\s+/g, '');
      if(!query){
        searchDropdown.classList.add('hidden');
        return;
      }

      const matches = state.players.filter(p => {
        const tagNoSpace = String(p.tag).toLowerCase().replace(/\s+/g, '');
        const nameNoSpace = String(p.name || '').toLowerCase().replace(/\s+/g, '');
        
        const matchTag = tagNoSpace.includes(query);
        const matchNameExact = nameNoSpace === query;
        const matchNamePartial = query.length >= 2 && nameNoSpace.includes(query);

        return matchTag || matchNameExact || matchNamePartial;
      });

      if(matches.length === 0){
        searchDropdown.innerHTML = '<div class="dropdown-empty">검색 결과가 없습니다.</div>';
        searchDropdown.classList.remove('hidden');
        return;
      }

      searchDropdown.innerHTML = matches.map(p => {
        const isSelected = state.selected.includes(p.tag);
        return `<div class="dropdown-item ${isSelected ? 'selected' : ''}" data-tag="${escapeHtml(p.tag)}">
          <span class="dropdown-tag">${escapeHtml(p.tag)}</span>
          ${p.name ? `<span class="dropdown-name">${escapeHtml(p.name)}</span>` : ''}
          ${getTierBadgeHtml(p.tier)}
          ${isSelected ? '<span class="dropdown-check">[선택됨]</span>' : ''}
        </div>`;
      }).join('');

      searchDropdown.classList.remove('hidden');

      $$('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
          const tag = item.dataset.tag;
          toggleSelect(tag);
          
          searchInput.value = '';
          searchDropdown.classList.add('hidden');
          searchInput.focus();
        });
      });
    });

    document.addEventListener('click', (e) => {
      if(!searchWrap.contains(e.target)){
        searchDropdown.classList.add('hidden');
      }
    });
  }

  grid.innerHTML = '';
  state.players.forEach(p=>{
    const card = document.createElement('div');
    card.className = 'player-card';
    card.dataset.tag = p.tag;
    card.innerHTML = `
      <span class="checkbox">
        <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
          <path d="M1 4.5L4 7.5L10 1.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="player-name">${escapeHtml(p.tag)} ${getTierBadgeHtml(p.tier)}</span>
    `;
    card.addEventListener('click', () => toggleSelect(p.tag, card));
    grid.appendChild(card);
  });
  updateSelectUI();
}

function toggleSelect(tag, cardEl){
  const idx = state.selected.indexOf(tag);
  if(idx >= 0){
    state.selected.splice(idx, 1);
  }else{
    if(state.selected.length >= 10) return;
    state.selected.push(tag);
  }
  updateSelectUI();
}

function updateSelectUI(){
  $$('.player-card').forEach(card=>{
    const tag = card.dataset.tag;
    const isChecked = state.selected.includes(tag);
    card.classList.toggle('checked', isChecked);
    const atLimit = state.selected.length >= 10 && !isChecked;
    card.classList.toggle('disabled', atLimit);
  });
  $('#selectCount').textContent = `${state.selected.length} / 10 선택됨`;
  $('#btn1-next').disabled = state.selected.length !== 10;
}

/* ---------------- SCREEN 2 : TEAM ASSIGN ---------------- */
function enterScreen2(){
  state.teamOf = {};
  state.selected.forEach(tag => state.teamOf[tag] = null);
  renderTeamScreen();
  showScreen(2);
}

function renderTeamScreen(){
  const team1List = $('#team1List');
  const team2List = $('#team2List');
  const unassigned = $('#unassignedList');
  team1List.innerHTML = '';
  team2List.innerHTML = '';
  unassigned.innerHTML = '';

  state.selected.forEach(tag=>{
    const teamNum = state.teamOf[tag];
    const player = getPlayerByTag(tag);

    if(teamNum === 1 || teamNum === 2){
      const chip = document.createElement('div');
      chip.className = 'tag-chip';
      chip.innerHTML = `<span>${escapeHtml(tag)} ${getTierBadgeHtml(player.tier)}</span><button aria-label="제거">X</button>`;
      chip.querySelector('button').addEventListener('click', ()=>{
        state.teamOf[tag] = null;
        renderTeamScreen();
      });
      (teamNum === 1 ? team1List : team2List).appendChild(chip);
    }else{
      const chip = document.createElement('div');
      chip.className = 'unassigned-chip';
      const t1full = countTeam(1) >= 5;
      const t2full = countTeam(2) >= 5;
      chip.innerHTML = `
        <span>${escapeHtml(tag)} ${getTierBadgeHtml(player.tier)}</span>
        <button class="mini-btn" data-team="1" ${t1full ? 'disabled' : ''}>1팀</button>
        <button class="mini-btn" data-team="2" ${t2full ? 'disabled' : ''}>2팀</button>
      `;
      chip.querySelectorAll('button').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          state.teamOf[tag] = Number(btn.dataset.team);
          renderTeamScreen();
        });
      });
      unassigned.appendChild(chip);
    }
  });

  const c1 = countTeam(1), c2 = countTeam(2);
  $('#teamCounter').textContent = `1팀 ${c1}명 · 2팀 ${c2}명`;
  $('#btn2-next').disabled = !(c1 === 5 && c2 === 5);
}

function countTeam(n){
  return state.selected.filter(tag => state.teamOf[tag] === n).length;
}

/* ---------------- SCREEN 3 : RESULT ---------------- */
function enterScreen3(){
  renderResultLists();
  $('#side1').textContent = '-';
  $('#side1').className = 'side-badge';
  $('#side2').textContent = '-';
  $('#side2').className = 'side-badge';
  showScreen(3);
}

function renderResultLists(){
  const t1 = $('#resultTeam1');
  const t2 = $('#resultTeam2');
  t1.innerHTML = '';
  t2.innerHTML = '';
  state.selected.forEach(tag=>{
    const player = getPlayerByTag(tag);
    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.style.justifyContent = 'flex-start';
    chip.innerHTML = `<span>${escapeHtml(tag)} ${getTierBadgeHtml(player.tier)}</span>`;
    if(state.teamOf[tag] === 1) t1.appendChild(chip);
    if(state.teamOf[tag] === 2) t2.appendChild(chip);
  });
}

function rollSides(){
  const team1First = Math.random() < 0.5;
  const s1 = $('#side1');
  const s2 = $('#side2');
  s1.textContent = team1First ? '선공' : '선수비';
  s2.textContent = team1First ? '선수비' : '선공';
  s1.className = 'side-badge ' + (team1First ? 'attack' : 'defense');
  s2.className = 'side-badge ' + (team1First ? 'defense' : 'attack');
}

/* ---------------- UTIL ---------------- */
function escapeHtml(str){
  return str.replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/* ---------------- NAV WIRING ---------------- */
$('#btn1-next').addEventListener('click', enterScreen2);
$('#btn2-back').addEventListener('click', () => showScreen(1));
$('#btn2-next').addEventListener('click', enterScreen3);
$('#btn3-back').addEventListener('click', () => showScreen(2));
$('#btn3-roll').addEventListener('click', rollSides);

/* ---------------- INIT ---------------- */
loadPlayers();
