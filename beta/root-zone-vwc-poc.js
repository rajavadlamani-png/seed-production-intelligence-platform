// Root-zone VWC feasibility POC workbench.
// Ground measurements and imported predictions remain in this browser session only.
// No VWC is inferred directly from Sentinel backscatter and no VM0051 audit records are written.
let rootZoneVwcGroundRows=[],rootZoneVwcCompletePoints=[],rootZoneVwcFieldDates=[],rootZoneVwcPredictions=[];
let rootZoneVwcImportStatus='',rootZoneVwcPredictionStatus='';
let rootZoneVwcAreaThresholdPct=80,rootZoneVwcCoverageMinPct=80;
const ROOT_ZONE_VWC_THRESHOLD=0.15,ROOT_ZONE_VWC_DEPTH_CM=30;
function rootVwcEscape(v){return satelliteOnlyEsc(v)}
function rootVwcParseCsv(text){
 const rows=[];let row=[],cell='',quoted=false;const input=String(text||'').replace(/^\uFEFF/,'');
 for(let i=0;i<input.length;i++){const ch=input[i],next=input[i+1];if(quoted){if(ch==='"'&&next==='"'){cell+='"';i++}else if(ch==='"')quoted=false;else cell+=ch}else if(ch==='"')quoted=true;else if(ch===','){row.push(cell);cell=''}else if(ch==='\n'){row.push(cell);if(row.some(v=>String(v).trim()!==''))rows.push(row);row=[];cell=''}else if(ch!=='\r')cell+=ch}
 row.push(cell);if(row.some(v=>String(v).trim()!==''))rows.push(row);if(quoted)throw new Error('CSV contains an unclosed quoted field.');if(rows.length<2)throw new Error('CSV must contain a header and at least one data row.');
 const headers=rows[0].map(x=>String(x).trim().toLowerCase());if(new Set(headers).size!==headers.length)throw new Error('CSV contains duplicate column headings.');
 return rows.slice(1).map((values,index)=>{const item={};headers.forEach((h,i)=>item[h]=String(values[i]??'').trim());item.__row=index+2;return item});
}
function rootVwcNum(v,label,n,required=true){if(v===''||v===undefined||v===null){if(required)throw new Error('Row '+n+': '+label+' is required.');return null}const x=Number(v);if(!Number.isFinite(x))throw new Error('Row '+n+': '+label+' must be numeric.');return x}
function rootVwcDate(v,n){if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw new Error('Row '+n+': date must be a valid YYYY-MM-DD date.');return v}
function rootVwcSplit(v,n){const s=String(v||'').toLowerCase();if(!['train','validation','test'].includes(s))throw new Error('Row '+n+': validation_split must be train, validation or test.');return s}
function rootVwcPredictionSplit(v,n){const s=String(v||'').toLowerCase();if(!['train','validation','test','operational'].includes(s))throw new Error('Row '+n+': prediction validation_split must be train, validation, test or operational.');return s}
function rootVwcBuildGround(rows){
 const required=['field_no','date','sample_point_id','depth_top_cm','depth_bottom_cm','measurement_method','validation_split'];
 for(const h of required)if(!(h in (rows[0]||{})))throw new Error('Ground CSV is missing required column: '+h);
 const parsed=rows.map(r=>{
  const n=r.__row,field=String(r.field_no||'').trim(),point=String(r.sample_point_id||'').trim(),date=rootVwcDate(r.date,n);
  if(!field||!point)throw new Error('Row '+n+': field_no and sample_point_id are required.');
  const top=rootVwcNum(r.depth_top_cm,'depth_top_cm',n),bottom=rootVwcNum(r.depth_bottom_cm,'depth_bottom_cm',n),method=String(r.measurement_method||'').toLowerCase();
  if(top<0||bottom>30||bottom<=top)throw new Error('Row '+n+': depth interval must be within 0–30 cm and have positive thickness.');
  if(!['probe','gravimetric'].includes(method))throw new Error('Row '+n+': measurement_method must be probe or gravimetric.');
  const bulk=rootVwcNum(r.bulk_density_g_cm3,'bulk_density_g_cm3',n,method==='gravimetric');
  if(bulk!==null&&bulk<=0)throw new Error('Row '+n+': bulk density must be greater than zero.');
  const gwc=rootVwcNum(r.gravimetric_water_content_kg_kg,'gravimetric_water_content_kg_kg',n,false);
  let vwc=rootVwcNum(r.vwc_m3_m3,'vwc_m3_m3',n,false);
  if(method==='gravimetric'&&gwc!==null)vwc=gwc*bulk;
  if(vwc===null)throw new Error('Row '+n+': supply VWC, or gravimetric water content and bulk density.');
  if(vwc<0||vwc>1)throw new Error('Row '+n+': VWC must be between 0 and 1 m³/m³.');
  if(gwc!==null&&(gwc<0||gwc>1))throw new Error('Row '+n+': gravimetric water content must be between 0 and 1 kg/kg.');
  return {fieldNo:field,date,point,top,bottom,vwc,method,split:rootVwcSplit(r.validation_split,n),soilTexture:r.soil_texture||'',bulkDensity:bulk,crop:r.crop||'',cropStage:r.crop_stage||'',latitude:rootVwcNum(r.latitude,'latitude',n,false),longitude:rootVwcNum(r.longitude,'longitude',n,false),probeId:r.probe_id||'',notes:r.notes||'',sourceRow:n};
 });
 const fieldSplits=new Map();parsed.forEach(r=>{const old=fieldSplits.get(r.fieldNo);if(old&&old!==r.split)throw new Error('Field '+r.fieldNo+' appears in multiple data splits. Keep every date and sample from a field in one split.');fieldSplits.set(r.fieldNo,r.split)});
 const groups=new Map();parsed.forEach(r=>{const k=[r.fieldNo,r.date,r.point,r.split].join('|');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)});
 const points=[],incomplete=[];
 for(const [key,layers] of groups){layers.sort((a,b)=>a.top-b.top);let cursor=0,water=0,ok=true;for(const l of layers){if(Math.abs(l.top-cursor)>.001){ok=false;break}water+=(l.bottom-l.top)*l.vwc;cursor=l.bottom}if(Math.abs(cursor-30)>.001)ok=false;if(!ok){incomplete.push(key);continue}points.push({fieldNo:layers[0].fieldNo,date:layers[0].date,samplePointId:layers[0].point,split:layers[0].split,vwc:water/30,method:[...new Set(layers.map(x=>x.method))].join('+'),soilTexture:layers.find(x=>x.soilTexture)?.soilTexture||'',crop:layers.find(x=>x.crop)?.crop||''})}
 const byDate=new Map();points.forEach(p=>{const k=[p.fieldNo,p.date,p.split].join('|');if(!byDate.has(k))byDate.set(k,[]);byDate.get(k).push(p)});
 const fieldDates=[];for(const items of byDate.values()){if(items.length<3)continue;fieldDates.push({fieldNo:items[0].fieldNo,date:items[0].date,split:items[0].split,actualVwc:items.reduce((s,x)=>s+x.vwc,0)/items.length,samplePointCount:items.length,method:[...new Set(items.map(x=>x.method))].join('+')})}
 if(!fieldDates.length)throw new Error('No field-date has at least three complete sample points covering 0–30 cm.');
 return {parsed,points,fieldDates,incomplete,fieldCount:fieldSplits.size,pointGroups:groups.size};
}
function rootVwcBuildPredictions(rows){
 const required=['field_no','date','predicted_vwc_0_30_m3_m3','model_version','validation_split'];for(const h of required)if(!(h in (rows[0]||{})))throw new Error('Prediction CSV is missing required column: '+h);
 const seen=new Set(),splits=new Map(),versions=new Set();
 const predictions=rows.map(r=>{const n=r.__row,field=String(r.field_no||'').trim(),date=rootVwcDate(r.date,n),pred=rootVwcNum(r.predicted_vwc_0_30_m3_m3,'predicted_vwc_0_30_m3',n),version=String(r.model_version||'').trim(),split=rootVwcPredictionSplit(r.validation_split,n);if(!field||!version)throw new Error('Row '+n+': field_no and model_version are required.');if(pred<0||pred>1)throw new Error('Row '+n+': predicted VWC must be between 0 and 1.');const key=[field,date,version].join('|');if(seen.has(key))throw new Error('Row '+n+': duplicate field/date/model_version prediction.');seen.add(key);const old=splits.get(field);if(old&&old!==split)throw new Error('Prediction field '+field+' appears in multiple data splits.');splits.set(field,split);versions.add(version);const lower=rootVwcNum(r.lower_90,'lower_90',n,false),upper=rootVwcNum(r.upper_90,'upper_90',n,false),areaBelow=rootVwcNum(r.area_below_threshold_pct,'area_below_threshold_pct',n,false),validArea=rootVwcNum(r.valid_area_pct,'valid_area_pct',n,false);if((lower!==null&&(lower<0||lower>1))||(upper!==null&&(upper<0||upper>1))||(lower!==null&&upper!==null&&lower>upper))throw new Error('Row '+n+': lower_90 and upper_90 must be ordered VWC values between 0 and 1.');if((areaBelow!==null&&(areaBelow<0||areaBelow>100))||(validArea!==null&&(validArea<0||validArea>100))||(areaBelow!==null&&validArea!==null&&areaBelow>validArea))throw new Error('Row '+n+': area percentages must be between 0 and 100, and area_below_threshold_pct cannot exceed valid_area_pct.');return {fieldNo:field,date,predictedVwc:pred,modelVersion:version,split,lower90:lower,upper90:upper,areaBelowThresholdPct:areaBelow,validAreaPct:validArea}});
 if(versions.size>1)throw new Error('Import one model_version per prediction file so each model is evaluated separately.');
 return predictions;
}

const ROOT_VWC_SATELLITE_FEATURES=['ndvi','ndmi','vv','vh'];
const ROOT_VWC_RIDGE_CANDIDATES=[0.01,0.1,1,10];
let rootZoneVwcModelResult=null;
function rootVwcSatelliteFeatureRows(runs=satelliteOnlyRuns){
 const byField=new Map();
 (runs||[]).forEach(run=>{
  const generated=String(run.generated_at||run.created_at||'');
  (satelliteOnlyRunFields(run)||[]).forEach(field=>{
   const fieldNo=String(field.fieldNo||'').trim();if(!fieldNo)return;
   const series=Array.isArray(field.observationSeries)?field.observationSeries:[];
   if(!byField.has(fieldNo))byField.set(fieldNo,{optical:new Map(),radar:new Map()});
   const group=byField.get(fieldNo);
   series.forEach(obs=>{
    const date=String(obs.date||obs.interval?.to||obs.interval?.from||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
    const num=key=>obs[key]!==null&&obs[key]!==undefined&&obs[key]!==''&&Number.isFinite(Number(obs[key]))?Number(obs[key]):null;
    const optical={ndvi:num('ndvi'),ndmi:num('ndmi')},radar={vv:num('vv'),vh:num('vh')};
    if(optical.ndvi!==null&&optical.ndmi!==null){const old=group.optical.get(date);if(!old||generated>=old.generated)group.optical.set(date,{date,values:optical,generated,runId:run.id||''})}
    if(radar.vv!==null&&radar.vh!==null){const old=group.radar.get(date);if(!old||generated>=old.generated)group.radar.set(date,{date,values:radar,generated,runId:run.id||''})}
   });
  });
 });
 const combined=[];
 for(const [fieldNo,g] of byField){
  const radar=[...g.radar.values()];
  for(const optical of g.optical.values()){
   let best=null,gap=Infinity;
   radar.forEach(r=>{const d=rootVwcDaysBetween(optical.date,r.date);if(d<gap){best=r;gap=d}});
   if(best&&gap<=5)combined.push({fieldNo,date:optical.date,opticalDate:optical.date,radarDate:best.date,sensorGapDays:gap,features:{ndvi:optical.values.ndvi,ndmi:optical.values.ndmi,vv:best.values.vv,vh:best.values.vh},runId:optical.runId||best.runId||''});
  }
 }
 return combined.sort((a,b)=>a.fieldNo.localeCompare(b.fieldNo)||a.date.localeCompare(b.date));
}
function rootVwcDaysBetween(a,b){return Math.abs(Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000}
function rootVwcMatchGroundToSatellite(groundDates,featureRows,toleranceDays=5){
 const candidates=[];
 groundDates.forEach(g=>featureRows.filter(x=>x.fieldNo===g.fieldNo).forEach(x=>{const gap=rootVwcDaysBetween(g.date,x.date);if(gap<=toleranceDays)candidates.push({g,x,gap})}));
 candidates.sort((a,b)=>a.gap-b.gap||a.g.date.localeCompare(b.g.date)||a.x.date.localeCompare(b.x.date));
 const usedGround=new Set(),usedSatellite=new Set(),pairs=[];
 candidates.forEach(({g,x,gap})=>{const gk=g.fieldNo+'|'+g.date,sk=x.fieldNo+'|'+x.date;if(usedGround.has(gk)||usedSatellite.has(sk))return;usedGround.add(gk);usedSatellite.add(sk);pairs.push({fieldNo:g.fieldNo,groundDate:g.date,satelliteDate:x.date,dateGapDays:gap,actualVwc:g.actualVwc,split:g.split,features:x.features,runId:x.runId})});
 return pairs.sort((a,b)=>a.fieldNo.localeCompare(b.fieldNo)||a.groundDate.localeCompare(b.groundDate));
}
function rootVwcSolve(matrix,vector){
 const n=vector.length,a=matrix.map((row,i)=>row.slice().concat([vector[i]]));
 for(let col=0;col<n;col++){
  let pivot=col;for(let row=col+1;row<n;row++)if(Math.abs(a[row][col])>Math.abs(a[pivot][col]))pivot=row;
  if(Math.abs(a[pivot][col])<1e-12)throw new Error('The calibration design matrix is singular. Collect more varied satellite/ground observations.');
  [a[col],a[pivot]]=[a[pivot],a[col]];
  const div=a[col][col];for(let j=col;j<=n;j++)a[col][j]/=div;
  for(let row=0;row<n;row++){if(row===col)continue;const factor=a[row][col];for(let j=col;j<=n;j++)a[row][j]-=factor*a[col][j]}
 }
 return a.map(row=>row[n]);
}
function rootVwcFitRidge(rows,alpha){
 const keys=ROOT_VWC_SATELLITE_FEATURES,means={},scales={};
 keys.forEach(k=>{means[k]=rows.reduce((s,r)=>s+r.features[k],0)/rows.length;const variance=rows.reduce((s,r)=>s+(r.features[k]-means[k])**2,0)/rows.length;scales[k]=Math.sqrt(variance)||1});
 const p=keys.length+1,xtx=Array.from({length:p},()=>Array(p).fill(0)),xty=Array(p).fill(0);
 rows.forEach(r=>{const x=[1,...keys.map(k=>(r.features[k]-means[k])/scales[k])];for(let i=0;i<p;i++){xty[i]+=x[i]*r.actualVwc;for(let j=0;j<p;j++)xtx[i][j]+=x[i]*x[j]}});
 for(let i=1;i<p;i++)xtx[i][i]+=alpha;
 return {features:keys,means,scales,coefficients:rootVwcSolve(xtx,xty),alpha,trainingRows:rows.length,trainingFields:new Set(rows.map(x=>x.fieldNo)).size};
}
function rootVwcApplyModel(model,features){
 const x=[1,...model.features.map(k=>(features[k]-model.means[k])/model.scales[k])];
 const raw=x.reduce((s,v,i)=>s+v*model.coefficients[i],0);
 return Math.max(0,Math.min(1,raw));
}
function rootVwcRegressionMetrics(rows,model){
 if(!rows.length)return {count:0,fields:0,mae:null,rmse:null,bias:null,r2:null};
 const errors=rows.map(r=>rootVwcApplyModel(model,r.features)-r.actualVwc),mae=errors.reduce((s,x)=>s+Math.abs(x),0)/errors.length,rmse=Math.sqrt(errors.reduce((s,x)=>s+x*x,0)/errors.length),bias=errors.reduce((s,x)=>s+x,0)/errors.length,mean=rows.reduce((s,x)=>s+x.actualVwc,0)/rows.length,total=rows.reduce((s,x)=>s+(x.actualVwc-mean)**2,0),res=errors.reduce((s,x)=>s+x*x,0);
 return {count:rows.length,fields:new Set(rows.map(x=>x.fieldNo)).size,mae,rmse,bias,r2:total>0?1-res/total:null};
}
function rootVwcTrainSatelliteModel(groundDates,featureRows,toleranceDays=5){
 if(!Number.isFinite(toleranceDays)||toleranceDays<0||toleranceDays>15)throw new Error('Satellite-to-sample date tolerance must be between 0 and 15 days.');
 const pairs=rootVwcMatchGroundToSatellite(groundDates,featureRows,toleranceDays),train=pairs.filter(x=>x.split==='train'),validation=pairs.filter(x=>x.split==='validation'),test=pairs.filter(x=>x.split==='test');
 if(train.length<12||new Set(train.map(x=>x.fieldNo)).size<4)throw new Error('Insufficient matched calibration data. Need at least 12 matched field-date samples from at least 4 training fields; found '+train.length+' samples from '+new Set(train.map(x=>x.fieldNo)).size+' fields. Confirm ground dates and saved satellite observations are within '+toleranceDays+' days.');
 let selectedAlpha=1,selectedModel=rootVwcFitRidge(train,selectedAlpha),selection='default ridge penalty 1.0';
 if(validation.length>=4&&new Set(validation.map(x=>x.fieldNo)).size>=2){
  let best=Infinity;ROOT_VWC_RIDGE_CANDIDATES.forEach(alpha=>{const candidate=rootVwcFitRidge(train,alpha),m=rootVwcRegressionMetrics(validation,candidate);if(m.rmse!==null&&m.rmse<best){best=m.rmse;selectedAlpha=alpha;selectedModel=candidate}});
  selection='lowest validation RMSE across ridge penalties 0.01, 0.1, 1 and 10';
 }
 const splitByField=new Map();groundDates.forEach(x=>splitByField.set(x.fieldNo,x.split));
 const modelVersion='ridge-s1s2-v0.1';
 const predictions=featureRows.map(x=>({fieldNo:x.fieldNo,date:x.date,predictedVwc:rootVwcApplyModel(selectedModel,x.features),modelVersion,split:splitByField.get(x.fieldNo)||'operational',lower90:null,upper90:null,areaBelowThresholdPct:null,validAreaPct:null,matchedSatelliteRunId:x.runId||''}));
 const validationMetrics=rootVwcRegressionMetrics(validation,selectedModel),testMetrics=rootVwcRegressionMetrics(test,selectedModel);
 return {model:selectedModel,modelVersion,features:ROOT_VWC_SATELLITE_FEATURES.slice(),toleranceDays,pairs,trainCount:train.length,trainFields:new Set(train.map(x=>x.fieldNo)).size,validationMetrics,testMetrics,alphaSelection:selection,predictions,featureRows:featureRows.length,unmatchedGroundCount:groundDates.length-pairs.length,trainedAt:new Date().toISOString(),status:'PROVISIONAL · FIELD-HELD-OUT TEST REQUIRED'};
}
function rootVwcDownloadGeneratedPredictions(){
 if(!rootZoneVwcModelResult)return;
 const h=['field_no','date','predicted_vwc_0_30_m3_m3','area_below_threshold_pct','valid_area_pct','model_version','validation_split','lower_90','upper_90','satellite_run_id'];
 const rows=rootZoneVwcModelResult.predictions.map(p=>[p.fieldNo,p.date,p.predictedVwc,'','',p.modelVersion,p.split,'','',p.matchedSatelliteRunId]);
 rootVwcDownload('sentinel-root-zone-vwc-model-predictions.csv',[h,...rows]);
}

 // Ground-truth-free exploratory index: relative canopy condition, not root-zone VWC.
 let rootZoneVwcProxyResult=null;
 function rootVwcPercentile(values,value){
  const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return null;
  let below=0,equal=0;a.forEach(x=>{if(x<value)below++;else if(x===value)equal++});
  return 100*(below+(equal?((equal-1)/2):0))/Math.max(1,a.length-1);
 }
 function rootVwcMedian(values){const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
 function rootVwcBuildRelativeProxy(featureRows){
  const grouped=new Map();(featureRows||[]).forEach(x=>{if(!grouped.has(x.fieldNo))grouped.set(x.fieldNo,[]);grouped.get(x.fieldNo).push(x)});
  const fields=[];
  for(const [fieldNo,items] of grouped){
   items.sort((a,b)=>a.date.localeCompare(b.date));
   const ndmi=items.map(x=>x.features.ndmi),ndvi=items.map(x=>x.features.ndvi),vv=items.map(x=>x.features.vv),vh=items.map(x=>x.features.vh),latest=items[items.length-1],enough=items.length>=6;
   const ndmiRank=enough?rootVwcPercentile(ndmi,latest.features.ndmi):null,ndviRank=enough?rootVwcPercentile(ndvi,latest.features.ndvi):null,score=enough?0.7*ndmiRank+0.3*ndviRank:null;
   const vm=rootVwcMedian(vv),hm=rootVwcMedian(vh),vMad=vm===null?null:rootVwcMedian(vv.map(x=>Math.abs(x-vm))),hMad=hm===null?null:rootVwcMedian(vh.map(x=>Math.abs(x-hm)));
   const vDev=vMad>0?0.6745*(latest.features.vv-vm)/vMad:null,hDev=hMad>0?0.6745*(latest.features.vh-hm)/hMad:null;
   const radarFlag=[vDev,hDev].some(x=>x!==null&&Math.abs(x)>=3)?'Unusual radar response':'No strong radar anomaly';
   let band='Insufficient history';if(score!==null)band=score<20?'Very low relative signal':score<40?'Below own-history range':score<60?'Near own-history midpoint':score<80?'Above own-history midpoint':'High relative signal';
   fields.push({fieldNo,latestDate:latest.date,observations:items.length,ndmi:latest.features.ndmi,ndvi:latest.features.ndvi,score,band,radarFlag,vDev,hDev});
  }
  return {fields,featureCount:(featureRows||[]).length,minimumObservations:6,formula:'70% within-field NDMI percentile + 30% within-field NDVI percentile'};
 }
 function rootZoneVwcProxyMarkup(){
  if(!rootZoneVwcProxyResult)return '<p class="root-vwc-muted">No provisional index calculated in this browser session. Run it using saved combined Sentinel-1 / Sentinel-2 field observations.</p>';
  const r=rootZoneVwcProxyResult,rows=r.fields.map(x=>'<tr><td>'+rootVwcEscape(x.fieldNo)+'</td><td>'+x.latestDate+'</td><td>'+(x.score===null?'—':x.score.toFixed(1)+'/100')+'</td><td>'+rootVwcEscape(x.band)+'</td><td>'+x.ndmi.toFixed(3)+'</td><td>'+x.ndvi.toFixed(3)+'</td><td>'+x.observations+'</td><td>'+rootVwcEscape(x.radarFlag)+'</td></tr>').join('');
  return '<div class="root-vwc-kpis"><article><small>Fields assessed</small><b>'+r.fields.length+'</b></article><article><small>Fields with sufficient history</small><b>'+r.fields.filter(x=>x.score!==null).length+'</b></article><article><small>Combined satellite dates</small><b>'+r.featureCount+'</b></article><article><small>Minimum history per field</small><b>'+r.minimumObservations+'</b></article></div><p class="root-vwc-muted">Latest observation per field · '+rootVwcEscape(r.formula)+'. Scores are relative ranks against each field’s own available history, not cross-field moisture measurements.</p><div class="table-wrap"><table class="satellite-only-table"><thead><tr><th>Field</th><th>Latest date</th><th>Relative index</th><th>Relative band</th><th>NDMI</th><th>NDVI</th><th>History</th><th>Radar context</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="root-vwc-muted"><b>Interpretation:</b> lower scores indicate weaker NDMI/NDVI signals relative to that same field’s historical observations. Sentinel-1 VV/VH are anomaly context only because their moisture response is confounded by vegetation, roughness, incidence angle and surface conditions. This is not root-zone VWC, uses no m³/m³ units, cannot apply the 15% VWC / 80% area rule, and is not calibrated or independently validated. Fields with fewer than six matched dates remain unscored.</p>';
 }
 function rootZoneVwcRunRelativeProxy(){
  const features=rootVwcSatelliteFeatureRows();if(!features.length)throw new Error('No combined Sentinel-1 / Sentinel-2 field observations are available. Save satellite runs first.');
  rootZoneVwcProxyResult=rootVwcBuildRelativeProxy(features);notify('Exploratory field-relative satellite condition index calculated. It is not a VWC estimate.');
 }
 function rootZoneVwcDownloadRelativeProxy(){
  if(!rootZoneVwcProxyResult)return;
  const h=['field_no','latest_date','relative_index_0_100','relative_band','ndmi','ndvi','matched_observation_count','radar_context','vv_robust_deviation','vh_robust_deviation','interpretation'];
  const rows=rootZoneVwcProxyResult.fields.map(x=>[x.fieldNo,x.latestDate,x.score===null?'':x.score,x.band,x.ndmi,x.ndvi,x.observations,x.radarFlag,x.vDev??'',x.hDev??'','Within-field relative canopy-condition proxy only; not root-zone VWC']);
  rootVwcDownload('field-relative-satellite-condition-proxy.csv',[h,...rows]);
 }

function rootZoneVwcModelMarkup(){
 if(!rootZoneVwcModelResult)return '<p class="root-vwc-muted">No ground-truth VWC calibration model is available. Measured 0–30 cm soil profiles are required to train this model honestly. Use the provisional field-relative satellite condition index above until ground measurements become available.</p>';
 const r=rootZoneVwcModelResult,fmt=x=>x===null?'—':x.toFixed(4),m=r.testMetrics,v=r.validationMetrics;
 return '<div class="root-vwc-kpis"><article><small>Training pairs</small><b>'+r.trainCount+'</b></article><article><small>Training fields</small><b>'+r.trainFields+'</b></article><article><small>Validation pairs</small><b>'+v.count+'</b></article><article><small>Independent test pairs</small><b>'+m.count+'</b></article><article><small>Test MAE · m³/m³</small><b>'+fmt(m.mae)+'</b></article><article><small>Test RMSE · m³/m³</small><b>'+fmt(m.rmse)+'</b></article><article><small>Test bias · m³/m³</small><b>'+fmt(m.bias)+'</b></article><article><small>Test R²</small><b>'+fmt(m.r2)+'</b></article></div><p class="root-vwc-muted">Model '+r.modelVersion+' · features: '+r.features.join(', ')+' · matched date tolerance ±'+r.toleranceDays+' days · ridge alpha '+r.model.alpha+' ('+r.alphaSelection+'). Validation: '+v.fields+' fields / '+v.count+' pairs. Test: '+m.fields+' fields / '+m.count+' pairs. '+r.predictions.length+' saved satellite field-dates predicted. '+r.unmatchedGroundCount+' ground field-dates did not match satellite observations.</p><p class="root-vwc-muted"><b>Not yet approved for operational use.</b> Predictions are field-average estimates from field-level satellite statistics. They do not provide pixel-level VWC or area_below_threshold_pct / valid_area_pct. The 80% field-area classifier therefore remains unevaluable from this output. Model and predictions remain in browser memory until exported.</p><div class="root-vwc-actions"><button type="button" class="outline" id="rootVwcDownloadGeneratedPredictions">Download model predictions CSV</button></div>';
}
function rootZoneVwcRunSatelliteModel(){
 const features=rootVwcSatelliteFeatureRows(),tolerance=Number(document.getElementById('rootVwcMatchTolerance')?.value??5);
 const result=rootVwcTrainSatelliteModel(rootZoneVwcFieldDates,features,tolerance);
 rootZoneVwcModelResult=result;rootZoneVwcPredictions=result.predictions;
 rootZoneVwcPredictionStatus='Generated '+result.predictions.length+' field-date predictions with '+result.modelVersion+' · training '+result.trainCount+' matched pairs · validation '+result.validationMetrics.count+' · test '+result.testMetrics.count+'.';
 notify('Satellite-to-VWC model trained in this browser session. Review independent test metrics before use.');
}

function rootVwcClassifyOperational(predictions,areaThresholdPct=80,coverageMinPct=80){
 const grouped=new Map();predictions.filter(p=>p.split==='operational').forEach(p=>{if(!grouped.has(p.fieldNo))grouped.set(p.fieldNo,[]);grouped.get(p.fieldNo).push(p)});
 const fields=[];for(const [fieldNo,items] of grouped){items.sort((a,b)=>a.date.localeCompare(b.date));let run=[];const events=[];let evaluable=0;for(const p of items){const valid=p.areaBelowThresholdPct!==null&&p.validAreaPct!==null&&p.validAreaPct>=coverageMinPct;if(valid)evaluable++;const qualifies=valid&&p.areaBelowThresholdPct>=areaThresholdPct;if(qualifies)run.push(p);else{if(run.length>=2)events.push(rootVwcOperationalEvent(fieldNo,run));run=[]}}if(run.length>=2)events.push(rootVwcOperationalEvent(fieldNo,run));fields.push({fieldNo,observationCount:items.length,evaluableCount:evaluable,events,status:events.length?'QUALIFYING VWC-BASED DRYNESS PERIOD':evaluable?'NO QUALIFYING TWO-OBSERVATION PERIOD':'INSUFFICIENT AREA-COVERAGE DATA'});}
 return {fields,events:fields.flatMap(x=>x.events),areaThresholdPct,coverageMinPct,observationRule:'Two consecutive available modelled observation dates'};
}
function rootVwcOperationalEvent(fieldNo,run){return {fieldNo,from:run[0].date,triggerDate:run[1].date,lastDate:run[run.length-1].date,observationCount:run.length,minimumAreaBelowPct:Math.min(...run.map(x=>x.areaBelowThresholdPct)),minimumValidAreaPct:Math.min(...run.map(x=>x.validAreaPct)),meanVwc:run.reduce((s,x)=>s+x.predictedVwc,0)/run.length,modelVersion:run[0].modelVersion};}
function rootVwcOperationalMarkup(){
 if(!rootZoneVwcPredictions.some(p=>p.split==='operational'))return '<p class="root-vwc-muted">Import operational model predictions (validation_split=operational) with both area_below_threshold_pct and valid_area_pct to run the field rule. Mean field VWC alone is not sufficient to determine what percentage of the mapped field is below 0.15 m³/m³. Use train / validation / test only for model evaluation.</p>';
 const result=rootVwcClassifyOperational(rootZoneVwcPredictions,rootZoneVwcAreaThresholdPct,rootZoneVwcCoverageMinPct),rows=result.fields.map(f=>'<tr><td>'+rootVwcEscape(f.fieldNo)+'</td><td>'+f.observationCount+'</td><td>'+f.evaluableCount+'</td><td>'+f.events.length+'</td><td>'+rootVwcEscape(f.status)+'</td></tr>').join(''),events=result.events.map(e=>'<tr><td>'+rootVwcEscape(e.fieldNo)+'</td><td>'+e.from+'</td><td>'+e.triggerDate+'</td><td>'+e.lastDate+'</td><td>'+e.observationCount+'</td><td>'+e.minimumAreaBelowPct.toFixed(1)+'%</td><td>'+e.minimumValidAreaPct.toFixed(1)+'%</td><td>'+e.meanVwc.toFixed(3)+'</td><td>'+rootVwcEscape(e.modelVersion)+'</td></tr>').join('');
 return '<div class="root-vwc-kpis"><article><small>Fields assessed</small><b>'+result.fields.length+'</b></article><article><small>Qualifying periods</small><b>'+result.events.length+'</b></article><article><small>Field-area threshold</small><b>'+result.areaThresholdPct+'%</b></article><article><small>Minimum valid coverage</small><b>'+result.coverageMinPct+'%</b></article></div><div class="root-vwc-section-head"><div><p>Rule: model-estimated 0–30 cm VWC below 0.15 m³/m³ across at least '+result.areaThresholdPct+'% of the mapped field on two consecutive available observation dates. Each date must have at least '+result.coverageMinPct+'% valid field coverage.</p></div><div class="root-vwc-actions"><label class="root-vwc-config">Area below 15% VWC (%) <input id="rootVwcAreaThreshold" type="number" min="1" max="100" step="1" value="'+result.areaThresholdPct+'"></label><label class="root-vwc-config">Minimum valid field coverage (%) <input id="rootVwcCoverageMin" type="number" min="1" max="100" step="1" value="'+result.coverageMinPct+'"></label><button type="button" class="outline" id="rootVwcExportOperational">Export classification CSV</button></div></div><h4>Field-level result</h4><div class="table-wrap"><table class="satellite-only-table"><thead><tr><th>Field</th><th>Model dates</th><th>Evaluable dates</th><th>Qualifying periods</th><th>Classification</th></tr></thead><tbody>'+rows+'</tbody></table></div><h4>Qualifying periods</h4>'+(events?'<div class="table-wrap"><table class="satellite-only-table"><thead><tr><th>Field</th><th>First qualifying date</th><th>Trigger date (2nd observation)</th><th>Last qualifying date</th><th>Observations</th><th>Minimum area below 15%</th><th>Minimum valid coverage</th><th>Mean field VWC</th><th>Model</th></tr></thead><tbody>'+events+'</tbody></table></div>':'<p class="root-vwc-muted">No field has met the two-observation rule in the imported prediction set.</p>')+'<p class="root-vwc-muted">The event date is the second qualifying available observation. This is a VWC-based dryness classification under the selected rule; it does not establish the physical cause of drying. The engine does not create or alter VM0051 audit records.</p>';
}
function rootVwcDownloadOperational(){const r=rootVwcClassifyOperational(rootZoneVwcPredictions,rootZoneVwcAreaThresholdPct,rootZoneVwcCoverageMinPct),h=['field_no','first_qualifying_date','trigger_date','last_qualifying_date','qualifying_observations','minimum_area_below_15_pct','minimum_valid_field_coverage_pct','mean_predicted_vwc_0_30_m3_m3','model_version'];const rows=r.events.map(e=>[e.fieldNo,e.from,e.triggerDate,e.lastDate,e.observationCount,e.minimumAreaBelowPct,e.minimumValidAreaPct,e.meanVwc,e.modelVersion]);rootVwcDownload('root-zone-vwc-operational-classification.csv',[h,...rows]);}
function rootVwcMetrics(actualRows,predictions,split='test'){
 const actual=new Map(actualRows.filter(x=>x.split===split).map(x=>[[x.fieldNo,x.date].join('|'),x]));
 const pairs=predictions.filter(p=>p.split===split&&actual.has([p.fieldNo,p.date].join('|'))).map(p=>({a:actual.get([p.fieldNo,p.date].join('|')).actualVwc,p:p.predictedVwc,field:p.fieldNo,lo:p.lower90,hi:p.upper90}));
 if(!pairs.length)return {count:0,fields:0,mae:null,rmse:null,bias:null,r2:null,precision:null,recall:null,f1:null,tp:0,fp:0,tn:0,fn:0,intervalCount:0,intervalCoverage:null};
 const e=pairs.map(x=>x.p-x.a),mae=e.reduce((s,x)=>s+Math.abs(x),0)/e.length,rmse=Math.sqrt(e.reduce((s,x)=>s+x*x,0)/e.length),bias=e.reduce((s,x)=>s+x,0)/e.length,mean=pairs.reduce((s,x)=>s+x.a,0)/pairs.length,tot=pairs.reduce((s,x)=>s+(x.a-mean)**2,0),res=e.reduce((s,x)=>s+x*x,0);
 let tp=0,fp=0,tn=0,fn=0,ic=0,covered=0;pairs.forEach(x=>{const a=x.a<.15,p=x.p<.15;if(a&&p)tp++;else if(!a&&p)fp++;else if(!a&&!p)tn++;else fn++;if(x.lo!==null&&x.hi!==null){ic++;if(x.a>=x.lo&&x.a<=x.hi)covered++}});
 const precision=tp+fp?tp/(tp+fp):null,recall=tp+fn?tp/(tp+fn):null;
 return {count:pairs.length,fields:new Set(pairs.map(x=>x.field)).size,mae,rmse,bias,r2:tot>0?1-res/tot:null,precision,recall,f1:precision!==null&&recall!==null&&precision+recall?2*precision*recall/(precision+recall):null,tp,fp,tn,fn,intervalCount:ic,intervalCoverage:ic?covered/ic:null};
}
function rootVwcDownload(name,rows){const q=v=>'"'+String(v??'').replaceAll('"','""')+'"',csv='\uFEFF'+rows.map(r=>r.map(q).join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function rootZoneVwcDownloadGroundTemplate(){rootVwcDownload('root-zone-vwc-ground-measurement-template.csv',[
 ['field_no','date','sample_point_id','depth_top_cm','depth_bottom_cm','vwc_m3_m3','gravimetric_water_content_kg_kg','measurement_method','validation_split','soil_texture','bulk_density_g_cm3','crop','crop_stage','latitude','longitude','probe_id','notes'],
 ...['P1','P2','P3'].flatMap(p=>[[ 'FIELD-001','2026-07-01',p,0,10,'','','probe','train','loam','','Paddy rice','vegetative','','','PROBE-01',''],['FIELD-001','2026-07-01',p,10,20,'','','probe','train','loam','','Paddy rice','vegetative','','','PROBE-01',''],['FIELD-001','2026-07-01',p,20,30,'','','probe','train','loam','','Paddy rice','vegetative','','','PROBE-01','']])
 ])}
function rootZoneVwcDownloadPredictionTemplate(){rootVwcDownload('root-zone-vwc-model-prediction-template.csv',[['field_no','date','predicted_vwc_0_30_m3_m3','area_below_threshold_pct','valid_area_pct','model_version','validation_split','lower_90','upper_90'],['FIELD-001','2026-07-01','','','','model-v0.1','operational','','']])}
function rootZoneVwcGroundSummaryMarkup(){
 if(!rootZoneVwcGroundRows.length)return '<p class="root-vwc-muted">No ground measurements imported. Download the template and upload field measurements.</p>';
 const d=rootZoneVwcFieldDates,points=rootZoneVwcCompletePoints,fields=new Set(points.map(x=>x.fieldNo)),splits=['train','validation','test'].map(s=>s+': '+[...fields].filter(f=>points.some(x=>x.fieldNo===f&&x.split===s)).length).join(' · ');
 const rows=d.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.fieldNo.localeCompare(b.fieldNo)).map(x=>'<tr><td>'+rootVwcEscape(x.fieldNo)+'</td><td>'+x.date+'</td><td>'+x.samplePointCount+'</td><td>'+x.actualVwc.toFixed(3)+'</td><td>'+(x.actualVwc<.15?'Below 0.15':'At/above 0.15')+'</td><td>'+x.split+'</td></tr>').join('');
 return '<div class="root-vwc-kpis"><article><small>Complete sample points</small><b>'+points.length+'</b></article><article><small>Field-date references</small><b>'+d.length+'</b></article><article><small>Fields represented</small><b>'+fields.size+'</b></article><article><small>Incomplete sample points</small><b>'+rootZoneVwcIncompleteCount+'</b></article></div><p class="root-vwc-muted">Field split allocation: '+rootVwcEscape(splits)+'. All dates from a field remain in one split. Field-date references require at least three complete sampling points.</p><div class="table-wrap"><table class="satellite-only-table"><thead><tr><th>Field</th><th>Date</th><th>Complete points</th><th>Measured VWC (0–30 cm)</th><th>Provisional 15% flag</th><th>Split</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
let rootZoneVwcIncompleteCount=0;
function rootZoneVwcPredictionSummaryMarkup(){
 if(!rootZoneVwcPredictions.length)return '<p class="root-vwc-muted">No model predictions imported. This POC does not generate satellite-derived VWC until a calibrated model is developed and independently tested.</p>';
 const m=rootVwcMetrics(rootZoneVwcFieldDates,rootZoneVwcPredictions),fmt=x=>x===null?'—':x.toFixed(3),pct=x=>x===null?'—':(100*x).toFixed(1)+'%';
 const actual=new Map(rootZoneVwcFieldDates.map(x=>[[x.fieldNo,x.date].join('|'),x]));
 const rows=rootZoneVwcPredictions.filter(p=>p.split==='test').map(p=>{const a=actual.get([p.fieldNo,p.date].join('|'));return '<tr><td>'+rootVwcEscape(p.fieldNo)+'</td><td>'+p.date+'</td><td>'+(a?a.actualVwc.toFixed(3):'—')+'</td><td>'+p.predictedVwc.toFixed(3)+'</td><td>'+(a?(a.actualVwc<.15?'Below':'At/above'):'No matched reference')+'</td><td>'+(p.predictedVwc<.15?'Below':'At/above')+'</td><td>'+rootVwcEscape(p.modelVersion)+'</td></tr>'}).join('');
 return '<div class="root-vwc-kpis"><article><small>Matched independent test pairs</small><b>'+m.count+'</b></article><article><small>Test fields</small><b>'+m.fields+'</b></article><article><small>MAE · m³/m³</small><b>'+fmt(m.mae)+'</b></article><article><small>RMSE · m³/m³</small><b>'+fmt(m.rmse)+'</b></article><article><small>Mean bias · m³/m³</small><b>'+fmt(m.bias)+'</b></article><article><small>Threshold precision</small><b>'+pct(m.precision)+'</b></article><article><small>Threshold recall</small><b>'+pct(m.recall)+'</b></article><article><small>Threshold F1</small><b>'+pct(m.f1)+'</b></article></div><p class="root-vwc-muted">Field-held-out test only · R² '+fmt(m.r2)+' · TP '+m.tp+' / FP '+m.fp+' / TN '+m.tn+' / FN '+m.fn+'. '+(m.intervalCount?'90% interval coverage '+pct(m.intervalCoverage)+'.':'No prediction intervals supplied.')+' Test metrics are descriptive; freeze acceptance criteria before final testing.</p><div class="table-wrap"><table class="satellite-only-table"><thead><tr><th>Field</th><th>Date</th><th>Measured VWC</th><th>Predicted VWC</th><th>Actual threshold</th><th>Predicted threshold</th><th>Model</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function rootZoneVwcSatelliteCoverageMarkup(){
 const map=new Map();(satelliteOnlyRuns||[]).forEach(run=>(satelliteOnlyRunFields(run)||[]).forEach(f=>{const no=String(f.fieldNo||'');if(!no)return;const s=Array.isArray(f.observationSeries)?f.observationSeries:[],dates=s.map(x=>String(x.date||x.interval?.from||'').slice(0,10)).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)),o=map.get(no)||{s1:0,s2:0,dates:[],runs:[]};o.s1=Math.max(o.s1,s.filter(x=>(x.vv!==null&&x.vv!==undefined&&Number.isFinite(Number(x.vv)))||(x.vh!==null&&x.vh!==undefined&&Number.isFinite(Number(x.vh)))).length);o.s2=Math.max(o.s2,s.filter(x=>['ndvi','ndmi','ndre','evi','savi'].some(k=>x[k]!==null&&x[k]!==undefined&&Number.isFinite(Number(x[k])))).length);o.dates.push(...dates);o.runs.push(run.id);map.set(no,o)}));
 if(!map.size)return '<p class="root-vwc-muted">No saved satellite observations are currently available. Generate a saved Sentinel-1/2 run first.</p>';
 return '<div class="table-wrap"><table class="satellite-only-table"><thead><tr><th>Field</th><th>Sentinel-1 rows</th><th>Sentinel-2 rows</th><th>Observation date span</th><th>Saved runs</th></tr></thead><tbody>'+[...map].map(([f,x])=>{const d=[...new Set(x.dates)].sort();return '<tr><td>'+rootVwcEscape(f)+'</td><td>'+x.s1+'</td><td>'+x.s2+'</td><td>'+(d.length?d[0]+' to '+d[d.length-1]:'No dates')+'</td><td>'+new Set(x.runs).size+'</td></tr>'}).join('')+'</tbody></table></div><p class="root-vwc-muted">Coverage inventory only; it does not retrieve pixel-level features or estimate VWC.</p>';
}
function rootZoneVwcPocPage(){
 return '<section class="panel root-vwc-panel" id="rootZoneVwcPoc"><div class="panel-head"><div><p class="eyebrow">CALIBRATION AND VALIDATION WORKBENCH</p><h2>Root-Zone Soil Moisture Intelligence · POC</h2><p class="muted">Target depth 0–30 cm · provisional threshold 0.15 m³/m³</p></div><span class="status-chip planned">FEASIBILITY · NOT CALIBRATED</span></div><div class="sat-evidence-note"><b>Model boundary</b><p>Sentinel-1 is primarily sensitive to near-surface conditions; Sentinel-2 provides vegetation context. Neither directly measures 0–30 cm VWC. This workbench validates ground profiles, inventories saved satellite coverage and evaluates predictions from a separately calibrated model. It does not infer VWC from VV/VH or vegetation indices, and does not create drainage-event records. The operational classifier consumes model-produced per-field area fractions; the saved satellite snapshot currently contains field-level indices/backscatter, not pixel-level VWC maps.</p></div><div class="root-vwc-section"><div class="root-vwc-section-head"><div><h3>1. Ground-truth measurements</h3><p>One row per field, date, sample point and depth interval. Each point must cover 0–30 cm continuously without gaps or overlap. At least three complete points per field-date; five are recommended.</p></div><div class="root-vwc-actions"><button class="outline" id="rootVwcGroundTemplate" type="button">Download measurement template</button><label class="outline root-vwc-upload" for="rootVwcGroundFile">Import ground measurements</label><input hidden type="file" id="rootVwcGroundFile" accept=".csv,text/csv">'+(rootZoneVwcGroundRows.length?'<button class="outline" id="rootVwcClearGround" type="button">Clear measurements</button><button class="outline" id="rootVwcExportGround" type="button">Export validated rows</button>':'')+'</div></div><p class="root-vwc-status">'+rootVwcEscape(rootZoneVwcImportStatus||'No ground-truth CSV imported in this browser session.')+'</p>'+rootZoneVwcGroundSummaryMarkup()+'</div><div class="root-vwc-section"><h3>2. Saved satellite observation coverage</h3><p class="root-vwc-muted">Company-scoped saved runs only. Satellite observations remain an independent evidence stream.</p>'+rootZoneVwcSatelliteCoverageMarkup()+'</div><div class="root-vwc-section"><div class="root-vwc-section-head"><div><h3>3. Provisional satellite condition index (no ground truth required)</h3><p>Calculate a field-relative canopy-condition proxy from matched Sentinel-2 NDMI / NDVI history. Sentinel-1 VV / VH are retained as anomaly context, not converted into moisture values.</p></div><div class="root-vwc-actions"><button type="button" class="primary" id="rootVwcRunRelativeProxy">Calculate provisional index</button><button type="button" class="outline" id="rootVwcDownloadRelativeProxy">Download proxy CSV</button></div></div><p class="root-vwc-status">No ground-truth VWC is required for this exploratory relative index. Each field is compared with its own satellite history; at least six matched observation dates are required for a score.</p>'+rootZoneVwcProxyMarkup()+'</div><div class="root-vwc-section"><div class="root-vwc-section-head"><div><h3>4. Ground-truth VWC model calibration (future phase)</h3><p>When measured 0–30 cm soil profiles become available, train a regularized regression model from matched ground profiles and saved Sentinel-1 / Sentinel-2 observations.</p></div><div class="root-vwc-actions"><label class="root-vwc-config">Maximum sample-to-satellite date gap (days) <input id="rootVwcMatchTolerance" type="number" min="0" max="15" step="1" value="5"></label><button type="button" class="primary" id="rootVwcTrainSatelliteModel" '+(rootZoneVwcFieldDates.length?'':'disabled')+'>Train calibrated VWC model</button></div></div><p class="root-vwc-status">Features: Sentinel-2 NDVI and NDMI; Sentinel-1 VV and VH. Training uses training fields only; validation selects the ridge penalty; test fields remain untouched for final evaluation.</p>' + rootZoneVwcModelMarkup() + '</div><div class="root-vwc-section"><div class="root-vwc-section-head"><div><h3>5. Calibrated model prediction evaluation</h3><p>Import predictions generated by a model trained against measured 0–30 cm VWC. Operational predictions can be imported independently; train / validation / test rows are used only for evaluation. One model version per file.</p></div><div class="root-vwc-actions"><button class="outline" id="rootVwcPredictionTemplate" type="button">Download prediction template</button><label class="outline root-vwc-upload" for="rootVwcPredictionFile">Import predictions</label><input hidden type="file" id="rootVwcPredictionFile" accept=".csv,text/csv">'+(rootZoneVwcPredictions.length?'<button class="outline" id="rootVwcClearPredictions" type="button">Clear predictions</button>':'')+'</div></div><p class="root-vwc-status">'+rootVwcEscape(rootZoneVwcPredictionStatus||'No model predictions imported.')+'</p>'+rootZoneVwcPredictionSummaryMarkup()+'</div><div class="root-vwc-section"><h3>6. Operational VWC-based dryness classification</h3><p class="root-vwc-muted">This applies the agreed 15% VWC / 80% field-area / two consecutive available observations rule to model-generated area statistics. It is separate from model calibration and does not infer per-pixel moisture from the currently saved field-average Sentinel indices.</p>'+rootVwcOperationalMarkup()+'</div><div class="root-vwc-section"><h3>7. Interpretation safeguards</h3><ul><li>Measured VWC is depth-weighted over 0–30 cm. Gravimetric water content is converted using bulk density when supplied (VWC = gravimetric water content × bulk density).</li><li>Field-level train / validation / test splits prevent repeated observations from the same field leaking across splits.</li><li>The 0.15 m³/m³ threshold is provisional, not a universal agronomic or VM0051 rule.</li><li>Below-threshold VWC indicates a moisture condition, not proof of farmer-performed drainage.</li><li>Imported data remain in browser memory only; refresh or close clears them. Export data for retention. No database or audit-register rows are written.</li></ul></div><div class="root-vwc-footnote">POC status: satellite capture and coverage inventory are implemented. A provisional within-field satellite condition proxy is available without ground truth; calibrated 0–30 cm VWC prediction, area-based dryness classification and independent field validation remain pending measured soil profiles and spatially resolved evidence.</div></section>';
}
function rootZoneVwcBindFile(id,handler){const input=document.getElementById(id);if(!input)return;input.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{await handler(await file.text(),file.name);renderManager()}catch(err){notify(err?.message||'CSV import failed.')}finally{e.target.value=''}})}
function bindRootZoneVwcPocPage(){
 document.getElementById('rootVwcRunRelativeProxy')?.addEventListener('click',()=>{try{rootZoneVwcRunRelativeProxy();renderManager()}catch(error){notify(error?.message||'Could not calculate the provisional satellite index.')}});
 document.getElementById('rootVwcDownloadRelativeProxy')?.addEventListener('click',rootZoneVwcDownloadRelativeProxy);
 document.getElementById('rootVwcGroundTemplate')?.addEventListener('click',rootZoneVwcDownloadGroundTemplate);
 document.getElementById('rootVwcPredictionTemplate')?.addEventListener('click',rootZoneVwcDownloadPredictionTemplate);
 document.getElementById('rootVwcTrainSatelliteModel')?.addEventListener('click',()=>{try{rootZoneVwcRunSatelliteModel();renderManager()}catch(error){notify(error?.message||'Could not train the satellite-to-VWC model.')}});
 document.getElementById('rootVwcDownloadGeneratedPredictions')?.addEventListener('click',rootVwcDownloadGeneratedPredictions);
 document.getElementById('rootVwcExportOperational')?.addEventListener('click',rootVwcDownloadOperational);
 const areaInput=document.getElementById('rootVwcAreaThreshold'),coverageInput=document.getElementById('rootVwcCoverageMin');
 areaInput?.addEventListener('change',()=>{const n=Number(areaInput.value);if(!Number.isFinite(n)||n<1||n>100){notify('Area threshold must be between 1 and 100%.');return}rootZoneVwcAreaThresholdPct=n;renderManager()});
 coverageInput?.addEventListener('change',()=>{const n=Number(coverageInput.value);if(!Number.isFinite(n)||n<1||n>100){notify('Valid field coverage must be between 1 and 100%.');return}rootZoneVwcCoverageMinPct=n;renderManager()});
 rootZoneVwcBindFile('rootVwcGroundFile',async(text,name)=>{const b=rootVwcBuildGround(rootVwcParseCsv(text));rootZoneVwcGroundRows=b.parsed;rootZoneVwcCompletePoints=b.points;rootZoneVwcFieldDates=b.fieldDates;rootZoneVwcIncompleteCount=b.incomplete.length;rootZoneVwcImportStatus='Imported '+b.parsed.length+' depth rows · '+b.points.length+' complete sample points · '+b.fieldDates.length+' field-date references · '+b.fieldCount+' fields · '+b.incomplete.length+' incomplete points excluded. File: '+name;rootZoneVwcPredictions=[];rootZoneVwcModelResult=null;rootZoneVwcPredictionStatus='Predictions cleared because the reference dataset changed.';notify('Ground measurements validated and imported in this browser session.')});
 rootZoneVwcBindFile('rootVwcPredictionFile',async(text,name)=>{const p=rootVwcBuildPredictions(rootVwcParseCsv(text)),splits=new Map(rootZoneVwcFieldDates.map(x=>[x.fieldNo,x.split]));rootZoneVwcModelResult=null;p.forEach(x=>{if(splits.has(x.fieldNo)&&x.split!=='operational'&&splits.get(x.fieldNo)!==x.split)throw new Error('Prediction split does not match ground-reference split for field '+x.fieldNo+'.')});rootZoneVwcPredictions=p;const m=rootVwcMetrics(rootZoneVwcFieldDates,p);rootZoneVwcPredictionStatus='Imported '+p.length+' predictions · '+m.count+' independent test pairs · '+new Set(p.map(x=>x.modelVersion)).size+' model version. File: '+name;notify('Model predictions imported; independent test metrics calculated.')});
 document.getElementById('rootVwcClearGround')?.addEventListener('click',()=>{rootZoneVwcGroundRows=[];rootZoneVwcCompletePoints=[];rootZoneVwcFieldDates=[];rootZoneVwcPredictions=[];rootZoneVwcModelResult=null;rootZoneVwcIncompleteCount=0;rootZoneVwcImportStatus='Ground measurements cleared.';rootZoneVwcPredictionStatus='Predictions cleared.';renderManager()});
 document.getElementById('rootVwcClearPredictions')?.addEventListener('click',()=>{rootZoneVwcPredictions=[];rootZoneVwcPredictionStatus='Predictions cleared.';renderManager()});
 document.getElementById('rootVwcExportGround')?.addEventListener('click',()=>{const h=['field_no','date','sample_point_id','depth_top_cm','depth_bottom_cm','vwc_m3_m3','measurement_method','validation_split','soil_texture','bulk_density_g_cm3','crop'];const rows=[h,...rootZoneVwcGroundRows.map(x=>[x.fieldNo,x.date,x.point,x.top,x.bottom,x.vwc,x.method,x.split,x.soilTexture,x.bulkDensity,x.crop])];rootVwcDownload('root-zone-vwc-validated-depth-rows.csv',rows)});
}
