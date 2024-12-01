import * as THREE from 'three';

export function exportToSTL(mesh: THREE.Mesh): ArrayBuffer {
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const index = geometry.index;
    
    if (!index) {
        throw new Error('Geometry must be indexed');
    }
    
    const triangleCount = index.count / 3;  // Each triangle uses 3 indices
    
    
    // Binary STL format:
    // 80 bytes - Header
    // 4 bytes - Number of triangles (uint32)
    // For each triangle:
    //   12 bytes - Normal vector (3 floats)
    //   36 bytes - Vertices (9 floats)
    //   2 bytes - Attribute byte count (uint16)
    // Binary STL format size calculation:
    // 80 bytes header + 4 bytes triangle count + (12+36+2) bytes per triangle
    const HEADER_SIZE = 80;            // Header
    const COUNT_SIZE = 4;              // Uint32 count
    const NORMAL_SIZE = 12;            // 3 floats * 4 bytes
    const VERTEX_SIZE = 36;            // 9 floats * 4 bytes
    const ATTR_SIZE = 2;               // Uint16 attribute
    const TRIANGLE_SIZE = NORMAL_SIZE + VERTEX_SIZE + ATTR_SIZE;
    const bufferSize = Math.ceil(HEADER_SIZE + COUNT_SIZE + (TRIANGLE_SIZE * triangleCount));
    
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);
    
    // Write header (80 bytes)
    const encoder = new TextEncoder();
    const header = encoder.encode('Binary STL file exported from fnCAD');
    for (let i = 0; i < 80; i++) {
        view.setUint8(i, i < header.length ? header[i] : 0);
    }
    
    // Write number of triangles
    view.setUint32(80, triangleCount, true);
    
    let offset = 84;  // Start after header and triangle count
    
    for (let i = 0; i < index.count; i += 3) {
        const idx1 = index.getX(i);
        const idx2 = index.getX(i + 1);
        const idx3 = index.getX(i + 2);
        
        const v1 = new THREE.Vector3().fromBufferAttribute(position, idx1);
        const v2 = new THREE.Vector3().fromBufferAttribute(position, idx2);
        const v3 = new THREE.Vector3().fromBufferAttribute(position, idx3);
        
        // Calculate normal
        const normal = new THREE.Vector3()
            .crossVectors(
                new THREE.Vector3().subVectors(v2, v1),
                new THREE.Vector3().subVectors(v3, v1)
            )
            .normalize();
        
        // Write normal
        view.setFloat32(offset, normal.x, true); offset += 4;
        view.setFloat32(offset, normal.y, true); offset += 4;
        view.setFloat32(offset, normal.z, true); offset += 4;
        
        // Write vertices with bounds checking, scaling to millimeters
        if (offset + VERTEX_SIZE <= bufferSize) {
            view.setFloat32(offset, v1.x * 100, true); offset += 4;
            view.setFloat32(offset, v1.y * 100, true); offset += 4;
            view.setFloat32(offset, v1.z * 100, true); offset += 4;
            
            view.setFloat32(offset, v2.x * 100, true); offset += 4;
            view.setFloat32(offset, v2.y * 100, true); offset += 4;
            view.setFloat32(offset, v2.z * 100, true); offset += 4;
            
            view.setFloat32(offset, v3.x * 100, true); offset += 4;
            view.setFloat32(offset, v3.y * 100, true); offset += 4;
            view.setFloat32(offset, v3.z * 100, true); offset += 4;
        } else {
            throw new Error(`Buffer overflow at offset ${offset} while writing vertices`);
        }
        
        // Write attribute byte count (unused)
        view.setUint16(offset, 0, true); offset += 2;
    }
    
    return buffer;
}

export function downloadSTL(mesh: THREE.Mesh, filename: string = 'model.stl'): void {
    const buffer = exportToSTL(mesh);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    
    URL.revokeObjectURL(url);
}
