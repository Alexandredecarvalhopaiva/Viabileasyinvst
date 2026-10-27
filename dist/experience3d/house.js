import * as THREE from '../vendor/three/three.module.js';
import { constructionPose } from './construction.js';

/** A hollow architectural model, in metres. Glazing sits in actual wall openings. */
export function createHouse(scenario) {
  const root = new THREE.Group();
  root.name = 'Residência contemporânea';
  const resources = new Set();
  const materials = new Map();
  const parts = [];
  const floors = [];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const sphere = new THREE.SphereGeometry(1, 10, 7);
  const trunk = new THREE.CylinderGeometry(.10, .15, 1, 8);
  [cube, sphere, trunk].forEach(resource => resources.add(resource));
  const height = scenario.floors * scenario.floorHeight;
  const fh = scenario.floorHeight;
  // Author in an 18 × 16 m rectangle; preserve the scenario's declared floor plates.
  root.scale.set(scenario.footprint.width / 18, 1, scenario.footprint.depth / 16);

  function grain(wood) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = wood ? '#b28a60' : '#d4cfc4';
    ctx.fillRect(0, 0, 128, 128);
    for (let n = 0; n < 600; n++) {
      const x = (n * 73.31) % 128, y = (n * 37.79) % 128;
      ctx.fillStyle = n % 2 ? '#ffffff12' : '#30281b12';
      ctx.fillRect(x, y, wood ? .7 : 1.4, wood ? 12 + n % 40 : 1.4);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(wood ? 3 : 2, wood ? 1 : 2);
    resources.add(texture);
    return texture;
  }
  const woodMap = grain(true), stoneMap = grain(false);
  const palette = {
    plaster: [0xf2eee4, .82], concrete: [0xc9c2b5, .91], stone: [0xc5bca9, .9],
    wood: [0xc69560, .65], frame: [0x343b38, .32], glass: [0x547b7b, .16],
    floor: [0xe5d9c3, .72], leaf: [0x65794e, .95], leafLight: [0x87996b, .95],
    soil: [0x4c4a36, 1], grass: [0x889975, 1], fabric: [0xe5ddca, 1],
    dark: [0x454740, .6], light: [0xffe4ad, .5], water: [0x759c99, .22],
  };
  function mat(kind) {
    if (!materials.has(kind)) {
      const [color, roughness] = palette[kind];
      const value = new THREE.MeshPhysicalMaterial({ color, roughness,
        metalness: kind === 'frame' ? .65 : 0,
        transparent: kind === 'glass', opacity: kind === 'glass' ? .62 : 1,
        depthWrite: kind !== 'glass',
        clearcoat: kind === 'glass' || kind === 'water' ? 1 : 0,
        clearcoatRoughness: .12, envMapIntensity: kind === 'glass' ? .45 : .25,
        side: kind === 'glass' ? THREE.DoubleSide : THREE.FrontSide,
        map: kind === 'wood' ? woodMap : ['concrete', 'stone'].includes(kind) ? stoneMap : null,
      });
      if (kind === 'light') { value.emissive.setHex(0xffd697); value.emissiveIntensity = .6; }
      value.userData = { color, opacity: value.opacity, kind };
      materials.set(kind, value);
    }
    return materials.get(kind);
  }
  function group(name, start, end, parent = root, lift = .35) {
    const value = new THREE.Group();
    value.name = name;
    parent.add(value);
    parts.push({ group: value, start, end, lift });
    return value;
  }
  function box(parent, kind, w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(cube, mat(kind));
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = kind !== 'glass' && kind !== 'light';
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const placement = group('Implantação', .03, .14, root, 0);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    [-9, .035, -8], [9, .035, -8], [9, .035, 8], [-9, .035, 8], [-9, .035, -8],
  ].map(p => new THREE.Vector3(...p)));
  resources.add(lineGeo);
  const outlineMat = new THREE.LineDashedMaterial({ color: 0x428572, dashSize: .5, gapSize: .3 });
  resources.add(outlineMat);
  const outline = new THREE.Line(lineGeo, outlineMat);
  outline.computeLineDistances();
  placement.add(outline);
  box(placement, 'grass', 17.8, .025, 15.8, 0, .015, 0);

  const foundation = group('Fundação e embasamento', .14, .25, root, 0);
  box(foundation, 'concrete', 18, .24, 16, 0, .12, 0);
  box(foundation, 'stone', 17.9, .09, 15.9, 0, .285, 0);

  function glazing(parent, x, y, z, width, h, side = false) {
    const frame = .065;
    const panes = Math.max(1, Math.round(width / 1.6));
    const paneWidth = width / panes;
    const window = new THREE.Group();
    window.position.set(x, y, z);
    if (side) window.rotation.y = Math.PI / 2;
    parent.add(window);
    box(window, 'glass', width - .06, h - .06, .035, 0, h / 2, 0);
    for (const level of [0, h]) box(window, 'frame', width + frame, frame, .095, 0, level, 0);
    for (let n = 0; n <= panes; n++) {
      box(window, 'frame', frame, h, .095, -width / 2 + n * paneWidth, h / 2, 0);
    }
    // Visible handles establish the size of a sliding door.
    box(window, 'frame', .035, .25, .08, paneWidth / 2, 1.05, .075);
  }
  function wallWithWindow(parent, trim, x, y, z, width, wallHeight, side = false) {
    const assembly = new THREE.Group();
    assembly.position.set(x, y, z);
    if (side) assembly.rotation.y = Math.PI / 2;
    parent.add(assembly);
    const opening = width * .70, sill = .85, windowH = Math.min(1.45, wallHeight - 1.1);
    const pier = (width - opening) / 2;
    for (const sign of [-1, 1]) box(assembly, trim, pier, wallHeight, .22,
      sign * (width / 2 - pier / 2), wallHeight / 2, 0);
    box(assembly, trim, opening, sill, .22, 0, sill / 2, 0);
    box(assembly, trim, opening, wallHeight - sill - windowH, .22,
      0, sill + windowH + (wallHeight - sill - windowH) / 2, 0);
    return { x, y: y + sill, z, width: opening, h: windowH, side };
  }

  for (let level = 0; level < scenario.floors; level++) {
    const floor = new THREE.Group();
    floor.name = level ? `${level}º pavimento` : 'Térreo';
    floor.position.y = level * fh;
    root.add(floor);
    floors.push(floor);
    const slabY = .34;
    const wallH = fh - .38;
    const structure = group(`Estrutura ${level}`, .23 + level * .05, .36 + level * .04, floor, 0);
    if (level) box(structure, 'plaster', 18, .24, 16, 0, .12, 0);
    // Structural grid sits behind the façades; posts anchor the veranda.
    for (const x of [-8.45, -.2, 8.45]) for (const z of [-7.4, 5.15]) {
      box(structure, 'concrete', .26, wallH, .26, x, slabY + wallH / 2, z);
    }
    box(structure, 'concrete', 17.2, .25, .28, 0, fh - .2, 5.15);
    const walls = group(`Alvenaria ${level}`, .37 + level * .045, .52 + level * .05, floor, .22);
    const finishes = group(`Esquadrias e revestimentos ${level}`, .63 + level * .025, .80 + level * .025, floor, .12);
    const interior = group(`Ambientes ${level}`, .73, .86, floor, .12);
    box(walls, 'plaster', 17, wallH, .24, 0, slabY + wallH / 2, -7.45);
    box(walls, 'plaster', .24, wallH, level ? 14.9 : 12.6, -8.5, slabY + wallH / 2, level ? 0 : -1.15);
    box(walls, 'plaster', .20, wallH, 11, -.2, slabY + wallH / 2, -1.9);
    box(walls, 'plaster', 8.5, wallH, .20, 4.2, slabY + wallH / 2, -.9);
    const window = wallWithWindow(walls, 'plaster', 8.5, slabY, -4.2, 6.5, wallH, true);
    glazing(finishes, window.x + .02, window.y, window.z, window.width, window.h, true);
    // Open corner living room and a recessed front façade create clear inhabited rooms.
    glazing(finishes, 4.15, slabY, 5.18, 8.3, wallH - .13);
    glazing(finishes, 8.5, slabY, 2.12, 6.1, wallH - .13, true);
    box(walls, 'plaster', 8.3, .22, .25, 4.15, fh - .15, 5.17);
    box(walls, 'plaster', .25, .22, 6.2, 8.5, fh - .15, 2.1);
    box(interior, 'floor', 8.25, .04, 5.9, 4.15, slabY + .025, 2.12);
    if (level === 0) {
      // Garage has a closed sectional door, masonry jambs and a separate human entry.
      box(walls, 'stone', 1.05, wallH, .3, -7.98, slabY + wallH / 2, 5.2);
      box(walls, 'stone', 1.15, wallH, .3, -1.88, slabY + wallH / 2, 5.2);
      box(walls, 'stone', 5, .5, .30, -4.95, fh - .29, 5.2);
      box(finishes, 'wood', 4.95, wallH - .55, .14, -4.98, slabY + (wallH - .55) / 2, 5.18);
      for (let n = 0; n < 6; n++) box(finishes, 'dark', 4.94, .018, .02,
        -4.98, slabY + .25 + n * .32, 5.26);
      box(walls, 'plaster', 1.3, wallH, .25, -.8, slabY + wallH / 2, 3.65);
      box(finishes, 'wood', 1.05, 2.35, .12, -.8, slabY + 1.175, 3.81);
      box(finishes, 'frame', .035, .65, .08, -.4, 1.43, 3.91);
      box(finishes, 'stone', 1.8, .12, 1.65, -.8, .30, 4.3);
      // Recessed sofa, low table, rug and pendant visible through the glazing.
      box(interior, 'fabric', 3.1, .42, 1.05, 4, .63, .2);
      box(interior, 'fabric', 3.1, .55, .24, 4, 1, -.25);
      for (const x of [2.6, 5.4]) box(interior, 'fabric', .26, .55, 1.1, x, .90, .2);
      box(interior, 'fabric', 3.7, .025, 2.8, 4, .38, 2.45);
      box(interior, 'wood', 1.65, .13, .95, 4, .80, 2.1);
      box(interior, 'dark', .75, .4, .55, 4, .55, 2.1);
      box(interior, 'light', 2.2, .065, .16, 4.2, fh - .42, 2.4);
    } else {
      // Warm bedroom wing with punched openings; a deep balcony in front of the living wing.
      box(walls, 'plaster', .22, wallH, 2.5, -.2, slabY + wallH / 2, 6.35);
      box(finishes, 'wood', 8.2, .06, 2.1, -4.4, .01, 6.5);
      const frontWindow = wallWithWindow(walls, 'plaster', -4.4, slabY, 7.5, 8.2, wallH);
      glazing(finishes, frontWindow.x, frontWindow.y, frontWindow.z + .02,
        frontWindow.width, frontWindow.h);
      for (let n = 0; n < 17; n++) box(finishes, 'wood', .09, wallH - .1, .15,
        -8.35 + n * .13, slabY + wallH / 2, 7.68);
      box(interior, 'fabric', 2.15, .45, 2.5, -4, .65, 1.5);
      box(interior, 'wood', 2.45, 1, .15, -4, .9, .2);
      // Balcony guard, 1.10 m high, with real posts and a thin handrail.
      glazing(finishes, 3.9, slabY, 7.65, 9.6, 1.10);
      glazing(finishes, 8.7, slabY, 6.45, 2.4, 1.10, true);
      box(finishes, 'wood', 9.5, .035, 2.3, 3.9, slabY, 6.42);
      for (let n = 0; n < 20; n++) box(finishes, 'dark', .018, .006, 2.2,
        -.7 + n * .47, slabY + .02, 6.42);
      box(interior, 'fabric', .9, .45, .85, 2.1, .62, 6.3);
      box(interior, 'fabric', .9, .45, .85, 4.4, .62, 6.3);
      box(interior, 'wood', .65, .12, .65, 3.25, .65, 6.3);
    }
    // Broad fascia + shadow reveal, rather than identical floating slabs.
    box(finishes, 'dark', 17.6, .055, .07, 0, fh - .10, 7.92);
    box(finishes, 'light', 8.2, .025, .035, 4.1, fh - .32, 5.35);
  }

  const roof = group('Cobertura e platibanda', .53, .65, root, .45);
  roof.position.y = height - .28;
  roof.userData.baseY = roof.position.y;
  // L-shaped coverage: the bedroom wing projects over the entry; the terrace stays open to the sky.
  box(roof, 'plaster', 18, .22, 13.4, 0, .05, -1.3);
  box(roof, 'plaster', 8.9, .22, 2.6, -4.55, .05, 6.7);
  box(roof, 'concrete', 17.5, .035, 12.9, 0, .18, -1.3);
  box(roof, 'concrete', 8.4, .035, 2.35, -4.55, .18, 6.6);
  box(roof, 'plaster', 18, .20, .2, 0, .18, -7.9);
  box(roof, 'plaster', .2, .20, 16, -8.9, .18, 0);
  box(roof, 'plaster', .2, .20, 13.4, 8.9, .18, -1.3);
  box(roof, 'plaster', 8.9, .20, .2, -4.55, .18, 7.9);
  box(roof, 'plaster', 9.1, .20, .2, 4.45, .18, 5.3);
  box(roof, 'plaster', .2, .20, 2.6, -.1, .18, 6.7);
  const roofDetails = group('Clarabóia e proteção solar', .76, .86, roof, .1);
  roofDetails.userData.baseY = -.12;
  box(roofDetails, 'frame', 2.8, .12, 3.8, -3.5, .23, -2.5);
  box(roofDetails, 'glass', 2.65, .055, 3.65, -3.5, .32, -2.5);
  for (let n = 0; n < 4; n++) box(roofDetails, 'frame', .035, .06, 3.65, -4.5 + n * .65, .36, -2.5);
  // A warm timber entrance canopy below the cantilever.
  const canopy = group('Marquise da entrada', .78, .88, root, .15);
  for (let n = 0; n < 14; n++) box(canopy, 'wood', .09, .14, 2,
    -1.9 + n * .17, 2.85, 6.2);

  const garden = group('Jardim e acesso', .84, 1, root, 0);
  // Everything remains inside the footprint. The surrounding lot stays reusable across typologies.
  box(garden, 'stone', 7, .055, 2.25, -4.9, .04, 6.7);
  for (let n = 0; n < 4; n++) box(garden, 'stone', 1.45, .08, .48,
    -.8, .06, 5.6 + n * .67);
  box(garden, 'grass', 7.2, .04, 1.9, 4.4, .035, 6.95);
  function shrub(x, z, radius, y = .5) {
    const mesh = new THREE.Mesh(sphere, mat('leaf'));
    mesh.scale.set(radius, radius * .7, radius);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    garden.add(mesh);
  }
  for (const x of [1.2, 2.3, 3.5, 6.5, 7.5]) shrub(x, 7.35, .5);
  box(garden, 'stone', 1.1, .6, 2.7, 7.9, .61, 3.4);
  for (const z of [2.6, 3.35, 4.1]) shrub(7.9, z, .55, 1.03);
  // A small multi-stem ornamental tree supplies familiar residential scale.
  for (let n = 0; n < 3; n++) {
    const stem = new THREE.Mesh(trunk, mat('wood'));
    stem.scale.set(.65, 2.4, .65);
    stem.position.set(5.7 + n * .12, 1.25, 7.05);
    stem.rotation.z = (n - 1) * .12;
    garden.add(stem);
    const crown = new THREE.Mesh(sphere, mat(n % 2 ? 'leafLight' : 'leaf'));
    crown.scale.set(.9, .85, .85);
    crown.position.set(5.65 + (n - 1) * .55, 2.6 + n * .25, 7.05);
    crown.castShadow = true;
    garden.add(crown);
  }

  let opacity = 1, technical = false, transparent = false;
  function setStyle(values) {
    if (values.opacity !== undefined) opacity = values.opacity;
    if (values.technical !== undefined) technical = values.technical;
    if (values.transparent !== undefined) transparent = values.transparent;
    materials.forEach(value => {
      const info = value.userData;
      value.color.setHex(technical ? 0x739c96 : info.color);
      value.wireframe = technical && !['grass', 'leaf', 'leafLight', 'fabric'].includes(info.kind);
      value.opacity = opacity * (technical ? .40 : transparent ? Math.min(.28, info.opacity) : info.opacity);
      const blended = value.opacity < 1;
      if (value.transparent !== blended) { value.transparent = blended; value.needsUpdate = true; }
      value.depthWrite = value.opacity > .8;
    });
  }
  function setAssembly(progress) {
    floors.forEach(floor => { floor.visible = progress > .23; });
    parts.forEach(part => {
      const amount = constructionPose(progress, part.start, part.end);
      part.group.visible = amount > 0;
      // Grow upward from actual floor level, never float whole storeys above the lot.
      part.group.scale.y = Math.max(.001, amount);
      part.group.position.y = (part.group.userData.baseY || 0) - part.lift * (1 - amount);
    });
    placement.visible = progress < .27;
  }
  setAssembly(1);
  return {
    root, floors, roof, height, isHouse: true,
    setAssembly, setGrowth: setAssembly, setStyle,
    setHighlight(kind) {
      materials.forEach((value, key) => {
        if (key === 'light') return;
        value.emissive.setHex(key === kind ? 0x9e8a4f : 0x000000);
        value.emissiveIntensity = key === kind ? .35 : 0;
      });
    },
    setSpread() { setAssembly(1); },
    dispose() {
      root.removeFromParent();
      materials.forEach(value => value.dispose());
      resources.forEach(value => value.dispose());
    },
  };
}
