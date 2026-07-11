/* ============================================================
   내전 팀 나누기 - app.js
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
  let abbr = (rank === 'Radiant') ? 'R' : (rank === 'Immortal' ? 'IM' + num : rank.charAt(0) + num);
  const c = TIER_COLORS[rank] || { bg:'#E7E7EA', text:'#6B6D76' };
  return `<span class="tier-badge" style="background:${c.bg}; color:${c.text};">${abbr}</span>`;
}

function getPlayerByTag(tag) { return state.players.find(p => p.tag === tag); }

/* ---------------- LOAD DATA ---------------- */
async function loadPlayers(){
  try{
    const res = await fetch(`data/players.json?t=${Date.now()}`);
    if(!res.ok) throw new Error('파일 로드 실패');
    state.players = (await res.json()).filter(r => r.tag).map(r => ({
      tag: String(r.tag).trim(), name: String(r.name || '').trim(), tier: String(r.tier || '').trim()
    }));
    renderPlayerGrid();
  }catch(err){ $('#loadError').classList.remove('hidden'); }
}

/* ---------------- SCREEN 1 : SELECT ---------------- */
function renderPlayerGrid(){
  const grid = $('#playerGrid');
  if(!$('#searchContainer')){
    const searchWrap = document.createElement('div');
    searchWrap.id = 'searchContainer'; searchWrap.className = 'search-container';
    searchWrap.innerHTML = `<input type="text" id="playerSearch" placeholder="닉네임 또는 실명 검색..." /><div id="searchDropdown" class="search-dropdown hidden"></div>`;
    grid.parentNode.insertBefore(searchWrap, grid);
    $('#playerSearch').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().replace(/\s+/g, '');
      const d = $('#searchDropdown');
      if(!q) { d.classList.add('hidden'); return; }
      const matches = state.players.filter(p => String(p.tag).toLowerCase().replace(/\s+/g, '').includes(q) || (String(p.name||'').toLowerCase().replace(/\s+/g, '').includes(q) && q.length >= 2));
      d.innerHTML = matches.map(p => `<div class="dropdown-item" data-tag="${escapeHtml(p.tag)}">${escapeHtml(p.tag)} ${getTierBadgeHtml(p.tier)}</div>`).join('');
      d.classList.remove('hidden');
      $$('.dropdown-item').forEach(item => item.addEventListener('click', () => { toggleSelect(item.dataset.tag); d.classList.add('hidden'); $('#playerSearch').value=''; }));
    });
  }
  grid.innerHTML = '';
  state.players.forEach(p=>{
    const card = document.createElement('div');
    card.className = 'player-card'; card.dataset.tag = p.tag;
    card.innerHTML = `<span class="checkbox"></span><span class="player-name">${escapeHtml(p.tag)} ${getTierBadgeHtml(p.tier)}</span>`;
    card.addEventListener('click', () => toggleSelect(p.tag));
    grid.appendChild(card);
  });
  updateSelectUI();
}

function toggleSelect(tag){
  const idx = state.selected.indexOf(tag);
  if(idx >= 0) state.selected.splice(idx, 1);
  else if(state.selected.length < 10) state.selected.push(tag);
  updateSelectUI();
}

function updateSelectUI(){
  $$('.player-card').forEach(card => card.classList.toggle('checked', state.selected.includes(card.dataset.tag)));
  $('#btn1-next').disabled = state.selected.length !== 10;
}

/* ---------------- SCREEN 2 : TEAM ASSIGN ---------------- */
function enterScreen2(){
  state.teamOf = {}; state.groupOf = {}; state.captains = [];
  state.selected.forEach(tag => { state.teamOf[tag] = null; state.groupOf[tag] = null; });
  initTeamColumnsUI(); renderTeamScreen(); showScreen(2);
}

function getTierScoreExact(tier) {
  if (!tier) return 0;
  const ranks = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal'];
  const parts = tier.split(' ');
  const rank = parts[0];
  const num = parseInt(parts[1]) || 0;
  return (rank === 'Radiant') ? 25 : (ranks.indexOf(rank) * 3) + num;
}

function getTierFromScore(score) {
  let s = Math.floor(score);
  if (s >= 25) return 'Radiant';
  const ranks = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal'];
  const rankIdx = Math.floor((s - 1) / 3);
  const num = ((s - 1) % 3) + 1;
  return rankIdx >= 0 && rankIdx < ranks.length ? `${ranks[rankIdx]} ${num}` : null;
}

function assignTeam(tag, teamNum) {
  if (state.captains.includes(tag)) {
    state.teamOf[tag] = teamNum;
    const otherCap = state.captains.find(c => c !== tag);
    if (otherCap && state.teamOf[otherCap] === teamNum) state.teamOf[otherCap] = teamNum === 1 ? 2 : 1;
  } else {
    const group = state.groupOf[tag];
    state.selected.forEach(t => { if (!group || state.groupOf[t] === group) state.teamOf[t] = teamNum; });
  }
  renderTeamScreen();
}

function toggleCaptain(tag) {
  if (state.captains.includes(tag)) state.captains = state.captains.filter(t => t !== tag);
  else if (state.captains.length < 2) {
    state.captains.push(tag);
    assignTeam(tag, state.captains.length === 1 ? 1 : (state.teamOf[state.captains[0]] === 1 ? 2 : 1));
  }
  renderTeamScreen();
}

function initTeamColumnsUI() {
  if(!$('#advantageBox')) {
    const cw = $('.team-columns'); cw.style.gridTemplateColumns = '1fr auto 1fr';
    const adv = document.createElement('div'); adv.className = 'adv-col';
    adv.innerHTML = '<div class="adv-box" id="advantageBox">대기중</div>';
    cw.insertBefore(adv, cw.children[1]);
    cw.children[0].appendChild(Object.assign(document.createElement('div'),{className:'team-avg', id:'t1AvgBox', textContent:'평균 : -'}));
    cw.children[2].appendChild(Object.assign(document.createElement('div'),{className:'team-avg', id:'t2AvgBox', textContent:'평균 : -'}));
  }
}

function updateAveragesUI() {
  const t1s = state.selected.filter(t => state.teamOf[t] === 1);
  const t2s = state.selected.filter(t => state.teamOf[t] === 2);
  let s1 = t1s.reduce((a, t) => a + getTierScoreExact(getPlayerByTag(t).tier), 0);
  let s2 = t2s.reduce((a, t) => a + getTierScoreExact(getPlayerByTag(t).tier), 0);
  const avg1 = s1 / 5, avg2 = s2 / 5;
  const n1 = getTierFromScore(avg1), n2 = getTierFromScore(avg2);
  $('#t1AvgBox').innerHTML = n1 ? `평균 : <span class="avg-val">${n1}</span> ${getTierBadgeHtml(n1)}` : '평균 : -';
  $('#t2AvgBox').innerHTML = n2 ? `평균 : <span class="avg-val">${n2}</span> ${getTierBadgeHtml(n2)}` : '평균 : -';
  
  if (s1 > 0 || s2 > 0) {
    const d = Math.abs(avg1 - avg2).toFixed(1);
    $('#advantageBox').innerHTML = (avg1 > avg2) ? `TEAM 1<br><span class="diff">${d}티어 우세</span>` : (avg2 > avg1) ? `TEAM 2<br><span class="diff">${d}티어 우세</span>` : `동일<br><span class="diff">0.0티어</span>`;
  }
}

function renderTeamScreen(){
  const t1 = $('#team1List'), t2 = $('#team2List'), un = $('#unassignedList');
  t1.innerHTML = ''; t2.innerHTML = ''; un.innerHTML = '';
  state.selected.forEach(tag=>{
    const teamNum = state.teamOf[tag], p = getPlayerByTag(tag), g = state.groupOf[tag], isCap = state.captains.includes(tag);
    const chip = document.createElement('div');
    chip.className = (teamNum ? 'tag-chip' : 'unassigned-chip') + ' has-group';
    chip.innerHTML = `<div class="chip-top"><span>${escapeHtml(tag)} ${getTierBadgeHtml(p.tier)}</span>${teamNum ? '<button class="remove-btn">✕</button>' : '<div class="team-btns"><button class="mini-btn team-btn" data-team="1">1팀</button><button class="mini-btn team-btn" data-team="2">2팀</button></div>'}</div><div class="chip-bottom"><div class="group-controls"><span class="group-label">그룹</span><button class="group-btn ${g===1?'active':''}" data-group="1">1</button><button class="group-btn ${g===2?'active':''}" data-group="2">2</button><button class="group-btn ${g===3?'active':''}" data-group="3">3</button></div><button class="cap-btn ${isCap?'active':''}">팀장</button></div>`;
    if(teamNum) chip.querySelector('.remove-btn').addEventListener('click', () => assignTeam(tag, null));
    else chip.querySelectorAll('.team-btn').forEach(btn => btn.addEventListener('click', () => assignTeam(tag, Number(btn.dataset.team))));
    chip.querySelectorAll('.group-btn').forEach(btn => btn.addEventListener('click', () => { state.groupOf[tag] = (state.groupOf[tag] == btn.dataset.group) ? null : Number(btn.dataset.group); renderTeamScreen(); }));
    chip.querySelector('.cap-btn').addEventListener('click', () => toggleCaptain(tag));
    (teamNum === 1 ? t1 : (teamNum === 2 ? t2 : un)).appendChild(chip);
  });
  updateAveragesUI();
  $('#teamCounter').textContent = `1팀 ${state.selected.filter(t=>state.teamOf[t]===1).length}명 · 2팀 ${state.selected.filter(t=>state.teamOf[t]===2).length}명`;
}

/* ---------------- NAV & UTIL ---------------- */
function escapeHtml(str){ return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
$('#btn1-next').addEventListener('click', enterScreen2);
$('#btn2-back').addEventListener('click', () => showScreen(1));
$('#btn2-next').addEventListener('click', () => { /* enterScreen3 */ });
$('#btn3-back').addEventListener('click', () => showScreen(2));
loadPlayers();
