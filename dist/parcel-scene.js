/* Extrudes the metric footprint of each floor inside its own setback envelope. */
function drawParcelScene(canvas){
 const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;
 const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);
 const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
 const W=r.width,H=r.height,g=getLotGeometry(),c=calc(),p=g.vertices,env=c.envelope;
 const xs=p.map(v=>v[0]),ys=p.map(v=>v[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2,w=Math.max(...xs)-Math.min(...xs),d=Math.max(...ys)-Math.min(...ys);
 const decor=canvas.dataset.canvas==='decor',scale=Math.min(W/(Math.hypot(w,d)*1.45),H/(Math.max(w,d)*.7+c.height*1.65))*state.zoom*.94;
 const angle=state.rotation,el=state.elevation,origin=[W*.5,H*.68],ccw=ParcelGeometry.signedArea(p)>0;
 const raw=(x,y,z=0)=>{x-=cx;y-=cy;const rx=x*Math.cos(angle)-y*Math.sin(angle),ry=x*Math.sin(angle)+y*Math.cos(angle);return [origin[0]+rx*scale,origin[1]+(ry*Math.sin(el)-z*Math.cos(el))*scale,ry*Math.cos(el)+z*Math.sin(el)]};
 const path=points=>{points.forEach((v,i)=>{const q=raw(...v);i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1])});ctx.closePath()};
 const poly=(points,fill,stroke='#fff8',dash=[])=>{ctx.beginPath();path(points);if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([])}};
 const line=(a,b,color='#1F8EA6',dash=[])=>{const x=raw(...a),y=raw(...b);ctx.beginPath();ctx.moveTo(x[0],x[1]);ctx.lineTo(y[0],y[1]);ctx.strokeStyle=color;ctx.lineWidth=1;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([])};
 const color=role=>role.includes('frente')||role==='Frente'?'#dc9844':role==='Fundos'?'#a786c5':'#679fbc';
 ctx.clearRect(0,0,W,H);
 const m=Math.max(w,d)*.75;
 if(!decor){for(let x=-m;x<=m;x+=Math.max(5,Math.ceil(m/20))){line([cx+x,cy-m,-.1],[cx+x,cy+m,-.1],'#1f8ea616');line([cx-m,cy+x,-.1],[cx+m,cy+x,-.1],'#1f8ea616')}}
 poly(p.map(v=>[...v,0]),'#e5eee4','#4d7355',[4,3]);
 if(state.setbacks&&!decor){
  ctx.save();ctx.beginPath();path(p.map(v=>[...v,.01]));ctx.clip();
  c.setbackRule.levels[0].edges.forEach((edge,i)=>{
   const a=p[i],b=p[(i+1)%p.length],len=ParcelGeometry.distance(a,b),sign=ccw?1:-1,n=[-(b[1]-a[1])/len*sign,(b[0]-a[0])/len*sign],distance=env.edgeOffsets[i];
   poly([[...a,.02],[...b,.02],[b[0]+n[0]*distance,b[1]+n[1]*distance,.02],[a[0]+n[0]*distance,a[1]+n[1]*distance,.02]],color(edge.role)+'68',null);
  });
  ctx.restore();
  for(const ring of env.paths)poly(ring.map(v=>[...v,.04]),'#ddf0e3','#3b8b69',[3,3]);
 }
 const faces=[];
 for(const plate of c.floorPlates){
  const z0=(plate.floor-1)*3+.1,z1=plate.floor*3;
  const over=c.buildingCapacity.source&&plate.floor>c.buildingCapacity.maxFloors;
  for(const building of ParcelGeometry.footprint(g,plate.area,plate.envelope)){
   building.forEach((a,i)=>{const b=building[(i+1)%building.length],points=[[...a,z0],[...b,z0],[...b,z1],[...a,z1]];faces.push({points,depth:points.reduce((s,v)=>s+raw(...v)[2],0)/4,color:(over?['#ca704b','#8f432d','#d48a62','#ac5638']:['#1f8ea6','#0f2d4a','#397885','#285b73'])[i%4]})});
   const roof=building.map(v=>[...v,z1]);
   faces.push({points:roof,depth:roof.reduce((sum,v)=>sum+raw(...v)[2],0)/roof.length,color:over?'#efc0a4':'#c9e6d9'});
  }
 }
 faces.sort((a,b)=>a.depth-b.depth);for(const face of faces)poly(face.points,face.color,'#e7f4ef9c');
 if(state.envelope&&!decor){
  for(const plate of c.floorPlates)for(const ring of plate.envelope.paths){
   poly(ring.map(v=>[...v,(plate.floor-1)*3+.06]),null,'#1d806c99',[4,4]);
   ring.forEach((a,i)=>{const b=ring[(i+1)%ring.length];line([...a,(plate.floor-1)*3],[...a,plate.floor*3],'#1d806c44',[3,4]);line([...a,plate.floor*3],[...b,plate.floor*3],'#1d806c66',[4,4])});
  }
 }
 if(!decor){
  if(c.footprint>.01&&state.elevation<1.3){
   const base=ParcelGeometry.footprint(g,c.floorPlates[0].area,c.floorPlates[0].envelope).flat();
   const anchor=base.reduce((a,b)=>raw(...a)[0]>raw(...b)[0]?a:b),ground=raw(...anchor,0),top=raw(...anchor,c.height);
   const x=Math.min(W-65,Math.max(ground[0],top[0])+22),spacing=Math.abs(raw(...anchor,3)[1]-ground[1]);
   const every=Math.max(1,Math.ceil(17/Math.max(1,spacing)));
   ctx.save();ctx.strokeStyle='#526779';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,ground[1]);ctx.lineTo(x,top[1]);ctx.stroke();
   for(const plate of c.floorPlates){
    const q=raw(...anchor,(plate.floor-.5)*3),over=c.buildingCapacity.source&&plate.floor>c.buildingCapacity.maxFloors;
    ctx.beginPath();ctx.moveTo(x-5,q[1]);ctx.lineTo(x+5,q[1]);ctx.strokeStyle=over?'#a33f26':'#526779';ctx.stroke();
    if(plate.floor!==1&&plate.floor!==state.floors&&((plate.floor-1)%every||(state.floors-plate.floor)*spacing<17))continue;
    ctx.font='600 11px sans-serif';
    const text=plate.floor===1?'Térreo':`${plate.floor-1}º andar`,width=ctx.measureText(text).width+10;ctx.textAlign='left';ctx.fillStyle='#fffffff0';ctx.fillRect(x+7,q[1]-8,width+5,16);ctx.fillStyle=over?'#a33f26':'#263e50';ctx.fillText(text,x+11,q[1]+4);
   }
   if(c.buildingCapacity.source&&c.buildingCapacity.maxFloors>0&&c.buildingCapacity.maxFloors<=state.floors){
    const q=raw(...anchor,c.buildingCapacity.maxFloors*3);
    ctx.setLineDash([4,3]);ctx.strokeStyle='#b45d36';ctx.beginPath();ctx.moveTo(Math.max(15,x-90),q[1]);ctx.lineTo(x+5,q[1]);ctx.stroke();ctx.setLineDash([]);
   }
   ctx.restore();
  }
  const label=(text,x,y,ink)=>{
   ctx.font='600 10px sans-serif';ctx.textAlign='center';
   const width=ctx.measureText(text).width+10,px=Math.max(width/2+5,Math.min(W-width/2-5,x)),py=Math.max(38,Math.min(H-33,y));
   ctx.fillStyle='#ffffffed';ctx.fillRect(px-width/2,py-10,width,16);ctx.fillStyle=ink;ctx.fillText(text,px,py+1);
  };
  if(state.setbacks){
   const chosen=p.length<=8?p.map((_,i)=>i):[g.front,...(g.back==null?[]:[g.back])];
   for(const i of chosen){
    const edge=c.setbackRule.levels[0].edges[i],a=p[i],b=p[(i+1)%p.length],len=ParcelGeometry.distance(a,b),sign=ccw?1:-1,n=[-(b[1]-a[1])/len*sign,(b[0]-a[0])/len*sign],distance=env.edgeOffsets[i],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2,.09],inside=[mid[0]+n[0]*distance,mid[1]+n[1]*distance,.09];
    line(mid,inside,color(edge.role));
    const u=raw(...mid),v=raw(...inside),dx=v[0]-u[0],dy=v[1]-u[1],length=Math.hypot(dx,dy)||1;
    for(const q of [u,v]){ctx.beginPath();ctx.moveTo(q[0]-dy/length*4,q[1]+dx/length*4);ctx.lineTo(q[0]+dy/length*4,q[1]-dx/length*4);ctx.strokeStyle=color(edge.role);ctx.stroke()}
    label(edge.role+' '+number(distance,2)+' m',(u[0]+v[0])/2+(i===g.front?0:n[0]*10),(u[1]+v[1])/2+(i===g.front?17:n[1]*10),'#263e50');
   }
  }
  const a=p[g.front],b=p[(g.front+1)%p.length],q=raw((a[0]+b[0])/2,(a[1]+b[1])/2,0);
  line([...a,.06],[...b,.06],'#0f2d4a');
  if(c.footprint<.01){ctx.font='12px sans-serif';ctx.fillStyle='#922626';ctx.fillText('Sem implantação após os recuos',12,40)}
 }
}
