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

    // 3. Compute coordinates based on layer rank
    const startX = 100;
    const startY = 140;
    const spacingX = 300; // Node width ~220 + 80 gap
    const spacingY = 160; // Node height ~90 + 70 gap

    layers.forEach((layer, layerIndex) => {
      const layerCount = layer.length;
      const totalHeight = (layerCount - 1) * spacingY;
      const layerStartY = startY - totalHeight / 2 + 100;

      layer.forEach((nodeId, nodeIndex) => {
        const node = nodeMap.get(nodeId);
        if (node) {
          if (direction === 'horizontal') {
            node.x = Math.round(startX + layerIndex * spacingX);
            node.y = Math.round(layerStartY + nodeIndex * spacingY);
          } else {
            // Vertical layout
            node.x = Math.round(startX + nodeIndex * spacingX);
            node.y = Math.round(startY + layerIndex * spacingY);
          }
        }
      });
    });

    state.save();
    state.emit('canvas:change');
  }
}
