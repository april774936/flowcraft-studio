// Exporter utility for PNG, SVG, and JSON with complete canvas node & note rendering
export class Exporter {
  static exportJSON(projectData, filename = 'workflow.json') {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(projectData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  static exportSVG(svgElement, filename = 'workflow.svg') {
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgElement);
    if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  static async exportPNG(canvasWorldElement, state, filename = 'workflow.png') {
    if (!state || state.nodes.length === 0) {
      alert('내보낼 노드가 없습니다.');
      return;
    }

    // 1. Calculate bounding box of all nodes and notes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + 240);
      maxY = Math.max(maxY, n.y + 110);
    });

    state.notes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + (n.width || 200));
      maxY = Math.max(maxY, n.y + (n.height || 140));
    });

    const padding = 80;
    const exportWidth = (maxX - minX) + padding * 2;
    const exportHeight = (maxY - minY) + padding * 2;

    const scale = 2; // Retina 2x resolution
    const canvas = document.createElement('canvas');
    canvas.width = exportWidth * scale;
    canvas.height = exportHeight * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    // 2. Draw background
    ctx.fillStyle = '#0c1220';
    ctx.fillRect(0, 0, exportWidth, exportHeight);

    // 3. Draw grid dots
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let x = 0; x < exportWidth; x += 24) {
      for (let y = 0; y < exportHeight; y += 24) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const offsetX = padding - minX;
    const offsetY = padding - minY;

    // 4. Draw SVG Connections
    const nodeMap = new Map(state.nodes.map(n => [n.id, n]));
    state.edges.forEach(edge => {
      const fromNode = nodeMap.get(edge.from);
      const toNode = nodeMap.get(edge.to);
      if (!fromNode || !toNode) return;

      const p1 = { x: fromNode.x + 220 + offsetX, y: fromNode.y + 45 + offsetY };
      const p2 = { x: toNode.x + offsetX, y: toNode.y + 45 + offsetY };

      const dx = Math.abs(p2.x - p1.x);
      const curvature = Math.max(dx * 0.5, 40);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.bezierCurveTo(p1.x + curvature, p1.y, p2.x - curvature, p2.y, p2.x, p2.y);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Draw arrowhead
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p2.x - 8, p2.y - 5);
      ctx.lineTo(p2.x - 8, p2.y + 5);
      ctx.fillStyle = '#475569';
      ctx.fill();

      // Draw edge label
      if (edge.label) {
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        ctx.font = 'bold 11px Inter, sans-serif';
        const textMetrics = ctx.measureText(edge.label);
        const lw = textMetrics.width + 16;

        ctx.fillStyle = '#111827';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(midX - lw / 2, midY - 11, lw, 22, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(edge.label, midX, midY);
      }
    });

    // 5. Draw Sticky Notes
    state.notes.forEach(note => {
      const x = note.x + offsetX;
      const y = note.y + offsetY;
      const w = note.width || 200;
      const h = note.height || 140;

      const colors = {
        yellow: { bg: '#fef08a', text: '#713f12', border: '#facc15' },
        green: { bg: '#bbf7d0', text: '#14532d', border: '#4ade80' },
        blue: { bg: '#bae6fd', text: '#0c4a6e', border: '#38bdf8' },
        pink: { bg: '#fbcfe8', text: '#831843', border: '#f472b6' },
        purple: { bg: '#e9d5ff', text: '#581c87', border: '#c084fc' }
      };

      const c = colors[note.color] || colors.yellow;

      // Note shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 3, w, h, 8);
      ctx.fill();

      // Note card
      ctx.fillStyle = c.bg;
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8);
      ctx.fill();
      ctx.stroke();

      // Note header
      ctx.fillStyle = c.text;
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('📌 MEMO', x + 10, y + 10);

      // Note text (multi-line)
      ctx.font = '12px Inter, sans-serif';
      const lines = (note.text || '').split('\n');
      lines.forEach((line, idx) => {
        if (y + 30 + idx * 16 < y + h - 10) {
          ctx.fillText(line.slice(0, 35), x + 10, y + 30 + idx * 16);
        }
      });
    });

    // 6. Draw Workflow Node Cards
    state.nodes.forEach(node => {
      const x = node.x + offsetX;
      const y = node.y + offsetY;
      const w = 220;
      const h = 90;
      const accent = node.color || '#3b82f6';

      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 4, w, h, 10);
      ctx.fill();

      // Card body
      ctx.fillStyle = '#111827';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 10);
      ctx.fill();
      ctx.stroke();

      // Top Accent bar
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.roundRect(x, y, w, 4, [10, 10, 0, 0]);
      ctx.fill();

      // Icon box
      ctx.fillStyle = `${accent}25`;
      ctx.beginPath();
      ctx.roundRect(x + 12, y + 14, 26, 26, 6);
      ctx.fill();

      // Title
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 13px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.title.slice(0, 18), x + 46, y + 27);

      // Description
      if (node.desc) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px Inter, sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(node.desc.slice(0, 26), x + 12, y + 46);
      }

      // Type Badge
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.roundRect(x + 12, y + 66, 50, 16, 3);
      ctx.fill();

      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.type.toUpperCase(), x + 18, y + 74);

      // Status indicator
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(x + w - 45, y + 74, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText('대기', x + w - 36, y + 74);
    });

    // 7. Trigger download
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}
