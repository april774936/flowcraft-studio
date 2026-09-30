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
      const BR = [{ id: 'pass', label: '합격' }, { id: 'fail', label: '탈락' }];
      return {
        mode: 'flowchart',
        viewport: { x: 60, y: 60, zoom: 0.6 },
        nodes: [
          TN('io_prep', 'start', 'start', '졸업 전 준비', 40, 300, '#10b981', {
            period: 'Q-2 ~ Q-1', progress: 'active', desc: '영어 점수 · 서류 · 회계 스킬',
            checklist: TC('TOEFL 100 확보 (JPO 요건)', '영문 이력서 · P11 작성', 'USCPA 라이선스 요건 확인', 'IPSAS 기초 · SAP 사용 경험', 'WBG Pioneers 지원 (학부 최종학년 · 유급, 공식 페이지 재확인)')
          }),
          TN('io_grad', 'milestone', 'flag', '졸업 · USCPA 보유', 420, 310, '#f59e0b', { period: 'Q0', progress: 'planned', desc: '트랙 1과 2를 동시에 시작' }),

          TN('io_t1_apply', 'action', 'user', '트랙 1 · 상시 지원', 800, 80, '#f97316', {
            period: 'Q0', progress: 'planned', desc: '나이 상한: JPA 28 · UNV 29 · JPO 32',
            checklist: TC('WB JPA 재무 · 회계 공석 (입사일 기준 만 28세 이하)', 'EBRD 유급 인턴 (졸업 12개월 이내 · UK 비자 필요)')
          }),
          TN('io_t1_s1', 'action', 'target', '공고 시즌 1', 1180, 80, '#f97316', {
            period: 'Q1', progress: 'planned', desc: '5~9월 공고 패턴 기준 (졸업 월에 따라 이동)',
            checklist: TC('JPO 재무 · 회계 · 금융 직위 지원', 'UNV 청년봉사단 지원 (만 29세 이하)', 'GCF형 금융기구 JPO 모니터링')
          }),
          TN('io_t1_r1', 'condition', 'condition', '시즌 1 결과', 1560, 100, '#8b5cf6', { period: 'Q2', branches: BR.map(b => ({ ...b })) }),
          TN('io_t1_s2', 'action', 'target', '공고 시즌 2 재지원', 1940, 220, '#f97316', {
            period: 'Q5', progress: 'planned', checklist: TC('JPO · JPA · UNV 재지원')
          }),
          TN('io_t1_r2', 'condition', 'condition', '시즌 2 결과', 2320, 230, '#8b5cf6', { period: 'Q6', branches: BR.map(b => ({ ...b })) }),

          TN('io_t2_join', 'action', 'shield', 'Big 4 감사 입사', 800, 560, '#3b82f6', {
            period: 'Q0', progress: 'planned', desc: '감사 / 리스크 어슈어런스로 경력 2년 축적'
          }),
          TN('io_t2_exp', 'action', 'check', '1년 차 경험 축적', 1180, 560, '#3b82f6', {
            period: 'Q4', checklist: TC('IFRS', 'ERP', '내부통제 (ICFR)', 'P-2형 공고의 우대 요건과 대조')
          }),
          TN('io_t2_apply', 'action', 'user', 'P-2 재무직 지원', 1560, 570, '#3b82f6', {
            period: 'Q7', desc: 'UN 계열 P-2 재무직 (CPA + 경력 2년 충족)'
          }),
          TN('io_t2_r', 'condition', 'condition', 'P-2 결과', 1940, 575, '#8b5cf6', {
            period: 'Q8', branches: [{ id: 'pass', label: '합격' }, { id: 'retry', label: '재지원' }]
          }),

          TN('io_entry', 'milestone', 'flag', '국제기구 진입', 2700, 400, '#f59e0b', { desc: 'JPO · JPA · UNV 또는 P-2 재무직' }),
          TN('io_work', 'action', 'user', 'n년 근무', 3080, 410, '#3b82f6'),
          TN('io_mba', 'action', 'book', 'MBA', 3460, 410, '#3b82f6', { desc: '국제기구 n년 + MBA 기간이 YPP 경력 창을 넘기지 않게 설계' }),
          TN('io_end', 'end', 'target', 'YPP · 금융기구 복귀', 3840, 415, '#ec4899', { desc: 'WBG YPP는 첫 풀타임부터 경력 2~6년 창' })
        ],
        edges: [
          TE('ioe1', 'io_prep', 'right', 'io_grad', 'left'),
          TE('ioe2', 'io_grad', 'right', 'io_t1_apply', 'left', '트랙 1'),
          TE('ioe3', 'io_grad', 'right', 'io_t2_join', 'left', '트랙 2'),
          TE('ioe4', 'io_t1_apply', 'right', 'io_t1_s1', 'left'),
          TE('ioe5', 'io_t1_s1', 'right', 'io_t1_r1', 'left'),
          TE('ioe6', 'io_t1_r1', 'branch:pass', 'io_entry', 'left', '합격'),
          TE('ioe7', 'io_t1_r1', 'branch:fail', 'io_t1_s2', 'left', '탈락'),
          TE('ioe8', 'io_t1_s2', 'right', 'io_t1_r2', 'left'),
          TE('ioe9', 'io_t1_r2', 'branch:pass', 'io_entry', 'left', '합격'),
          TE('ioe10', 'io_t1_r2', 'branch:fail', 'io_t2_apply', 'top', '트랙 2에 집중'),
          TE('ioe11', 'io_t2_join', 'right', 'io_t2_exp', 'left'),
          TE('ioe12', 'io_t2_exp', 'right', 'io_t2_apply', 'left'),
          TE('ioe13', 'io_t2_apply', 'right', 'io_t2_r', 'left'),
          TE('ioe14', 'io_t2_r', 'branch:pass', 'io_entry', 'left', '합격'),
          TE('ioe15', 'io_t2_r', 'branch:retry', 'io_t2_apply', 'bottom', '재지원'),
          TE('ioe16', 'io_entry', 'right', 'io_work', 'left'),
          TE('ioe17', 'io_work', 'right', 'io_mba', 'left'),
          TE('ioe18', 'io_mba', 'right', 'io_end', 'left')
        ],
        notes: [
          { id: 'io_note', x: 40, y: 20, width: 300, height: 210, color: 'yellow', text: '💡 트랙 1 · 2 병행\n트랙 1이 성사되면 트랙 2는 접어도 됨\nUN 사무국 인턴은 무급이라 제외\nMBA 기간의 YPP 경력 산입 여부는 지원 시점에 공식 FAQ로 확인\n분기는 졸업 분기를 Q0로 둔 상대 분기' }
        ]
      };
    }

    return null;
  }
}
