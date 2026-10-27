/* Viewport sizing and read-only DOM measurements for the local audit fixture. */
const frame = document.querySelector('#fixture');
document.querySelector('#output').hidden = true;
let fit = true, running = false, measuringLoad = false;
const metrics = { lcp: null, cls: 0, interactions: [] };
const widthSelect = document.querySelector('#width'), heightSelect = document.querySelector('#height');
function resize(width = Number(widthSelect.value)) {
  const height = Number(heightSelect.value);
  frame.style.width = width + 'px'; frame.style.height = height + 'px';
  const scale = fit ? Math.min(1, (document.querySelector('#viewport').clientWidth - 24) / width) : 1;
  frame.style.transform = `scale(${scale})`;
  const space = document.querySelector('#frame-space'); space.style.width = width * scale + 'px'; space.style.height = height * scale + 'px';
}
widthSelect.onchange = () => resize(); heightSelect.onchange = () => resize();
document.querySelector('#fit').onclick = () => { fit = !fit; resize(); };
window.addEventListener('resize', () => resize());
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const visible = element => {
  const modal = frame.contentDocument.querySelector('dialog[open]');
  if (modal && !modal.contains(element)) return false;
  if (!element.getClientRects().length || element.closest('[hidden],[inert],[aria-hidden="true"],.sr-only,.ve-sr-only,.skip-link,.public-skip')) return false;
  const closed = element.closest('details:not([open])');
  if (closed && !element.closest('summary')) return false;
  const style = frame.contentWindow.getComputedStyle(element);
  return style.visibility !== 'hidden' && style.display !== 'none';
};
function rgb(color) { const c = color.match(/[\d.]+/g)?.map(Number); return c?.length >= 3 ? [c[0],c[1],c[2],c[3] ?? 1] : [0,0,0,0]; }
function luminance(c) { return c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0); }
function audit() {
  const doc = frame.contentDocument, win = frame.contentWindow;
  const width = doc.documentElement.clientWidth;
  const visibleElements = [...doc.querySelectorAll('body *')].filter(visible);
  const label = el => (el.getAttribute('aria-label') || el.textContent || el.id || el.className).toString().trim().replace(/\s+/g,' ').slice(0,90);
  const controls = visibleElements.filter(el=>el.matches('button,a[href],input:not([type=hidden]),select,textarea,summary,[role=button]'));
  const small = controls.filter(el=>{const target=el.matches('input[type=checkbox],input[type=radio]')&&el.labels?.length?el.labels[0]:el; const r=target.getBoundingClientRect();return r.width<24 || r.height<24;}).map(el=>({label:label(el),w:Math.round(el.getBoundingClientRect().width),h:Math.round(el.getBoundingClientRect().height)}));
  const unnamed = controls.filter(el=>!el.matches('input,select,textarea')&&!label(el));
  const fields = controls.filter(el=>el.matches('input:not([type=button]):not([type=submit]),select,textarea')&&!el.labels?.length&&!el.getAttribute('aria-label')&&!el.getAttribute('aria-labelledby'));
  const overflow = visibleElements.filter(el=>{
    const r=el.getBoundingClientRect(); if(r.width<1||r.height<1) return false;
    if(el.closest('.ve-scenario-list,.ve-comparison-table-wrap,.table-scroll,.map-container,.map-picker,.massing-canvas,.maplibregl-map,.leaflet-container,.map-svg,.map-options-list,.lookup-methods')) return false;
    if(el.tagName==='IMG'||el.closest('svg,.brand-art,.auth-illustration')) return false;
    return r.right>width+2 || r.left < -2;
  }).slice(0,15).map(el=>({tag:el.tagName,class:typeof el.className==='string'?el.className:'',label:label(el),right:Math.round(el.getBoundingClientRect().right)}));
  const contrast=[]; const tiny=[];
  for(const el of visibleElements) {
    if(![...el.childNodes].some(node=>node.nodeType===3&&node.textContent.trim()) || el.closest('svg,canvas')) continue;
    const style=win.getComputedStyle(el), size=parseFloat(style.fontSize), fg=rgb(style.color);
    if(size<12) tiny.push({text:label(el),size});
    let cursor=el, bg=[255,255,255,1], solid=null, opacity=1, gradient=false;
    while(cursor) { const s=win.getComputedStyle(cursor); opacity*=Number(s.opacity); if(s.backgroundImage!=='none')gradient=true; const c=rgb(s.backgroundColor); if(!solid&&c[3]>=.99)solid=c; cursor=cursor.parentElement; }
    if(gradient || opacity<.99 || !fg[3]) continue;
    if(solid)bg=solid;
    const a=luminance(fg), b=luminance(bg), ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    const min=size>=24||(size>=18.66&&Number(style.fontWeight)>=700)?3:4.5;
    if(ratio<min-.02)contrast.push({text:label(el),ratio:Number(ratio.toFixed(2)),size,color:style.color,background:bg.slice(0,3)});
  }
  return {title:doc.title,phase:document.querySelector('#phase').value,width:win.innerWidth,requestedWidth:Number(widthSelect.value),contentWidth:width,height:win.innerHeight,bodyState:doc.body.dataset.auth,
    pageOverflow:Math.max(doc.documentElement.scrollWidth,doc.body.scrollWidth)>width+1,
    overflow,smallTargets:small,unnamed:unnamed.map(label),unlabelledFields:fields.map(el=>el.id||el.name),contrast:contrast.slice(0,60),contrastCount:contrast.length,tinyText:tiny.slice(0,30),tinyTextCount:tiny.length,
    mapLibraryLoaded:!!doc.querySelector('script[src*="maplibre-gl.js"]'),
    missingAlt:visibleElements.filter(el=>el.matches('img:not([alt])')).length,
    headings:visibleElements.filter(el=>el.matches('h1,h2')).map(el=>({level:el.tagName,text:label(el)})),
    renderer:doc.querySelector('.ve-experience')?.dataset.renderer,metrics:{...metrics},
  };
}
async function save(results) { await fetch('/__audit-results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(results)}); document.querySelector('#output').textContent=JSON.stringify(results,null,2); }
document.querySelector('#measure').onclick=async()=>{const result=audit();await save([result]);document.querySelector('#status').textContent=`${result.title} · ${result.contrastCount} contrastes · ${result.smallTargets.length} alvos`;};
document.querySelector('#matrix').onclick=async()=>{
  if(running)return; running=true; const original=Number(widthSelect.value);const results=[];
  for(const width of [320,375,390,768,1024,1280,1440,1920]) { widthSelect.value=width; resize(width);await wait(180);
    let low=width-1, high=width+1;
    for(let n=0;n<8 && frame.contentWindow.innerWidth!==width;n++) {
      const actual=frame.contentWindow.innerWidth, current=parseFloat(frame.style.width);
      if(actual<width)low=current;else high=current;
      frame.style.width=((low+high)/2)+'px';await wait(80);
    }
    results.push(audit());document.querySelector('#status').textContent=`Medindo ${width} px…`; }
  resize(original); widthSelect.value=original; await save(results);running=false;document.querySelector('#status').textContent='Matriz concluída · 8 larguras';
};
const loadButton=document.createElement('button');loadButton.textContent='Medir carregamento';document.querySelector('header').append(loadButton);
loadButton.onclick=()=>{measuringLoad=true;metrics.lcp=null;metrics.cls=0;metrics.interactions=[];document.querySelector('#status').textContent='Medindo carregamento…';frame.src='/?audit-load='+Date.now();};
frame.addEventListener('load',()=>{
  if(!measuringLoad)document.querySelector('#status').textContent='Pronto';resize();
  if(measuringLoad)setTimeout(async()=>{await save([audit()]);measuringLoad=false;document.querySelector('#status').textContent='Carregamento medido';},3000);
  try {
    const w=frame.contentWindow;
    const lcp=new w.PerformanceObserver(list=>{for(const e of list.getEntries())metrics.lcp=Math.round(e.startTime);});lcp.observe({type:'largest-contentful-paint',buffered:true});
    const cls=new w.PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)metrics.cls+=e.value;});cls.observe({type:'layout-shift',buffered:true});
    const inp=new w.PerformanceObserver(list=>{for(const e of list.getEntries())if(e.interactionId)metrics.interactions.push(e.duration);});inp.observe({type:'event',buffered:true,durationThreshold:16});
  } catch { /* Browser support is reported as null metrics, never a pass. */ }
});
resize();
