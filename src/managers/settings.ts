import { OctreeRenderSettings } from '../octreevis';

export class SettingsManager {
  private settingsPanel!: HTMLElement;
  private showRaymarchedCheckbox!: HTMLInputElement;
  private showOctreeCheckbox!: HTMLInputElement;
  private showOutsideCheckbox!: HTMLInputElement;
  private showInsideCheckbox!: HTMLInputElement;
  private showBoundaryCheckbox!: HTMLInputElement;
  private minSizeSlider!: HTMLInputElement;
  private cellBudgetSlider!: HTMLInputElement;
  private minRenderSizeSlider!: HTMLInputElement;
  private showMeshCheckbox!: HTMLInputElement;
  private optimizeMeshCheckbox!: HTMLInputElement;
  private meshOpacitySlider!: HTMLInputElement;

  constructor(
    private previewPane: HTMLElement,
    private onSettingsChange: () => void
  ) {
    this.createSettingsPanel();
    this.setupEventListeners();
  }

  private createSettingsPanel() {
    // Create settings icon
    const settingsIcon = document.createElement('div');
    settingsIcon.id = 'settings-icon';
    settingsIcon.className = 'control-icon';
    settingsIcon.innerHTML = '⚙️';

    // Create settings panel
    this.settingsPanel = document.createElement('div');
    this.settingsPanel.id = 'settings-panel';
    this.settingsPanel.classList.add('control-panel');
    this.settingsPanel.innerHTML = `
      <div class="settings-content">
        <div class="setting-row">
          <input type="checkbox" id="show-raymarched" checked>
          <label for="show-raymarched">Show Raymarched Object</label>
        </div>
        <div class="setting-row">
          <input type="checkbox" id="show-octree" checked>
          <label for="show-octree">Show Octree Grid</label>
        </div>
        <div class="setting-row">
          <input type="checkbox" id="show-outside" checked>
          <label for="show-outside">Show Outside Cells</label>
        </div>
        <div class="setting-row">
          <input type="checkbox" id="show-inside" checked>
          <label for="show-inside">Show Inside Cells</label>
        </div>
        <div class="setting-row">
          <input type="checkbox" id="show-boundary" checked>
          <label for="show-boundary">Show Boundary Cells</label>
        </div>
        <div class="setting-group">
          <h4>Octree Computation</h4>
          <div class="setting-row">
            <label for="min-size">Min Cell Size:</label>
            <input type="range" id="min-size" min="0" max="8" step="1" value="4">
            <span class="value-display">1/16</span>
          </div>
          <div class="setting-row">
            <label for="cell-budget">Cell Budget:</label>
            <input type="range" id="cell-budget" min="1000" max="1000000" step="1000" value="100000">
            <span class="value-display">100000</span>
          </div>
        </div>
        <div class="setting-group">
          <h4>Visualization</h4>
          <div class="setting-row">
            <label for="min-render-size">Min Render Size:</label>
            <input type="range" id="min-render-size" min="0" max="6" step="1" value="3">
            <span class="value-display">1/8</span>
          </div>
        </div>
        <div class="setting-group">
          <h4>Mesh Display</h4>
          <div class="setting-row">
            <input type="checkbox" id="show-mesh">
            <label for="show-mesh">Show Mesh</label>
          </div>
          <div class="setting-row">
            <input type="checkbox" id="optimize-mesh" checked>
            <label for="optimize-mesh">Optimize Mesh</label>
          </div>
          <div class="setting-row">
            <label for="mesh-opacity">Mesh Opacity:</label>
            <input type="range" id="mesh-opacity" min="0" max="1" step="0.1" value="0.8">
            <span class="value-display">0.8</span>
          </div>
        </div>
      </div>
    `;
    // Create info icon
    const infoIcon = document.createElement('div');
    infoIcon.id = 'info-icon';
    infoIcon.className = 'control-icon';
    infoIcon.innerHTML = 'ℹ️';

    // Create info panel
    const infoPanel = document.createElement('div');
    infoPanel.id = 'info-panel';
    infoPanel.classList.add('control-panel');
    infoPanel.innerHTML = `
      <div class="info-content">
        <div class="info-group">
          <h4>Octree Stats</h4>
          <div class="stat-row">
            <label>Inside Cells:</label>
            <span id="inside-cells">0</span>
          </div>
          <div class="stat-row">
            <label>Outside Cells:</label>
            <span id="outside-cells">0</span>
          </div>
          <div class="stat-row">
            <label>Boundary Cells:</label>
            <span id="boundary-cells">0</span>
          </div>
        </div>
        <div class="info-group">
          <h4>Performance</h4>
          <div class="stat-row">
            <label>Last Update:</label>
            <span id="last-update-time">-</span>
          </div>
          <div class="stat-row">
            <label>Subdivisions:</label>
            <span id="subdivision-count">0</span>
          </div>
        </div>
      </div>
    `;

    this.previewPane.appendChild(this.settingsPanel);
    this.previewPane.appendChild(infoPanel);

    // Get references to inputs
    this.showRaymarchedCheckbox = document.getElementById('show-raymarched') as HTMLInputElement;
    this.showOctreeCheckbox = document.getElementById('show-octree') as HTMLInputElement;
    this.showOutsideCheckbox = document.getElementById('show-outside') as HTMLInputElement;
    this.showInsideCheckbox = document.getElementById('show-inside') as HTMLInputElement;
    this.showBoundaryCheckbox = document.getElementById('show-boundary') as HTMLInputElement;
    this.minSizeSlider = document.getElementById('min-size') as HTMLInputElement;
    this.cellBudgetSlider = document.getElementById('cell-budget') as HTMLInputElement;
    this.minRenderSizeSlider = document.getElementById('min-render-size') as HTMLInputElement;
    this.showMeshCheckbox = document.getElementById('show-mesh') as HTMLInputElement;
    this.optimizeMeshCheckbox = document.getElementById('optimize-mesh') as HTMLInputElement;
    this.meshOpacitySlider = document.getElementById('mesh-opacity') as HTMLInputElement;

    // Set initial checkbox states
    this.showRaymarchedCheckbox.checked = true;
    this.showOctreeCheckbox.checked = false;
    this.showMeshCheckbox.checked = false;

    // Position icons and add click handlers
    settingsIcon.style.right = '10px';
    settingsIcon.style.top = '10px';
    infoIcon.style.right = '52px';
    infoIcon.style.top = '10px';

    // Position panels
    this.settingsPanel.style.right = '10px';
    this.settingsPanel.style.top = '52px';
    infoPanel.style.right = '52px';
    infoPanel.style.top = '52px';

    // Add click handlers
    settingsIcon.addEventListener('click', () => {
      this.settingsPanel.classList.toggle('visible');
      infoPanel.classList.remove('visible');
    });

    infoIcon.addEventListener('click', () => {
      infoPanel.classList.toggle('visible');
      this.settingsPanel.classList.remove('visible');
    });

    // Close panels when clicking outside
    document.addEventListener('click', (event) => {
      if (!event.target) return;
      const target = event.target as HTMLElement;
      if (
        !target.closest('#settings-panel') &&
        !target.closest('#settings-icon') &&
        !target.closest('#info-panel') &&
        !target.closest('#info-icon')
      ) {
        this.settingsPanel.classList.remove('visible');
        infoPanel.classList.remove('visible');
      }
    });

    // Add elements to DOM
    this.previewPane.appendChild(settingsIcon);
    this.previewPane.appendChild(infoIcon);
  }

  private setupEventListeners() {
    this.minSizeSlider.addEventListener('input', () => {
      const power = parseInt(this.minSizeSlider.value);
      const value = Math.pow(2, power);
      const display = this.minSizeSlider.nextElementSibling as HTMLSpanElement;
      display.textContent = value === 1 ? '1' : `1/${value}`;

      // If mesh is visible, trigger mesh regeneration
      if (this.showMeshCheckbox.checked) {
        document.getElementById('show-mesh')?.dispatchEvent(new Event('change'));
      }

      this.onSettingsChange();
    });

    this.cellBudgetSlider.addEventListener('input', () => {
      const value = parseInt(this.cellBudgetSlider.value);
      const display = this.cellBudgetSlider.nextElementSibling as HTMLSpanElement;
      display.textContent = value.toString();
      this.onSettingsChange();
    });

    this.minRenderSizeSlider.addEventListener('input', () => {
      const power = parseInt(this.minRenderSizeSlider.value);
      const value = Math.pow(2, power);
      const display = this.minRenderSizeSlider.nextElementSibling as HTMLSpanElement;
      display.textContent = value === 1 ? '1' : `1/${value}`;
      this.onSettingsChange();
    });

    this.meshOpacitySlider.addEventListener('input', () => {
      const value = parseFloat(this.meshOpacitySlider.value);
      const display = this.meshOpacitySlider.nextElementSibling as HTMLSpanElement;
      display.textContent = value.toFixed(1);
      this.onSettingsChange();
    });

    // Add listeners for checkboxes
    [
      this.showRaymarchedCheckbox,
      this.showOctreeCheckbox,
      this.showOutsideCheckbox,
      this.showInsideCheckbox,
      this.showBoundaryCheckbox,
      this.showMeshCheckbox,
      this.optimizeMeshCheckbox,
    ].forEach((checkbox) => {
      checkbox.addEventListener('change', this.onSettingsChange);
    });
  }

  getRenderSettings(): OctreeRenderSettings {
    const minRenderSize = Math.pow(2, -parseInt(this.minRenderSizeSlider.value));
    return new OctreeRenderSettings(
      this.showOutsideCheckbox.checked,
      this.showInsideCheckbox.checked,
      this.showBoundaryCheckbox.checked,
      minRenderSize
    );
  }

  getMinSize(): number {
    const power = parseInt(this.minSizeSlider.value);
    return Math.pow(2, -power);
  }

  getCellBudget(): number {
    return parseInt(this.cellBudgetSlider.value);
  }

  isOctreeVisible(): boolean {
    return this.showOctreeCheckbox.checked;
  }

  isRaymarchedVisible(): boolean {
    return this.showRaymarchedCheckbox.checked;
  }

  isMeshVisible(): boolean {
    return this.showMeshCheckbox.checked;
  }

  isMeshOptimizationEnabled(): boolean {
    return this.optimizeMeshCheckbox.checked;
  }

  getMeshOpacity(): number {
    return parseFloat(this.meshOpacitySlider.value);
  }
}
