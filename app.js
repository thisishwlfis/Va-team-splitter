/* ============================================================
   MatchSplit - app.js
   users.xlsx 컬럼: 닉네임#태그 / 실명 / 최고티어
   ============================================================ */

const MAPS = ['스플릿', '바인드', '헤이븐', '어센트', '아이스박스', '브리즈', '프랙처', '펄', '로터스', '선셋', '어비스', '코로드', '서밋'];

/* 맵 사진 파일명 매핑. assets/maps/ 폴더에 아래 파일명으로 사진을 넣으면 자동 적용됩니다.
   (예: assets/maps/split.jpg, assets/maps/bind.jpg ...) 사진이 없으면 기존 색상
   그라데이션으로 자연스럽게 대체됩니다. */
const MAP_IMAGE_SLUGS = {
  '스플릿': 'split',
  '바인드': 'bind',
  '헤이븐': 'haven',
  '어센트': 'ascent',
  '아이스박스': 'icebox',
  '브리즈': 'breeze',
  '프랙처': 'fracture',
  '펄': 'pearl',
  '로터스': 'lotus',
  '선셋': 'sunset',
  '어비스': 'abyss',
  '코로드': 'corrode',
  '서밋': 'summit'
};
const MAP_IMAGE_DIR = 'assets/maps';
const MAP_IMAGE_EXT = 'webp';

function buildMapCardBackground(mapName){
  const slug = MAP_IMAGE_SLUGS[mapName];
  const photoLayer = slug ? `url('${MAP_IMAGE_DIR}/${slug}.${MAP_IMAGE_EXT}')` : 'none';
  const fallbackGradient = getMapGradient(mapName);
  // 오른쪽에서 왼쪽으로 상자 폭의 약 45%를 채우는 그라데이션(진함 -> 투명) +
  // 전체적으로 은은한 어둡기(가독성용) + 사진 + 사진 없을 때 대비용 색상 그라데이션
  return [
    `background-image:` +
      `linear-gradient(to left, rgba(8,9,12,0.95) 0%, rgba(8,9,12,0.95) 10%, rgba(8,9,12,0.5) 45%, rgba(8,9,12,0.18) 100%),` +
      `${photoLayer},` +
      `${fallbackGradient}`,
    `background-size: cover, cover, cover`,
    `background-position: center, center, center`,
    `background-repeat: no-repeat, no-repeat, no-repeat`
  ].join(';') + ';';
}

const state = {
  players: [],        // {tag, name, tier}
  selected: [],        // array of tag strings (max 10)
  teamOf: {},           // tag -> 1 | 2 | null
  groupOf: {},          // tag -> 1 | 2 | 3 | null (그룹 기능)
  captains: [],         // array of tags (max 2)
  bo: null,             // 3 | 5 | 7 | 9
  teamMaps: { 1: [], 2: [] }, // tag -> selected maps per team
  mapAssignments: []    // [{game, map, source: 'team1'|'team2'|'common'}]
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function showScreen(n){
  [1,2,3,4].forEach(i=>{
    $(`#screen-${i}`).classList.toggle('hidden', i !== n);
  });
  $$('#stepTrack .step').forEach(s=>{
    s.classList.toggle('active', Number(s.dataset.step) === n);
  });
  state.maxReachedScreen = Math.max(state.maxReachedScreen || 1, n);
  updateStepTrackUI();
}

/* ---------------- TIER BADGE FUNCTION ---------------- */
function getTierBadgeHtml(tier) {
  if (!tier) return '';
  
  const TIER_COLORS = {
    Iron:      { bg: 'linear-gradient(135deg,#5B5E66,#34363B)', text: '#FFFFFF' },
    Bronze:    { bg: 'linear-gradient(135deg,#B27C4A,#7A4D26)', text: '#FFFFFF' },
    Silver:    { bg: 'linear-gradient(135deg,#D7D9DD,#A6AAB1)', text: '#FFFFFF' },
    Gold:      { bg: 'linear-gradient(135deg,#F7D573,#DDAA2A)', text: '#FFFFFF' },
    Platinum:  { bg: 'linear-gradient(135deg,#33D0C3,#0E8377)', text: '#FFFFFF' },
    Diamond:   { bg: 'linear-gradient(135deg,#C1A2FF,#7C4DFF)', text: '#FFFFFF' },
    Ascendant: { bg: 'linear-gradient(135deg,#42DA84,#0F8C48)', text: '#FFFFFF' },
    Immortal:  { bg: 'linear-gradient(135deg,#C13E7B,#6E1339)', text: '#FFFFFF' },
    Radiant:   { bg: 'linear-gradient(135deg,#FFEBA8,#FFD65C)', text: '#FFFFFF' }
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
  
  const c = TIER_COLORS[rank] || { bg:'#E7E7EA', text:'#FFFFFF' };
  
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
      const query = e.target.value.trim().toLowerCase().replace(/\\s+/g, '');
      if(!query){
        searchDropdown.classList.add('hidden');
        return;
      }

      const matches = state.players.filter(p => {
        const tagNoSpace = String(p.tag).toLowerCase().replace(/\\s+/g, '');
        const nameNoSpace = String(p.name || '').toLowerCase().replace(/\\s+/g, '');
        
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
    card.className = 'player-card' + (p.temp ? ' temp-player' : '');
    card.dataset.tag = p.tag;
    card.innerHTML = `
      <span class="checkbox">
        <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
          <path d="M1 4.5L4 7.5L10 1.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="player-name">${escapeHtml(p.tag)} ${getTierBadgeHtml(p.tier)}${p.temp ? '<span class="temp-badge">임시</span>' : ''}</span>
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

function getTierFromScore(score) {
  if (score <= 0) return null;
  let floored = Math.floor(score);
  if (floored < 1) floored = 1; 
  if (floored >= 25) return 'Radiant';

  const ranks = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal'];
  const rankIdx = Math.floor((floored - 1) / 3);
  const num = ((floored - 1) % 3) + 1;

  if (rankIdx >= ranks.length) return 'Radiant';
  return `${ranks[rankIdx]} ${num}`;
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
  if (state.captains.includes(tag)) {
    state.teamOf[tag] = teamNum;
    if (teamNum !== null) {
      const otherCap = state.captains.find(c => c !== tag);
      if (otherCap && state.teamOf[otherCap] === teamNum) {
        state.teamOf[otherCap] = teamNum === 1 ? 2 : 1;
      }
    }
  } else {
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
    avg1.textContent = '평균 : -';
    col1.appendChild(avg1);
    
    const avg2 = document.createElement('div');
    avg2.className = 'team-avg';
    avg2.id = 't2AvgBox';
    avg2.textContent = '평균 : -';
    col2.appendChild(avg2);
  }
}

function updateAveragesUI() {
  const t1Tags = state.selected.filter(t => state.teamOf[t] === 1);
  const t2Tags = state.selected.filter(t => state.teamOf[t] === 2);
  
  let t1Sum = 0, t2Sum = 0;
  t1Tags.forEach(t => t1Sum += getTierScoreExact(getPlayerByTag(t).tier));
  t2Tags.forEach(t => t2Sum += getTierScoreExact(getPlayerByTag(t).tier));
  
  const t1Avg = t1Sum / 5;
  const t2Avg = t2Sum / 5;
  
  const t1TierName = getTierFromScore(t1Avg);
  const t2TierName = getTierFromScore(t2Avg);
  
  $('#t1AvgBox').innerHTML = t1TierName ? `평균 : <span>${t1TierName}</span> ${getTierBadgeHtml(t1TierName)}` : '평균 : -';
  $('#t2AvgBox').innerHTML = t2TierName ? `평균 : <span>${t2TierName}</span> ${getTierBadgeHtml(t2TierName)}` : '평균 : -';
  
  const advBox = $('#advantageBox');
  if (t1Sum > 0 || t2Sum > 0) {
     const diff = Math.abs(t1Avg - t2Avg);
     const diffText = parseFloat(diff.toFixed(2)) + '티어 우세';
     
     if (t1Avg > t2Avg) {
        advBox.innerHTML = `TEAM 1<br><span class="diff">${diffText}</span>`;
     } else if (t2Avg > t1Avg) {
        advBox.innerHTML = `TEAM 2<br><span class="diff">${diffText}</span>`;
     } else {
        advBox.innerHTML = `동일<br><span class="diff">차이 없음</span>`;
     }
  } else {
     advBox.innerHTML = `대기중`;
  }
}

function renderTeamScreen(){
  const team1List = $('#team1List');
  const team2List = $('#team2List');
  const unassigned = $('#unassignedList');
  team1List.innerHTML = '';
  team2List.innerHTML = '';
  unassigned.innerHTML = '';

  if(!$('#sortControls')) {
    const sortControls = document.createElement('div');
    sortControls.id = 'sortControls';
    sortControls.className = 'sort-controls';
    sortControls.innerHTML = `
      <button class="mini-btn" id="btnSortDesc">티어 내림차순</button>
      <button class="mini-btn" id="btnSortAsc">티어 오름차순</button>
    `;
    $('#unassignedList').parentNode.insertBefore(sortControls, $('#unassignedList'));

    $('#btnSortDesc').addEventListener('click', () => sortSelected(false));
    $('#btnSortAsc').addEventListener('click', () => sortSelected(true));
  }

  state.selected.forEach(tag=>{
    const teamNum = state.teamOf[tag];
    const player = getPlayerByTag(tag);
    const groupNum = state.groupOf[tag];
    const isCap = state.captains.includes(tag);
    const capDisabled = !isCap && state.captains.length >= 2 ? 'disabled' : '';
    
    const controlsHtml = `
      <div class="chip-bottom">
        <div class="group-controls">
          <span class="group-label">그룹</span>
          <button class="group-btn ${groupNum === 1 ? 'active' : ''}" data-group="1">1</button>
          <button class="group-btn ${groupNum === 2 ? 'active' : ''}" data-group="2">2</button>
          <button class="group-btn ${groupNum === 3 ? 'active' : ''}" data-group="3">3</button>
        </div>
        <button class="cap-btn ${isCap ? 'active' : ''}" data-tag="${tag}" ${capDisabled}>팀장</button>
      </div>
    `;

    if(teamNum === 1 || teamNum === 2){
      const chip = document.createElement('div');
      chip.className = 'tag-chip has-group';
      chip.innerHTML = `
        <div class="chip-top">
          <span>${escapeHtml(tag)} ${getTierBadgeHtml(player.tier)}</span>
          <button class="remove-btn" aria-label="제거">✕</button>
        </div>
        ${controlsHtml}
      `;
      chip.querySelector('.remove-btn').addEventListener('click', ()=>{
        assignTeam(tag, null);
      });
      wireControlButtons(chip, tag);
      (teamNum === 1 ? team1List : team2List).appendChild(chip);
    }else{
      const chip = document.createElement('div');
      chip.className = 'unassigned-chip has-group';
      
      const groupSize = groupNum ? state.selected.filter(t => state.groupOf[t] === groupNum).length : 1;
      const t1full = countTeam(1) + groupSize > 5;
      const t2full = countTeam(2) + groupSize > 5;

      chip.innerHTML = `
        <div class="chip-top">
          <span>${escapeHtml(tag)} ${getTierBadgeHtml(player.tier)}</span>
          <div class="team-btns">
            <button class="mini-btn team-btn" data-team="1" ${t1full ? 'disabled' : ''}>1팀</button>
            <button class="mini-btn team-btn" data-team="2" ${t2full ? 'disabled' : ''}>2팀</button>
          </div>
        </div>
        ${controlsHtml}
      `;
      chip.querySelectorAll('.team-btn').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          assignTeam(tag, Number(btn.dataset.team));
        });
      });
      wireControlButtons(chip, tag);
      unassigned.appendChild(chip);
    }
  });

  updateAveragesUI();

  const c1 = countTeam(1), c2 = countTeam(2);
  $('#teamCounter').textContent = `1팀 ${c1}명 · 2팀 ${c2}명`;
  $('#btn2-next').disabled = !(c1 === 5 && c2 === 5);
}

function countTeam(n){
  return state.selected.filter(tag => state.teamOf[tag] === n).length;
}

/* ---------------- TEAM AUTO-BALANCE ---------------- */
function buildBalanceUnits(){
  // 팀장은 이미 배정된 팀에 고정. 그룹은 팀장이 아닌 멤버들끼리 묶어서 하나의 단위로 취급.
  const captainTeamOf = {};
  state.captains.forEach(tag => { captainTeamOf[tag] = state.teamOf[tag] || null; });

  const seenGroups = {};
  const units = [];

  state.selected.forEach(tag => {
    if (state.captains.includes(tag)) return; // 팀장은 유닛에 포함하지 않음(고정)
    const g = state.groupOf[tag];
    if (g) {
      if (seenGroups[g]) {
        seenGroups[g].tags.push(tag);
        seenGroups[g].score += getTierScoreExact(getPlayerByTag(tag).tier);
      } else {
        const unit = { tags: [tag], score: getTierScoreExact(getPlayerByTag(tag).tier) };
        seenGroups[g] = unit;
        units.push(unit);
      }
    } else {
      units.push({ tags: [tag], score: getTierScoreExact(getPlayerByTag(tag).tier) });
    }
  });

  return { units, captainTeamOf };
}

function computeBalanceOptions(){
  const { units, captainTeamOf } = buildBalanceUnits();

  let cap1Count = 0, cap1Score = 0, cap2Count = 0, cap2Score = 0;
  Object.keys(captainTeamOf).forEach(tag => {
    const t = captainTeamOf[tag];
    const score = getTierScoreExact(getPlayerByTag(tag).tier);
    if (t === 1) { cap1Count++; cap1Score += score; }
    else if (t === 2) { cap2Count++; cap2Score += score; }
  });

  const team1NeedSlots = 5 - cap1Count;
  const team2NeedSlots = 5 - cap2Count;

  if (team1NeedSlots < 0 || team2NeedSlots < 0) return [];

  const n = units.length;
  const results = [];
  const totalCombos = Math.pow(2, n);

  // n이 매우 크면(그룹핑 없이 10명 모두 유닛일 때 최대 8~10) 2^n은 충분히 작아 완전탐색 가능
  for (let mask = 0; mask < totalCombos; mask++){
    let size1 = 0, score1 = 0;
    const team1Tags = [];
    const team2Tags = [];
    for (let i = 0; i < n; i++){
      const unit = units[i];
      if (mask & (1 << i)){
        size1 += unit.tags.length;
        score1 += unit.score;
        team1Tags.push(...unit.tags);
      } else {
        team2Tags.push(...unit.tags);
      }
    }
    if (size1 !== team1NeedSlots) continue;

    const finalT1Score = cap1Score + score1;
    const totalScore = cap1Score + cap2Score + units.reduce((s,u)=>s+u.score,0);
    const finalT2Score = totalScore - finalT1Score;

    const avg1 = finalT1Score / 5;
    const avg2 = finalT2Score / 5;
    const diff = Math.abs(avg1 - avg2);

    const capTeam1Tags = state.captains.filter(t => captainTeamOf[t] === 1);
    const capTeam2Tags = state.captains.filter(t => captainTeamOf[t] === 2);

    results.push({
      diff,
      team1Tags: [...capTeam1Tags, ...team1Tags],
      team2Tags: [...capTeam2Tags, ...team2Tags],
      avg1, avg2
    });
  }

  results.sort((a,b) => a.diff - b.diff);

  // 팀1/팀2 멤버 구성이 동일한(중복) 조합 제거 후 상위 3개 선택
  const seen = new Set();
  const distinct = [];
  for (const r of results){
    const key = [...r.team1Tags].sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(r);
    if (distinct.length >= 3) break;
  }
  return distinct;
}

function renderBalanceOption(option, idx){
  const rankLabel = ['최적 조합', '2순위 조합', '3순위 조합'][idx] || `${idx+1}순위`;
  const diffText = parseFloat(option.diff.toFixed(2));
  const playerRow = (tag) => {
    const p = getPlayerByTag(tag);
    const isCap = state.captains.includes(tag);
    return `<div class="balance-option-player${isCap ? ' is-captain' : ''}"><span class="bp-flag">${isCap ? 'C' : ''}</span><span class="bp-name">${escapeHtml(tag)}</span><span class="bp-tier">${getTierBadgeHtml(p.tier)}</span></div>`;
  };
  return `
    <button type="button" class="balance-option" data-idx="${idx}">
      <span class="balance-option-rank">${rankLabel}</span>
      <div class="balance-option-diff">티어 차이 <span>${diffText}</span></div>
      <div class="balance-option-teams">
        <div>
          <div class="balance-option-team-title">TEAM 1</div>
          ${option.team1Tags.map(playerRow).join('')}
        </div>
        <div>
          <div class="balance-option-team-title">TEAM 2</div>
          ${option.team2Tags.map(playerRow).join('')}
        </div>
      </div>
    </button>
  `;
}

let lastBalanceOptions = [];

function openBalanceOverlay(){
  const c1 = countTeam(1), c2 = countTeam(2);
  const unassignedCount = state.selected.length - c1 - c2;
  const options = computeBalanceOptions();
  lastBalanceOptions = options;

  const box = $('#balanceOptions');
  if (options.length === 0){
    box.innerHTML = `<div class="balance-empty">현재 팀장/그룹 설정으로는 5:5로 나눌 수 있는 조합을 찾지 못했습니다.<br>그룹 인원 구성을 확인해주세요.</div>`;
  } else {
    box.innerHTML = options.map((opt, idx) => renderBalanceOption(opt, idx)).join('');
    box.querySelectorAll('.balance-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        applyBalanceOption(lastBalanceOptions[idx]);
        closeBalanceOverlay();
      });
    });
  }
  $('#balanceOverlay').classList.remove('hidden');
}

function closeBalanceOverlay(){
  $('#balanceOverlay').classList.add('hidden');
}

function applyBalanceOption(option){
  if (!option) return;
  option.team1Tags.forEach(tag => { state.teamOf[tag] = 1; });
  option.team2Tags.forEach(tag => { state.teamOf[tag] = 2; });
  renderTeamScreen();
}

if ($('#btnAutoBalance')){
  $('#btnAutoBalance').addEventListener('click', openBalanceOverlay);
  $('#btnCloseBalance').addEventListener('click', closeBalanceOverlay);
  $('#balanceOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'balanceOverlay') closeBalanceOverlay();
  });
}

/* ---------------- SCREEN 3 : GAME SETUP ---------------- */
const MAP_SOURCE_LABEL = { team1: 'TEAM 1', team2: 'TEAM 2', common: '공통' };

function enterScreen3(){
  state.bo = null;
  state.teamMaps = { 1: [], 2: [] };
  state.mapAssignments = [];

  $$('#boSelect .bo-btn').forEach(btn => btn.classList.remove('active'));
  $('#mapPickerWrap').classList.add('hidden');
  $('#mapResultWrap').classList.add('hidden');
  $('#sideResultSetup').classList.add('hidden');
  $('#sideResultSetup').innerHTML = '';
  $('#btn3-next').disabled = true;

  showScreen(3);
}

function selectBo(bo){
  state.bo = bo;
  state.teamMaps = { 1: [], 2: [] };
  state.mapAssignments = [];

  $$('#boSelect .bo-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.bo) === bo);
  });

  $('#t1PickCount').textContent = `0 / ${bo} 선택`;
  $('#t2PickCount').textContent = `0 / ${bo} 선택`;
  renderMapGrid(1);
  renderMapGrid(2);

  $('#mapPickerWrap').classList.remove('hidden');
  $('#mapResultWrap').classList.add('hidden');
  $('#sideResultSetup').classList.add('hidden');
  $('#sideResultSetup').innerHTML = '';
  $('#btnAssignMaps').disabled = true;
  $('#btn3-next').disabled = true;
}

function renderMapGrid(teamNum){
  const grid = $(teamNum === 1 ? '#t1MapGrid' : '#t2MapGrid');
  grid.innerHTML = '';
  MAPS.forEach(map => {
    const picked = state.teamMaps[teamNum].includes(map);
    const atLimit = state.teamMaps[teamNum].length >= state.bo && !picked;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `map-chip ${picked ? 'active' : ''}`;
    btn.textContent = map;
    btn.disabled = atLimit;
    btn.addEventListener('click', () => toggleMapPick(teamNum, map));
    grid.appendChild(btn);
  });
}

function toggleMapPick(teamNum, map){
  const list = state.teamMaps[teamNum];
  const idx = list.indexOf(map);
  if(idx >= 0){
    list.splice(idx, 1);
  }else{
    if(list.length >= state.bo) return;
    list.push(map);
  }
  $(teamNum === 1 ? '#t1PickCount' : '#t2PickCount').textContent = `${list.length} / ${state.bo} 선택`;
  renderMapGrid(teamNum);

  const ready = state.teamMaps[1].length === state.bo && state.teamMaps[2].length === state.bo;
  $('#btnAssignMaps').disabled = !ready;
}

/**
 * 세트별 공격/수비(진영) 배정 규칙
 * - 1세트: 랜덤으로 선공/선수비 결정
 * - 2세트: 1세트에서 선공이었던 팀이 선수비가 되도록 (반대로) 고정
 * - 3세트: 다시 한번 랜덤으로 결정
 * - 이후: 홀수 세트는 랜덤, 짝수 세트는 직전 세트를 반전 — 패턴 반복
 * finalAssignments 배열의 각 아이템에 side1(TEAM1 진영), side2(TEAM2 진영)를 채워 넣는다.
 */
function applySetSides(finalAssignments){
  let prevSide = null;

  finalAssignments.forEach((item, idx) => {
    const setNumber = idx + 1;
    let side;

    if(setNumber % 2 === 1){
      // 홀수 세트: 랜덤 배정
      const team1First = Math.random() < 0.5;
      side = {
        1: team1First ? 'attack' : 'defense',
        2: team1First ? 'defense' : 'attack'
      };
    }else{
      // 짝수 세트: 직전 세트의 진영을 서로 반전
      side = {
        1: prevSide[1] === 'attack' ? 'defense' : 'attack',
        2: prevSide[2] === 'attack' ? 'defense' : 'attack'
      };
    }

    item.side1 = side[1];
    item.side2 = side[2];
    prevSide = side;
  });
}

function assignMaps(){
  const bo = state.bo;
  const t1 = state.teamMaps[1];
  const t2 = state.teamMaps[2];

  const pool = [];
  const allMaps = Array.from(new Set([...t1, ...t2]));
  allMaps.forEach(map => {
    const inT1 = t1.includes(map);
    const inT2 = t2.includes(map);
    if(inT1 && inT2){
      pool.push({ map, source: 'common' });
      pool.push({ map, source: 'common' }); // 공통 맵은 두 배 가중치로 랜덤 풀에 포함
    }else if(inT1){
      pool.push({ map, source: 'team1' });
    }else{
      pool.push({ map, source: 'team2' });
    }
  });

  // shuffle (Fisher-Yates)
  for(let i = pool.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const usedMaps = new Set();
  const chosen = [];
  for(const item of pool){
    if(chosen.length >= bo) break;
    if(usedMaps.has(item.map)) continue;
    usedMaps.add(item.map);
    chosen.push(item);
  }

  const finalAssignments = chosen.map((item, idx) => ({ game: idx + 1, map: item.map, source: item.source }));

  applySetSides(finalAssignments);

  runMapRouletteAnimation(finalAssignments);
}

function runMapRouletteAnimation(finalAssignments){
  const box = $('#mapResultList');
  box.innerHTML = '';
  $('#btnAssignMaps').disabled = true;
  $('#btn3-next').disabled = true;
  $('#sideResultSetup').classList.add('hidden');
  $('#sideResultSetup').innerHTML = '';
  $('#mapResultWrap').classList.remove('hidden');

  const rows = finalAssignments.map(item => {
    const row = document.createElement('div');
    row.className = 'map-result-item spinning';
    row.innerHTML = `
      <span class="map-result-game">${item.game}세트</span>
      <span class="map-result-name">${escapeHtml(MAPS[Math.floor(Math.random() * MAPS.length)])}</span>
      <span class="map-result-badge map-result-badge-spin">?</span>
    `;
    box.appendChild(row);
    return row;
  });

  rows.forEach((row, idx) => {
    const nameEl = row.querySelector('.map-result-name');
    const spinTimer = setInterval(() => {
      nameEl.textContent = MAPS[Math.floor(Math.random() * MAPS.length)];
    }, 55);

    const stopDelay = 550 + idx * 380; // 왼쪽(먼저 시작한 세트)부터 순서대로 정지
    setTimeout(() => {
      clearInterval(spinTimer);
      const item = finalAssignments[idx];
      nameEl.textContent = item.map;
      row.classList.remove('spinning');
      row.classList.add('revealed');
      row.style.cssText += buildMapCardBackground(item.map);
      const badge = row.querySelector('.map-result-badge');
      badge.textContent = MAP_SOURCE_LABEL[item.source];
      badge.className = `map-result-badge map-result-badge-${item.source}`;
      row.insertAdjacentHTML('beforeend', buildSidePillsHtml(item));

      if(idx === rows.length - 1){
        state.mapAssignments = finalAssignments;
        setTimeout(() => {
          $('#btnAssignMaps').disabled = false;
          $('#btn3-next').disabled = false;
        }, 200);
      }
    }, stopDelay);
  });
}

function buildSidePillsHtml(item){
  return `
    <div class="map-side-pills">
      <span class="map-side-pill ${item.side1}">TEAM 1 · ${item.side1 === 'attack' ? '선공' : '선수비'}</span>
      <span class="map-side-pill ${item.side2}">TEAM 2 · ${item.side2 === 'attack' ? '선공' : '선수비'}</span>
    </div>
  `;
}

function renderMapResults(targetSel){
  const box = $(targetSel);
  box.innerHTML = '';
  state.mapAssignments.forEach(item => {
    const row = document.createElement('div');
    row.className = 'map-result-item revealed';
    row.style.cssText = buildMapCardBackground(item.map);
    row.innerHTML = `
      <span class="map-result-game">${item.game}세트</span>
      <span class="map-result-name">${escapeHtml(item.map)}</span>
      <span class="map-result-badge map-result-badge-${item.source}">${MAP_SOURCE_LABEL[item.source]}</span>
      ${buildSidePillsHtml(item)}
    `;
    box.appendChild(row);
  });
}

/* ---------------- SCREEN 4 : RESULT ---------------- */
function enterScreen4(){
  renderResultLists();

  const firstSet = state.mapAssignments[0];
  const s1 = $('#side1');
  const s2 = $('#side2');
  s1.textContent = firstSet ? (firstSet.side1 === 'attack' ? '1세트 선공' : '1세트 선수비') : '-';
  s2.textContent = firstSet ? (firstSet.side2 === 'attack' ? '1세트 선공' : '1세트 선수비') : '-';
  s1.className = 'side-badge' + (firstSet ? ' ' + firstSet.side1 : '');
  s2.className = 'side-badge' + (firstSet ? ' ' + firstSet.side2 : '');

  renderMapResults('#finalMapResultList');

  showScreen(4);
}

function renderResultLists(){
  const t1 = $('#resultTeam1');
  const t2 = $('#resultTeam2');
  t1.innerHTML = '';
  t2.innerHTML = '';
  state.selected.forEach(tag=>{
    const player = getPlayerByTag(tag);
    const isCap = state.captains.includes(tag);
    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.style.justifyContent = 'flex-start';
    chip.innerHTML = `<span>${isCap ? '[팀장] ' : ''}${escapeHtml(tag)} ${getTierBadgeHtml(player.tier)}</span>`;
    if(state.teamOf[tag] === 1) t1.appendChild(chip);
    if(state.teamOf[tag] === 2) t2.appendChild(chip);
  });
}

const MAP_GRADIENTS = {
  '스플릿': 'linear-gradient(135deg,#2C3E50,#4CA1AF)',
  '바인드': 'linear-gradient(135deg,#C97B27,#7A4D14)',
  '헤이븐': 'linear-gradient(135deg,#614385,#516395)',
  '어센트': 'linear-gradient(135deg,#8E7B6E,#5C4B41)',
  '아이스박스': 'linear-gradient(135deg,#2980B9,#6DD5FA)',
  '브리즈': 'linear-gradient(135deg,#26A0DA,#2077B5)',
  '프랙처': 'linear-gradient(135deg,#D9822B,#B25A1E)',
  '펄': 'linear-gradient(135deg,#2948FF,#396AFC)',
  '로터스': 'linear-gradient(135deg,#B4419A,#E8546A)',
  '선셋': 'linear-gradient(135deg,#E4572E,#F2A365)',
  '어비스': 'linear-gradient(135deg,#0F2027,#2C5364)',
  '코로드': 'linear-gradient(135deg,#5C5346,#A78F65)',
  '서밋': 'linear-gradient(135deg,#5B7B8C,#9CB4BF)'
};

function getMapGradient(map){
  return MAP_GRADIENTS[map] || 'linear-gradient(135deg,#3A3A3F,#1E1E22)';
}

function nicknameOnly(tag){
  return tag.split('#')[0];
}

function tagSuffix(tag){
  return tag.includes('#') ? '#' + tag.split('#').slice(1).join('#') : '';
}

function buildPngExportNode(){
  const wrap = document.createElement('div');
  wrap.id = 'pngExportRoot';
  wrap.style.position = 'fixed';
  wrap.style.left = '-99999px';
  wrap.style.top = '0';

  const t1Tags = state.selected.filter(t => state.teamOf[t] === 1);
  const t2Tags = state.selected.filter(t => state.teamOf[t] === 2);

  const sideLabel = (s) => s === 'attack' ? '선공' : (s === 'defense' ? '선수비' : '-');
  const firstSet = state.mapAssignments[0];

  const playerItemHtml = (tag) => {
    const isCap = state.captains.includes(tag);
    return `<div class="png-player-item">${isCap ? '<span class="png-player-cap">C</span>' : ''}<span class="png-player-name">${escapeHtml(nicknameOnly(tag))}</span><span class="png-player-tag">${escapeHtml(tagSuffix(tag))}</span></div>`;
  };

  const mapCardsHtml = state.mapAssignments.map(item => `
    <div class="png-map-card" style="background:${getMapGradient(item.map)}">
      <div class="png-map-set">SET ${item.game}</div>
      <div class="png-map-name">${escapeHtml(item.map)}</div>
      <div class="png-map-source">${MAP_SOURCE_LABEL[item.source]}</div>
      <div class="png-map-sides">
        <span>T1 ${sideLabel(item.side1)}</span>
        <span>T2 ${sideLabel(item.side2)}</span>
      </div>
    </div>
  `).join('');

  const dateStr = new Date().toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit' });

  wrap.innerHTML = `
    <div class="png-poster">
      <div class="png-header">
        <div class="png-logo"><span class="png-logo-mark">⟡</span>MatchSplit</div>
        <div class="png-date">${dateStr}</div>
      </div>
      <div class="png-body">
        <div class="png-team png-team-1">
          <div class="png-team-title">TEAM 1</div>
          <div class="png-team-side ${firstSet ? firstSet.side1 : ''}">${firstSet ? sideLabel(firstSet.side1) : '-'}</div>
          <div class="png-player-list">${t1Tags.map(playerItemHtml).join('')}</div>
        </div>
        <div class="png-maps">${mapCardsHtml}</div>
        <div class="png-team png-team-2">
          <div class="png-team-title">TEAM 2</div>
          <div class="png-team-side ${firstSet ? firstSet.side2 : ''}">${firstSet ? sideLabel(firstSet.side2) : '-'}</div>
          <div class="png-player-list">${t2Tags.map(playerItemHtml).join('')}</div>
        </div>
      </div>
      <div class="png-footer">MATCHSPLIT · TEAM &amp; MAP RESULT</div>
    </div>
  `;

  return wrap;
}

function savePng(){
  const btn = $('#btnSavePng');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '저장 중...';

  const node = buildPngExportNode();
  document.body.appendChild(node);

  requestAnimationFrame(() => {
    const target = node.querySelector('.png-poster');
    html2canvas(target, { backgroundColor: '#ffffff', scale: 2 }).then(canvas => {
      const link = document.createElement('a');
      link.download = `matchsplit-result-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }).catch(err => {
      alert('PNG 저장에 실패했습니다: ' + err.message);
    }).finally(() => {
      node.remove();
      btn.disabled = false;
      btn.textContent = originalText;
    });
  });
}

/* ---------------- UTIL ---------------- */
function escapeHtml(str){
  return str.replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/* ---------------- TEMP (ONE-OFF) PARTICIPANT ADD ---------------- */
const TEMP_TIER_RANKS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal'];
const TEMP_TIER_COLORS = {
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

let tempTier = '';

function tempParseTier(value){
  if(!value) return { rank:null, num:null };
  if(value === 'Radiant') return { rank:'Radiant', num:null };
  const parts = value.split(' ');
  return { rank: parts[0], num: parts[1] || null };
}
function tempTierColor(rank){
  return TEMP_TIER_COLORS[rank] || { bg:'#E7E7EA', text:'#6B6D76' };
}
function buildTempTierPanelHtml(){
  const { rank, num } = tempParseTier(tempTier);
  const groupsHtml = TEMP_TIER_RANKS.map(r => {
    const rc = tempTierColor(r);
    const numsHtml = [1,2,3].map(n => {
      const active = (rank === r && String(num) === String(n));
      return `<button type="button" class="tier-num-btn ${active ? 'active' : ''}" data-rank="${r}" data-num="${n}">${n}</button>`;
    }).join('');
    return `
      <div class="tier-group">
        <span class="tier-chip" style="background:${rc.bg}; color:${rc.text};">${r}</span>
        <div class="tier-nums">${numsHtml}</div>
      </div>`;
  }).join('');
  const radiantActive = rank === 'Radiant';
  const rc = tempTierColor('Radiant');
  const radiantHtml = `
    <div class="tier-group tier-group-radiant">
      <button type="button" class="tier-chip tier-chip-btn ${radiantActive ? 'active' : ''}" style="background:${rc.bg}; color:${rc.text};" data-rank="Radiant" data-num="">Radiant</button>
    </div>`;
  return groupsHtml + radiantHtml;
}
function renderTempTierTrigger(){
  const trigger = $('#tempTierTrigger');
  const { rank, num } = tempParseTier(tempTier);
  if(rank){
    const c = tempTierColor(rank);
    trigger.textContent = rank === 'Radiant' ? 'Radiant' : `${rank} ${num || ''}`.trim();
    trigger.style.cssText = `background:${c.bg}; color:${c.text};`;
  }else{
    trigger.textContent = '티어 선택';
    trigger.style.cssText = 'background:#F0F0F2; color:#9A9BA3; border:1.5px dashed #D8D9DE;';
  }
}
function wireTempTierPicker(){
  const trigger = $('#tempTierTrigger');
  const panel = $('#tempTierPanel');
  const inner = $('#tempTierPanelInner');

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    inner.innerHTML = buildTempTierPanelHtml();
    panel.classList.toggle('open');
  });

  inner.addEventListener('click', (e) => {
    const btn = e.target.closest('.tier-num-btn, .tier-chip-btn');
    if(!btn) return;
    e.stopPropagation();
    const rank = btn.dataset.rank;
    const num = btn.dataset.num;
    tempTier = rank === 'Radiant' ? 'Radiant' : `${rank} ${num}`;
    renderTempTierTrigger();
    panel.classList.remove('open');
  });

  document.addEventListener('click', (e) => {
    if(!e.target.closest('#tempTierPanel') && !e.target.closest('#tempTierTrigger')){
      panel.classList.remove('open');
    }
  });
}

function addTempPlayer(){
  const msg = $('#tempAddMsg');
  msg.classList.add('hidden');

  const tag = $('#tempTag').value.trim();
  const name = $('#tempName').value.trim();
  const tier = tempTier;

  if(!tag){
    msg.classList.remove('hidden');
    msg.innerHTML = '닉네임#태그를 입력해주세요.';
    return;
  }
  if(state.players.some(p => p.tag === tag)){
    msg.classList.remove('hidden');
    msg.innerHTML = '이미 같은 닉네임#태그가 목록에 있습니다.';
    return;
  }

  state.players.push({ tag, name, tier, temp: true });
  renderPlayerGrid();

  $('#tempTag').value = '';
  $('#tempName').value = '';
  tempTier = '';
  renderTempTierTrigger();
  $('#tempTag').focus();
}

if($('#btnToggleTempAdd')){
  wireTempTierPicker();
  $('#btnToggleTempAdd').addEventListener('click', () => {
    $('#tempAddPanel').classList.toggle('hidden');
  });
  $('#btnAddTemp').addEventListener('click', addTempPlayer);
  $('#tempTag').addEventListener('keydown', (e) => { if(e.key === 'Enter') addTempPlayer(); });
  $('#tempName').addEventListener('keydown', (e) => { if(e.key === 'Enter') addTempPlayer(); });
}

/* ---------------- STEP TRACK CLICK NAVIGATION ---------------- */
state.maxReachedScreen = 1;
updateStepTrackUI();

function updateStepTrackUI(){
  $$('#stepTrack .step').forEach(s => {
    const n = Number(s.dataset.step);
    s.classList.toggle('reachable', n <= state.maxReachedScreen);
  });
}

$$('#stepTrack .step').forEach(s => {
  s.addEventListener('click', () => {
    const n = Number(s.dataset.step);
    if(n <= state.maxReachedScreen){
      showScreen(n);
    }
  });
});

/* ---------------- NAV WIRING ---------------- */
$('#btn1-next').addEventListener('click', enterScreen2);
$('#btn2-back').addEventListener('click', () => showScreen(1));
$('#btn2-next').addEventListener('click', enterScreen3);
$('#btn3-back').addEventListener('click', () => showScreen(2));
$('#btn3-next').addEventListener('click', enterScreen4);
$('#btn4-back').addEventListener('click', () => showScreen(3));
$('#btnAssignMaps').addEventListener('click', assignMaps);
$('#btnSavePng').addEventListener('click', savePng);
$$('#boSelect .bo-btn').forEach(btn => {
  btn.addEventListener('click', () => selectBo(Number(btn.dataset.bo)));
});

/* ---------------- INIT ---------------- */
loadPlayers();
