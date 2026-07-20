/* global THREE */

const PHI = (1 + Math.sqrt(5)) / 2;

function generateRawVertices() {
  const verts = [];

  // Family A: cyclic perms of (0, ±1, ±3φ)
  for (const [a, b, c] of [[0,1,3*PHI],[0,1,-3*PHI],[0,-1,3*PHI],[0,-1,-3*PHI]]) {
    verts.push([a,b,c],[b,c,a],[c,a,b]);
  }

  // Family B: cyclic perms of (±1, ±(2+φ), ±2φ)
  const b2 = 2 + PHI, b3 = 2 * PHI;
  for (const s1 of [1,-1]) for (const s2 of [1,-1]) for (const s3 of [1,-1]) {
    verts.push([s1, s2*b2, s3*b3], [s2*b2, s3*b3, s1], [s3*b3, s1, s2*b2]);
  }

  // Family C: cyclic perms of (±2, ±(2φ+1), ±φ)
  const c2 = 2*PHI + 1;
  for (const s1 of [1,-1]) for (const s2 of [1,-1]) for (const s3 of [1,-1]) {
    verts.push([s1*2, s2*c2, s3*PHI], [s2*c2, s3*PHI, s1*2], [s3*PHI, s1*2, s2*c2]);
  }

  return verts;
}

function dedupeVertices(raw) {
  const seen = new Map();
  const out = [];
  for (const v of raw) {
    const key = v.map(x => Math.round(x * 1e6)).join(',');
    if (!seen.has(key)) {
      seen.set(key, out.length);
      out.push(v);
    }
  }
  return out;
}

function buildAdjacency(verts) {
  const n = verts.length;
  // Compute minimum non-zero distance as edge length
  let minDist = Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = verts[i][0]-verts[j][0], dy = verts[i][1]-verts[j][1], dz = verts[i][2]-verts[j][2];
      const d = Math.sqrt(dx*dx+dy*dy+dz*dz);
      if (d < minDist) minDist = d;
    }
  }
  const threshold = minDist * 1.15;
  const adj = Array.from({length: n}, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = verts[i][0]-verts[j][0], dy = verts[i][1]-verts[j][1], dz = verts[i][2]-verts[j][2];
      if (Math.sqrt(dx*dx+dy*dy+dz*dz) < threshold) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }
  return adj;
}

function orderNeighborsByAngle(vertIdx, verts, neighbors) {
  const v = verts[vertIdx];
  // outward normal ≈ normalize(vertex position) for a convex shape at origin
  const nx = v[0], ny = v[1], nz = v[2];
  const len = Math.sqrt(nx*nx+ny*ny+nz*nz);
  const normal = [nx/len, ny/len, nz/len];

  // Build tangent frame
  let tx, ty, tz;
  if (Math.abs(normal[0]) < 0.9) {
    const cl = Math.sqrt(1 - normal[0]*normal[0]);
    tx = 0; ty = -normal[2]/cl; tz = normal[1]/cl;
  } else {
    const cl = Math.sqrt(1 - normal[1]*normal[1]);
    tx = normal[2]/cl; ty = 0; tz = -normal[0]/cl;
  }
  // bitangent = normal × tangent
  const bx = normal[1]*tz - normal[2]*ty;
  const by = normal[2]*tx - normal[0]*tz;
  const bz = normal[0]*ty - normal[1]*tx;

  return neighbors.slice().sort((a, b) => {
    const da = [verts[a][0]-v[0], verts[a][1]-v[1], verts[a][2]-v[2]];
    const db = [verts[b][0]-v[0], verts[b][1]-v[1], verts[b][2]-v[2]];
    const angA = Math.atan2(da[0]*bx+da[1]*by+da[2]*bz, da[0]*tx+da[1]*ty+da[2]*tz);
    const angB = Math.atan2(db[0]*bx+db[1]*by+db[2]*bz, db[0]*tx+db[1]*ty+db[2]*tz);
    return angA - angB;
  });
}

function traceFace(startV, secondV, verts, adj) {
  const face = [startV];
  let prev = startV, curr = secondV;
  let safety = 0;
  while (curr !== startV) {
    if (++safety > 10) return null;
    face.push(curr);
    const ordered = orderNeighborsByAngle(curr, verts, adj[curr]);
    const prevIdx = ordered.indexOf(prev);
    if (prevIdx === -1) return null;
    // turn right (next clockwise neighbor)
    const next = ordered[(prevIdx + 1) % ordered.length];
    prev = curr;
    curr = next;
  }
  return face;
}

function findAllFaces(verts, adj) {
  const seen = new Set();
  const faces = [];
  for (let i = 0; i < verts.length; i++) {
    for (const j of adj[i]) {
      const face = traceFace(i, j, verts, adj);
      if (!face || face.length < 5 || face.length > 6) continue;
      const key = face.slice().sort((a,b)=>a-b).join(',');
      if (!seen.has(key)) {
        seen.add(key);
        // ensure outward winding: face center dot face normal > 0
        const cx = face.reduce((s,v) => s+verts[v][0], 0) / face.length;
        const cy = face.reduce((s,v) => s+verts[v][1], 0) / face.length;
        const cz = face.reduce((s,v) => s+verts[v][2], 0) / face.length;
        // compute normal from first two edges
        const v0 = verts[face[0]], v1 = verts[face[1]], v2 = verts[face[2]];
        const e1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
        const e2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
        const nx = e1[1]*e2[2]-e1[2]*e2[1];
        const ny = e1[2]*e2[0]-e1[0]*e2[2];
        const nz = e1[0]*e2[1]-e1[1]*e2[0];
        if (cx*nx + cy*ny + cz*nz < 0) face.reverse();
        faces.push(face);
      }
    }
  }
  return faces;
}

function computeFaceUVs(faceVerts3D) {
  // Face center
  const cx = faceVerts3D.reduce((s,v)=>s+v[0],0)/faceVerts3D.length;
  const cy = faceVerts3D.reduce((s,v)=>s+v[1],0)/faceVerts3D.length;
  const cz = faceVerts3D.reduce((s,v)=>s+v[2],0)/faceVerts3D.length;
  const cLen = Math.sqrt(cx*cx+cy*cy+cz*cz);
  const normal = [cx/cLen, cy/cLen, cz/cLen];

  // Local tangent frame from first vertex
  const d = [faceVerts3D[0][0]-cx, faceVerts3D[0][1]-cy, faceVerts3D[0][2]-cz];
  const dLen = Math.sqrt(d[0]*d[0]+d[1]*d[1]+d[2]*d[2]);
  const uAxis = [d[0]/dLen, d[1]/dLen, d[2]/dLen];
  const wAxis = [
    normal[1]*uAxis[2]-normal[2]*uAxis[1],
    normal[2]*uAxis[0]-normal[0]*uAxis[2],
    normal[0]*uAxis[1]-normal[1]*uAxis[0],
  ];

  const locals = faceVerts3D.map(v => {
    const lx = v[0]-cx, ly = v[1]-cy, lz = v[2]-cz;
    return [
      lx*uAxis[0]+ly*uAxis[1]+lz*uAxis[2],
      lx*wAxis[0]+ly*wAxis[1]+lz*wAxis[2],
    ];
  });

  let minU = Infinity, maxU = -Infinity, minW = Infinity, maxW = -Infinity;
  for (const [u,w] of locals) {
    if (u<minU) minU=u; if (u>maxU) maxU=u;
    if (w<minW) minW=w; if (w>maxW) maxW=w;
  }
  const rangeU = maxU-minU || 1, rangeW = maxW-minW || 1;
  const margin = 0.1;
  return locals.map(([u,w]) => [
    margin + (u-minU)/rangeU*(1-2*margin),
    margin + (w-minW)/rangeW*(1-2*margin),
  ]);
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawFaceCanvas(question, isPentagon) {
  const SIZE = 256;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  const bg = isPentagon ? '#111111' : '#f5f5f5';
  const fg = isPentagon ? '#ffffff' : '#111111';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const maxW = SIZE * 0.78;
  const cx = SIZE / 2, cy = SIZE / 2;

  // Find largest font that fits
  let fontSize = 20;
  let lines = [];
  while (fontSize >= 10) {
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    lines = wrapText(ctx, question, maxW);
    const totalH = lines.length * fontSize * 1.3;
    if (totalH <= SIZE * 0.75) break;
    fontSize -= 1;
  }

  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lineH = fontSize * 1.35;
  const totalH = lines.length * lineH;
  const startY = cy - totalH / 2 + lineH / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], cx, startY + i * lineH);
  }

  return canvas;
}

function buildTruncatedIcosahedron(questions, radius = 1) {
  const rawVerts = generateRawVertices();
  const verts = dedupeVertices(rawVerts);

  // Normalize to unit sphere then scale
  const maxR = Math.max(...verts.map(v => Math.sqrt(v[0]**2+v[1]**2+v[2]**2)));
  const scaledVerts = verts.map(v => v.map(x => x / maxR * radius));

  const adj = buildAdjacency(scaledVerts);
  const faces = findAllFaces(scaledVerts, adj);

  const pentagons = faces.filter(f => f.length === 5).length;
  const hexagons  = faces.filter(f => f.length === 6).length;
  console.log(`Faces: ${pentagons} pentagons, ${hexagons} hexagons, ${faces.length} total`);

  // Count triangles per face for buffer sizing
  const triCounts = faces.map(f => f.length - 2); // 3 for pentagon, 4 for hexagon
  const totalTris = triCounts.reduce((s,n) => s+n, 0);

  const positions = new Float32Array(totalTris * 3 * 3);
  const normals   = new Float32Array(totalTris * 3 * 3);
  const uvs       = new Float32Array(totalTris * 3 * 2);

  const faceCenters = [];
  let triOffset = 0;

  for (let fi = 0; fi < faces.length; fi++) {
    const face = faces[fi];
    const faceVerts3D = face.map(vi => scaledVerts[vi]);

    // Face center (normalized = outward normal)
    const fc = faceVerts3D.reduce((acc,v) => [acc[0]+v[0], acc[1]+v[1], acc[2]+v[2]], [0,0,0]);
    const fcLen = Math.sqrt(fc[0]**2+fc[1]**2+fc[2]**2);
    faceCenters.push(new THREE.Vector3(fc[0]/fcLen, fc[1]/fcLen, fc[2]/fcLen));

    const uvCoords = computeFaceUVs(faceVerts3D);

    // Flat normal for this face
    const v0 = faceVerts3D[0], v1 = faceVerts3D[1], v2 = faceVerts3D[2];
    const e1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
    const e2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
    let fnx = e1[1]*e2[2]-e1[2]*e2[1];
    let fny = e1[2]*e2[0]-e1[0]*e2[2];
    let fnz = e1[0]*e2[1]-e1[1]*e2[0];
    const fnLen = Math.sqrt(fnx*fnx+fny*fny+fnz*fnz);
    fnx/=fnLen; fny/=fnLen; fnz/=fnLen;

    // Fan triangulation
    for (let t = 1; t < face.length - 1; t++) {
      const indices = [0, t, t+1];
      for (let k = 0; k < 3; k++) {
        const vi = indices[k];
        const vp = faceVerts3D[vi];
        const uv = uvCoords[vi];
        const base3 = (triOffset + k) * 3;
        const base2 = (triOffset + k) * 2;
        positions[base3]   = vp[0]; positions[base3+1] = vp[1]; positions[base3+2] = vp[2];
        normals[base3]     = fnx;   normals[base3+1]   = fny;   normals[base3+2]   = fnz;
        uvs[base2]         = uv[0]; uvs[base2+1]       = uv[1];
      }
      triOffset++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));

  // Add material groups
  let groupStart = 0;
  for (let fi = 0; fi < faces.length; fi++) {
    const triCount = faces[fi].length - 2;
    geometry.addGroup(groupStart * 3, triCount * 3, fi);
    groupStart += triCount;
  }

  // Build materials with canvas textures
  const materials = faces.map((face, fi) => {
    const isPentagon = face.length === 5;
    const canvas = drawFaceCanvas(questions[fi % questions.length], isPentagon);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return new THREE.MeshPhongMaterial({
      map: texture,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
      shininess: 40,
    });
  });

  return { geometry, materials, faceCenters, faces };
}
