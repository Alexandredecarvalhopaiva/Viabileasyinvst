import * as THREE from '../vendor/three/three.module.js';

/** Context is deliberately illustrative; it is not a map of a real neighborhood. */
export function createEnvironment(parcel, { lowPower = false, sculpture = false } = {}) {
  const root = new THREE.Group();
  root.name = 'Illustrative urban context';
  const geometries = new Set();
  const materials = new Set();
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cubeEdges = new THREE.EdgesGeometry(cube);
  const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.16, 1, 6);
  const crownGeometry = new THREE.IcosahedronGeometry(1, lowPower ? 1 : 2);
  [cube, cubeEdges, trunkGeometry, crownGeometry].forEach(value => geometries.add(value));
  const palette = new Map();
  const width = parcel.width;
  const depth = parcel.depth;
  const usableWidth = width - parcel.setbacks.side * 2;
  const usableDepth = depth - parcel.setbacks.front - parcel.setbacks.rear;
  const centerZ = (parcel.setbacks.rear - parcel.setbacks.front) / 2;
  const groundY = 0.05;

  function mat(color, extra = {}) {
    const key = `${color}-${JSON.stringify(extra)}`;
    if (!palette.has(key)) {
      const value = new THREE.MeshStandardMaterial({ color, roughness: 0.94, metalness: 0, ...extra });
      palette.set(key, value);
      materials.add(value);
    }
    return palette.get(key);
  }
  function box(w, h, d, x, y, z, color, parent = root, outlined = false) {
    const mesh = new THREE.Mesh(cube, mat(color));
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = h > 1;
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (outlined) {
      const edgeMat = new THREE.LineBasicMaterial({ color: 0xa4b0b1, transparent: true, opacity: 0.43 });
      materials.add(edgeMat);
      const edges = new THREE.LineSegments(cubeEdges, edgeMat);
      edges.scale.copy(mesh.scale);
      edges.position.copy(mesh.position);
      parent.add(edges);
    }
    return mesh;
  }
  function line(points, color, { opacity = 1, dashed = false, parent = root } = {}) {
    const geo = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
    geometries.add(geo);
    const material = dashed
      ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.9, gapSize: 0.5 })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    materials.add(material);
    const value = new THREE.Line(geo, material);
    if (dashed) value.computeLineDistances();
    parent.add(value);
    return value;
  }
  function rect(w, d, y = groundY, z = 0) {
    return [[-w / 2, y, -d / 2 + z], [w / 2, y, -d / 2 + z],
      [w / 2, y, d / 2 + z], [-w / 2, y, d / 2 + z], [-w / 2, y, -d / 2 + z]];
  }
  function tree(x, z, size = 1, muted = false, parent = root) {
    const stem = new THREE.Mesh(trunkGeometry, mat(0xaaa28e));
    stem.position.set(x, 0.9 * size, z);
    stem.scale.set(size, 1.8 * size, size);
    parent.add(stem);
    const crown = new THREE.Mesh(crownGeometry, mat(muted ? 0x9aa78b : 0x507e61));
    crown.scale.set(1.15 * size, 1.5 * size, 1.15 * size);
    crown.position.set(x, 2.5 * size, z);
    crown.rotation.y = x * 0.71;
    crown.castShadow = true;
    parent.add(crown);
  }

  box(148, 0.8, 140, 0, -0.9, 0, 0xe4e9e6);
  box(148, 0.06, 140, 0, -0.47, 0, 0xf0f2ee);
  const roadZ = depth / 2 + 12;
  const roadBackZ = -depth / 2 - 16;
  box(148, 0.04, 11, 0, -0.38, roadZ, 0xdde3e1);
  box(148, 0.04, 10, 0, -0.38, roadBackZ, 0xe1e6e3);
  box(10, 0.04, 140, -width / 2 - 17, -0.37, 0, 0xe0e6e3);
  for (let x = -70; x < 72; x += 7) {
    box(3.2, 0.025, 0.12, x, -0.34, roadZ, 0xf7f9f5);
    box(3.2, 0.025, 0.1, x, -0.34, roadBackZ, 0xf7f9f5);
  }
  for (const z of [roadZ - 6.4, roadZ + 6.4, roadBackZ - 5.9, roadBackZ + 5.9]) {
    box(148, 0.17, 1.5, 0, -0.33, z, 0xf8f8f2);
  }
  // Small crosswalk, paving joints, and trees supply scale without busy textures.
  for (let n = 0; n < 6; n += 1) {
    box(0.9, 0.03, 8.2, -width / 2 - 6.4 + n * 1.5, -0.30, roadZ, 0xf5f7f2);
  }
  for (let x = -63; x <= 63; x += 12) {
    if (Math.abs(x + width / 2 + 17) > 8) tree(x, roadZ + 8.7, 0.8, true);
  }

  const context = new THREE.Group();
  root.add(context);
  const neighborDefinitions = [
    [-width / 2 - 36, -14, 15, 18, 11],
    [-width / 2 - 36, 14, 17, 17, 7],
    [width / 2 + 20, -12, 18, 22, 12],
    [width / 2 + 22, 14, 17, 16, 6],
    [-12, -depth / 2 - 36, 21, 17, 13],
    [17, -depth / 2 - 37, 17, 20, 17],
    [width / 2 + 45, -15, 16, 19, 7],
    [-10, depth / 2 + 36, 19, 14, 4],
    [22, depth / 2 + 39, 15, 14, 5],
  ];
  neighborDefinitions.forEach(([x, z, w, d, h], index) => {
    box(w + 2, 0.15, d + 2, x, -0.28, z, 0xe5e9e1, context);
    box(w, h, d, x, h / 2 - 0.2, z, index % 2 ? 0xe4e8e4 : 0xe9ece7, context, true);
    box(w * 0.32, 0.65, d * 0.28, x - w * 0.13, h + 0.13, z - d * 0.14, 0xe0e5df, context);
    if (!lowPower) {
      for (let y = 3.2; y < h; y += 3.2) {
        line(rect(w + 0.025, d + 0.025, y - 0.2), 0xc6cfca, { opacity: 0.48, parent: context })
          .position.set(x, 0, z);
      }
    }
  });

  const parcelGroup = new THREE.Group();
  root.add(parcelGroup);
  box(width + 1.2, 0.4, depth + 1.2, 0, -0.15, 0, 0xc3b69f, parcelGroup);
  const parcelSurface = box(width, 0.12, depth, 0, 0.01, 0, 0xe5dfcf, parcelGroup);
  const residenceGarden = new THREE.Group();
  parcelGroup.add(residenceGarden);
  const gardenLawn = box(width - .6, .025, depth - .6, 0, .09, 0, 0xa5b48d, residenceGarden);
  // Clear front walk and driveway connect the entrance to the edge of the lot.
  const drive = box(6.8, .045, 10, -4.9, .12, 13, 0xd7d1c2, residenceGarden);
  const walk = box(1.6, .05, 12, -.8, .13, 14, 0xe4ddce, residenceGarden);
  box(width - .6, .06, 1.2, 0, .14, depth / 2 - .8, 0xd6d3c9, residenceGarden);
  for (let n = 0; n < 8; n++) box(1.4, .08, .55, 5, .16, 8.8 + n * 1.2, 0xe8e2d5, residenceGarden);
  residenceGarden.visible = false;
  // A landscaped base gives the isolated model a clear architectural scale.
  for (const side of [-1, 1]) {
    box(1.1, .08, depth - 4, side * (width / 2 - 1.2), .11, 0, 0x7f966c, parcelGroup);
    for (let n = 0; n < 5; n += 1) {
      box(1.5, .05, 1.1, side * (width * .28), .12,
        depth / 2 - .9 - n * .85, 0xf6f0e3, parcelGroup);
    }
  }
  // The illustrative hardscape uses the same parcel for all five alternatives.
  box(4.6, 0.035, parcel.setbacks.front, width / 2 - 4.2, 0.09,
    depth / 2 - parcel.setbacks.front / 2, 0xeef0e8, parcelGroup);
  tree(-width / 2 + 1.7, depth / 2 - 2.2, 0.85, false, parcelGroup);
  tree(width / 2 - 1.5, -depth / 2 + 2.3, 0.75, false, parcelGroup);
  tree(-width / 2 + 1.6, -depth / 2 + 2.3, 0.7, false, parcelGroup);

  const technicalGround = new THREE.Group();
  parcelGroup.add(technicalGround);
  for (let x = -width / 2 + 2; x < width / 2; x += 2) {
    line([[x, 0.095, -depth / 2], [x, 0.095, depth / 2]], 0x96b5aa,
      { opacity: 0.25, parent: technicalGround });
  }
  for (let z = -depth / 2 + 2; z < depth / 2; z += 2) {
    line([[-width / 2, 0.095, z], [width / 2, 0.095, z]], 0x96b5aa,
      { opacity: 0.25, parent: technicalGround });
  }
  const perimeterPoints = [];
  const corners = rect(width, depth, 0.13);
  for (let side = 0; side < 4; side += 1) {
    const from = new THREE.Vector3(...corners[side]);
    const to = new THREE.Vector3(...corners[side + 1]);
    for (let step = 0; step < 25; step += 1) perimeterPoints.push(from.clone().lerp(to, step / 25).toArray());
  }
  perimeterPoints.push(corners[0]);
  const perimeter = line(perimeterPoints, 0x267f72, { parent: parcelGroup });
  line(rect(usableWidth, usableDepth, 0.15, centerZ), 0x527fbc,
    { opacity: 0.85, dashed: true, parent: technicalGround });
  const insetX = usableWidth / 2;
  const insetFront = usableDepth / 2 + centerZ;
  const insetBack = -usableDepth / 2 + centerZ;
  [
    [[0, 0.17, depth / 2], [0, 0.17, insetFront]],
    [[0, 0.17, -depth / 2], [0, 0.17, insetBack]],
    [[-width / 2, 0.17, 0], [-insetX, 0.17, 0]],
    [[width / 2, 0.17, 0], [insetX, 0.17, 0]],
  ].forEach(points => line(points, 0x547fa8, { opacity: 0.75, parent: technicalGround }));
  for (const [x, , z] of corners.slice(0, 4)) {
    box(0.46, 0.16, 0.46, x, 0.15, z, 0x2e786c, parcelGroup);
  }

  const envelope = new THREE.Group();
  envelope.name = 'Demonstrative envelope';
  envelope.position.z = centerZ;
  root.add(envelope);
  const envelopeMaterial = mat(0x7aa7e0, { transparent: true, opacity: 0.045, depthWrite: false, side: THREE.DoubleSide });
  const envelopeMesh = new THREE.Mesh(cube, envelopeMaterial);
  envelopeMesh.scale.set(usableWidth, parcel.envelopeHeight, usableDepth);
  envelopeMesh.position.y = parcel.envelopeHeight / 2 + 0.1;
  envelope.add(envelopeMesh);
  const envelopeEdgeMaterial = new THREE.LineBasicMaterial({ color: 0x6695da, transparent: true, opacity: 0.7 });
  materials.add(envelopeEdgeMaterial);
  const envelopeEdges = new THREE.LineSegments(cubeEdges, envelopeEdgeMaterial);
  envelopeEdges.scale.copy(envelopeMesh.scale);
  envelopeEdges.position.copy(envelopeMesh.position);
  envelope.add(envelopeEdges);
  const floorPlanes = new THREE.Group();
  envelope.add(floorPlanes);
  for (let y = 3; y < parcel.envelopeHeight; y += 3) {
    line(rect(usableWidth, usableDepth, y), 0x719bd1, { opacity: 0.28, parent: floorPlanes });
  }

  if (sculpture) {
    // Keep an isolated architectural model; the surrounding blocks are illustrative only.
    root.children.forEach(child => { child.visible = child === parcelGroup || child === envelope; });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), new THREE.ShadowMaterial({ opacity: .16 }));
    geometries.add(shadow.geometry);
    materials.add(shadow.material);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -.42;
    shadow.receiveShadow = true;
    root.add(shadow);
  }

  return {
    root, envelope, floorPlanes, context,
    setReveal(progress) {
      perimeter.geometry.setDrawRange(0, Math.max(2, Math.round(perimeterPoints.length * progress)));
      technicalGround.visible = progress > 0.2;
    },
    setResidential(scenario, progress = 1) {
      const house = scenario.id === 'house';
      residenceGarden.visible = house && progress >= .84;
      technicalGround.visible = !house || progress < .65;
      if (house) {
        const frontZ = (parcel.setbacks.rear - parcel.setbacks.front) / 2 + scenario.footprint.depth / 2;
        const length = Math.max(.1, depth / 2 - frontZ);
        drive.scale.z = length; drive.position.z = frontZ + length / 2;
        walk.scale.z = length; walk.position.z = frontZ + length / 2;
        gardenLawn.scale.y = Math.max(.001, Math.min(1, (progress - .84) / .16)) * .025;
      }
    },
    setTechnical(value) { technicalGround.visible = value; context.visible = !sculpture && (!value || !lowPower); },
    dispose() {
      root.removeFromParent();
      geometries.forEach(value => value.dispose());
      materials.forEach(value => value.dispose());
    },
  };
}
