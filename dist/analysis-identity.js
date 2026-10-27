/* Geometry/location identify an analysis; prices, materials and floor assumptions are editable. */
const AnalysisIdentity=(()=>{
 const rounded=(value,precision=7)=>Number.isFinite(value)?Math.round(value*10**precision)/10**precision:null;
 function key(lot){
  const g=lot.geometry,coordinates=g?.geographic||g?.metricCoordinates||g?.vertices;
  return JSON.stringify({area:rounded(lot.area,2),width:g?null:rounded(lot.width,3),depth:g?null:rounded(lot.depth,3),lat:rounded(lot.lat),lng:rounded(lot.lng),coordinates:coordinates?.map(point=>point.map(value=>rounded(value,g.geographic?7:4)))||null,crs:g?(g.geographic?'EPSG:4326':g.crs||'local'):null});
 }
 return {key};
})();
if(typeof module!=='undefined')module.exports=AnalysisIdentity;
