/** Shared timeline in normalized time; all geometry remains in its actual location. */
export const constructionStages = Object.freeze([
  { id: 'terrain', label: 'Terreno', detail: 'O ponto de partida · lote de 30 × 40 m', progress: 0 },
  { id: 'placement', label: 'Implantação', detail: 'Implantação · a casa encontra seu lugar', progress: .14 },
  { id: 'structure', label: 'Estrutura', detail: 'Fundação e estrutura · a base de tudo', progress: .34 },
  { id: 'volume', label: 'Volumetria', detail: 'Paredes e cobertura · espaços que se conectam', progress: .61 },
  { id: 'finishes', label: 'Acabamentos', detail: 'Vidro, madeira e pedra · arquitetura em detalhe', progress: .82 },
  { id: 'complete', label: 'Concluído', detail: 'Residência completa · explore cada perspectiva', progress: 1 },
]);
export const CONSTRUCTION_DURATION = 16000;
export const clamp = value => Math.max(0, Math.min(1, value));
export function constructionPose(progress, start, end) {
  const t = clamp((progress - start) / (end - start));
  return t * t * t * (t * (t * 6 - 15) + 10);
}
export function constructionStage(progress) {
  return constructionStages.reduce((current, stage) => progress >= stage.progress ? stage : current, constructionStages[0]);
}
