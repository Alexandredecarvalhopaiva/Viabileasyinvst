/* Spatial discovery is separate from legal validation and from the user's project assumptions. */
const UrbanLookup=(()=>{
 const catalog={id:'JP-LC169-2024-OCUPACAO-v1',title:'LC 169/2024 · Anexo IV, quadro de ocupação',
  url:'https://planodiretor.joaopessoa.pb.gov.br/wp-content/uploads/2025/01/LC169-2024_AlteraLUOS.pdf#page=4',
  consultedAt:'2026-11-03',legalValidation:false};
 // General rows only. Alternatives/notes and other restrictions require their own applicability checks.
 const occupation={ZH1:{to:50,permeability:10},ZH2:{to:55,permeability:5},ZH3:{to:50,permeability:5},
  ZH4:{to:50,permeability:15},ZH5:{to:50,permeability:15}};
 const zoneName=value=>String(value||'').toUpperCase().replace(/[\s-]/g,'');
 const key=lot=>JSON.stringify({catalog:catalog.id,lat:lot.lat??null,lng:lot.lng??null,
  coordinates:lot.geometry?.geographic||lot.geometry?.metricCoordinates||lot.geometry?.vertices||[lot.width,lot.depth],
  front:lot.geometry?.front,back:lot.geometry?.back});
 function carry(previous,next){
  if(key(previous)!==key(next))return next;
  for(const field of ['buildingLimit','urbanContext','territory'])if(previous[field])next[field]=JSON.parse(JSON.stringify(previous[field]));
  if(previous.zone)next.zone=previous.zone;
  return next;
 }
 function query(lot){
  const ring=lot.geometry?.geographic;
  const points=ring?.length>=3?ring:Number.isFinite(lot.lat)&&Number.isFinite(lot.lng)?[[lot.lng,lot.lat]]:null;
  if(!points||points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))return null;
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const w=Math.min(...xs),e=Math.max(...xs),s=Math.min(...ys),n=Math.max(...ys);
  if(w<-35||e>-34.75||s<-7.3||n>-7||e-w>.049||n-s>.049)return null;
  const pad=.000001;
  return {search:new URLSearchParams({west:w-pad,south:s-pad,east:e+pad,north:n+pad}).toString(),
   polygon:Boolean(ring?.length>=3),points};
 }
 function paths(geometry){
  const polygons=geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:[];
  return polygons.flatMap(rings=>rings.map((ring,i)=>{
   if(!Array.isArray(ring)||ring.length<4||ring.some(p=>!Array.isArray(p)||p.length<2||!p.slice(0,2).every(Number.isFinite)))throw Error('geometry');
   const path=ring.map(p=>({X:Math.round(p[0]*1e7),Y:Math.round(p[1]*1e7)}));
   if(ClipperLib.Clipper.Orientation(path)!==(i===0))path.reverse();return path;
  }));
 }
 function resolve(lot,data){
  const q=query(lot),base={key:key(lot),source:data.source,status:'pending',zone:null,legalValidation:false};
  if(!q||!Array.isArray(data.features))throw Error('response');
  const grouped=new Map();
  for(const feature of data.features){
   const zone=zoneName(feature.properties?.sigla);
   if(!/^[A-Z][A-Z0-9]{1,9}$/.test(zone))throw Error('schema');
   const rings=paths(feature.geometry);if(!rings.length)throw Error('geometry');
   grouped.set(zone,[...(grouped.get(zone)||[]),...rings]);
  }
  const candidates=[];
  const subject=q.points.map(p=>({X:Math.round(p[0]*1e7),Y:Math.round(p[1]*1e7)}));
  if(q.polygon&&ClipperLib.Clipper.Orientation(subject)!==true)subject.reverse();
  const area=q.polygon?Math.abs(ClipperLib.Clipper.Area(subject)):0;
  if(q.polygon&&area===0)throw Error('geometry');
  for(const [zone,rings]of grouped){
   if(!q.polygon){
    let winding=0,boundary=false;
    for(const ring of rings){const inside=ClipperLib.Clipper.PointInPolygon(subject[0],ring);if(inside===-1)boundary=true;else if(inside===1)winding+=ClipperLib.Clipper.Orientation(ring)?1:-1;}
    if(winding>0||boundary)candidates.push({zone,coverage:1,boundary});
   }else{
    const clip=new ClipperLib.Clipper(),out=new ClipperLib.Paths();
    clip.AddPath(subject,ClipperLib.PolyType.ptSubject,true);clip.AddPaths(rings,ClipperLib.PolyType.ptClip,true);
    clip.Execute(ClipperLib.ClipType.ctIntersection,out,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero);
    const overlap=Math.abs(out.reduce((sum,p)=>sum+ClipperLib.Clipper.Area(p),0));
    if(overlap>0)candidates.push({zone,coverage:overlap/area,boundary:subject.some(p=>rings.some(r=>ClipperLib.Clipper.PointInPolygon(p,r)===-1))});
   }
  }
  if(!candidates.length)return {...base,status:'not_found',candidates:[]};
  if(candidates.length!==1||candidates[0].boundary||(q.polygon&&Math.abs(candidates[0].coverage-1)>1e-6))return {...base,status:'ambiguous',candidates:candidates.map(c=>c.zone)};
  const zone=candidates[0].zone;
  return {...base,status:q.polygon?'identified':'approximate',zone,candidates:[zone],occupation:occupation[zone]?{...occupation[zone],source:{...catalog}}:null};
 }
 function apply(lot,result){
  if(result.key!==key(lot))return false;
  const context=lot.urbanContext;
  const preserve=context&&(context.origin!=='territory'||context.mode==='manual'||context.userConfirmed||context.coastal||context.regime||context.macrozone||context.roadClass||context.reference);
  result.contextPreserved=Boolean(preserve);
  result.contextConflict=Boolean(preserve&&result.status==='identified'&&context.zone&&zoneName(context.zone)!==result.zone);
  lot.territory=result;
  if(result.status!=='identified'&&context?.origin==='territory'&&!preserve){
   delete lot.urbanContext;lot.zone='Não identificado';
  }
  // A point is a suggestion, not proof of the parcel's zoning. Never overwrite a technical override.
  if(result.status==='identified'&&!preserve){
   lot.urbanContext={mode:'catalog',zone:result.zone,origin:'territory',coastal:'',regime:'',catalogId:typeof SetbackRules!=='undefined'?SetbackRules.catalog.id:undefined};
   lot.zone=result.zone;
  }
  return true;
 }
 return {catalog,occupation,key,carry,query,resolve,apply};
})();
if(typeof module!=='undefined')module.exports=UrbanLookup;
