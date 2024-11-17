import { Node } from './ast';

export function generateShader(ast: Node): string {
  return `
    uniform vec2 resolution;
    uniform mat4 customViewMatrix;
    uniform vec3 customCameraPosition;
    uniform float fov;
    uniform sampler2D octreeBuffer;
    uniform sampler2D octreeDepth;

    float sqr(float x) {
      return x * x;
    }

    float scene(vec3 pos) {
      return ${ast.toGLSL()};
    }

    vec3 calcNormal(vec3 p) {
      const float h = 0.0001;
      const vec2 k = vec2(1,-1);
      return normalize(
        k.xyy * scene(p + k.xyy*h) +
        k.yyx * scene(p + k.yyx*h) +
        k.yxy * scene(p + k.yxy*h) +
        k.xxx * scene(p + k.xxx*h)
      );
    }

    vec3 getRayDirection(vec2 uv, vec3 camPos, mat4 viewMatrix) {
      // Convert UV to NDC space (-1 to 1)
      vec2 ndc = (uv * 2.0 - 1.0);
      
      // Calculate ray direction in view space using FOV
      float halfFovRad = radians(fov) * 0.5;
      float aspect = resolution.x / resolution.y;
      vec3 rayView = vec3(
        ndc.x * aspect * tan(halfFovRad),
        ndc.y * tan(halfFovRad),
        -1.0
      );
      
      // Transform ray to world space
      mat3 viewToWorld = mat3(inverse(viewMatrix));
      return viewToWorld * rayView;
    }

    void main() {
      // Convert pixel coordinates to normalized device coordinates (-1 to +1)
      vec2 ndc = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
      vec2 uv = gl_FragCoord.xy / resolution.xy;

      // Ray origin is the camera position
      vec3 ro = customCameraPosition;

      // Get ray direction using our helper function
      vec3 rd = getRayDirection(gl_FragCoord.xy / resolution.xy, ro, customViewMatrix);

      // Background visualization based on ray direction
      vec3 background = normalize(rd) * 0.5 + 0.5; // Map from [-1,1] to [0,1]
      background *= background; // Make colors more vibrant

      // Raymarching
      float t = 0.0;
      float tmax = 20.0;

      // Sample octree at current position
      vec4 octreeData = texture2D(octreeBuffer, uv);

      for(int i = 0; i < 100; i++) {
        vec3 p = ro + rd * t;

        float d = scene(p);

        // Hit check
        if(d < 0.001) {
          // Calculate normal
          vec3 n = calcNormal(p);
          // Enhanced lighting with ambient
          float diff = max(dot(n, normalize(vec3(1,1,1))), 0.0);
          vec3 col = vec3(0.2 + 0.8 * diff); // Add some ambient light

          // Convert hit point to view space
          vec4 clipPos = customViewMatrix * vec4(ro + rd * t, 1.0);
          float viewSpaceDepth = -clipPos.z; // View space depth is negative of z in view space
          
          // Get depth from octree depth buffer [0,1] where 0 is near plane, 1 is far plane
          float octreeDepthValue = texture2D(octreeDepth, uv).r;
          
          // Convert octree depth from [0,1] to view space using perspective projection formula
          // View space Z is negative (objects further from camera have more negative Z)
          float near = 0.1;   // Near plane distance (positive)
          float far = 1000.0; // Far plane distance (positive)
          
          // Convert [0,1] depth to NDC [-1,1] where -1 is near, +1 is far
          float ndc = octreeDepthValue * 2.0 - 1.0;
          
          // Convert NDC to view space using inverse perspective projection
          // Result will be negative, ranging from -near (closest) to -far (furthest)
          float viewSpaceOctreeDepth = 2.0 * near * far / (far + near - ndc * (far - near));
          
          // Mix in octree visualization if cell is occupied
          if(octreeData.a > 0.5) {
            vec3 octreeColor = octreeData.rgb;
            
            // Compare view space depths
            // viewSpaceDepth is already negative from raymarching
            // viewSpaceOctreeDepth is negative from perspective transform
            // Less negative = closer to camera
            if (viewSpaceOctreeDepth > viewSpaceDepth) {
              gl_FragColor = vec4(octreeColor, 1.0);
              return;
            }
          }

          gl_FragColor = vec4(col, 1.0);
          return;
        }
        // Missed or too far
        if(t > tmax) {
          break;
        }

        t += d;
      }

      // If no hit but octree cell is occupied, show octree visualization as if unoccluded
      if(octreeData.a > 0.5) {
        gl_FragColor = vec4(mix(background, octreeData.rgb, 0.5), 1.0);
        return;
      }

      gl_FragColor = vec4(background, 1.0);
    }
  `;
}

