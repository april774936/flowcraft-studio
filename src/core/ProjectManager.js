// ProjectManager: Manages multiple workflows by project

// Sample projects use a fixed, old timestamp so that on a fresh device they
// never win a sync merge against the user's edited copies.
const DEFAULT_PROJECT_TIMESTAMP = '2026-01-01T00:00:00.000Z';
export class ProjectManager {
  constructor() {
    this.STORAGE_KEY = 'flowcraft_projects_v2';
    this.ACTIVE_KEY = 'flowcraft_active_project_id';
    this.TOMBSTONE_KEY = 'flowcraft_deleted_project_ids';
    this.projects = this.loadProjects();
    this.activeProjectId = this.loadActiveProjectId();
  }

  loadProjects() {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.error('Failed to parse projects from storage', e);
      }
    }
    // Return initial default starter projects
    return this.getDefaultProjects();
  }

  loadActiveProjectId() {
    const saved = localStorage.getItem(this.ACTIVE_KEY);
    if (saved && this.projects.some(p => p.id === saved)) {
      return saved;
    }
    return this.projects[0]?.id || 'default_project';
  }

  saveProjects() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.projects));
    localStorage.setItem(this.ACTIVE_KEY, this.activeProjectId);
  }

  getActiveProject() {
    let proj = this.projects.find(p => p.id === this.activeProjectId);
    if (!proj) {
      proj = this.projects[0];
      this.activeProjectId = proj.id;
      this.saveProjects();
    }
    return proj;
  }

  getProjectsList(includeDeleted = false) {
    if (includeDeleted) return this.projects;
    return this.projects.filter(p => !p.isDeleted);
  }

  getDeletedProjects() {
    return this.projects.filter(p => p.isDeleted);
  }

  switchProject(projectId) {
    if (this.projects.some(p => p.id === projectId)) {
      this.activeProjectId = projectId;
      this.saveProjects();
      return this.getActiveProject();
    }
    return null;
  }

  createProject(name, templateKey = 'blank') {
    const id = 'proj_' + Date.now();
    let initialData = { nodes: [], edges: [], notes: [] };

    if (templateKey !== 'blank') {
      const template = this.getTemplateByKey(templateKey);
      if (template) {
        initialData = JSON.parse(JSON.stringify(template));
      }
    }

    const newProject = {
      id,
      name: name || '새 프로젝트',
      mode: 'flowchart',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      viewport: { x: 80, y: 80, zoom: 1 },
      nodes: initialData.nodes || [],
      edges: initialData.edges || [],
      notes: initialData.notes || []
    };
    if (initialData.timeline) newProject.timeline = initialData.timeline;

    this.projects.unshift(newProject);
    this.activeProjectId = id;
    this.saveProjects();
    return newProject;
  }

  renameProject(projectId, newName) {
    const proj = this.projects.find(p => p.id === projectId);
    if (proj) {
      proj.name = newName.trim() || '이름 없는 프로젝트';
      proj.updatedAt = new Date().toISOString();
      this.saveProjects();
      return true;
    }
    return false;
  }

  duplicateProject(projectId) {
    const proj = this.projects.find(p => p.id === projectId);
    if (!proj) return null;

    const copy = JSON.parse(JSON.stringify(proj));
    copy.id = 'proj_' + Date.now();
    copy.name = `${proj.name} (사본)`;
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = new Date().toISOString();

    this.projects.unshift(copy);
    this.activeProjectId = copy.id;
    this.saveProjects();
    return copy;
  }

  deleteProject(projectId) {
    const proj = this.projects.find(p => p.id === projectId);
    if (!proj) return false;

    // Soft delete
    proj.isDeleted = true;
    proj.updatedAt = new Date().toISOString();

    // If active project is deleted, switch to the first available non-deleted project
    if (this.activeProjectId === projectId) {
      const remaining = this.getProjectsList();
      if (remaining.length > 0) {
        this.activeProjectId = remaining[0].id;
      } else {
        // If all projects are deleted, create a fresh one to prevent breaking
        const newProj = this.createProject('새 프로젝트');
        this.activeProjectId = newProj.id;
      }
    }
    
    this.saveProjects();
    return true;
  }

  restoreProject(projectId) {
    const proj = this.projects.find(p => p.id === projectId);
    if (proj) {
      proj.isDeleted = false;
      proj.updatedAt = new Date().toISOString();
      this.saveProjects();
      return true;
    }
    return false;
  }

  hardDeleteProject(projectId) {
    this.projects = this.projects.filter(p => p.id !== projectId);
    // Tombstone so cross-device sync doesn't resurrect it from another device's copy
    let tombstones = {};
    try {
      tombstones = JSON.parse(localStorage.getItem(this.TOMBSTONE_KEY)) || {};
    } catch (e) { /* ignore corrupt value */ }
    tombstones[projectId] = new Date().toISOString();
    localStorage.setItem(this.TOMBSTONE_KEY, JSON.stringify(tombstones));
    this.saveProjects();
    return true;
  }

  updateActiveProjectData({ nodes, edges, notes, viewport }) {
    const proj = this.getActiveProject();
    if (proj) {
      if (nodes !== undefined) proj.nodes = nodes;
      if (edges !== undefined) proj.edges = edges;
      if (notes !== undefined) proj.notes = notes;
      if (viewport !== undefined) proj.viewport = viewport;
      if (arguments[0].mode !== undefined) proj.mode = arguments[0].mode;
      if ('timeline' in arguments[0]) {
        if (arguments[0].timeline) proj.timeline = arguments[0].timeline; else delete proj.timeline;
      }
      proj.updatedAt = new Date().toISOString();
      this.saveProjects();
    }
  }

  updateProjectViewport(projectId, viewport) {
    const proj = this.projects.find(p => p.id === projectId);
    if (proj) {
      proj.viewport = viewport;
      this.saveProjects();
    }
  }

  getDefaultProjects() {
    return [
      {
        id: 'proj_ecommerce_order',
        name: '이커머스 결제 & 배송 자동화',
        mode: 'flowchart',
        createdAt: DEFAULT_PROJECT_TIMESTAMP,
        updatedAt: DEFAULT_PROJECT_TIMESTAMP,
        viewport: { x: 100, y: 120, zoom: 0.95 },
        notes: [
          {
            id: 'note_1',
            x: 40,
            y: 20,
            width: 240,
            height: 140,
            color: 'yellow',
            text: '💡 [프로젝트 메모]\n주문 접수부터 재고 파악, 자동 송장 발급 및 배송 추적 API까지 연결하는 핵심 워크플로우입니다.'
          },
          {
            id: 'note_2',
            x: 820,
            y: 470,
            width: 220,
            height: 120,
            color: 'pink',
            text: '⚠️ 결제 실패 시 3회까지 자동 재시도 후 고객 SMS 전송 로직 필수 확인'
          }
        ],
        nodes: [
          {
            id: 'node_start',
            type: 'start',
            category: 'start',
            title: '결제 완료 이벤트',
            desc: 'PG사 결제 승인 Webhook 수신',
            icon: 'trigger',
            color: '#10b981',
            x: 40,
            y: 251,
            status: 'idle',
            memo: 'PG사 웹훅 시그니처 검증 토큰 확인 필수'
          },
          {
            id: 'node_check_stock',
            type: 'action',
            category: 'action',
            title: '재고 유효성 검사',
            desc: 'ERP 시스템 실시간 재고 수량 조회',
            icon: 'database',
            color: '#3b82f6',
            x: 390,
            y: 220,
            status: 'idle',
            memo: '재고 잠금(Lock) 처리를 위해 격리 레벨 확인'
          },
          {
            id: 'node_decision_stock',
            type: 'condition',
            category: 'condition',
            title: '재고 충분 여부?',
            desc: '주문 수량 <= 현재 가용 재고',
            icon: 'condition',
            color: '#8b5cf6',
            x: 780,
            y: 213,
            status: 'idle',
            memo: 'False인 경우 자동으로 품절 취소 API로 분기'
          },
          {
            id: 'node_create_invoice',
            type: 'action',
            category: 'action',
            title: '배송 송장 생성',
            desc: 'CJ대한통운 물류 API 호출 및 바코드 출력',
            icon: 'api',
            color: '#3b82f6',
            x: 1150,
            y: 60,
            status: 'idle',
            memo: '송장 번호 생성 즉시 WMS 센터로 전송'
          },
          {
            id: 'node_notify_success',
            type: 'action',
            category: 'integration',
            title: '주문 확인 알림톡 발송',
            desc: '카카오 비즈메시지 & 이메일 발송',
            icon: 'message',
            color: '#f59e0b',
            x: 1540,
            y: 60,
            status: 'idle',
            memo: '카카오톡 실패 시 LMS로 자동 대체 발송'
          },
          {
            id: 'node_end_success',
            type: 'end',
            category: 'end',
            title: '주문 처리 완료',
            desc: '배송 준비 단계로 주문 상태 변경',
            icon: 'end',
            color: '#ec4899',
            x: 1930,
            y: 96,
            status: 'idle',
            memo: ''
          },
          {
            id: 'node_refund_action',
            type: 'action',
            category: 'action',
            title: '결제 자동 취소 & 환불',
            desc: '품절에 따른 PG 즉시 결제 승인 취소',
            icon: 'action',
            color: '#ef4444',
            x: 1150,
            y: 360,
            status: 'idle',
            memo: '취소 수수료 없이 원거래 전체 취소'
          },
          {
            id: 'node_end_fail',
            type: 'end',
            category: 'end',
            title: '품절 취소 종료',
            desc: '고객 환불 안내 문자 발송 후 종료',
            icon: 'end',
            color: '#ec4899',
            x: 1540,
            y: 386,
            status: 'idle',
            memo: ''
          }
        ],
        edges: [
          { id: 'e1', from: 'node_start', fromPort: 'right', to: 'node_check_stock', toPort: 'left', label: '주문 데이터 전달', lineType: 'orthogonal' },
          { id: 'e2', from: 'node_check_stock', fromPort: 'right', to: 'node_decision_stock', toPort: 'left', label: '재고 확인', lineType: 'orthogonal' },
          { id: 'e3', from: 'node_decision_stock', fromPort: 'right', to: 'node_create_invoice', toPort: 'left', label: '재고 있음 (Yes)', lineType: 'orthogonal' },
          { id: 'e4', from: 'node_decision_stock', fromPort: 'bottom', to: 'node_refund_action', toPort: 'left', label: '품절 (No)', lineType: 'orthogonal' },
          { id: 'e5', from: 'node_create_invoice', fromPort: 'right', to: 'node_notify_success', toPort: 'left', label: '송장 완료', lineType: 'orthogonal' },
          { id: 'e6', from: 'node_notify_success', fromPort: 'right', to: 'node_end_success', toPort: 'left', label: '완료', lineType: 'orthogonal' },
          { id: 'e7', from: 'node_refund_action', fromPort: 'right', to: 'node_end_fail', toPort: 'left', label: '환불 완료', lineType: 'orthogonal' }
        ]
      },
      {
        id: 'proj_cicd_pipeline',
        name: 'CI/CD 클라우드 자동 배포 파이프라인',
        mode: 'flowchart',
        createdAt: DEFAULT_PROJECT_TIMESTAMP,
        updatedAt: DEFAULT_PROJECT_TIMESTAMP,
        viewport: { x: 100, y: 120, zoom: 0.95 },
        notes: [
          {
            id: 'note_cicd',
            x: 40,
            y: 20,
            width: 250,
            height: 120,
            color: 'blue',
            text: '🚀 [DevOps 파이프라인]\nGit main 브랜치 푸시 시 자동 빌드, 테스트, 도커 이미지 생성 및 스테이징/운영 배포 자동화'
          }
        ],
        nodes: [
          {
            id: 'c_start',
            type: 'start',
            category: 'start',
            title: 'Git Push Event',
            desc: 'main 브랜치 PR 머지 감지',
            icon: 'webhook',
            color: '#10b981',
            x: 40,
            y: 231,
            status: 'idle',
            memo: 'GitHub Actions Webhook'
          },
          {
            id: 'c_lint_test',
            type: 'action',
            category: 'action',
            title: '린트 및 단위 테스트',
            desc: 'npm test & ESLint 무결성 검증',
            icon: 'terminal',
            color: '#3b82f6',
            x: 390,
            y: 200,
            status: 'idle',
            memo: '커버리지 80% 이상 필수'
          },
          {
            id: 'c_build_docker',
            type: 'action',
            category: 'action',
            title: 'Docker Image 빌드',
            desc: '멀티스테이지 이미지 최적화 빌드',
            icon: 'action',
            color: '#3b82f6',
            x: 780,
            y: 200,
            status: 'idle',
            memo: 'ECR 저장소로 태그 푸시'
          },
          {
            id: 'c_deploy_staging',
            type: 'action',
            category: 'integration',
            title: 'Staging 환경 배포',
            desc: 'Kubernetes 스테이징 클러스터 롤링 업데이트',
            icon: 'api',
            color: '#10b981',
            x: 1170,
            y: 200,
            status: 'idle',
            memo: '헬스체크 200 OK 대기'
          },
          {
            id: 'c_end',
            type: 'end',
            category: 'end',
            title: '배포 완료 & Slack 알림',
            desc: '#devops 채널에 성공 보고',
            icon: 'message',
            color: '#ec4899',
            x: 1560,
            y: 231,
            status: 'idle',
            memo: ''
          }
        ],
        edges: [
          { id: 'ce1', from: 'c_start', fromPort: 'right', to: 'c_lint_test', toPort: 'left', label: '트리거', lineType: 'orthogonal' },
          { id: 'ce2', from: 'c_lint_test', fromPort: 'right', to: 'c_build_docker', toPort: 'left', label: '테스트 통과', lineType: 'orthogonal' },
          { id: 'ce3', from: 'c_build_docker', fromPort: 'right', to: 'c_deploy_staging', toPort: 'left', label: '이미지 푸시 완료', lineType: 'orthogonal' },
          { id: 'ce4', from: 'c_deploy_staging', fromPort: 'right', to: 'c_end', toPort: 'left', label: '헬스체크 통과', lineType: 'orthogonal' }
        ]
      }
    ];
  }

  getTemplateByKey(key) {
    const templates = this.getDefaultProjects();
    if (key === 'ecommerce') return templates[0];
    if (key === 'cicd') return templates[1];
    
    // ---- Purpose templates: career roadmap / study flow / exam plan ----
    const TN = (id, type, icon, title, x, y, color, extra = {}) =>
      ({ id, type, category: type, icon, title, desc: '', x, y, color, status: 'idle', memo: '', ...extra });
    const TC = (...items) => items.map((text, i) => ({ id: `ck${i}`, text, done: false }));
    const TE = (id, from, fromPort, to, toPort, label = '') => ({ id, from, fromPort, to, toPort, label, lineType: 'orthogonal' });

    if (key === 'career') {
      return {
        mode: 'flowchart',
        viewport: { x: 60, y: 60, zoom: 0.8 },
        nodes: [
          TN('cr_now', 'start', 'start', '현재 위치', 40, 300, '#10b981', { period: '2026 Q3', progress: 'done', desc: '직무 · 연차 · 강점' }),
          TN('cr_diag', 'action', 'check', '역량 진단', 360, 230, '#10b981', {
            period: '2026.10', progress: 'active',
            checklist: TC('보유 자격증 · 스킬 정리', '목표 직무 채용공고 5개 분석', '부족한 역량 목록화')
          }),
          TN('cr_short', 'milestone', 'flag', '단기 목표 (6개월)', 780, 220, '#f59e0b', {
            period: '~2027.03', progress: 'planned',
            checklist: TC('자격증 1개 취득', '포트폴리오 1개 완성', '관련 스터디 참여')
          }),
          TN('cr_path', 'condition', 'condition', '어떤 경로로?', 1200, 262, '#8b5cf6', {
            branches: [{ id: 'deep', label: '현 직무 심화' }, { id: 'switch', label: '직무 전환' }, { id: 'grad', label: '대학원 진학' }]
          }),
          TN('cr_deep', 'action', 'action', '사내 핵심 프로젝트 리드', 1590, 40, '#3b82f6', { period: '2027 H2', desc: '성과를 수치로 남기기' }),
          TN('cr_switch', 'action', 'user', '목표 직무 이직 준비', 1590, 250, '#3b82f6', {
            period: '2027 H2', checklist: TC('이력서 · 포트폴리오 업데이트', '현직자 커피챗 5회', '지원 · 면접')
          }),
          TN('cr_grad', 'document', 'book', '대학원 지원', 1590, 520, '#f59e0b', {
            period: '2027 H2', checklist: TC('학업계획서', '추천서 2부', '입학 시험 준비')
          }),
          TN('cr_mid', 'milestone', 'flag', '중기 목표 (2~3년)', 2010, 280, '#f59e0b', { period: '~2029', desc: '목표 직무에서 성과 증명' }),
          TN('cr_long', 'end', 'target', '장기 목표', 2400, 305, '#ec4899', { period: '2031', desc: '5년 후 되고 싶은 모습' })
        ],
        edges: [
          TE('cre1', 'cr_now', 'right', 'cr_diag', 'left'),
          TE('cre2', 'cr_diag', 'right', 'cr_short', 'left'),
          TE('cre3', 'cr_short', 'right', 'cr_path', 'left'),
          TE('cre4', 'cr_path', 'branch:deep', 'cr_deep', 'left', '현 직무 심화'),
          TE('cre5', 'cr_path', 'branch:switch', 'cr_switch', 'left', '직무 전환'),
          TE('cre6', 'cr_path', 'branch:grad', 'cr_grad', 'left', '대학원 진학'),
          TE('cre7', 'cr_deep', 'right', 'cr_mid', 'left'),
          TE('cre8', 'cr_switch', 'right', 'cr_mid', 'left'),
          TE('cre9', 'cr_grad', 'right', 'cr_mid', 'left'),
          TE('cre10', 'cr_mid', 'right', 'cr_long', 'left')
        ],
        notes: [
          { id: 'cr_note', x: 40, y: 20, width: 270, height: 180, color: 'yellow', text: '💡 사용법\n노드 선택 → Tab: 다음 단계 / Enter: 같은 단계\n더블클릭: 이름 수정\n오른쪽 패널: 기간 · 진행 상태 · 체크리스트' }
        ]
      };
    }

    if (key === 'study') {
      return {
        mode: 'flowchart',
        viewport: { x: 60, y: 60, zoom: 0.8 },
        nodes: [
          TN('st_topic', 'start', 'book', '공부할 주제', 40, 290, '#10b981', { desc: '예: 옵션 가격결정 모형' }),
          TN('st_src', 'document', 'book', '자료 준비', 360, 220, '#f59e0b', { checklist: TC('교재 해당 챕터', '강의 · 요약본', '예제 · 기출 문제') }),
          TN('st_concept', 'action', 'check', '핵심 개념', 760, 220, '#10b981', { checklist: TC('개념 1 정의', '개념 2 정의', '개념 사이의 관계') }),
          TN('st_why', 'action', 'action', '원리 이해', 1160, 268, '#3b82f6', { desc: '왜 그렇게 되는지 한 문장으로 설명해보기' }),
          TN('st_ex', 'action', 'check', '예제 풀이', 1560, 240, '#3b82f6', { checklist: TC('기본 예제 3개', '기출 5개') }),
          TN('st_check', 'condition', 'condition', '스스로 설명 가능?', 1960, 256, '#8b5cf6', {
            branches: [{ id: 'yes', label: '설명 가능' }, { id: 'half', label: '헷갈림' }, { id: 'no', label: '모르겠음' }]
          }),
          TN('st_apply', 'milestone', 'flag', '응용 · 연결', 2350, 60, '#f59e0b', { desc: '다른 개념과 연결해 한 장으로 정리' }),
          TN('st_wrong', 'action', 'edit', '오답 정리 후 다시 풀기', 2350, 290, '#f97316'),
          TN('st_back', 'action', 'undo', '개념 다시 보기', 2350, 480, '#ef4444'),
          TN('st_review', 'end', 'target', '복습 일정 잡기', 2760, 85, '#ec4899', { desc: '1일 · 7일 · 30일 후' })
        ],
        edges: [
          TE('ste1', 'st_topic', 'right', 'st_src', 'left'),
          TE('ste2', 'st_src', 'right', 'st_concept', 'left'),
          TE('ste3', 'st_concept', 'right', 'st_why', 'left'),
          TE('ste4', 'st_why', 'right', 'st_ex', 'left'),
          TE('ste5', 'st_ex', 'right', 'st_check', 'left'),
          TE('ste6', 'st_check', 'branch:yes', 'st_apply', 'left', '설명 가능'),
          TE('ste7', 'st_check', 'branch:half', 'st_wrong', 'left', '헷갈림'),
          TE('ste8', 'st_check', 'branch:no', 'st_back', 'left', '모르겠음'),
          TE('ste9', 'st_apply', 'right', 'st_review', 'left'),
          TE('ste10', 'st_wrong', 'bottom', 'st_ex', 'bottom', '다시'),
          TE('ste11', 'st_back', 'bottom', 'st_concept', 'bottom', '다시')
        ],
        notes: []
      };
    }

    if (key === 'exam') {
      return {
        mode: 'flowchart',
        viewport: { x: 60, y: 60, zoom: 0.8 },
        nodes: [
          TN('ex_goal', 'start', 'target', '시험 목표 설정', 40, 290, '#10b981', { period: 'D-120', desc: '시험명 · 목표 점수' }),
          TN('ex_scope', 'action', 'check', '범위 파악', 380, 220, '#10b981', { period: 'D-120', checklist: TC('시험 범위 · 과목별 비중', '교재 선정', '주간 계획표') }),
          TN('ex_read', 'action', 'book', '1회독', 780, 220, '#3b82f6', { period: 'D-110 ~ D-60', checklist: TC('과목 1', '과목 2', '과목 3') }),
          TN('ex_drill', 'action', 'check', '기출 · 문제풀이', 1180, 230, '#3b82f6', { period: 'D-60 ~ D-30', checklist: TC('기출 3개년', '오답노트') }),
          TN('ex_mock', 'milestone', 'flag', '모의고사', 1580, 270, '#f59e0b', { period: 'D-30' }),
          TN('ex_check', 'condition', 'condition', '목표 점수 도달?', 1950, 255, '#8b5cf6', {
            branches: [{ id: 'ok', label: '도달' }, { id: 'near', label: '조금 부족' }, { id: 'far', label: '많이 부족' }]
          }),
          TN('ex_keep', 'action', 'action', '실전 감각 유지', 2340, 60, '#3b82f6', { period: 'D-14', desc: '시간 재고 풀기' }),
          TN('ex_weak', 'action', 'edit', '취약 파트 집중', 2340, 290, '#f97316'),
          TN('ex_reprio', 'action', 'layout', '우선순위 재조정', 2340, 500, '#ef4444', { desc: '배점 높은 파트부터' }),
          TN('ex_day', 'end', 'target', '시험', 2740, 85, '#ec4899', { period: 'D-day' })
        ],
        edges: [
          TE('exe1', 'ex_goal', 'right', 'ex_scope', 'left'),
          TE('exe2', 'ex_scope', 'right', 'ex_read', 'left'),
          TE('exe3', 'ex_read', 'right', 'ex_drill', 'left'),
          TE('exe4', 'ex_drill', 'right', 'ex_mock', 'left'),
          TE('exe5', 'ex_mock', 'right', 'ex_check', 'left'),
          TE('exe6', 'ex_check', 'branch:ok', 'ex_keep', 'left', '도달'),
          TE('exe7', 'ex_check', 'branch:near', 'ex_weak', 'left', '조금 부족'),
          TE('exe8', 'ex_check', 'branch:far', 'ex_reprio', 'left', '많이 부족'),
          TE('exe9', 'ex_keep', 'right', 'ex_day', 'left'),
          TE('exe10', 'ex_weak', 'top', 'ex_keep', 'bottom'),
          TE('exe11', 'ex_reprio', 'top', 'ex_weak', 'bottom')
        ],
        notes: []
      };
    }

    if (key === 'realestate') {
      const N = (id, type, icon, title, x, y, color, extra = {}) =>
        ({ id, type, category: type, icon, title, desc: '', x, y, color, status: 'idle', memo: '', ...extra });
      const C = (...items) => items.map((text, i) => ({ id: `ck${i}`, text, done: false }));
      const E = (id, from, fromPort, to, toPort, label = '') => ({ id, from, fromPort, to, toPort, label, lineType: 'orthogonal' });
      return {
        mode: 'flowchart',
        viewport: { x: 60, y: 80, zoom: 0.8 },
        nodes: [
          N('re_start', 'start', 'start', '매물 선정', 40, 331, '#10b981'),
          N('re_check', 'action', 'check', '매물 확인', 300, 190, '#10b981', {
            checklist: C('하자(누수·균열·곰팡이) 확인', '등기부등본 — 근저당·질권·가압류 확인', '건축물대장 — 위반건축물 여부', '전입세대·체납 세금 확인', '실거래가 시세 비교')
          }),
          N('re_decide', 'condition', 'condition', '확인 결과는?', 690, 296, '#8b5cf6', {
            branches: [{ id: 'ok', label: '이상 없음' }, { id: 'nego', label: '가격 협상 필요' }, { id: 'drop', label: '계약 포기' }]
          }),
          N('re_contract', 'document', 'document', '계약서 작성', 1060, 60, '#f59e0b', {
            checklist: C('매도인 본인·대리권 확인', '계약금·중도금·잔금 일정', '특약사항 (하자 보수·권리 말소)', '중개수수료 확인')
          }),
          N('re_nego', 'action', 'message', '가격 재협상', 1060, 380, '#38bdf8', {
            checklist: C('하자 보수비 견적 받기', '조정 가격 제시')
          }),
          N('re_giveup', 'end', 'end', '매수 포기', 1060, 560, '#ef4444'),
          N('re_close', 'action', 'check', '잔금 및 등기', 1450, 80, '#10b981', {
            checklist: C('잔금 전 등기부등본 재확인', '잔금 지급 · 열쇠 인수', '소유권 이전 등기 신청', '취득세 납부')
          }),
          N('re_end', 'end', 'end', '소유권 이전 완료', 1840, 180, '#ec4899')
        ],
        edges: [
          E('re1', 're_start', 'right', 're_check', 'left'),
          E('re2', 're_check', 'right', 're_decide', 'left'),
          E('re3', 're_decide', 'branch:ok', 're_contract', 'left', '이상 없음'),
          E('re4', 're_decide', 'branch:nego', 're_nego', 'left', '가격 협상 필요'),
          E('re5', 're_decide', 'branch:drop', 're_giveup', 'left', '계약 포기'),
          E('re6', 're_nego', 'top', 're_contract', 'bottom', '합의'),
          E('re7', 're_contract', 'right', 're_close', 'left'),
          E('re8', 're_close', 'right', 're_end', 'left')
        ],
        notes: []
      };
    }

    if (key === 'intlorg') {
      // Timeline board: columns = years since graduation. A node sits in the column of the moment it happens,
      // so every fork leaves the trunk at its own point in time.
      const Y0 = 1000; // keeps every y positive
      const Y = (n) => ({ ...n, y: n.y + Y0 });
      const YES_NO = (a, b) => [{ id: 'yes', label: a }, { id: 'no', label: b }];
      const nodes = [
        // ---- 0년: 졸업 ----
        TN('io_start', 'start', 'start', '졸업 · USCPA 보유', 40, 560, '#10b981', {
          period: '0년', progress: 'planned', desc: '여기서 세 갈래로 나뉨',
          checklist: TC('TOEFL 100 (JPO 요건)', '영문 이력서 · 지원서 준비', '졸업 전 최종학년: WBG Pioneers 유급 인턴 지원 가능')
        }),
        TN('io_d0', 'condition', 'condition', '0년: 어느 길로?', 420, 580, '#8b5cf6', {
          branches: [{ id: 'direct', label: '바로 국제기구' }, { id: 'big4', label: 'Big 4 경력 후' }, { id: 'mast', label: '석사' }]
        }),

        // ---- 직행 (0년에 지원) ----
        TN('io_jpa', 'action', 'user', 'WB JPA', 1060, -900, '#f97316', {
          period: '0년~ 상시', desc: '2년 계약 · 상시 공고',
          checklist: TC('학사 이상', '만 28세 이하', '2년 계약 (2023 공식 안내서) · DC / 현지 사무소', '계약 후 WBG YPP 지원 가능')
        }),
        TN('io_jpo', 'action', 'user', 'JPO (외교부)', 1060, -600, '#f97316', {
          period: '연 1회 · 2026: 5/15~6/26 접수', desc: '1년 + 최대 2년 연장 (총 3년)',
          checklist: TC('학사 이상', '해당 연도 12/31 기준 만 32세 이하', 'TOEFL 100 / TEPS 430 / IELTS 7 / TOEIC 900', '직위별 요구 경력은 기구 공고 기준 (재무 예: UNFCCC Associate Finance Officer P-2)')
        }),
        TN('io_unv', 'action', 'user', 'UNV 청년봉사단', 1060, -300, '#f97316', {
          period: '연 1회 · 7월 마감', desc: '1년 + 최대 6개월 연장',
          checklist: TC('학사 이상 · 만 22~29세 · 경력 1개월 이상', '생활비(VLA) 기본 약 USD 1,576/월 (1,970의 80%, 2026 잠정) × 근무지 물가 배율', '정착금 USD 3,500 + 항공권 + 의료보험', '월급이 아닌 봉사 생활비 성격')
        }),
        TN('io_eint', 'action', 'user', 'EBRD 인턴', 1060, 20, '#f97316', {
          period: '수시 · 졸업 12개월 이내', desc: '유급 · 3~6개월 (최대 12)',
          checklist: TC('졸업 12개월 이내 또는 석사 재학', '회원국 국적 (한국 포함)', '런던 · UK 비자 필요', '정식 프로그램이 아닌 수시 채용')
        }),
        TN('io_yap', 'action', 'user', 'OECD YAP', 1060, 300, '#f97316', {
          period: '24개월 · 12월 중순 마감', desc: '학사 졸업 직후 전용 · 파리',
          checklist: TC('학사 졸업자만 (석사 · 박사 제외)', '졸업일이 회차별 약 1.5년 창 안 (2026-28 회차: 2025.1.1~2026.9.1 졸업)', 'OECD 회원국 국적 (한국 해당) · 나이 상한 없음', '월 €3,886 비과세 + 퇴직 수당 약 €21,000 (2026-28 회차, 2차 출처)')
        }),
        TN('io_cons', 'action', 'user', '단기 컨설턴트', 1060, 680, '#f97316', {
          period: '수개월 · 상시', desc: 'UN 기구 재무 · 회계 로스터형',
          checklist: TC('단기 계약 (풀타임 또는 파트타임)', '학위 · 경력 요건은 공고별', '재무 · 회계 전공 우대')
        }),
        TN('io_d1', 'condition', 'condition', '1년 시점: 국제기구 확보?', 1560, -160, '#8b5cf6', { branches: YES_NO('확보', '못 함') }),
        TN('io_b4_late', 'action', 'shield', 'Big 4로 전환 (1년 늦게)', 1560, 420, '#3b82f6', {
          period: '1년', desc: '직행 미성사 → 경력 트랙. 아래 Big 4 트랙의 시점이 전부 +1년'
        }),
        TN('io_inorg_a', 'action', 'user', '국제기구 근무', 2300, -350, '#3b82f6', {
          period: '1년~', desc: '계약 기간만큼 근무: JPA 2년 · JPO 최대 3년 · UNV 1~1.5년 · YAP 2년 · 인턴/컨설턴트 수개월'
        }),

        // ---- Big 4 경력 ----
        TN('io_b4', 'action', 'shield', 'Big 4 입사 (감사 · 리스크)', 760, 900, '#3b82f6', { period: '0년', desc: 'USCPA 보유 상태로 경력 시작' }),
        TN('io_b4_1', 'action', 'check', 'Big 4 1년 차', 1560, 900, '#3b82f6', {
          period: '1년', checklist: TC('IFRS · ERP · 내부통제(ICFR) 경험', 'EBRD IPP 경력 요건(6~12개월) 충족 시점')
        }),
        TN('io_d2', 'condition', 'condition', '2년 시점: 국제기구 지원?', 2200, 920, '#8b5cf6', {
          branches: [{ id: 'apply', label: '지원 (경력 2년)' }, { id: 'wait', label: '1년 더 근무' }]
        }),
        TN('io_p2', 'action', 'user', 'UN P-2 재무직', 2560, 400, '#3b82f6', {
          period: '상시 공고', desc: 'UNICEF Account Officer P-2 공고 기준',
          checklist: TC('재무 · 회계 학위 + CPA 우대', '경력: UNICEF P-2 공고는 2년 · UN 일반 규칙은 학사+4년 / 석사+2년 (UNDP 기준) → 공고별 확인', 'IPSAS / IFRS', 'SAP · ERP')
        }),
        TN('io_aiib', 'action', 'user', 'AIIB Graduate Program', 2560, 730, '#3b82f6', {
          period: '12~2월 지원 · 9월 입사', desc: '2년 로테이션 · 북경',
          checklist: TC('학사 + 경력 2~3년 (석사는 1~2년)', 'Finance · Risk 등 6개 스트림', '나이 상한은 공고에 명시 없음')
        }),
        TN('io_ipp', 'action', 'user', 'EBRD IPP', 2560, 1040, '#3b82f6', {
          period: '수시 공고', desc: '24개월 프로그램',
          checklist: TC('최근 학위: 학사 또는 석사', '경력 6~12개월 (근무 · 여행 · 봉사)', '주주국 국적 (비자 면제 제도) · 나이 상한 없음', 'Finance / Risk / Banking 부서 · 급여는 competitive (금액 미공개)')
        }),
        TN('io_jpo2', 'action', 'user', 'JPO (재도전)', 2560, 1400, '#3b82f6', {
          period: '연 1회', desc: '직위별 경력 요건 확인',
          checklist: TC('해당 연도 12/31 기준 만 32세 이하', '직위별 요구 경력 충족')
        }),
        TN('io_r2', 'condition', 'condition', '결과 (3년 시점)', 2960, 900, '#8b5cf6', { branches: [{ id: 'pass', label: '합격' }, { id: 'fail', label: '탈락' }] }),
        TN('io_b4_3', 'action', 'check', 'Big 4 3년 차', 2200, 1330, '#3b82f6', {
          period: '2~3년', desc: '경력 3년 충족 (ADB YP 요건)'
        }),
        TN('io_d3', 'condition', 'condition', '3년 시점: 국제기구 vs MBA?', 2960, 1350, '#8b5cf6', {
          branches: [{ id: 'inorg', label: '국제기구 진출' }, { id: 'mba', label: '계속 근무 후 MBA 직행' }]
        }),
        TN('io_adb', 'action', 'user', 'ADB Young Professionals', 3340, 1100, '#3b82f6', {
          period: '9월 지원 (9/30 마감)', desc: '고정 3년 계약',
          checklist: TC('만 32세 이하', '관련 경력 3년 이상', '마닐라 + 18개월 로테이션', 'ADB 회원국 국적')
        }),
        TN('io_retry', 'action', 'user', '재지원 풀', 3340, 1420, '#3b82f6', {
          period: '3~4년', desc: '경력 3년으로 다시 지원',
          checklist: TC('UN P-2', 'AIIB Graduate Program', 'EBRD IPP', 'JPO (만 32세 이하)')
        }),
        TN('io_r3', 'condition', 'condition', '결과 (4년 시점)', 3700, 1250, '#8b5cf6', { branches: [{ id: 'pass', label: '합격' }, { id: 'fail', label: '탈락' }] }),
        TN('io_inorg_b', 'action', 'user', '국제기구 근무 (경력 후 진입)', 4200, 880, '#3b82f6', {
          period: '3~5년~', desc: 'P-2 · AIIB · IPP · ADB · JPO 등 계약 기간만큼'
        }),

        // ---- 합류: 근무 → MBA → 복귀 ----
        TN('io_nyr', 'action', 'user', 'n년 근무', 4600, 300, '#3b82f6', {
          desc: 'MBA 지원 준비. 경력이 WBG YPP의 2~6년 창 안에 들어오도록 기간 설계'
        }),
        TN('io_mba', 'action', 'book', 'MBA', 5000, 300, '#3b82f6', {
          desc: '진학 시점은 경력 종료 시점에 따라 이동. MBA 기간의 YPP 경력 산입 여부는 지원 시점에 공식 FAQ로 확인'
        }),
        TN('io_ypp', 'end', 'target', 'WBG YPP · 금융기구 복귀', 5400, 315, '#ec4899', {
          desc: '석사(MBA 포함) + 경력 2~6년 · 회원국 국적 · 매년 9월 지원 (2025: 9/1~9/30) · JPA · 과거 인턴 지원 가능'
        }),

        // ---- 석사 (직접 구체화) ----
        TN('io_mast', 'action', 'book', '국내 석사', 760, 1800, '#f59e0b', {
          period: '0년~', desc: '세부 경로는 직접 구체화. 석사라서 열리는 프로그램',
          checklist: TC(
            'ADB 인턴: 석사 재학 · 8~12주 · 유급 · 3월 중순 마감',
            'AIIB 인턴: 석사 재학 또는 당해 졸업 · 일당 USD 90 + 항공권 · 12~2월 지원',
            'WBG Pioneers: 석사 재학 · 시급 지급 · 서울 / DC · 1~2월, 7~8월 지원',
            'IMF FIP: 회계 트랙 없음 (경제 · 법률 · 사이버보안 · AI · 언어 · 영상 서비스) · 석사 만 28세 미만 (2023 안내, 현 페이지 32세 표기) · 10~12주 · 12월 초 지원',
            'IDB 인턴: 대학원 재학 · 유급 · 본부 2개월 / 현지 2~6개월 · 1/16~3/15, 6/16~8/15 지원 · 회원국 국적',
            'EBRD 인턴: 석사 재학 또는 졸업 12개월 이내 · 유급',
            'AIIB Graduate: 석사 + 경력 1~2년',
            'WBG YPP: 석사 + 경력 2~6년 (MBA도 석사로 인정)'
          )
        })
      ].map(Y);

      const E = TE;
      const edges = [
        E('ie1', 'io_start', 'right', 'io_d0', 'left'),
        E('ie2', 'io_d0', 'branch:direct', 'io_jpa', 'left', '바로 국제기구'),
        E('ie3', 'io_d0', 'branch:direct', 'io_jpo', 'left'),
        E('ie4', 'io_d0', 'branch:direct', 'io_unv', 'left'),
        E('ie5', 'io_d0', 'branch:direct', 'io_eint', 'left'),
        E('ie6', 'io_d0', 'branch:direct', 'io_yap', 'left'),
        E('ie7', 'io_d0', 'branch:direct', 'io_cons', 'left'),
        E('ie8', 'io_d0', 'branch:big4', 'io_b4', 'left', 'Big 4 경력 후'),
        E('ie9', 'io_d0', 'branch:mast', 'io_mast', 'left', '석사'),

        E('ie10', 'io_jpa', 'right', 'io_d1', 'left'),
        E('ie11', 'io_jpo', 'right', 'io_d1', 'left'),
        E('ie12', 'io_unv', 'right', 'io_d1', 'left'),
        E('ie13', 'io_eint', 'right', 'io_d1', 'left'),
        E('ie14', 'io_yap', 'right', 'io_d1', 'left'),
        E('ie15', 'io_cons', 'right', 'io_d1', 'left'),
        E('ie16', 'io_d1', 'branch:yes', 'io_inorg_a', 'left', '확보'),
        E('ie17', 'io_d1', 'branch:no', 'io_b4_late', 'left', '못 함'),
        E('ie18', 'io_b4_late', 'right', 'io_d2', 'top', '이후 구조 동일 (+1년)'),

        E('ie19', 'io_b4', 'right', 'io_b4_1', 'left'),
        E('ie20', 'io_b4_1', 'right', 'io_d2', 'left'),
        E('ie21', 'io_d2', 'branch:apply', 'io_p2', 'left', '지원 (경력 2년)'),
        E('ie22', 'io_d2', 'branch:apply', 'io_aiib', 'left'),
        E('ie23', 'io_d2', 'branch:apply', 'io_ipp', 'left'),
        E('ie24', 'io_d2', 'branch:apply', 'io_jpo2', 'left'),
        E('ie25', 'io_p2', 'right', 'io_r2', 'left'),
        E('ie26', 'io_aiib', 'right', 'io_r2', 'left'),
        E('ie27', 'io_ipp', 'right', 'io_r2', 'left'),
        E('ie28', 'io_jpo2', 'right', 'io_r2', 'left'),
        E('ie29', 'io_d2', 'branch:wait', 'io_b4_3', 'top', '1년 더 근무'),
        E('ie30', 'io_r2', 'branch:pass', 'io_inorg_b', 'left', '합격'),
        E('ie31', 'io_r2', 'branch:fail', 'io_b4_3', 'right', '탈락 → 1년 더 근무'),

        E('ie32', 'io_b4_3', 'right', 'io_d3', 'left'),
        E('ie33', 'io_d3', 'branch:inorg', 'io_adb', 'left', '국제기구 진출'),
        E('ie34', 'io_d3', 'branch:inorg', 'io_retry', 'left'),
        E('ie35', 'io_d3', 'branch:mba', 'io_mba', 'bottom', '계속 근무 후 MBA 직행'),
        E('ie36', 'io_adb', 'right', 'io_r3', 'left'),
        E('ie37', 'io_retry', 'right', 'io_r3', 'left'),
        E('ie38', 'io_r3', 'branch:pass', 'io_inorg_b', 'left', '합격'),
        E('ie39', 'io_r3', 'branch:fail', 'io_mba', 'bottom', '탈락 → MBA'),

        E('ie40', 'io_inorg_a', 'right', 'io_nyr', 'left'),
        E('ie41', 'io_inorg_b', 'right', 'io_nyr', 'bottom'),
        E('ie42', 'io_nyr', 'right', 'io_mba', 'left'),
        E('ie43', 'io_mba', 'right', 'io_ypp', 'left')
      ];

      return {
        mode: 'flowchart',
        viewport: { x: 40, y: 120, zoom: 0.3 },
        timeline: {
          unit: 'custom', start: '', originX: 40, showOnNodes: false,
          cols: [
            { id: 'io_c0', label: '0년 (졸업)', w: 1400 },
            { id: 'io_c1', label: '1년', w: 760 },
            { id: 'io_c2', label: '2년', w: 760 },
            { id: 'io_c3', label: '3년', w: 760 },
            { id: 'io_c4', label: '4년 이후', w: 1800 }
          ]
        },
        nodes,
        edges,
        notes: [
          { id: 'io_n1', x: 40, y: -900 + Y0, width: 420, height: 330, color: 'yellow', text: '💡 읽는 법\n가로 = 졸업 후 경과 연수. 분기(보라)는 예/아니오에 따라 방향이 바뀌는 지점만.\n시험 합격/재응시는 분기가 아니라 노드 안 메모로.\n유급 · 계약직 포함. 나이 상한은 각 노드에 표기.' },
          { id: 'io_n2', x: 40, y: 1000 + Y0, width: 420, height: 420, color: 'yellow', text: '🚫 제외한 것\nUN 사무국 인턴: 무급\nUN YPP: 2025 안내서 기준 한국 미참여\nWBG Pioneers (학부): 졸업 전 최종학년 대상이라 0년 이후에는 해당 없음\nAfDB YPP: 석사 + 경력 3년 + 아프리카·개도국 현장 경력 요건\n\n석사가 필요한 프로그램은 제외가 아니라 \'국내 석사\' 노드에 정리'  },
          { id: 'io_n3', x: 1060, y: 1800 + Y0, width: 520, height: 340, color: 'yellow', text: '⚠️ 확인 못 한 것 · 출처 충돌\nJPO 파견 기간: 고려대 공지 경유 외교부 공고 기준 (원문 직접 확인 실패)\nOECD YAP 2026-28: 2차 출처 (공식 페이지는 2024-26 회차)\nUN P-2: 공고별 경력 산정이 다름 (CPA 인정 여부)\nIMF FIP: 석사 나이 2023 안내 28세 / 현 페이지 32세\nWB JPA: 2023 안내서 기준 (현재 공식 페이지는 못 열어 봄)\nIDB YPP · GGGI 인턴: 공식 페이지에서 조건을 못 찾아 차트 미반영\nEBRD IPP · IMF FIP: 급여 금액 미공개'  }
        ]
      };
    }

    return null;
  }
}
