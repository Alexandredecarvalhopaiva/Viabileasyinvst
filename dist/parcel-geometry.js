/* Metric parcel geometry. No cadastral, topographic or legal validation is implied. */
const ParcelGeometry=(()=>{
 const EPS=1e-8,UTM='EPSG:31985';
 proj4.defs('EPSG:32725','+proj=utm +zone=25 +south +datum=WGS84 +units=m +no_defs');
 proj4.defs(UTM,'+proj=utm +zone=25 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
 const num=value=>{const s=String(value??'').trim();if(!/^[-+]?\d+(?:[.,]\d+)?$/.test(s))return null;const n=Number(s.replace(',','.'));return Number.isFinite(n)?n:null};
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 const signedArea=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1]},0)/2;
 const area=p=>Math.abs(signedArea(p));
 function segmentsTouch(a,b,c,d){const ab=cross(a,b,c),ad=cross(a,b,d),ca=cross(c,d,a),cb=cross(c,d,b);const on=(a,b,p)=>Math.abs(cross(a,b,p))<EPS&&p[0]>=Math.min(a[0],b[0])-EPS&&p[0]<=Math.max(a[0],b[0])+EPS&&p[1]>=Math.min(a[1],b[1])-EPS&&p[1]<=Math.max(a[1],b[1])+EPS;return (ab*ad<0&&ca*cb<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b)}
 function validate(points,closed=true){
  if(!closed)return 'Feche o polígono para calcular a área.';
  if(points.length<3)return 'Informe pelo menos três vértices.';
  if(points.length>120)return 'Use até 120 vértices neste protótipo.';
  if(points.some(p=>!Array.isArray(p)||p.length<2||!p.every(Number.isFinite)))return 'Preencha as coordenadas de todos os vértices.';
  const p=points.map(q=>[q[0]-points[0][0],q[1]-points[0][1]]);
  for(let i=0;i<p.length;i++){if(distance(p[i],p[(i+1)%p.length])<.01)return `O lado ${i+1} é nulo ou menor que 1 cm.`;if(Math.hypot(...p[i])>20000)return 'O terreno excede o alcance de 20 km deste protótipo.';for(let j=i+1;j<p.length;j++){if(j===i+1||i===0&&j===p.length-1)continue;if(segmentsTouch(p[i],p[(i+1)%p.length],p[j],p[(j+1)%p.length]))return 'Os limites se cruzam ou se tocam. Revise a ordem dos vértices.'}}
  // Adjacent edges may not overlap or reverse along one another.
  for(let i=0;i<p.length;i++){const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length];if(Math.abs(cross(a,b,c))<EPS&&(a[0]-b[0])*(c[0]-b[0])+(a[1]-b[1])*(c[1]-b[1])>EPS)return 'Há lados sobrepostos. Revise os vértices.'}
  const ar=area(p);if(ar<.01)return 'A área é nula ou os pontos estão alinhados.';if(ar>1e6)return 'Use um terreno com até 1.000.000 m² neste protótipo.';return null;
 }
 function build(points,metadata={}){
  const error=validate(points,metadata.closed!==false);if(error)return {valid:false,error};
  const origin=[...points[0]],vertices=points.map(p=>[p[0]-origin[0],p[1]-origin[1]]),front=Math.max(0,Math.min(vertices.length-1,Number(metadata.front)||0)),back=metadata.back==null?null:Number(metadata.back);
  const lengths=vertices.map((p,i)=>distance(p,vertices[(i+1)%vertices.length]));
  const a=vertices[front],b=vertices[(front+1)%vertices.length],span=Math.max(...vertices.map(p=>Math.abs(cross(a,b,p))/lengths[front]));
  return {...metadata,version:1,valid:true,closed:true,vertices,origin,coordinateEncoding:'metric offsets from origin in the declared CRS',metricCoordinates:points.map(p=>[p[0],p[1]]),front,back:back!==front&&back>=0&&back<vertices.length?back:null,area:area(vertices),perimeter:lengths.reduce((s,v)=>s+v,0),lengths,frontage:lengths[front],depth:span,crs:metadata.crs||'LOCAL_METERS',estimated:true};
 }
 function rectangle(front,depth){if(!(front>0&&depth>0))return {valid:false,error:'Informe frente e profundidade maiores que zero.'};return build([[0,0],[front,0],[front,depth],[0,depth]],{kind:'rectangle',front:0,back:2,input:{front,depth}})}
 function trapezoid(front,back,height,offset=0){if(!(front>0&&back>0&&height>0))return {valid:false,error:'Informe frente, fundos e altura perpendicular maiores que zero.'};const x=(front-back)/2+offset;return build([[0,0],[front,0],[x+back,height],[x,height]],{kind:'trapezoid',front:0,back:2,input:{front,back,depth:height,offset}})}
 function fromGeographic(ring,metadata={}){
  if(ring.some(p=>!Array.isArray(p)||p.length<2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||p[0]<-35||p[0]>-34.75||p[1]<-7.3||p[1]>-7))return {valid:false,error:'Use coordenadas no recorte de João Pessoa: longitude de −35 a −34,75; latitude de −7,3 a −7.'};
  const xy=ring.map(p=>proj4('EPSG:4326',UTM,p));return build(xy,{...metadata,crs:UTM,sourceCrs:metadata.sourceCrs||'EPSG:4326',geographic:ring.map(p=>[p[0],p[1]]),georeferenced:true});
 }
 function fromCoordinates(rows,crs,metadata={}){
  const coordinate=v=>{const s=String(v??'').trim();return /^[-+]?\d+(?:[.,]\d+)?$/.test(s)?Number(s.replace(',','.')):null};const p=rows.map(r=>r.slice(0,2).map(coordinate));if(p.some(r=>r.some(v=>v===null)))return {valid:false,error:'Preencha as duas coordenadas de cada vértice.'};
  if(crs==='LOCAL_METERS')return build(p,metadata);
  if(!['EPSG:4326',UTM,'EPSG:32725'].includes(crs))return {valid:false,error:'Sistema de referência não suportado.'};
  let geo;try{geo=crs==='EPSG:4326'?p:p.map(v=>proj4(crs,'EPSG:4326',v))}catch(e){return {valid:false,error:'Não foi possível transformar as coordenadas.'}}return fromGeographic(geo,{...metadata,sourceCrs:crs});
 }
 function fromSegments(rows,closed=false,metadata={}){
  let p=[[0,0]],lengths=[];
  for(const row of rows){const len=num(row[0]),az=num(row[1]);if(!(len>0)||az===null||az<0||az>360)return {valid:false,error:'Cada lado precisa de comprimento positivo e azimute entre 0° e 360°.'};const angle=az*Math.PI/180,last=p.at(-1);p.push([last[0]+Math.sin(angle)*len,last[1]+Math.cos(angle)*len]);lengths.push(len)}
  const gap=distance(p[0],p.at(-1));if(!closed||gap>.01)return {valid:false,error:gap>.01?`Os lados não fecham: falta unir ${gap.toFixed(2).replace('.',',')} m. Ajuste as direções ou calcule o lado de fechamento.`:'Confirme o fechamento do polígono.',gap,openVertices:p};
  return build(p.slice(0,-1),{...metadata,kind:'irregular',closureGap:gap});
 }
 function geographic(g,anchor=null){if(g.geographic)return g.geographic;if(!anchor)return null;const origin=proj4('EPSG:4326',UTM,[anchor.lng,anchor.lat]);const xs=g.vertices.map(p=>p[0]),ys=g.vertices.map(p=>p[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;return g.vertices.map(p=>proj4(UTM,'EPSG:4326',[origin[0]+p[0]-cx,origin[1]+p[1]-cy]))}
 function convex(p){const sign=Math.sign(signedArea(p));return p.every((a,i)=>cross(a,p[(i+1)%p.length],p[(i+2)%p.length])*sign>=-EPS)}
 function halfPlane(poly,a,b,offset){if(!poly.length)return [];const sign=1,dx=b[0]-a[0],dy=b[1]-a[1],len=distance(a,b),f=p=>((-dy)*(p[0]-a[0])+dx*(p[1]-a[1]))/len-offset;let out=[];for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],u=f(p),v=f(q);if(u>=-EPS)out.push(p);if((u>=0)!==(v>=0)){const t=u/(u-v);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t])}}return out}
 function inset(g,front=5,back=5,side=3){
  if(!g?.valid)return {paths:[],area:0,largest:0,method:'invalid'};
  const source=g.vertices,ccw=signedArea(source)>0;
  let paths=[],method;
  if(convex(source)){
   let p=source.map(v=>[...v]);for(let i=0;i<source.length;i++){const d=g.back==null?Math.max(front,back,side):i===g.front?front:i===g.back?back:side,a=source[i],b=source[(i+1)%source.length];p=halfPlane(p,ccw?a:b,ccw?b:a,d)}if(p.length>=3&&area(p)>.001)paths=[p];method=g.back==null?'conservative_uniform':'edge_setbacks';
  }else{
   const scale=10000,co=new ClipperLib.ClipperOffset(2,.01*scale),path=source.map(([x,y])=>({X:Math.round(x*scale),Y:Math.round(y*scale)}));if(!ClipperLib.Clipper.Orientation(path))path.reverse();co.AddPath(path,ClipperLib.JoinType.jtMiter,ClipperLib.EndType.etClosedPolygon);const result=new ClipperLib.Paths();co.Execute(result,-Math.max(front,back,side)*scale);paths=result.map(p=>p.map(v=>[v.X/scale,v.Y/scale])).filter(p=>p.length>=3&&area(p)>.001);method='conservative_uniform';
  }
  paths.sort((a,b)=>area(b)-area(a));return {paths,area:paths.reduce((s,p)=>s+area(p),0),largest:paths.length?area(paths[0]):0,method,reason:convex(source)?g.back==null?'back_unspecified':null:'concave',uniform:method==='conservative_uniform'?Math.max(front,back,side):null};
 }
 const footprintCache=new WeakMap();
 function footprint(g,target){
  const cached=footprintCache.get(g);if(cached?.target===target)return cached.paths;
  const env=inset(g);if(!env.paths.length||target<=0)return [];const p=env.paths[0];if(target>=area(p)-.001)return [p];
  const scale=10000,path=p.map(([x,y])=>({X:Math.round(x*scale),Y:Math.round(y*scale)})),xmin=Math.min(...p.map(v=>v[0])),ymin=Math.min(...p.map(v=>v[1]))-1,ymax=Math.max(...p.map(v=>v[1]))+1;
  const clip=x=>{if(convex(p)){const q=halfPlane(p,[x,0],[x,1],0);return q.length>=3?[q]:[]}const cutter=[[xmin-1,ymin],[x,ymin],[x,ymax],[xmin-1,ymax]].map(([X,Y])=>({X:Math.round(X*scale),Y:Math.round(Y*scale)}));const c=new ClipperLib.Clipper(),out=new ClipperLib.Paths();c.AddPath(path,ClipperLib.PolyType.ptSubject,true);c.AddPath(cutter,ClipperLib.PolyType.ptClip,true);c.Execute(ClipperLib.ClipType.ctIntersection,out,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero);return out.map(q=>q.map(v=>[v.X/scale,v.Y/scale]))};
  let lo=xmin,hi=Math.max(...p.map(v=>v[0])),result=[];for(let i=0;i<40;i++){const x=(lo+hi)/2,paths=clip(x),a=paths.reduce((s,q)=>s+area(q),0);if(a>target)hi=x;else lo=x;result=paths}footprintCache.set(g,{target,paths:result});return result;
 }
 function label(g,i){if(i===g.front)return 'Frente';if(i===g.back)return 'Fundos';if(g.kind==='rectangle'||g.kind==='trapezoid')return i===1?'Lateral direita':'Lateral esquerda';return g.back!=null?`Lateral ${i+1}`:`Limite ${i+1}`}
 return {UTM,num,distance,signedArea,area,validate,build,rectangle,trapezoid,fromGeographic,fromCoordinates,fromSegments,geographic,convex,inset,footprint,label};
})();
if(typeof module!=='undefined')module.exports=ParcelGeometry;
