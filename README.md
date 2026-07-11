# 내전 팀 나누기

정적 웹사이트로, 저장소 안의 `data/players.json`에서 참가자 목록을 읽어와
10명 선택 → 1팀/2팀 배정 → 선공/선수비 랜덤 배정 흐름을 진행합니다.

참가자 데이터는 **엑셀 파일을 다시 올릴 필요 없이, 사이트 안의 "참가자 관리" 페이지에서
바로 추가/수정/삭제하고 저장할 수 있습니다.** 저장 버튼을 누르면 GitHub 저장소에
바로 커밋됩니다.

## 파일 구성
- `index.html` / `style.css` / `app.js` — 팀 나누기 메인 화면
- `admin.html` / `admin.js` — 참가자 관리(편집) 화면
- `github-api.js` — GitHub Contents API 호출 도우미 (편집 화면에서 사용)
- `data/players.json` — 참가자 데이터 (예시 포함, 관리 화면에서 편집 가능)

## data/players.json 형식
```json
[
  { "tag": "Faker#KR1", "name": "이상혁", "tier": "챌린저" },
  { "tag": "ShowMaker#KR1", "name": "허수", "tier": "챌린저" }
]
```

## GitHub Pages로 배포하기
1. 이 파일들(폴더 구조 그대로: `index.html`, `style.css`, `app.js`, `admin.html`, `admin.js`,
   `github-api.js`, `data/players.json`)을 GitHub 저장소 루트에 올립니다.
2. 저장소 **Settings → Pages** 에서 Source를 `main` 브랜치 / `root` 로 설정합니다.
3. 몇 분 후 `https://<사용자명>.github.io/<저장소명>/` 주소로 접속하면 사이트가 열립니다.

## 참가자 관리 화면 사용법 (엑셀 없이 바로 편집)
1. 사이트에서 우측 상단 **"참가자 관리"** 버튼 클릭 (또는 `admin.html` 직접 접속)
2. 처음 접속 시 GitHub 저장소 연결 정보를 입력합니다:
   - **owner**: 본인 GitHub 아이디
   - **repo**: 저장소 이름
   - **branch**: 보통 `main`
   - **파일 경로**: `data/players.json` (그대로 두면 됨)
   - **Personal Access Token**: 아래 방법으로 발급한 토큰
3. 토큰 발급 방법:
   - GitHub → 우측 상단 프로필 → **Settings → Developer settings → Personal access tokens
     → Fine-grained tokens → Generate new token**
   - Repository access: 이 저장소만 선택
   - Permissions → **Contents: Read and write** 로 설정
   - 발급된 토큰을 복사해서 관리 화면에 붙여넣기
   - ⚠️ 토큰은 이 브라우저의 로컬 저장소(localStorage)에만 저장되며, 코드나 커밋에는
     절대 포함되지 않습니다. 다른 사람 브라우저에서는 다시 입력해야 합니다.
4. "연결하고 불러오기"를 누르면 현재 참가자 목록이 표로 나타납니다.
5. 표에서 바로 값을 수정하거나, **"+ 참가자 추가"**로 행을 늘리고,
   행 끝의 ✕ 버튼으로 삭제할 수 있습니다.
6. **"GitHub에 저장"**을 누르면 `data/players.json`이 저장소에 바로 커밋됩니다.
   GitHub Pages에 반영되기까지 약 30초~1분 정도 걸릴 수 있습니다.

> 로컬에서 미리 볼 때는 파일을 더블클릭하지 말고, 반드시 로컬 서버로 열어야 합니다
> (브라우저 보안 정책상 `fetch()`가 `file://`에서는 차단됩니다).
> 예: 이 폴더에서 `python3 -m http.server` 실행 후 `http://localhost:8000` 접속.
> (단, 참가자 관리 화면의 "GitHub에 저장"은 로컬에서도 실제 저장소로 커밋됩니다.)

## 팀 나누기 사용 흐름
1. **선택 화면** — 닉네임#태그가 한 줄에 4개씩 표시됩니다. 체크박스로 최대 10명 선택 후 "다음".
2. **팀 배정 화면** — 선택된 10명만 표시됩니다. 각 유저 옆의 "1팀"/"2팀" 버튼으로 배정하고,
   양 팀이 각각 5명이 되면 "다음" 버튼이 활성화됩니다.
3. **결과 화면** — "랜덤 배정" 버튼을 누르면 1팀/2팀에 선공/선수비가 무작위로 배정됩니다.

모든 화면에는 "이전" 버튼이 있어 앞 단계로 돌아가 다시 조정할 수 있습니다.
