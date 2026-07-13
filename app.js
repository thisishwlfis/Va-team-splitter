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
  mapAssignments: [],   // [{game, map, source: 'team1'|'team2'|'common'}]
  tournamentMode: false
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

/* GitHub Pages로 배포된 정적 JSON 파일을 토큰 없이 그냥 읽어오는 헬퍼.
   저장소가 public이면 누구나(관리자 로그인/토큰 설정 없이) 읽을 수 있음.
   실패하면(아직 배포 전이거나 파일이 없으면) null을 반환. */
async function fetchStaticJson(path){
  try{
    const res = await fetch(`${path}?t=${Date.now()}`);
    if(!res.ok) return null;
    return await res.json();
  }catch(e){
    return null;
  }
}

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

/* ---------------- 공용 참가자 검색 컴포넌트 (일반모드 / 대회모드 공통) ---------------- */
function attachPlayerSearch(inputEl, dropdownEl, wrapEl, { isSelected, onPick }){
  inputEl.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase().replace(/\s+/g, '');
    if(!query){
      dropdownEl.classList.add('hidden');
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
      dropdownEl.innerHTML = '<div class="dropdown-empty">검색 결과가 없습니다.</div>';
      dropdownEl.classList.remove('hidden');
      return;
    }

    dropdownEl.innerHTML = matches.map(p => {
      const selected = isSelected(p.tag);
      return `<div class="dropdown-item ${selected ? 'selected' : ''}" data-tag="${escapeHtml(p.tag)}">
        <span class="dropdown-tag">${escapeHtml(p.tag)}</span>
        ${p.name ? `<span class="dropdown-name">${escapeHtml(p.name)}</span>` : ''}
        ${getTierBadgeHtml(p.tier)}
        ${selected ? '<span class="dropdown-check">[선택됨]</span>' : ''}
      </div>`;
    }).join('');

    dropdownEl.classList.remove('hidden');

    dropdownEl.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        onPick(item.dataset.tag);
        inputEl.value = '';
        dropdownEl.classList.add('hidden');
        inputEl.focus();
      });
    });
  });

  document.addEventListener('click', (e) => {
    if(!wrapEl.contains(e.target)){
      dropdownEl.classList.add('hidden');
    }
  });
}

/* ---------------- SCREEN 1 : SELECT ---------------- */
function renderPlayerGrid(){
  const grid = $('#playerGrid');

  if(!$('#searchContainer')){
    const searchWrap = document.createElement('div');
    searchWrap.id = 'searchContainer';
    searchWrap.className = 'search-container';
    searchWrap.innerHTML = `
      <input type="text" id="playerSearch" class="player-search-input" placeholder="닉네임 또는 실명 검색..." autocomplete="off" />
      <div id="searchDropdown" class="search-dropdown hidden"></div>
    `;
    grid.parentNode.insertBefore(searchWrap, grid);

    attachPlayerSearch($('#playerSearch'), $('#searchDropdown'), searchWrap, {
      isSelected: (tag) => state.selected.includes(tag),
      onPick: (tag) => toggleSelect(tag)
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

/* 카드 폭은 이제 4열 CSS 그리드가 균등하게 맞춰주므로 별도 계산이 필요 없음 */

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
      row.classList.add('revealed', 'reveal-pop');
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
        <div class="png-logo"><span class="png-logo-mark"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 0C12.6 7.7 13.4 10.6 24 12C13.4 13.4 12.6 16.3 12 24C11.4 16.3 10.6 13.4 0 12C10.6 10.6 11.4 7.7 12 0Z"/></svg></span>MatchSplit</div>
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

/* ============================================================
   대회모드 (TOURNAMENT MODE)
   - 관리자 비밀번호(admin.js와 동일한 해시)로 잠금
   - 입장 시 대각선 3D 플립 애니메이션 + 블랙/레드 테마 전환
   - 팀 구성/맵·공수 선택은 기존 화면(1~3단계)을 그대로 재사용
   - 4단계 결과 화면에서 "경기 결과 저장" 버튼으로 GitHub 저장소에 커밋
   ⚠️ ADMIN_PASSWORD_HASH 값은 admin.js 상단의 값과 항상 동일하게 유지하세요.
   ============================================================ */
const TOURNAMENT_ADMIN_PASSWORD_HASH = 'cbbd43db7343c78595d233d851d89a0f5435dd6c7cf6b57e0dbfd48ff5bf6aaa';
const TOURNAMENT_RESULTS_PATH = 'data/tournament-results.json';

async function tSha256Hex(str){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

if($('#btnTournamentMode')){
  $('#btnTournamentMode').addEventListener('click', () => {
    $('#tournamentLoginOverlay').classList.remove('hidden');
    $('#tournamentPassword').value = '';
    $('#tournamentLoginError').classList.add('hidden');
    $('#tournamentAdminPanel').classList.remove('open');
  });
  $('#btnTournamentCancel').addEventListener('click', () => {
    $('#tournamentLoginOverlay').classList.add('hidden');
    $('#tournamentAdminPanel').classList.remove('open');
  });
  $('#btnTournamentViewerEnter').addEventListener('click', () => {
    $('#tournamentLoginOverlay').classList.add('hidden');
    enterTournamentMode(true);
  });
  $('#btnTournamentAdminToggle').addEventListener('click', () => {
    const panel = $('#tournamentAdminPanel');
    const wasOpen = panel.classList.contains('open');
    panel.classList.toggle('open', !wasOpen);
    if(!wasOpen) $('#tournamentPassword').focus();
  });
  $('#tournamentPassword').addEventListener('keydown', (e) => {
    if(e.key === 'Enter') attemptTournamentLogin();
  });
  $('#btnTournamentLogin').addEventListener('click', attemptTournamentLogin);
}

async function attemptTournamentLogin(){
  const errBox = $('#tournamentLoginError');
  errBox.classList.add('hidden');
  const pw = $('#tournamentPassword').value;
  if(TOURNAMENT_ADMIN_PASSWORD_HASH === 'REPLACE_WITH_YOUR_SHA256_HASH'){
    errBox.classList.remove('hidden');
    errBox.textContent = '설정 필요: admin.js의 ADMIN_PASSWORD_HASH가 아직 설정되지 않았습니다.';
    return;
  }
  const hash = await tSha256Hex(pw);
  if(hash === TOURNAMENT_ADMIN_PASSWORD_HASH){
    $('#tournamentLoginOverlay').classList.add('hidden');
    enterTournamentMode(false);
  }else{
    errBox.classList.remove('hidden');
    errBox.textContent = '비밀번호가 올바르지 않습니다.';
  }
}

function enterTournamentMode(readOnly){
  tState.readOnly = !!readOnly;
  const appEl = $('.app');
  appEl.classList.add('tournament-flip');

  // 페이드 아웃이 끝나는 시점(화면이 보이지 않는 시점)에 테마를 전환해 자연스럽게 보이도록 함
  setTimeout(() => {
    document.body.classList.add('tournament-theme');
    state.tournamentMode = true;
    $('#btnTournamentMode').classList.add('hidden');
    $('#btnSaveTournamentResult').classList.toggle('hidden', tState.readOnly);
  }, 350);

  appEl.addEventListener('animationend', () => {
    appEl.classList.remove('tournament-flip');
    showTournamentScreen();
    tRenderList();
  }, { once:true });
}

function showTournamentScreen(){
  [1,2,3,4].forEach(i => $(`#screen-${i}`).classList.add('hidden'));
  $('#stepTrack').classList.add('hidden');
  $('#screen-t').classList.remove('hidden');
}

/* ============================================================
   대회모드 - 대회 목록 / 편집 (멤버 선택 -> 팀 수 -> 팀 배정)
   ============================================================ */
const TOURNAMENTS_PATH = 'data/tournaments.json';
const TOURNAMENTS_LOCAL_KEY = 'teamsplit_tournaments_local';

/* 이 저장소는 public이므로, 토큰 없이도 GitHub API로 읽기가 가능하다.
   owner/repo는 이미 register.js에도 공개돼 있는 값과 동일하다(민감정보 아님). */
const PUBLIC_REPO_OWNER = 'thisishwlfis';
const PUBLIC_REPO_NAME = 'Va-team-splitter';
const PUBLIC_REPO_BRANCH = 'main';

/* 토큰 없이 GitHub Contents API로 파일을 읽는다 (public 저장소 전용, 읽기만).
   정적 파일(fetchStaticJson)이 아직 배포 전이라 실패했을 때의 백업 경로. */
async function fetchPublicGithubJson(path){
  try{
    const url = `https://api.github.com/repos/${PUBLIC_REPO_OWNER}/${PUBLIC_REPO_NAME}/contents/${path}?ref=${encodeURIComponent(PUBLIC_REPO_BRANCH)}`;
    const res = await fetch(url, { headers:{ 'Accept': 'application/vnd.github+json' } });
    if(!res.ok) return null;
    const json = await res.json();
    const text = GitHubStore.b64decode(json.content);
    return JSON.parse(text);
  }catch(e){
    return null;
  }
}

const tState = {
  tournaments: [],
  sha: null,
  usingLocal: false,
  editing: null,        // tournament object currently being edited (draft)
  editStep: 'members',  // 'members' | 'teams'
  memberSelection: [],  // array of tags
  teamCount: 2,
  teamOf: {},           // tag -> team number
  groupOf: {},          // tag -> group number (1|2|3)
  captains: [],          // array of tags
  expandedGameIdx: null, // index of the game row currently expanded in results view
  readOnly: false        // viewer mode: true면 편집/저장 불가, 조회만 가능
};

function tGenId(){
  return `t-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
}

async function tLoadTournaments(){
  // 1) 누구나: GitHub Pages에 배포된 정적 파일을 토큰 없이 읽는다.
  //    (owner/repo가 public 저장소라면 이 방법으로 모든 방문자가 조회 가능)
  const staticData = await fetchStaticJson(TOURNAMENTS_PATH);
  if(staticData){
    tState.tournaments = staticData;
    tState.sha = null; // 저장 직전 최신 sha를 다시 받아오므로 여기선 필요 없음
    tState.usingLocal = false;
    return;
  }

  // 1.5) 누구나: Pages 배포가 아직 안 됐어도, 토큰 없이 GitHub API로 바로 읽는다 (public 저장소).
  const publicData = await fetchPublicGithubJson(TOURNAMENTS_PATH);
  if(publicData){
    tState.tournaments = publicData;
    tState.sha = null;
    tState.usingLocal = false;
    return;
  }

  // 2) 관리자이고 이 브라우저에 GitHub 설정이 있다면, API로 직접 시도
  //    (배포가 아직 안 됐거나 저장소가 private인 경우 대비)
  const cfg = (typeof GitHubStore !== 'undefined') ? GitHubStore.getConfig() : null;
  if(cfg && GitHubStore.hasConfig()){
    try{
      const res = await fetch(tournamentApiUrl(cfg, TOURNAMENTS_PATH), {
        headers:{ 'Authorization': `token ${cfg.token}`, 'Accept': 'application/vnd.github+json' }
      });
      if(res.status === 404){
        tState.tournaments = [];
        tState.sha = null;
      }else if(res.ok){
        const json = await res.json();
        const text = GitHubStore.b64decode(json.content);
        tState.tournaments = JSON.parse(text || '[]');
        tState.sha = json.sha;
      }else{
        throw new Error('불러오기 실패');
      }
      tState.usingLocal = false;
      return;
    }catch(e){
      // fall through to local
    }
  }

  // 3) 둘 다 실패하면 이 브라우저에만 저장된 로컬 데이터 사용
  tState.usingLocal = true;
  try{
    tState.tournaments = JSON.parse(localStorage.getItem(TOURNAMENTS_LOCAL_KEY) || '[]');
  }catch(e){
    tState.tournaments = [];
  }
}

async function tSaveTournaments(){
  const cfg = (typeof GitHubStore !== 'undefined') ? GitHubStore.getConfig() : null;
  if(cfg && GitHubStore.hasConfig()){
    // 저장 직전에 최신 sha를 다시 받아온다 (읽기는 정적 파일로 했을 수 있어 sha가 없을 수 있음)
    let sha = tState.sha;
    try{
      const shaRes = await fetch(tournamentApiUrl(cfg, TOURNAMENTS_PATH), {
        headers:{ 'Authorization': `token ${cfg.token}`, 'Accept': 'application/vnd.github+json' }
      });
      if(shaRes.status === 404){ sha = null; }
      else if(shaRes.ok){ sha = (await shaRes.json()).sha; }
    }catch(e){ /* keep previous sha */ }

    const content = GitHubStore.b64encode(JSON.stringify(tState.tournaments, null, 2) + '\n');
    const body = { message:'대회모드 대회 정보 저장', content, branch: cfg.branch };
    if(sha) body.sha = sha;
    const res = await fetch(tournamentApiUrl(cfg, TOURNAMENTS_PATH).split('?')[0], {
      method:'PUT',
      headers:{
        'Authorization': `token ${cfg.token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if(!res.ok){
      const errBody = await res.text();
      throw new Error(`저장 실패 (${res.status}): ${GitHubStore.explainError(res.status, errBody)}`);
    }
    const json = await res.json();
    tState.sha = json.content ? json.content.sha : tState.sha;
    tState.usingLocal = false;
  }else{
    localStorage.setItem(TOURNAMENTS_LOCAL_KEY, JSON.stringify(tState.tournaments));
  }
}

/* ---------------- LIST VIEW ---------------- */
async function tRenderList(){
  const view = $('#tView');
  view.innerHTML = `<div class="t-loading">불러오는 중...</div>`;
  await tLoadTournaments();

  const localNote = tState.usingLocal
    ? `<div class="t-local-note">⚠ GitHub 저장소가 연결되어 있지 않아 이 브라우저에만 저장됩니다. (admin.html에서 먼저 연결해주세요)</div>`
    : '';

  const boxesHtml = tState.tournaments.map(t => `
    <div class="tournament-box" data-id="${t.id}">
      <span class="tournament-box-name">${escapeHtml(t.name)}</span>
      ${tState.readOnly ? '' : `<button type="button" class="tournament-edit-btn" data-id="${t.id}">편집</button>`}
    </div>
  `).join('');

  const viewerNote = tState.readOnly
    ? `<div class="t-local-note">👁 뷰어모드입니다. 조회만 가능하며 편집/저장은 할 수 없습니다.</div>`
    : '';

  const addRowHtml = tState.readOnly
    ? `<div class="tournament-add-row"><button class="btn btn-ghost" id="btnExitTournament">대회모드 나가기</button></div>`
    : `
    <div class="tournament-add-row">
      <button type="button" class="btn btn-ghost" id="btnTournamentAddToggle">+ 대회 추가</button>
      <button class="btn btn-ghost" id="btnExitTournament">대회모드 나가기</button>
      <div id="tAddForm" class="t-add-form hidden">
        <input type="text" id="tNewName" placeholder="대회 이름 입력" />
        <button type="button" class="btn btn-primary" id="btnTournamentAddConfirm">추가</button>
      </div>
    </div>`;

  view.innerHTML = `
    <div class="screen-intro">
      <h2>대회 목록</h2>
      <p class="counter">대회를 선택하면 경기 결과를 ${tState.readOnly ? '볼' : '기록할'} 수 있습니다.</p>
    </div>
    ${viewerNote}
    ${localNote}
    <div class="tournament-list">
      ${boxesHtml || '<div class="t-empty">아직 등록된 대회가 없습니다.</div>'}
    </div>
    ${addRowHtml}
  `;

  if(!tState.readOnly){
    $('#btnTournamentAddToggle').addEventListener('click', () => {
      $('#tAddForm').classList.toggle('hidden');
      $('#tNewName').focus();
    });
    $('#tNewName').addEventListener('keydown', e => { if(e.key === 'Enter') tCreateTournament(); });
    $('#btnTournamentAddConfirm').addEventListener('click', tCreateTournament);
    $$('.tournament-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = tState.tournaments.find(x => x.id === btn.dataset.id);
        tOpenEditMembers(t);
      });
    });
  }

  $$('.tournament-box').forEach(box => {
    box.addEventListener('click', (e) => {
      if(e.target.closest('.tournament-edit-btn')) return;
      const t = tState.tournaments.find(x => x.id === box.dataset.id);
      tOpenResults(t);
    });
  });

  $('#btnExitTournament').addEventListener('click', tExitTournamentMode);
}

async function tCreateTournament(){
  const nameInput = $('#tNewName');
  const name = nameInput.value.trim();
  if(!name){ nameInput.focus(); return; }

  const t = { id: tGenId(), name, memberTags: [], teamCount: 2, teams: {}, results: [] };
  tState.tournaments.push(t);
  try{
    await tSaveTournaments();
  }catch(err){
    alert(`저장 실패: ${err.message}`);
  }
  tRenderList();
}

function tExitTournamentMode(){
  document.body.classList.remove('tournament-theme');
  state.tournamentMode = false;
  tState.readOnly = false;
  $('#screen-t').classList.add('hidden');
  $('#stepTrack').classList.remove('hidden');
  $('#btnTournamentMode').classList.remove('hidden');
  $('#btnSaveTournamentResult').classList.add('hidden');
  showScreen(1);
}

/* ---------------- 대회모드: 경기 결과 기록 ---------------- */
async function tOpenResults(t){
  const view = $('#tView');
  view.innerHTML = `<div class="t-loading">불러오는 중...</div>`;

  const cfg = (typeof GitHubStore !== 'undefined') ? GitHubStore.getConfig() : null;

  // 편집 모드(관리자)는 결국 저장 시 토큰이 필요하므로, 이 브라우저에 연결이 안 되어 있으면 미리 안내
  if(!tState.readOnly && (!cfg || !GitHubStore.hasConfig())){
    view.innerHTML = `
      <div class="screen-intro">
        <h2>${escapeHtml(t.name)} · 경기 결과</h2>
      </div>
      <div class="load-error">GitHub 저장소 연결 정보가 없습니다.<br>admin.html에서 먼저 저장소를 연결해주세요.</div>
      <div class="nav-row">
        <button class="btn btn-ghost" id="btnBackToList">← 대회 목록</button>
      </div>
    `;
    $('#btnBackToList').addEventListener('click', tRenderList);
    return;
  }

  try{
    let sha = null;
    let results = null;

    // 1) 누구나: 배포된 정적 파일을 토큰 없이 읽는다.
    const staticResults = await fetchStaticJson(TOURNAMENT_RESULTS_PATH);
    if(staticResults){
      results = staticResults;
    }else{
      // 1.5) 누구나: Pages 배포 전이어도 토큰 없이 GitHub API로 바로 읽는다 (public 저장소).
      const publicResults = await fetchPublicGithubJson(TOURNAMENT_RESULTS_PATH);
      if(publicResults){
        results = publicResults;
      }else if(cfg && GitHubStore.hasConfig()){
        // 2) 그래도 없으면(예: private 저장소), 관리자 토큰으로 직접 조회
        const fetched = await fetchTournamentResults(cfg);
        sha = fetched.sha;
        results = fetched.results;
      }else{
        // 3) 파일이 아직 한 번도 저장된 적 없는 것 — 에러가 아니라 "결과 없음" 상태로 처리
        results = [];
      }
    }

    tState.resultsSha = sha;
    tState.allResults = results;
    tState.resultsTournament = t;
    const existing = results.find(r => r.type === 'tournament' && r.tournamentId === t.id);
    tState.currentResultEntry = existing
      ? { ...existing, games: [...(existing.games || [])] }
      : { id:`tresult-${t.id}`, type:'tournament', tournamentId:t.id, tournamentName:t.name, teams:{ ...(t.teams || {}) }, teamCount:t.teamCount || 2, games:[] };
    tState.resultsDirty = false;
    tState.addGameDraft = null;
    tState.expandedGameIdx = null;
    tRenderResults();
  }catch(err){
    view.innerHTML = `
      <div class="screen-intro">
        <h2>${escapeHtml(t.name)} · 경기 결과</h2>
      </div>
      <div class="load-error">불러오기 실패<br>${escapeHtml(err.message)}</div>
      <div class="nav-row">
        <button class="btn btn-ghost" id="btnBackToList">← 대회 목록</button>
      </div>
    `;
    $('#btnBackToList').addEventListener('click', tRenderList);
  }
}

function tTeamMembers(n){
  const entry = tState.currentResultEntry;
  const tags = (entry.teams && entry.teams[n]) || [];
  return tags;
}

/* ---- 경기 추가 폼 (맞대결 팀 선택 → 선수별 K/D/A 입력 → 승리 팀 선택) ---- */
function tOpenAddGameForm(){
  tState.addGameDraft = { selected:[], winner:null, stats:{}, bo:null, teamMaps:{ 1:[], 2:[] }, mapAssignments:[], setWinners:{}, pendingSetWinners:{}, expandedSet:null, justExpandedSet:null };
  tRenderResults();
}

function tCancelAddGameForm(){
  tState.addGameDraft = null;
  tRenderResults();
}

function tBuildAddGamePanelHtml(){
  const draft = tState.addGameDraft;
  if(!draft) return '';
  const teamCount = tState.currentResultEntry.teamCount || 2;

  const matchupBtnsHtml = Array.from({length:teamCount}, (_, i) => i + 1).map(n => `
    <button type="button" class="bo-btn t-matchup-chip ${draft.selected.includes(n) ? 'active' : ''}" data-team="${n}">TEAM ${n}</button>
  `).join('');

  let boHtml = '';
  let mapPickHtml = '';
  let mapResultHtml = '';
  let statsHtml = '';
  let winnerHtml = '';
  const [teamA, teamB] = draft.selected;

  if(teamA && teamB){
    const boBtnsHtml = [3, 5, 7, 9].map(n => `
      <button type="button" class="bo-btn t-add-bo-btn ${draft.bo === n ? 'active' : ''}" data-bo="${n}">BO${n}</button>
    `).join('');
    boHtml = `
      <p class="counter" style="margin-top:18px; margin-bottom:10px;">세트 수(BO)를 선택하세요</p>
      <div class="bo-select">${boBtnsHtml}</div>
    `;
  }

  if(teamA && teamB && draft.bo && draft.mapAssignments.length === 0){
    mapPickHtml = `
      <div class="map-picker-wrap" id="tAddMapPickSection">
        <p class="counter" style="margin-top:18px; margin-bottom:10px;">각 팀이 선호하는 맵을 ${draft.bo}개씩 고르세요</p>
        <div class="map-picker-columns">
          <div class="map-picker-col">
            <div class="team-title team-1">TEAM ${teamA}</div>
            <p class="map-pick-count" id="tAddT1PickCount">${draft.teamMaps[1].length} / ${draft.bo} 선택</p>
            <div class="map-grid" id="tAddT1MapGrid"></div>
          </div>
          <div class="map-picker-col">
            <div class="team-title team-2">TEAM ${teamB}</div>
            <p class="map-pick-count" id="tAddT2PickCount">${draft.teamMaps[2].length} / ${draft.bo} 선택</p>
            <div class="map-grid" id="tAddT2MapGrid"></div>
          </div>
        </div>
        <div class="nav-row nav-row-right">
          <button type="button" class="btn btn-primary" id="btnTAddAssignMaps" ${(draft.teamMaps[1].length === draft.bo && draft.teamMaps[2].length === draft.bo) ? '' : 'disabled'}>맵 / 진영 배정</button>
        </div>
      </div>
      <div class="map-result-list t-add-map-result-list" id="tAddMapResultList"></div>
    `;
  }

  if(teamA && teamB && draft.mapAssignments.length > 0){
    if(!draft.setWinners) draft.setWinners = {};
    if(!draft.pendingSetWinners) draft.pendingSetWinners = {};
    if(draft.expandedSet === undefined) draft.expandedSet = null;
    if(draft.justExpandedSet === undefined) draft.justExpandedSet = null;

    const buildStatsCol = (teamNum, setIdx) => {
      const tags = tTeamMembers(teamNum);
      const rowsHtml = tags.length === 0
        ? '<div class="t-team-card-empty">배정된 멤버가 없습니다.</div>'
        : tags.map(tag => {
            const p = getPlayerByTag(tag) || { tier:'' };
            if(!draft.stats[tag]) draft.stats[tag] = Array.from({length:draft.bo}, () => ({ k:'', d:'', a:'' }));
            const s = draft.stats[tag][setIdx] || { k:'', d:'', a:'' };
            return `
              <div class="t-kda-row">
                <span class="t-kda-name">${escapeHtml(tag)} ${getTierBadgeHtml(p.tier)}</span>
                <div class="t-kda-inputs">
                  <input type="text" inputmode="numeric" pattern="[0-9]*" class="t-kda-input" data-tag="${escapeAttrJs(tag)}" data-set="${setIdx}" data-stat="k" placeholder="K" value="${escapeAttrJs(String(s.k))}" />
                  <input type="text" inputmode="numeric" pattern="[0-9]*" class="t-kda-input" data-tag="${escapeAttrJs(tag)}" data-set="${setIdx}" data-stat="d" placeholder="D" value="${escapeAttrJs(String(s.d))}" />
                  <input type="text" inputmode="numeric" pattern="[0-9]*" class="t-kda-input" data-tag="${escapeAttrJs(tag)}" data-set="${setIdx}" data-stat="a" placeholder="A" value="${escapeAttrJs(String(s.a))}" />
                </div>
              </div>
            `;
          }).join('');
      return `
        <div class="t-stats-col">
          <span class="team-title t-stats-col-title">TEAM ${teamNum}</span>
          <div class="t-kda-head"><span></span><span>K</span><span>D</span><span>A</span></div>
          ${rowsHtml}
        </div>
      `;
    };

    const boxesHtml = draft.mapAssignments.map(item => {
      const setIdx = item.game - 1;
      const isOpen = draft.expandedSet === setIdx;
      const savedWinner = draft.setWinners[setIdx];
      const pendingWinner = draft.pendingSetWinners[setIdx] || savedWinner || null;
      const winnerPillHtml = savedWinner
        ? `<span class="map-set-winner-pill">TEAM ${savedWinner} 승</span>`
        : '';

      const panelHtml = isOpen ? `
        <div class="t-set-kda-panel ${draft.justExpandedSet === setIdx ? 'slide-in' : ''}">
          <p class="counter" style="margin:12px 0 8px;">${item.game}세트 (${escapeHtml(item.map)}) K / D / A</p>
          <div class="t-stats-columns">
            ${buildStatsCol(teamA, setIdx)}
            ${buildStatsCol(teamB, setIdx)}
          </div>
          <p class="counter" style="margin:14px 0 8px;">이 세트를 가져간 팀을 선택하세요</p>
          <div class="bo-select">
            <button type="button" class="bo-btn t-set-winner-btn ${pendingWinner === teamA ? 'active' : ''}" data-set="${setIdx}" data-team="${teamA}">TEAM ${teamA} 승</button>
            <button type="button" class="bo-btn t-set-winner-btn ${pendingWinner === teamB ? 'active' : ''}" data-set="${setIdx}" data-team="${teamB}">TEAM ${teamB} 승</button>
          </div>
          <div class="nav-row nav-row-right" style="margin-top:12px;">
            <button type="button" class="btn btn-primary t-set-save-btn" data-set="${setIdx}" ${pendingWinner ? '' : 'disabled'}>이 세트 저장</button>
          </div>
        </div>
      ` : '';

      return `
        <div class="t-map-box-wrap ${isOpen ? 'expanded' : ''}">
          <div class="map-result-item revealed t-map-box" data-set="${setIdx}" style="${buildMapCardBackground(item.map)}">
            <span class="map-result-game">${item.game}세트</span>
            <span class="map-result-name">${escapeHtml(item.map)}</span>
            <span class="map-result-badge map-result-badge-${item.source}">${MAP_SOURCE_LABEL[item.source]}</span>
            ${buildSidePillsHtml(item)}
            ${winnerPillHtml}
          </div>
          ${panelHtml}
        </div>
      `;
    }).join('');

    mapResultHtml = `
      <p class="counter" style="margin-top:18px; margin-bottom:2px;">맵 / 진영 배정 결과</p>
      <p class="hint-text" style="margin-bottom:10px;">박스를 클릭하면 K/D/A를 기록할 수 있어요</p>
      <div class="map-result-list">${boxesHtml}</div>
      <div class="nav-row nav-row-right">
        <button type="button" class="mini-btn" id="btnTAddResetMaps">맵 다시 선택</button>
      </div>
    `;

    winnerHtml = `
      <p class="counter" style="margin-bottom:10px;
      margin-top: 18px;">승리 팀을 선택하세요</p>
      <div class="bo-select">
        <button type="button" class="bo-btn t-winner-btn ${draft.winner === teamA ? 'active' : ''}" data-team="${teamA}">TEAM ${teamA} 승</button>
        <button type="button" class="bo-btn t-winner-btn ${draft.winner === teamB ? 'active' : ''}" data-team="${teamB}">TEAM ${teamB} 승</button>
      </div>
    `;
  }

  return `
    <div class="t-add-game-panel">
      <div class="t-add-game-panel-head">
        <span>경기 추가</span>
        <span class="counter" style="margin:0;">${draft.selected.length} / 2 팀 선택됨</span>
      </div>
      <p class="counter" style="margin-bottom:10px;">맞붙은 두 팀을 선택하세요</p>
      <div class="bo-select">${matchupBtnsHtml}</div>
      ${boHtml}
      ${mapPickHtml}
      ${mapResultHtml}
      ${statsHtml}
      ${winnerHtml}
      <div class="nav-row">
        <button class="btn btn-ghost" id="btnCancelAddGame">취소</button>
        <button class="btn btn-primary" id="btnConfirmAddGame" ${(teamA && teamB && draft.mapAssignments.length > 0 && draft.winner) ? '' : 'disabled'}>경기 추가</button>
      </div>
    </div>
  `;
}

function tWireAddGamePanel(){
  const draft = tState.addGameDraft;
  if(!draft) return;

  $$('.t-matchup-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = Number(btn.dataset.team);
      const idx = draft.selected.indexOf(n);
      if(idx !== -1){
        draft.selected.splice(idx, 1);
      }else{
        draft.selected.push(n);
        if(draft.selected.length > 2) draft.selected.shift();
      }
      draft.winner = null;
      draft.stats = {};
      draft.bo = null;
      draft.teamMaps = { 1:[], 2:[] };
      draft.mapAssignments = [];
      draft.setWinners = {};
      draft.pendingSetWinners = {};
      draft.expandedSet = null;
      draft.justExpandedSet = null;
      tRenderResults();
    });
  });

  $$('.t-add-bo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      draft.bo = Number(btn.dataset.bo);
      draft.teamMaps = { 1:[], 2:[] };
      draft.mapAssignments = [];
      draft.stats = {};
      draft.winner = null;
      draft.setWinners = {};
      draft.pendingSetWinners = {};
      draft.expandedSet = null;
      draft.justExpandedSet = null;
      tRenderResults();
    });
  });

  if(draft.bo && draft.mapAssignments.length === 0){
    tRenderMapGrid(1);
    tRenderMapGrid(2);
  }

  const assignBtn = $('#btnTAddAssignMaps');
  if(assignBtn) assignBtn.addEventListener('click', tAssignMapsForDraft);

  const resetMapsBtn = $('#btnTAddResetMaps');
  if(resetMapsBtn){
    resetMapsBtn.addEventListener('click', () => {
      draft.bo = null;
      draft.teamMaps = { 1:[], 2:[] };
      draft.mapAssignments = [];
      draft.stats = {};
      draft.winner = null;
      draft.setWinners = {};
      draft.pendingSetWinners = {};
      draft.expandedSet = null;
      draft.justExpandedSet = null;
      tRenderResults();
    });
  }

  $$('.t-map-box').forEach(box => {
    box.addEventListener('click', () => {
      const setIdx = Number(box.dataset.set);
      if(draft.expandedSet === setIdx){
        draft.expandedSet = null;
        draft.justExpandedSet = null;
      }else{
        draft.expandedSet = setIdx;
        draft.justExpandedSet = setIdx;
      }
      tRenderResults();
    });
  });

  $$('.t-set-winner-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const setIdx = Number(btn.dataset.set);
      const team = Number(btn.dataset.team);
      if(!draft.pendingSetWinners) draft.pendingSetWinners = {};
      draft.pendingSetWinners[setIdx] = team;
      draft.justExpandedSet = null;
      tRenderResults();
    });
  });

  $$('.t-set-save-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const setIdx = Number(btn.dataset.set);
      const team = draft.pendingSetWinners && draft.pendingSetWinners[setIdx];
      if(!team) return;
      if(!draft.setWinners) draft.setWinners = {};
      draft.setWinners[setIdx] = team;
      draft.expandedSet = null;
      draft.justExpandedSet = null;
      tRenderResults();
    });
  });

  $$('.t-kda-input').forEach(inp => {
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/[^0-9]/g, '');
      const tag = inp.dataset.tag;
      const setIdx = Number(inp.dataset.set);
      const stat = inp.dataset.stat;
      if(!draft.stats[tag]) draft.stats[tag] = Array.from({length:draft.bo}, () => ({ k:'', d:'', a:'' }));
      if(!draft.stats[tag][setIdx]) draft.stats[tag][setIdx] = { k:'', d:'', a:'' };
      draft.stats[tag][setIdx][stat] = inp.value;
    });
  });

  $$('.t-winner-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      draft.winner = Number(btn.dataset.team);
      tRenderResults();
    });
  });

  const cancelBtn = $('#btnCancelAddGame');
  if(cancelBtn) cancelBtn.addEventListener('click', tCancelAddGameForm);

  const confirmBtn = $('#btnConfirmAddGame');
  if(confirmBtn) confirmBtn.addEventListener('click', tConfirmAddGame);
}

/* ---- 맵 선호도 선택 + 랜덤 배정 (03 게임설정 화면과 동일한 로직 재사용) ---- */
function tRenderMapGrid(teamNum){
  const draft = tState.addGameDraft;
  const grid = $(teamNum === 1 ? '#tAddT1MapGrid' : '#tAddT2MapGrid');
  if(!grid) return;
  grid.innerHTML = '';
  MAPS.forEach(map => {
    const picked = draft.teamMaps[teamNum].includes(map);
    const atLimit = draft.teamMaps[teamNum].length >= draft.bo && !picked;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `map-chip ${picked ? 'active' : ''}`;
    btn.textContent = map;
    btn.disabled = atLimit;
    btn.addEventListener('click', () => tToggleMapPick(teamNum, map));
    grid.appendChild(btn);
  });
}

function tToggleMapPick(teamNum, map){
  const draft = tState.addGameDraft;
  const list = draft.teamMaps[teamNum];
  const idx = list.indexOf(map);
  if(idx >= 0){
    list.splice(idx, 1);
  }else{
    if(list.length >= draft.bo) return;
    list.push(map);
  }
  const countEl = $(teamNum === 1 ? '#tAddT1PickCount' : '#tAddT2PickCount');
  if(countEl) countEl.textContent = `${list.length} / ${draft.bo} 선택`;
  tRenderMapGrid(teamNum);

  const ready = draft.teamMaps[1].length === draft.bo && draft.teamMaps[2].length === draft.bo;
  const assignBtn = $('#btnTAddAssignMaps');
  if(assignBtn) assignBtn.disabled = !ready;
}

function tAssignMapsForDraft(){
  const draft = tState.addGameDraft;
  const bo = draft.bo;
  const t1 = draft.teamMaps[1];
  const t2 = draft.teamMaps[2];

  const pool = [];
  const allMaps = Array.from(new Set([...t1, ...t2]));
  allMaps.forEach(map => {
    const inT1 = t1.includes(map);
    const inT2 = t2.includes(map);
    if(inT1 && inT2){
      pool.push({ map, source: 'common' });
      pool.push({ map, source: 'common' });
    }else if(inT1){
      pool.push({ map, source: 'team1' });
    }else{
      pool.push({ map, source: 'team2' });
    }
  });

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
  tRunMapRouletteAnimation(finalAssignments);
}

function tRunMapRouletteAnimation(finalAssignments){
  const draft = tState.addGameDraft;
  const pickSection = $('#tAddMapPickSection');
  if(pickSection) pickSection.classList.add('hidden');
  const box = $('#tAddMapResultList');
  if(!box) return;
  box.innerHTML = '';
  const assignBtn = $('#btnTAddAssignMaps');
  if(assignBtn) assignBtn.disabled = true;

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

    const stopDelay = 550 + idx * 380;
    setTimeout(() => {
      clearInterval(spinTimer);
      const item = finalAssignments[idx];
      nameEl.textContent = item.map;
      row.classList.remove('spinning');
      row.classList.add('revealed', 'reveal-pop');
      row.style.cssText += buildMapCardBackground(item.map);
      const badge = row.querySelector('.map-result-badge');
      badge.textContent = MAP_SOURCE_LABEL[item.source];
      badge.className = `map-result-badge map-result-badge-${item.source}`;
      row.insertAdjacentHTML('beforeend', buildSidePillsHtml(item));

      if(idx === rows.length - 1){
        draft.mapAssignments = finalAssignments;
        setTimeout(() => { tRenderResults(); }, 300);
      }
    }, stopDelay);
  });
}

function tConfirmAddGame(){
  const draft = tState.addGameDraft;
  const [teamA, teamB] = draft.selected;
  if(!draft || !teamA || !teamB || !draft.winner || draft.mapAssignments.length === 0) return;

  const stats = {};
  const setStats = {};
  [...tTeamMembers(teamA), ...tTeamMembers(teamB)].forEach(tag => {
    const sets = draft.stats[tag] || [];
    const totals = { k:0, d:0, a:0 };
    const perSet = [];
    for(let i = 0; i < draft.bo; i++){
      const s = sets[i] || {};
      const k = Number(s.k) || 0, d = Number(s.d) || 0, a = Number(s.a) || 0;
      totals.k += k; totals.d += d; totals.a += a;
      perSet.push({ k, d, a });
    }
    stats[tag] = totals;
    setStats[tag] = perSet;
  });

  const entry = tState.currentResultEntry;
  entry.games.push({
    game: entry.games.length + 1,
    teamA,
    teamB,
    bo: draft.bo,
    mapAssignments: draft.mapAssignments,
    winnerTeam: draft.winner,
    setWinners: { ...(draft.setWinners || {}) },
    stats,
    setStats
  });

  tState.resultsDirty = true;
  tState.addGameDraft = null;
  tRenderResults();
}

/* ---- 실시간 랭킹 계산 ---- */
function tComputeTeamRanking(){
  const entry = tState.currentResultEntry;
  const teamCount = entry.teamCount || 2;
  const wins = {}, played = {};
  for(let n = 1; n <= teamCount; n++){ wins[n] = 0; played[n] = 0; }
  entry.games.forEach(g => {
    const a = g.teamA, b = g.teamB;
    if(a && played[a] !== undefined) played[a]++;
    if(b && played[b] !== undefined) played[b]++;
    if(g.winnerTeam && wins[g.winnerTeam] !== undefined) wins[g.winnerTeam]++;
  });
  return Array.from({length:teamCount}, (_, i) => i + 1)
    .map(n => ({ team:n, wins:wins[n], played:played[n] }))
    .sort((x, y) => y.wins - x.wins || y.played - x.played);
}

function tComputePlayerStats(){
  const entry = tState.currentResultEntry;
  const totals = {};
  entry.games.forEach(g => {
    Object.entries(g.stats || {}).forEach(([tag, s]) => {
      if(!totals[tag]) totals[tag] = { tag, k:0, d:0, a:0 };
      totals[tag].k += Number(s.k) || 0;
      totals[tag].d += Number(s.d) || 0;
      totals[tag].a += Number(s.a) || 0;
    });
  });
  return Object.values(totals);
}

function tRenderResults(){
  const view = $('#tView');
  const t = tState.resultsTournament;
  const entry = tState.currentResultEntry;

  const teamRanking = tComputeTeamRanking();
  const teamRankHtml = teamRanking.map((r, idx) => `
    <div class="t-rank-row">
      <span class="t-rank-pos">${idx + 1}</span>
      <span class="team-title" style="margin:0;">${escapeHtml(tTeamLabel(t.teamNames, r.team))}</span>
      <span class="t-rank-stat">${r.wins}승 · ${r.played}경기</span>
    </div>
  `).join('') || '<div class="t-team-card-empty">아직 기록된 경기가 없습니다.</div>';

  const playerStats = tComputePlayerStats();
  const killRanking = [...playerStats].sort((a, b) => b.k - a.k).slice(0, 5);
  const assistRanking = [...playerStats].sort((a, b) => b.a - a.a).slice(0, 5);

  const buildPlayerRankHtml = (list, statKey, statLabel) => list.length === 0
    ? '<div class="t-team-card-empty">기록된 데이터가 없습니다.</div>'
    : list.map((p, idx) => {
        const player = getPlayerByTag(p.tag) || { tier:'' };
        return `
          <div class="t-rank-row">
            <span class="t-rank-pos">${idx + 1}</span>
            <span class="t-rank-name">${escapeHtml(p.tag)} ${getTierBadgeHtml(player.tier)}</span>
            <span class="t-rank-stat">${statLabel} ${p[statKey]}</span>
          </div>
        `;
      }).join('');

  const buildGameDetailHtml = (g) => {
    const setsHtml = (g.mapAssignments || []).map((item, sIdx) => {
      const setWinner = (g.setWinners || {})[sIdx];
      return `
        <div class="t-game-detail-set">
          <span class="t-game-detail-set-num">${item.game}세트</span>
          <span class="t-game-detail-set-map">${escapeHtml(item.map)}</span>
          ${setWinner ? `<span class="map-set-winner-pill">TEAM ${setWinner} 승</span>` : '<span class="t-game-detail-set-nowin">기록 없음</span>'}
        </div>
      `;
    }).join('') || '<div class="t-team-card-empty">세트 정보가 없습니다.</div>';

    const buildTeamStatsCol = (teamNum) => {
      const tags = Object.keys(g.stats || {}).filter(tag => tTeamMembers(teamNum).includes(tag));
      const rowsHtml = tags.length === 0
        ? '<div class="t-team-card-empty">기록된 선수가 없습니다.</div>'
        : tags.map(tag => {
            const p = getPlayerByTag(tag) || { tier:'' };
            const s = g.stats[tag] || { k:0, d:0, a:0 };
            return `
              <div class="t-kda-row">
                <span class="t-kda-name">${escapeHtml(tag)} ${getTierBadgeHtml(p.tier)}</span>
                <span class="t-game-detail-kda">K${s.k} / D${s.d} / A${s.a}</span>
              </div>
            `;
          }).join('');
      return `
        <div class="t-stats-col">
          <span class="team-title t-stats-col-title">TEAM ${teamNum}</span>
          ${rowsHtml}
        </div>
      `;
    };

    return `
      <div class="t-game-detail">
        <p class="counter" style="margin-bottom:8px;">세트별 결과</p>
        <div class="t-game-detail-sets">${setsHtml}</div>
        <p class="counter" style="margin:14px 0 8px;">선수별 기록</p>
        <div class="t-stats-columns">
          ${buildTeamStatsCol(g.teamA)}
          ${buildTeamStatsCol(g.teamB)}
        </div>
      </div>
    `;
  };

  const gamesHtml = entry.games.length === 0
    ? '<div class="t-team-card-empty">아직 기록된 경기가 없습니다.</div>'
    : entry.games.map((g, idx) => {
        const isOpen = tState.expandedGameIdx === idx;
        return `
      <div class="t-game-row-wrap ${isOpen ? 'expanded' : ''}">
        <div class="t-game-row t-game-row-clickable" data-idx="${idx}">
          <span>게임 ${idx + 1}</span>
          <span class="t-game-winner">
            TEAM ${g.teamA || '-'} vs TEAM ${g.teamB || '-'} · TEAM ${g.winnerTeam} 승리
            ${g.bo ? `<span class="t-game-maps">BO${g.bo} · ${(g.mapAssignments || []).map(m => escapeHtml(m.map)).join(', ')}</span>` : ''}
          </span>
          ${tState.readOnly ? '' : `<button type="button" class="row-delete t-game-delete" data-idx="${idx}" aria-label="삭제">✕</button>`}
        </div>
        ${isOpen ? buildGameDetailHtml(g) : ''}
      </div>
    `;
      }).join('');

  const addPanelHtml = tState.readOnly
    ? ''
    : (tState.addGameDraft
        ? tBuildAddGamePanelHtml()
        : `<div class="nav-row nav-row-right"><button type="button" class="btn btn-primary" id="btnOpenAddGame">+ 경기 추가</button></div>`);

  view.innerHTML = `
    <div class="screen-intro">
      <h2>${escapeHtml(t.name)} · 경기 결과</h2>
      <p class="counter">${tState.readOnly ? '이 대회의 경기 결과를 조회할 수 있습니다.' : '맞붙은 팀을 선택하고 선수별 K/D/A를 입력해 경기를 기록하세요.'}</p>
    </div>

    ${tBuildTeamsCompositionHtml(t)}

    <div class="t-rank-section">
      <span class="t-rank-title">실시간 팀 랭킹</span>
      <div class="t-rank-list">${teamRankHtml}</div>
    </div>

    <div class="t-rank-columns">
      <div class="t-rank-section">
        <span class="t-rank-title">킬 랭킹</span>
        <div class="t-rank-list">${buildPlayerRankHtml(killRanking, 'k', 'K')}</div>
      </div>
      <div class="t-rank-section">
        <span class="t-rank-title">어시스트 랭킹</span>
        <div class="t-rank-list">${buildPlayerRankHtml(assistRanking, 'a', 'A')}</div>
      </div>
    </div>

    <div class="t-games-list">${gamesHtml}</div>

    ${addPanelHtml}

    <div class="nav-row" style="margin-top:20px;">
      <button class="btn btn-ghost" id="btnBackToList">← 대회 목록</button>
      ${tState.readOnly ? '' : '<button class="btn btn-primary" id="btnSaveResults">결과 저장</button>'}
    </div>
    <div id="tResultsMsg" class="load-error hidden"></div>
  `;

  $('#btnBackToList').addEventListener('click', () => {
    if(tState.resultsDirty && !confirm('저장하지 않은 변경사항이 있습니다. 나가시겠습니까?')) return;
    tRenderList();
  });

  if(!tState.readOnly){
    $$('.t-game-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.idx);
        entry.games.splice(idx, 1);
        entry.games.forEach((g, i) => { g.game = i + 1; });
        tState.resultsDirty = true;
        tState.expandedGameIdx = null;
        tRenderResults();
      });
    });

    const openBtn = $('#btnOpenAddGame');
    if(openBtn) openBtn.addEventListener('click', tOpenAddGameForm);

    tWireAddGamePanel();

    $('#btnSaveResults').addEventListener('click', tSaveResults);
  }

  $$('.t-game-row-clickable').forEach(row => {
    row.addEventListener('click', () => {
      const idx = Number(row.dataset.idx);
      tState.expandedGameIdx = (tState.expandedGameIdx === idx) ? null : idx;
      tRenderResults();
    });
  });
}

async function tSaveResults(){
  const t = tState.resultsTournament;
  const msgBox = $('#tResultsMsg');
  const btn = $('#btnSaveResults');
  msgBox.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = '저장 중...';

  try{
    const cfg = GitHubStore.getConfig();
    const entry = tState.currentResultEntry;
    entry.updatedAt = new Date().toISOString();

    const others = (tState.allResults || []).filter(r => !(r.type === 'tournament' && r.tournamentId === t.id));
    const merged = [...others, entry];

    // 저장 직전에 최신 sha를 다시 받아온다 (읽기를 정적 파일로 했으면 sha가 없을 수 있음)
    let sha = tState.resultsSha;
    try{
      const fresh = await fetchTournamentResults(cfg);
      sha = fresh.sha;
    }catch(e){ /* keep previous sha */ }

    const result = await saveTournamentResults(cfg, merged, sha);
    tState.resultsSha = result.content ? result.content.sha : tState.resultsSha;
    tState.allResults = merged;
    tState.resultsDirty = false;

    msgBox.classList.remove('hidden');
    msgBox.style.background = '#F3FBF4';
    msgBox.style.borderColor = '#BEE3C4';
    msgBox.style.color = '#1E7A32';
    msgBox.innerHTML = '<strong>저장 완료.</strong> data/tournament-results.json에 반영되었습니다.';
  }catch(err){
    msgBox.classList.remove('hidden');
    msgBox.style.background = '';
    msgBox.style.borderColor = '';
    msgBox.style.color = '';
    msgBox.innerHTML = `<strong>저장 실패</strong><br>${escapeHtml(err.message)}`;
  }finally{
    btn.disabled = false;
    btn.textContent = '결과 저장';
  }
}


/* ---------------- EDIT: STEP 1 - MEMBER SELECT ---------------- */
function tOpenEditMembers(t){
  tState.editing = t;
  tState.memberSelection = [...(t.memberTags || [])];
  tRenderEditMembers();
}

function tRenderEditMembers(){
  const view = $('#tView');
  const count = tState.memberSelection.length;

  view.innerHTML = `
    <div class="screen-intro">
      <h2>${escapeHtml(tState.editing.name)} · 멤버 선택</h2>
      <p class="counter" id="tMemberCounter">${count}명 선택됨 (인원 제한 없음)</p>
    </div>
    <div class="search-container">
      <input type="text" id="tPlayerSearch" class="player-search-input" placeholder="닉네임 또는 실명 검색..." autocomplete="off" />
      <div id="tSearchDropdown" class="search-dropdown hidden"></div>
    </div>
    <div id="tMemberGrid" class="player-grid"></div>
    <div class="nav-row">
      <button class="btn btn-ghost" id="btnTMembersBack">← 대회 목록</button>
      <button class="btn btn-primary" id="btnTMembersNext" ${count === 0 ? 'disabled' : ''}>다음</button>
    </div>
    <div id="tMembersMsg" class="load-error hidden"></div>
  `;

  function tUpdateCounter(){
    const n = tState.memberSelection.length;
    $('#tMemberCounter').textContent = `${n}명 선택됨 (인원 제한 없음)`;
    $('#btnTMembersNext').disabled = n === 0;
  }

  function tToggleMember(tag){
    const card = $$('#tMemberGrid .player-card').find(c => c.dataset.tag === tag);
    const idx = tState.memberSelection.indexOf(tag);
    if(idx === -1){
      tState.memberSelection.push(tag);
      if(card) card.classList.add('checked');
    }else{
      tState.memberSelection.splice(idx, 1);
      if(card) card.classList.remove('checked');
    }
    tUpdateCounter();
  }

  const grid = $('#tMemberGrid');
  state.players.forEach(p => {
    const card = document.createElement('div');
    const isSelected = tState.memberSelection.includes(p.tag);
    card.className = 'player-card' + (isSelected ? ' checked' : '');
    card.dataset.tag = p.tag;
    card.innerHTML = `
      <span class="checkbox">
        <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
          <path d="M1 4.5L4 7.5L10 1.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="player-name">${escapeHtml(p.tag)} ${getTierBadgeHtml(p.tier)}</span>
    `;
    card.addEventListener('click', () => tToggleMember(p.tag));
    grid.appendChild(card);
  });

  attachPlayerSearch(view.querySelector('#tPlayerSearch'), view.querySelector('#tSearchDropdown'), view.querySelector('.search-container'), {
    isSelected: (tag) => tState.memberSelection.includes(tag),
    onPick: (tag) => tToggleMember(tag)
  });

  $('#btnTMembersBack').addEventListener('click', tRenderList);
  $('#btnTMembersNext').addEventListener('click', tSaveMembersAndNext);
}

/* 멤버 선택 단계에서 "다음"을 누르면 지금까지의 진행 상황을 즉시 저장한 뒤 다음 단계로 이동 */
async function tSaveMembersAndNext(){
  const msgBox = $('#tMembersMsg');
  if(msgBox) msgBox.classList.add('hidden');

  const t = tState.editing;
  t.memberTags = [...tState.memberSelection];
  const idx = tState.tournaments.findIndex(x => x.id === t.id);
  if(idx !== -1) tState.tournaments[idx] = t;

  const btn = $('#btnTMembersNext');
  if(btn){ btn.disabled = true; btn.textContent = '저장 중...'; }
  try{
    await tSaveTournaments();
    tOpenEditTeams();
  }catch(err){
    if(msgBox){
      msgBox.classList.remove('hidden');
      msgBox.innerHTML = `<strong>저장 실패</strong><br>${escapeHtml(err.message)}`;
    }
    if(btn){ btn.disabled = false; btn.textContent = '다음'; }
  }
}

/* ---------------- EDIT: STEP 2 - TEAM COUNT + ASSIGN ---------------- */
function tOpenEditTeams(){
  const t = tState.editing;
  tState.teamCount = t.teamCount && t.teamCount >= 2 ? t.teamCount : 2;
  tState.teamOf = {};
  tState.captains = Array.isArray(t.captains) ? [...t.captains] : [];
  tState.groupOf = t.groupOf ? { ...t.groupOf } : {};
  tState.teamNames = t.teamNames ? { ...t.teamNames } : {};
  tState.editingTeamNameOf = null;
  tState.memberSelection.forEach(tag => {
    for(const [teamNum, tags] of Object.entries(t.teams || {})){
      if(Array.isArray(tags) && tags.includes(tag)) tState.teamOf[tag] = Number(teamNum);
    }
  });
  tRenderEditTeams();
}

function tTeamLabel(teamNames, n){
  const custom = teamNames && teamNames[n] ? String(teamNames[n]).trim() : '';
  return custom || `TEAM ${n}`;
}

function tRenderEditTeams(){
  const view = $('#tView');
  const teamBtnsHtml = Array.from({length:7}, (_, i) => i + 2).map(n => `
    <button type="button" class="bo-btn t-team-count-btn ${tState.teamCount === n ? 'active' : ''}" data-n="${n}">${n}팀</button>
  `).join('');

  view.innerHTML = `
    <div class="screen-intro">
      <h2>${escapeHtml(tState.editing.name)} · 팀 구성</h2>
      <p class="counter">총 몇 팀으로 나눌지 선택하고, 각 멤버를 팀에 배정하세요</p>
    </div>
    <div class="bo-select" id="tTeamCountSelect">${teamBtnsHtml}</div>

    <div id="tTeamGrid" class="t-team-grid"></div>

    <div class="sort-controls">
      <button class="mini-btn" id="btnTSortDesc">티어 내림차순</button>
      <button class="mini-btn" id="btnTSortAsc">티어 오름차순</button>
    </div>
    <div class="unassigned-wrap">
      <div class="unassigned-label">멤버 후보</div>
      <div id="tUnassignedScroll" class="t-unassigned-scroll">
        <div id="tUnassignedList" class="unassigned-list"></div>
      </div>
    </div>

    <div class="nav-row">
      <button class="btn btn-ghost" id="btnTTeamsBack">← 멤버 선택</button>
      <button class="btn btn-primary" id="btnTTeamsSave">저장</button>
    </div>
    <div id="tTeamsMsg" class="load-error hidden"></div>
  `;

  $$('.t-team-count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tState.teamCount = Number(btn.dataset.n);
      Object.keys(tState.teamOf).forEach(tag => {
        if(tState.teamOf[tag] > tState.teamCount) delete tState.teamOf[tag];
      });
      if(tState.captains.length > tState.teamCount){
        tState.captains = tState.captains.slice(0, tState.teamCount);
      }
      tRenderEditTeams();
    });
  });

  $('#btnTSortDesc').addEventListener('click', () => tSortMembers(false));
  $('#btnTSortAsc').addEventListener('click', () => tSortMembers(true));

  $('#btnTTeamsBack').addEventListener('click', tRenderEditMembers);
  $('#btnTTeamsSave').addEventListener('click', tSaveTeamsAndReturn);

  tRenderTeamSetupBody();
}

function tSaveTeamName(n, value){
  tState.teamNames[n] = value;
  tState.editingTeamNameOf = null;
  tRenderTeamSetupBody();
}

function tSortMembers(asc){
  tState.memberSelection.sort((a, b) => {
    const sA = getTierScoreExact((getPlayerByTag(a) || {}).tier);
    const sB = getTierScoreExact((getPlayerByTag(b) || {}).tier);
    return asc ? sA - sB : sB - sA;
  });
  tRenderTeamSetupBody();
}

function tAssignMember(tag, teamNum){
  if(teamNum === null){
    delete tState.teamOf[tag];
    tRenderTeamSetupBody();
    return;
  }

  if(tState.captains.includes(tag)){
    // 팀장은 같은 팀에 다른 팀장이 있으면 서로 자리를 맞바꿈
    const occupyingCap = tState.captains.find(c => c !== tag && tState.teamOf[c] === teamNum);
    if(occupyingCap){
      const myPrevTeam = tState.teamOf[tag];
      tState.teamOf[occupyingCap] = myPrevTeam || null;
      if(!myPrevTeam) delete tState.teamOf[occupyingCap];
    }
    tState.teamOf[tag] = teamNum;
  }else{
    const group = tState.groupOf[tag];
    if(group){
      tState.memberSelection.forEach(t => {
        if(tState.groupOf[t] === group) tState.teamOf[t] = teamNum;
      });
    }else{
      tState.teamOf[tag] = teamNum;
    }
  }
  tRenderTeamSetupBody();
}

function tToggleGroup(tag, g){
  tState.groupOf[tag] = (tState.groupOf[tag] === g) ? null : g;
  tRenderTeamSetupBody();
}

function tToggleCaptain(tag){
  const idx = tState.captains.indexOf(tag);
  if(idx === -1){
    if(tState.captains.length >= tState.teamCount) return;
    tState.captains.push(tag);
    // 이미 다른 팀장이 있는 팀을 피해서, 비어있는 팀 번호에 자동 배정
    const usedTeams = new Set(tState.captains.filter(c => c !== tag).map(c => tState.teamOf[c]).filter(Boolean));
    let targetTeam = null;
    for(let n = 1; n <= tState.teamCount; n++){
      if(!usedTeams.has(n)){ targetTeam = n; break; }
    }
    if(targetTeam === null) targetTeam = 1;
    tState.teamOf[tag] = targetTeam;
  }else{
    tState.captains.splice(idx, 1);
  }
  tRenderTeamSetupBody();
}

function tBuildGroupControlsHtml(tag){
  const g = tState.groupOf[tag];
  return `
    <div class="group-controls">
      <span class="group-label">그룹</span>
      <button class="group-btn t-group-btn ${g === 1 ? 'active' : ''}" data-tag="${escapeAttrJs(tag)}" data-group="1">1</button>
      <button class="group-btn t-group-btn ${g === 2 ? 'active' : ''}" data-tag="${escapeAttrJs(tag)}" data-group="2">2</button>
      <button class="group-btn t-group-btn ${g === 3 ? 'active' : ''}" data-tag="${escapeAttrJs(tag)}" data-group="3">3</button>
    </div>
  `;
}

function tBuildCapBtnHtml(tag){
  const isCap = tState.captains.includes(tag);
  const capDisabled = !isCap && tState.captains.length >= tState.teamCount ? 'disabled' : '';
  return `<button type="button" class="cap-btn t-cap-btn ${isCap ? 'active' : ''}" data-tag="${escapeAttrJs(tag)}" ${capDisabled}>팀장</button>`;
}

function tRenderTeamSetupBody(){
  /* ---- 팀 상자 그리드 (02 팀 배정과 동일한 tag-chip 디자인) ---- */
  const teamGrid = $('#tTeamGrid');
  teamGrid.innerHTML = '';

  for(let n = 1; n <= tState.teamCount; n++){
    const tags = tState.memberSelection.filter(tag => tState.teamOf[tag] === n);

    const col = document.createElement('div');
    col.className = 't-team-col';

    const sum = tags.reduce((acc, tag) => acc + getTierScoreExact((getPlayerByTag(tag) || {}).tier), 0);
    const avgTier = tags.length ? getTierFromScore(sum / 5) : null;
    const avgHtml = avgTier ? `평균 : <span>${avgTier}</span> ${getTierBadgeHtml(avgTier)}` : '평균 : -';

    const isEditingName = tState.editingTeamNameOf === n;
    const nameRowHtml = isEditingName
      ? `
        <div class="t-team-name-row">
          <input type="text" class="t-team-name-input" data-n="${n}" value="${escapeAttrJs(tTeamLabel(tState.teamNames, n))}" placeholder="TEAM ${n}" />
          <button type="button" class="t-team-name-save-btn" data-n="${n}" aria-label="저장">✓</button>
        </div>
      `
      : `
        <div class="t-team-name-row">
          <span class="team-title">${escapeHtml(tTeamLabel(tState.teamNames, n))}</span>
          <button type="button" class="t-team-name-edit-btn" data-n="${n}" aria-label="팀명 편집">✎</button>
        </div>
      `;

    col.innerHTML = `
      ${nameRowHtml}
      <div class="team-list" data-team="${n}"></div>
      <div class="team-avg">${avgHtml}</div>
    `;

    if(isEditingName){
      const input = col.querySelector('.t-team-name-input');
      input.addEventListener('keydown', (e) => {
        if(e.key === 'Enter') tSaveTeamName(n, input.value);
      });
      col.querySelector('.t-team-name-save-btn').addEventListener('click', () => {
        tSaveTeamName(n, input.value);
      });
    }else{
      col.querySelector('.t-team-name-edit-btn').addEventListener('click', () => {
        tState.editingTeamNameOf = n;
        tRenderTeamSetupBody();
      });
    }

    const list = col.querySelector('.team-list');
    if(tags.length === 0){
      list.innerHTML = '<div class="t-team-card-empty">배정된 멤버 없음</div>';
    }else{
      tags.forEach(tag => {
        const p = getPlayerByTag(tag) || { tier:'' };
        const isCap = tState.captains.includes(tag);
        const chip = document.createElement('div');
        chip.className = 'tag-chip has-group';
        chip.innerHTML = `
          <div class="chip-top">
            <span>${escapeHtml(tag)} ${getTierBadgeHtml(p.tier)}</span>
            <button class="remove-btn" aria-label="제거">✕</button>
          </div>
          <div class="chip-bottom">
            ${tBuildGroupControlsHtml(tag)}
            ${tBuildCapBtnHtml(tag)}
          </div>
        `;
        chip.querySelector('.remove-btn').addEventListener('click', () => tAssignMember(tag, null));
        chip.querySelector('.t-cap-btn').addEventListener('click', () => tToggleCaptain(tag));
        chip.querySelectorAll('.t-group-btn').forEach(btn => {
          btn.addEventListener('click', () => tToggleGroup(btn.dataset.tag, Number(btn.dataset.group)));
        });
        list.appendChild(chip);
      });
    }

    teamGrid.appendChild(col);
  }

  /* ---- 멤버 후보 (미배정, 스크롤 영역) ---- */
  const pool = $('#tUnassignedList');
  pool.innerHTML = '';
  const unassignedTags = tState.memberSelection.filter(tag => !tState.teamOf[tag]);

  if(unassignedTags.length === 0){
    pool.innerHTML = '<div class="t-team-card-empty">모든 멤버가 팀에 배정되었습니다.</div>';
  }else{
    unassignedTags.forEach(tag => {
      const p = getPlayerByTag(tag) || { tier:'' };
      const teamBtnsHtml = Array.from({length: tState.teamCount}, (_, i) => i + 1).map(n => `
        <button class="mini-btn team-btn" data-team="${n}">${n}팀</button>
      `).join('');

      const chip = document.createElement('div');
      chip.className = 'unassigned-chip has-group';
      chip.innerHTML = `
        <div class="chip-top">
          <span>${escapeHtml(tag)} ${getTierBadgeHtml(p.tier)}</span>
          <div class="team-btns t-assign-teambtns">${teamBtnsHtml}</div>
        </div>
        <div class="chip-bottom">
          ${tBuildGroupControlsHtml(tag)}
          ${tBuildCapBtnHtml(tag)}
        </div>
      `;
      chip.querySelectorAll('.team-btn').forEach(btn => {
        btn.addEventListener('click', () => tAssignMember(tag, Number(btn.dataset.team)));
      });
      chip.querySelector('.t-cap-btn').addEventListener('click', () => tToggleCaptain(tag));
      chip.querySelectorAll('.t-group-btn').forEach(btn => {
        btn.addEventListener('click', () => tToggleGroup(btn.dataset.tag, Number(btn.dataset.group)));
      });
      pool.appendChild(chip);
    });
  }
}

function escapeAttrJs(str){ return escapeHtml(str).replace(/"/g, '&quot;'); }

/* ---------------- 팀 구성 표시 (읽기전용) - 경기 결과 화면 상단에 삽입 ---------------- */
function tBuildTeamsCompositionHtml(t){
  const teamCount = t.teamCount && t.teamCount >= 2 ? t.teamCount : 2;
  const captains = Array.isArray(t.captains) ? t.captains : [];
  const teams = t.teams || {};

  const colsHtml = Array.from({length: teamCount}, (_, i) => i + 1).map(n => {
    const tags = Array.isArray(teams[n]) ? teams[n] : [];
    const sum = tags.reduce((acc, tag) => acc + getTierScoreExact((getPlayerByTag(tag) || {}).tier), 0);
    const avgTier = tags.length ? getTierFromScore(sum / 5) : null;
    const avgHtml = avgTier ? `평균 : <span>${avgTier}</span> ${getTierBadgeHtml(avgTier)}` : '평균 : -';

    const chipsHtml = tags.length === 0
      ? '<div class="t-team-card-empty">배정된 멤버 없음</div>'
      : tags.map(tag => {
          const p = getPlayerByTag(tag) || { tier:'' };
          const isCap = captains.includes(tag);
          return `
            <div class="tag-chip t-view-chip">
              <div class="chip-top">
                <span>${escapeHtml(tag)} ${getTierBadgeHtml(p.tier)}</span>
                ${isCap ? '<span class="t-cap-mark">팀장</span>' : ''}
              </div>
            </div>
          `;
        }).join('');

    return `
      <div class="t-team-col">
        <span class="team-title">${escapeHtml(tTeamLabel(t.teamNames, n))}</span>
        <div class="team-list">${chipsHtml}</div>
        <div class="team-avg">${avgHtml}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="t-rank-section">
      <span class="t-rank-title">팀 구성</span>
      <div class="t-team-grid">${colsHtml}</div>
    </div>
  `;
}

async function tSaveTeamsAndReturn(){
  const msgBox = $('#tTeamsMsg');
  msgBox.classList.add('hidden');

  const teams = {};
  for(let n = 1; n <= tState.teamCount; n++) teams[n] = [];
  tState.memberSelection.forEach(tag => {
    const n = tState.teamOf[tag];
    if(n) teams[n].push(tag);
  });

  const t = tState.editing;
  t.memberTags = [...tState.memberSelection];
  t.teamCount = tState.teamCount;
  t.teams = teams;
  t.captains = [...tState.captains];
  t.groupOf = { ...tState.groupOf };
  t.teamNames = { ...tState.teamNames };

  const idx = tState.tournaments.findIndex(x => x.id === t.id);
  if(idx !== -1) tState.tournaments[idx] = t;

  const btn = $('#btnTTeamsSave');
  btn.disabled = true;
  btn.textContent = '저장 중...';
  try{
    await tSaveTournaments();
    tRenderList();
  }catch(err){
    msgBox.classList.remove('hidden');
    msgBox.innerHTML = `<strong>저장 실패</strong><br>${escapeHtml(err.message)}`;
    btn.disabled = false;
    btn.textContent = '저장';
  }
}



/* ---------------- 대회모드 결과 저장 (GitHub 커밋) ---------------- */
function tournamentApiUrl(cfg, path){
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`;
}

async function fetchTournamentResults(cfg){
  const res = await fetch(tournamentApiUrl(cfg, TOURNAMENT_RESULTS_PATH), {
    headers:{ 'Authorization': `token ${cfg.token}`, 'Accept': 'application/vnd.github+json' }
  });
  if(res.status === 404) return { sha:null, results:[] };
  if(!res.ok){
    const body = await res.text();
    throw new Error(`불러오기 실패 (${res.status}): ${GitHubStore.explainError(res.status, body)}`);
  }
  const json = await res.json();
  const text = GitHubStore.b64decode(json.content);
  let results = [];
  try{ results = JSON.parse(text); }catch(e){ results = []; }
  return { sha: json.sha, results };
}

async function saveTournamentResults(cfg, results, sha){
  const content = GitHubStore.b64encode(JSON.stringify(results, null, 2) + '\n');
  const body = { message:'대회모드 경기 결과 저장', content, branch: cfg.branch };
  if(sha) body.sha = sha;
  const res = await fetch(tournamentApiUrl(cfg, TOURNAMENT_RESULTS_PATH).split('?')[0], {
    method:'PUT',
    headers:{
      'Authorization': `token ${cfg.token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const errBody = await res.text();
    throw new Error(`저장 실패 (${res.status}): ${GitHubStore.explainError(res.status, errBody)}`);
  }
  return await res.json();
}

function buildTournamentRecord(){
  const teamPlayers = (n) => state.selected
    .filter(tag => state.teamOf[tag] === n)
    .map(tag => {
      const p = getPlayerByTag(tag) || {};
      return { tag, name: p.name || '', tier: p.tier || '' };
    });

  return {
    id: `match-${Date.now()}`,
    playedAt: new Date().toISOString(),
    bo: state.bo,
    captains: state.captains,
    team1: teamPlayers(1),
    team2: teamPlayers(2),
    mapAssignments: state.mapAssignments.map(item => ({
      game: item.game,
      map: item.map,
      source: item.source,
      side1: item.side1,
      side2: item.side2
    }))
  };
}

if($('#btnSaveTournamentResult')){
  $('#btnSaveTournamentResult').addEventListener('click', async () => {
    const btn = $('#btnSaveTournamentResult');
    const msgBox = $('#tournamentSaveMsg');
    msgBox.classList.add('hidden');

    const cfg = (typeof GitHubStore !== 'undefined') ? GitHubStore.getConfig() : null;
    if(!cfg || !GitHubStore.hasConfig()){
      msgBox.classList.remove('hidden');
      msgBox.innerHTML = '<strong>GitHub 저장소 연결 정보가 없습니다.</strong><br>이 브라우저에서 "참가자 관리(admin.html)"에 먼저 로그인해 저장소를 연결해주세요.';
      return;
    }

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = '저장 중...';

    try{
      const { sha, results } = await fetchTournamentResults(cfg);
      results.push(buildTournamentRecord());
      await saveTournamentResults(cfg, results, sha);

      msgBox.classList.remove('hidden');
      msgBox.style.background = '#221012';
      msgBox.style.borderColor = '#7a1420';
      msgBox.style.color = '#ff8f97';
      msgBox.innerHTML = '<strong>경기 결과가 저장되었습니다.</strong> (data/tournament-results.json)';
    }catch(err){
      msgBox.classList.remove('hidden');
      msgBox.style.background = '';
      msgBox.style.borderColor = '';
      msgBox.style.color = '';
      msgBox.innerHTML = `<strong>저장 실패</strong><br>${escapeHtml(err.message)}`;
    }finally{
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
}

/* ---------------- INIT ---------------- */
loadPlayers();
