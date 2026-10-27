const format = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/** Ground-plane measurements from the parcel boundary to the setback envelope. */
export function getSetbackDimensions({ width, depth, setbacks }) {
  const y = 0.18;
  const centerZ = (setbacks.rear - setbacks.front) / 2;
  return [
    { id: 'front', label: 'Frente', value: setbacks.front,
      start: [0, y, depth / 2], end: [0, y, depth / 2 - setbacks.front] },
    { id: 'rear', label: 'Fundos', value: setbacks.rear,
      start: [0, y, -depth / 2], end: [0, y, -depth / 2 + setbacks.rear] },
    { id: 'left', label: 'Lateral esq.', value: setbacks.side,
      start: [-width / 2, y, centerZ], end: [-width / 2 + setbacks.side, y, centerZ] },
    { id: 'right', label: 'Lateral dir.', value: setbacks.side,
      start: [width / 2, y, centerZ], end: [width / 2 - setbacks.side, y, centerZ] },
  ];
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const overlaps = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Screen-space labels remain legible while their measurement endpoints orbit in 3D. */
export function createSetbackDimensions(container, parcel) {
  const root = document.createElement('div');
  root.className = 've-setback-overlay';
  root.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  root.append(svg);
  const items = getSetbackDimensions(parcel).map(dimension => {
    const group = document.createElementNS(svg.namespaceURI, 'g');
    const halo = document.createElementNS(svg.namespaceURI, 'path');
    halo.classList.add('ve-dimension-halo');
    const measure = document.createElementNS(svg.namespaceURI, 'path');
    measure.classList.add('ve-dimension-line');
    const leader = document.createElementNS(svg.namespaceURI, 'path');
    leader.classList.add('ve-dimension-leader');
    group.append(halo, measure, leader);
    svg.append(group);
    const badge = document.createElement('div');
    badge.className = 've-dimension-badge';
    badge.dataset.dimension = dimension.id;
    const label = document.createElement('span');
    label.textContent = dimension.label;
    const value = document.createElement('strong');
    value.textContent = `${format.format(dimension.value)} m`;
    badge.append(label, value);
    root.append(badge);
    return { ...dimension, group, halo, measure, leader, badge };
  });
  container.append(root);
  let visible = true;
  return {
    setVisible(value) { visible = Boolean(value); root.hidden = !visible; },
    update(project, width, height) {
      if (!visible || width < 1 || height < 1) return;
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      const center = project([0, 0.18, (parcel.setbacks.rear - parcel.setbacks.front) / 2]);
      const occupied = [
        { x: 0, y: 0, w: width, h: 51 },
        { x: width - 62, y: width <= 580 ? 52 : 15, w: 62, h: 150 },
        { x: width - 67, y: height - 115, w: 67, h: 95 },
      ];
      const w = width < 400 ? 80 : 88, h = 42;
      for (const item of items) {
        const start = project(item.start), end = project(item.end);
        const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        const inFrame = start.z >= -1 && start.z <= 1 && end.z >= -1 && end.z <= 1
          && mid.x >= -8 && mid.x <= width + 8 && mid.y >= 0 && mid.y <= height;
        item.badge.hidden = !inFrame;
        item.group.style.display = inFrame ? '' : 'none';
        if (!inFrame) continue;
        const dx = end.x - start.x, dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        const ux = length > .01 ? dx / length : 1, uy = length > .01 ? dy / length : 0;
        const px = -uy * 4, py = ux * 4;
        const cap = p => `M${p.x - px},${p.y - py}L${p.x + px},${p.y + py}`;
        const arrowSize = Math.min(4, length / 3);
        const arrow = (p, direction) => `M${p.x + ux * arrowSize * direction - uy * 2},${p.y + uy * arrowSize * direction + ux * 2}L${p.x},${p.y}L${p.x + ux * arrowSize * direction + uy * 2},${p.y + uy * arrowSize * direction - ux * 2}`;
        const path = `M${start.x},${start.y}L${end.x},${end.y}${cap(start)}${cap(end)}${length > 2 ? arrow(start, 1) + arrow(end, -1) : ''}`;
        item.halo.setAttribute('d', path);
        item.measure.setAttribute('d', path);

        const angle = Math.atan2(mid.y - center.y, mid.x - center.x);
        let best = null;
        for (const radius of [57, 86, 115]) {
          for (const offset of [0, -.5, .5, -1, 1, -1.6, 1.6, Math.PI]) {
            const candidate = {
              x: clamp(mid.x + Math.cos(angle + offset) * radius - w / 2, 8, width - w - 8),
              y: clamp(mid.y + Math.sin(angle + offset) * radius - h / 2, 54, height - h - 29), w, h,
            };
            const collision = occupied.reduce((total, rectangle) => total + overlaps(candidate, rectangle), 0);
            const distance = Math.hypot(candidate.x + w / 2 - mid.x, candidate.y + h / 2 - mid.y);
            const score = collision * 100 + distance + Math.abs(offset) * 18;
            if (!best || score < best.score) best = { ...candidate, score };
          }
        }
        occupied.push({ x: best.x - 5, y: best.y - 5, w: w + 10, h: h + 10 });
        item.badge.style.width = `${w}px`;
        item.badge.style.transform = `translate(${Math.round(best.x)}px, ${Math.round(best.y)}px)`;
        const labelX = clamp(mid.x, best.x, best.x + w);
        const labelY = clamp(mid.y, best.y, best.y + h);
        item.leader.setAttribute('d', `M${mid.x},${mid.y}L${labelX},${labelY}`);
      }
    },
    dispose() { root.remove(); },
  };
}
