/* Location selection only. Aerial imagery and a pin are not a cadastral boundary. */
const locationMapConfig={
 bounds:[[-7.3,-35],[-7,-34.75]],minZoom:13,maxZoom:19,initialZoom:18,
 basemaps:{
  aerial:{label:'Vista aérea',source:'Filipeia/SEPLAN/PMJP',year:2021,url:'https://filipeia.joaopessoa.pb.gov.br/geoserver/wms',layer:'digeoc:2021_20cm',bounds:[[-7.248236624911639,-34.97299310357551],[-7.05539991065289,-34.792646551423914]],attribution:'<a href="https://filipeia.joaopessoa.pb.gov.br/" target="_blank" rel="noopener noreferrer">Filipeia/SEPLAN/PMJP</a> · Ortofoto 2021'},
  streets:{label:'Ruas',source:'OpenStreetMap',url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'}
 }
};
let locationPicker=null;
function mapPickerLookup(){const p=state.mapPickedPoint;return `<div class="map-pick-intro"><span class="map-pick-icon">${icon('pin')}</span><div><h3>Veja as casas e encontre o terreno.</h3><p>Explore a vista aérea ou o mapa de ruas. Mova o mapa até o pino ficar sobre o terreno e confirme a localização.</p></div></div>${p?`<p class="map-pick-last">Último ponto marcado: <strong>${number(p.lat,6)}, ${number(p.lng,6)}</strong></p>`:''}<div class="lookup-actions"><button class="btn primary" data-action="open-location-picker">${icon('pin')}${p?'Ver ponto no mapa':'Marcar no mapa'}</button></div><p class="lookup-help">Imagens aéreas de 2021 · Filipeia/SEPLAN/PMJP. Requer internet. O pino informa a localização; não identifica os limites legais do imóvel.</p>`}
function openLocationPicker(){
 if(!window.L){notify('O mapa não está disponível. Você pode informar as coordenadas manualmente.');return}
 const lat=decimalCoordinate(state.lookupValues.latitude),lng=decimalCoordinate(state.lookupValues.longitude);
 const initial=lat!==null&&lng!==null&&inDemoRegion(lat,lng)?[lat,lng]:state.lotConfirmed?[state.lot.lat,state.lot.lng]:[-7.115,-34.86];
 const initialZoom=state.mapPickedPoint?.lat===lat&&state.mapPickedPoint?.lng===lng?state.mapPickedPoint.zoom:locationMapConfig.initialZoom;
 modal('Veja o terreno e marque o ponto.',`<p class="picker-instructions" id="picker-instructions">Veja casas e terrenos na vista aérea. Arraste o mapa ou toque no local para posicionar o pino. Com o mapa em foco, use as setas do teclado.</p><div class="picker-stage"><div id="location-picker-map" role="region" aria-label="Mapa para marcar a localização do terreno" aria-describedby="picker-instructions picker-imagery-note" tabindex="0"></div><div class="picker-center-pin" aria-hidden="true"><svg class="icon" viewBox="0 0 44 55" aria-hidden="true"><path d="M22 1C10.4 1 1 10.4 1 22c0 15 21 33 21 33s21-18 21-33C43 10.4 33.6 1 22 1z"/><circle cx="22" cy="22" r="7" fill="white" stroke="none"/></svg><i></i></div><div class="picker-basemaps" role="group" aria-label="Visualização do mapa"><button data-picker-control="aerial" aria-pressed="true">${icon('layers')}Vista aérea</button><button data-picker-control="streets" aria-pressed="false">${icon('map')}Ruas</button></div><div class="picker-map-tools" role="group" aria-label="Controles do mapa"><button data-picker-control="zoom-in" aria-label="Aproximar mapa de localização">${icon('plus')}</button><button data-picker-control="zoom-out" aria-label="Afastar mapa de localização">${icon('minus')}</button><button data-picker-control="reset" aria-label="Voltar ao ponto inicial">${icon('target')}</button></div><div class="picker-map-error" id="picker-map-error" hidden><strong id="picker-error-title">Esta parte do mapa não carregou.</strong><p id="picker-error-help">Tente novamente ou alterne a visualização.</p><div><button class="btn" data-picker-control="retry">Tentar novamente</button><button class="btn" id="picker-error-streets" data-picker-control="streets">Ver ruas</button></div></div></div><section class="picker-selection" aria-label="Ponto sob o pino"><div class="picker-selection-title">${icon('pin')}Localização do terreno <span>João Pessoa / PB</span></div><output id="picker-coordinates" aria-live="polite" aria-atomic="true"></output><p id="picker-map-status" role="status">Carregando vista aérea…</p><p class="picker-imagery-note" id="picker-imagery-note">Imagem aérea de 2021 · não é uma imagem em tempo real.</p><p class="picker-limit-note">O pino marca a localização. Os limites e a área do terreno precisam de confirmação.</p></section>`,`<button class="btn" data-action="close-modal">Cancelar</button><button class="btn primary" id="confirm-map-point" data-picker-control="confirm" disabled>${icon('check')}Confirmar este ponto</button>`,true);
 $('.modal').classList.add('location-picker-modal');$('.modal-backdrop').classList.add('location-picker-backdrop');
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const map=L.map('location-picker-map',{zoomControl:false,scrollWheelZoom:false,keyboardPanDelta:40,minZoom:locationMapConfig.minZoom,maxZoom:locationMapConfig.maxZoom,maxBounds:locationMapConfig.bounds,maxBoundsViscosity:1,inertia:!reduced,zoomAnimation:!reduced,fadeAnimation:false}).setView(initial,initialZoom);
 const picker=locationPicker={map,initial,initialZoom,basemap:null,loaded:new Set(),failed:new Set(),ready:false,moving:false,center:null};
 map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>');
 L.control.scale({imperial:false,maxWidth:90,position:'bottomleft'}).addTo(map);
 map.on('movestart zoomstart',()=>{picker.moving=true;$('.picker-stage')?.classList.add('is-moving');picker.ready=false;$('#confirm-map-point').disabled=true});
 map.on('moveend zoomend',()=>{picker.moving=false;$('.picker-stage')?.classList.remove('is-moving');updateLocationPicker()});
 map.on('click',e=>map.panTo(e.latlng,{animate:false}));
 setLocationPickerBasemap('aerial');
 map.invalidateSize({pan:false});map.setView(initial,initialZoom,{animate:false});updateLocationPicker();
 picker.observer=new ResizeObserver(()=>{if(locationPicker===picker){const center=map.getCenter(),zoom=map.getZoom();map.invalidateSize({pan:false});map.setView(center,zoom,{animate:false});updateLocationPicker()}});picker.observer.observe($('#location-picker-map'));
}
function setLocationPickerBasemap(id){
 const p=locationPicker,config=locationMapConfig.basemaps[id];if(!p||!config||p.basemap===id)return;
 if(p.layer)p.map.removeLayer(p.layer);
 p.basemap=id;p.loaded.clear();p.failed.clear();p.ready=false;
 const options={minZoom:locationMapConfig.minZoom,maxZoom:locationMapConfig.maxZoom,keepBuffer:1,updateWhenIdle:true,attribution:config.attribution};
 const layer=id==='aerial'?L.tileLayer.wms(config.url,{...options,layers:config.layer,format:'image/jpeg',transparent:false,version:'1.1.1',bounds:config.bounds}):L.tileLayer(config.url,options);
 p.layer=layer;
 const key=c=>`${c.z}/${c.x}/${c.y}`;
 layer.on('tileload',e=>{if(locationPicker!==p||p.layer!==layer)return;p.loaded.add(key(e.coords));p.failed.delete(key(e.coords));updateLocationPicker()});
 layer.on('tileerror',e=>{if(locationPicker!==p||p.layer!==layer)return;p.failed.add(key(e.coords));updateLocationPicker()});
 layer.addTo(p.map);
 $$('.picker-basemaps button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pickerControl===id)));
 $('#location-picker-map').setAttribute('aria-label',id==='aerial'?'Vista aérea para marcar a localização do terreno':'Mapa de ruas para marcar a localização do terreno');
 $('#picker-imagery-note').textContent=id==='aerial'?'Imagem aérea de 2021 · não é uma imagem em tempo real.':'Mapa de ruas · OpenStreetMap.';
 $('#picker-error-streets').hidden=id==='streets';
 updateLocationPicker();
}
function updateLocationPicker(){
 const p=locationPicker;if(!p||!$('#picker-coordinates'))return;
 const center=p.map.getCenter(),zoom=p.map.getZoom(),tile=p.map.project(center,zoom).divideBy(256).floor(),key=`${zoom}/${tile.x}/${tile.y}`;
 p.center={lat:Number(center.lat.toFixed(6)),lng:Number(center.lng.toFixed(6))};
 const inside=inDemoRegion(p.center.lat,p.center.lng),outsideImage=p.basemap==='aerial'&&!L.latLngBounds(locationMapConfig.basemaps.aerial.bounds).contains(center),hasCenter=!outsideImage&&p.loaded.has(key),failed=p.failed.has(key);
 p.ready=inside&&hasCenter&&!p.moving;
 $('#picker-coordinates').innerHTML=`<span>Latitude <strong>${number(p.center.lat,6)}</strong></span><span>Longitude <strong>${number(p.center.lng,6)}</strong></span>`;
 $('#picker-map-status').textContent=!inside?'O ponto está fora do recorte de João Pessoa.':p.moving?'Ajustando a localização…':outsideImage?'Sem cobertura aérea neste ponto. Use a vista de ruas.':hasCenter?'Ponto sob o pino. Pronto para confirmar.':failed?'Não foi possível carregar o mapa neste ponto.':p.basemap==='aerial'?'Carregando vista aérea…':'Carregando mapa de ruas…';
 $('#picker-map-error').hidden=!(outsideImage||failed&&!hasCenter);
 $('#picker-error-title').textContent=outsideImage?'Sem imagem aérea nesta região.':'Esta parte do mapa não carregou.';
 $('#picker-error-help').textContent=outsideImage?'Alterne para Ruas para continuar a seleção.':'Verifique a conexão. Tente novamente ou alterne a visualização.';
 $('[data-picker-control="retry"]').hidden=outsideImage;
 $('#confirm-map-point').disabled=!p.ready;
 $('[data-picker-control="zoom-in"]').disabled=zoom>=locationMapConfig.maxZoom;
 $('[data-picker-control="zoom-out"]').disabled=zoom<=locationMapConfig.minZoom;
}
function acceptLocationPicker(){const p=locationPicker;if(!p)return;updateLocationPicker();if(!p.ready)return;const config=locationMapConfig.basemaps[p.basemap],point={...p.center,zoom:p.map.getZoom(),basemap:p.basemap,source:config.source,imagery_year:config.year||null,perimeter_verified:false};closeModal();state.mapPickedPoint=point;state.lookupMode='map';state.simpleLookupOpen=false;state.lookupValues={latitude:String(point.lat),longitude:String(point.lng),registration:'',office:'',address:''};runCoordinateSearch('map');$('#quick-area')?.focus();notify('Localização marcada. Informe a área e a frente para simular, ou importe o perímetro.')}
function disposeLocationPicker(){if(!locationPicker)return;const p=locationPicker;locationPicker=null;p.observer?.disconnect();p.map.remove()}
document.addEventListener('click',e=>{const b=e.target.closest('[data-picker-control]');if(!b||!locationPicker)return;const p=locationPicker;switch(b.dataset.pickerControl){case 'aerial':case 'streets':setLocationPickerBasemap(b.dataset.pickerControl);break;case 'zoom-in':p.map.zoomIn(1,{animate:false});break;case 'zoom-out':p.map.zoomOut(1,{animate:false});break;case 'reset':p.map.setView(p.initial,p.initialZoom,{animate:false});break;case 'retry':p.loaded.clear();p.failed.clear();p.layer.redraw();updateLocationPicker();break;case 'confirm':acceptLocationPicker();break}});
