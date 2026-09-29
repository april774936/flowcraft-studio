// MainPath.js: the user-marked "main route" through a flow.
// Edges flagged `main: true` are seeds. The highlight then follows the flow on its own
// wherever there is no choice to make: forward through a node with a single outgoing
// edge (decisions only continue along a branch the user marked), and backward through
// a node with a single incoming edge. So marking one branch of a decision highlights
// the whole route from the start through that branch to the end.

export function computeMainPath(nodes, edges) {
  const mainEdges = new Set();
  const mainNodes = new Set();
  const seeds = edges.filter(e => e.main);
  if (!seeds.length) return { edges: mainEdges, nodes: mainNodes };

  const typeOf = new Map(nodes.map(n => [n.id, n.type]));
  const out = new Map(), inc = new Map();
  edges.forEach(e => {
    if (!out.has(e.from)) out.set(e.from, []);
    if (!inc.has(e.to)) inc.set(e.to, []);
    out.get(e.from).push(e);
    inc.get(e.to).push(e);
  });

  const queue = [...seeds];
  while (queue.length) {
    const e = queue.pop();
    if (mainEdges.has(e.id)) continue;
    mainEdges.add(e.id);
    mainNodes.add(e.from);
    mainNodes.add(e.to);

    const fwd = out.get(e.to) || [];
    const marked = fwd.filter(x => x.main);
    if (marked.length) queue.push(...marked);
    else if (fwd.length === 1 && typeOf.get(e.to) !== 'condition') queue.push(fwd[0]);

    const back = inc.get(e.from) || [];
    const markedBack = back.filter(x => x.main);
    if (markedBack.length) queue.push(...markedBack);
    else if (back.length === 1) queue.push(back[0]);
  }
  return { edges: mainEdges, nodes: mainNodes };
}

// Edges of the connected main route that contains a node (used to clear it)
export function mainComponentEdges(nodeId, nodes, edges) {
  const { edges: mainEdges } = computeMainPath(nodes, edges);
  const onMain = edges.filter(e => mainEdges.has(e.id));
  const seen = new Set([nodeId]);
  const result = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    onMain.forEach(e => {
      if (result.has(e.id)) return;
      if (seen.has(e.from) || seen.has(e.to)) {
        result.add(e.id);
        seen.add(e.from); seen.add(e.to);
        grew = true;
      }
    });
  }
  return result;
}
