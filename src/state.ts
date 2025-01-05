import * as THREE from 'three';
import { parse as parseCAD } from './cad/parser';
import { moduleToSDF } from './cad/builtins';
import { parse as parseSDF } from './sdf_expressions/parser';
import { generateShader } from './shader';
import { ParseError } from './cad/errors';
import { errorDecorationFacet } from './main';
import { SerializedMesh } from './types';

export enum ViewMode {
  Preview,  // GLSL raymarching preview
  Mesh      // Triangle mesh view
}

export class AppState {
  private currentMesh: SerializedMesh | null = null;
  private editorContent: string = '';
  private currentShader: string | null = null;
  private meshGenerationInProgress = false;
  private viewMode: ViewMode = ViewMode.Preview;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private camera: THREE.PerspectiveCamera,
    private scene: THREE.Scene
  ) {}

  setViewMode(mode: ViewMode) {
    this.viewMode = mode;
    // Clear scene
    while(this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    
    // Set up scene based on mode
    if (mode === ViewMode.Preview) {
      const planeGeometry = new THREE.PlaneGeometry(2, 2);
      const planeMaterial = new THREE.ShaderMaterial({
        uniforms: {
          resolution: { value: new THREE.Vector2() },
          fov: { value: 75.0 },
          customCameraPosition: { value: new THREE.Vector3() },
          customViewMatrix: { value: new THREE.Matrix4() },
          projectionMatrix: { value: new THREE.Matrix4() }
        },
        vertexShader: `
          void main() {
            gl_Position = vec4(position, 1.0);
          }
        `,
        fragmentShader: this.currentShader || 'void main() { gl_FragColor = vec4(0.0); }'
      });
      const previewPlane = new THREE.Mesh(planeGeometry, planeMaterial);
      this.scene.add(previewPlane);
    } else if (mode === ViewMode.Mesh && this.currentMesh) {
      // Add mesh to scene
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.currentMesh.vertices, 3));
      geometry.setIndex(this.currentMesh.indices);
      const material = new THREE.MeshStandardMaterial({ color: 0x808080 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.isMeshObject = true;
      this.scene.add(mesh);
    }
  }

  getViewMode(): ViewMode {
    return this.viewMode;
  }

  updateEditorContent(content: string) {
    if (content !== this.editorContent) {
      this.editorContent = content;
      this.updateShader();
    }
  }

  private updateShader() {
    try {
      const cadAst = parseCAD(this.editorContent);
      const sdfExpr = moduleToSDF(cadAst);
      const sdfNode = parseSDF(sdfExpr);
      this.currentShader = generateShader(sdfNode);

      // Clear any existing error decorations
      if (window._editor) {
        window._editor.dispatch({
          effects: [errorDecorationFacet.of([])]
        });
      }
    } catch (err) {
      if (err instanceof ParseError && window._editor) {
        const from = window._editor.state.doc.line(err.location.start.line).from +
                    err.location.start.column - 1;
        const to = window._editor.state.doc.line(err.location.end.line).from +
                  err.location.end.column - 1;

        window._editor.dispatch({
          effects: [errorDecorationFacet.of([{
            from,
            to,
            error: err.message
          }])]
        });
      }
      throw err;
    }
  }

  getShader(): string | null {
    return this.currentShader;
  }

  setCurrentMesh(mesh: SerializedMesh | null) {
    this.currentMesh = mesh;
  }

  getCurrentMesh(): SerializedMesh | null {
    return this.currentMesh;
  }

  setMeshGenerationInProgress(inProgress: boolean) {
    this.meshGenerationInProgress = inProgress;
  }

  isMeshGenerationInProgress(): boolean {
    return this.meshGenerationInProgress;
  }

  getEditorContent(): string {
    return this.editorContent;
  }
}
