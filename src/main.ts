import Split from 'split.js';
import { getRuntimeBasePath } from './utils/runtime-base';
import { downloadSTL } from './stlexporter';
import { indentWithTab } from '@codemirror/commands';
import {
  EditorView,
  keymap,
  ViewUpdate,
  Decoration,
  DecorationSet,
  WidgetType,
} from '@codemirror/view';
import { EditorState, StateEffect, StateField, Compartment } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { solarizedDark, solarizedLight } from '@uiw/codemirror-theme-solarized';
import { javascript } from '@codemirror/lang-javascript';
import { Parser } from './cad/parser';
import { ParseError } from './cad/errors';
import { getModuleDoc } from './cad/docs';
import { basicSetup } from 'codemirror';
import * as THREE from 'three';
import { AppState, ViewMode } from './state';

// Import the default theme first to prevent flash of wrong theme
import './assets/themes/dark.css';
// Import other CSS themes to ensure they're bundled
import './assets/themes/common.css';
import './assets/themes/blue.css';
import './assets/themes/high-contrast.css';
import './assets/themes/solarized-light.css';

// Import the theme URLs for dynamic loading
import darkThemeUrl from './assets/themes/dark.css?url';
import blueThemeUrl from './assets/themes/blue.css?url';
import highContrastThemeUrl from './assets/themes/high-contrast.css?url';
import solarizedLightThemeUrl from './assets/themes/solarized-light.css?url';

// Function to reveal content when CSS is loaded
function revealContent() {
  document.documentElement.style.visibility = 'visible';
  document.body.style.visibility = 'visible';
  const loader = document.getElementById('css-loader');
  if (loader) {
    loader.style.display = 'none';
  }
}

// Wait for the DOM and initial CSS to be loaded
window.addEventListener('DOMContentLoaded', () => {
  // Small delay to ensure CSS is processed
  setTimeout(revealContent, 50);
});

// Add dynamic styles for mesh progress
const style = document.createElement('style');
style.textContent = `
  .mesh-progress {
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-family: monospace;
    z-index: 1000;
  }
`;
document.head.appendChild(style);

// Error decoration setup
interface ErrorDecoration {
  from: number;
  to: number;
  error: string;
}

export const errorDecorationFacet = StateEffect.define<ErrorDecoration[]>();
export const callHighlightEffect = StateEffect.define<{ from: number; to: number } | null>();

const callHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(callHighlightEffect)) {
        if (effect.value === null) {
          decorations = Decoration.none;
        } else {
          decorations = Decoration.set([
            Decoration.mark({
              class: 'cm-active-call',
            }).range(effect.value.from, effect.value.to),
          ]);
        }
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// Create help popup element
const helpPopup = document.createElement('div');
helpPopup.className = 'parameter-help';
document.querySelector('#editor-pane')?.appendChild(helpPopup);

// Function to update help popup
function updateHelpPopup(view: EditorView) {
  const pos = view.state.selection.main.head;
  if (!pos) {
    helpPopup.style.display = 'none';
    return;
  }

  // Find module call at current position
  const parser = new Parser(view.state.doc.toString());
  try {
    parser.parse();
  } catch (e) {
    // Only swallow ParseErrors, rethrow everything else
    if (!(e instanceof ParseError)) {
      throw e;
    }
    // Continue with partial locations if parsing fails
  }
  const locations = parser.getLocations();

  // Show help for any call where we're in the parameter list
  for (const call of locations) {
    if (pos >= call.paramRange.start.offset && pos <= call.paramRange.end.offset) {
      // Get documentation
      const doc = getModuleDoc(call.moduleName);

      // Find current parameter
      let currentParamIndex = -1;
      for (let i = 0; i < call.parameters.length; i++) {
        const param = call.parameters[i];
        if (pos >= param.range.start.offset && pos <= param.range.end.offset) {
          currentParamIndex = i;
          break;
        }
      }

      // Build help content
      let content = `<strong>${call.moduleName}</strong>(`;
      if (doc) {
        content += doc.parameters
          .map((p, i) => {
            const className = i === currentParamIndex ? 'current' : '';
            const param = call.parameters[i];
            const value = param?.value ? ` = ${param.value}` : '';
            return `<span class="${className}">${p.name}: ${p.type}${value}</span>`;
          })
          .join(', ');
        content += ')<br/>';
        content += `<small>${doc.description}</small>`;

        if (currentParamIndex >= 0 && currentParamIndex < doc.parameters.length) {
          content += `<br/><small>${doc.parameters[currentParamIndex].description}</small>`;
        }
      } else {
        content +=
          call.parameters
            .map((p, i) => {
              const className = i === currentParamIndex ? 'current' : '';
              const value = p.value ? ` = ${p.value}` : '';
              return `<span class="${className}">${p.name || `arg${i}`}${value}</span>`;
            })
            .join(', ') + ')';
      }

      helpPopup.innerHTML = content;

      // Build parameter descriptions
      let paramDescriptions = '';
      if (doc) {
        doc.parameters.forEach((p, i) => {
          const isCurrent = i === currentParamIndex;
          paramDescriptions += `<div class="param-desc ${isCurrent ? 'current' : ''}">
            ${isCurrent ? '<strong>' : ''}${p.name}: ${p.description}${isCurrent ? '</strong>' : ''}
          </div>`;
        });
      }

      // Update content
      helpPopup.innerHTML = `
        <strong>${call.moduleName}</strong>(${
          doc?.parameters
            .map((p, i) => {
              const param = call.parameters[i];
              const value = param?.value ? ` = ${param.value}` : '';
              return `<span class="${i === currentParamIndex ? 'current' : ''}">${p.name}: ${p.type}${value}</span>`;
            })
            .join(', ') || ''
        })
        ${paramDescriptions}
      `;

      // Position below current line
      const line = view.lineBlockAt(pos);
      const lineRect = view.coordsAtPos(line.from)!;

      helpPopup.style.display = 'block';
      helpPopup.style.top = `${lineRect.bottom + window.scrollY}px`;
      helpPopup.style.left = `${lineRect.left + window.scrollX}px`;
      helpPopup.classList.add('visible');

      // Update call highlighting
      view.dispatch({
        effects: callHighlightEffect.of({
          from: call.fullRange.start.offset,
          to: call.fullRange.end.offset,
        }),
      });
      return;
    }
  }

  helpPopup.style.display = 'none';
  helpPopup.classList.remove('visible');

  // Clear call highlighting
  view.dispatch({
    effects: callHighlightEffect.of(null),
  });
}

const errorDecorationField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);

    // Log current decorations before applying effects
    // Log current decorations in a more readable format
    for (const effect of tr.effects) {
      if (effect.is(errorDecorationFacet)) {
        // Log the decorations we're about to create
        const newDecorations = effect.value.flatMap((error) => [
          Decoration.widget({
            widget: new (class extends WidgetType {
              toDOM() {
                const span = document.createElement('span');
                span.className = 'error-message';
                span.textContent = '⚠️ ' + error.error.split('at line')[0].trim();
                // Always position at the end of the first line containing the error
                requestAnimationFrame(() => {
                  const firstErrorLine = window._editor?.state.doc.lineAt(error.from);
                  if (!firstErrorLine) return;

                  // Create measuring element for the first line only
                  const measureSpan = document.createElement('span');
                  measureSpan.style.visibility = 'hidden';
                  measureSpan.style.position = 'absolute';
                  measureSpan.style.whiteSpace = 'pre';
                  const anyLine = document.querySelector('.cm-line');
                  if (!anyLine) return;
                  measureSpan.style.font = window.getComputedStyle(anyLine).font;
                  measureSpan.textContent = firstErrorLine.text;
                  document.body.appendChild(measureSpan);

                  const textWidth = measureSpan.getBoundingClientRect().width;
                  document.body.removeChild(measureSpan);

                  const editor = document.querySelector('.cm-editor');
                  if (editor) {
                    const editorLeft = editor.getBoundingClientRect().left;
                    const leftPos = textWidth + 40 - editorLeft;
                    span.style.left = `${leftPos}px`;
                    // Position vertically at the first error line
                    const lineElement = editor.querySelector(
                      `[data-line="${firstErrorLine.number}"]`
                    );
                    if (lineElement) {
                      const lineRect = lineElement.getBoundingClientRect();
                      span.style.top = `${lineRect.top}px`;
                    }
                  }
                });

                return span;
              }
            })(),
            side: 1,
          }).range(error.from, error.from),
          Decoration.mark({
            attributes: {
              'data-error': 'true',
              title: error.error,
            },
            class: 'cm-error-mark',
          }).range(error.from, error.to),
        ]);

        decorations = Decoration.set(newDecorations);
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// Set runtime base path for assets
getRuntimeBasePath(); // Initialize runtime base path

// Initialize split panes with localStorage persistence
const savedSizes = localStorage.getItem('split-sizes');

Split(['#editor-pane', '#preview-pane'], {
  sizes: savedSizes ? JSON.parse(savedSizes) : [50, 50],
  minSize: [300, 300],
  gutterSize: 8,
  onDrag: function () {
    // Trigger resize for the renderer to update during dragging
    window.dispatchEvent(new Event('resize'));
  },
  onDragEnd: function (sizes) {
    // Save sizes to localStorage
    localStorage.setItem('split-sizes', JSON.stringify(sizes));

    // Trigger resize for the renderer to update
    window.dispatchEvent(new Event('resize'));
  },
});

// Initialize camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

// Add resize event listener to handle split view changes
window.addEventListener('resize', () => {
  appState.handleResize();
});

// Add rainbow mode setting
const RAINBOW_MODE_KEY = 'fncad-rainbow-mode';
let rainbowMode = localStorage.getItem(RAINBOW_MODE_KEY) !== 'false'; // Default to true

// Function to update rainbow mode
function updateRainbowMode(enabled: boolean) {
  rainbowMode = enabled;
  localStorage.setItem(RAINBOW_MODE_KEY, enabled.toString());
  // Update UI
  const menuItem = document.getElementById('view-rainbow-mode');
  if (menuItem) {
    menuItem.classList.toggle('active', enabled);
  }
  // Always refresh the shader when the rainbow mode changes
  appState.refreshPreview();
}

// Save state when window is closing
window.addEventListener('beforeunload', () => {
  appState.saveDocumentsToLocalStorage();
});

// Create theme compartment to isolate theme changes
const themeCompartment = new Compartment();

// Theme switching functionality
const THEME_STORAGE_KEY = 'fncad-theme';
let currentTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';

// Map application themes to editor themes
const editorThemes = {
  dark: oneDark,
  'solarized-light': solarizedLight,
  blue: solarizedDark,
  'high-contrast': oneDark, // Fallback to oneDark for high-contrast
};

// Function to load and apply a theme
function applyTheme(theme: string) {
  // Update active class in the menu
  document.querySelectorAll('.theme-option').forEach((el) => {
    el.classList.remove('active');
  });
  const activeThemeOption = document.getElementById(`theme-${theme}`);
  if (activeThemeOption) {
    activeThemeOption.classList.add('active');
  }

  // Dynamically load the theme CSS file if not already loaded
  let themeLink = document.getElementById('theme-style') as HTMLLinkElement;
  if (!themeLink) {
    themeLink = document.createElement('link');
    themeLink.id = 'theme-style';
    themeLink.rel = 'stylesheet';
    document.head.appendChild(themeLink);
  }

  // Use imported URLs for dynamic loading
  const themeUrls = {
    dark: darkThemeUrl,
    blue: blueThemeUrl,
    'high-contrast': highContrastThemeUrl,
    'solarized-light': solarizedLightThemeUrl,
  };

  themeLink.href = themeUrls[theme as keyof typeof themeUrls] || themeUrls['dark'];
  currentTheme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);

  // Update the editor theme if it exists
  if (window._editor) {
    const editorTheme = editorThemes[theme as keyof typeof editorThemes];
    if (editorTheme) {
      // Apply the new theme only to the theme compartment
      window._editor.dispatch({
        effects: themeCompartment.reconfigure(editorTheme),
      });
    }
  }
}

// Apply the saved theme or default to dark
applyTheme(currentTheme);

// Add event listeners for theme switching
document.getElementById('theme-dark')?.addEventListener('click', (e) => {
  e.preventDefault();
  applyTheme('dark');
});

document.getElementById('theme-solarized-light')?.addEventListener('click', (e) => {
  e.preventDefault();
  applyTheme('solarized-light');
});

document.getElementById('theme-blue')?.addEventListener('click', (e) => {
  e.preventDefault();
  applyTheme('blue');
});

document.getElementById('theme-high-contrast')?.addEventListener('click', (e) => {
  e.preventDefault();
  applyTheme('high-contrast');
});

// Add fullscreen toggle functionality
document.getElementById('toggle-fullscreen')?.addEventListener('click', (e) => {
  e.preventDefault();
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.error(`Error attempting to enable fullscreen: ${err.message}`);
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
});

import { examples } from './examples';

// Initialize app state
const appState = new AppState(camera);

// Initial tab update
updateTabs();

// Initialize examples menu
const examplesDropdown = document.getElementById('examples-dropdown') as HTMLElement;
examples.forEach((example, index) => {
  const exampleLink = document.createElement('a');
  exampleLink.href = '#';
  exampleLink.textContent = example.name;
  exampleLink.dataset.index = index.toString();
  exampleLink.addEventListener('click', (e) => {
    e.preventDefault();
    loadExample(index);
    // Hide examples dropdown after selection
    examplesDropdown.style.display = 'none';
    setTimeout(() => {
      examplesDropdown.style.display = '';
    }, 300);
  });
  examplesDropdown.appendChild(exampleLink);
});

// Variables for hover delay
let examplesMenuTimeout: number | null = null;
const MENU_CLOSE_DELAY = 500; // 500ms delay before closing

// Make examples menu also respond to click (not just hover)
document.querySelector('.examples-menu-trigger')?.addEventListener('click', (e) => {
  e.preventDefault();
  const dropdown = document.getElementById('examples-dropdown');
  if (dropdown) {
    if (dropdown.style.display === 'block') {
      dropdown.style.display = 'none';
      dropdown.classList.remove('active');
    } else {
      // Position the dropdown correctly
      const trigger = e.currentTarget as HTMLElement;
      const rect = trigger.getBoundingClientRect();
      dropdown.style.top = `${rect.top}px`;
      dropdown.style.left = `${rect.right + 5}px`;
      dropdown.style.display = 'block';
      dropdown.classList.add('active');
    }
  }
});

// Position examples dropdown on mouseover
document.querySelector('.examples-menu-trigger')?.addEventListener('mouseover', (e) => {
  // Clear any existing timeout to close the menu
  if (examplesMenuTimeout) {
    window.clearTimeout(examplesMenuTimeout);
    examplesMenuTimeout = null;
  }

  const dropdown = document.getElementById('examples-dropdown');
  if (dropdown) {
    const trigger = e.currentTarget as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    dropdown.style.top = `${rect.top}px`;
    dropdown.style.left = `${rect.right + 5}px`;
    dropdown.style.display = 'block';
    dropdown.classList.add('active');
  }
});

// Handle mouseout with delay
document.querySelector('.examples-menu-trigger')?.addEventListener('mouseout', () => {
  const dropdown = document.getElementById('examples-dropdown');
  if (dropdown && !dropdown.matches(':hover')) {
    // Set a timeout to close the menu
    examplesMenuTimeout = window.setTimeout(() => {
      if (!dropdown.matches(':hover')) {
        dropdown.style.display = 'none';
        dropdown.classList.remove('active');
      }
    }, MENU_CLOSE_DELAY);
  }
});

// Keep menu open when hovering over the dropdown itself
document.getElementById('examples-dropdown')?.addEventListener('mouseleave', () => {
  const dropdown = document.getElementById('examples-dropdown');
  if (dropdown) {
    // Set a timeout to close the menu
    examplesMenuTimeout = window.setTimeout(() => {
      dropdown.style.display = 'none';
      dropdown.classList.remove('active');
    }, MENU_CLOSE_DELAY);
  }
});

// Cancel close if we move back to the dropdown
document.getElementById('examples-dropdown')?.addEventListener('mouseenter', () => {
  if (examplesMenuTimeout) {
    window.clearTimeout(examplesMenuTimeout);
    examplesMenuTimeout = null;
  }
});

function loadExample(index: number) {
  const example = examples[index];
  if (example) {
    const id = appState.createNewDocument(); // This will create a document with default camera
    appState.setActiveDocument(id);
    appState.renameDocument(id, example.name);
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: example.content,
      },
    });
    updateTabs();

    // Reset camera to default position for the example
    appState.resetCameraPosition();
  }
}

// Create tab bar elements
function createTabElement(doc: { id: string; name: string }, isActive: boolean): HTMLDivElement {
  const tab = document.createElement('div');
  tab.className = `tab${isActive ? ' active' : ''}`;
  tab.dataset.docId = doc.id;

  const title = document.createElement('div');
  title.className = 'tab-title';
  title.textContent = doc.name;
  title.addEventListener('click', (e) => {
    if (e.detail === 2) {
      // Double click
      e.stopPropagation();
      title.contentEditable = 'true';
      title.focus();
    }
  });
  title.addEventListener('blur', () => {
    title.contentEditable = 'false';
    appState.renameDocument(doc.id, title.textContent || doc.name);
  });
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      title.blur();
    }
  });

  const close = document.createElement('div');
  close.className = 'tab-close';
  close.textContent = '×';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    if (appState.getDocuments().length > 1) {
      appState.removeDocument(doc.id);
      updateTabs();
    }
  });

  tab.appendChild(title);
  tab.appendChild(close);
  tab.addEventListener('click', () => {
    appState.setActiveDocument(doc.id);
    updateTabs();
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: appState.getActiveDocument().content,
      },
    });
    appState.setViewMode(ViewMode.Preview);
  });

  return tab;
}

function updateTabs() {
  const tabContainer = document.querySelector('.tab-container')!;
  const newTabButton = tabContainer.querySelector('.new-tab-button')!;

  // Remove all tabs but keep the new tab button
  Array.from(tabContainer.children).forEach((child) => {
    if (!child.classList.contains('new-tab-button')) {
      child.remove();
    }
  });

  // Add tabs for all documents
  const docs = appState.getDocuments();
  const activeDoc = appState.getActiveDocument();
  docs.forEach((doc) => {
    const tab = createTabElement(doc, doc.id === activeDoc.id);
    tabContainer.insertBefore(tab, newTabButton);
  });
}

// Add new tab button handler
document.querySelector('.new-tab-button')?.addEventListener('click', () => {
  const id = appState.createNewDocument();
  appState.setActiveDocument(id);
  updateTabs();
  editor.dispatch({
    changes: {
      from: 0,
      to: editor.state.doc.length,
      insert: appState.getActiveDocument().content,
    },
  });
  appState.setViewMode(ViewMode.Preview);
});

// Initialize CodeMirror editor
const editor = new EditorView({
  state: EditorState.create({
    doc: appState.getActiveDocument().content,
    extensions: [
      basicSetup,
      keymap.of([indentWithTab]),
      javascript(),
      EditorView.updateListener.of(async (update: ViewUpdate) => {
        if (update.docChanged) {
          const content = update.state.doc.toString();
          appState.updateEditorContent(content);
        }
      }),
      themeCompartment.of(editorThemes[currentTheme as keyof typeof editorThemes] || oneDark),
      errorDecorationField,
      callHighlightField,
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged || update.selectionSet) {
          updateHelpPopup(update.view);
        }
      }),
      EditorView.theme({
        '&': {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0 /* Important for nested flex! */,
          overflow: 'hidden',
        },
        '.cm-scroller': {
          overflow: 'auto',
          flex: 1,
          minHeight: 0 /* Important for nested flex! */,
        },
        '.cm-content': {
          minHeight: '100%',
        },
        '.cm-gutters': { backgroundColor: 'transparent' },
        '.cm-lineNumbers': { color: '#666' },
      }),
    ],
  }),
  parent: document.getElementById('editor-pane')!,
});

// Store editor instance for later use
window._editor = editor;

// Add keyboard handlers
document.addEventListener('keydown', (event) => {
  if (event.key === '5' && event.ctrlKey) {
    event.preventDefault();
    appState.setViewMode(ViewMode.Mesh);
    regenerateMesh(false); // Normal detail
  } else if (event.key === '6' && event.ctrlKey) {
    event.preventDefault();
    appState.setViewMode(ViewMode.Mesh);
    regenerateMesh(true); // High detail
  } else if (event.key === 'Escape') {
    appState.setViewMode(ViewMode.Preview);
    appState.cancelCurrentOperation();
  }
});

function regenerateMesh(highDetail: boolean = false) {
  appState.generateMesh(highDetail);
}

// Add menu handlers
document.getElementById('export-stl')?.addEventListener('click', (e) => {
  e.preventDefault();
  const currentMesh = appState.getCurrentMesh();
  if (currentMesh) {
    const activeDoc = appState.getActiveDocument();
    downloadSTL(currentMesh, `${activeDoc.name}.stl`);
  } else {
    alert('Please generate a mesh first');
  }
});

document.getElementById('new-document')?.addEventListener('click', (e) => {
  e.preventDefault();
  const id = appState.createNewDocument();
  appState.setActiveDocument(id);
  updateTabs();
  editor.dispatch({
    changes: {
      from: 0,
      to: editor.state.doc.length,
      insert: appState.getActiveDocument().content,
    },
  });
  appState.setViewMode(ViewMode.Preview);
});

document.getElementById('view-preview')?.addEventListener('click', (e) => {
  e.preventDefault();
  appState.setViewMode(ViewMode.Preview);
  appState.cancelCurrentOperation();
});

document.getElementById('view-mesh')?.addEventListener('click', (e) => {
  e.preventDefault();
  appState.setViewMode(ViewMode.Mesh);
  regenerateMesh(false);
});

document.getElementById('view-mesh-hd')?.addEventListener('click', (e) => {
  e.preventDefault();
  appState.setViewMode(ViewMode.Mesh);
  regenerateMesh(true);
});

// Add rainbow mode toggle handler
document.getElementById('view-rainbow-mode')?.addEventListener('click', (e) => {
  e.preventDefault();
  updateRainbowMode(!rainbowMode);
});

// Initialize rainbow mode UI on load
document.addEventListener('DOMContentLoaded', () => {
  const rainbowModeMenuItem = document.getElementById('view-rainbow-mode');
  if (rainbowModeMenuItem) {
    rainbowModeMenuItem.classList.toggle('active', rainbowMode);
  }
});

// Stub event listeners for import/export features that will be implemented later
[
  'export-pastebin',
  'export-gdrive',
  'import-file',
  'import-pastebin',
  'import-gdrive',
  'import-url',
].forEach((id) => {
  document.getElementById(id)?.addEventListener('click', (e) => {
    e.preventDefault();
    alert('This feature is coming soon!');
  });
});
