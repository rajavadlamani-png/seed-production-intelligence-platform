/* GPS Boundary Audit Tools
 * Safe, local-only geometry normalization and audit export.
 * Never writes corrections back to Supabase or the source record.
 */
(function () {
  'use strict';
  let rows = [];
  let uploaded = null;
  let uploadedName = '';
  let sourceMode = 'registered';

  function el(id) { return document.getElementById(id); }
  function text(id, value) { const node=el(id); if(node) node.textContent=value; }
  function same(a,b) { return Math.abs(a[0]-b[0])<1e-10 && Math.abs(a[1]-b[1])<1e-10; }
  function cleanRing(input) {
    const out=[];
    input.forEach(function(p) {
      if(!Array.isArray(p)||p.length<2) throw new Error('A coordinate pair is incomplete.');
      const lon=Number(p[0]),lat=Number(p[1]);
      if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)
        throw new Error('Invalid coordinate found. No coordinate was silently removed.');
      if(!out.length||!same(out[out.length-1],[lon,lat])) out.push([lon,lat]);
    });
    if(out.length>1&&same(out[0],out[out.length-1])) out.pop();
    const distinct=new Set(out.map(p=>p[0].toFixed(9)+','+p[1].toFixed(9)));
    if(distinct.size<3) throw new Error('At least three distinct boundary vertices are required.');
    return out;
  }
  function cross(a,b,c) { return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]); }
  function onSegment(a,b,p) {
    return Math.abs(cross(a,b,p))<1e-10 && p[0]>=Math.min(a[0],b[0])-1e-10 &&
      p[0]<=Math.max(a[0],b[0])+1e-10 && p[1]>=Math.min(a[1],b[1])-1e-10 && p[1]<=Math.max(a[1],b[1])+1e-10;
  }
  function intersects(a,b,c,d) {
    const x1=cross(a,b,c),x2=cross(a,b,d),x3=cross(c,d,a),x4=cross(c,d,b);
    if(((x1>0&&x2<0)||(x1<0&&x2>0))&&((x3>0&&x4<0)||(x3<0&&x4>0)))return true;
    return onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);
  }
  function selfCrosses(ring) {
    const pts=cleanRing(ring),lat=pts.reduce((s,p)=>s+p[1],0)/pts.length*Math.PI/180;
    const xy=pts.map(p=>[p[0]*Math.cos(lat),p[1]]);
    for(let i=0;i<xy.length;i++) for(let j=i+1;j<xy.length;j++) {
      const i2=(i+1)%xy.length,j2=(j+1)%xy.length;
      if(i===j||i2===j||j2===i)continue;
      if(intersects(xy[i],xy[i2],xy[j],xy[j2]))return true;
    }
    return false;
  }
  function parseKml(xmlText) {
    const xml=new DOMParser().parseFromString(xmlText,'application/xml');
    if(xml.getElementsByTagName('parsererror').length)throw new Error('The file is not valid XML/KML.');
    const polygons=Array.from(xml.getElementsByTagNameNS('*','Polygon'));
    const features=[];
    polygons.forEach(function(poly,index) {
      const rings=Array.from(poly.getElementsByTagNameNS('*','LinearRing')).map(function(ring) {
        const node=ring.getElementsByTagNameNS('*','coordinates')[0];
        if(!node)throw new Error('A KML LinearRing has no coordinates element.');
        const pairs=node.textContent.trim().split(/\\s+/).map(function(tuple) {
          const values=tuple.split(',');
          if(values.length<2)throw new Error('Invalid KML coordinate tuple.');
          return [Number(values[0]),Number(values[1])];
        });
        return cleanRing(pairs);
      });
      if(!rings.length)throw new Error('A KML polygon has no LinearRing.');
      rings.forEach(function(r){if(selfCrosses(r))throw new Error('Self-intersection detected. The polygon must be corrected from verified survey points; it will not be reshaped automatically.');});
      let parent=poly;while(parent&&parent.localName!=='Placemark')parent=parent.parentNode;
      const name=parent&&parent.getElementsByTagNameNS('*','name')[0];
      features.push({name:name?name.textContent.trim():'KML polygon '+(index+1),rings:rings});
    });
    if(!features.length)throw new Error('No KML Polygon was found. LineString-only files are not accepted as field polygons.');
    return features;
  }
  function currentFeatures() {
    if(sourceMode==='upload'&&uploaded)return uploaded.map(f=>({name:f.name,rings:f.rings.map(cleanRing)}));
    const id=el('gpsBoundaryField')?.value;
    const record=rows.find(r=>String(r.id)===String(id));
    if(!record)throw new Error('Select a registered field or upload a KML file.');
    const raw=Array.isArray(record.boundaryPoints)?record.boundaryPoints:[];
    const valid=[];
    raw.forEach(function(p) {
      const lat=Number(p.lat),lon=Number(p.lon);
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)
        throw new Error('The saved GPS record contains invalid coordinates. Export is blocked; no invalid point will be discarded.');
      valid.push([lon,lat]);
    });
    const ring=cleanRing(valid);
    if(selfCrosses(ring))throw new Error('The registered GPS polygon self-intersects. Export is blocked; verify the original survey path.');
    return [{name:record.fieldNo||record.name||'Registered field',rings:[ring],record:record}];
  }
  function esc(s) { return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function areaAcres(ring) {
    const lat=ring.reduce((s,p)=>s+p[1],0)/ring.length*Math.PI/180,rad=6371008.8;
    const xy=ring.map(p=>[rad*p[0]*Math.PI/180*Math.cos(lat),rad*p[1]*Math.PI/180]);
    let sum=0;for(let i=0;i<xy.length;i++){const a=xy[i],b=xy[(i+1)%xy.length];sum+=a[0]*b[1]-b[0]*a[1];}
    return Math.abs(sum/2)/4046.8564224;
  }
  function kmlFor(features) {
    const now=new Date().toISOString();
    const marks=features.map(function(f,i) {
      const outer=f.rings[0].concat([f.rings[0][0]]);
      const holes=f.rings.slice(1).map(function(r) {
        const closed=r.concat([r[0]]);
        return '<innerBoundaryIs><LinearRing><coordinates>'+closed.map(p=>p[0].toFixed(8)+','+p[1].toFixed(8)+',0').join(' ')+'</coordinates></LinearRing></innerBoundaryIs>';
      }).join('');
      return '<Placemark><name>'+esc(f.name||('Field polygon '+(i+1)))+'</name><ExtendedData>'+
        '<Data name="export_type"><value>audit_support_cleaned_copy</value></Data>'+
        '<Data name="coordinate_reference_system"><value>WGS 84 / EPSG:4326</value></Data>'+
        '<Data name="cleaning_actions"><value>Consecutive duplicate vertices removed; LinearRing closure normalized</value></Data>'+
        '<Data name="exported_at_utc"><value>'+now+'</value></Data></ExtendedData><Polygon>'+
        '<outerBoundaryIs><LinearRing><coordinates>'+outer.map(p=>p[0].toFixed(8)+','+p[1].toFixed(8)+',0').join(' ')+'</coordinates></LinearRing></outerBoundaryIs>'+
        holes+'</Polygon></Placemark>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Cleaned field boundary copy</name>'+
      '<description>Audit-support export only. Source data was not changed. No snapping, shifting, smoothing, or imagery-based boundary inference was performed. Verify the physical field edge independently.</description>'+
      marks+'</Document></kml>';
  }
  function download(name,body,type) {
    const url=URL.createObjectURL(new Blob([body],{type:type}));
    const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1200);
  }
  function filename() {
    const id=el('gpsBoundaryField')?.value, r=rows.find(x=>String(x.id)===String(id));
    return String(r?.fieldNo||uploadedName.replace(/\\.kml$/i,'')||'field-boundary').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'')||'field-boundary';
  }
  async function exportAudit() {
    try {
      const features=currentFeatures();
      const kml=kmlFor(features);
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(kml));
      const hash=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
      const base=filename();
      download(base+'-cleaned-boundary.kml',kml,'application/vnd.google-earth.kml+xml;charset=utf-8');
      const lines=['GPS BOUNDARY QUALITY / EXPORT REPORT','Generated UTC: '+new Date().toISOString(),
        'Field / source file: '+base,'Source type: '+(sourceMode==='upload'?'Locally uploaded KML':'Registered GPS boundary record'),
        'CRS: WGS 84 / EPSG:4326','Polygon count: '+features.length,
        'Vertices per polygon: '+features.map(f=>f.rings.map(r=>r.length).join(' outer/inner ')).join('; '),
        'Calculated outer-ring areas (acres): '+features.map(f=>areaAcres(f.rings[0]).toFixed(4)).join('; '),
        'Safe normalization: consecutive duplicate points removed; KML ring closure normalized.',
        'Not performed: coordinate snapping, point interpolation, smoothing, boundary shifting, self-intersection repair, imagery-derived edge correction.',
        'SHA-256 of exported KML: '+hash,'Source GPS/KML/database record: unchanged.',
        'Audit limitation: software QA report only; not a land survey certificate, legal boundary determination, or independent field verification.'];
      download(base+'-boundary-QA-report.txt',lines.join('\\n'),'text/plain;charset=utf-8');
      text('gpsBoundaryAuditStatus','Cleaned KML and QA report downloaded. Source data was not changed.');
    } catch(e) { text('gpsBoundaryAuditStatus','Export blocked: '+(e.message||String(e))); }
  }
  function addPanel(list) {
    rows=Array.isArray(list)?list:[];
    const assessment=document.querySelector('.gps-boundary-assessment');
    if(!assessment||document.getElementById('gpsBoundaryAuditPanel'))return;
    const panel=document.createElement('section');
    panel.className='panel gps-boundary-audit-panel';panel.id='gpsBoundaryAuditPanel';
    panel.innerHTML='<h2>Audit copy and controlled cleaning</h2>'+
      '<p class="muted">Only deterministic formatting corrections are applied to the export copy: consecutive duplicate vertices are removed and KML rings are closed. The saved GPS/KML source is never overwritten.</p>'+
      '<div class="gps-boundary-audit-actions"><button type="button" class="primary" id="gpsBoundaryAuditExport">Download cleaned KML + QA report</button></div>'+
      '<p class="muted" id="gpsBoundaryAuditStatus" role="status">Select a field or upload a KML. Export is blocked if coordinates are invalid or the polygon self-intersects.</p>'+
      '<p class="gps-boundary-disclaimer">A geometry-clean export is not proof that the boundary matches the cadastral or physical field edge. Corrections requiring changed vertex positions must be based on a verified survey or authorised field review.</p>';
    assessment.insertAdjacentElement('afterend',panel);
    el('gpsBoundaryAuditExport').addEventListener('click',exportAudit);
    el('gpsBoundaryKmlFile')?.addEventListener('change',function(event) {
      const file=event.target.files&&event.target.files[0];if(!file)return;
      if(!/\\.kml$/i.test(file.name)){uploaded=null;sourceMode='registered';text('gpsBoundaryAuditStatus','Only .kml files are supported; KMZ is not supported.');return;}
      const reader=new FileReader();
      reader.onload=function(){try{uploaded=parseKml(String(reader.result||''));uploadedName=file.name;sourceMode='upload';text('gpsBoundaryAuditStatus','KML parsed. Safe duplicate-point and ring-closure normalization is available; export will be blocked for self-intersections or invalid coordinates.');}
        catch(e){uploaded=null;sourceMode='upload';text('gpsBoundaryAuditStatus','KML review failed: '+(e.message||String(e)));}};
      reader.onerror=function(){text('gpsBoundaryAuditStatus','Could not read the uploaded KML file.');};
      reader.readAsText(file);
    });
    el('gpsBoundaryField')?.addEventListener('change',function(){uploaded=null;uploadedName='';sourceMode='registered';});
  }
  const originalPage=window.gpsBoundaryIntelligencePage;
  const originalBind=window.bindGpsBoundaryIntelligencePage;
  if(typeof originalPage==='function')window.gpsBoundaryIntelligencePage=function(list){rows=Array.isArray(list)?list:[];return originalPage(list);};
  if(typeof originalBind==='function')window.bindGpsBoundaryIntelligencePage=function(list){originalBind(list);addPanel(list);};
})();