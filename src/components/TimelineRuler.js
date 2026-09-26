// TimelineRuler.js: Renders a horizontal time/step axis for timeline mode
export class TimelineRuler {
  constructor(state, container, worldElement) {
    this.state = state;
    this.container = container;
    this.world = worldElement;
    
    this.columnWidth = 320; // Distance between time steps
    this.steps = 20; // Total number of steps to render initially
    
    this.init();
    
    // Re-render when project changes (to toggle display)
    this.state.on('canvas:change', () => this.updateVisibility());
  }
  
  init() {
    this.container.innerHTML = '';
    
    // Create header columns
    for (let i = 0; i < this.steps; i++) {
      const stepLabel = document.createElement('div');
      stepLabel.className = 'timeline-step';
      stepLabel.style.left = `${i * this.columnWidth}px`;
      
      // Determine label based on step
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const label = `Phase ${i + 1}`;
      
      stepLabel.innerHTML = `
        <div class="timeline-step-label">${label}</div>
        <div class="timeline-step-line"></div>
      `;
      
      this.container.appendChild(stepLabel);
    }
  }
  
  updateVisibility() {
    const proj = this.state.getActiveProject ? this.state.getActiveProject() : null;
    const isTimeline = proj && proj.mode === 'timeline';
    
    if (isTimeline) {
      this.container.style.display = 'block';
      // Inject timeline styles dynamically to grid
      document.getElementById('canvas-grid').classList.add('timeline-mode');
    } else {
      this.container.style.display = 'none';
      document.getElementById('canvas-grid').classList.remove('timeline-mode');
    }
  }
  
  // Snap a given X coordinate to the nearest timeline column
  snapToColumn(x) {
    const proj = this.state.getActiveProject ? this.state.getActiveProject() : null;
    if (proj && proj.mode === 'timeline') {
      const col = Math.round(x / this.columnWidth);
      return Math.max(0, col * this.columnWidth + 50); // 50px offset from the line
    }
    return x;
  }
}
