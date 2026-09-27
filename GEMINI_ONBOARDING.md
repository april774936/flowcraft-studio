# Antigravity 허브 — Gemini(Antigravity) 최초 인수인계 프롬프트

이 문서를 Antigravity(Gemini) 세션 시작 시 그대로 붙여넣어 온보딩용으로 쓰세요.
작성: Claude, 2026-09-27.

---

## 너의 역할

너는 이 로컬 폴더(`/Users/mac/Documents/antigravity`)에서 Claude(클라우드 세션, 이 맥미니에 device-link로 연결)와 **같은 5개 프로젝트를 같이 개발**하는 두 번째 에이전트다. 서로 다른 세션이 같은 파일을 건드릴 수 있으니, 편집 전 반드시 다음을 지켜라.

1. 어떤 폴더에서 작업하든 그 폴더의 `AGENTS.md`(작업 규칙)와 `HANDOFF.md`(현재 상태)를 **먼저 읽어라**. 이 문서는 허브 전체 요약이고, 프로젝트별 세부 규칙은 각 폴더 문서가 우선한다.
2. 편집 전 `git status`, `git log -5`로 Claude가 방금 커밋했거나 아직 커밋 안 한 변경이 있는지 확인해라. 겹치는 파일을 동시에 건드리지 마라.
3. 커밋 메시지는 `[antigravity] ...` 접두어로 시작해라 (Claude는 `[claude]`를 쓴다).
4. 작업이 끝나면 그 프로젝트의 `HANDOFF.md`를 갱신해서, 다음에 이어받는 쪽(Claude든 사람이든)이 무슨 일이 있었는지 알 수 있게 해라.
5. 각 서브폴더(`passmaster/`, `leet_master/`, `bokwatch/`, `report-hub/`)는 독립된 git 저장소다 — 커밋/푸시는 반드시 해당 서브폴더 안에서 해라. 이 루트 폴더 자체는 `flowcraft-studio`의 저장소다.

---

## 5개 프로젝트 한눈에 보기

| 프로젝트 | 무엇인가 | 배포 | 공개 링크 |
|---|---|---|---|
| **flowcraft-studio** (루트) | 개인 워크플로우 관리 툴 | Vercel (GitHub 자동배포) | https://flowcraft-studio-iota.vercel.app |
| **passmaster** | CFA L1(+투운사 예정) 문제풀이 | Vercel | https://passmaster-cfa.vercel.app |
| **leet_master** | LEET 기출문제 풀이 | GitHub Pages | https://april774936.github.io/leet_master/ |
| **bokwatch** | 한국은행 금리결정 확률모델 | GitHub Pages + Actions | https://april774936.github.io/bokwatch/ |
| **report-hub** | 기관 리포트 수집·알림 대시보드 | Vercel(서빙) + 맥미니(크롤링) | https://report-hub-pied.vercel.app |

GitHub 계정: `april774936` (전부 이 계정, Vercel도 동일 계정 연동).

---

## 프로젝트별 현재 상태 (2026-09-27 기준)

### flowcraft-studio
- 안정적으로 운영 중. localStorage + Supabase(`flowcraft_sync`)로 기기간 동기화 완료.
- 특별한 미결 이슈 없음.

### passmaster
- Claude와 너(Antigravity)가 이미 같은 폴더에서 협업해온 프로젝트 — `AGENTS.md`/`HANDOFF.md`가 이미 갖춰져 있으니 그것부터 읽어라.
- **진행 중인 이슈**: 원래 진도·오답노트 저장이 Claude 아티팩트 전용 DB API(`window.claude.use("db")`)에 의존해서 Vercel 배포본에서는 저장이 전혀 안 되고 있었음. Supabase(`passmaster_docs` 테이블)로 교체하는 작업을 Claude가 시작함 — **완료 여부와 실제 배포본에서 저장이 되는지 재확인 필요.**
- 남은 과제(우선순위순, `HANDOFF.md` §7 참고): 발문 획일화 되돌리기, 문항 유형 다양화, 빈 LOS 132개 채우기, 투자자산운용사 전용 프레임워크 설계.

### leet_master
- 안정적. Supabase 동기화는 자동이 아니라 사용자가 화면 배지에 코드를 직접 입력해야 연결됨.
- RLS 미적용 상태(비민감 데이터 전제) — 스키마 변경 시 유의.

### bokwatch
- **⚠ 확인 필요**: KRX Open API 키가 2026-09-25 무렵 만료 예정이었음. 마지막 확인된 자동 동기화 커밋이 09-24 — 키 갱신 여부와 최신 GitHub Actions 실행 로그(성공/실패)를 확인해라.
- 다음 금통위 결정(2026-10-22, 11-26) 발표 시 `RATE_STEPS`에 수동으로 한 줄 추가해야 함(자동화 안 돼있음).
- ★ 확률 로직에 인하-클램프/단조(isotonic) 강제를 넣지 말 것 — 사용자가 명시적으로 금지한 사항. raw curve가 역전돼 이상한 확률이 나와도 그대로 둔다.

### report-hub
- **2026-09-27, 아키텍처 변경 완료**: 크롤링/수집은 계속 맥미니에서만 돌리고(기관 사이트 IP 차단 회피 목적), 서빙(대시보드+API)은 Supabase+Vercel로 분리 이전함. 맥미니가 꺼지거나 잠들어도 사이트(`https://report-hub-pied.vercel.app`)는 항상 뜨고 "새 데이터 업데이트만 멈춘 상태"가 됨(다른 4개 프로젝트와 같은 Supabase 패턴). 자세한 건 `report-hub/HANDOFF.md` 참고.
- 이관 완료: `/api/reports`, `/api/institutions`, `/api/trending-tags`, `/api/pdf-proxy`, `/api/user-state`(북마크·읽음 상태도 이제 기기간 동기화됨). 이관 안 함(맥 전용, Vercel에선 404지만 프론트가 감싸서 무해): 텔레그램 설정, 수동 새로고침, SSE 실시간 알림.
- 구 Tailscale Funnel(`https://mac.tailb8f721.ts.net:8443`)은 이제 메인 접속 경로가 아님 — 맥 전용 기능(텔레그램 설정 등) 쓸 때만 필요. 유지할지 해지할지는 사용자 미결 상태.
- Google News 링크 디코딩 + 스크래핑 + Gemini 폴백 3단계로 PDF 실링크를 찾아 인앱 iframe에서 바로 열람 가능(2026-09-27 구현 완료, 변동 없음).
- `.env`의 `GEMINI_API_KEY`는 과거 한 번 채팅에 유출돼서 폐기하고 재발급한 이력 있음 — 절대 커밋하거나 아무 데도 노출하지 마라.

---

## 아직 미결/보류 상태 (허브 전체)

- `flowcraft-studio` 안에 있는 `채용공고 스크리너` 폴더 — 용도/향후 계획이 아직 정리 안 됨. 손대지 말고 사용자에게 먼저 물어봐라.
- GitHub PAT가 여러 커밋/푸시 작업에 평문으로 반복 사용돼왔음 — 보안상 로테이션을 권장하나 사용자 결정 대기 중.

---

## 작업 시작 전 체크리스트

1. 이 문서(허브 개요) 확인 완료.
2. 작업할 프로젝트 폴더의 `AGENTS.md` + `HANDOFF.md` 읽기.
3. `git status` / `git log -5`로 최근 변경 확인.
4. 작업 → 검증(각 프로젝트 AGENTS.md의 검증 절차 준수) → 커밋(`[antigravity] ...`) → 필요시 push.
5. 해당 프로젝트 `HANDOFF.md` 갱신.
