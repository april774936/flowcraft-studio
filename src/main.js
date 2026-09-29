// main.js: App initialization and module coordination
import { ProjectManager } from './core/ProjectManager.js';
import { State } from './core/State.js';
import { Canvas } from './core/Canvas.js';
import { Connections } from './core/Connections.js';
import { Simulator } from './core/Simulator.js';
import { AIEngine } from './ai/AIEngine.js';
import { QuickEdit } from './core/QuickEdit.js';
import { isAdvanced, setAdvanced, applyAdvanced } from './utils/advanced.js';

import { NodeRenderer } from './components/NodeRenderer.js';
import { NotesManager } from './components/NotesManager.js';
import { Minimap } from './components/Minimap.js';
import { Palette } from './components/Palette.js';
import { Inspector } from './components/Inspector.js';
import { HomeDashboard } from './components/HomeDashboard.js';
import { TimelineRuler } from './components/TimelineRuler.js';
import { AIModal } from './components/AIModal.js';
import { Toolbar } from './components/Toolbar.js';

document.addEventListener('DOMContentLoaded', () => {
  applyAdvanced();
  // 1. Core State & Project Manager
  const projectManager = new ProjectManager();
  const state = new State(projectManager);

  // 2. Canvas DOM Elements
  const container = document.getElementById('canvas-container');
  const world = document.getElementById('canvas-world');
  const grid = document.getElementById('canvas-grid');
  const guideX = document.getElementById('guide-x');
  const guideY = document.getElementById('guide-y');
  const marquee = document.getElementById('selection-marquee');

  const canvas = new Canvas(state, container, world, grid, guideX, guideY, marquee);
  const timelineRuler = new TimelineRuler(state, document.getElementById('timeline-ruler'), world);

  // 3. SVG Connections
  const svg = document.getElementById('connections-svg');
  const edgesGroup = document.getElementById('edges-group');
  const tempPath = document.getElementById('temp-connection');
  const connections = new Connections(state, svg, edgesGroup, tempPath);
  connections.canvas = canvas;

  // 4. Nodes & Sticky Notes layers
  const nodesLayer = document.getElementById('nodes-layer');
  const notesLayer = document.getElementById('notes-layer');

  const nodeRenderer = new NodeRenderer(state, nodesLayer, connections, canvas, timelineRuler);
  const notesManager = new NotesManager(state, notesLayer, canvas);
  const quickEdit = new QuickEdit(state, canvas, connections, nodeRenderer);

  // Initial edges render
  connections.renderEdges();
  state.on('canvas:change', () => connections.renderEdges());

  // 5. Workflow Execution Simulator
  const tokensGroup = document.getElementById('tokens-group');
  const simulatorDrawer = document.getElementById('simulator-drawer');
  const simulatorLogs = document.getElementById('simulator-logs');
  const simulator = new Simulator(state, connections, tokensGroup, simulatorDrawer, simulatorLogs);

  // 6. AI Engine & Home Dashboard
  const aiEngine = new AIEngine(state);
  const dashboard = new HomeDashboard(state, projectManager, document.getElementById('home-dashboard'));

  const aiModalOverlay = document.getElementById('ai-modal');
  const aiModal = new AIModal(state, aiEngine, aiModalOverlay, canvas);

  // Keep header project name in sync with the active project
  const headerProjectName = document.getElementById('header-project-name');
  state.on('project:loaded', (proj) => {
    if (headerProjectName && proj) headerProjectName.textContent = proj.name;
  });

  // Initial load and open dashboard
  state.loadActiveProject();
  dashboard.open();

  // 7. Left Sidebar Palette & Templates
  const sidebarContentArea = document.getElementById('sidebar-content-area');
  const palette = new Palette(state, sidebarContentArea, canvas);

  // Sidebar Tab Switching
  const tabPalette = document.getElementById('tab-palette');
  const tabTemplates = document.getElementById('tab-templates');

  tabPalette?.addEventListener('click', () => {
    tabPalette.classList.add('active');
    tabTemplates?.classList.remove('active');
    palette.setTab('palette');
  });

  tabTemplates?.addEventListener('click', () => {
    tabTemplates.classList.add('active');
    tabPalette?.classList.remove('active');
    palette.setTab('templates');
  });

  // Sidebar Search
  const searchInput = document.getElementById('palette-search-input');
  searchInput?.addEventListener('input', (e) => {
    palette.setSearchQuery(e.target.value);
  });

  // 8. Right Inspector Drawer
  const inspectorContentArea = document.getElementById('inspector-content-area');
  const inspectorHeaderTitle = document.getElementById('inspector-header-title');
  const inspectorHeaderIcon = document.getElementById('inspector-header-icon');
  const inspector = new Inspector(state, inspectorContentArea, inspectorHeaderTitle, inspectorHeaderIcon, aiEngine);

  // Inspector Tabs
  const tabInspProp = document.getElementById('tab-inspector-prop');
  const tabInspMemo = document.getElementById('tab-inspector-memo');

  tabInspProp?.addEventListener('click', () => {
    tabInspProp.classList.add('active');
    tabInspMemo?.classList.remove('active');
    inspector.setTab('properties');
  });

  tabInspMemo?.addEventListener('click', () => {
    tabInspMemo.classList.add('active');
    tabInspProp?.classList.remove('active');
    inspector.setTab('memo');
  });

  // Inspector Drawer close / open toggle
  const appInspector = document.getElementById('app-inspector');
  document.getElementById('btn-project-selector')?.addEventListener('click', () => {
    dashboard.open();
  });
  
  document.getElementById('btn-go-home')?.addEventListener('click', () => {
    dashboard.open();
  });

  // The FlowCraft logo (icon + text) also goes home
  const logoHome = document.getElementById('logo-home');
  logoHome?.addEventListener('click', () => dashboard.open());
  logoHome?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dashboard.open(); }
  });

  // 고급 기능 toggle (automation UI: AI, run simulation, webhook/API palette)
  const advBtn = document.getElementById('btn-advanced-toggle');
  const syncAdvBtn = () => {
    advBtn?.classList.toggle('on', isAdvanced());
    advBtn?.setAttribute('aria-pressed', String(isAdvanced()));
  };
  advBtn?.addEventListener('click', () => { setAdvanced(!isAdvanced()); syncAdvBtn(); });
  syncAdvBtn();

  document.getElementById('bg-color-picker')?.addEventListener('input', (e) => {
    document.documentElement.style.setProperty('--bg-canvas', e.target.value);
  });
  // Inspector opens when something is selected and gets out of the way otherwise
  const appBody = document.querySelector('.app-body');
  const inspectorToggle = document.getElementById('btn-toggle-inspector');
  const setInspectorOpen = (open) => {
    appBody?.classList.toggle('inspector-collapsed', !open);
    if (inspectorToggle) inspectorToggle.textContent = open ? '▶' : '◀';
  };
  setInspectorOpen(false);
  state.on('selection:change', (sel) => setInspectorOpen(sel && sel.type !== 'none'));
  document.getElementById('btn-close-inspector')?.addEventListener('click', () => setInspectorOpen(false));

  // 9. Minimap
  const minimapContainer = document.getElementById('minimap-container');
  const minimapCanvas = document.getElementById('minimap-canvas');
  const minimapViewport = document.getElementById('minimap-viewport');
  const minimap = new Minimap(state, minimapContainer, minimapCanvas, minimapViewport, container);

  // 10. Top Header Toolbar (project switching is handled by the Home Dashboard)
  const toolbar = new Toolbar(state, dashboard, aiModal, simulator, canvas, aiEngine);

  // Fit the flow to the screen whenever a project is opened
  const fitView = () => requestAnimationFrame(() => {
    const rect = container.getBoundingClientRect();
    state.fitToContent(rect.width, rect.height);
  });
  state.on('project:loaded', fitView);
  fitView();

  console.log('✨ FlowCraft Studio initialized successfully.');
});
