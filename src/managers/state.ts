import * as THREE from 'three';
import { Material } from 'three';
import { OctreeNode } from '../octree';
import { Node as SdfNode } from '../sdf_expressions/ast';
import { RendererManager } from './renderer';
import { parse as parseCAD } from '../cad/parser';
import { moduleToSDF } from '../cad/builtins';
import { parse as parseSDF } from '../sdf_expressions/parser';
import { generateShader } from '../shader';

export class StateManager {
  private currentOctree: OctreeNode | null = null;
  private currentMesh: THREE.Mesh | null = null;
  private editorContent: string = '';
  private cellCount: number = 0;
  private currentShader: string | null = null;

  constructor(
    private rendererManager: RendererManager
  ) {}

  updateEditorContent(content: string) {
    if (content !== this.editorContent) {
      this.editorContent = content;
    }
  }

  setCurrentOctree(octree: OctreeNode | null) {
    this.currentOctree = octree;
  }

  setCurrentMesh(mesh: THREE.Mesh | null) {
    if (this.currentMesh) {
      this.currentMesh.geometry.dispose();
      if (this.currentMesh.material instanceof Material) {
        this.currentMesh.material.dispose();
      } else {
        this.currentMesh.material.forEach(m => m.dispose());
      }
    }
    this.currentMesh = mesh;
    this.rendererManager.updateMesh(mesh);
  }

  setCellCount(count: number) {
    const statsPanel = document.getElementById('stats-panel');
    if (statsPanel) {
      statsPanel.textContent = `Octree cells: ${count}`;
    }
    this.cellCount = count;
  }

  parseContent(): SdfNode {
    const cadAst = parseCAD(this.editorContent);
    const sdfExpr = moduleToSDF(cadAst);
    return parseSDF(sdfExpr);
  }

  setCurrentShader(shader: string | null) {
    console.log('Setting new shader:', shader);
    this.currentShader = shader;
    if (shader) {
      this.rendererManager.updateShader(shader);
    }
  }

  updateShader(ast: SdfNode) {
    console.log('Generating new shader from AST:', ast);
    const fragmentShader = generateShader(ast);
    console.log('Generated shader code:', fragmentShader);
    this.setCurrentShader(fragmentShader);
  }

  getCurrentOctree(): OctreeNode | null {
    return this.currentOctree;
  }

  isOctreeVisible(): boolean {
    const checkbox = document.getElementById('show-octree') as HTMLInputElement;
    return checkbox?.checked ?? false;
  }

  getState() {
    return {
      currentOctree: this.currentOctree,
      currentMesh: this.currentMesh,
      editorContent: this.editorContent,
      cellCount: this.cellCount,
      currentShader: this.currentShader
    };
  }
}
