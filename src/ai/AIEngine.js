// AIEngine.js: Natural language workflow draft generator, intelligent graph parser, and active manipulation copilot
import { AutoLayout } from '../core/AutoLayout.js';
import { buildGraph, parseTextToPlan } from './DraftBuilder.js';
import { geminiPlan } from './planPrompt.js';

// Gemini key typed into the AI window: kept only in this browser (never synced or committed)
export const GEMINI_KEY_STORE = 'flowcraft_gemini_key';

const safeGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };

export class AIEngine {
  constructor(state) {
    this.state = state;
  }

  // 1. Draft a whole flow from a description.
  // Real AI via /api/draft (Claude or Gemini, key kept on the server); without a key or offline,
  // the built-in text parser (arrows, choices, checklists, periods) makes the draft instead.
  // Returns { source: 'claude' | 'gemini' | 'local', count, note }.
  async generateDraft(promptText, options = { clear: true }) {
    const prompt = (promptText || '').trim();
    if (!prompt) throw new Error('만들 흐름을 적어주세요.');

    let plan = null, source = 'local', note = '';
    try {
      const r = await this.requestPlan(prompt);
      if (r) { plan = r.plan; source = r.provider; }
    } catch (err) {
      note = err.message;
    }
    if (!plan) plan = parseTextToPlan(prompt);

    // New flow: where the board starts, or to the right of what is already there
    let x0 = 100, y0 = 200;
    if (!options.clear && this.state.nodes.length) {
      x0 = Math.max(...this.state.nodes.map(n => n.x)) + 480;
      y0 = Math.min(...this.state.nodes.map(n => n.y));
    }
    const { nodes, edges } = buildGraph(plan, x0, y0);
    if (!nodes.length) throw new Error('흐름을 만들 수 없었어요. 단계를 "→"로 이어서 적어보세요.');

    this.state.beginGesture(); // one undo step for the whole draft
    if (options.clear) {
      this.state.nodes = [];
      this.state.edges = [];
      this.state.notes = [];
    }
    nodes.forEach(n => this.state.nodes.push(n));
    edges.forEach(e => this.state.edges.push(e));
    this.state.selectedNodeIds.clear();
    this.state.endGesture();
    this.state.emit('canvas:change');
    return { source, count: nodes.length, note };
  }

  // POST /api/draft → { plan, provider }; null when the server has no AI key (or no server, e.g. vite dev)
  async requestPlan(prompt, retried = false) {
    const headers = { 'content-type': 'application/json' };
    const code = safeGet('flowcraft_ai_code');
    if (code) headers['x-flowcraft-ai-code'] = code;
    let r;
    try {
      r = await fetch('/api/draft', { method: 'POST', headers, body: JSON.stringify({ prompt }) });
    } catch (e) {
      r = null; // offline / no server
    }
    if (!r || r.status === 404 || r.status === 405 || r.status === 501) {
      // No AI on the server: use the Gemini key saved in this browser, if any
      const key = safeGet(GEMINI_KEY_STORE);
      if (!key) return null;
      const { plan } = await geminiPlan(key, prompt, { timeoutMs: 60000 });
      return { plan, provider: 'gemini' };
    }
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && !retried) {
      const entered = window.prompt('AI 사용 코드를 입력하세요 (Vercel의 FLOWCRAFT_AI_CODE)');
      if (entered) { safeSet('flowcraft_ai_code', entered.trim()); return this.requestPlan(prompt, true); }
    }
    if (!r.ok || !data.plan) throw new Error(data.message || `AI 요청 실패 (${r.status}) — 기본 규칙으로 만들었어요.`);
    return data;
  }

  // 2. Active AI Manipulation: Automatically attach Error Handling
  addErrorHandling() {
    this.state.pushHistory();

    // Find candidate action/condition nodes
    const candidates = this.state.nodes.filter(n => n.type === 'action' || n.category === 'integration');
    if (candidates.length === 0) {
      alert('에러 처리를 연결할 적절한 태스크/API 노드가 없습니다.');
      return false;
    }

    const targetNode = candidates[0];

    // Create Error Handler Node
    const errHandler = {
      id: 'ai_err_handler_' + Date.now(),
      type: 'action',
      category: 'action',
      title: '예외/오류 로깅 & 롤백',
      desc: 'Sentry 에러 리포트 및 트랜잭션 롤백',
      icon: 'terminal',
      color: '#ef4444',
      x: targetNode.x,
      y: targetNode.y + 140,
      status: 'idle',
      memo: 'AI Copilot에 의해 자동 생성된 장애 대응 단계'
    };

    // Create Error End Node
    const errEnd = {
      id: 'ai_err_end_' + Date.now(),
      type: 'end',
      category: 'end',
      title: '오류 처리 후 안전 마감',
      desc: '담당자 On-Call 호출 후 종료',
      icon: 'end',
      color: '#ef4444',
      x: targetNode.x + 280,
      y: targetNode.y + 140,
      status: 'idle',
      memo: ''
    };

    this.state.nodes.push(errHandler, errEnd);

    // Connect targetNode -> errHandler -> errEnd
    this.state.edges.push({
      id: 'ai_edge_err_1_' + Date.now(),
      from: targetNode.id,
      fromPort: 'bottom',
      to: errHandler.id,
      toPort: 'left',
      label: '실패 시 (Fail)',
      lineType: 'orthogonal'
    });

    this.state.edges.push({
      id: 'ai_edge_err_2_' + Date.now(),
      from: errHandler.id,
      fromPort: 'right',
      to: errEnd.id,
      toPort: 'left',
      label: '',
      lineType: 'orthogonal'
    });

    AutoLayout.apply(this.state, 'horizontal');
    this.state.save();
    this.state.emit('canvas:change');
    return true;
  }

  // 3. Active AI Manipulation: Automatically append Notification Step
  addNotificationStep() {
    this.state.pushHistory();

    // Find end node or last action
    const endNodes = this.state.nodes.filter(n => n.type === 'end' || n.category === 'end');
    if (endNodes.length === 0 && this.state.nodes.length === 0) {
      alert('알림 단계를 연결할 대상 노드가 없습니다.');
      return false;
    }

    const targetEnd = endNodes[0] || this.state.nodes[this.state.nodes.length - 1];

    const notifyNode = {
      id: 'ai_notify_' + Date.now(),
      type: 'action',
      category: 'integration',
      title: 'Slack / 팀 메신저 통보',
      desc: '#alerts 채널에 처리 결과 요약 브로드캐스트',
      icon: 'message',
      color: '#f59e0b',
      x: targetEnd.x - 40,
      y: targetEnd.y,
      status: 'idle',
      memo: 'AI Copilot에 의해 자동 생성된 알림 단계'
    };

    // Find edges pointing into targetEnd and redirect through notifyNode
    const incoming = this.state.edges.filter(e => e.to === targetEnd.id);
    this.state.nodes.push(notifyNode);

    if (incoming.length > 0) {
      incoming.forEach(e => {
        e.to = notifyNode.id;
      });
      // Edge from notifyNode to targetEnd
      this.state.edges.push({
        id: 'ai_edge_notif_' + Date.now(),
        from: notifyNode.id,
        fromPort: 'right',
        to: targetEnd.id,
        toPort: 'left',
        label: '통보 완료',
        lineType: 'orthogonal'
      });
    } else {
      // Connect targetEnd to notifyNode
      this.state.edges.push({
        id: 'ai_edge_notif_' + Date.now(),
        from: targetEnd.id,
        fromPort: 'right',
        to: notifyNode.id,
        toPort: 'left',
        label: '결과 통보',
        lineType: 'orthogonal'
      });
    }

    AutoLayout.apply(this.state, 'horizontal');
    this.state.save();
    this.state.emit('canvas:change');
    return true;
  }

  // 4. Active AI Manipulation: Suggest and append next logical step to selected node
  suggestNextStep(selectedNodeId) {
    const node = this.state.nodes.find(n => n.id === selectedNodeId);
    if (!node) {
      alert('다음 단계를 추천받을 기준 노드를 캔버스에서 먼저 선택해주세요.');
      return false;
    }

    this.state.pushHistory();

    let nextNodeData;
    if (node.type === 'start') {
      nextNodeData = {
        title: '데이터 유효성 및 파라미터 검증',
        desc: '입력 스키마 및 필수 필드 존재 여부 검사',
        type: 'action',
        category: 'action',
        icon: 'action',
        color: '#3b82f6'
      };
    } else if (node.type === 'condition') {
      nextNodeData = {
        title: '조건 충족 비즈니스 로직 실행',
        desc: '승인/성공 케이스에 따른 서비스 처리',
        type: 'action',
        category: 'integration',
        icon: 'api',
        color: '#10b981'
      };
    } else if (node.type === 'action') {
      nextNodeData = {
        title: '실행 상태 모니터링 & 검증',
        desc: '결과 코드 200 OK 여부 조건 분기',
        type: 'condition',
        category: 'condition',
        icon: 'condition',
        color: '#8b5cf6'
      };
    } else {
      nextNodeData = {
        title: '후속 정리 및 로그 보관',
        desc: '로그 스토리지 아카이빙',
        type: 'action',
        category: 'action',
        icon: 'database',
        color: '#3b82f6'
      };
    }

    const newNode = {
      id: 'ai_next_' + Date.now(),
      ...nextNodeData,
      x: node.x + 280,
      y: node.y,
      status: 'idle',
      memo: `"${node.title}" 노드의 후속 단계로 AI가 자동 추천함`
    };

    this.state.nodes.push(newNode);
    this.state.edges.push({
      id: 'ai_edge_next_' + Date.now(),
      from: node.id,
      fromPort: 'right',
      to: newNode.id,
      toPort: 'left',
      label: '',
      lineType: 'orthogonal'
    });

    this.state.selectNode(newNode.id, false);
    AutoLayout.apply(this.state, 'horizontal');
    this.state.save();
    this.state.emit('canvas:change');
    return true;
  }

  // 5. Active AI Manipulation: Audit & Analyze workflow health
  auditWorkflow() {
    const nodes = this.state.nodes;
    const edges = this.state.edges;

    if (nodes.length === 0) {
      alert('분석할 워크플로우 노드가 없습니다.');
      return;
    }

    const incoming = new Set(edges.map(e => e.to));
    const outgoing = new Set(edges.map(e => e.from));

    const startNodes = nodes.filter(n => n.type === 'start' || !incoming.has(n.id));
    const endNodes = nodes.filter(n => n.type === 'end' || !outgoing.has(n.id));
    const orphanNodes = nodes.filter(n => !incoming.has(n.id) && !outgoing.has(n.id));

    let auditReport = `🤖 [AI 워크플로우 진단 리포트]\n`;
    auditReport += `• 총 노드 수: ${nodes.length}개 | 연결선: ${edges.length}개\n`;
    auditReport += `• 시작점: ${startNodes.length}개 | 마감점: ${endNodes.length}개\n`;

    if (orphanNodes.length > 0) {
      auditReport += `⚠️ 고립된 노드 ${orphanNodes.length}개 감지 ("${orphanNodes[0].title}" 등)\n`;
    } else {
      auditReport += `✅ 모든 노드가 유기적으로 연결되어 있습니다.\n`;
    }

    if (endNodes.length === 0) {
      auditReport += `⚠️ 명시적인 종료(End) 노드가 누락되어 있습니다.\n`;
    } else {
      auditReport += `✅ 종료 단계가 정상 정의되어 있습니다.\n`;
    }

    auditReport += `💡 추천: 에러 발생 시를 대비한 예외 처리 분기를 추가해 보세요.`;

    // Add sticky note with AI audit results
    this.state.addNote({
      x: 100,
      y: 60,
      width: 280,
      height: 180,
      color: orphanNodes.length > 0 ? 'pink' : 'green',
      text: auditReport
    });

    this.state.save();
    this.state.emit('canvas:change');
  }
}
