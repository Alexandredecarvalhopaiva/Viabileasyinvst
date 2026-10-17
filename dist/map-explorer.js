/* Map exploration uses regional elevation data, never inferred building heights. */
const mapExplorerViews={
 aerial:{label:'Aérea',icon:'layers',help:'Imagem aérea de 2021 · veja casas e áreas livres.'},
 streets:{label:'Ruas',icon:'map',help:'Mapa de ruas · OpenStreetMap.'},
 relief:{label:'Relevo',icon:'mountain',help:'Sombras do relevo regional. Afaste o mapa para ver o entorno.'},
 terrain:{label:'3D',icon:'cube',help:'Relevo em 3D com ruas · sem modelos 3D das edificações.'}
};
function mapViewButtons(){return `<div class="picker-views" role="group" aria-label="Opções de visualização do mapa">${Object.entries(mapExplorerViews).map(([id,v])=>`<button data-picker-view="${id}" aria-pressed="${id==='aerial'}" ${id==='terrain'?'aria-label="Relevo em 3D"':''}>${icon(v.icon)}${v.label}</button>`).join('')}</div>`}
function mapCameraControls(){return `<div class="picker-camera" id="picker-camera" role="group" aria-label="Câmera do mapa" hidden><button data-camera="neighborhood" aria-label="Ver relevo do bairro">${icon('scan')}<span>Bairro</span></button><button data-camera="left" aria-label="Girar mapa para a esquerda">${icon('rotateLeft')}</button><button data-camera="right" aria-label="Girar mapa para a direita">${icon('rotate')}</button><button data-camera="pitch" aria-label="Alternar inclinação do mapa"><span id="picker-pitch">55°</span></button><button data-camera="north" aria-label="Orientar mapa para o norte"><span class="picker-north" id="picker-north">N</span></button></div>`}
function isMapExplorer(){return ['relief','terrain'].includes(locationPicker?.view)}
function updateMapViewButtons(){const p=locationPicker;if(!p)return;$$('[data-picker-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pickerView===p.view)));$('#picker-imagery-note').textContent=mapExplorerViews[p.view].help;$('#picker-camera').hidden=!isMapExplorer();$('#picker-camera').classList.toggle('is-relief',p.view==='relief')}
function closeMapExplorer(){const p=locationPicker;if(!p?.gl)return;const map=p.gl;p.gl=null;clearTimeout(p.glTimeout);map.remove();$('#location-explorer-map').hidden=true;$('#location-picker-map').hidden=false;p.moving=false}
function openMapExplorer(view){
 const p=locationPicker;if(!p)return;
 if(!window.maplibregl){notify('Este navegador não disponibilizou o relevo 3D. A vista aérea e as ruas continuam disponíveis.');return}
 const center=p.preservedCenter||(p.gl?p.gl.getCenter():p.map.getCenter()),zoom=p.gl?p.gl.getZoom():p.map.getZoom();
 closeMapExplorer();p.preservedCenter={lat:center.lat,lng:center.lng};p.view=view;p.ready=false;p.moving=false;p.glFailed=false;p.glComplete=false;
 $('#location-picker-map').hidden=true;$('#location-explorer-map').hidden=false;$('#picker-map-error').hidden=true;
 updateMapViewButtons();
 const dem={type:'raster-dem',tiles:['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],tileSize:512,encoding:'terrarium',maxzoom:12,attribution:'<a href="https://mapterhorn.com/attribution/" target="_blank" rel="noopener noreferrer">© Mapterhorn</a>'};
 let map;
 try{
  map=p.gl=new maplibregl.Map({container:'location-explorer-map',center:[center.lng,center.lat],zoom,minZoom:locationMapConfig.minZoom,maxZoom:locationMapConfig.maxZoom,maxBounds:[[-35,-7.3],[-34.75,-7]],pitch:view==='terrain'?55:0,bearing:0,maxPitch:65,attributionControl:false,scrollZoom:false,dragRotate:view==='terrain',pitchWithRotate:view==='terrain',touchPitch:view==='terrain',renderWorldCopies:false,fadeDuration:0,style:{version:8,sources:{streets:{type:'raster',tiles:[locationMapConfig.basemaps.streets.url],tileSize:256,maxzoom:19,attribution:locationMapConfig.basemaps.streets.attribution},terrain:dem,shade:{...dem}},layers:[{id:'background',type:'background',paint:{'background-color':'#edf5ea'}},{id:'streets',type:'raster',source:'streets',paint:{'raster-opacity':view==='relief'?.72:1}},{id:'relief',type:'hillshade',source:'shade',paint:{'hillshade-exaggeration':view==='relief'?.8:.35,'hillshade-shadow-color':'#244138','hillshade-highlight-color':'#fffde8','hillshade-accent-color':'#5A8F3D'}}],...(view==='terrain'?{terrain:{source:'terrain',exaggeration:1}}:{})}});
 }catch(e){p.gl=null;$('#location-explorer-map').hidden=true;$('#location-picker-map').hidden=false;p.view=p.basemap;updateMapViewButtons();updateLocationPicker();notify('O relevo não pôde abrir neste navegador. Você pode continuar pela vista aérea ou ruas.');return}
 map.addControl(new maplibregl.AttributionControl({compact:false}),'bottom-right');
 map.addControl(new maplibregl.ScaleControl({maxWidth:80,unit:'metric'}),'bottom-left');
 map.getCanvas().setAttribute('aria-label',view==='terrain'?'Mapa do relevo em 3D. Use as setas para mover e os controles para girar e inclinar.':'Mapa de relevo. Use as setas para mover.');
 const active=()=>locationPicker===p&&p.gl===map;
 const check=()=>{if(!active())return;p.glComplete=map.isStyleLoaded()&&map.isSourceLoaded('streets')&&map.isSourceLoaded('shade')&&(view!=='terrain'||map.isSourceLoaded('terrain'));if(p.glComplete){p.glFailed=false;clearTimeout(p.glTimeout)}updateLocationPicker()};
 map.on('load',check);map.on('idle',check);map.on('sourcedata',check);
 map.on('movestart',e=>{if(!active())return;if(e.originalEvent)p.preservedCenter=null;p.moving=true;p.ready=false;$('.picker-stage')?.classList.add('is-moving');$('#confirm-map-point').disabled=true});
 map.on('moveend',()=>{if(!active())return;p.moving=false;$('.picker-stage')?.classList.remove('is-moving');check()});
 for(const event of ['rotate','pitch'])map.on(event,()=>{if(active())updateMapCamera()});
 map.on('dragstart',()=>{if(active())p.preservedCenter=null});
 map.on('click',e=>{p.preservedCenter={lat:e.lngLat.lat,lng:e.lngLat.lng};map.jumpTo({center:e.lngLat})});
 map.getCanvas().addEventListener('keydown',e=>{if(e.key.startsWith('Arrow'))p.preservedCenter=null});
 map.on('error',()=>{if(!active())return;p.glFailed=true;updateLocationPicker()});
 map.on('webglcontextlost',()=>{if(!active())return;p.glFailed=true;p.glComplete=false;updateLocationPicker()});
 p.glTimeout=setTimeout(()=>{if(active()&&!p.glComplete){p.glFailed=true;updateLocationPicker()}},20000);
 map.resize();updateMapCamera();updateLocationPicker();
}
function updateMapCamera(){const map=locationPicker?.gl;if(!map)return;$('#picker-pitch').textContent=Math.round(map.getPitch())+'°';$('#picker-north').style.transform=`rotate(${-map.getBearing()}deg)`;$('#picker-north').parentElement.setAttribute('aria-label',`Orientar mapa para o norte. Rotação atual ${Math.round((map.getBearing()+360)%360)} graus`)}
function updateMapExplorer(){
 const p=locationPicker,map=p?.gl;if(!map)return;
 const center=p.preservedCenter||map.getCenter(),zoom=map.getZoom();p.center={lat:Number(center.lat.toFixed(6)),lng:Number(center.lng.toFixed(6))};
 p.ready=inDemoRegion(p.center.lat,p.center.lng)&&p.glComplete&&!p.glFailed&&!p.moving;
 $('#picker-coordinates').innerHTML=`<span>Latitude <strong>${number(p.center.lat,6)}</strong></span><span>Longitude <strong>${number(p.center.lng,6)}</strong></span>`;
 $('#picker-map-status').textContent=p.moving?'Ajustando a visualização…':p.glFailed?'O relevo não carregou. Você pode continuar pela vista de ruas.':p.ready?'Ponto sob o pino. Pronto para confirmar.':'Carregando o relevo do entorno…';
 $('#picker-map-error').hidden=!p.glFailed;$('#picker-error-title').textContent='Não foi possível carregar o relevo.';$('#picker-error-help').textContent='Tente novamente ou use a vista de ruas para marcar o terreno.';
 $('#picker-error-streets').hidden=false;$('[data-picker-control="retry"]').hidden=false;
 $('#confirm-map-point').disabled=!p.ready;
 $('[data-picker-control="zoom-in"]').disabled=zoom>=locationMapConfig.maxZoom;
 $('[data-picker-control="zoom-out"]').disabled=zoom<=locationMapConfig.minZoom;
 updateMapCamera();
}
document.addEventListener('click',e=>{
 const v=e.target.closest('[data-picker-view]');if(v&&locationPicker){const id=v.dataset.pickerView;if(id===locationPicker.view)return;if(['terrain','relief'].includes(id))openMapExplorer(id);else setLocationPickerBasemap(id);return}
 const b=e.target.closest('[data-camera]'),p=locationPicker;if(!b||!p?.gl)return;const map=p.gl;
 switch(b.dataset.camera){case 'neighborhood':map.jumpTo({zoom:14});break;case 'left':map.jumpTo({bearing:map.getBearing()-45});break;case 'right':map.jumpTo({bearing:map.getBearing()+45});break;case 'north':map.jumpTo({bearing:0});break;case 'pitch':map.jumpTo({pitch:map.getPitch()<30?55:0});break}
});
