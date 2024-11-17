import './style.css'
import Split from 'split.js'
import * as monaco from 'monaco-editor'
import * as THREE from 'three'
import { OctreeNode } from './octree'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { parse } from './parser'
import { generateShader } from './shader'

// Initialize split panes
Split(['#editor-pane', '#preview-pane'], {
  sizes: [50, 50],
  minSize: [300, 300],
  gutterSize: 8,
})

// Initialize Monaco editor
const editor = monaco.editor.create(document.getElementById('editor-pane')!, {
  // Store editor instance for later use with shader compilation
  value: `// Scene with two spheres and a floor
min(
  // Floor plane
  y + 1.0,
  min(
    // Sphere at origin
    sqrt(x * x + y * y + z * z) - 1.0,
    // Sphere offset on x-axis
    sqrt((x - 2.0) * (x - 2.0) + y * y + z * z) - 0.7
  )
)`,
  language: 'typescript',
  theme: 'vs-dark',
  minimap: { enabled: false },
  automaticLayout: true,
});

// Store editor instance for later use with shader compilation
window._editor = editor;

// Set up Three.js scene
const scene = new THREE.Scene();
let currentOctree: OctreeNode | null = null;
// Add coordinate axes helper
const axesHelper = new THREE.AxesHelper(2);
scene.add(axesHelper);
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
// Set up camera for proper orbit viewing
camera.position.set(3, 2, 3);
camera.up.set(0, 1, 0);  // Ensure up vector is aligned with Y axis
camera.lookAt(0, 0, 0);

const previewPane = document.getElementById('preview-pane')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(previewPane.clientWidth, previewPane.clientHeight);
previewPane.innerHTML = '';
previewPane.appendChild(renderer.domElement);

// Add orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
// Configure orbit controls
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.minDistance = 1;
controls.maxDistance = 10;
controls.target.set(0, 0, 0);
controls.enablePan = false;     // Disable panning to force orbiting behavior
controls.update();

// Temporarily comment out raymarching quad
// const geometry = new THREE.PlaneGeometry(2, 2);
// let material = new THREE.ShaderMaterial({
//   uniforms: {
//     resolution: { value: new THREE.Vector2(previewPane.clientWidth, previewPane.clientHeight) },
//     customViewMatrix: { value: camera.matrixWorldInverse },
//     customCameraPosition: { value: camera.position }
//   },
//   fragmentShader: generateShader(parse(editor.getValue())),
//   vertexShader: `
//     void main() {
//       gl_Position = vec4(position, 1.0);
//     }
//   `
// });
// const quad = new THREE.Mesh(geometry, material);
// scene.add(quad);

// Add initial octree visualization
const initialAst = parse(editor.getValue());
currentOctree = new OctreeNode(new THREE.Vector3(0, 0, 0), 4, initialAst);
currentOctree.subdivide(0.1);
currentOctree.addToScene(scene);

// Update shader when editor content changes
editor.onDidChangeModelContent(() => {
  try {
    const editorContent = editor.getValue();
    const ast = parse(editorContent);
    const fragmentShader = generateShader(ast);
    console.log('Generated GLSL:', fragmentShader);

    // Update octree visualization
    if (currentOctree) {
      currentOctree.removeFromScene(scene);
    }
    currentOctree = new OctreeNode(new THREE.Vector3(0, 0, 0), 4, ast);
    currentOctree.subdivide(0.1);
    currentOctree.addToScene(scene);
    // Temporarily comment out material update
    // material = new THREE.ShaderMaterial({
    //   uniforms: {
    //     resolution: { value: new THREE.Vector2(previewPane.clientWidth, previewPane.clientHeight) },
    //     customViewMatrix: { value: camera.matrixWorldInverse },
    //     customCameraPosition: { value: camera.position }
    //   },
    //   fragmentShader,
    //   vertexShader: material.vertexShader
    // });
    // quad.material = material;
  } catch (e) {
    if (e instanceof Error) {
      // Check if it's a shader compilation error vs other errors
      if (e.message.includes('WebGLShader')) {
        console.error('WebGL shader compilation failed:', e);
      } else {
        console.error('SDF evaluation error:', e);
      }
    } else {
      console.error('Unknown error:', e);
    }
  }
});

// Handle window resize
window.addEventListener('resize', () => {
  const width = previewPane.clientWidth;
  const height = previewPane.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});


// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  
  // Temporarily comment out uniform updates
  // material.uniforms.customViewMatrix.value.copy(camera.matrixWorldInverse);
  // material.uniforms.customCameraPosition.value.copy(camera.position);
  renderer.render(scene, camera);
}
animate();
