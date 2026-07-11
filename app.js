/* ============================================================
   내전 팀 나누기 - app.js
   ============================================================ */

const state = {
  players: [],
  selected: [],
  teamOf: {},
  groupOf: {},
  captains: [],
  side: {}
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

async function loadPlayers(){
  try{
    const res = await fetch(`data/players.json?t=${Date.now()}`);
    if(!res.ok) throw new Error('파일 로드 실패');
    state.players = (await res.json()).filter(r => r.tag).map(r => ({
      tag: String(r.tag).trim(), name: String(r.name || '').trim(), tier: String(r.tier || '').trim()
    }));
    renderPlayerGrid();
  }catch(err){
    $('#loadError').classList.remove('hidden');
  }
}

function renderPlayerGrid(){
  const grid = $('#playerGrid');
  grid.innerHTML = '';
  state.players.forEach(p=>{
    const card = document.createElement('div');
    card.className = 'player-card';
    card.dataset.tag = p.tag;
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
  $$('.player-card').forEach(card=>{
    const tag = card.dataset.tag;
    card.classList.toggle('checked', state.selected.includes(tag));
  });
  $('#btn1-next').disabled = state.selected.length !== 10;
}

function enterScreen2(){
  state.teamOf = {}; state.groupOf = {}; state.captains = [];
  state.selected.forEach(tag => { state.teamOf[tag] = null; state.groupOf[tag] = null; });
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
  return (rank === 'Radiant') ? 25 : (ranks.indexOf(rank) * 3) + num;
}

function getTierFromScore(score) {
  let s = Math.floor(score);
  if (s >= 25) return 'Radiant';
  const ranks = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal'];
  const rankIdx = Math.floor((s - 1) / 3);
  const num = ((s - 1) % 3) + 1;
  return `${ranks[rankIdx]} ${num}`;
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

function updateAveragesUI() {
  const t1s = state.selected.filter(t => state.teamOf[t] === 1);
  const t2s = state.selected.filter(t => state.teamOf[t] === 2);
  let s1 = t1s.reduce((a, t) => a + getTierScoreExact(getPlayerByTag(t).tier), 0);
  let s2 = t2s.reduce((a, t) => a + getTierScoreExact(getPlayerByTag(t).tier), 0);
  
  const avg1 = s1 / 5, avg2 = s2 / 5;
  const n1 = getTierFromScore(avg1), n2 = getTierFromScore(avg2);
  
  $('#t1AvgBox').innerHTML = n1 ? `평균 : <span class="avg-val">${n1}</span> ${getTierBadgeHtml(n1)}` : '평균 : -';
  $('#t2AvgBox').innerHTML = n2 ? `평균 : <span class="avg-val">${n2}</span> ${getTierBadgeHtml(n2)}` : '평균 : -';
  
  const adv = $('#advantageBox');
  if (s1 > 0 || s2 > 0) {
    const d = Math.abs(avg1 - avg2).toFixed(1);
    adv.innerHTML = (avg1 > avg2) ? `TEAM 1<br><span class="diff">${d}티어 우세</span>` : (avg2 > avg1) ? `TEAM 2<br><span class="diff">${d}티어 우세</span>` : `동일<br><span class="diff">0.0티어</span>`;
  }
}

function renderTeamScreen(){
  // (중략 - 렌더링 로직 유지)
  updateAveragesUI();
}

// ... 기타 로직은 동일
loadPlayers();
