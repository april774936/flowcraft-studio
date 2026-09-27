# antigravity 허브 — 프로젝트 전체 개요

허브 위치: `/Users/mac/Documents/antigravity` (Mac Mini)
마지막 갱신: 2026-09-27 (Claude)

## 5개 프로젝트 & 외부 접속 링크

| 프로젝트 | 무엇인가 | 배포 방식 | 공개 링크 |
|---|---|---|---|
| **flowcraft-studio** (이 루트 폴더) | 개인 워크플로우 관리 툴 | Vercel (GitHub 자동배포) | https://flowcraft-studio-iota.vercel.app |
| **passmaster** (`passmaster/`) | CFA L1 등 자격시험 문제풀이 | Vercel | https://passmaster-cfa.vercel.app |
| **leet_master** (`leet_master/`) | LEET 기출문제 풀이 | GitHub Pages | https://april774936.github.io/leet_master/ |
| **bokwatch** (`bokwatch/`) | 한국은행 금리결정 확률모델 | GitHub Pages + GitHub Actions | https://april774936.github.io/bokwatch/ |
| **report-hub** (`report-hub/`) | 기관 리포트 수집·알림 대시보드 | Vercel(서빙)+맥미니(크롤링) | https://report-hub-pied.vercel.app |

GitHub 계정: april774936 (전부 이 계정 소유, Vercel도 동일 계정 연동)

## 협업 구조
- Claude(클라우드 세션, 맥미니에 device-link로 연결)와 Antigravity(Gemini 계열 로컬 IDE 에이전트) 두 에이전트가 이 폴더들에서 같이 작업.
- 각 서브프로젝트 폴더 안에 `AGENTS.md`(작업 규칙) + `HANDOFF.md`(현재 상태·인수인계)를 두고, 두 에이전트 모두 작업 시작 전 반드시 그 두 파일을 먼저 읽고, 작업 후에는 갱신하는 방식으로 컨텍스트 연속성을 유지한다 (2026-09-27, 5개 프로젝트 전체에 표준화).
- 커밋 메시지는 항상 `[claude]` 또는 `[antigravity]` 접두어로 누가 작업했는지 표시.

## 상세는 각 프로젝트 폴더의 AGENTS.md/HANDOFF.md 참고
