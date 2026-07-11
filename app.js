/* ============================================================
   내전 팀 나누기 - app.js
   users.xlsx 컬럼: 닉네임#태그 / 실명 / 최고티어
   ============================================================ */

const state = {
  players: [],        // {tag, name, tier}
  selected: [],        // array of tag strings (max 10)
  teamOf: {},           // tag -> 1 | 2 | null
  groupOf: {},          // tag -> 1 | 2 | 3 | null (그룹 기능)
  captains: [],         // array of tags (max 2)
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
  state.groupOf = {};
  state.captains = [];
  state.selected.forEach(tag => {
    state.teamOf[tag] = null;
    state.groupOf[tag] = null;
  });
  initTeamColumnsUI();
  renderTeamScreen();
  showScreen(2);
}

function getTierScoreExact(tier) {
  if (!tier) return 0;
  const ranks = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal'];
  const parts = tier.split(' ');
  const rank = parts[0];
  const num = parseInt(parts[1]) || 0;
  
  if (rank === 'Radiant') return 25;
  const idx = ranks.indexOf(rank);
  if (idx === -1) return 0;
  return (idx * 3) + num;
}

function sortSelected(asc = false) {
  state.selected.sort((a, b) => {
    const pA = getPlayerByTag(a);
    const pB = getPlayerByTag(b);
    const sA = getTierScoreExact(pA.tier);
    const sB = getTierScoreExact(pB.tier);
    return asc ? sA - sB : sB - sA;
  });
  renderTeamScreen();
}

function assignTeam(tag, teamNum) {
  // 팀장이 팀을 이동할 때, 상대 팀장과 팀이 겹치면 상대 팀장을 스왑 (강제 분리)
  if (state.captains.includes(tag)) {
    state.teamOf[tag] = teamNum;
    if (teamNum !== null) {
      const otherCap = state.captains.find(c => c !== tag);
      if (otherCap && state.teamOf[otherCap] === teamNum) {
        state.teamOf[otherCap] = teamNum === 1 ? 2 : 1;
      }
    }
  } else {
    // 그룹 로직 반영
    const group = state.groupOf[tag];
    if (group) {
      state.selected.forEach(t => {
        if (state.groupOf[t] === group) {
          state.teamOf[t] = teamNum;
        }
      });
    } else {
      state.teamOf[tag] = teamNum;
    }
  }
  renderTeamScreen();
}

function toggleCaptain(tag) {
  if (state.captains.includes(tag)) {
    state.captains = state.captains.filter(t => t !== tag);
  } else {
    if (state.captains.length >= 2) return;
    state.captains.push(tag);
    
    // 자동 배정 로직 (1번째 팀장은 1팀, 2번째 팀장은 무조건 반대팀)
    if (state.captains.length === 1) {
      assignTeam(tag, 1);
    } else if (state.captains.length === 2) {
      const firstCapTeam = state.teamOf[state.captains[0]] || 1;
      const secondCapTeam = firstCapTeam === 1 ? 2 : 1;
      assignTeam(tag, secondCapTeam);
    }
  }
  renderTeamScreen();
}

function wireControlButtons(chip, tag) {
  chip.querySelectorAll('.group-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const g = Number(btn.dataset.group);
      state.groupOf[tag] = (state.groupOf[tag] === g) ? null : g;
      renderTeamScreen();
    });
  });
  
  chip.querySelector('.cap-btn').addEventListener('click', () => {
    toggleCaptain(tag);
  });
}

function initTeamColumnsUI() {
  if(!$('#advantageBox')) {
    const columnsWrap = document.querySelector('.team-columns');
    columnsWrap.style.gridTemplateColumns = '1fr auto 1fr';
    
    const col1 = columnsWrap.children[0];
    const col2 = columnsWrap.children[1];
    
    const advCol = document.createElement('div');
    advCol.className = 'adv-col';
    advCol.innerHTML = '<div class="adv-box" id="advantageBox">대기중</div>';
    columnsWrap.insertBefore(advCol, col2);
    
    const avg1 = document.createElement('div');
    avg1.className = 'team-avg';
    avg1.id = 't1AvgBox';
    avg1.textContent = '평균: 0.00';
    col1.appendChild(avg1);
    
    const avg2 = document.createElement('div');
    avg2.className = 'team-avg';
    avg2.id = 't2AvgBox';
    avg2.textContent = '평균: 0.00';
    col2.appendChild(avg2);
  }
}

function updateAveragesUI() {
  const t1Tags = state.selected.filter(t => state.teamOf[t] === 1);
  const t2Tags = state.selected.filter(t => state.teamOf[t] === 2);
  
  let t1Sum = 0, t2Sum = 0;
  t1Tags.forEach(t => t1Sum += getTierScoreExact(getPlayerByTag(t).tier));
  t2Tags.forEach(t => t2Sum += getTierScoreExact(getPlayerByTag(t).tier));
  
  const t1Avg = t1Tags.length ? t1Sum / t1Tags.length : 0;
  const t2Avg = t2Tags.length ? t2Sum / t2Tags.length : 0;
  
  $('#t1AvgBox').textContent = t1Tags.length ? `평균: ${t1Avg.toFixed(2)}` : '평균: 0.00';
  $('#t2AvgBox').textContent = t2Tags.length ?
