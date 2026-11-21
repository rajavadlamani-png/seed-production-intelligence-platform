/* GPS Boundary Intelligence — Google Maps visual inspection + GPS geometry checks.
   Google imagery is displayed only. No image scraping, tracing, feature extraction or AI analysis. */
(function () {
  'use strict';

  const KEY_STORAGE = 'sageharvest.gpsBoundary.googleMapsApiKey.v1';
  let mapInstance = null;
  let polygonOverlay = null;
  let pointOverlays = [];
  let mapsLoadPromise = null;
  let activeRecord = null;
  let activeList = [];
  let showVertices = true;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]);
    });
  }
  function getKey() {
    try { return localStorage.getItem(KEY_STORAGE) || ''; } catch (_) { return ''; }
  }
  function saveKey(value) {
    try { localStorage.setItem(KEY_STORAGE, value); return true; } catch (_) { return false; }
  }
  function pointsFor(record) {
    return (Array.isArray(record && record.boundaryPoints) ? record.boundaryPoints : [])
      .map(function (p) { return {lat:Number(p.lat), lng:Number(p.lon), accuracy:Number(p.accuracy)}; })
      .filter(function (p) { return Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180; });
  }
  function uniquePath(points) {
    const path = points.map(function (p) { return {lat:p.lat, lng:p.lng}; });
    if (path.length > 1) {
      const a = path[0], b = path[path.length - 1];
      if (Math.abs(a.lat-b.lat) < 1e-9 && Math.abs(a.lng-b.lng) < 1e-9) path.pop();
    }
    return path;
  }
  function cross(a,b,c) { return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x); }
  function onSegment(a,b,p) {
    return Math.abs(cross(a,b,p)) < 1e-10 &&
      p.x >= Math.min(a.x,b.x)-1e-10 && p.x <= Math.max(a.x,b.x)+1e-10 &&
      p.y >= Math.min(a.y,b.y)-1e-10 && p.y <= Math.max(a.y,b.y)+1e-10;
  }
  function segmentsIntersect(a,b,c,d) {
    const ab1=cross(a,b,c), ab2=cross(a,b,d), cd1=cross(c,d,a), cd2=cross(c,d,b);
    if (((ab1>0&&ab2<0)||(ab1<0&&ab2>0)) && ((cd1>0&&cd2<0)||(cd1<0&&cd2>0))) return true;
    return onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);
  }
  function areaAcres(points) {
    if (points.length < 3) return 0;
    const radius=6371008.8, meanLat=points.reduce((s,p)=>s+p.lat,0)/points.length*Math.PI/180;
    const xy=points.map(function(p){return {x:radius*p.lng*Math.PI/180*Math.cos(meanLat),y:radius*p.lat*Math.PI/180};});
    let twice=0;
    for(let i=0;i<xy.length;i++){const a=xy[i],b=xy[(i+1)%xy.length];twice+=a.x*b.y-b.x*a.y;}
    return Math.abs(twice/2)/4046.8564224;
  }
  function assess(record) {
    const raw=Array.isArray(record && record.boundaryPoints)?record.boundaryPoints:[];
    const points=pointsFor(record), path=uniquePath(points), flags=[];
    if(raw.length<3 || path.length<3) flags.push('Fewer than three usable boundary points');
    if(points.length!==raw.length) flags.push('One or more GPS coordinates are invalid');
    const seen=new Set(), duplicates=[];
    path.forEach(function(p){const k=p.lat.toFixed(7)+','+p.lng.toFixed(7);if(seen.has(k))duplicates.push(k);seen.add(k);});
    if(duplicates.length) flags.push('Duplicate GPS coordinates detected');
    let selfCross=false;
    if(path.length>=4){
      const xy=path.map(function(p){return {x:p.lng*Math.cos(p.lat*Math.PI/180),y:p.lat};});
      for(let i=0;i<xy.length&&!selfCross;i++){
        const i2=(i+1)%xy.length;
        for(let j=i+1;j<xy.length;j++){
          const j2=(j+1)%xy.length;
          if(i===j||i2===j||j2===i)continue;
          if(segmentsIntersect(xy[i],xy[i2],xy[j],xy[j2])){selfCross=true;break;}
        }
      }
    }
    if(selfCross) flags.push('Polygon appears to self-intersect');
    const accuracies=points.map(function(p){return p.accuracy;}).filter(function(v){return Number.isFinite(v)&&v>0;});
    const maxAccuracy=accuracies.length?Math.max.apply(null,accuracies):null;
    const meanAccuracy=accuracies.length?accuracies.reduce(function(a,b){return a+b;},0)/accuracies.length:null;
    if(!accuracies.length)flags.push('GPS accuracy metadata is unavailable');
    else if(maxAccuracy>30)flags.push('At least one captured point has GPS accuracy worse than 30 m');
    const calculated=path.length>=3?areaAcres(path):0;
    const registered=Number(record && record.actualArea);
    const assigned=Number(record && record.assignedAcres);
    const acreageReference=Number.isFinite(assigned)&&assigned>0?assigned:null;
    const acreageVariance=acreageReference&&calculated>0?(calculated-acreageReference)/acreageReference*100:null;
    if(acreageVariance!==null&&Math.abs(acreageVariance)>10)flags.push('GPS area differs from assigned acreage by more than 10%');
    return {path:path,calculatedArea:calculated,registeredArea:Number.isFinite(registered)&&registered>0?registered:null,
      maxAccuracy:maxAccuracy,meanAccuracy:meanAccuracy,acreageReference:acreageReference,acreageVariance:acreageVariance,
      selfIntersect:selfCross,flags:flags,valid:path.length>=3&&!selfCross&&points.length===raw.length};
  }
  function fieldOptions(list, selectedId) {
    return list.map(function(r){
      const label=(r.fieldNo||'Unnumbered field')+' · '+(r.name||r.village||'');
      return '<option value="'+esc(r.id)+'" '+(String(r.id)===String(selectedId)?'selected':'')+'>'+esc(label)+'</option>';
    }).join('');
  }
  function page(list) {
    activeList=Array.isArray(list)?list:[];
    const preferred=activeList.find(function(r){return String(r.id)===String(activeRecord && activeRecord.id);}) ||
      activeList.find(function(r){return Array.isArray(r.boundaryPoints)&&r.boundaryPoints.length>=3;}) || activeList[0] || null;
    activeRecord=preferred;
    const a=preferred?assess(preferred):null;
    const keyConfigured=!!getKey();
    const mapMessage=keyConfigured?'Google Maps key is configured in this browser. Select Load imagery to open the map.':'Add a restricted Google Maps API key to load satellite imagery.';
    return '<div class="page-heading"><div><p class="eyebrow">GEOSPATIAL FIELD QUALITY</p><h1>GPS Boundary Intelligence</h1><p class="muted">Inspect registered field polygons over Google satellite imagery and review GPS geometry quality.</p></div><span class="status-chip planned">VISUAL INSPECTION</span></div>'+
      '<section class="panel gps-boundary-panel"><div class="gps-boundary-toolbar">'+
      '<label>Company field<select id="gpsBoundaryField" '+(activeList.length?'':'disabled')+'>'+fieldOptions(activeList,preferred&&preferred.id)+'</select></label>'+
      '<label class="gps-boundary-key-label">Google Maps API key<input id="gpsBoundaryApiKey" type="password" autocomplete="off" placeholder="Paste restricted browser API key" value=""></label>'+
      '<button type="button" class="primary" id="gpsBoundaryLoadMap">Load imagery</button>'+
      '<button type="button" class="outline" id="gpsBoundaryClearKey">Clear key</button></div>'+
      '<p class="gps-boundary-key-note" id="gpsBoundaryKeyStatus">'+esc(mapMessage)+' The key is stored only in this browser. Restrict it by HTTP referrer and Maps JavaScript API in Google Cloud.</p>'+
      '<div class="gps-boundary-map-actions"><button type="button" class="outline" id="gpsBoundaryZoom" '+(a&&a.path.length>=3?'':'disabled')+'>Zoom to field</button><button type="button" class="outline" id="gpsBoundaryVertices" '+(a&&a.path.length>=3?'':'disabled')+'>'+ (showVertices?'Hide':'Show') +' GPS points</button><a class="outline gps-boundary-google-link" id="gpsBoundaryOpenGoogle" href="https://www.google.com/maps" target="_blank" rel="noopener">Open in Google Maps ↗</a></div>'+
      '<div class="gps-boundary-map-wrap"><div id="gpsBoundaryMap" class="gps-boundary-map" role="region" aria-label="Google satellite map showing the selected GPS field boundary"><div class="gps-boundary-map-placeholder"><strong>Google satellite imagery</strong><span>'+esc(mapMessage)+'</span></div></div></div>'+
      '<p class="gps-boundary-map-caption">Google satellite imagery is used for visual inspection only. Imagery availability, age and zoom detail vary by location.</p></section>'+
      '<section class="panel gps-boundary-assessment"><div class="panel-head"><div><h2>GPS geometry assessment</h2><p class="muted">Checks are calculated from the saved GPS coordinates, not from Google imagery.</p></div><span class="status-chip '+(a&&a.valid&&a.flags.length===0?'complete':'planned')+'">'+(a?(a.flags.length?'REVIEW':'NO GEOMETRY FLAGS'):'NO FIELD SELECTED')+'</span></div>'+
      (preferred?assessmentMarkup(preferred,a):'<div class="gps-boundary-empty">No company field records are available in the current view.</div>')+
      '<p class="gps-boundary-disclaimer">These checks identify coordinate and geometry issues. They do not establish that the polygon matches the physical field edge. Visual confirmation by an authorised reviewer is still required.</p></section>'+
      '<section class="panel gps-boundary-guidance"><h2>Google Maps setup</h2><ol><li>Create or select a Google Cloud project and enable the Maps JavaScript API.</li><li>Create a browser API key with HTTP referrer restrictions for the deployed application domain.</li><li>Restrict the key to the Maps JavaScript API only and enable billing/usage limits.</li><li>Paste the key above. It is saved in this browser local storage and is not written to Supabase or GitHub.</li></ol><p><a href="https://developers.google.com/maps/documentation/javascript/get-api-key" target="_blank" rel="noopener">Google Maps API key setup guide ↗</a></p></section>';
  }
  function assessmentMarkup(record,a) {
    const flags=a.flags.length?'<ul class="gps-boundary-flags">'+a.flags.map(function(f){return '<li>'+esc(f)+'</li>';}).join('')+'</ul>':'<p class="gps-boundary-ok">No geometry issues detected by the current checks.</p>';
    return '<div class="gps-boundary-summary"><div><small>FIELD</small><b>'+esc(record.fieldNo||'—')+'</b></div><div><small>GPS POINTS</small><b>'+a.path.length+'</b></div><div><small>CALCULATED POLYGON AREA</small><b>'+(a.calculatedArea>0?a.calculatedArea.toFixed(2)+' ac':'—')+'</b></div><div><small>RECORDED GPS AREA</small><b>'+(a.registeredArea!==null?a.registeredArea.toFixed(2)+' ac':'—')+'</b></div><div><small>MEAN GPS ACCURACY</small><b>'+(a.meanAccuracy!==null?'±'+a.meanAccuracy.toFixed(1)+' m':'Not recorded')+'</b></div><div><small>ASSIGNED AREA VARIANCE</small><b>'+(a.acreageVariance!==null?(a.acreageVariance>0?'+':'')+a.acreageVariance.toFixed(1)+'%':'Not comparable')+'</b></div></div>'+flags;
  }
  function loadMaps(key) {
    if(window.google&&window.google.maps)return Promise.resolve(window.google.maps);
    if(mapsLoadPromise)return mapsLoadPromise;
    mapsLoadPromise=new Promise(function(resolve,reject){
      const old=document.querySelector('script[data-gps-boundary-google-maps]');
      if(old){old.addEventListener('load',function(){resolve(window.google.maps);},{once:true});old.addEventListener('error',function(){reject(new Error('Google Maps could not be loaded. Check the API key, billing and referrer restrictions.'));},{once:true});return;}
      const script=document.createElement('script');
      script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&v=weekly';
      script.async=true;script.defer=true;script.dataset.gpsBoundaryGoogleMaps='true';
      script.onload=function(){if(window.google&&window.google.maps)resolve(window.google.maps);else reject(new Error('Google Maps loaded without the Maps JavaScript API.'));};
      script.onerror=function(){reject(new Error('Google Maps could not be loaded. Check network access and the API key.'));};
      document.head.appendChild(script);
    }).catch(function(error){mapsLoadPromise=null;throw error;});
    return mapsLoadPromise;
  }
  function clearOverlays() {
    if(polygonOverlay){polygonOverlay.setMap(null);polygonOverlay=null;}
    pointOverlays.forEach(function(o){o.setMap(null);});pointOverlays=[];
  }
  function updateGoogleLink(record,assessment) {
    const link=document.getElementById('gpsBoundaryOpenGoogle');
    if(!link)return;
    if(assessment.path.length>=3){
      const p=assessment.path[0];
      link.href='https://www.google.com/maps/@'+p.lat+','+p.lng+',19z/data=!3m1!1e3';
    } else link.href='https://www.google.com/maps';
  }
  function drawSelected() {
    const record=activeRecord,assessment=record?assess(record):null,container=document.getElementById('gpsBoundaryMap');
    if(!container||!mapInstance)return;
    clearOverlays();
    if(!assessment||assessment.path.length<3){
      mapInstance.setCenter({lat:20.5937,lng:78.9629});
      mapInstance.setZoom(5);
      return;
    }
    const bounds=new google.maps.LatLngBounds();
    assessment.path.forEach(function(p){bounds.extend(p);});
    polygonOverlay=new google.maps.Polygon({paths:assessment.path,strokeColor:'#e3b34e',strokeOpacity:1,strokeWeight:3,fillColor:'#e3b34e',fillOpacity:0.18,clickable:false,map:mapInstance});
    if(showVertices)assessment.path.forEach(function(p,index){
      const marker=new google.maps.Circle({center:p,radius:2.2,strokeColor:'#ffffff',strokeOpacity:1,strokeWeight:1,fillColor:'#174b35',fillOpacity:1,map:mapInstance});
      pointOverlays.push(marker);
    });
    mapInstance.fitBounds(bounds,48);
    google.maps.event.addListenerOnce(mapInstance,'idle',function(){if(mapInstance.getZoom()>20)mapInstance.setZoom(20);});
    updateGoogleLink(record,assessment);
  }
  async function initialiseMap() {
    const keyInput=document.getElementById('gpsBoundaryApiKey');
    const status=document.getElementById('gpsBoundaryKeyStatus');
    const mapEl=document.getElementById('gpsBoundaryMap');
    const key=(keyInput&&keyInput.value.trim())||getKey();
    if(!key){if(status)status.textContent='A Google Maps API key is required. Create a referrer-restricted key and paste it above.';return;}
    if(!saveKey(key)){if(status)status.textContent='This browser blocked local storage. Enable site storage and try again.';return;}
    if(status)status.textContent='Loading Google satellite imagery…';
    try{
      await loadMaps(key);
      if(!mapEl||!mapEl.isConnected)return;
      const record=activeRecord,assessment=record?assess(record):null;
      const center=assessment&&assessment.path.length?assessment.path[0]:{lat:20.5937,lng:78.9629};
      mapEl.innerHTML='';
      mapInstance=new google.maps.Map(mapEl,{center:center,zoom:assessment&&assessment.path.length>=3?18:5,mapTypeId:'satellite',mapTypeControl:true,mapTypeControlOptions:{mapTypeIds:['satellite','hybrid','roadmap']},streetViewControl:false,fullscreenControl:true,gestureHandling:'greedy'});
      if(status)status.textContent='Google Maps loaded. Imagery is displayed for visual inspection only.';
      drawSelected();
    }catch(error){if(status)status.textContent=error.message||'Google Maps failed to load.';mapEl.innerHTML='<div class="gps-boundary-map-placeholder"><strong>Map could not be loaded</strong><span>'+esc(error.message||'Check API key, billing and referrer restrictions.')+'</span></div>';}
  }
  function bind(list) {
    activeList=Array.isArray(list)?list:[];
    const select=document.getElementById('gpsBoundaryField');
    const keyInput=document.getElementById('gpsBoundaryApiKey');
    const status=document.getElementById('gpsBoundaryKeyStatus');
    const saved=getKey();
    if(keyInput&&saved)keyInput.placeholder='Key saved in this browser — paste to replace';
    if(select)select.addEventListener('change',function(){
      activeRecord=activeList.find(function(r){return String(r.id)===String(select.value);})||null;
      const container=document.getElementById('gpsBoundaryMap');
      if(mapInstance&&container){drawSelected();}
      const assessment=activeRecord?assess(activeRecord):null;
      const summary=document.querySelector('.gps-boundary-assessment');
      if(summary)summary.innerHTML='<div class="panel-head"><div><h2>GPS geometry assessment</h2><p class="muted">Checks are calculated from the saved GPS coordinates, not from Google imagery.</p></div><span class="status-chip '+(assessment&&assessment.flags.length?'planned':'complete')+'">'+(assessment?(assessment.flags.length?'REVIEW':'NO GEOMETRY FLAGS'):'NO FIELD SELECTED')+'</span></div>'+(activeRecord?assessmentMarkup(activeRecord,assessment):'<div class="gps-boundary-empty">Select a field.</div>')+'<p class="gps-boundary-disclaimer">These checks identify coordinate and geometry issues. They do not establish that the polygon matches the physical field edge. Visual confirmation by an authorised reviewer is still required.</p>';
      document.getElementById('gpsBoundaryZoom').disabled=!(assessment&&assessment.path.length>=3);
      document.getElementById('gpsBoundaryVertices').disabled=!(assessment&&assessment.path.length>=3);
      updateGoogleLink(activeRecord,assessment||{path:[]});
    });
    document.getElementById('gpsBoundaryLoadMap')?.addEventListener('click',initialiseMap);
    document.getElementById('gpsBoundaryClearKey')?.addEventListener('click',function(){
      try{localStorage.removeItem(KEY_STORAGE);}catch(_){}
      if(keyInput)keyInput.value='';
      if(status)status.textContent='Saved API key cleared from this browser. Existing Google map session may remain active until the page is refreshed.';
    });
    document.getElementById('gpsBoundaryZoom')?.addEventListener('click',function(){drawSelected();});
    document.getElementById('gpsBoundaryVertices')?.addEventListener('click',function(){
      showVertices=!showVertices;
      const button=document.getElementById('gpsBoundaryVertices');
      if(button)button.textContent=(showVertices?'Hide':'Show')+' GPS points';
      drawSelected();
    });
    if(saved&&status)status.textContent='Google Maps key is saved in this browser. Select Load imagery to display the field.';
    updateGoogleLink(activeRecord,activeRecord?assess(activeRecord):{path:[]});
  }

  window.gpsBoundaryIntelligencePage=page;
  window.bindGpsBoundaryIntelligencePage=bind;
  window.gm_authFailure=function(){
    const status=document.getElementById('gpsBoundaryKeyStatus');
    if(status)status.textContent='Google rejected the API key. Check Maps JavaScript API enablement, billing and HTTP referrer restrictions.';
  };
})();