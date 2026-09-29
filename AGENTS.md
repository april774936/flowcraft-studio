# Agent rules — antigravity hub (Claude & Antigravity/Gemini)

이 폴더(`/Users/mac/Documents/antigravity`)는 flowcraft-studio 저장소 루트이자, 5개 프로젝트를 모아둔 로컬 개발 허브입니다. 서브폴더(`passmaster/`, `leet_master/`, `bokwatch/`, `report-hub/`)는 각각 **독립 git 저장소**입니다.

Read `HANDOFF.md` first for the hub overview and per-project links.

## 공통 규칙
1. 어떤 프로젝트든 작업 전 `git status`/`git log -5`로 상대 에이전트(Claude ↔ Antigravity)의 최근/미커밋 변경 확인.
2. 서브프로젝트 안에서 작업할 때는 그 폴더의 `AGENTS.md`/`HANDOFF.md`가 이 문서보다 우선.
3. 커밋/푸시는 해당 프로젝트의 git 루트 안에서만 (서브폴더는 각자 원격 저장소가 다름).
4. 커밋 메시지 접두어: `[claude]` / `[antigravity]`.
5. 이 문서(아래 규칙)는 이 루트 폴더 자체, 즉 flowcraft-studio 앱에 적용됨.

## flowcraft-studio 자체 규칙
- 정적 Vite 앱, 열었을 때만 동작(요청-응답형) — 서버 상시구동 불필요.
- 저장: localStorage(`flowcraft_projects_v2`) + Supabase(`flowcraft_sync`)로 기기간 동기화(`public/sync.js` — Vite는 `public/`만 빌드에 복사하므로 루트로 옮기지 말 것).
- Vercel에 GitHub 연동 자동배포 — push하면 자동 반영, 별도 배포 명령 불필요.
- 사용자 지시(2026-09-29): 작업 PR은 검증(빌드/테스트) 통과 후 확인 요청 없이 바로 main에 머지.
