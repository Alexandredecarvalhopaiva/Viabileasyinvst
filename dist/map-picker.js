/* Location selection only. A pin is not a cadastral polygon or a registry lookup. */
const locationMapConfig={tileUrl:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',bounds:[[-7.3,-35],[-7,-34.75]],minZoom:13,maxZoom:19};
let locationPicker=null;
function mapPickerLookup(){const p=state.mapPickedPoint;return `<div class="map-pick-intro"><span class="map-pick-icon">${icon('pin')}</span><div><h3>Escolha o ponto direto no mapa.</h3><p>Mova o mapa até o pino ficar sobre o terreno e confirme a localização.</p></div></div>${p?`<p class="map-pick-last">Último ponto marcado: <strong>${number(p.lat,6)}, ${number(p.lng,6)}</strong></p>`:''}<div class="lookup-actions"><button class="btn primary" data-action="open-location-picker">${icon('pin')}${p?'Ajustar ponto no mapa':'Marcar no mapa'}</button></div><p class="lookup-help">Mapa de ruas OpenStreetMap · requer internet. A seleção informa coordenadas; o perímetro e a matrícula precisam de confirmação separada.</p>`}
function openLocationPicker(){
 if(!window.L){notify('O mapa não está disponível. Você pode informar as coordenadas manualmente.');return}
 const lat=decimalCoordinate(state.lookupValues.latitude),lng=decimalCoordinate(state.lookupValues.longitude);
 const initial=lat!==null&&lng!==null&&inDemoRegion(lat,lng)?[lat,lng]:state.lotConfirmed?[state.lot.lat,state.lot.lng]:[-7.115,-34.86];
 modal('Marque a localização do terreno.',`<p class="picker-instructions" id="picker-instructions">Arraste o mapa até o pino ficar no lugar certo. Você também pode tocar no ponto ou usar as setas do teclado com o mapa em foco.</p><div class="picker-stage"><div id="location-picker-map" role="region" aria-label="Mapa para marcar a localização do terreno" aria-describedby="picker-instructions" tabindex="0"></div><div class="picker-center-pin" aria-hidden="true"><svg class="icon" viewBox="0 0 44 55" aria-hidden="true"><path d="M22 1C10.4 1 1 10.4 1 22c0 15 21 33 21 33s21-18 21-33C43 10.4 33.6 1 22 1z"/><circle cx="22" cy="22" r="7" fill="white" stroke="none"/></svg><i></i></div><div class="picker-map-label">${icon('pin')}João Pessoa / PB</div><div class="picker-map-tools" role="group" aria-label="Controles do mapa"><button data-picker-control="zoom-in" aria-label="Aproximar mapa de localização">${icon('plus')}</button><button data-picker-control="zoom-out" aria-label="Afastar mapa de localização">${icon('minus')}</button><button data-picker-control="reset" aria-label="Voltar ao ponto inicial">${icon('target')}</button></div><div class="picker-map-error" id="picker-map-error" hidden><strong>Esta parte do mapa não carregou.</strong><p>Verifique a conexão e tente novamente, ou cancele para informar as coordenadas.</p><button class="btn" data-picker-control="retry">Tentar novamente</button></div></div><section class="picker-selection" aria-label="Ponto sob o pino"><div class="picker-selection-title">${icon('pin')}Localização do terreno</div><output id="picker-coordinates" aria-live="polite" aria-atomic="true"></output><p id="picker-map-status" role="status">Carregando mapa de ruas…</p><p class="picker-limit-note">O pino marca um ponto. Os limites e a área do lote ainda precisarão ser confirmados.</p></section>`,`<button class="btn" data-action="close-modal">Cancelar</button><button class="btn primary" id="confirm-map-point" data-picker-control="confirm" disabled>${icon('check')}Confirmar este ponto</button>`,true);
 $('.modal').classList.add('location-picker-modal');$('.modal-backdrop').classList.add('location-picker-backdrop');
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const map=L.map('location-picker-map',{zoomControl:false,scrollWheelZoom:false,keyboardPanDelta:40,minZoom:locationMapConfig.minZoom,maxZoom:locationMapConfig.maxZoom,maxBounds:locationMapConfig.bounds,maxBoundsViscosity:1,inertia:!reduced,zoomAnimation:!reduced,fadeAnimation:false}).setView(initial,17);
 const picker=locationPicker={map,initial,loaded:new Set(),failed:new Set(),ready:false,moving:false,center:null};
 map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>');
 const layer=L.tileLayer(locationMapConfig.tileUrl,{minZoom:locationMapConfig.minZoom,maxZoom:locationMapConfig.maxZoom,keepBuffer:1,updateWhenIdle:true,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'});
 picker.layer=layer;
 const key=c=>`${c.z}/${c.x}/${c.y}`;
 layer.on('tileload',e=>{picker.loaded.add(key(e.coords));picker.failed.delete(key(e.coords));updateLocationPicker()});
 layer.on('tileerror',e=>{picker.failed.add(key(e.coords));updateLocationPicker()});
 layer.addTo(map);
 map.on('movestart zoomstart',()=>{picker.moving=true;$('.picker-stage')?.classList.add('is-moving');picker.ready=false;$('#confirm-map-point').disabled=true});
 map.on('moveend zoomend',()=>{picker.moving=false;$('.picker-stage')?.classList.remove('is-moving');updateLocationPicker()});
 map.on('click',e=>map.panTo(e.latlng,{animate:false}));
 map.invalidateSize({pan:false});map.setView(initial,17,{animate:false});updateLocationPicker();
 picker.observer=new ResizeObserver(()=>{if(locationPicker===picker){const center=map.getCenter(),zoom=map.getZoom();map.invalidateSize({pan:false});map.setView(center,zoom,{animate:false});updateLocationPicker()}});picker.observer.observe($('#location-picker-map'));
}
function updateLocationPicker(){
 const p=locationPicker;if(!p||!$('#picker-coordinates'))return;
 const center=p.map.getCenter(),zoom=p.map.getZoom(),tile=p.map.project(center,zoom).divideBy(256).floor(),key=`${zoom}/${tile.x}/${tile.y}`;
 p.center={lat:Number(center.lat.toFixed(6)),lng:Number(center.lng.toFixed(6))};
 const inside=inDemoRegion(p.center.lat,p.center.lng),hasCenter=p.loaded.has(key),failed=p.failed.has(key);
 p.ready=inside&&hasCenter&&!p.moving;
 $('#picker-coordinates').innerHTML=`<span>Latitude <strong>${number(p.center.lat,6)}</strong></span><span>Longitude <strong>${number(p.center.lng,6)}</strong></span>`;
 $('#picker-map-status').textContent=!inside?'O ponto está fora do recorte de João Pessoa.':p.moving?'Ajustando a localização…':hasCenter?'Ponto sob o pino. Pronto para confirmar.':failed?'Não foi possível carregar o mapa neste ponto.':'Carregando mapa de ruas…';
 $('#picker-map-error').hidden=!failed||hasCenter;
 $('#confirm-map-point').disabled=!p.ready;
 $('[data-picker-control="zoom-in"]').disabled=zoom>=locationMapConfig.maxZoom;
 $('[data-picker-control="zoom-out"]').disabled=zoom<=locationMapConfig.minZoom;
}
function acceptLocationPicker(){const p=locationPicker;if(!p)return;updateLocationPicker();if(!p.ready)return;const point={...p.center,zoom:p.map.getZoom(),source:'OpenStreetMap',perimeter_verified:false};closeModal();state.mapPickedPoint=point;state.lookupMode='map';state.simpleLookupOpen=false;state.lookupValues={latitude:String(point.lat),longitude:String(point.lng),registration:'',office:'',address:''};runCoordinateSearch('map');$('#quick-area')?.focus();notify('Localização marcada. Informe a área e a frente para simular, ou importe o perímetro.')}
function disposeLocationPicker(){if(!locationPicker)return;const p=locationPicker;locationPicker=null;p.observer?.disconnect();p.map.remove()}
document.addEventListener('click',e=>{const b=e.target.closest('[data-picker-control]');if(!b||!locationPicker)return;const p=locationPicker;switch(b.dataset.pickerControl){case 'zoom-in':p.map.zoomIn(1,{animate:false});break;case 'zoom-out':p.map.zoomOut(1,{animate:false});break;case 'reset':p.map.setView(p.initial,17,{animate:false});break;case 'retry':p.failed.clear();p.layer.redraw();updateLocationPicker();break;case 'confirm':acceptLocationPicker();break}});
