import * as THREE from '../vendor/three/three.module.js';
import { floorPose, assemblySpread } from './assembly.js';

/** Boutique aparthotel: recessed suites, sheltered loggias and a planted roof.
 * Repeated details are instanced per material and floor, keeping assembly independent.
 */
export function createFlats(scenario) {
  const root = new THREE.Group();
  root.name = 'Flats · Pátio tropical';
  const floors = [];
  const geometries = new Set();
  const materials = new Map();
  const batches = new Map();
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const crown = new THREE.SphereGeometry(1, 10, 7);
  geometries.add(cube); geometries.add(crown);
  const width = scenario.footprint.width;
  const depth = scenario.footprint.depth;
  const fh = scenario.floorHeight;
  const count = scenario.floors;
  const height = count * fh;
  const roofAllowance = Math.min(.78, fh * .26);
  const slab = Math.min(.24, fh * .08);
  const wallThickness = Math.min(.22, width * .011);
  const bayCount = Math.max(2, Math.min(7, Math.round(width / 4)));
  const facadeWidth = width - wallThickness * 2;
  const bay = facadeWidth / bayCount;
  const balcony = Math.min(1.85, depth * .085);
  const frontZ = depth / 2 - .18;
  const roomZ = frontZ - balcony;
  // The pergola covers a recessed patio in the sixth floor, rather than adding a seventh floor.
  const court = { left: -width * .35 - .15, right: width * .07 + .15,
    back: -depth * .24 - .15, front: depth * .08 + .15 };
  const palette = {
    plaster: [0xe9dfc9, .89], slab: [0xe2d5bc, .88], stone: [0xb9aa8e, .95],
    clay: [0x9c5f45, .82], bronze: [0x554c3f, .35], wood: [0x9d754f, .73],
    glass: [0x6b9393, .18], curtain: [0xd0c3a9, 1], interior: [0x635e50, .96],
    foliage: [0x60734b, 1], soil: [0x514d39, 1], linen: [0xe9e0cb, 1],
    water: [0x6c9d98, .18], light: [0xffdda0, .5],
  };
  function material(kind) {
    if (!materials.has(kind)) {
      const [color, roughness] = palette[kind];
      const value = new THREE.MeshPhysicalMaterial({ color, roughness,
        metalness: kind === 'bronze' ? .65 : 0,
        transparent: kind === 'glass', opacity: kind === 'glass' ? .6 : 1,
        depthWrite: kind !== 'glass', clearcoat: ['glass', 'water'].includes(kind) ? .8 : 0,
        envMapIntensity: kind === 'glass' ? .55 : .25,
      });
      if (kind === 'light') { value.emissive.setHex(0xffd59b); value.emissiveIntensity = .5; }
      value.userData = { baseColor: color, baseOpacity: value.opacity, kind };
      materials.set(kind, value);
    }
    return materials.get(kind);
  }
  function group(parent, name) { const value = new THREE.Group(); value.name = name; parent.add(value); return value; }
  function box(parent, kind, w, h, d, x, y, z) {
    if (!batches.has(parent)) batches.set(parent, new Map());
    const kinds = batches.get(parent);
    if (!kinds.has(kind)) kinds.set(kind, []);
    kinds.get(kind).push({ size: [w, h, d], position: [x, y, z] });
  }
  function plant(parent, x, y, z, size = .45) {
    const value = new THREE.Mesh(crown, material('foliage'));
    value.scale.set(size, size * .65, size);
    value.position.set(x, y, z);
    value.castShadow = true;
    parent.add(value);
  }
  function glassDoor(parent, x, y, z, w, h) {
    box(parent, 'glass', w, h, .045, x, y + h / 2, z);
    for (const sign of [-1, 1]) {
      box(parent, 'bronze', .055, h, .08, x + sign * w / 2, y + h / 2, z + .03);
      box(parent, 'bronze', w, .055, .08, x, y + (sign > 0 ? h : 0), z + .03);
    }
    box(parent, 'bronze', .04, h, .08, x, y + h / 2, z + .03);
    box(parent, 'bronze', .025, .28, .08, x + .12, y + h * .42, z + .08);
  }
  // A flattened arch gives each balcony an architectural opening, with actual depth and shadow.
  function portalGeometry(w, h) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, h);
    shape.lineTo(-w / 2, h); shape.closePath();
    const hole = new THREE.Path();
    const half = w * .38, bottom = .035, top = h - .19, spring = h * .69;
    hole.moveTo(-half, bottom); hole.lineTo(-half, spring);
    hole.quadraticCurveTo(-half, top, 0, top);
    hole.quadraticCurveTo(half, top, half, spring);
    hole.lineTo(half, bottom); hole.closePath();
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: wallThickness, bevelEnabled: false, curveSegments: 10 });
    geometries.add(geo);
    return geo;
  }
  const transform = new THREE.Matrix4();
  const position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  function instance(geo, kind, transforms, parent, name) {
    const mesh = new THREE.InstancedMesh(geo, material(kind), transforms.length);
    mesh.name = name;
    transforms.forEach((item, index) => {
      position.set(...item.position); scale.set(...(item.size || [1, 1, 1]));
      rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, item.rotation || 0);
      transform.compose(position, rotation, scale);
      mesh.setMatrixAt(index, transform);
    });
    mesh.castShadow = kind !== 'glass' && kind !== 'light';
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  for (let level = 0; level < count; level++) {
    const floor = group(root, level ? `${level}º pavimento · suítes` : 'Térreo · recepção e suítes');
    floor.position.y = level * fh;
    floor.userData.baseY = floor.position.y;
    floors.push(floor);
    const last = level === count - 1;
    const wallH = fh - slab - (last ? roofAllowance : 0);
    const wallMid = slab + wallH / 2;
    box(floor, 'slab', width, slab, depth, 0, slab / 2, 0);
    // Terracotta shadow bands unify the façade without changing the floor plate.
    for (const sign of [-1, 1]) {
      box(floor, 'clay', width, .09, .10, 0, slab - .045, sign * (depth / 2 - .05));
      box(floor, 'clay', .10, .09, depth, sign * (width / 2 - .05), slab - .045, 0);
    }
    // Central circulation core and transverse room walls; no opaque block behind pasted windows.
    if (last) {
      const leftW = width / 2 - .3 + court.left, rightW = width / 2 - .3 - court.right;
      box(floor, 'interior', leftW, wallH, .18, court.left - leftW / 2, wallMid, -depth * .13);
      box(floor, 'interior', rightW, wallH, .18, court.right + rightW / 2, wallMid, -depth * .13);
      box(floor, 'plaster', width * .12, wallH, depth * .2, width * .25, wallMid, 0);
    } else {
      box(floor, 'interior', width - .6, wallH, .18, 0, wallMid, -depth * .13);
      box(floor, 'plaster', width * .18, wallH, depth * .32, -width * .07, wallMid, 0);
    }
    const portals = [];
    for (const sign of [-1, 1]) {
      for (let n = 0; n < bayCount; n++) {
        const x = -facadeWidth / 2 + bay * (n + .5);
        const lobby = level === 0 && sign === 1 && (n === 1 || n === 2);
        if (!lobby) {
          portals.push({ position: [x, slab, sign * (frontZ - wallThickness)], rotation: sign > 0 ? 0 : Math.PI });
          box(floor, 'plaster', .16, wallH, balcony, x + bay / 2 - .08, wallMid, sign * (frontZ - balcony / 2));
        }
        const doorW = bay * .73;
        const doorH = Math.max(.1, wallH - .18);
        glassDoor(floor, x, slab, sign * roomZ, doorW, doorH);
        // Recessed curtains and warm timber soffits give the loggias depth.
        box(floor, 'curtain', doorW * .19, doorH * .94, .08,
          x - doorW * .36, slab + doorH / 2, sign * (roomZ - .12));
        box(floor, 'interior', bay * .94, .055, balcony + 1.3, x, slab + .03, sign * (roomZ - .3));
        box(floor, 'wood', bay * .86, .045, balcony * .9, x, slab + wallH - .035, sign * (frontZ - balcony / 2));
        if (level > 0) {
          const railH = Math.min(1.05, wallH * .49);
          box(floor, 'bronze', bay * .82, .055, .065, x, slab + railH, sign * (frontZ - .12));
          box(floor, 'bronze', bay * .82, .04, .06, x, slab + .12, sign * (frontZ - .12));
          for (let post = 0; post <= 8; post++) box(floor, 'bronze', .026, railH - .12, .035,
            x - bay * .41 + post * bay * .1025, slab + (railH + .12) / 2, sign * (frontZ - .12));
          // Alternate a small planted balcony and a bistro table.
          if ((n + level) % 2 === 0) {
            box(floor, 'clay', bay * .35, .36, .42, x + bay * .2, slab + .18, sign * (frontZ - .48));
            plant(floor, x + bay * .2, slab + .52, sign * (frontZ - .48), Math.min(.42, bay * .1));
          } else {
            box(floor, 'wood', .58, .07, .58, x, slab + .64, sign * (frontZ - .7));
            box(floor, 'bronze', .065, .57, .065, x, slab + .3, sign * (frontZ - .7));
          }
        }
        // Glazed rear surfaces sit in a real masonry frame.
        box(floor, 'plaster', bay - doorW, wallH, .16, x + bay * .365, wallMid, sign * roomZ);
      }
    }
    instance(portalGeometry(bay, wallH), 'plaster', portals, floor, 'Pórticos das varandas');
    // Side façades: a quieter rhythm of punched windows and one vertical terracotta fin.
    const sideBays = 5;
    const sideBay = (depth - balcony * 2) / sideBays;
    const sideWallZ = -depth / 2 + balcony;
    for (const sign of [-1, 1]) {
      const sideX = sign * (width / 2 - wallThickness / 2);
      for (let n = 0; n < sideBays; n++) {
        const z = sideWallZ + sideBay * (n + .5);
        const openD = sideBay * .60, openH = wallH * .60, sill = wallH * .24;
        box(floor, 'plaster', wallThickness, wallH, sideBay - openD, sideX, wallMid, z + openD / 2);
        box(floor, 'plaster', wallThickness, sill, openD, sideX, slab + sill / 2, z - (sideBay - openD) / 2);
        box(floor, 'plaster', wallThickness, wallH - sill - openH, openD,
          sideX, slab + sill + openH + (wallH - sill - openH) / 2, z - (sideBay - openD) / 2);
        box(floor, 'glass', .045, openH, openD, sideX - sign * .025,
          slab + sill + openH / 2, z - (sideBay - openD) / 2);
        box(floor, 'bronze', .07, openH, .04, sideX + sign * .03,
          slab + sill + openH / 2, z - (sideBay - openD) / 2);
      }
      box(floor, 'clay', .13, wallH, .65, sign * (width / 2 - .065), wallMid, -depth * .12);
    }
    if (level === 0) {
      const entryX = -facadeWidth / 2 + bay * 2;
      const canopyWidth = bay * 2.15;
      const canopyY = slab + wallH * .86;
      box(floor, 'stone', canopyWidth, .22, 3.3, entryX, canopyY, depth / 2 - 1.7);
      box(floor, 'wood', canopyWidth * .96, .045, 3.15, entryX, canopyY - .14, depth / 2 - 1.7);
      box(floor, 'light', canopyWidth * .75, .025, .055, entryX, canopyY - .17, depth / 2 - .4);
      box(floor, 'stone', canopyWidth + 1, .13, 3, entryX, slab + .065, depth / 2 - 1.5);
      for (const x of [entryX - canopyWidth * .47, entryX + canopyWidth * .47]) {
        box(floor, 'stone', .24, canopyY - slab, .3, x, (canopyY + slab) / 2, depth / 2 - .5);
      }
      box(floor, 'wood', 2.5, .95, .75, entryX, slab + .475, roomZ - 1.25);
      for (const x of [-width * .39, width * .39]) {
        box(floor, 'stone', 1.3, .6, 1.25, x, slab + .3, depth / 2 - .8);
        plant(floor, x, slab + 1.05, depth / 2 - .8, .8);
      }
    }
  }

  const roof = group(root, 'Cobertura · jardim e lounge');
  roof.position.y = height - roofAllowance;
  const roofBase = roof.position.y;
  const courtDeck = (count - 1) * fh + slab - roofBase;
  const roofPanels = [
    [width / 2 + court.left, depth, (-width / 2 + court.left) / 2, 0],
    [width / 2 - court.right, depth, (width / 2 + court.right) / 2, 0],
    [court.right - court.left, depth / 2 + court.back, (court.left + court.right) / 2, (-depth / 2 + court.back) / 2],
    [court.right - court.left, depth / 2 - court.front, (court.left + court.right) / 2, (depth / 2 + court.front) / 2],
  ];
  roofPanels.forEach(([w, d, x, z]) => {
    box(roof, 'slab', w, .16, d, x, .08, z);
    box(roof, 'stone', Math.max(.01, w - .08), .035, Math.max(.01, d - .08), x, .18, z);
  });
  box(roof, 'wood', court.right - court.left, .045, court.front - court.back,
    (court.left + court.right) / 2, courtDeck + .035, (court.back + court.front) / 2);
  for (const x of [court.left, court.right]) box(roof, 'plaster', .18, .18 - courtDeck,
    court.front - court.back, x, (courtDeck + .18) / 2, (court.back + court.front) / 2);
  for (const z of [court.back, court.front]) box(roof, 'plaster', court.right - court.left,
    .18 - courtDeck, .18, (court.left + court.right) / 2, (courtDeck + .18) / 2, z);
  // The roof garden and full-height patio pergola stay within the declared height.
  for (const sign of [-1, 1]) {
    box(roof, 'plaster', width, .3, .18, 0, .31, sign * (depth / 2 - .09));
    box(roof, 'plaster', .18, .3, depth, sign * (width / 2 - .09), .31, 0);
    box(roof, 'clay', .20, .06, depth, sign * (width / 2 - .10), .49, 0);
  }
  const pergolaY = roofAllowance - .06;
  const pergolaW = width * .42, pergolaD = depth * .32;
  for (const x of [-width * .35, -width * .35 + pergolaW]) for (const z of [-depth * .24, -depth * .24 + pergolaD]) {
    box(roof, 'wood', .09, pergolaY - courtDeck, .09, x, (pergolaY + courtDeck) / 2, z);
  }
  for (let slat = 0; slat < 13; slat++) box(roof, 'wood', .13, .08, pergolaD + .2,
    -width * .35 + slat * pergolaW / 12, pergolaY, -depth * .24 + pergolaD / 2);
  box(roof, 'wood', pergolaW, .1, .12, -width * .35 + pergolaW / 2, pergolaY - .04, -depth * .24);
  // Reflecting water is decorative, rather than a rooftop pool or extra floor.
  box(roof, 'clay', width * .27, .13, depth * .35, width * .26, .27, -depth * .08);
  box(roof, 'water', width * .25, .025, depth * .33, width * .26, .35, -depth * .08);
  box(roof, 'soil', width * .75, .13, 1.1, 0, .27, depth * .35);
  for (let n = 0; n < 8; n++) plant(roof, -width * .32 + n * width * .09,
    .45, depth * .35, Math.min(.45, roofAllowance * .52));
  for (let n = 0; n < 3; n++) {
    box(roof, 'wood', width * .11, .13, depth * .12,
      -width * .29 + n * width * .14, courtDeck + .18, -depth * .1);
    box(roof, 'linen', width * .10, .065, depth * .11,
      -width * .29 + n * width * .14, courtDeck + .28, -depth * .1);
  }
  batches.forEach((kinds, parent) => kinds.forEach((items, kind) => {
    instance(cube, kind, items, parent, `Detalhes · ${kind}`);
  }));

  let opacity = 1, technical = false, transparent = false;
  function updateMaterials() {
    materials.forEach(value => {
      const info = value.userData;
      value.wireframe = technical && !['slab', 'foliage'].includes(info.kind);
      value.color.setHex(technical ? 0x6d9997 : info.baseColor);
      value.opacity = opacity * (technical ? .35 : transparent ? Math.min(.3, info.baseOpacity) : info.baseOpacity);
      const blended = value.opacity < 1;
      if (value.transparent !== blended) { value.transparent = blended; value.needsUpdate = true; }
      value.depthWrite = value.opacity > .8;
    });
  }
  function posePart(part, index, amount, baseY) {
    const pose = floorPose(index, count, amount, fh);
    part.position.set(pose.x, baseY + pose.y - index * fh, pose.z);
    part.rotation.y = pose.rotation;
    part.visible = true; part.scale.y = 1;
  }
  function poseFloors(spreadFor) {
    floors.forEach((floor, index) => posePart(floor, index, spreadFor(index), floor.userData.baseY));
    posePart(roof, count, spreadFor(count), roofBase);
  }
  return {
    root, floors, roof, height,
    setSpread(value) { poseFloors(() => value); },
    setAssembly(progress) { poseFloors(index => assemblySpread(progress, index, count)); },
    setGrowth(progress) {
      const bounded = THREE.MathUtils.clamp(progress, 0, 1);
      floors.forEach((floor, index) => {
        const local = THREE.MathUtils.clamp(bounded * (count + 1.8) - index, 0, 1);
        floor.visible = local > 0;
        floor.scale.y = Math.max(.001, 1 - Math.pow(1 - local, 3));
      });
      roof.visible = bounded >= count / (count + 1.8);
      roof.scale.y = Math.max(.001, THREE.MathUtils.clamp((bounded - .8) * 5, 0, 1));
    },
    setStyle(values) {
      if (values.technical !== undefined) technical = values.technical;
      if (values.transparent !== undefined) transparent = values.transparent;
      if (values.opacity !== undefined) opacity = values.opacity;
      updateMaterials();
    },
    dispose() {
      root.removeFromParent();
      root.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
      geometries.forEach(value => value.dispose());
      materials.forEach(value => value.dispose());
    },
  };
}
