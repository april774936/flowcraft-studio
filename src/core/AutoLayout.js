// AutoLayout: Hierarchical DAG layout for clean workflow organization
export class AutoLayout {
  static apply(state, direction = 'horizontal') {
    const nodes = state.nodes;
    const edges = state.edges;
    if (nodes.length === 0) return;

    state.pushHistory();

    // 1. Build adjacency list & in-degrees
    const adj = new Map();
    const inDegree = new Map();
    const nodeMap = new Map();

    nodes.forEach(n => {
      adj.set(n.id, []);
      inDegree.set(n.id, 0);
      nodeMap.set(n.id, n);
    });

    edges.forEach(e => {
      if (adj.has(e.from) && inDegree.has(e.to)) {
        adj.get(e.from).push(e.to);
        inDegree.set(e.to, inDegree.get(e.to) + 1);
      }
    });

    // 2. Layer assignment using Kahn's topological sort
    const layers = [];
    let currentLayer = [];

    // Roots have inDegree === 0
    nodes.forEach(n => {
      if (inDegree.get(n.id) === 0) {
        currentLayer.push(n.id);
      }
    });

    // If cycle or no root found, fall back to first node
    if (currentLayer.length === 0 && nodes.length > 0) {
      currentLayer.push(nodes[0].id);
    }

    const visited = new Set(currentLayer);

    while (currentLayer.length > 0) {
      layers.push(currentLayer);
      const nextLayer = [];

      currentLayer.forEach(uId => {
        const neighbors = adj.get(uId) || [];
        neighbors.forEach(vId => {
          if (!visited.has(vId)) {
            visited.add(vId);
            nextLayer.push(vId);
          }
        });
      });

      currentLayer = nextLayer;
    }

    // Add any remaining unvisited nodes
    const unvisited = nodes.filter(n => !visited.has(n.id)).map(n => n.id);
    if (unvisited.length > 0) {
      layers.push(unvisited);
    }

    // 3. Compute coordinates from the rendered node sizes, leaving room for edge labels
    const size = (n) => (state.measureNode && state.measureNode(n)) || { width: 240, height: 90 };
    const startX = 100;
    const centerY = 300;
    const gapX = 150; // fits an edge label between columns
    const gapY = 70;

    if (direction === 'horizontal') {
      let x = startX;
      layers.forEach(layer => {
        const layerNodes = layer.map(id => nodeMap.get(id)).filter(Boolean);
        const colWidth = Math.max(...layerNodes.map(n => size(n).width));
        const totalHeight = layerNodes.reduce((sum, n) => sum + size(n).height, 0) + gapY * (layerNodes.length - 1);
        let y = centerY - totalHeight / 2;
        layerNodes.forEach(n => {
          const s = size(n);
          n.x = Math.round(x + (colWidth - s.width) / 2);
          n.y = Math.round(y);
          y += s.height + gapY;
        });
        x += colWidth + gapX;
      });
    } else {
      let y = 140;
      layers.forEach(layer => {
        const layerNodes = layer.map(id => nodeMap.get(id)).filter(Boolean);
        const rowHeight = Math.max(...layerNodes.map(n => size(n).height));
        let x = startX;
        layerNodes.forEach(n => {
          const s = size(n);
          n.x = Math.round(x);
          n.y = Math.round(y + (rowHeight - s.height) / 2);
          x += s.width + gapX;
        });
        y += rowHeight + 110;
      });
    }

    state.save();
    state.emit('canvas:change');
  }
}
