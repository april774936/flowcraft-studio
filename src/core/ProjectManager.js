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

  createProject(name, templateKey = 'blank', mode = 'flowchart') {
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
      mode: mode || initialData.mode || 'flowchart',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      viewport: { x: 80, y: 80, zoom: 1 },
      nodes: initialData.nodes || [],
      edges: initialData.edges || [],
      notes: initialData.notes || []
    };

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
            x: 80,
            y: 40,
            width: 240,
            height: 140,
            color: 'yellow',
            text: '💡 [프로젝트 메모]\n주문 접수부터 재고 파악, 자동 송장 발급 및 배송 추적 API까지 연결하는 핵심 워크플로우입니다.'
          },
          {
            id: 'note_2',
            x: 720,
            y: 380,
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
            x: 120,
            y: 220,
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
            x: 380,
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
            x: 640,
            y: 220,
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
            x: 940,
            y: 150,
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
            x: 1240,
            y: 150,
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
            x: 1520,
            y: 150,
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
            x: 940,
            y: 330,
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
            x: 1240,
            y: 330,
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
            x: 100,
            y: 50,
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
            x: 120,
            y: 200,
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
            x: 380,
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
            x: 640,
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
            x: 900,
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
            x: 1160,
            y: 200,
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
    
    if (key === 'timeline_basic') {
      return {
        mode: 'timeline',
        nodes: [
          { id: 't1', type: 'start', title: 'Q1 계획', desc: '요구사항 분석', x: 200, y: 200, color: '#10b981', status: 'idle' },
          { id: 't2', type: 'action', title: 'Q2 개발', desc: 'MVP 개발', x: 600, y: 200, color: '#3b82f6', status: 'idle' },
          { id: 't3', type: 'end', title: 'Q3 런칭', desc: '프로덕션 배포', x: 1000, y: 200, color: '#ec4899', status: 'idle' }
        ],
        edges: [
          { id: 'e1', from: 't1', to: 't2', fromPort: 'right', toPort: 'left', lineType: 'orthogonal' },
          { id: 'e2', from: 't2', to: 't3', fromPort: 'right', toPort: 'left', lineType: 'orthogonal' }
        ],
        notes: []
      };
    }
    
    return null;
  }
}
