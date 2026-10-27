/** The residence is presented complete, without a construction sequence. */
export function createIntroTour(scenarios) {
  const house = Math.max(0, scenarios.findIndex(scenario => scenario.id === 'house'));
  return [
    { phase: 'scenarios', layer: 'building', scenario: house,
      label: 'Residência contemporânea · versão final', duration: 4000 },
  ];
}
