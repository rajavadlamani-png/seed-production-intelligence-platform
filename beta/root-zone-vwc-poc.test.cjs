const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('beta/root-zone-vwc-poc.js','utf8')+'\nglobalThis.__parse=rootVwcParseCsv;globalThis.__ground=rootVwcBuildGround;globalThis.__pred=rootVwcBuildPredictions;globalThis.__metrics=rootVwcMetrics;globalThis.__classify=rootVwcClassifyOperational;globalThis.__train=rootVwcTrainSatelliteModel;globalThis.__features=rootVwcSatelliteFeatureRows;';
const c={console,Date,Map,Set,URL,URLSearchParams,Blob,Math,Number,Object,Array,String,Error,RegExp,satelliteOnlyRunFields:r=>r.evidence_payload.fields};vm.runInNewContext(source,c);
const assert=(x,m)=>{if(!x)throw new Error(m)};
const h='field_no,date,sample_point_id,depth_top_cm,depth_bottom_cm,vwc_m3_m3,gravimetric_water_content_kg_kg,measurement_method,validation_split,soil_texture,bulk_density_g_cm3,crop,crop_stage,latitude,longitude,probe_id,notes';
const rows=[h];for(const [p,b] of [['P1',.12],['P2',.14],['P3',.16]])for(const [t,bt,v] of [[0,10,b],[10,20,b+.01],[20,30,b+.02]])rows.push(['F1','2026-07-01',p,t,bt,v,'','probe','test','loam','','Paddy rice','vegetative','','','probe-1',''].join(','));
const built=c.__ground(c.__parse(rows.join('\n')));assert(built.points.length===3,'3 complete profiles expected');assert(built.fieldDates.length===1,'one field-date expected');assert(Math.abs(built.fieldDates[0].actualVwc-.15)<1e-9,'depth-weighted mean incorrect');
const p=c.__pred(c.__parse('field_no,date,predicted_vwc_0_30_m3_m3,model_version,validation_split,lower_90,upper_90\nF1,2026-07-01,0.14,m1,test,0.12,0.16'));
const m=c.__metrics(built.fieldDates,p);assert(m.count===1&&m.fields===1,'test pair not matched');assert(Math.abs(m.mae-.01)<1e-9,'MAE incorrect');assert(m.fp===1,'threshold false-positive count incorrect');
const gravRows=[h];for(const p of ['A','B','C'])gravRows.push(['F2','2026-07-01',p,0,30,'',.2,'gravimetric','test','loam',1.3,'rice','vegetative','','','',''].join(','));const gb=c.__ground(c.__parse(gravRows.join('\n')));assert(gb.points.length===3&&Math.abs(gb.points[0].vwc-.26)<1e-9,'gravimetric conversion incorrect');
let failed=false;try{c.__ground(c.__parse(rows.slice(0,-1).join('\n')))}catch(e){failed=true}assert(failed,'incomplete profiles should not create a reference');
const split=rows.map(x=>x.replace(',test,',',train,'));split[1]=split[1].replace(',train,',',validation,');failed=false;try{c.__ground(c.__parse(split.join('\n')))}catch(e){failed=true}assert(failed,'field split leakage must be rejected');
failed=false;try{c.__pred(c.__parse('field_no,date,predicted_vwc_0_30_m3_m3,model_version,validation_split\nF1,2026-07-01,0.1,m1,test\nF1,2026-07-02,0.2,m2,test'))}catch(e){failed=true}assert(failed,'multiple model versions in one import must be rejected');
console.log('Root-zone VWC POC data validation and metrics tests passed.');
const operationalCsv='field_no,date,predicted_vwc_0_30_m3_m3,area_below_threshold_pct,valid_area_pct,model_version,validation_split\nF1,2026-07-01,0.12,85,95,v1,operational\nF1,2026-07-06,0.11,82,92,v1,operational';
const operationalParsed=c.__pred(c.__parse(operationalCsv));assert(operationalParsed.length===2&&operationalParsed[0].split==='operational'&&operationalParsed[0].areaBelowThresholdPct===85&&operationalParsed[0].validAreaPct===95,'operational prediction CSV parsing failed');
const op=(field,date,area,coverage=.95,vwc=.12)=>({fieldNo:field,date,areaBelowThresholdPct:area,validAreaPct:coverage*100,predictedVwc:vwc,modelVersion:'v1',split:'operational'});
let classified=c.__classify([op('F-DRY','2026-07-01',84),op('F-DRY','2026-07-06',82),op('F-DRY','2026-07-12',88),op('F-WET','2026-07-01',79),op('F-WET','2026-07-06',90),op('F-GAP','2026-07-01',90,0.70),op('F-GAP','2026-07-06',90,0.70)]);
assert(classified.events.length===1,'only one field should meet the two-date rule');
assert(classified.events[0].fieldNo==='F-DRY'&&classified.events[0].from==='2026-07-01'&&classified.events[0].triggerDate==='2026-07-06'&&classified.events[0].lastDate==='2026-07-12','consecutive available-date event window incorrect');
assert(classified.events[0].observationCount===3,'continuous qualifying observations should be grouped into one period');
assert(classified.fields.find(x=>x.fieldNo==='F-WET').events.length===0,'one qualifying date must not trigger a period');
assert(classified.fields.find(x=>x.fieldNo==='F-GAP').status==='INSUFFICIENT AREA-COVERAGE DATA','low valid-area coverage must not trigger a classification');
assert(c.__classify([op('F-TRAIN','2026-07-01',99,1,.10)]).events.length===0,'training/validation/test rows must not be used for operational classification');
console.log('Operational VWC field-area and two-observation classification tests passed.');

const modelGround=[],modelFeatures=[];
const featureFor=(field,date,i)=>({fieldNo:field,date,features:{ndvi:.2+i*.015,ndmi:.1+i*.008,vv:-12+i*.12,vh:-19+i*.09},runId:'run-1'});
const targetVwc=f=>.22+.035*f.ndvi-.025*f.ndmi+.002*f.vv-.0015*f.vh;
for(let fi=0;fi<12;fi++){
 const field='MODEL-F'+String(fi+1).padStart(2,'0'),split=fi<6?'train':fi<9?'validation':'test';
 for(let di=0;di<3;di++){
  const date='2026-07-'+String(1+di*5).padStart(2,'0'),features=featureFor(field,date,fi+di*.7).features;
  modelFeatures.push({...featureFor(field,date,fi+di*.7),features});
  modelGround.push({fieldNo:field,date,actualVwc:targetVwc(features),split});
 }
}
for(let di=0;di<2;di++){const field='OPERATIONAL-01',date='2026-08-'+String(1+di*5).padStart(2,'0'),features=featureFor(field,date,5+di).features;modelFeatures.push({...featureFor(field,date,5+di),features})}
const trained=c.__train(modelGround,modelFeatures,5);
assert(trained.trainCount===18&&trained.trainFields===6,'model must train only on training-field samples');
assert(trained.validationMetrics.count===9&&trained.testMetrics.count===9,'validation and test field-date pairs should remain separate');
assert(trained.predictions.some(x=>x.fieldNo==='OPERATIONAL-01'&&x.split==='operational'),'unseen field should receive operational-split field estimate');
assert(trained.predictions.every(x=>x.areaBelowThresholdPct===null&&x.validAreaPct===null),'field-average model must not invent field-area fractions');
assert(trained.model.features.join(',')==='ndvi,ndmi,vv,vh','model feature set incorrect');
const run={id:'sat-run',generated_at:'2026-07-10T00:00:00Z',evidence_payload:{fields:[{fieldNo:'S1S2',observationSeries:[{date:'2026-07-01',ndvi:.6,ndmi:.3,vv:null,vh:null},{date:'2026-07-04',ndvi:null,ndmi:null,vv:-11,vh:-18},{date:'2026-07-09',ndvi:.62,ndmi:.32,vv:null,vh:null}]}]}};
const combined=c.__features([run]);assert(combined.length===2&&combined[0].radarDate==='2026-07-04'&&combined[1].radarDate==='2026-07-04','optical/radar dates should be paired within the 5-day sensor window');
let insufficient=false;try{c.__train(modelGround.filter(x=>x.split==='test'),modelFeatures,5)}catch(e){insufficient=/at least 12 matched/.test(e.message)}assert(insufficient,'model must refuse inadequate training data');
console.log('Sentinel-1/2 ridge training, field-held-out evaluation and sensor-date pairing tests passed.');
