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
 const required=['field_no','date','predicted_vwc_0_30_m3_m3','model_version','validation_split'];
 for(const h of required)if(!(h in (rows[0]||{})))throw new Error('Prediction CSV is missing required column: '+h);
 const seen=new Set(),splits=new Map(),versions=new Set();
 const predictions=rows.map(r=>{
  const n=r.__row,field=String(r.field_no||'').trim(),date=rootVwcDate(r.date,n),pred=rootVwcNum(r.predicted_vwc_0_30_m3_m3,'predicted_vwc_0_30_m3',n),version=String(r.model_version||'').trim(),split=rootVwcPredictionSplit(r.validation_split,n),windowId=String(r.observation_window_id||'').trim();
  if(!field||!version)throw new Error('Row '+n+': field_no and model_version are required.');
  if(split==='operational'&&!windowId)throw new Error('Row '+n+': observation_window_id is required for operational predictions. Use the same window ID for every observation belonging to the same field/window.');
  if(pred<0||pred>1)throw new Error('Row '+n+': predicted VWC must be between 0 and 1.');
  const key=[field,date,version].join('|');if(seen.has(key))throw new Error('Row '+n+': duplicate field/date/model_version prediction.');seen.add(key);
  const old=splits.get(field);if(old&&old!==split)throw new Error('Prediction field '+field+' appears in multiple data splits.');splits.set(field,split);versions.add(version);
  const lower=rootVwcNum(r.lower_90,'lower_90',n,false),upper=rootVwcNum(r.upper_90,'upper_90',n,false),areaBelow=rootVwcNum(r.area_below_threshold_pct,'area_below_threshold_pct',n,false),validArea=rootVwcNum(r.valid_area_pct,'valid_area_pct',n,false);
  if((lower!==null&&(lower<0||lower>1))||(upper!==null&&(upper<0||upper>1))||(lower!==null&&upper!==null&&lower>upper))throw new Error('Row '+n+': lower_90 and upper_90 must be ordered VWC values between 0 and 1.');
  if((areaBelow!==null&&(areaBelow<0||areaBelow>100))||(validArea!==null&&(validArea<0||validArea>100))||(areaBelow!==null&&validArea!==null&&areaBelow>validArea))throw new Error('Row '+n+': area percentages must be between 0 and 100, and area_below_threshold_pct (percentage of total mapped field area) cannot exceed valid_area_pct.');
  if(split==='operational'&&(areaBelow===null||validArea===null))throw new Error('Row '+n+': operational predictions require area_below_threshold_pct and valid_area_pct from spatial pixel-level estimates.');
  return {fieldNo:field,date,predictedVwc:pred,modelVersion:version,split,windowId,lower90:lower,upper90:upper,areaBelowThresholdPct:areaBelow,validAreaPct:validArea};
 });
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
 function rootVwcRobustScale(values){
  const clean=values.filter(Number.isFinite),med=rootVwcMedian(clean);
  if(!clean.length)return {median:null,scale:1,method:'unavailable'};
  const mad=rootVwcMedian(clean.map(x=>Math.abs(x-med)));
  if(mad>1e-9)return {median:med,scale:1.4826*mad,method:'MAD'};
  const sorted=clean.slice().sort((a,b)=>a-b),q1=sorted[Math.floor((sorted.length-1)*0.25)],q3=sorted[Math.floor((sorted.length-1)*0.75)];
  if(q3-q1>1e-9)return {median:med,scale:(q3-q1)/1.349,method:'IQR fallback'};
  const mean=clean.reduce((a,b)=>a+b,0)/clean.length,sd=Math.sqrt(clean.reduce((a,b)=>a+(b-mean)**2,0)/clean.length);
  return {median:med,scale:sd>1e-9?sd:1,method:sd>1e-9?'standard deviation fallback':'constant feature'};
}
function rootVwcBuildRelativeProxy(featureRows){
 const grouped=new Map();(featureRows||[]).forEach(x=>{if(!grouped.has(x.fieldNo))grouped.set(x.fieldNo,[]);grouped.get(x.fieldNo).push(x)});
 const fields=[],featureKeys=['ndmi','ndvi','vv','vh'];let trainingObservations=0;
 for(const [fieldNo,items] of grouped){
  items.sort((a,b)=>a.date.localeCompare(b.date));
  const latest=items[items.length-1],enough=items.length>=6,baselines={};
  featureKeys.forEach(key=>{baselines[key]=rootVwcRobustScale(items.map(x=>x.features[key]))});
  trainingObservations+=items.length;
  const z={};
  featureKeys.forEach(key=>{const b=baselines[key],v=latest.features[key];z[key]=Number.isFinite(v)?(v-b.median)/b.scale:null});
  const ndmiRank=enough?rootVwcPercentile(items.map(x=>x.features.ndmi),latest.features.ndmi):null;
  const ndviRank=enough?rootVwcPercentile(items.map(x=>x.features.ndvi),latest.features.ndvi):null;
  const conditionScore=enough?0.7*ndmiRank+0.3*ndviRank:null;
  const validZ=featureKeys.map(k=>z[k]).filter(Number.isFinite),anomalyDistance=validZ.length?Math.sqrt(validZ.reduce((a,b)=>a+b*b,0)/validZ.length):null;
  const maxAbsZ=validZ.length?Math.max(...validZ.map(Math.abs)):null;
  const anomalyBand=maxAbsZ===null?'Not scored':maxAbsZ>=2.5?'Strong deviation':maxAbsZ>=1.5?'Watch':'Within baseline';
  let conditionBand='Insufficient history';
  if(conditionScore!==null)conditionBand=conditionScore<20?'Low relative canopy signal':conditionScore<40?'Below own-history range':conditionScore<60?'Near own-history midpoint':conditionScore<80?'Above own-history midpoint':'High relative canopy signal';
  fields.push({fieldNo,latestDate:latest.date,observations:items.length,ndmi:latest.features.ndmi,ndvi:latest.features.ndvi,vv:latest.features.vv,vh:latest.features.vh,conditionScore,conditionBand,anomalyDistance,maxAbsZ,anomalyBand,z,baselineMethods:Object.fromEntries(featureKeys.map(k=>[k,baselines[k].method]))});
 }
 return {fields,featureCount:(featureRows||[]).length,trainingObservations,fieldBaselines:fields.length,minimumObservations:6,features:featureKeys,modelVersion:'SAT-ROBUST-1.0',modelType:'Unsupervised field-specific robust baseline (median/MAD with IQR and standard-deviation fallbacks)',conditionFormula:'70% within-field NDMI percentile + 30% within-field NDVI percentile',anomalyFormula:'Root-mean-square robust standardized deviation across NDMI, NDVI, VV and VH'};
}
function rootZoneVwcProxyMarkup(){
 if(!rootZoneVwcProxyResult)return '<p class="root-vwc-muted">No satellite-only model has been trained in this browser session. Click Train satellite-only model to fit field-specific baselines from saved combined Sentinel-1 / Sentinel-2 observations.</p>';
 const r=rootZoneVwcProxyResult,rows=r.fields.map(x=>'<tr><td>'+rootVwcEscape(x.fieldNo)+'</td><td>'+x.latestDate+'</td><td>'+(x.conditionScore===null?'—':x.conditionScore.toFixed(1)+'/100')+'</td><td>'+rootVwcEscape(x.conditionBand)+'</td><td>'+(x.anomalyDistance===null?'—':x.anomalyDistance.toFixed(2))+'</td><td>'+rootVwcEscape(x.anomalyBand)+'</td><td>'+x.ndmi.toFixed(3)+'</td><td>'+x.ndvi.toFixed(3)+'</td><td>'+x.vv.toFixed(3)+'</td><td>'+x.vh.toFixed(3)+'</td><td>'+x.observations+'</td></tr>').join('');
 return '<div class="root-vwc-kpis"><article><small>Training observations</small><b>'+r.trainingObservations+'</b></article><article><small>Field-specific baselines</small><b>'+r.fieldBaselines+'</b></article><article><small>Satellite features</small><b>'+r.features.length+'</b></article><article><small>Fields scored</small><b>'+r.fields.filter(x=>x.conditionScore!==null).length+'</b></article></div><p class="root-vwc-muted"><b>Trained model:</b> '+rootVwcEscape(r.modelVersion)+' · '+rootVwcEscape(r.modelType)+'. Condition index: '+rootVwcEscape(r.conditionFormula)+'. Anomaly metric: '+rootVwcEscape(r.anomalyFormula)+'.</p><div class="table-wrap"><table class="satellite-only-table"><thead><tr><th>Field</th><th>Latest date</th><th>Condition index</th><th>Relative condition</th><th>Anomaly distance</th><th>Anomaly status</th><th>NDMI</th><th>NDVI</th><th>VV</th><th>VH</th><th>History</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="root-vwc-muted"><b>Model diagnostics:</b> field-specific baselines are fitted independently to each field’s available history. Robust deviations use median/MAD, with IQR or standard-deviation fallbacks when necessary. “Watch” and “Strong deviation” are exploratory thresholds, not validated risk probabilities. The condition index ranks current NDMI/NDVI within the same field’s history; the anomaly distance uses all four features. This is an unsupervised satellite-condition model, not a supervised VWC model. It has no ground-truth accuracy, RMSE or R² and does not estimate m³/m³ or activate the 15% VWC / 80% area rule.</p>';
}
function rootZoneVwcRunRelativeProxy(){
 const features=rootVwcSatelliteFeatureRows();if(!features.length)throw new Error('No combined Sentinel-1 / Sentinel-2 field observations are available. Save satellite runs first.');
 rootZoneVwcProxyResult=rootVwcBuildRelativeProxy(features);
 notify('Satellite-only unsupervised model trained on '+rootZoneVwcProxyResult.trainingObservations+' observations across '+rootZoneVwcProxyResult.fieldBaselines+' field baselines.');
}
function rootZoneVwcDownloadRelativeProxy(){
 if(!rootZoneVwcProxyResult)return;
 const h=['model_version','field_no','latest_date','relative_condition_index_0_100','relative_condition_band','robust_anomaly_distance','anomaly_status','ndmi','ndvi','vv','vh','matched_observation_count','ndmi_robust_z','ndvi_robust_z','vv_robust_z','vh_robust_z','model_type','ground_truth_status'];
 const rows=rootZoneVwcProxyResult.fields.map(x=>[rootZoneVwcProxyResult.modelVersion,x.fieldNo,x.latestDate,x.conditionScore??'',x.conditionBand,x.anomalyDistance??'',x.anomalyBand,x.ndmi,x.ndvi,x.vv,x.vh,x.observations,x.z.ndmi??'',x.z.ndvi??'',x.z.vv??'',x.z.vh??'',rootZoneVwcProxyResult.modelType,'No ground-truth VWC; not an absolute soil-moisture prediction']);
 rootVwcDownload('satellite-only-model-results.csv',[h,...rows]);
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
 const grouped=new Map();
 predictions.filter(p=>p.split==='operational').forEach(p=>{
  const key=JSON.stringify([p.fieldNo,p.windowId]);
  if(!grouped.has(key))grouped.set(key,[]);
  grouped.get(key).push(p);
 });
 const fields=[];
 for(const items of grouped.values()){
  items.sort((a,b)=>a.date.localeCompare(b.date));
  const fieldNo=items[0].fieldNo,windowId=items[0].windowId;
  let qualifyingRun=[],event=null,evaluable=0;
  for(const p of items){
   const valid=p.areaBelowThresholdPct!==null&&p.validAreaPct!==null&&p.validAreaPct>=coverageMinPct;
   if(valid)evaluable++;
   const qualifies=valid&&p.areaBelowThresholdPct>=areaThresholdPct;
   if(qualifies){
    if(event){
     event.lastDate=p.date;event.qualifyingObservationCount++;
     event.minimumAreaBelowPct=Math.min(event.minimumAreaBelowPct,p.areaBelowThresholdPct);
     event.minimumValidAreaPct=Math.min(event.minimumValidAreaPct,p.validAreaPct);
     event.vwcSum+=p.predictedVwc;event.meanVwc=event.vwcSum/event.qualifyingObservationCount;
    }else{
     qualifyingRun.push(p);
     if(qualifyingRun.length===2){
      const first=qualifyingRun[0],second=qualifyingRun[1];
      event={eventKey:[fieldNo,windowId,'VWC_DRYNESS'].join('::'),fieldNo,windowId,from:first.date,triggerDate:second.date,lastDate:second.date,qualifyingObservationCount:2,minimumAreaBelowPct:Math.min(first.areaBelowThresholdPct,second.areaBelowThresholdPct),minimumValidAreaPct:Math.min(first.validAreaPct,second.validAreaPct),vwcSum:first.predictedVwc+second.predictedVwc,meanVwc:(first.predictedVwc+second.predictedVwc)/2,modelVersion:first.modelVersion};
     }
    }
   }else if(!event){
    qualifyingRun=[];
   }
  }
  fields.push({fieldNo,windowId,observationCount:items.length,evaluableCount:evaluable,event,status:event?'ONE EVENT · TRIGGERED':evaluable?'NO QUALIFYING TWO-OBSERVATION TRIGGER':'INSUFFICIENT AREA-COVERAGE DATA'});
 }
 const events=fields.map(x=>x.event).filter(Boolean);
 return {fields,events,areaThresholdPct,coverageMinPct,observationRule:'Two consecutive qualifying available observations to trigger; one event per field and observation window; later qualifying observations update that event'};
}
function rootVwcOperationalMarkup(){
 if(!rootZoneVwcPredictions.some(p=>p.split==='operational'))return '<p class="root-vwc-muted">Import operational spatial-model predictions (validation_split=operational) with observation_window_id, area_below_threshold_pct and valid_area_pct. area_below_threshold_pct must be the percentage of the total mapped field area below 0.15 m³/m³, not merely the percentage of valid pixels. Mean field VWC alone cannot establish the affected area.</p>';
 const result=rootVwcClassifyOperational(rootZoneVwcPredictions,rootZoneVwcAreaThresholdPct,rootZoneVwcCoverageMinPct);
 const rows=result.fields.map(f=>'<tr><td>'+rootVwcEscape(f.fieldNo)+'</td><td>'+rootVwcEscape(f.windowId)+'</td><td>'+f.observationCount+'</td><td>'+f.evaluableCount+'</td><td>'+(f.event?1:0)+'</td><td>'+rootVwcEscape(f.status)+'</td></tr>').join('');
 const events=result.events.map(e=>'<tr><td>'+rootVwcEscape(e.eventKey)+'</td><td>'+rootVwcEscape(e.fieldNo)+'</td><td>'+rootVwcEscape(e.windowId)+'</td><td>'+e.from+'</td><td>'+e.triggerDate+'</td><td>'+e.lastDate+'</td><td>'+e.qualifyingObservationCount+'</td><td>'+e.minimumAreaBelowPct.toFixed(1)+'%</td><td>'+e.minimumValidAreaPct.toFixed(1)+'%</td><td>'+e.meanVwc.toFixed(3)+'</td><td>'+rootVwcEscape(e.modelVersion)+'</td></tr>').join('');
 return '<div class="root-vwc-kpis"><article><small>Field/windows assessed</small><b>'+result.fields.length+'</b></article><article><small>Unique events triggered</small><b>'+result.events.length+'</b></article><article><small>Field-area threshold</small><b>'+result.areaThresholdPct+'%</b></article><article><small>Minimum valid coverage</small><b>'+result.coverageMinPct+'%</b></article></div><div class="root-vwc-section-head"><div><p>Trigger: at least '+result.areaThresholdPct+'% of the total mapped field area below 0.15 m³/m³ on two consecutive qualifying available observations; each observation must have at least '+result.coverageMinPct+'% valid field coverage. One event is created per field/window. Further qualifying observations update that event.</p></div><div class="root-vwc-actions"><label class="root-vwc-config">Area below 15% VWC (%) <input id="rootVwcAreaThreshold" type="number" min="1" max="100" step="1" value="'+result.areaThresholdPct+'"></label><label class="root-vwc-config">Minimum valid field coverage (%) <input id="rootVwcCoverageMin" type="number" min="1" max="100" step="1" value="'+result.coverageMinPct+'"></label><button type="button" class="outline" id="rootVwcExportOperational">Export event CSV</button></div></div><h4>Field/window result</h4><div class="table-wrap"><table class="satellite-only-table"><thead><tr><th>Field</th><th>Window ID</th><th>Model dates</th><th>Evaluable dates</th><th>Events</th><th>Classification</th></tr></thead><tbody>'+rows+'</tbody></table></div><h4>Unique dryness events</h4>'+(events?'<div class="table-wrap"><table class="satellite-only-table"><thead><tr><th>Event key</th><th>Field</th><th>Window</th><th>First qualifying date</th><th>Trigger date</th><th>Last updated date</th><th>Qualifying observations</th><th>Minimum area below 15%</th><th>Minimum valid coverage</th><th>Mean field VWC</th><th>Model</th></tr></thead><tbody>'+events+'</tbody></table></div>':'<p class="root-vwc-muted">No field/window has met the two-observation trigger.</p>')+'<p class="root-vwc-muted">Event key is deterministic for this preview; this POC does not persist an event register or write database/audit records. The event records a VWC-based dryness condition, not proof of a physical drainage action.</p>';
}
function rootVwcDownloadOperational(){
 const r=rootVwcClassifyOperational(rootZoneVwcPredictions,rootZoneVwcAreaThresholdPct,rootZoneVwcCoverageMinPct),h=['event_key','field_no','observation_window_id','first_qualifying_date','trigger_date','last_updated_qualifying_date','qualifying_observations','minimum_area_below_15_pct_of_total_field','minimum_valid_field_coverage_pct','mean_predicted_vwc_0_30_m3_m3','model_version'];
 const rows=r.events.map(e=>[e.eventKey,e.fieldNo,e.windowId,e.from,e.triggerDate,e.lastDate,e.qualifyingObservationCount,e.minimumAreaBelowPct,e.minimumValidAreaPct,e.meanVwc,e.modelVersion]);
 rootVwcDownload('root-zone-vwc-operational-events.csv',[h,...rows]);
}

// Spatial pixel-to-root-zone VWC pipeline. Pixel features must be supplied from a field-clipped
// Sentinel extraction; calibration rows must link to measured 0-30 cm sample points.
let rootZoneVwcSpatialRows=[],rootZoneVwcSpatialResult=null,rootZoneVwcSpatialModel=null,rootZoneVwcSpatialStatus='';
function rootVwcBuildSpatialRows(rows){
 const required=['field_no','date','observation_window_id','cell_id','pixel_area_m2','ndvi','ndmi','vv','vh','sample_point_id','validation_split'];
 for(const h of required)if(!(h in (rows[0]||{})))throw new Error('Spatial pixel CSV is missing required column: '+h);
 const seen=new Set(),splits=new Map();
 return rows.map(r=>{
  const n=r.__row,field=String(r.field_no||'').trim(),date=rootVwcDate(r.date,n),windowId=String(r.observation_window_id||'').trim(),cellId=String(r.cell_id||'').trim(),samplePointId=String(r.sample_point_id||'').trim(),split=rootVwcPredictionSplit(r.validation_split,n),area=rootVwcNum(r.pixel_area_m2,'pixel_area_m2',n);
  if(!field||!windowId||!cellId)throw new Error('Row '+n+': field_no, observation_window_id and cell_id are required.');
  if(area<=0)throw new Error('Row '+n+': pixel_area_m2 must be greater than zero.');
  const key=[field,date,windowId,cellId].join('|');if(seen.has(key))throw new Error('Row '+n+': duplicate field/date/window/cell_id.');seen.add(key);
  const old=splits.get(field);if(old&&old!==split)throw new Error('Field '+field+' appears in multiple spatial prediction splits.');splits.set(field,split);
  const features={},vals=['ndvi','ndmi','vv','vh'].map(k=>rootVwcNum(r[k],k,n,false));
  const present=vals.filter(x=>x!==null).length;
  if(present!==0&&present!==4)throw new Error('Row '+n+': provide all four satellite features (NDVI, NDMI, VV, VH), or leave all four blank for an invalid/no-data cell.');
  if(samplePointId&&present!==4)throw new Error('Row '+n+': a calibration sample_point_id requires all four satellite features.');
  ['ndvi','ndmi','vv','vh'].forEach((k,i)=>features[k]=vals[i]);
  return {fieldNo:field,date,windowId,cellId,areaM2:area,features,valid:present===4,samplePointId,split};
 });
}
function rootVwcTrainSpatialModel(pixelRows,groundPoints){
 const lookup=new Map();(groundPoints||[]).forEach(p=>lookup.set([p.fieldNo,p.date,p.samplePointId].join('|'),p));
 const pairs=[];
 pixelRows.filter(x=>x.samplePointId&&x.valid).forEach(x=>{const g=lookup.get([x.fieldNo,x.date,x.samplePointId].join('|'));if(g)pairs.push({fieldNo:x.fieldNo,date:x.date,actualVwc:g.vwc,split:g.split,features:x.features,samplePointId:x.samplePointId})});
 const train=pairs.filter(x=>x.split==='train'),validation=pairs.filter(x=>x.split==='validation'),test=pairs.filter(x=>x.split==='test');
 if(train.length<12||new Set(train.map(x=>x.fieldNo)).size<4)throw new Error('Insufficient spatially matched calibration data. Need at least 12 matched sample-point/pixel pairs across at least 4 training fields; found '+train.length+' pairs across '+new Set(train.map(x=>x.fieldNo)).size+' fields. Match pixel rows to ground sample_point_id on the same field and date.');
 let alpha=1,model=rootVwcFitRidge(train,alpha),selection='default ridge penalty 1.0';
 if(validation.length>=4&&new Set(validation.map(x=>x.fieldNo)).size>=2){let best=Infinity;ROOT_VWC_RIDGE_CANDIDATES.forEach(a=>{const m=rootVwcFitRidge(train,a),score=rootVwcRegressionMetrics(validation,m);if(score.rmse!==null&&score.rmse<best){best=score.rmse;alpha=a;model=m}});selection='lowest validation RMSE across ridge penalties 0.01, 0.1, 1 and 10'}
 const testMetrics=rootVwcRegressionMetrics(test,model),validationMetrics=rootVwcRegressionMetrics(validation,model);
 return {model,modelVersion:'spatial-ridge-s1s2-v0.1',features:ROOT_VWC_SATELLITE_FEATURES.slice(),pairs,trainCount:train.length,trainFields:new Set(train.map(x=>x.fieldNo)).size,validationMetrics,testMetrics,alphaSelection:selection,status:'PROVISIONAL · SPATIAL TEST VALIDATION REQUIRED'};
}
function rootVwcEstimateSpatialFields(pixelRows,model){
 if(!model)throw new Error('Train the spatial VWC model against matched ground sample points before estimating field VWC.');
 const groups=new Map();
 pixelRows.forEach(x=>{const key=[x.fieldNo,x.date,x.windowId,x.split].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x)});
 const fields=[];
 for(const items of groups.values()){
  const totalArea=items.reduce((a,x)=>a+x.areaM2,0),valid=items.filter(x=>x.valid),validArea=valid.reduce((a,x)=>a+x.areaM2,0);
  if(totalArea<=0)continue;
  const cells=valid.map(x=>({cellId:x.cellId,areaM2:x.areaM2,vwc:rootVwcApplyModel(model.model,x.features)}));
  const belowArea=cells.filter(x=>x.vwc<ROOT_ZONE_VWC_THRESHOLD).reduce((a,x)=>a+x.areaM2,0);
  const mean=validArea?cells.reduce((a,x)=>a+x.vwc*x.areaM2,0)/validArea:null;
  fields.push({fieldNo:items[0].fieldNo,date:items[0].date,windowId:items[0].windowId,split:items[0].split,totalAreaM2:totalArea,validAreaM2:validArea,validAreaPct:100*validArea/totalArea,areaBelowThresholdPct:100*belowArea/totalArea,meanVwc:mean,minVwc:cells.length?Math.min(...cells.map(x=>x.vwc)):null,maxVwc:cells.length?Math.max(...cells.map(x=>x.vwc)):null,validCellCount:cells.length,totalCellCount:items.length,modelVersion:model.modelVersion,areaBelowThresholdM2:belowArea});
 }
 return fields.sort((a,b)=>a.fieldNo.localeCompare(b.fieldNo)||a.date.localeCompare(b.date));
}
function rootVwcRunSpatialEstimation(){
 if(!rootZoneVwcSpatialRows.length)throw new Error('Import field-clipped spatial pixel features first.');
 if(!rootZoneVwcCompletePoints.length)throw new Error('Import measured 0–30 cm ground sample points first.');
 rootZoneVwcSpatialModel=rootVwcTrainSpatialModel(rootZoneVwcSpatialRows,rootZoneVwcCompletePoints);
 rootZoneVwcSpatialResult=rootVwcEstimateSpatialFields(rootZoneVwcSpatialRows,rootZoneVwcSpatialModel);
 const operational=rootZoneVwcSpatialResult.filter(x=>x.split==='operational');
 const imported=operational.filter(x=>x.meanVwc!==null).map(x=>({fieldNo:x.fieldNo,date:x.date,predictedVwc:x.meanVwc,modelVersion:x.modelVersion,split:'operational',windowId:x.windowId,lower90:null,upper90:null,areaBelowThresholdPct:x.areaBelowThresholdPct,validAreaPct:x.validAreaPct}));
 rootZoneVwcPredictions=rootZoneVwcPredictions.filter(x=>x.split!=='operational').concat(imported);
 rootZoneVwcSpatialStatus='Spatial model '+rootZoneVwcSpatialModel.modelVersion+' trained from '+rootZoneVwcSpatialModel.trainCount+' matched sample-point/pixel pairs across '+rootZoneVwcSpatialModel.trainFields+' training fields. Estimated '+rootZoneVwcSpatialResult.length+' field-date-window records; '+operational.length+' operational records passed to the event classifier.';
}
function rootVwcDownloadSpatialTemplate(){
 const rows=[['field_no','date','observation_window_id','cell_id','pixel_area_m2','ndvi','ndmi','vv','vh','sample_point_id','validation_split'],
 ['FIELD-001','2026-07-01','RABI-2026-W1','CELL-0001',100,'','','','','P1','train'],
 ['FIELD-001','2026-07-01','RABI-2026-W1','CELL-0002',100,'','','','','','train'],
 ['FIELD-001','2026-07-01','RABI-2026-W1','CELL-0003',100,'','','','','','train']];
 rootVwcDownload('root-zone-vwc-spatial-pixel-template.csv',rows);
}
function rootVwcDownloadSpatialResults(){
 if(!rootZoneVwcSpatialResult)return;
 const h=['field_no','date','observation_window_id','mean_predicted_vwc_0_30_m3_m3','minimum_predicted_vwc_0_30_m3_m3','maximum_predicted_vwc_0_30_m3_m3','area_below_0_15_m3_m3_pct_of_total_field','valid_field_coverage_pct','total_mapped_area_m2','valid_area_m2','area_below_threshold_m2','valid_cells','total_cells','validation_split','model_version'];
 const rows=rootZoneVwcSpatialResult.map(x=>[x.fieldNo,x.date,x.windowId,x.meanVwc,x.minVwc,x.maxVwc,x.areaBelowThresholdPct,x.validAreaPct,x.totalAreaM2,x.validAreaM2,x.areaBelowThresholdM2,x.validCellCount,x.totalCellCount,x.split,x.modelVersion]);
 rootVwcDownload('root-zone-vwc-spatial-field-estimates.csv',[h,...rows]);
}

function rootZoneVwcDownloadFieldBoundaryGeoJson(){
 const source=typeof records!=='undefined'&&Array.isArray(records)?records:[];
 const features=[];
 source.forEach(record=>{
  const fieldNo=String(record.fieldNo||record.field_no||'').trim();
  const points=(record.boundaryPoints||[]).map(p=>[Number(p.lon??p.lng),Number(p.lat)]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90);
  if(!fieldNo||points.length<3)return;
  if(points.length>1&&points[0][0]===points[points.length-1][0]&&points[0][1]===points[points.length-1][1])points.pop();
  if(new Set(points.map(p=>p[0].toFixed(8)+','+p[1].toFixed(8))).size<3)return;
  points.push([...points[0]]);
  features.push({type:'Feature',properties:{field_no:fieldNo},geometry:{type:'Polygon',coordinates:[points]}});
 });
 if(!features.length){notify('No saved GPS field polygons are available in the current company workspace.');return}
 const geojson={type:'FeatureCollection',name:'company-field-boundaries',features};
 const blob=new Blob([JSON.stringify(geojson,null,2)],{type:'application/geo+json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='company-field-boundaries.geojson';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 notify('Exported '+features.length+' saved field boundaries. Review field IDs and geometry before satellite processing.');
}

function rootZoneVwcSpatialMarkup(){
 const m=rootZoneVwcSpatialModel,r=rootZoneVwcSpatialResult;
 const metrics=m?m.testMetrics:null,fmt=x=>x===null||x===undefined?'—':Number(x).toFixed(3);
 const rows=(r||[]).map(x=>'<tr><td>'+rootVwcEscape(x.fieldNo)+'</td><td>'+x.date+'</td><td>'+rootVwcEscape(x.windowId)+'</td><td>'+(x.meanVwc===null?'—':x.meanVwc.toFixed(3))+'</td><td>'+(x.minVwc===null?'—':x.minVwc.toFixed(3))+' – '+(x.maxVwc===null?'—':x.maxVwc.toFixed(3))+'</td><td>'+x.areaBelowThresholdPct.toFixed(1)+'%</td><td>'+x.validAreaPct.toFixed(1)+'%</td><td>'+x.validCellCount+'/'+x.totalCellCount+'</td><td>'+rootVwcEscape(x.split)+'</td></tr>').join('');
 return '<div class="root-vwc-section-head"><div><h3>Field-wise Root-Zone VWC Estimation</h3><p>Train a spatial model from ground-sampled points matched to Sentinel-1/2 pixel features, then estimate each mapped cell and aggregate by field. Target depth 0–30 cm; threshold 0.15 m³/m³.</p></div><div class="root-vwc-actions"><button type="button" class="outline" id="rootVwcExportFieldBoundaries">Export saved field polygons</button><a class="outline root-vwc-upload" href="tools/sentinel_spatial_extractor.py" download>Download Sentinel extractor</a><a class="outline root-vwc-upload" href="tools/requirements.txt" download>Download Python requirements</a><a class="outline root-vwc-upload" href="tools/README.md" target="_blank" rel="noopener">Extraction instructions</a><button type="button" class="outline" id="rootVwcSpatialTemplate">Download spatial pixel template</button><label class="outline root-vwc-upload" for="rootVwcSpatialFile">Import spatial pixel features</label><input hidden type="file" id="rootVwcSpatialFile" accept=".csv,text/csv"><button type="button" class="primary" id="rootVwcRunSpatial" '+(rootZoneVwcSpatialRows.length&&rootZoneVwcCompletePoints.length?'':'disabled')+'>Train spatial model & estimate VWC</button><button type="button" class="outline" id="rootVwcDownloadSpatial" '+(r?'':'disabled')+'>Download field VWC results</button></div></div><p class="root-vwc-status">'+rootVwcEscape(rootZoneVwcSpatialStatus||'No spatial pixel features imported. Export saved company field polygons, run the downloadable CDSE Sentinel-1/2 extractor locally, then import its cell CSV. Keep no-data cells. Calibration rows must include sample_point_id matching a complete ground sample point on the same field and date.')+'</p>'+(m?'<div class="root-vwc-kpis"><article><small>Matched training samples</small><b>'+m.trainCount+'</b></article><article><small>Training fields</small><b>'+m.trainFields+'</b></article><article><small>Independent test pairs</small><b>'+metrics.count+'</b></article><article><small>Test RMSE · m³/m³</small><b>'+fmt(metrics.rmse)+'</b></article></div><p class="root-vwc-muted">Spatial calibration model '+m.modelVersion+' · '+m.alphaSelection+'. Independent test MAE '+fmt(metrics.mae)+' · bias '+fmt(metrics.bias)+' · R² '+fmt(metrics.r2)+'. Test metrics are field-held-out and must be reviewed before operational use.</p>':'')+(r?'<h4>Field-wise VWC estimates</h4><div class="table-wrap"><table class="satellite-only-table"><thead><tr><th>Field</th><th>Date</th><th>Window</th><th>Mean VWC (m³/m³)</th><th>Min–max VWC</th><th>Area below 0.15</th><th>Valid coverage</th><th>Valid / total cells</th><th>Split</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="root-vwc-muted">No field-wise VWC estimates yet. Estimates appear only after real spatial satellite features are matched to ground-truth sample points and the model is trained.</p>')+'<p class="root-vwc-muted">Area below 0.15 is calculated against total mapped field area (including no-data cells); valid coverage is reported separately. This model is provisional and not independently validated at every pixel. No synthetic values are generated and no database or audit-register records are written.</p>';
}

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
function rootZoneVwcDownloadPredictionTemplate(){rootVwcDownload('root-zone-vwc-model-prediction-template.csv',[['field_no','date','predicted_vwc_0_30_m3_m3','area_below_threshold_pct','valid_area_pct','model_version','validation_split','observation_window_id','lower_90','upper_90'],['FIELD-001','2026-07-01','','','','model-v0.1','operational','RABI-2026-WINDOW-01','','']])}
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
function rootVwcSimpleFieldResultsMarkup(){
 const operational=rootZoneVwcSpatialResult||[];
 const latest=new Map();
 operational.filter(x=>x.split==='operational').forEach(x=>{
  const old=latest.get(x.fieldNo);
  if(!old||x.date>old.date)latest.set(x.fieldNo,x);
 });
 const classifier=rootVwcClassifyOperational(rootZoneVwcPredictions,80,80);
 const statuses=new Map(classifier.fields.map(x=>[[x.fieldNo,x.windowId].join('|'),x]));
 const polygonFields=(typeof records!=='undefined'&&Array.isArray(records)?records:[])
  .filter(r=>String(r.fieldNo||r.field_no||'').trim()&&(r.boundaryPoints||[]).length>=3)
  .map(r=>String(r.fieldNo||r.field_no).trim());
 const fieldNos=[...new Set([...polygonFields,...latest.keys()])].sort((a,b)=>a.localeCompare(b));
 if(!fieldNos.length)return '<p class="root-vwc-muted">No saved field polygons are available in this company workspace.</p>';
 const rows=fieldNos.map(fieldNo=>{
  const x=latest.get(fieldNo),status=x?statuses.get([fieldNo,x.windowId].join('|')):null;
  const event=status?.event?'YES':status&&status.evaluableCount>=2?'NO':'PENDING';
  const vwc=x&&x.meanVwc!==null?x.meanVwc.toFixed(3)+' m³/m³':'—';
  const date=x?x.date:'Awaiting estimate';
  const coverage=x?x.validAreaPct.toFixed(0)+'%':'—';
  return '<tr><td>'+rootVwcEscape(fieldNo)+'</td><td>'+vwc+'</td><td>'+event+'</td><td>'+date+'</td><td>'+coverage+'</td></tr>';
 }).join('');
 return '<div class="table-wrap"><table class="satellite-only-table"><thead><tr><th>Field</th><th>Root-zone VWC · 0–30 cm</th><th>Drainage event</th><th>Latest observation</th><th>Valid coverage</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="root-vwc-muted">YES = dryness rule met on two consecutive observations. NO = sufficient observations assessed, rule not met. PENDING = insufficient valid observations or no estimate yet.</p>';
}
function rootZoneVwcPocPage(){
 return '<section class="panel root-vwc-panel" id="rootZoneVwcPoc"><div class="panel-head"><div><p class="eyebrow">FIELD SOIL MOISTURE</p><h2>Root-zone VWC & drainage event</h2><p class="muted">One result per saved field polygon · soil depth 0–30 cm · VWC in m³/m³</p></div><span class="status-chip planned">PROVISIONAL MODEL</span></div>'+rootVwcSimpleFieldResultsMarkup()+'<details class="root-vwc-section"><summary><strong>Update field estimates</strong></summary><p class="root-vwc-muted">To refresh estimates, import measured 0–30 cm soil samples and the matching Sentinel-1/2 spatial cell CSV, then run the estimator.</p><div class="root-vwc-actions"><button type="button" class="outline" id="rootVwcExportFieldBoundaries">Export saved field polygons</button><a class="outline root-vwc-upload" href="tools/sentinel_spatial_extractor.py" download>Download Sentinel extractor</a><a class="outline root-vwc-upload" href="tools/requirements.txt" download>Download requirements</a><button type="button" class="outline" id="rootVwcGroundTemplate">Download soil sample template</button><label class="outline root-vwc-upload" for="rootVwcGroundFile">Import soil measurements</label><input hidden type="file" id="rootVwcGroundFile" accept=".csv,text/csv"><label class="outline root-vwc-upload" for="rootVwcSpatialFile">Import satellite cell data</label><input hidden type="file" id="rootVwcSpatialFile" accept=".csv,text/csv"><button type="button" class="primary" id="rootVwcRunSpatial" '+(rootZoneVwcSpatialRows.length&&rootZoneVwcCompletePoints.length?'':'disabled')+'>Calculate field VWC</button></div><p class="root-vwc-status">'+rootVwcEscape(rootZoneVwcSpatialStatus||'No field estimates have been calculated yet. Estimates require actual satellite cell data matched to measured soil samples. No values are fabricated.')+'</p></details><p class="root-vwc-muted">Drainage event rule: at least 80% of total mapped field area below 0.15 m³/m³, with at least 80% valid coverage, on two consecutive observations. One event per field per observation window; later qualifying observations update the same event. This identifies a dryness condition, not proof of a physical drainage action.</p></section>';
}
function rootZoneVwcBindFile(id,handler){const input=document.getElementById(id);if(!input)return;input.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{await handler(await file.text(),file.name);renderManager()}catch(err){notify(err?.message||'CSV import failed.')}finally{e.target.value=''}})}
function bindRootZoneVwcPocPage(){
 document.getElementById('rootVwcExportFieldBoundaries')?.addEventListener('click',rootZoneVwcDownloadFieldBoundaryGeoJson);
 document.getElementById('rootVwcSpatialTemplate')?.addEventListener('click',rootVwcDownloadSpatialTemplate);
 document.getElementById('rootVwcDownloadSpatial')?.addEventListener('click',rootVwcDownloadSpatialResults);
 document.getElementById('rootVwcRunSpatial')?.addEventListener('click',()=>{try{rootVwcRunSpatialEstimation();renderManager()}catch(error){notify(error?.message||'Spatial VWC estimation failed.')}});
 rootZoneVwcBindFile('rootVwcSpatialFile',async(text,name)=>{rootZoneVwcSpatialRows=rootVwcBuildSpatialRows(rootVwcParseCsv(text));rootZoneVwcSpatialModel=null;rootZoneVwcSpatialResult=null;rootZoneVwcPredictions=rootZoneVwcPredictions.filter(x=>x.split!=='operational');rootZoneVwcSpatialStatus='Imported '+rootZoneVwcSpatialRows.length+' mapped spatial cells from '+new Set(rootZoneVwcSpatialRows.map(x=>x.fieldNo)).size+' fields across '+new Set(rootZoneVwcSpatialRows.map(x=>x.date)).size+' observation dates. File: '+name+'. Train after matching ground sample points.';notify('Spatial pixel features validated and imported.')});
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
 rootZoneVwcBindFile('rootVwcGroundFile',async(text,name)=>{const b=rootVwcBuildGround(rootVwcParseCsv(text));rootZoneVwcGroundRows=b.parsed;rootZoneVwcCompletePoints=b.points;rootZoneVwcFieldDates=b.fieldDates;rootZoneVwcIncompleteCount=b.incomplete.length;rootZoneVwcImportStatus='Imported '+b.parsed.length+' depth rows · '+b.points.length+' complete sample points · '+b.fieldDates.length+' field-date references · '+b.fieldCount+' fields · '+b.incomplete.length+' incomplete points excluded. File: '+name;rootZoneVwcPredictions=[];rootZoneVwcModelResult=null;rootZoneVwcSpatialModel=null;rootZoneVwcSpatialResult=null;rootZoneVwcPredictions=rootZoneVwcPredictions.filter(x=>x.split!=='operational');rootZoneVwcSpatialStatus='Spatial model cleared because the ground-reference dataset changed.';rootZoneVwcPredictionStatus='Predictions cleared because the reference dataset changed.';notify('Ground measurements validated and imported in this browser session.')});
 rootZoneVwcBindFile('rootVwcPredictionFile',async(text,name)=>{const p=rootVwcBuildPredictions(rootVwcParseCsv(text)),splits=new Map(rootZoneVwcFieldDates.map(x=>[x.fieldNo,x.split]));rootZoneVwcModelResult=null;p.forEach(x=>{if(splits.has(x.fieldNo)&&x.split!=='operational'&&splits.get(x.fieldNo)!==x.split)throw new Error('Prediction split does not match ground-reference split for field '+x.fieldNo+'.')});rootZoneVwcPredictions=p;const m=rootVwcMetrics(rootZoneVwcFieldDates,p);rootZoneVwcPredictionStatus='Imported '+p.length+' predictions · '+m.count+' independent test pairs · '+new Set(p.map(x=>x.modelVersion)).size+' model version. File: '+name;notify('Model predictions imported; independent test metrics calculated.')});
 document.getElementById('rootVwcClearGround')?.addEventListener('click',()=>{rootZoneVwcGroundRows=[];rootZoneVwcCompletePoints=[];rootZoneVwcFieldDates=[];rootZoneVwcPredictions=[];rootZoneVwcModelResult=null;rootZoneVwcSpatialModel=null;rootZoneVwcSpatialResult=null;rootZoneVwcSpatialStatus='Spatial model cleared because ground measurements were cleared.';rootZoneVwcIncompleteCount=0;rootZoneVwcImportStatus='Ground measurements cleared.';rootZoneVwcPredictionStatus='Predictions cleared.';renderManager()});
 document.getElementById('rootVwcClearPredictions')?.addEventListener('click',()=>{rootZoneVwcPredictions=[];rootZoneVwcPredictionStatus='Predictions cleared.';renderManager()});
 document.getElementById('rootVwcExportGround')?.addEventListener('click',()=>{const h=['field_no','date','sample_point_id','depth_top_cm','depth_bottom_cm','vwc_m3_m3','measurement_method','validation_split','soil_texture','bulk_density_g_cm3','crop'];const rows=[h,...rootZoneVwcGroundRows.map(x=>[x.fieldNo,x.date,x.point,x.top,x.bottom,x.vwc,x.method,x.split,x.soilTexture,x.bulkDensity,x.crop])];rootVwcDownload('root-zone-vwc-validated-depth-rows.csv',rows)});
}
