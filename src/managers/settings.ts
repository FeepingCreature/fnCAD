import { OctreeRenderSettings } from '../octreevis';

export class SettingsManager {
  private settingsPanel!: HTMLElement;
  private showOctreeCheckbox!: HTMLInputElement;
  private showOutsideCheckbox!: HTMLInputElement;
  private showInsideCheckbox!: HTMLInputElement;
  private showBoundaryCheckbox!: HTMLInputElement;
  private minSizeSlider!: HTMLInputElement;
  private cellBudgetSlider!: HTMLInputElement;
  private minRenderSizeSlider!: HTMLInputElement;
  private optimizeMeshCheckbox!: HTMLInputElement;

  constructor(
    private previewPane: HTMLElement,
    private onSettingsChange: () => void
  ) {
    this.createSettingsPanel();
    this.setupEventListeners();
  }

  private createSettingsPanel() {
    this.settingsPanel = document.createElement('div');
    this.settingsPanel.id = 'settings-panel';
    this.settingsPanel.innerHTML = `
      <h3>Settings</h3>
      <div class="settings-content">
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
            <input type="range" id="min-size" min="0" max="6" step="1" value="0">
            <span class="value-display">1</span>
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
            <input type="range" id="min-render-size" min="0" max="6" step="1" value="0">
            <span class="value-display">1</span>
          </div>
        </div>
        <div class="setting-row">
          <input type="checkbox" id="optimize-mesh" checked>
          <label for="optimize-mesh">Optimize Mesh</label>
        </div>
        <div class="setting-row">
          <button id="generate-mesh">Generate Mesh</button>
        </div>
      </div>
    `;
    this.previewPane.appendChild(this.settingsPanel);

    // Get references to inputs
    this.showOctreeCheckbox = document.getElementById('show-octree') as HTMLInputElement;
    this.showOutsideCheckbox = document.getElementById('show-outside') as HTMLInputElement;
    this.showInsideCheckbox = document.getElementById('show-inside') as HTMLInputElement;
    this.showBoundaryCheckbox = document.getElementById('show-boundary') as HTMLInputElement;
    this.minSizeSlider = document.getElementById('min-size') as HTMLInputElement;
    this.cellBudgetSlider = document.getElementById('cell-budget') as HTMLInputElement;
    this.minRenderSizeSlider = document.getElementById('min-render-size') as HTMLInputElement;
    this.optimizeMeshCheckbox = document.getElementById('optimize-mesh') as HTMLInputElement;

    // Add settings panel collapse behavior
    const settingsHeader = this.settingsPanel.querySelector('h3')!;
    settingsHeader.addEventListener('click', () => {
      this.settingsPanel.classList.toggle('collapsed');
    });
  }

  private setupEventListeners() {
    [
      this.showOctreeCheckbox,
      this.showOutsideCheckbox,
      this.showInsideCheckbox,
      this.showBoundaryCheckbox
    ].forEach(checkbox => {
      checkbox.addEventListener('change', this.onSettingsChange);
    });

    this.minSizeSlider.addEventListener('input', () => {
      const power = parseInt(this.minSizeSlider.value);
      const value = Math.pow(2, power);
      const display = this.minSizeSlider.nextElementSibling as HTMLSpanElement;
      display.textContent = value === 1 ? '1' : `1/${value}`;
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

  isMeshOptimizationEnabled(): boolean {
    return this.optimizeMeshCheckbox.checked;
  }
}
