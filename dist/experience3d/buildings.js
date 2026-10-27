import * as THREE from '../vendor/three/three.module.js';
import { floorPose, assemblySpread } from './assembly.js';
import { createHouse } from './house.js';
import { createFlats } from './flats.js';

const CONCRETE = 0xeee5d6;
const NAVY = 0x243e49;
const TIMBER = 0x98694a;

/** Architectural detail changes by typology; the complete floor plates stay fixed. */
export function createBuilding(scenario) {
  if (scenario.id === 'house') return createHouse(scenario);
  if (scenario.id === 'flats') return createFlats(scenario);
  const root = new THREE.Group();
  root.name = `scenario-${scenario.id}`;
  const floors = [];
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const edgeGeometry = new THREE.EdgesGeometry(geometry);
  const foliageGeometry = new THREE.IcosahedronGeometry(1, 0);
  const materials = new Map();
  const edges = new THREE.LineBasicMaterial({ color: 0x6b6457, transparent: true, opacity: 0.16 });
  const width = scenario.footprint.width;
  const depth = scenario.footprint.depth;
  const floorHeight = scenario.floorHeight;
  const floorCount = scenario.floors;
  const height = floorCount * floorHeight;
  // The roof garden/solar details are included in the stated height, not extra storeys.
  const roofAllowance = Math.min(.85, floorHeight * .26);
  const styles = {
    residential: { wall: 0xe3dacb, glass: 0x315661, roof: 0xddd5c5, rhythm: 4.6 },
    commercial: { wall: TIMBER, glass: 0x527a85, roof: 0x526062, rhythm: 3.6 },
    flats: { wall: 0xb4cab7, glass: 0x416c72, roof: 0xd0d9ca, rhythm: 3.4 },
    mixed: { wall: 0xd8e4da, glass: 0x3b747b, roof: 0xc5d7ca, rhythm: 4.3 },
  };
  const style = styles[scenario.id] || styles.residential;

  function material(color, kind = 'wall') {
    const key = `${color}-${kind}`;
    if (materials.has(key)) return materials.get(key);
    const value = new THREE.MeshPhysicalMaterial({
      color, roughness: kind === 'glass' ? .16 : kind === 'metal' ? .38 : .72,
      clearcoat: kind === 'glass' ? .8 : .08,
      clearcoatRoughness: .18,
      metalness: kind === 'glass' ? .24 : kind === 'metal' ? .35 : .015,
      transparent: true, opacity: kind === 'glass' ? .94 : 1,
    });
    value.userData = { baseColor: color, baseOpacity: value.opacity, kind };
    materials.set(key, value);
    return value;
  }

  function box(parent, w, h, d, x, y, z, color, kind = 'wall', outlined = false) {
    const mesh = new THREE.Mesh(geometry, material(color, kind));
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = kind !== 'glass';
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (outlined) {
      const line = new THREE.LineSegments(edgeGeometry, edges);
      line.scale.copy(mesh.scale);
      line.position.copy(mesh.position);
      parent.add(line);
    }
    return mesh;
  }

  function roofPlant(x, z, size = 1) {
    const foliage = new THREE.Mesh(foliageGeometry, material(0x75976c, 'landscape'));
    foliage.scale.set(.55 * size, .22 * size, .55 * size);
    foliage.position.set(x, roofAllowance * .42, z);
    foliage.castShadow = true;
    roof.add(foliage);
  }

  /** Dark panes on a pale wall read as punched openings at the hero's scale. */
  function residentialFacade(floor, index, w, d, wallHeight, slab, compact = false) {
    const frontBays = Math.max(2, Math.min(7, Math.round(w / style.rhythm)));
    const sideBays = Math.max(2, Math.min(7, Math.round(d / style.rhythm)));
    const windowHeight = wallHeight * (compact ? .64 : .79);
    const y = slab + wallHeight * .51;
    for (const side of [-1, 1]) {
      for (let bay = 0; bay < frontBays; bay += 1) {
        const bayWidth = w / frontBays;
        const x = -w / 2 + (bay + .5) * bayWidth;
        box(floor, bayWidth * (compact ? .62 : .8), windowHeight, .07,
          x, y, side * (d / 2 + .035), style.glass, 'glass');
        if (!compact) {
          // Warm vertical fins frame the glass without changing the floor plate.
          box(floor, .12, wallHeight * .96, .32,
            x - bayWidth * .43, slab + wallHeight / 2, side * (d / 2 + .12), TIMBER, 'wood');
          box(floor, .06, windowHeight, .09,
            x, y, side * (d / 2 + .08), NAVY, 'metal');
          box(floor, bayWidth * .68, .09, .23,
            x, y - windowHeight / 2 - .045, side * (d / 2 + .1), CONCRETE, 'trim');
        }
      }
      for (let bay = 0; bay < sideBays; bay += 1) {
        const bayDepth = d / sideBays;
        const z = -d / 2 + (bay + .5) * bayDepth;
        box(floor, .07, windowHeight, bayDepth * (compact ? .6 : .78),
          side * (w / 2 + .035), y, z, style.glass, 'glass');
        if (!compact) box(floor, .25, wallHeight * .96, .12,
          side * (w / 2 + .1), slab + wallHeight / 2, z - bayDepth * .42, TIMBER, 'wood');
      }
    }
    if (index > 0 && !compact) {
      // Balconies occupy the existing plate overhang, inside its footprint.
      for (const side of [-1, 1]) {
        box(floor, width * .8, .55, .065, 0, slab + .41,
          side * (depth / 2 - .12), 0x779e9a, 'glass');
        box(floor, width * .8, .065, .09, 0, slab + .72,
          side * (depth / 2 - .12), NAVY, 'metal');
        // Recessed planters alternate along the balcony edge.
        const planterX = (index % 2 ? -1 : 1) * width * .25;
        box(floor, width * .22, .3, .32, planterX, slab + .15,
          side * (depth / 2 - .3), 0xb0a28d, 'trim');
        box(floor, width * .2, .16, .28, planterX, slab + .37,
          side * (depth / 2 - .3), 0x48694d, 'landscape');
      }
    }
  }

  function glazedFacade(floor, w, d, wallHeight, slab, retail = false) {
    const frontBays = Math.max(3, Math.min(7, Math.round(w / (retail ? 5 : 3.8))));
    const sideBays = Math.max(3, Math.min(7, Math.round(d / 4)));
    for (const side of [-1, 1]) {
      for (let bay = 0; bay <= frontBays; bay += 1) {
        box(floor, .10, wallHeight, .12, -w / 2 + bay * w / frontBays,
          slab + wallHeight / 2, side * (d / 2 + .025), NAVY, 'metal');
      }
      for (let bay = 0; bay <= sideBays; bay += 1) {
        box(floor, .12, wallHeight, .10, side * (w / 2 + .025),
          slab + wallHeight / 2, -d / 2 + bay * d / sideBays, NAVY, 'metal');
      }
    }
    // A timber circulation core breaks the commercial curtain-wall mass.
    if (!retail) {
      box(floor, w * .23, wallHeight, d * .55, -w * .38, slab + wallHeight / 2,
        -d * .20, TIMBER, 'wood');
      for (let fin = 0; fin < 6; fin += 1) {
        box(floor, .07, wallHeight, .10, -w / 2 + .25 + fin * w * .035,
          slab + wallHeight / 2, -d / 2 - .015, 0x76563e, 'wood');
      }
    }
  }

  for (let index = 0; index < floorCount; index += 1) {
    const floor = new THREE.Group();
    floor.position.y = index * floorHeight;
    floor.userData.baseY = floor.position.y;
    floor.name = index === 0 ? 'Térreo' : `${index}º andar`;
    root.add(floor);
    floors.push(floor);
    const commercial = scenario.id === 'commercial';
    const retail = scenario.id === 'mixed' && index === 0;
    const compact = scenario.id === 'flats';
    const slab = .24;
    const topAllowance = index === floorCount - 1 ? roofAllowance : 0;
    const wallHeight = floorHeight - slab - topAllowance;
    const facadeInset = commercial || retail ? .3 : compact ? .28 : .7;
    const w = width - facadeInset * 2;
    const d = depth - facadeInset * 2;
    box(floor, width, slab, depth, 0, slab / 2, 0,
      commercial ? 0xc6ccc8 : CONCRETE, 'slab', true);

    if (commercial || retail) {
      box(floor, w, wallHeight, d, 0, slab + wallHeight / 2, 0,
        commercial ? style.glass : 0x4f8c91, 'glass');
      glazedFacade(floor, w, d, wallHeight, slab, retail);
      if (retail) {
        box(floor, width * .92, .3, .7, 0, slab + wallHeight * .82, depth / 2 - .4,
          0x2e6c66, 'trim');
        // Individual display portals establish a street-facing commercial base.
        for (let shop = 0; shop < 4; shop += 1) {
          box(floor, width * .15, .16, .13, -width * .33 + shop * width * .22,
            slab + wallHeight * .87, depth / 2 - .08, 0xd7e4d2, 'trim');
        }
      }
    } else {
      box(floor, w, wallHeight, d, 0, slab + wallHeight / 2, 0, style.wall);
      residentialFacade(floor, index, w, d, wallHeight, slab, compact);
      if (compact) {
        // Compact rooms and a vertical teal stair strip distinguish hospitality.
        box(floor, w * .13, wallHeight, .10, -w * .34, slab + wallHeight / 2,
          -d / 2 - .06, 0x4c8778, 'trim');
        box(floor, width, .10, depth, 0, floorHeight - topAllowance - .05, 0,
          0xd6dfd1, 'slab');
      } else if (scenario.id === 'mixed') {
        box(floor, w * .11, wallHeight, .11, w * .33, slab + wallHeight / 2,
          d / 2 + .055, 0x6c9b83, 'trim');
      }
    }
  }

  const roof = new THREE.Group();
  roof.name = 'Cobertura';
  roof.position.y = height - roofAllowance;
  root.add(roof);
  box(roof, width, .17, depth, 0, .085, 0, style.roof, 'slab', true);
  const railHeight = roofAllowance * .46;
  for (const side of [-1, 1]) {
    box(roof, width, railHeight, .16, 0, .17 + railHeight / 2,
      side * (depth / 2 - .1), commercialRoofColor(), 'slab');
    box(roof, .16, railHeight, depth, side * (width / 2 - .1), .17 + railHeight / 2,
      0, commercialRoofColor(), 'slab');
  }
  function commercialRoofColor() { return scenario.id === 'commercial' ? 0x3c4d50 : CONCRETE; }

  if (scenario.id === 'commercial') {
    // Three restrained solar rows reference a contemporary timber-and-glass office.
    for (let row = 0; row < 3; row += 1) {
      const panel = box(roof, width * .24, .08, depth * .28,
        -width * .28 + row * width * .28, .36, -depth * .15, 0x203e54, 'metal', true);
      panel.rotation.x = -.10;
    }
    box(roof, width * .55, .12, depth * .15, 0, .23, depth * .29, 0x91a782, 'landscape');
    for (let plant = 0; plant < 5; plant += 1) roofPlant(-width * .22 + plant * width * .11, depth * .29, .9);
  } else {
    // A planted roof garden is decorative; it does not remove counted floor area.
    box(roof, width * .48, .12, depth * .36, 0, .23, 0, 0x8ca57b, 'landscape');
    box(roof, width * .3, .15, depth * .2, -width * .25, .3, -depth * .27, CONCRETE, 'wall', true);
    for (const x of [-width * .17, 0, width * .17]) {
      roofPlant(x, -depth * .11, .95);
      roofPlant(x, depth * .11, .85);
    }
    if (scenario.id === 'flats') {
      box(roof, width * .32, .06, depth * .18, width * .22, .29, depth * .3,
        0x76a6a3, 'glass');
    }
  }

  let opacity = 1;
  let technical = false;
  let transparent = false;
  function updateMaterials() {
    materials.forEach(value => {
      const info = value.userData;
      value.wireframe = technical && !['slab', 'landscape'].includes(info.kind);
      value.color.setHex(technical ? (info.kind === 'slab' ? 0xdce9ed : 0x5589a5) : info.baseColor);
      const modeOpacity = technical ? (info.kind === 'slab' ? .34 : .28)
        : transparent ? (info.kind === 'slab' ? .67 : .35) : info.baseOpacity;
      value.opacity = modeOpacity * opacity;
      value.depthWrite = value.opacity > .8;
    });
    edges.opacity = (technical ? .7 : .16) * opacity;
  }

  function posePart(part, index, amount, baseY) {
    const pose = floorPose(index, floorCount, amount, floorHeight);
    part.position.set(pose.x, baseY + pose.y - index * floorHeight, pose.z);
    part.rotation.y = pose.rotation;
    part.visible = true;
    part.scale.y = 1;
  }
  function poseFloors(spreadFor) {
    floors.forEach((floor, index) => posePart(floor, index, spreadFor(index), floor.userData.baseY));
    posePart(roof, floorCount, spreadFor(floorCount), height - roofAllowance);
  }

  return {
    root, floors, roof, height,
    setSpread(value) { poseFloors(() => value); },
    setAssembly(progress) { poseFloors(index => assemblySpread(progress, index, floorCount)); },
    setStyle(values) {
      if (values.technical !== undefined) technical = values.technical;
      if (values.transparent !== undefined) transparent = values.transparent;
      if (values.opacity !== undefined) opacity = values.opacity;
      updateMaterials();
    },
    setGrowth(progress) {
      const bounded = THREE.MathUtils.clamp(progress, 0, 1);
      floors.forEach((floor, index) => {
        const local = THREE.MathUtils.clamp(bounded * (floorCount + 1.8) - index, 0, 1);
        floor.visible = local > 0;
        floor.scale.y = Math.max(.001, 1 - Math.pow(1 - local, 3));
      });
      roof.visible = bounded >= floorCount / (floorCount + 1.8);
      roof.scale.y = Math.max(.001, THREE.MathUtils.clamp((bounded - .8) * 5, 0, 1));
    },
    dispose() {
      root.removeFromParent();
      geometry.dispose();
      edgeGeometry.dispose();
      foliageGeometry.dispose();
      edges.dispose();
      materials.forEach(value => value.dispose());
    },
  };
}
