// Simulator.js: Interactive step-by-step workflow execution engine with path token animation
export class Simulator {
  constructor(state, connections, tokensGroup, drawerElement, logsContainer) {
    this.state = state;
    this.connections = connections;
    this.tokensGroup = tokensGroup;
    this.drawer = drawerElement;
    this.logsContainer = logsContainer;

    this.isRunning = false;
    this.abortController = null;
  }

  log(level, message) {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
      <span class="log-time">[${time}]</span>
      <span class="log-level ${level}">${level.toUpperCase()}</span>
      <span class="log-message">${message}</span>
    `;
    this.logsContainer.appendChild(entry);
    this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
  }

  clearLogs() {
    this.logsContainer.innerHTML = '';
  }

  async run() {
    if (this.isRunning) {
      this.stop();
      return;
    }

    if (this.state.nodes.length === 0) {
      alert('실행할 노드가 없습니다.');
      return;
    }

    this.isRunning = true;
    this.drawer.classList.add('active');
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Reset all node statuses to idle
    this.state.nodes.forEach(n => n.status = 'idle');
    this.state.emit('canvas:change');

    this.log('info', `=== 워크플로우 실행 시작 (노드 ${this.state.nodes.length}개) ===`);

    // Find start nodes
    let startNodes = this.state.nodes.filter(n => n.type === 'start' || n.category === 'start');
    if (startNodes.length === 0) {
      // Find nodes with no incoming edges
      const incomingNodeIds = new Set(this.state.edges.map(e => e.to));
      startNodes = this.state.nodes.filter(n => !incomingNodeIds.has(n.id));
    }
    if (startNodes.length === 0) {
      startNodes = [this.state.nodes[0]];
    }

    const queue = [...startNodes];
    const visited = new Set();

    try {
      while (queue.length > 0 && !signal.aborted) {
        const currentNode = queue.shift();
        if (visited.has(currentNode.id)) continue;
        visited.add(currentNode.id);

        // 1. Mark current node as running
        currentNode.status = 'running';
        this.state.emit('canvas:change');
        this.log('info', `[노드 실행] ${currentNode.title} (${currentNode.type.toUpperCase()}) 처리 중...`);

        // Wait step duration (600ms)
        await this.delay(650, signal);

        // Mark as success
        currentNode.status = 'success';
        this.state.emit('canvas:change');
        this.log('success', `[노드 완료] ${currentNode.title} 실행 성공.`);

        // Find outgoing edges
        const outgoingEdges = this.state.edges.filter(e => e.from === currentNode.id);

        if (outgoingEdges.length > 0) {
          // If condition node, pick one branch or all
          let chosenEdges = outgoingEdges;
          if (currentNode.type === 'condition' && outgoingEdges.length > 1) {
            // Traverse all branches for condition nodes
            chosenEdges = outgoingEdges;
            this.log('warn', `[조건 분기] ${outgoingEdges.length}개 분기 경로 순차 실행`);
          }

          // Animate tokens traveling along the edges
          for (const edge of chosenEdges) {
            await this.animateToken(edge, signal);
            const targetNode = this.state.nodes.find(n => n.id === edge.to);
            if (targetNode && !visited.has(targetNode.id)) {
              queue.push(targetNode);
            }
          }
        }
      }

      if (!signal.aborted) {
        this.log('success', '🎉 === 워크플로우 실행이 성공적으로 완료되었습니다! ===');
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        this.log('error', `오류 발생: ${e.message}`);
      }
    } finally {
      this.isRunning = false;
      this.tokensGroup.innerHTML = '';
      this.state.emit('simulation:end');
    }
  }

  stop() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isRunning = false;
    this.tokensGroup.innerHTML = '';
    this.state.nodes.forEach(n => n.status = 'idle');
    this.state.emit('canvas:change');
    this.state.emit('simulation:end');
    this.log('warn', '워크플로우 실행이 사용자에 의해 중단되었습니다.');
  }

  // Animate a glowing packet/circle moving from p1 to p2 along the edge path
  animateToken(edge, signal) {
    return new Promise((resolve, reject) => {
      const fromNode = this.state.nodes.find(n => n.id === edge.from);
      const toNode = this.state.nodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) {
        return resolve();
      }

      const p1 = this.connections.getPortCoordinates(fromNode, edge.fromPort || 'right');
      const p2 = this.connections.getPortCoordinates(toNode, edge.toPort || 'left');
      const d = this.connections.createPathD(p1, p2, edge.lineType || 'orthogonal', edge.fromPort, edge.toPort);

      // Create temporary invisible path to calculate points along length
      const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      tempPath.setAttribute('d', d);
      const pathLength = tempPath.getTotalLength();

      // Create circle token
      const token = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      token.setAttribute('class', 'sim-token');
      this.tokensGroup.appendChild(token);

      const duration = 500; // ms
      const startTime = performance.now();

      const frame = (now) => {
        if (signal.aborted) {
          token.remove();
          return reject(new DOMException('Aborted', 'AbortError'));
        }

        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const point = tempPath.getPointAtLength(progress * pathLength);

        token.setAttribute('cx', point.x);
        token.setAttribute('cy', point.y);

        if (progress < 1) {
          requestAnimationFrame(frame);
        } else {
          token.remove();
          resolve();
        }
      };

      requestAnimationFrame(frame);
    });
  }

  delay(ms, signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  }
}
