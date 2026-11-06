import Geometry from '../dist/parcel-geometry.js';
import Setbacks from '../dist/setback-rules.js';
import Capacity from '../dist/building-capacity.js';
import ReportEngine from '../dist/report-engine.js';
import NormativeContext from '../dist/normative-context.js';

/** Rebuild derived geometry; never accept client-provided area/envelopes as authority. */
export function calculateAnalysis(data) {
  if (!data || !data.lot || !data.scenario) throw Error('Entradas incompletas.');
  const lot = data.lot, input = lot.geometry;
  let geometry;
  if (input) {
    if (!Array.isArray(input.vertices) || input.vertices.length > 120
        || !Number.isInteger(input.front) || input.front < 0 || input.front >= input.vertices.length
        || (input.back != null && (!Number.isInteger(input.back) || input.back < 0 || input.back >= input.vertices.length))) throw Error('Geometria inválida.');
    geometry = Geometry.build(input.vertices, {front: input.front, back: input.back, kind: input.kind});
  } else {
    if (![lot.width,lot.depth].every(v=>Number.isFinite(v)&&v>0&&v<=20000)) throw Error('Dimensões inválidas.');
    geometry = Geometry.rectangle(lot.width,lot.depth);
  }
  if (!geometry.valid) throw Error('Geometria inválida.');
  if(input?.geographic){
    if(!Array.isArray(input.geographic)||input.geographic.length<3||input.geographic.length>121||
      input.geographic.some(point=>!Array.isArray(point)||point.length!==2||
        !point.every(Number.isFinite)||Math.abs(point[0])>180||Math.abs(point[1])>90))throw Error('Coordenadas inválidas.');
    geometry.geographic=input.geographic.map(point=>[...point]);
  }
  return ReportEngine.calculate({...lot,geometry,area:geometry.area,width:geometry.frontage,depth:geometry.depth},data.scenario,
    {Geometry,Setbacks,Capacity,Normative:NormativeContext},{execution:'server-demonstration'});
}
