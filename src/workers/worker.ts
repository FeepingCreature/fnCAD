import * as THREE from 'three';
import { WorkerMessage, WorkerTask, TaskProgress } from './messages';
import { OctreeNode, CellState, subdivideOctree } from '../octree';
import { parse as parseCAD } from '../cad/parser';
import { moduleToSDF } from '../cad/builtins';
import { OctreeTask, MeshTask } from '../types';
import { MeshGenerator } from '../meshgen';
import { parse as parseSDF } from '../sdf_expressions/parser';

// Store active tasks
const activeTasks = new Map<string, TaskProgress>();

// Handle incoming messages
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, taskId, data } = e.data;

  switch (type) {
    case 'start':
      try {
        const task = data as WorkerTask;
        await processTask(taskId, task);
      } catch (err) {
        sendError(taskId, err instanceof Error ? err.message : 'Unknown error');
      }
      break;
  }
};

async function processTask(taskId: string, task: WorkerTask) {
  // Initialize task progress
  const progress: TaskProgress = {
    taskId,
    type: task.type,
    progress: 0,
    status: 'running',
  };
  activeTasks.set(taskId, progress);

  // Send initial progress update
  self.postMessage({
    type: 'progress',
    taskId,
    progress: 0,
    status: 'running',
  });

  try {
    switch (task.type) {
      case 'octree':
        await processOctreeTask(taskId, task);
        break;
      case 'mesh':
        await processMeshTask(taskId, task);
        break;
    }
  } catch (err) {
    sendError(taskId, err instanceof Error ? err.message : 'Unknown error');
  }
}

async function processOctreeTask(taskId: string, task: OctreeTask) {
  try {
    // Parse CAD code into SDF expression
    const cadAst = parseCAD(task.source);
    const sdfExpr = moduleToSDF(cadAst);
    const sdf = parseSDF(sdfExpr);

    const octree = new OctreeNode(CellState.Boundary);

    // Track subdivision progress
    let totalCells = 0;
    const onProgress = (cells: number) => {
      totalCells = cells;
      const progress = Math.min(totalCells / task.cellBudget, 0.99);
      updateProgress(taskId, progress);
    };

    // Subdivide with progress tracking
    subdivideOctree(
      octree,
      sdf,
      new THREE.Vector3(0, 0, 0),
      65536,
      task.minSize,
      task.cellBudget,
      onProgress
    );

    // Ensure we send a proper OctreeNode instance with all required data
    const serializeNode = (node: OctreeNode): any => {
      return {
        state: Array.isArray(node.state) ? node.state.map(serializeNode) : node.state,
        octant: node.octant,
      };
    };

    const serializedOctree = serializeNode(octree);

    const result = {
      result: serializedOctree,
      cellCount: totalCells,
    };
    sendComplete(taskId, result);
  } catch (err) {
    sendError(taskId, err instanceof Error ? err.message : 'Unknown error');
  }
}

async function processMeshTask(taskId: string, task: MeshTask) {
  try {
    // Reconstruct OctreeNode with proper prototype chain
    const reconstructOctree = (data: any, parent: OctreeNode | null = null): OctreeNode => {
      if (!data) {
        throw new Error('Cannot reconstruct null octree data');
      }

      // TODO refactor out together with `OctreeManager.updateOctree`.
      var state = data.state;
      if (Array.isArray(data.state)) {
        state = CellState.Boundary; // prep
      }

      const node = new OctreeNode(state, parent, data.octant);

      if (Array.isArray(data.state)) {
        node.state = data.state.map((child: any) => reconstructOctree(child, node));
      }

      return node;
    };

    const octree = reconstructOctree(task.octree);

    // Parse SDF from source
    const cadAst = parseCAD(task.source);
    const sdfExpr = moduleToSDF(cadAst);
    const sdf = parseSDF(sdfExpr);

    const meshGen = new MeshGenerator(octree, sdf, task.optimize);

    // Add progress tracking to mesh generation
    meshGen.onProgress = (progress: number) => {
      updateProgress(taskId, progress);
    };

    const serializedMesh = meshGen.generate(task.minSize);
    sendComplete(taskId, { result: serializedMesh });
  } catch (err) {
    sendError(taskId, err instanceof Error ? err.message : 'Unknown error');
  }
}

function updateProgress(taskId: string, progress: number) {
  const task = activeTasks.get(taskId);
  if (task) {
    task.progress = progress;
    self.postMessage({
      type: 'progress',
      taskId,
      progress,
    });
  } else {
  }
}

function sendComplete(taskId: string, data: any) {
  const task = activeTasks.get(taskId);
  if (task) {
    task.status = 'completed';
    task.progress = 1;
    self.postMessage({
      type: 'complete',
      taskId,
      data,
    });
    activeTasks.delete(taskId);
  }
}

function sendError(taskId: string, error: string) {
  const task = activeTasks.get(taskId);
  if (task) {
    task.status = 'failed';
    task.error = error;
    self.postMessage({
      type: 'error',
      taskId,
      error,
    });
    activeTasks.delete(taskId);
  }
}
