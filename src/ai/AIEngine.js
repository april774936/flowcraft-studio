// AIEngine.js: Natural language workflow draft generator, intelligent graph parser, and active manipulation copilot
import { AutoLayout } from '../core/AutoLayout.js';

export class AIEngine {
  constructor(state) {
    this.state = state;
  }

  // 1. Generate complete workflow draft from prompt
  async generateDraft(promptText, options = { clear: true, autolayout: true }) {
    if (!promptText || promptText.trim().length === 0) {
      throw new Error('프롬프트 내용을 입력해주세요.');
    }

    const cleanPrompt = promptText.trim();
    const workflow = this.parsePromptToGraph(cleanPrompt);

    if (options.clear) {
      this.state.pushHistory();
      this.state.nodes = [];
      this.state.edges = [];
      this.state.notes = [];
    }

    // Add sticky note summarizing the AI draft prompt
    this.state.addNote({
      x: 100,
      y: 40,
      width: 260,
      height: 120,
      color: 'purple',
      text: `✨ [AI 생성 워크플로우 초안]\n${cleanPrompt.slice(0, 100)}${cleanPrompt.length > 100 ? '...' : ''}`
    });

    workflow.nodes.forEach(node => this.state.nodes.push(node));
    workflow.edges.forEach(edge => this.state.edges.push(edge));

    if (options.autolayout) {
      AutoLayout.apply(this.state, 'horizontal');
    }

    this.state.save();
    this.state.emit('canvas:change');
    return workflow;
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

  parsePromptToGraph(prompt) {
    const p = prompt.toLowerCase();

    // Scenario 1: Refund / Ecommerce
    if (p.includes('환불') || p.includes('주문') || p.includes('결제')) {
      const nodes = [
        {
          id: 'ai_trig',
          type: 'start',
          category: 'start',
          title: '환불 요청 접수',
          desc: '고객 마이페이지 환불 접수 웹훅',
          icon: 'trigger',
          color: '#10b981',
          x: 100,
          y: 200,
          status: 'idle',
          memo: '환불 사유 및 주문 고유 ID 전달'
        },
        {
          id: 'ai_check',
          type: 'action',
          category: 'action',
          title: '주문/결제 내역 조회',
          desc: '결제 원장 DB 조회 및 금액 확인',
          icon: 'database',
          color: '#3b82f6',
          x: 380,
          y: 200,
          status: 'idle',
          memo: ''
        },
        {
          id: 'ai_cond',
          type: 'condition',
          category: 'condition',
          title: '자동 승인 금액 기준?',
          desc: '주문 금액 <= 50,000원 기준 분기',
          icon: 'condition',
          color: '#8b5cf6',
          x: 640,
          y: 200,
          status: 'idle',
          memo: '조건 충족 시 즉시 자동 취소 API 실행'
        },
        {
          id: 'ai_cancel_api',
          type: 'action',
          category: 'integration',
          title: 'PG사 결제 취소 API',
          desc: '카드사 승인 취소 및 환불 처리',
          icon: 'api',
          color: '#10b981',
          x: 920,
          y: 130,
          status: 'idle',
          memo: ''
        },
        {
          id: 'ai_notify_user',
          type: 'action',
          category: 'integration',
          title: '환불 완료 이메일/알림톡',
          desc: '환불 처리 결과 고객 알림 전송',
          icon: 'email',
          color: '#f59e0b',
          x: 1200,
          y: 130,
          status: 'idle',
          memo: ''
        },
        {
          id: 'ai_end_ok',
          type: 'end',
          category: 'end',
          title: '환불 처리 완료',
          desc: '주문 상태 환불 완료로 마감',
          icon: 'end',
          color: '#ec4899',
          x: 1480,
          y: 130,
          status: 'idle',
          memo: ''
        },
        {
          id: 'ai_admin_review',
          type: 'action',
          category: 'action',
          title: '관리자 수동 심사 대기',
          desc: '5만원 이상 고액 건 CS 담당자 검토',
          icon: 'user',
          color: '#f59e0b',
          x: 920,
          y: 320,
          status: 'idle',
          memo: '반려 시 고객센터 상담원 코멘트 필수'
        },
        {
          id: 'ai_sms_reject',
          type: 'action',
          category: 'integration',
          title: '심사 결과 문자 통보',
          desc: '반려 사유 안내 SMS 발송',
          icon: 'message',
          color: '#ef4444',
          x: 1200,
          y: 320,
          status: 'idle',
          memo: ''
        },
        {
          id: 'ai_end_reject',
          type: 'end',
          category: 'end',
          title: '환불 요청 반려 마감',
          desc: '프로세스 종료',
          icon: 'end',
          color: '#ec4899',
          x: 1480,
          y: 320,
          status: 'idle',
          memo: ''
        }
      ];

      const edges = [
        { id: 'ae1', from: 'ai_trig', fromPort: 'right', to: 'ai_check', toPort: 'left', label: '요청 전달', lineType: 'orthogonal' },
        { id: 'ae2', from: 'ai_check', fromPort: 'right', to: 'ai_cond', toPort: 'left', label: '금액 검증', lineType: 'orthogonal' },
        { id: 'ae3', from: 'ai_cond', fromPort: 'right', to: 'ai_cancel_api', toPort: 'left', label: '5만원 이하 (Yes)', lineType: 'orthogonal' },
        { id: 'ae4', from: 'ai_cancel_api', fromPort: 'right', to: 'ai_notify_user', toPort: 'left', label: '취소 완료', lineType: 'orthogonal' },
        { id: 'ae5', from: 'ai_notify_user', fromPort: 'right', to: 'ai_end_ok', toPort: 'left', label: '마감', lineType: 'orthogonal' },
        { id: 'ae6', from: 'ai_cond', fromPort: 'bottom', to: 'ai_admin_review', toPort: 'left', label: '5만원 초과 (No)', lineType: 'orthogonal' },
        { id: 'ae7', from: 'ai_admin_review', fromPort: 'right', to: 'ai_sms_reject', toPort: 'left', label: '반려 통보', lineType: 'orthogonal' },
        { id: 'ae8', from: 'ai_sms_reject', fromPort: 'right', to: 'ai_end_reject', toPort: 'left', label: '종료', lineType: 'orthogonal' }
      ];

      return { nodes, edges };
    }

    // Scenario 2: Signup / Onboarding
    if (p.includes('가입') || p.includes('회원') || p.includes('온보딩') || p.includes('signup')) {
      const nodes = [
        {
          id: 'on_start',
          type: 'start',
          category: 'start',
          title: '회원가입 폼 제출',
          desc: '신규 사용자 기본 정보 등록',
          icon: 'user',
          color: '#10b981',
          x: 100,
          y: 200,
          status: 'idle',
          memo: ''
        },
        {
          id: 'on_email_verify',
          type: 'action',
          category: 'integration',
          title: '이메일 인증 링크 발송',
          desc: '보안 OTP 및 6자리 인증 토큰 발송',
          icon: 'email',
          color: '#3b82f6',
          x: 380,
          y: 200,
          status: 'idle',
          memo: ''
        },
        {
          id: 'on_cond_verified',
          type: 'condition',
          category: 'condition',
          title: '24시간 내 인증 여부',
          desc: '이메일 확인 링크 클릭 여부',
          icon: 'condition',
          color: '#8b5cf6',
          x: 640,
          y: 200,
          status: 'idle',
          memo: ''
        },
        {
          id: 'on_coupon',
          type: 'action',
          category: 'action',
          title: '웰컴 가입 쿠폰 발급',
          desc: '첫 구매 20% 할인 쿠폰 지갑 적립',
          icon: 'action',
          color: '#10b981',
          x: 920,
          y: 130,
          status: 'idle',
          memo: ''
        },
        {
          id: 'on_slack_alert',
          type: 'action',
          category: 'integration',
          title: '신규 회원 Slack 알림',
          desc: '#growth 채널에 가입 축하 봇 메시지',
          icon: 'message',
          color: '#f59e0b',
          x: 1200,
          y: 130,
          status: 'idle',
          memo: ''
        },
        {
          id: 'on_end_active',
          type: 'end',
          category: 'end',
          title: '온보딩 완료',
          desc: '활성 사용자 전환 성공',
          icon: 'end',
          color: '#ec4899',
          x: 1480,
          y: 130,
          status: 'idle',
          memo: ''
        },
        {
          id: 'on_reminder_push',
          type: 'action',
          category: 'integration',
          title: '인증 독려 푸시 발송',
          desc: '미인증 회원 리마인더 문자 발송',
          icon: 'message',
          color: '#ef4444',
          x: 920,
          y: 310,
          status: 'idle',
          memo: ''
        }
      ];

      const edges = [
        { id: 'oe1', from: 'on_start', fromPort: 'right', to: 'on_email_verify', toPort: 'left', label: '가입 정보', lineType: 'orthogonal' },
        { id: 'oe2', from: 'on_email_verify', fromPort: 'right', to: 'on_cond_verified', toPort: 'left', label: '인증 대기', lineType: 'orthogonal' },
        { id: 'oe3', from: 'on_cond_verified', fromPort: 'right', to: 'on_coupon', toPort: 'left', label: '인증 완료 (Yes)', lineType: 'orthogonal' },
        { id: 'oe4', from: 'on_coupon', fromPort: 'right', to: 'on_slack_alert', toPort: 'left', label: '쿠폰 지급', lineType: 'orthogonal' },
        { id: 'oe5', from: 'on_slack_alert', fromPort: 'right', to: 'on_end_active', toPort: 'left', label: '완료', lineType: 'orthogonal' },
        { id: 'oe6', from: 'on_cond_verified', fromPort: 'bottom', to: 'on_reminder_push', toPort: 'left', label: '미인증 (No)', lineType: 'orthogonal' }
      ];

      return { nodes, edges };
    }

    // Generic Flow Generator
    const rawSteps = prompt
      .replace(/->|➔|→/g, '|')
      .split(/[|\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const steps = rawSteps.length > 0 ? rawSteps : [
      '이벤트 감지 트리거',
      '데이터 검증 및 전처리',
      '업무 로직 실행',
      '알림 발송 및 최종 완료'
    ];

    const nodes = [];
    const edges = [];

    steps.forEach((stepText, idx) => {
      const id = 'gen_step_' + (idx + 1);
      let type = 'action';
      let category = 'action';
      let icon = 'action';
      let color = '#3b82f6';

      if (idx === 0) {
        type = 'start';
        category = 'start';
        icon = 'trigger';
        color = '#10b981';
      } else if (idx === steps.length - 1) {
        type = 'end';
        category = 'end';
        icon = 'end';
        color = '#ec4899';
      } else if (stepText.includes('?') || stepText.includes('여부') || stepText.includes('확인') || stepText.includes('분기')) {
        type = 'condition';
        category = 'condition';
        icon = 'condition';
        color = '#8b5cf6';
      } else if (stepText.includes('api') || stepText.includes('호출') || stepText.includes('조회') || stepText.includes('전송')) {
        category = 'integration';
        icon = 'api';
        color = '#10b981';
      }

      nodes.push({
        id,
        type,
        category,
        title: stepText.slice(0, 24),
        desc: `AI 자동 파싱 단계: ${stepText}`,
        icon,
        color,
        x: 100 + idx * 280,
        y: 220,
        status: 'idle',
        memo: `AI 프롬프트로부터 파싱됨`
      });

      if (idx > 0) {
        edges.push({
          id: `ge_${idx}`,
          from: nodes[idx - 1].id,
          fromPort: 'right',
          to: id,
          toPort: 'left',
          label: '',
          lineType: 'orthogonal'
        });
      }
    });

    return { nodes, edges };
  }
}
