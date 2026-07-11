/* ============================================================
   github-api.js
   GitHub Contents API를 이용해 저장소의 data/players.json 파일을
   브라우저에서 직접 읽고 쓰기 위한 도우미.
   토큰/저장소 정보는 이 브라우저의 localStorage에만 저장됩니다.
   ============================================================ */

const GH_CONFIG_KEY = 'teamsplit_gh_config';

const GitHubStore = {
  getConfig(){
    try{
      const raw = localStorage.getItem(GH_CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  },
  saveConfig(cfg){
    localStorage.setItem(GH_CONFIG_KEY, JSON.stringify(cfg));
  },
  clearConfig(){
    localStorage.removeItem(GH_CONFIG_KEY);
  },
  hasConfig(){
    const c = this.getConfig();
    return !!(c && c.owner && c.repo && c.branch && c.path && c.token);
  },

  apiUrl(cfg){
    return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}?ref=${encodeURIComponent(cfg.branch)}`;
  },

  // UTF-8 safe base64 encode/decode
  b64encode(str){
    return btoa(unescape(encodeURIComponent(str)));
  },
  b64decode(b64){
    return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
  },

  async fetchFile(cfg){
    const res = await fetch(this.apiUrl(cfg), {
      headers:{
        'Authorization': `token ${cfg.token}`,
        'Accept': 'application/vnd.github+json'
      }
    });
    if(res.status === 404){
      // file doesn't exist yet
      return { sha:null, players:[] };
    }
    if(!res.ok){
      const body = await res.text();
      throw new Error(`GitHub 조회 실패 (${res.status}): ${this.explainError(res.status, body)}`);
    }
    const json = await res.json();
    const text = this.b64decode(json.content);
    let players = [];
    try{ players = JSON.parse(text); }catch(e){ players = []; }
    return { sha: json.sha, players };
  },

  async saveFile(cfg, players, sha){
    const content = this.b64encode(JSON.stringify(players, null, 2) + '\n');
    const body = {
      message: `참가자 목록 업데이트 (웹 편집기)`,
      content,
      branch: cfg.branch
    };
    if(sha) body.sha = sha;

    const res = await fetch(this.apiUrl(cfg).split('?')[0], {
      method: 'PUT',
      headers:{
        'Authorization': `token ${cfg.token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if(!res.ok){
      const errBody = await res.text();
      throw new Error(`저장 실패 (${res.status}): ${this.explainError(res.status, errBody)}`);
    }
    return await res.json();
  },

  explainError(status, body){
    if(status === 401) return '토큰이 유효하지 않습니다.';
    if(status === 403) return '권한이 없습니다. 토큰에 Contents 읽기/쓰기 권한이 있는지 확인하세요.';
    if(status === 404) return '저장소 또는 경로를 찾을 수 없습니다. owner/repo/branch/path를 확인하세요.';
    if(status === 409) return '충돌이 발생했습니다. 새로고침 후 다시 시도해주세요.';
    return body.slice(0, 200);
  }
};
