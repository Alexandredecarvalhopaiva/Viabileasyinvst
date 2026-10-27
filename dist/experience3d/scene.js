import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { createEnvironment } from './environment.js';
import { createBuilding } from './buildings.js';
import { createSetbackDimensions } from './setback-dimensions.js';

const ease = value => 1 - Math.pow(1 - Math.min(1, Math.max(0, value)), 3);

/**
 * Renderer boundary: receives only prepared dimensions, never account state.
 * Render frames are requested by interactions/transitions, not an idle loop.
 */
export function createExperience(container, {
  parcel, scenario, onError = () => {}, onInteraction = () => {}, onNorthChange = () => {}, reducedMotion = false,
}) {
  const lowPower = (navigator.hardwareConcurrency || 8) <= 4
    || (navigator.deviceMemory || 8) <= 4 || matchMedia('(max-width: 700px)').matches;
  let motionReduced = reducedMotion;
  let disposed = false;
  let active = true;
  let frame = 0;
  let previousTime = 0;
  let layer = 'building';
  let technical = false;
  let transparent = false;
  let showEnvelope = false;
  let view = 'iso';
  let currentScenario = scenario;
  let transition = null;
  let exploded = false;
  let spread = 0;
  let paused = false;
  let cameraTransition = null;
  let revealProgress = 1;
  let envelopeProgress = 1;
  let fieldHeight = 70;
  let aspect = 1.5;
  let renderWidth = 0, renderHeight = 0;
  let touchRotation = false;
  const compactTouch = matchMedia('(max-width: 767px)');
  function reportConstruction(progress) {
    environment.setResidential(currentScenario, progress);

  }

  const renderer = new THREE.WebGLRenderer({
    antialias: true, alpha: true, powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 1.8));
  renderer.setClearColor(0xf5f7f2, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute('aria-label', 'Modelo 3D interativo do terreno demonstrativo');
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'pan-y';
  container.append(renderer.domElement);
  const dimensions = createSetbackDimensions(container, parcel);
  const dimensionPoint = new THREE.Vector3();

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.OrthographicCamera(-50, 50, 35, -35, 0.1, 500);
  camera.position.set(72, 66, 82);
  const ambient = new THREE.HemisphereLight(0xf4f8ff, 0xb8a98e, 1.35);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffecd3, 2.6);
  sun.position.set(-36, 95, 48);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 512 : 2048, lowPower ? 512 : 2048);
  sun.shadow.camera.left = -35;
  sun.shadow.camera.right = 35;
  sun.shadow.camera.top = 35;
  sun.shadow.camera.bottom = -35;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 180;
  sun.shadow.normalBias = 0.025;
  sun.shadow.bias = -0.0001;
  sun.shadow.radius = 5;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xd0e8ee, 0.8);
  fill.position.set(40, 20, -25);
  scene.add(fill);

  // Local studio sky: filtered light cards supply soft PBR reflections, with no HDR download.
  const sky = new THREE.Scene();
  sky.background = new THREE.Color(0xdce6e6);
  const skyGeometry = new THREE.PlaneGeometry(1, 1);
  const skyMaterials = [];
  for (const [color, intensity, x, y, z, size] of [
    [0xffffff, 3, -20, 40, 20, 55], [0xffe5c1, 2, 30, 15, -20, 30],
    [0x698177, .6, 0, -20, 0, 70],
  ]) {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    material.color.multiplyScalar(intensity);
    skyMaterials.push(material);
    const card = new THREE.Mesh(skyGeometry, material);
    card.scale.setScalar(size);
    card.position.set(x, y, z);
    card.lookAt(0, 0, 0);
    sky.add(card);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyTarget = pmrem.fromScene(sky, .08, .1, 150, { size: lowPower ? 64 : 128 });
  scene.environment = skyTarget.texture;
  skyGeometry.dispose();
  skyMaterials.forEach(material => material.dispose());
  pmrem.dispose();

  const environment = createEnvironment(parcel, { lowPower, sculpture: true });
  scene.add(environment.root);
  let building = createBuilding(scenario);
  building.root.position.set(0, 0.14, (parcel.setbacks.rear - parcel.setbacks.front) / 2);
  building.setGrowth(1);
  environment.setResidential(scenario, 1);
  scene.add(building.root);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, scenario.floors * scenario.floorHeight * 0.31, 0);
  controls.enableDamping = !motionReduced;
  controls.dampingFactor = 0.12;
  controls.minPolarAngle = 0.015;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minZoom = 0.55;
  controls.maxZoom = 3;
  controls.rotateSpeed = 0.65;
  controls.panSpeed = 0.72;
  controls.zoomSpeed = 0.85;
  // Scroll the page over the hero; dedicated buttons still control model zoom.
  controls.enableZoom = false;
  controls.screenSpacePanning = true;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  function syncTouchControls() {
    controls.enableRotate = !compactTouch.matches || touchRotation;
    controls.enableZoom = compactTouch.matches && touchRotation;
    renderer.domElement.style.touchAction = compactTouch.matches && touchRotation ? 'none' : 'pan-y pinch-zoom';
  }
  syncTouchControls();

  function requestFrame() {
    if (!frame && active && !disposed) frame = requestAnimationFrame(render);
  }

  function projection(height = fieldHeight) {
    fieldHeight = height;
    camera.left = -height * aspect / 2;
    camera.right = height * aspect / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
  }

  function idealFraming() {
    const height = layer === 'terrain' ? 0 : layer === 'envelope'
      ? parcel.envelopeHeight : currentScenario.floors * currentScenario.floorHeight;
    const house = currentScenario.id === 'house' && layer === 'building';
    const visualHeight = height + (layer === 'building' && !house ? currentScenario.floors * 2.4 + 5 : 0);
    const target = new THREE.Vector3(0, view === 'top' ? 0 : visualHeight * 0.37, 0);
    const position = view === 'top' ? new THREE.Vector3(0.02, 145, 0.02)
      : new THREE.Vector3(72, house ? 39 : 66, 82).add(target);
    const fitWidth = view === 'top' ? parcel.width * 1.5 : (parcel.width + parcel.depth) * (house ? .67 : .93);
    const fitHeight = view === 'top' ? parcel.depth * 1.4 : parcel.depth * 0.6 + visualHeight * 0.91;
    return { target, position, field: Math.max(house ? 41 : 54, fitHeight, fitWidth / aspect), zoom: house ? 1.12 : 1 };
  }

  function frameCamera(immediate = false) {
    const target = idealFraming();
    if (immediate || motionReduced) {
      cameraTransition = null;
      camera.position.copy(target.position);
      controls.target.copy(target.target);
      camera.zoom = target.zoom;
      projection(target.field);
      controls.update();
    } else {
      cameraTransition = {
        fromPosition: camera.position.clone(), fromTarget: controls.target.clone(),
        fromField: fieldHeight, fromZoom: camera.zoom, ...target, elapsed: 0,
      };
    }
    requestFrame();
  }

  function applyLayers() {
    building.root.visible = layer === 'building';
    environment.envelope.visible = layer === 'envelope' || (layer === 'building' && showEnvelope);
    environment.floorPlanes.visible = layer === 'envelope';
    environment.setResidential(currentScenario, layer === 'building' ? 1 : 0);
  }

  function installBuilding(nextScenario) {
    building.dispose();
    building = createBuilding(nextScenario);
    if (building.isHouse) exploded = false;
    building.root.position.set(0, 0.14, (parcel.setbacks.rear - parcel.setbacks.front) / 2);
    building.setStyle({ technical, transparent });
    scene.add(building.root);
    applyLayers();
  }

  function finishTransition() {
    if (transition?.phase === 'out') installBuilding(currentScenario);
    transition = null;
    building.root.scale.set(building.isHouse ? currentScenario.footprint.width / 18 : 1, 1, building.isHouse ? currentScenario.footprint.depth / 16 : 1);
    building.setStyle({ opacity: 1, technical, transparent });
    spread = exploded ? 1 : 0;
    building.setSpread(spread);
    reportConstruction(1);
  }

  function render(time) {
    frame = 0;
    if (!active || disposed) return;
    const delta = previousTime ? Math.min(time - previousTime, 64) : 16;
    previousTime = time;
    let animating = false;

    if (cameraTransition) {
      cameraTransition.elapsed += delta;
      const t = ease(cameraTransition.elapsed / 1000);
      camera.position.lerpVectors(cameraTransition.fromPosition, cameraTransition.position, t);
      controls.target.lerpVectors(cameraTransition.fromTarget, cameraTransition.target, t);
      camera.zoom = THREE.MathUtils.lerp(cameraTransition.fromZoom, cameraTransition.zoom, t);
      projection(THREE.MathUtils.lerp(cameraTransition.fromField, cameraTransition.field, t));
      if (t >= 1) cameraTransition = null;
      else animating = true;
    }
    if (transition && !paused) {
      transition.elapsed += delta;
      if (transition.phase === 'out') {
        const t = ease(transition.elapsed / 650);
        building.setSpread(spread + (1 - spread) * t);
        building.setStyle({ opacity: 1 - t });
        if (t >= 1) {
          installBuilding(currentScenario);
          building.setSpread(building.isHouse ? 0 : 1);
          transition = { phase: 'in', elapsed: 0 };
        }
      } else if (transition.phase === 'spread') {
        const t = ease(transition.elapsed / 1500);
        spread = THREE.MathUtils.lerp(transition.from, transition.to, t);
        building.setSpread(spread);
        if (t >= 1) transition = null;
      } else {
        const progress = Math.min(1, transition.elapsed / 3400);
        building.setAssembly(building.isHouse ? 1 : progress);
        reportConstruction(progress);
        if (progress >= 1) {
          spread = 0;
          transition = exploded ? { phase: 'spread', from: 0, to: 1, elapsed: 0 } : null;
        }
      }
      animating = !!transition || animating;
    }
    if (revealProgress < 1 && !paused) {
      revealProgress = Math.min(1, revealProgress + delta / 1250);
      environment.setReveal(ease(revealProgress));
      animating = revealProgress < 1 || animating;
    }
    if (envelopeProgress < 1 && !paused) {
      envelopeProgress = Math.min(1, envelopeProgress + delta / 1100);
      environment.envelope.scale.y = Math.max(0.001, ease(envelopeProgress));
      animating = envelopeProgress < 1 || animating;
    }
    const controlsChanged = controls.update();
    renderer.render(scene, camera);
    const width = container.clientWidth, height = container.clientHeight;
    dimensions.update(point => {
      dimensionPoint.set(...point).project(camera);
      return { x: (dimensionPoint.x + 1) * width / 2, y: (1 - dimensionPoint.y) * height / 2, z: dimensionPoint.z };
    }, width, height);
    const northAngle = (parcel.northDegrees || 0) * Math.PI / 180;
    const origin = new THREE.Vector3(0, 0, 0).project(camera);
    const north = new THREE.Vector3(Math.sin(northAngle) * 10, 0, -Math.cos(northAngle) * 10).project(camera);
    onNorthChange(Math.atan2((north.x - origin.x) * width, (north.y - origin.y) * height) * 180 / Math.PI);
    if (animating || controlsChanged) requestFrame();
    else previousTime = 0;
  }

  function resize() {
    if (disposed) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width < 1 || height < 1) return;
    if (width === renderWidth && height === renderHeight) { requestFrame(); return; }
    renderWidth = width; renderHeight = height;
    aspect = width / height;
    syncTouchControls();
    renderer.setSize(width, height, false);
    frameCamera(true);
    requestFrame();
  }

  function interaction() {
    cameraTransition = null;
    onInteraction();
    requestFrame();
  }
  function contextLost(event) {
    event.preventDefault();
    active = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    onError(new Error('A visualização 3D foi interrompida pelo dispositivo. Recarregue para tentar novamente.'));
  }
  controls.addEventListener('start', interaction);
  controls.addEventListener('change', requestFrame);
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  applyLayers();
  frameCamera(true);

  return {
    setPaused(value) { paused = !!value; previousTime = 0; requestFrame(); },
    replayAssembly() {
      if (disposed) return;
      finishTransition();
      exploded = false;
      spread = motionReduced || building.isHouse ? 0 : 1;
      building.setSpread(spread);
      if (!motionReduced && !building.isHouse) transition = { phase: 'in', elapsed: 0 };
      frameCamera();
      requestFrame();
    },
    setExploded(value) {
      if (disposed) return;
      if (building.isHouse) { finishTransition(); requestFrame(); return; }
      if (transition?.phase !== 'spread') finishTransition();
      exploded = !!value;
      if (motionReduced) { spread = exploded ? 1 : 0; building.setSpread(spread); }
      else transition = { phase: 'spread', from: spread, to: exploded ? 1 : 0, elapsed: 0 };
      requestFrame();
    },
    setScenario(nextScenario) {
      if (disposed) return;
      if (nextScenario.id === currentScenario.id) { frameCamera(); return; }
      currentScenario = nextScenario;
      if (nextScenario.id === 'house' || motionReduced || layer !== 'building') {
        installBuilding(nextScenario);
        finishTransition();
      } else {
        if (transition) finishTransition();
        transition = { phase: 'out', elapsed: 0 };
      }
      frameCamera();
      requestFrame();
    },
    setLayer(nextLayer) {
      if (disposed || !['terrain', 'envelope', 'building'].includes(nextLayer)) return;
      const changed = layer !== nextLayer;
      layer = nextLayer;
      if (changed && layer === 'terrain') {
        revealProgress = motionReduced ? 1 : 0;
        environment.setReveal(revealProgress);
      }
      if (changed && layer === 'envelope') {
        envelopeProgress = motionReduced ? 1 : 0;
        environment.envelope.scale.y = Math.max(0.001, envelopeProgress);
      }
      if (changed && layer === 'building') {
        finishTransition();
        building.setSpread(building.isHouse ? 0 : motionReduced ? (exploded ? 1 : 0) : 1);
        if (!motionReduced && !building.isHouse) {
          transition = { phase: 'in', elapsed: 0 };
        }
      }
      applyLayers();
      if (layer === 'terrain') reportConstruction(0);
      frameCamera();
      requestFrame();
    },
    setView(nextView) {
      if (!['iso', 'top'].includes(nextView)) return;
      view = nextView;
      frameCamera();
    },
    setTechnical(value) {
      technical = !!value;
      building.setStyle({ technical });
      environment.setTechnical(technical);
      requestFrame();
    },
    setEnvelope(value) {
      showEnvelope = !!value;
      envelopeProgress = 1;
      environment.envelope.scale.y = 1;
      applyLayers();
      requestFrame();
    },
    setTransparent(value) {
      transparent = !!value;
      building.setStyle({ transparent });
      requestFrame();
    },
    setTouchRotation(value) {
      touchRotation = !!value;
      syncTouchControls();
      requestFrame();
    },
    setMaterialHighlight(kind) {
      building.setHighlight?.(kind);
      requestFrame();
    },
    setDimensions(value) {
      dimensions.setVisible(value);
      requestFrame();
    },
    cameraAction(action) {
        cameraTransition = null;
      if (action === 'reset') return frameCamera();
      if (action === 'zoomIn' || action === 'zoomOut') {
        camera.zoom = THREE.MathUtils.clamp(camera.zoom * (action === 'zoomIn' ? 1.15 : 1 / 1.15),
          controls.minZoom, controls.maxZoom);
        camera.updateProjectionMatrix();
      } else if (['left', 'right', 'up', 'down'].includes(action)) {
        const offset = camera.position.clone().sub(controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        if (action === 'left' || action === 'right') spherical.theta += (action === 'left' ? -1 : 1) * Math.PI / 12;
        else spherical.phi = THREE.MathUtils.clamp(spherical.phi + (action === 'up' ? -1 : 1) * 0.12,
          controls.minPolarAngle, controls.maxPolarAngle);
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      }
      controls.update();
      requestFrame();
    },
    setReducedMotion(value) {
      motionReduced = !!value;
      controls.enableDamping = !motionReduced;
      if (motionReduced) {
        finishTransition();
        revealProgress = envelopeProgress = 1;
        environment.setReveal(1);
        environment.envelope.scale.y = 1;
        frameCamera(true);
      }
      requestFrame();
    },
    setActive(value) {
      active = !!value;
      controls.enabled = active;
      previousTime = 0;
      if (!active && frame) { cancelAnimationFrame(frame); frame = 0; }
      if (active) { resize(); requestFrame(); }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.removeEventListener('start', interaction);
      controls.removeEventListener('change', requestFrame);
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      environment.dispose();
      dimensions.dispose();
      building.dispose();
      sun.shadow.map?.dispose();
      skyTarget.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
