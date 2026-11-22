/* GPS Boundary Intelligence — OpenAerialMap visual inspection + KML import + GPS geometry checks.
   Uses openly licensed OAM imagery tiles; no Google Maps API key or Google imagery dependency. */
(function () {
  'use strict';

  let mapInstance = null;
  let imageryLayer = null;
  let fieldOverlay = null;
  let kmlOverlay = null;
  let activeRecord = null;
  let activeList = [];
  let showVertices = true;
  let imageryErrors = 0;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]);
    });
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
    const recordedVariance=Number.isFinite(registered)&&registered>0&&calculated>0?(calculated-registered)/registered*100:null;
    if(recordedVariance!==null&&Math.abs(recordedVariance)>10)flags.push('Calculated polygon area differs from the recorded measured area by more than 10%');
    return {path:path,calculatedArea:calculated,registeredArea:Number.isFinite(registered)&&registered>0?registered:null,
      maxAccuracy:maxAccuracy,meanAccuracy:meanAccuracy,acreageReference:acreageReference,acreageVariance:acreageVariance,recordedVariance:recordedVariance,
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
    return '<div class="page-heading"><div><p class="eyebrow">GEOSPATIAL FIELD QUALITY</p><h1>GPS Boundary Intelligence</h1><p class="muted">Inspect KML and registered field polygons over openly licensed aerial imagery, then review GPS geometry quality.</p></div><span class="status-chip planned">OPEN IMAGERY</span></div>'+
      '<section class="panel gps-boundary-panel"><div class="gps-boundary-toolbar">'+
      '<label>Company field<select id="gpsBoundaryField" '+(activeList.length?'':'disabled')+'>'+fieldOptions(activeList,preferred&&preferred.id)+'</select></label>'+
      '<label class="gps-boundary-file-label">Upload field boundary (.KML)<input id="gpsBoundaryKmlFile" type="file" accept=".kml,application/vnd.google-earth.kml+xml,application/xml,text/xml"></label>'+
      '<button type="button" class="outline" id="gpsBoundaryClearKml">Clear uploaded KML</button></div>'+
      '<p class="gps-boundary-key-note" id="gpsBoundaryStatus">OpenAerialMap imagery is loading. Select a company field or upload a KML file to zoom to its boundary. No Google API key is required.</p>'+
      '<div class="gps-boundary-map-actions"><button type="button" class="outline" id="gpsBoundaryZoom" '+(a&&a.path.length>=3?'':'disabled')+'>Zoom to field</button><button type="button" class="outline" id="gpsBoundaryVertices" '+(a&&a.path.length>=3?'':'disabled')+'>'+ (showVertices?'Hide':'Show') +' GPS points</button><a class="outline gps-boundary-google-link" id="gpsBoundaryOpenEarth" href="https://openaerialmap.org/" target="_blank" rel="noopener">OpenAerialMap catalogue ↗</a></div>'+
      '<div class="gps-boundary-map-wrap"><div id="gpsBoundaryMap" class="gps-boundary-map" role="region" aria-label="Open aerial imagery map showing the selected field boundary"><div class="gps-boundary-map-placeholder"><strong>Open aerial imagery</strong><span>Initialising map…</span></div></div></div>'+
      '<p class="gps-boundary-map-caption">Imagery source: OpenAerialMap / Open Imagery Network, CC BY 4.0, with attribution to imagery contributors. Coverage and image dates vary by location. The low-zoom coverage grid is not itself an aerial photograph.</p></section>'+
      '<section class="panel gps-boundary-assessment"><div class="panel-head"><div><h2>GPS geometry assessment</h2><p class="muted">Checks are calculated from the saved GPS coordinates, not from aerial imagery.</p></div><span class="status-chip '+(a&&a.valid&&a.flags.length===0?'complete':'planned')+'">'+(a?(a.flags.length?'REVIEW':'NO GEOMETRY FLAGS'):'NO FIELD SELECTED')+'</span></div>'+
      (preferred?assessmentMarkup(preferred,a):'<div class="gps-boundary-empty">No company field records are available in the current view. You can still upload a KML file for map inspection.</div>')+
      '<p class="gps-boundary-disclaimer">These checks identify coordinate and geometry issues. They do not establish that the polygon matches the physical field edge. Visual confirmation by an authorised reviewer is still required.</p></section>'+
      '<section class="panel gps-boundary-guidance"><h2>Imagery and KML notes</h2><ul><li>Choose a KML file to display its polygon automatically on the map. This page currently accepts .kml files; zipped .kmz files are not supported.</li><li>OpenAerialMap coverage is contributed imagery and may be absent for some farms. At high zoom, unavailable imagery may appear blank.</li><li>Use the layer selector to switch to OpenStreetMap for geographic reference only; it is not satellite imagery.</li><li>Uploaded KML is read locally in this browser and is not uploaded to Supabase.</li></ul><p><a href="https://openaerialmap.org/legal/" target="_blank" rel="noopener">OpenAerialMap terms and imagery licence ↗</a> · <a href="https://docs.imagery.hotosm.org/usage/using-imagery/" target="_blank" rel="noopener">Imagery tile usage ↗</a></p></section>';
  }
  function assessmentMarkup(record,a) {
    const flags=a.flags.length?'<ul class="gps-boundary-flags">'+a.flags.map(function(f){return '<li>'+esc(f)+'</li>';}).join('')+'</ul>':'<p class="gps-boundary-ok">No geometry issues detected by the current checks.</p>';
    return '<div class="gps-boundary-summary"><div><small>FIELD</small><b>'+esc(record.fieldNo||'—')+'</b></div><div><small>GPS POINTS</small><b>'+a.path.length+'</b></div><div><small>CALCULATED POLYGON AREA</small><b>'+(a.calculatedArea>0?a.calculatedArea.toFixed(2)+' ac':'—')+'</b></div><div><small>RECORDED GPS AREA</small><b>'+(a.registeredArea!==null?a.registeredArea.toFixed(2)+' ac':'—')+'</b></div><div><small>MEAN GPS ACCURACY</small><b>'+(a.meanAccuracy!==null?'±'+a.meanAccuracy.toFixed(1)+' m':'Not recorded')+'</b></div><div><small>ALLOCATED AREA DIFFERENCE · NOT A GEOMETRY TEST</small><b>'+(a.acreageVariance!==null?(a.acreageVariance>0?'+':'')+a.acreageVariance.toFixed(1)+'%':'Not comparable')+'</b></div></div>'+flags;
  }
  function initMap() {
    if(mapInstance)return mapInstance;
    const el=document.getElementById('gpsBoundaryMap');
    const status=document.getElementById('gpsBoundaryStatus');
    if(!el)return null;
    if(!window.L){if(status)status.textContent='The map library could not be loaded. Check network access and refresh the page.';return null;}
    el.innerHTML='';
    mapInstance=L.map(el,{center:[20.5937,78.9629],zoom:5,preferCanvas:true});
    imageryErrors=0;
    imageryLayer=L.tileLayer('https://global.imagery.hotosm.org/{z}/{x}/{y}.png',{
      minZoom:0,maxZoom:22,maxNativeZoom:22,attribution:'Imagery © OpenAerialMap contributors / Open Imagery Network (CC BY 4.0)'
    }).addTo(mapInstance);
    imageryLayer.on('tileerror',function(){imageryErrors++;if(imageryErrors>=3&&status)status.textContent='Some aerial tiles could not be retrieved. Coverage may be unavailable at this location; try another zoom level or use the reference map layer.';});
    const reference=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,attribution:'© OpenStreetMap contributors'
    });
    L.control.layers({'OpenAerialMap imagery':imageryLayer,'OpenStreetMap reference':reference},{},{collapsed:true}).addTo(mapInstance);
    if(status)status.textContent='OpenAerialMap connected. Imagery coverage varies; upload a KML file or select a company field.';
    if(activeRecord)drawSelectedField();
    setTimeout(function(){if(mapInstance)mapInstance.invalidateSize();},100);
    return mapInstance;
  }
  function drawSelectedField() {
    if(!mapInstance)return;
    if(fieldOverlay){mapInstance.removeLayer(fieldOverlay);fieldOverlay=null;}
    const a=activeRecord?assess(activeRecord):null;
    if(!a||a.path.length<3)return;
    const latlngs=a.path.map(function(p){return [p.lat,p.lng];});
    fieldOverlay=L.featureGroup();
    const polygon=L.polygon(latlngs,{color:'#e3b34e',weight:3,opacity:1,fillColor:'#e3b34e',fillOpacity:0.16}).addTo(fieldOverlay);
    if(showVertices)a.path.forEach(function(p){L.circleMarker([p.lat,p.lng],{radius:4,color:'#fff',weight:1,fillColor:'#174b35',fillOpacity:1}).addTo(fieldOverlay);});
    fieldOverlay.addTo(mapInstance);
    mapInstance.fitBounds(polygon.getBounds(),{padding:[30,30],maxZoom:20});
  }
  function parseKml(text) {
    const xml=new DOMParser().parseFromString(text,'application/xml');
    if(xml.getElementsByTagName('parsererror').length)throw new Error('The selected file is not valid XML/KML.');
    const polygons=Array.from(xml.getElementsByTagNameNS('*','Polygon'));
    const features=[];
    polygons.forEach(function(poly,index){
      const rings=Array.from(poly.getElementsByTagNameNS('*','LinearRing')).map(function(ring){
        const node=ring.getElementsByTagNameNS('*','coordinates')[0];
        if(!node)return [];
        return node.textContent.trim().split(/\s+/).map(function(tuple){
          const values=tuple.split(',').map(Number);
          if(values.length<2||!Number.isFinite(values[0])||!Number.isFinite(values[1])||Math.abs(values[0])>180||Math.abs(values[1])>90)return null;
          return [values[0],values[1]];
        }).filter(Boolean);
      }).filter(function(ring){return ring.length>=4;});
      if(!rings.length)return;
      const placemark=(function(){let n=poly;while(n&&n.localName!=='Placemark')n=n.parentNode;return n;})();
      const nameNode=placemark&&placemark.getElementsByTagNameNS('*','name')[0];
      features.push({type:'Feature',properties:{name:nameNode?nameNode.textContent.trim():'KML polygon '+(index+1)},geometry:{type:'Polygon',coordinates:rings}});
    });
    if(!features.length)throw new Error('No valid KML Polygon was found. Export the field boundary as a KML polygon and try again.');
    return {type:'FeatureCollection',features:features};
  }
  function showKml(text,fileName) {
    if(!mapInstance&&!initMap())throw new Error('Map could not be initialised.');
    const geojson=parseKml(text);
    if(kmlOverlay){mapInstance.removeLayer(kmlOverlay);kmlOverlay=null;}
    if(fieldOverlay){mapInstance.removeLayer(fieldOverlay);fieldOverlay=null;}
    kmlOverlay=L.geoJSON(geojson,{style:function(){return {color:'#ef7d32',weight:3,opacity:1,fillColor:'#ef7d32',fillOpacity:0.18};},
      onEachFeature:function(feature,layer){if(feature.properties&&feature.properties.name)layer.bindTooltip(esc(feature.properties.name));}}).addTo(mapInstance);
    const bounds=kmlOverlay.getBounds();
    if(bounds.isValid())mapInstance.fitBounds(bounds,{padding:[32,32],maxZoom:21});
    const status=document.getElementById('gpsBoundaryStatus');
    if(status)status.textContent='Loaded '+fileName+' — '+geojson.features.length+' KML polygon(s) displayed. Imagery is shown where OpenAerialMap coverage exists.';
    const open=document.getElementById('gpsBoundaryOpenEarth');
    if(open&&bounds.isValid()){const c=bounds.getCenter();open.href='https://openaerialmap.org/';}
  }
  function bind(list) {
    activeList=Array.isArray(list)?list:[];
    const select=document.getElementById('gpsBoundaryField');
    const fileInput=document.getElementById('gpsBoundaryKmlFile');
    const status=document.getElementById('gpsBoundaryStatus');
    initMap();
    if(select)select.addEventListener('change',function(){
      activeRecord=activeList.find(function(r){return String(r.id)===String(select.value);})||null;
      if(kmlOverlay&&mapInstance){mapInstance.removeLayer(kmlOverlay);kmlOverlay=null;}
      drawSelectedField();
      const assessment=activeRecord?assess(activeRecord):null;
      const summary=document.querySelector('.gps-boundary-assessment');
      if(summary)summary.innerHTML='<div class="panel-head"><div><h2>GPS geometry assessment</h2><p class="muted">Checks are calculated from the saved GPS coordinates, not from aerial imagery.</p></div><span class="status-chip '+(assessment&&assessment.flags.length?'planned':'complete')+'">'+(assessment?(assessment.flags.length?'REVIEW':'NO GEOMETRY FLAGS'):'NO FIELD SELECTED')+'</span></div>'+(activeRecord?assessmentMarkup(activeRecord,assessment):'<div class="gps-boundary-empty">Select a field or upload a KML file.</div>')+'<p class="gps-boundary-disclaimer">These checks identify coordinate and geometry issues. They do not establish that the polygon matches the physical field edge. Visual confirmation by an authorised reviewer is still required.</p>';
      const zoom=document.getElementById('gpsBoundaryZoom'),vertices=document.getElementById('gpsBoundaryVertices');
      if(zoom)zoom.disabled=!(assessment&&assessment.path.length>=3);
      if(vertices)vertices.disabled=!(assessment&&assessment.path.length>=3);
      if(status)status.textContent=activeRecord?'Showing saved GPS boundary for '+(activeRecord.fieldNo||'selected field')+'.':'No company field selected.';
    });
    if(fileInput)fileInput.addEventListener('change',function(){
      const file=fileInput.files&&fileInput.files[0];if(!file)return;
      if(!/\.kml$/i.test(file.name)){if(status)status.textContent='Please select a .kml file. KMZ archives are not supported in this version.';fileInput.value='';return;}
      if(file.size>20*1024*1024){if(status)status.textContent='KML file exceeds the 20 MB browser import limit.';fileInput.value='';return;}
      const reader=new FileReader();
      reader.onload=function(){try{showKml(String(reader.result||''),file.name);}catch(error){if(status)status.textContent=error.message||'Could not read the KML file.';}};
      reader.onerror=function(){if(status)status.textContent='The selected KML file could not be read.';};
      reader.readAsText(file);
    });
    document.getElementById('gpsBoundaryClearKml')?.addEventListener('click',function(){
      if(kmlOverlay&&mapInstance){mapInstance.removeLayer(kmlOverlay);kmlOverlay=null;}
      if(fileInput)fileInput.value='';
      drawSelectedField();
      if(status)status.textContent=activeRecord?'KML cleared. Showing the saved GPS boundary.':'KML cleared. Select a company field or upload another KML file.';
    });
    document.getElementById('gpsBoundaryZoom')?.addEventListener('click',drawSelectedField);
    document.getElementById('gpsBoundaryVertices')?.addEventListener('click',function(){
      showVertices=!showVertices;
      const button=document.getElementById('gpsBoundaryVertices');
      if(button)button.textContent=(showVertices?'Hide':'Show')+' GPS points';
      drawSelectedField();
    });
    if(activeRecord&&mapInstance)drawSelectedField();
  }

  window.gpsBoundaryIntelligencePage=page;
  window.bindGpsBoundaryIntelligencePage=bind;
})();