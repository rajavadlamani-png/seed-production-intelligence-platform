const STAGES = ['First Inspection Report', 'Vegetative Report', 'Pre Flowering Report', 'Flowering Report', 'Pre Harvesting Report', 'Harvesting Report'];
const SUPABASE_URL = 'https://xjtzvhtoeormizrhozoy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nyH0s0O1OH2mIZz8N1xvbQ_eII73UGp';
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
let activeUser = null, activeCompanyId = null, activeCompanyName = '', companyChoices = [];
const launchParams = new URLSearchParams(window.location.search);
const seedworksFieldApp = launchParams.get('install') === 'seedworks-field';
let passwordRecoveryMode = false;
let requestedCompanyName = seedworksFieldApp ? 'SeedWorks' : '';
let records = [], pendingMasterRows=null;
let role = seedworksFieldApp ? 'officer' : 'manager', selectedOfficer = 'FA-01', selectedTerritoryManager = 'TM-01', page = 'overview', fieldMode = seedworksFieldApp;
let fieldSignedIn=false,fieldAuthStep='welcome',fieldMobile='',fieldTab='today',selectedFieldId=null,nearbyMessage='',askLanguage='English',askChat=[];
let ramBusy=false,ramSpeakNextReply=false,ramRecognition=null;
const ramLive={socket:null,stream:null,outputContext:null,microphoneContext:null,source:null,processor:null,connected:false,connecting:false,voiceConnected:false,voiceRequested:false,playbackTime:0,playing:new Set(),currentUserText:'',currentAssistantText:'',audioChunks:0,audioBytes:0,playbackError:'',pendingQuestion:null,autoAttemptedForAsk:false};
const manager = document.getElementById('managerView'), field = document.getElementById('fieldView');
const dashboard = document.getElementById('dashboardPage'), registry = document.getElementById('registryPage');
const nav = [...document.querySelectorAll('.nav-item')];
const toast = document.getElementById('toast');
if(seedworksFieldApp){
  document.body.classList.add('seedworks-field-app');
  const seedworksChoice=document.querySelector('[data-company-choice="seedworks"]');
  if(seedworksChoice){seedworksChoice.classList.add('selected');seedworksChoice.setAttribute('aria-pressed','true')}
  const sageHarvestChoice=document.querySelector('[data-company-choice="sageharvest"]');
  if(sageHarvestChoice)sageHarvestChoice.hidden=true;
  document.getElementById('authTitle').textContent='Sign in to SeedWorks Field';
  document.querySelector('.auth-gate-card>.muted').textContent='Use your approved SeedWorks account to open the field app.';
}
let toastTimer, gpsWatchId=null, gpsRecordId=null, gpsPoints=[], activeInspectionId=null, satelliteRequestGeometry=null;
function notify(message){toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2800)}
function setAuthStatus(message,isError=true){const node=document.getElementById('betaAuthStatus');if(node){node.textContent=message;node.classList.toggle('is-error',isError)}}
function setRecoveryStatus(message,isError=true){const node=document.getElementById('recoveryStatus');if(node){node.textContent=message;node.classList.toggle('is-error',isError)}}
function setCompanyChoiceStatus(message,isError=true){const node=document.getElementById('companyChoiceStatus');if(node){node.textContent=message;node.classList.toggle('is-error',isError)}}
function showPasswordRecovery(){passwordRecoveryMode=true;document.getElementById('betaSignInForm').hidden=true;document.getElementById('passwordRecoveryForm').hidden=false;document.getElementById('authTitle').textContent='Choose a new password';document.querySelector('.auth-gate-card>.muted').textContent='Enter and confirm a new password for your beta account.';setRecoveryStatus('')}
function showSignIn(message='',isError=false){passwordRecoveryMode=false;document.getElementById('betaSignInForm').hidden=false;document.getElementById('passwordRecoveryForm').hidden=true;document.getElementById('companyChoiceForm').hidden=true;const brand=requestedCompanyName||'';document.getElementById('authTitle').textContent=brand?`Sign in to ${brand}`:'Sign in to your company workspace';document.querySelector('.auth-gate-card>.muted').textContent=brand?`Use an account already approved for ${brand}. New sign-ups are disabled.`:'Choose your company, then use an account already approved for this beta. New sign-ups are disabled.';setAuthStatus(message,isError)}
function isSageHarvestCompany(name=activeCompanyName){return name.toLowerCase().replace(/[^a-z]/g,'').includes('sageharvest')}
function isSeedWorksCompany(name=activeCompanyName){return name.toLowerCase().replace(/[^a-z]/g,'').includes('seedworks')}
function companyLogoMarkup(){if(isSageHarvestCompany())return '<img src="assets/sage-harvest-logo.svg" alt="Sage Harvest">';if(isSeedWorksCompany())return '<img src="assets/seedworks-logo.jpg" alt="SeedWorks">';return `<strong class="field-company-wordmark">${escape(activeCompanyName)}</strong>`}
function setCompanyBranding(name){activeCompanyName=name||'Company';const logo=document.getElementById('companyLogo'),wordmark=document.getElementById('companyBrandName');if(isSageHarvestCompany()){logo.src='assets/sage-harvest-logo.svg';logo.alt='Sage Harvest';logo.hidden=false;wordmark.hidden=true}else if(isSeedWorksCompany()){logo.src='assets/seedworks-logo.jpg';logo.alt='SeedWorks';logo.hidden=false;wordmark.hidden=true}else{logo.hidden=true;wordmark.textContent=activeCompanyName;wordmark.hidden=false}document.getElementById('companyBrand').setAttribute('aria-label',`${activeCompanyName} home`);document.title=seedworksFieldApp?'SeedWorks Field':`${activeCompanyName} — Seed Production Monitor`}
function applyFieldCompanyBranding(){if(!activeCompanyName)return;const displayName=isSeedWorksCompany()?'SeedWorks':activeCompanyName;field.querySelectorAll('.field-brand-lockup').forEach(lockup=>{lockup.setAttribute('aria-label',displayName);lockup.innerHTML=companyLogoMarkup()});field.querySelectorAll('.field-brand-footer b').forEach(node=>node.textContent=displayName.toUpperCase());field.querySelectorAll('.field-demo-pill').forEach(node=>node.textContent=displayName);field.querySelectorAll('.eyebrow').forEach(node=>{if(node.textContent.includes('SAGEHARVEST'))node.textContent=node.textContent.replace('SAGEHARVEST',displayName.toUpperCase().replace(/\s+/g,''))})}
function updateCompanyChoicesUI(){const authForm=document.getElementById('companyChoiceForm'),authSelect=document.getElementById('authCompanySelect'),switchWrap=document.getElementById('companySwitchWrap'),switcher=document.getElementById('companySwitcher');for(const select of [authSelect,switcher]){select.replaceChildren(...companyChoices.map(company=>{const option=document.createElement('option');option.value=company.id;option.textContent=company.name;return option}))}switchWrap.hidden=seedworksFieldApp||companyChoices.length<2;switcher.value=activeCompanyId||'';authForm.hidden=true}
function setCompanyChoiceScreen(){const authSelect=document.getElementById('authCompanySelect');authSelect.replaceChildren(...companyChoices.map(company=>{const option=document.createElement('option');option.value=company.id;option.textContent=company.name;return option}));document.getElementById('betaSignInForm').hidden=true;document.getElementById('passwordRecoveryForm').hidden=true;document.getElementById('companyChoiceForm').hidden=false;document.getElementById('authTitle').textContent='Choose your company workspace';document.querySelector('.auth-gate-card>.muted').textContent='Your account has access to more than one company. Choose which workspace to open.';authSelect.value=companyChoices[0]?.id||'';setCompanyChoiceStatus('')}
function setSignedInUI(user){document.body.classList.add('auth-ready');document.body.classList.remove('auth-required','auth-loading');document.querySelector('.prototype-tag').textContent=`${activeCompanyName} · live records`;document.querySelector('#betaSignOut').title=`Signed in as ${user.email||'beta user'}`;setCompanyBranding(activeCompanyName);updateCompanyChoicesUI()}
function fieldOfficerDisplayName(){return activeUser?.email?.toLowerCase()==='amarasing.rajput@seedworks.com'&&selectedOfficer==='FA-01'?'Amar Singh':selectedOfficer}
function setSignedOutUI(){activeUser=null;activeCompanyId=null;activeCompanyName='';records=[];companyChoices=[];fieldSignedIn=false;fieldMobile='';document.body.classList.remove('auth-ready','auth-loading');document.body.classList.add('auth-required');document.querySelector('.prototype-tag').textContent='Company beta · live records';document.querySelector('#companySwitchWrap').hidden=true;document.querySelector('#betaPassword').value='';showSignIn()}
async function loadBetaRecords(){
  const {data,error}=await supabaseClient.from('beta_field_records').select('id,season_key,field_no,record_data').eq('company_id',activeCompanyId).order('updated_at',{ascending:false});
  if(error)throw error;
  records=(data||[]).map(row=>({...row.record_data,id:row.id,fieldNo:row.field_no,seasonKey:row.season_key}));
  if(!records.some(r=>r.id===selectedFieldId))selectedFieldId=records[0]?.id||null;
}
async function saveBetaRecord(record){
  if(!supabaseClient||!activeUser||!activeCompanyId)throw new Error('Sign in to a company account before saving.');
  const fieldNo=String(record.fieldNo||'').trim();
  if(!fieldNo)throw new Error('A seasonal field number is required before saving.');
  const row={company_id:activeCompanyId,season_key:String(record.seasonKey||'Kharif 2026'),field_no:fieldNo,record_data:betaRecordData(record),updated_by:activeUser.id,updated_at:new Date().toISOString()};
  const {data,error}=await supabaseClient.from('beta_field_records').upsert(row,{onConflict:'company_id,season_key,field_no'}).select('id,season_key,field_no,record_data').single();
  if(error)throw error;
  record.id=data.id;record.seasonKey=data.season_key;if(data.record_data?.inspectionReports)record.inspectionReports=data.record_data.inspectionReports;if(data.record_data?.inspectionReports?.['1'])record.stageOne=data.record_data.inspectionReports['1'];return record;
}
async function saveBetaRecords(batch){
  if(!supabaseClient||!activeUser||!activeCompanyId)throw new Error('Sign in to a company account before saving.');
  const rows=batch.map(record=>({company_id:activeCompanyId,season_key:String(record.seasonKey||'Kharif 2026'),field_no:String(record.fieldNo||'').trim(),record_data:betaRecordData(record),updated_by:activeUser.id,updated_at:new Date().toISOString()}));
  if(rows.some(row=>!row.field_no))throw new Error('Every record needs a seasonal field number.');
  const {data,error}=await supabaseClient.from('beta_field_records').insert(rows).select('id,season_key,field_no');
  if(error)throw error;
  const saved=new Map((data||[]).map(row=>[`${row.season_key}\u0000${row.field_no}`,row]));
  batch.forEach(record=>{const row=saved.get(`${String(record.seasonKey||'Kharif 2026')}\u0000${String(record.fieldNo).trim()}`);if(row){record.id=row.id;record.seasonKey=row.season_key}});
}
function betaRecordData(record){const clean=structuredClone(record);delete clean.id;delete clean.seasonKey;for(const report of Object.values(clean.inspectionReports||{})){if(report&&typeof report==='object'){delete report.fieldPhotoData;delete report.fieldPhotoName;delete report.maleSyncDifferenceDays;delete report.maleSyncInterpretation}}if(clean.stageOne&&typeof clean.stageOne==='object'){delete clean.stageOne.fieldPhotoData;delete clean.stageOne.fieldPhotoName}return clean}
async function activateBetaSession(user,requestedCompanyId=null){
  setAuthStatus('Checking company access…',false);
  const {data:memberships,error}=await supabaseClient.from('company_memberships').select('company_id,role_key,status').eq('user_id',user.id).eq('status','active');
  if(error)throw error;
  const companyIds=[...new Set((memberships||[]).map(row=>row.company_id))];
  if(!companyIds.length)throw new Error('This account is not an active member of a beta company.');
  const {data:companies,error:companyError}=await supabaseClient.from('companies').select('id,name').in('id',companyIds);
  if(companyError)throw companyError;
  companyChoices=(companies||[]).map(row=>({id:row.id,name:row.name}));
  if(companyChoices.length!==companyIds.length)throw new Error('Could not load every company workspace for this account.');
  if(companyChoices.length>1&&!requestedCompanyId&&!requestedCompanyName){setCompanyChoiceScreen();return}
  const company=requestedCompanyId?companyChoices.find(item=>item.id===requestedCompanyId):requestedCompanyName?companyChoices.find(item=>item.name.toLowerCase().replace(/[^a-z]/g,'').includes(requestedCompanyName.toLowerCase().replace(/[^a-z]/g,''))):companyChoices[0];
  if(requestedCompanyName&&!company)throw new Error(`This account does not have active access to ${requestedCompanyName} yet. Ask your company administrator to activate the workspace membership.`);
  if(!company)throw new Error('Choose a company where your account has active membership.');
  activeUser=user;activeCompanyId=company.id;activeCompanyName=company.name;fieldSignedIn=true;fieldMobile=user.email||'';
  await loadBetaRecords();setSignedInUI(user);render();
}
async function initBetaConnection(){
  if(!supabaseClient){setAuthStatus('The database client did not load. Refresh this page and try again.');return}
  supabaseClient.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')setSignedOutUI();if(event==='PASSWORD_RECOVERY')showPasswordRecovery()});
  const {data,error}=await supabaseClient.auth.getSession();
  if(error){setAuthStatus('Could not check the sign-in session. Refresh and try again.');return}
  if(data.session&&!passwordRecoveryMode){try{await activateBetaSession(data.session.user)}catch(err){await supabaseClient.auth.signOut();setAuthStatus(err.message||'This account could not access the beta company.')}}
}
document.querySelectorAll('[data-company-choice]').forEach(button=>button.addEventListener('click',()=>{requestedCompanyName=button.dataset.companyChoice==='seedworks'?'SeedWorks':'SageHarvest';document.querySelectorAll('[data-company-choice]').forEach(choice=>{const selected=choice===button;choice.classList.toggle('selected',selected);choice.setAttribute('aria-pressed',String(selected))});showSignIn()}));
document.getElementById('betaSignInForm').addEventListener('submit',async event=>{event.preventDefault();if(!requestedCompanyName){setAuthStatus('Choose SeedWorks or SageHarvest above before signing in.');return}const button=event.currentTarget.querySelector('button[type="submit"]');button.disabled=true;setAuthStatus('Signing in…',false);try{if(!supabaseClient)throw new Error('The database client did not load. Refresh this page and try again.');const {data,error}=await supabaseClient.auth.signInWithPassword({email:document.getElementById('betaEmail').value.trim(),password:document.getElementById('betaPassword').value});if(error)throw error;await activateBetaSession(data.user)}catch(error){await supabaseClient?.auth.signOut();setAuthStatus(error.message||'Sign-in failed. Check your account and try again.')}finally{button.disabled=false}});
document.getElementById('companyChoiceForm').addEventListener('submit',async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button[type="submit"]');button.disabled=true;setCompanyChoiceStatus('Opening company workspace…',false);try{const {data,error}=await supabaseClient.auth.getSession();if(error||!data.session)throw error||new Error('Your sign-in session expired. Please sign in again.');await activateBetaSession(data.session.user,document.getElementById('authCompanySelect').value)}catch(error){setCompanyChoiceStatus(error.message||'Could not open this company workspace.')}finally{button.disabled=false}});
document.getElementById('companySwitcher').addEventListener('change',async event=>{const switcher=event.currentTarget,selectedId=switcher.value,previousId=activeCompanyId,previousName=activeCompanyName,previousRecords=records;switcher.disabled=true;try{await activateBetaSession(activeUser,selectedId);notify(`Switched to ${activeCompanyName}.`)}catch(error){activeCompanyId=previousId;activeCompanyName=previousName;records=previousRecords;switcher.value=previousId;setCompanyBranding(previousName);notify(`Could not switch company: ${error.message}`)}finally{switcher.disabled=false}});
document.getElementById('forgotPassword').addEventListener('click',async()=>{const email=document.getElementById('betaEmail').value.trim();if(!email){setAuthStatus('Enter your email address first, then select “Forgot password?”.');document.getElementById('betaEmail').focus();return}if(window.location.protocol!=='https:'){setAuthStatus('Password reset is available from the published HTTPS beta site. Open the GitHub Pages app and try again.');return}const button=document.getElementById('forgotPassword');button.disabled=true;setAuthStatus('Sending reset link…',false);try{if(!supabaseClient)throw new Error('The database client did not load. Refresh this page and try again.');const redirectTo=new URL(window.location.pathname,window.location.origin).toString();const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo});if(error)throw error;setAuthStatus('If this email belongs to an approved account, a password reset link will arrive shortly. Check your inbox.',false)}catch(error){setAuthStatus(error.message||'Could not send the reset email. Please try again.')}finally{button.disabled=false}});
document.getElementById('passwordRecoveryForm').addEventListener('submit',async event=>{event.preventDefault();const password=document.getElementById('recoveryPassword').value,confirm=document.getElementById('recoveryPasswordConfirm').value;if(password.length<8){setRecoveryStatus('Use at least 8 characters.');return}if(password!==confirm){setRecoveryStatus('The passwords do not match.');return}const button=event.currentTarget.querySelector('button[type="submit"]');button.disabled=true;setRecoveryStatus('Saving password…',false);try{const {error}=await supabaseClient.auth.updateUser({password});if(error)throw error;await supabaseClient.auth.signOut();document.getElementById('recoveryPassword').value='';document.getElementById('recoveryPasswordConfirm').value='';showSignIn('Password updated. Sign in with your new password.',false)}catch(error){setRecoveryStatus(error.message||'Could not update the password. Request a new reset link and try again.')}finally{button.disabled=false}});
document.getElementById('betaSignOut').addEventListener('click',async()=>{const {error}=await supabaseClient.auth.signOut();if(error)notify(`Sign-out failed: ${error.message}`)});
function scoped(){if(role==='officer')return records.filter(r=>r.officer===selectedOfficer);if(role==='territory')return records.filter(r=>r.territoryManager===selectedTerritoryManager);if(role==='aggregator')return records.filter(r=>r.aggregator==='AG-01');return records}
const TEAM_BY_TERRITORY={'TM-01':['FA-01','FA-02'],'TM-02':['FA-03','FA-04']};
const HEALTH_GRADES=['Excellent','Good','Average','Poor','Not recorded'];
function latestInspection(r){const reports=Object.values(r.inspectionReports||{}).filter(x=>x&&typeof x==='object');reports.sort((a,b)=>Date.parse(b.savedAt||'')-Date.parse(a.savedAt||''));return reports[0]||r.stageOne||{}}
function recordedAcres(r){const actual=Number(r.actualArea);if(Number.isFinite(actual)&&actual>0)return actual;const report=latestInspection(r);for(const key of ['netGpsAcres','netGsAcres','harvestArea','netAcreage','netArea']){const n=Number(report[key]);if(report[key]!==''&&report[key]!=null&&Number.isFinite(n)&&n>0)return n}return 0}
function latestHealthInspection(r){const reports=Object.values(r.inspectionReports||{}).filter(x=>x&&typeof x==='object'&&(x.diseaseObserved!==undefined||x.pestObserved!==undefined||x.diseaseGrade!==undefined||x.pestGrade!==undefined));reports.sort((a,b)=>Date.parse(b.savedAt||'')-Date.parse(a.savedAt||''));return reports[0]||r.stageOne||{}}
function cropHealthDashboard(list){
  const groups=[['diseaseGrade','Disease impact'],['pestGrade','Pest impact']];
  const panes=groups.map(([key,label])=>{const tally=Object.fromEntries(HEALTH_GRADES.map(g=>[g,{acres:0,fields:0}]));let observedAwaitingGrade=0;
    list.forEach(r=>{const report=latestHealthInspection(r),value=HEALTH_GRADES.includes(report[key])?report[key]:'Not recorded',observed=key==='diseaseGrade'?(report.diseaseObserved==='Yes'||report.pestDisease==='Yes'):(report.pestObserved==='Yes'||report.pestDisease==='Yes');tally[value].acres+=recordedAcres(r);tally[value].fields++;if(value==='Not recorded'&&observed)observedAwaitingGrade++});
    const allAcres=Object.values(tally).reduce((s,x)=>s+x.acres,0);const colors={Excellent:'excellent',Good:'good',Average:'average',Poor:'poor','Not recorded':'unknown'};
    const rows=HEALTH_GRADES.map(g=>{const item=tally[g],pct=allAcres?Math.round(item.acres/allAcres*100):0;return `<div class="health-grade-row"><span class="health-grade ${colors[g]}">${g}</span><span class="health-grade-track"><i class="${colors[g]}" style="width:${pct}%"></i></span><b>${item.acres.toFixed(1)} ac</b><small>${item.fields} ${item.fields===1?'field':'fields'}</small></div>`}).join('');
    return `<article class="health-panel"><div class="health-panel-head"><span class="health-icon ${key==='diseaseGrade'?'disease':'pest'}">${key==='diseaseGrade'?'✿':'⌁'}</span><div><h3>${label}</h3><small>Recorded condition grades · latest report that captures observations</small></div></div><div class="health-grade-list">${rows}</div><p class="health-footnote">${allAcres?`${allAcres.toFixed(1)} acres with recorded area`: 'No acres measured or entered yet'}${observedAwaitingGrade?` · ${observedAwaitingGrade} observation(s) need a grade`:''}. Missing ratings stay unclassified; no diagnosis is inferred.</p></article>`
  }).join('');
  return `<section class="panel health-dashboard"><div class="panel-head"><div><p class="eyebrow">FIELD HEALTH · LATEST INSPECTIONS</p><h2>Disease & pest status by area</h2><p class="muted">${list.length} field records in this role scope · grades summarize officer-entered observations, not AI diagnosis.</p></div><span class="status-chip planned">SHARED RECORDS</span></div><div class="health-panels">${panes}</div><p class="health-scale-note"><span class="health-dot excellent"></span>Excellent <span class="health-dot good"></span>Good <span class="health-dot average"></span>Average <span class="health-dot poor"></span>Poor <span class="health-dot unknown"></span>Not recorded</p></section>`
}
const badge=s=>`<span class="demo-status ${s==='On track'?'ok':s==='Due'?'due':'follow'}">${s}</span>`;
function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function roleToolbar(){return `<div class="demo-toolbar"><div><b>Shared company beta</b><small>Records save to the company database and sync across signed-in users.</small></div><label>View as <select id="roleSelect"><option value="manager">Manager view</option><option value="territory">Territory view</option><option value="officer">Field officer view</option><option value="aggregator">Aggregator view</option></select></label><label id="officerPicker" class="${role==='officer'?'':'hidden'}">Field officer <select id="officerSelect"><option>FA-01</option><option>FA-02</option><option>FA-03</option><option>FA-04</option></select></label><label id="territoryPicker" class="${role==='territory'?'':'hidden'}">Territory manager <select id="territorySelect"><option>TM-01</option><option>TM-02</option></select></label><button class="outline" id="openFieldApp">Open field app view</button><button class="outline" id="reloadBetaRecords">Refresh shared records</button></div><div class="simulation-note">All active beta company members can read and update company records. View filters are for workflow review only.</div>`}
function shell(){document.querySelector('.mobile-switch')?.classList.add('hidden');let old=document.getElementById('demoToolbar');if(old)old.remove();manager.insertAdjacentHTML('afterbegin',`<div id="demoToolbar">${roleToolbar()}</div>`);document.getElementById('roleSelect').value=role;document.getElementById('officerSelect').value=selectedOfficer;document.getElementById('territorySelect').value=selectedTerritoryManager;document.getElementById('roleSelect').onchange=e=>{role=e.target.value;page='overview';render()};document.getElementById('officerSelect').onchange=e=>{selectedOfficer=e.target.value;render()};document.getElementById('territorySelect').onchange=e=>{selectedTerritoryManager=e.target.value;render()};document.getElementById('openFieldApp').onclick=()=>{role='officer';fieldScreen()};document.getElementById('reloadBetaRecords').onclick=async()=>{try{await loadBetaRecords();render();notify('Shared company records refreshed.')}catch(err){notify(`Could not refresh records: ${err.message}`)}};}
function metrics(list){let due=list.filter(r=>r.status!=='On track').length;return `<div class="metric-grid"><article class="metric"><div class="metric-title">Farmers in this view</div><strong>${list.length}</strong><small>Shared company records</small></article><article class="metric"><div class="metric-title">Inspections up to date</div><strong>${list.length?Math.round((list.length-due)/list.length*100):0}%</strong><small>${list.length-due} on track</small><div class="progress"><span style="width:${list.length?(list.length-due)/list.length*100:0}%"></span></div></article><article class="metric"><div class="metric-title">Needs follow-up</div><strong>${due}</strong><small>Due or follow-up records</small></article><article class="metric"><div class="metric-title">Quality red flags</div><strong>${list.reduce((n,r)=>n+(r.qualityFlags?.length?1:0),0)}</strong><small>Records needing review</small></article><article class="metric"><div class="metric-title">SAP lot numbers</div><strong>${list.filter(r=>r.sapLot).length}/${list.length}</strong><small>SAP connection not enabled</small></article></div>`}
function row(r){return `<tr><td><b>${escape(r.name)}</b><small>${escape(r.village)}, ${escape(r.district)}</small><small>M.R. ${escape(r.mrNumber||'Not assigned')}</small></td><td><code>${escape(r.fieldNo)}</code></td><td>${escape(r.crop)} · ${escape(r.hybrid)}</td><td>${escape(r.officer)}<small>${escape(r.territoryManager)} · ${escape(r.aggregator)}</small></td><td>${badge(r.status)}</td><td>${r.qualityFlags?.length?`<span class="quality-chip">${r.qualityFlags.length} quality flag${r.qualityFlags.length===1?'':'s'}</span><small>${escape(r.qualityFlags[0])}</small>`:'<span class="quality-clear">No flags</span>'}</td><td>${r.assignedAcres!=null?`${Number(r.assignedAcres).toFixed(2)} ac allocated`:'Not allocated'}<small>${r.actualArea?`${r.actualArea.toFixed(2)} ac measured · ${r.areaSource==='gps'?'GPS':'field report'}`:'Actual area not captured'}</small></td><td>${r.sapLot?`<code>${escape(r.sapLot)}</code>`:'Awaiting SAP'}</td><td><button class="small-action" data-inspect="${r.id}">Update</button></td></tr>`}
function table(list){return `<div class="table-wrap"><table><thead><tr><th>Farmer & location</th><th>Season field no.</th><th>Crop & hybrid</th><th>Team assignment</th><th>Inspection</th><th>Quality review</th><th>Area allocated / actual</th><th>SAP lot number</th><th>Action</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table>${list.length?'':'<p class="empty-state">No company records in this role scope yet.</p>'}</div>`}
function territoryManagerOverview(list){
  const officers=[...new Set(list.map(r=>r.officer))].sort();
  const onTrack=list.filter(r=>r.status==='On track').length;
  const attention=list.length-onTrack;
  const area=list.reduce((sum,r)=>sum+(Number(r.assignedAcres)||0),0),actualArea=list.reduce((sum,r)=>sum+(Number(r.actualArea)||0),0);
  const measured=list.filter(r=>Number(r.actualArea)>0).length;
  const maxStage=Math.max(1,...STAGES.map((_,i)=>list.filter(r=>Number(r.stage)===i+1).length));
  const metric=(label,value,detail,icon)=>`<article class="po-metric"><div><span>${icon}</span><small>${label}</small></div><b>${value}</b><p>${detail}</p></article>`;
  const officerCards=officers.map(name=>{
    const rows=list.filter(r=>r.officer===name),ok=rows.filter(r=>r.status==='On track').length,review=rows.length-ok,acres=rows.reduce((sum,r)=>sum+(Number(r.assignedAcres)||0),0),measuredAcres=rows.reduce((sum,r)=>sum+(Number(r.actualArea)||0),0),stageAverage=rows.length?rows.reduce((sum,r)=>sum+(Number(r.stage)||1),0)/rows.length:0;
    const percent=rows.length?Math.round(ok/rows.length*100):0;
    return `<article class="po-officer-row"><div class="po-officer-id"><span class="po-initials">${escape(name.slice(-2))}</span><span><b>${escape(name)}</b><small>${rows.length} assigned farmers · avg. stage ${stageAverage.toFixed(1)} / 6</small></span></div><div class="po-officer-stat"><b>${acres.toFixed(1)} ac</b><small>${measuredAcres.toFixed(1)} actual measured</small></div><div class="po-officer-stat"><b>${ok} on track</b><small>${review} due / follow-up</small></div><div class="po-status-track" role="img" aria-label="${percent}% of this officer’s sample fields are on track"><span class="po-status-ok" style="width:${percent}%"></span><span class="po-status-attention" style="width:${100-percent}%"></span></div><span class="po-officer-badge ${review?'needs-review':'on-track'}">${review?`${review} need review`:'On track'}</span><button type="button" class="text-button po-review-link" data-go="fields">Review fields →</button></article>`
  }).join('');
  const stageBars=STAGES.map((name,i)=>{const count=list.filter(r=>Number(r.stage)===i+1).length;return `<div class="po-stage-row"><span class="po-stage-number">0${i+1}</span><span class="po-stage-name">${escape(name.replace(' Report',''))}</span><span class="po-stage-track"><i style="width:${count?Math.max(8,Math.round(count/maxStage*100)):0}%"></i></span><b>${count}</b></div>`}).join('');
  const leading=officers.filter(name=>list.some(r=>r.officer===name&&r.status!=='On track'));
  return `<div class="page-heading po-heading"><div><p class="eyebrow">KHARIF 2026 · TERRITORY SCOPE</p><h1>Territory performance</h1><p class="muted">Supervise assigned field officers, farmer coverage, follow-ups and crop-stage movement.</p></div><span class="po-scope-badge">${escape(selectedTerritoryManager)} · TERRITORY</span></div>
  <div class="po-data-note"><span>◉</span><div><b>Territory dashboard</b><small>This view shows ${officers.length} field officers and ${list.length} company records assigned to ${escape(selectedTerritoryManager)}. Figures use saved record values.</small></div></div>
  <section class="po-metric-grid">${metric('Field officers',officers.length,'Direct reports in this sample scope','♙')}${metric('Assigned farmers',list.length,'Across your assigned field team','⌖')}${metric('Area allocated',area.toFixed(1)+' ac',`${actualArea.toFixed(1)} actual acres recorded across ${measured} fields`,'▱')}${metric('On track',`${onTrack} / ${list.length}`,`${attention} due or follow-up fields`, '✓')}</section>
  <div class="po-analytics-grid"><section class="panel po-chart-panel"><div class="panel-head"><div><h2>Crop progress by inspection stage</h2><p class="muted">Current stage placement · fields per stage</p></div><span class="po-chart-key"><i></i> Fields</span></div><div class="po-stage-chart" role="img" aria-label="Counts of fields at each of the six inspection stages">${stageBars}</div><p class="po-chart-footnote">Bars show saved inspection stage values. They are not a crop or satellite assessment.</p></section>
  <section class="panel po-chart-panel"><div class="panel-head"><div><h2>Field officer follow-up</h2><p class="muted">On-track and due / follow-up sample assignments</p></div><span class="po-legend"><i class="po-status-ok"></i> On track <i class="po-status-attention"></i> Review</span></div><div class="po-team-list">${officerCards||'<p class="empty-state">No field officers are assigned in this scope.</p>'}</div></section></div>
  <section class="panel po-priority-panel"><div class="panel-head"><div><h2>Team attention</h2><p class="muted">Officers with at least one due or follow-up field</p></div><button class="text-button" data-go="fields">Open team field list →</button></div><div class="po-priority-list">${leading.length?leading.map(name=>{const rows=list.filter(r=>r.officer===name),issues=rows.filter(r=>r.status!=='On track').length;return `<div><span class="po-priority-dot"></span><b>${escape(name)}</b><small>${issues} of ${rows.length} assigned sample fields due or marked follow-up</small><span class="po-priority-count">${issues} review</span></div>`}).join(''):'<p class="empty-state">No officers have a due or follow-up sample field.</p>'}</div></section>
  ${cropHealthDashboard(list)}<footer>Territory Manager view · ${escape(selectedTerritoryManager)} workflow view · company records are shared across active members</footer>`
}
function fieldOfficerOverview(list){
  const ok=list.filter(r=>r.status==='On track').length,attention=list.length-ok,area=list.reduce((sum,r)=>sum+(Number(r.assignedAcres)||0),0),actualArea=list.reduce((sum,r)=>sum+(Number(r.actualArea)||0),0),measured=list.filter(r=>Number(r.actualArea)>0).length;
  const stageBars=STAGES.map((name,i)=>{const count=list.filter(r=>Number(r.stage)===i+1).length;return `<div class="po-stage-row"><span class="po-stage-number">0${i+1}</span><span class="po-stage-name">${escape(name.replace(' Report',''))}</span><span class="po-stage-track"><i style="width:${count?Math.max(8,Math.round(count/Math.max(1,...STAGES.map((_,j)=>list.filter(r=>Number(r.stage)===j+1).length))*100)):0}%"></i></span><b>${count}</b></div>`}).join('');
  const followups=list.filter(r=>r.status!=='On track');
  const metric=(label,value,detail,icon)=>`<article class="po-metric"><div><span>${icon}</span><small>${label}</small></div><b>${value}</b><p>${detail}</p></article>`;
  return `<div class="page-heading po-heading"><div><p class="eyebrow">KHARIF 2026 · MY ASSIGNMENTS</p><h1>My field dashboard</h1><p class="muted">Your assigned farmers, inspection progress and follow-ups.</p></div><span class="po-scope-badge">${escape(selectedOfficer)} · FIELD OFFICER</span></div><div class="po-data-note"><span>◉</span><div><b>Personal assignment view</b><small>${escape(selectedOfficer)} is selected as a workflow filter. All active company members can view and update the shared beta records.</small></div></div><section class="po-metric-grid">${metric('Assigned farmers',list.length,'Fields in your current assignment','⌖')}${metric('Area allocated',area.toFixed(1)+' ac',`${actualArea.toFixed(1)} actual acres measured across ${measured} fields`,'▱')}${metric('Inspections on track',`${ok} / ${list.length}`,`${attention} need follow-up`,'✓')}${metric('Current crop stage',list.length?`${(list.reduce((s,r)=>s+Number(r.stage||1),0)/list.length).toFixed(1)} / 6`:'—','Average current stage','◷')}</section><div class="po-analytics-grid"><section class="panel po-chart-panel"><div class="panel-head"><div><h2>My crop-stage progress</h2><p class="muted">Assigned fields by current inspection stage</p></div></div><div class="po-stage-chart">${stageBars}</div><p class="po-chart-footnote">Stage counts use saved inspection reports and do not predict crop condition.</p></section><section class="panel po-chart-panel"><div class="panel-head"><div><h2>Needs my attention</h2><p class="muted">Assigned fields marked due or follow-up</p></div><button class="text-button" data-go="fields">Open my fields →</button></div><div class="po-priority-list">${followups.length?followups.map(r=>`<div><span class="po-priority-dot"></span><b>${escape(r.fieldNo)}</b><small>${escape(r.name)} · ${escape(r.village)} · ${escape(r.status)}</small><span class="po-priority-count">Stage ${r.stage} / 6</span></div>`).join(''):'<p class="empty-state">No follow-ups in this view.</p>'}</div></section></div>${cropHealthDashboard(list)}<footer>Field Officer workflow view · ${escape(selectedOfficer)}</footer>`
}
function productionManagerOverview(list){
  const territories=[...new Set(list.map(r=>r.territoryManager))].sort();
  const officers=[...new Set(list.map(r=>r.officer))].length,area=list.reduce((s,r)=>s+(Number(r.assignedAcres)||0),0),actualArea=list.reduce((s,r)=>s+(Number(r.actualArea)||0),0),measured=list.filter(r=>Number(r.actualArea)>0).length;
  const metric=(label,value,detail,icon)=>`<article class="po-metric"><div><span>${icon}</span><small>${label}</small></div><b>${value}</b><p>${detail}</p></article>`;
  const territoryCards=territories.map(tm=>{const rows=list.filter(r=>r.territoryManager===tm),ok=rows.filter(r=>r.status==='On track').length,needs=rows.length-ok,acres=rows.reduce((s,r)=>s+(Number(r.actualArea)||0),0),pct=rows.length?Math.round(ok/rows.length*100):0;return `<article class="pm-territory-card"><div class="pm-territory-top"><span class="po-initials">${tm.slice(-2)}</span><div><b>${tm}</b><small>${[...new Set(rows.map(r=>r.officer))].length} field officers · ${rows.length} farmers</small></div><span class="po-officer-badge ${needs?'needs-review':'on-track'}">${needs?`${needs} need review`:'On track'}</span></div><div class="pm-territory-stats"><span><b>${acres.toFixed(1)} ac</b><small>${rows.filter(r=>Number(r.actualArea)>0).length} measured</small></span><span><b>${ok} / ${rows.length}</b><small>on track</small></span><span><b>${rows.length?`${(rows.reduce((s,r)=>s+Number(r.stage||1),0)/rows.length).toFixed(1)} / 6`:'—'}</b><small>average stage</small></span></div><div class="po-status-track"><span class="po-status-ok" style="width:${pct}%"></span><span class="po-status-attention" style="width:${100-pct}%"></span></div><button class="text-button" data-open-territory="${tm}">View territory dashboard →</button></article>`}).join('');
  const stageRows=STAGES.map((name,i)=>{const rows=list.filter(r=>Number(r.stage)===i+1),acres=rows.reduce((s,r)=>s+(Number(r.actualArea)||0),0);return `<tr><td><b>0${i+1} · ${escape(name.replace(' Report',''))}</b></td><td>${rows.length}</td><td>${acres.toFixed(1)} ac</td><td><span class="pm-not-ready">Not available</span><small>Needs approved crop-stage yield model</small></td><td><span class="pm-not-ready">Not calculated</span><small>Set season targets and validated inputs</small></td></tr>`}).join('');
  const stageBars=STAGES.map((name,i)=>{const count=list.filter(r=>Number(r.stage)===i+1).length;return `<div class="po-stage-row"><span class="po-stage-number">0${i+1}</span><span class="po-stage-name">${escape(name.replace(' Report',''))}</span><span class="po-stage-track"><i style="width:${count?Math.max(8,Math.round(count/Math.max(1,...STAGES.map((_,j)=>list.filter(r=>Number(r.stage)===j+1).length))*100)):0}%"></i></span><b>${count}</b></div>`}).join('');
  return `<div class="page-heading po-heading"><div><p class="eyebrow">KHARIF 2026 · MAHARASHTRA · STATE VIEW</p><h1>Production Manager overview</h1><p class="muted">A consolidated view of territory coverage, crop-stage progress and production planning readiness.</p></div><button class="primary" data-go="fields">Upload master & allocate farmers →</button></div><div class="po-data-note"><span>◉</span><div><b>Consolidated company dashboard</b><small>Aggregates company records in this workflow view. Values recalculate from saved records. SAP, satellite, and seasonal planning feeds are not connected.</small></div></div><section class="po-metric-grid">${metric('Territory Managers',territories.length,'Configured team view','♙')}${metric('Field Officers',officers,'Across this company view','♧')}${metric('Farmers in scope',list.length,'Assigned company records','⌖')}${metric('Area allocated',area.toFixed(1)+' ac',`${actualArea.toFixed(1)} actual acres measured across ${measured} fields`,'▱')}</section><section class="pm-planning-grid"><article class="pm-plan-card"><small>SEASON AREA TARGET</small><b>Not configured</b><span>Requires an approved target for this season and geography.</span></article><article class="pm-plan-card"><small>TARGET ACHIEVEMENT LIKELIHOOD</small><b>Not calculated</b><span>Requires target, measured acreage, inspection recency and validated model.</span></article><article class="pm-plan-card"><small>YIELD ESTIMATE</small><b>Awaiting model</b><span>Requires crop/hybrid yield assumptions and verified inspection/harvest history.</span></article></section><div class="po-analytics-grid"><section class="panel po-chart-panel"><div class="panel-head"><div><h2>Crop progress across the state</h2><p class="muted">Company records by inspection stage</p></div><span class="po-chart-key"><i></i> Farmers</span></div><div class="po-stage-chart">${stageBars}</div><p class="po-chart-footnote">These are saved report stages. They are not periodic crop assessments.</p></section><section class="panel po-chart-panel"><div class="panel-head"><div><h2>Territory comparison</h2><p class="muted">Coverage and follow-up by direct report</p></div></div><div class="pm-territory-list">${territoryCards}</div></section></div><section class="panel pm-yield-panel"><div class="panel-head"><div><h2>Yield outlook by crop stage</h2><p class="muted">Stage-specific framework for the future production forecast</p></div><span class="status-chip planned">MODEL NOT CONFIGURED</span></div><div class="table-wrap"><table><thead><tr><th>Inspection stage</th><th>Farmers in stage</th><th>Recorded area</th><th>Yield estimate</th><th>Target likelihood</th></tr></thead><tbody>${stageRows}</tbody></table></div><p class="pm-explainer">Once approved targets and crop/hybrid yield rules are supplied, these values can update from the inspection records as each territory reports. No yield rate or achievement probability is invented in this sample view.</p></section>${cropHealthDashboard(list)}<footer>Production Manager workflow view · Maharashtra · Yield model not configured</footer>`
}
function overview(list){if(role==='territory')return territoryManagerOverview(list);if(role==='officer')return fieldOfficerOverview(list);if(role==='manager')return productionManagerOverview(list);return `<div class="page-heading"><div><p class="eyebrow">KHARIF 2026 · AGGREGATOR SCOPE</p><h1>Aggregator overview</h1><p class="muted">Explore assigned farmer records and handoff status.</p></div><button class="primary" data-go="fields">Explore farmer roster →</button></div>${metrics(list)}<div class="demo-columns"><article class="panel"><div class="panel-head"><div><h2>Field activity</h2><p class="muted">Records visible in this workflow view</p></div><button class="text-button" data-go="fields">Open roster →</button></div>${table(list.slice(0,5))}</article><article class="panel"><h2>Try the workflows</h2><p class="muted">Updates are saved to the shared company database.</p><div class="try-list"><button data-go="fields"><b>1</b><span><strong>Review farmer assignments</strong><small>Filter the shared records by workflow assignment.</small></span>→</button><button data-go="inspections"><b>2</b><span><strong>Update an inspection</strong><small>Choose crop stage, status and an observation.</small></span>→</button><button data-go="production"><b>3</b><span><strong>Review SAP lot status</strong><small>SAP connection is not enabled for this beta.</small></span>→</button></div></article></div>${cropHealthDashboard(list)}<footer>Company beta · shared records</footer>`}
function masterUploadPanel(){return `<section class="panel master-upload-panel"><div class="panel-head"><div><p class="eyebrow">PRODUCTION MANAGER · BULK ONBOARDING</p><h2>Upload farmer master & allocate territory</h2><p class="muted">Validate a workbook, then assign farmers and planned acres to Territory Managers and Field Officers.</p></div><span class="status-chip planned">COMPANY BETA</span></div><div class="master-upload-warning"><b>Review carefully before saving to production.</b><span>Confirmed rows are written to the shared company database and visible to all active beta members. Bank-account columns are ignored and never stored.</span></div><div class="master-upload-actions"><a class="outline" href="#" id="downloadMasterTemplate">Download Excel template (.csv)</a><label class="outline master-file-picker">Choose Excel or CSV file<input id="masterFile" type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"></label></div><div class="master-default-assignments"><label>Default Territory Manager<select id="defaultTerritory"><option>TM-01</option><option>TM-02</option></select></label><label>Default Field Officer<select id="defaultFieldOfficer"><option>FA-01</option><option>FA-02</option></select></label></div><p class="master-template-hint">Columns include farmer/mobile/location, crop/hybrid, seasonal field number, assigned acres, Territory Manager, Field Officer, aggregator, and optional M-1/M-2/M-3/female parent seed IDs and lot numbers. A bank-account column may be present but is ignored. Assignment columns take priority over the defaults.</p><div id="masterImportStatus" class="master-import-status" role="status" aria-live="polite">Select a workbook to validate before saving rows to the shared company database.</div></section>`}
function roster(list){return `<div class="page-heading"><div><p class="eyebrow">ONBOARDING & ASSIGNMENTS</p><h1>Farmer & field roster</h1><p class="muted">Production Managers upload the master and allocate farmers and acreage. Other roles see their assigned scope.</p></div><button class="primary" id="reloadSamples">↻ Refresh records</button></div>${role==='manager'?masterUploadPanel():''}${metrics(list)}<article class="panel"><div class="panel-head"><div><h2>${list.length} farmers in this role view</h2><p class="muted">Each row shows the Field Officer and Territory Manager assignment.</p></div><span class="status-chip planned">COMPANY BETA</span></div>${table(list)}</article><footer>Role filters are workflow views only. Active company members share access to all beta records.</footer>`}
function normalizedHeader(value){return String(value||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'')}
function pickCell(row,...names){const wanted=new Set(names.map(normalizedHeader));for(const [key,value] of Object.entries(row))if(wanted.has(normalizedHeader(key)))return String(value??'').trim();return ''}
function validateMasterRows(rows){const existing=new Set(records.map(r=>String(r.fieldNo).toLowerCase())),seen=new Set(),valid=[],errors=[];const defaultTm=document.getElementById('defaultTerritory')?.value||'TM-01',defaultFo=document.getElementById('defaultFieldOfficer')?.value||'FA-01';
  rows.forEach((source,index)=>{const line=index+2,name=pickCell(source,'farmerName','name'),mrNumber=pickCell(source,'mrNumber','mrRollNumber','masterRollNumber'),mobile=pickCell(source,'mobile','mobileNumber','farmerMobileNumber','phone'),village=pickCell(source,'village'),district=pickCell(source,'district'),state=pickCell(source,'state'),crop=pickCell(source,'crop'),hybrid=pickCell(source,'hybrid'),fieldNo=pickCell(source,'seasonalFieldNo','seasonalFieldNumber','fieldNumber','fieldNo','seasonFieldNumber'),tm=pickCell(source,'territoryManager','tm')||defaultTm,fo=pickCell(source,'fieldOfficer','officer','fo')||(TEAM_BY_TERRITORY[tm]?.includes(defaultFo)?defaultFo:(TEAM_BY_TERRITORY[tm]||[])[0]||defaultFo),aggregator=pickCell(source,'aggregator','organizer')||'AG-01',acresText=pickCell(source,'assignedAcres','plannedAcres','allocatedAcres','productionArea','acres'),acres=acresText===''?0:Number(acresText),issues=[];
    for(const [label,value] of [['Farmer name',name],['Mobile',mobile],['Village',village],['District',district],['State',state],['Crop',crop],['Hybrid',hybrid],['Season field number',fieldNo]])if(!value)issues.push(`${label} is missing`);
    if(mobile&&!/^\+?[0-9][0-9\s()-]{7,18}$/.test(mobile))issues.push('Mobile number format is invalid');
    if(fieldNo){const key=fieldNo.toLowerCase();if(existing.has(key)||seen.has(key))issues.push('Season field number is duplicated');seen.add(key)}
    if(!TEAM_BY_TERRITORY[tm])issues.push(`Unknown Territory Manager ${tm}`);else if(!TEAM_BY_TERRITORY[tm].includes(fo))issues.push(`${fo} is not assigned to ${tm}`);
    if(acresText==='' )issues.push('Assigned acres are missing');else if(!Number.isFinite(acres)||acres<0)issues.push('Assigned acres must be zero or a positive number');
    if(issues.length){errors.push({line,fieldNo:fieldNo||'—',issues});return}
    const parentSeed=Object.fromEntries(['maleM1','maleM1Lot','maleM2','maleM2Lot','maleM3','maleM3Lot','femaleParent','femaleParentLot'].map(key=>[key,pickCell(source,key)]));
    valid.push({name,mrNumber,mobile,village,district,state,crop,hybrid,fieldNo,territoryManager:tm,officer:fo,aggregator,assignedAcres:acres,parentSeed,status:'Due',stage:1,sapLot:'',actualArea:null,boundaryPoints:[],areaSource:null,stageOne:null,inspectionReports:{},completedStages:[],qualityFlags:[],notes:''});
  });return {valid,errors}}
function showMasterPreview(rows){const status=document.getElementById('masterImportStatus');if(!status)return;if(!rows.length){status.innerHTML='<b>No data rows found.</b> Add farmer rows below the header and try again.';return}const result=validateMasterRows(rows);pendingMasterRows=result.errors.length?null:result.valid;const preview=result.valid.slice(0,6).map(r=>`<tr><td>${escape(r.fieldNo)}</td><td>${escape(r.mrNumber||'')}</td><td>${escape(r.name)}</td><td>${escape(r.village)}, ${escape(r.district)}</td><td>${escape(r.territoryManager)} · ${escape(r.officer)}</td><td>${r.assignedAcres.toFixed(2)} ac</td></tr>`).join('');const issues=result.errors.slice(0,10).map(e=>`<li>Row ${e.line} · ${escape(e.fieldNo)}: ${escape(e.issues.join('; '))}</li>`).join('');status.innerHTML=`<div class="master-preview-head"><b>${result.valid.length} valid row${result.valid.length===1?'':'s'} · ${result.errors.length} row${result.errors.length===1?'':'s'} need correction</b><small>${result.errors.length?'Fix errors in the workbook and upload it again. No rows were added.':'Review the assignment preview, then save the rows to the shared company beta.'}</small></div>${preview?`<div class="table-wrap"><table><thead><tr><th>Field no.</th><th>M.R. no.</th><th>Farmer</th><th>Village · district</th><th>TM · FO</th><th>Allocated</th></tr></thead><tbody>${preview}</tbody></table></div>`:''}${issues?`<ul class="master-error-list">${issues}</ul>`:''}${!result.errors.length?`<button class="primary" id="confirmMasterImport">Save ${result.valid.length} farmers to company beta</button>`:''}`;document.getElementById('confirmMasterImport')?.addEventListener('click',async e=>{if(!pendingMasterRows||!activeUser)return;const button=e.currentTarget,imported=pendingMasterRows.map(r=>({...r,id:crypto.randomUUID(),seasonKey:'Kharif 2026',state:r.state}));button.disabled=true;button.textContent='Saving shared records…';try{await saveBetaRecords(imported);records.push(...imported);pendingMasterRows=null;notify(`${imported.length} farmer records saved for the company.`);page='fields';render()}catch(err){button.disabled=false;button.textContent=`Retry save of ${imported.length} farmers`;notify(`Save failed; records were not added to this view: ${err.message}`)}})}
function bindMasterUpload(){const file=document.getElementById('masterFile');if(!file)return;document.getElementById('defaultTerritory').onchange=e=>{const tm=e.target.value,select=document.getElementById('defaultFieldOfficer');select.innerHTML=(TEAM_BY_TERRITORY[tm]||[]).map(fo=>`<option>${fo}</option>`).join('')};document.getElementById('downloadMasterTemplate').onclick=e=>{e.preventDefault();const header='farmerName,mrNumber,mobile,village,district,state,crop,hybrid,seasonalFieldNo,assignedAcres,territoryManager,fieldOfficer,aggregator,maleM1,maleM1Lot,maleM2,maleM2Lot,maleM3,maleM3Lot,femaleParent,femaleParentLot,bankAccount';const url=URL.createObjectURL(new Blob([header+'\n'],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='SageHarvest_Farmer_Master_Template.csv';a.click();URL.revokeObjectURL(url)};file.onchange=async()=>{pendingMasterRows=null;const status=document.getElementById('masterImportStatus'),chosen=file.files?.[0];if(!chosen)return;status.textContent='Reading and validating the selected workbook in this browser…';try{if(typeof XLSX==='undefined')throw new Error('Excel reader did not load. Refresh the page and try again.');const bytes=await chosen.arrayBuffer(),book=XLSX.read(bytes,{type:'array',cellDates:true}),sheet=book.Sheets[book.SheetNames[0]],rows=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});showMasterPreview(rows)}catch(err){status.textContent=err.message||'This workbook could not be read. Try .xlsx, .xls, or .csv.'}}}
function inspections(list){return `<div class="page-heading"><div><p class="eyebrow">FIELD MONITORING</p><h1>Inspections</h1><p class="muted">Update shared company records through the six crop monitoring stages.</p></div></div>${metrics(list)}<article class="panel"><div class="panel-head"><div><h2>Inspection worklist</h2><p class="muted">Select Update to record an inspection.</p></div></div>${table(list)}</article>`}
function production(list){return `<div class="page-heading"><div><p class="eyebrow">HARVEST TRACEABILITY</p><h1>Production & lots</h1><p class="muted">SAP connection is not enabled for this beta.</p></div></div>${metrics(list)}<article class="panel"><div class="panel-head"><div><h2>Seasonal field and SAP identifiers</h2><p class="muted">SAP lot values are read-only and must come from the company SAP system.</p></div></div>${table(list)}</article>`}
function reports(list){let crops={};list.forEach(r=>crops[r.crop]=(crops[r.crop]||0)+1);return `<div class="page-heading"><div><p class="eyebrow">DEMO SUMMARY</p><h1>Reports</h1><p class="muted">A live summary of this role’s shared company records.</p></div></div>${metrics(list)}<div class="demo-columns">${Object.entries(crops).map(([crop,n])=>`<article class="panel"><h2>${escape(crop)}</h2><p class="report-number">${n}</p><p class="muted">fields in this role scope</p></article>`).join('')||'<article class="panel">No records to summarize.</article>'}</div>`}
function renderManager(){document.body.classList.remove('field-mode');shell();const list=scoped();dashboard.classList.toggle('hidden',page!=='overview');registry.classList.toggle('hidden',page==='overview');if(page==='overview')dashboard.innerHTML=overview(list);else if(page==='fields')registry.innerHTML=roster(list);else if(page==='inspections')registry.innerHTML=inspections(list);else if(page==='production')registry.innerHTML=production(list);else registry.innerHTML=reports(list);nav.forEach(n=>n.classList.toggle('selected',n.dataset.view===page));document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{page=b.dataset.go;render()});document.querySelectorAll('[data-open-territory]').forEach(b=>b.onclick=()=>{selectedTerritoryManager=b.dataset.openTerritory;role='territory';page='overview';render()});document.querySelectorAll('[data-inspect]').forEach(b=>b.onclick=()=>editInspection(b.dataset.inspect));bindMasterUpload();document.getElementById('reloadSamples')?.remove()}
function fieldSummaryScreen(r){
  const pre=(r.inspectionReports||{})[5]||{},harvest=(r.inspectionReports||{})[6]||{};
  const shown=(value,unit)=>value!==undefined&&value!==null&&String(value).trim()!==''?escape(String(value)+(unit?' '+unit:'')):'Not recorded';
  const netGpsAcres=pre.netGpsAcres??pre.netGsAcres;
  const hasAcres=String(netGpsAcres??'').trim()!==''&&Number.isFinite(Number(netGpsAcres)),hasWeight=String(harvest.dispatchSeedWeight??'').trim()!==''&&Number.isFinite(Number(harvest.dispatchSeedWeight));
  const acres=Number(netGpsAcres),weight=Number(harvest.dispatchSeedWeight),unit=harvest.dispatchWeightUnit||'';
  const productivity=hasAcres&&acres>0&&hasWeight&&weight>=0&&unit?(weight/acres).toFixed(2)+' '+unit+'/acre':'Not available · enter net GPS area and dispatched weight';
  const metric=(label,value,detail)=>'<article class="summary-metric"><small>'+escape(label)+'</small><b>'+value+'</b>'+(detail?'<span>'+escape(detail)+'</span>':'')+'</article>';
  return '<div class="mobile-page-heading"><p class="eyebrow">SEASON FIELD CLOSE-OUT · ALL SIX REPORTS COMPLETE</p><h1>Final field summary</h1><p>Review the recorded area, dispatch, seed quality and production metrics for this field.</p></div><section class="summary-field-card"><div><small>FARMER · SEASON FIELD</small><b>'+escape(r.name)+' · '+escape(r.fieldNo)+'</b><span>'+escape(r.village)+', '+escape(r.district)+' · '+escape(r.crop)+' · '+escape(r.hybrid)+'</span></div><span class="summary-complete-badge">✓ 6 / 6 complete</span></section><section class="summary-metric-grid">'+metric('Net GPS area',shown(netGpsAcres,'acres'),'Final payment area · Pre-Harvesting Report')+metric('Productivity per acre',escape(productivity),'Dispatched seed weight ÷ net GPS area')+metric('Dispatched seed weight',shown(harvest.dispatchSeedWeight,unit),'From Harvesting Report')+metric('Seed moisture',shown(harvest.seedMoisture,'%'),'As recorded at dispatch')+metric('Seed quality status',shown(harvest.qualityStatus),'Field officer assessment')+metric('Dispatch challan · DC',shown(harvest.dcNumber))+metric('Seed dispatch · STN',shown(harvest.dispatchNumber))+metric('Dispatch date',shown(harvest.dispatchDate))+'</section><section class="summary-note"><b>Recorded values only</b><p>Productivity is calculated only when both net GPS area and dispatched seed weight are entered with a weight unit. This prototype does not verify dispatch, moisture, quality, or production data with company systems.</p></section><section class="summary-stage-list"><h2>Inspection completion</h2>'+STAGES.map((name,i)=>'<div><span>✓</span><b>'+escape(name)+'</b><small>'+escape((r.inspectionReports||{})[i+1]?.inspectionDate||'Date not recorded')+'</small></div>').join('')+'</section><button type="button" class="outline" data-bottom="inspections">← Back to inspection stages</button>';
}

function advisoryValue(stats,key){
  const value=stats?.[key]?.bands?.B0?.stats?.mean;
  return Number.isFinite(Number(value))?Number(value):null;
}
function opticalTrendSummary(intervals){
  const keys=['ndvi','ndmi','ndre','evi','savi'];
  const labels={ndvi:'NDVI (crop greenness)',ndmi:'NDMI (canopy moisture signal)',ndre:'NDRE (chlorophyll-related signal)',evi:'EVI (vegetation signal)',savi:'SAVI (soil-adjusted vegetation signal)'};
  const value=(item,key)=>{const n=item?.outputs?.[key]?.bands?.B0?.stats?.mean;return Number.isFinite(Number(n))?Number(n):null};
  if(!Array.isArray(intervals)||intervals.length<2)return '';
  const first=intervals[0],last=intervals[intervals.length-1],changes=[];
  keys.forEach(key=>{const a=value(first,key),b=value(last,key);if(a!==null&&b!==null&&Math.abs(a)>0.000001)changes.push({key,label:labels[key],a,b,delta:b-a,pct:(b-a)/Math.abs(a)*100})});
  if(!changes.length)return '';
  const declining=changes.filter(x=>x.pct<=-10),rising=changes.filter(x=>x.pct>=10);
  let headline='Vegetation indicators show mixed changes';
  let explanation='Compare the changes with crop stage, field operations and image quality before drawing a conclusion.';
  if(declining.length>=3){
    headline='Several vegetation indicators have declined';
    explanation='From the first to the last available interval, '+declining.map(x=>x.key.toUpperCase()).join(', ')+' declined by at least 10%. This is a meaningful change in the satellite signal and warrants a field check. It does not, by itself, identify the cause or quantify crop loss.';
  }else if(rising.length>=3){
    headline='Several vegetation indicators have increased';
    explanation='From the first to the last available interval, '+rising.map(x=>x.key.toUpperCase()).join(', ')+' increased by at least 10%. This may reflect canopy development or recovery; confirm that it matches the expected crop stage.';
  }
  const rows=changes.map(x=>'<div class="satellite-trend-row"><span>'+escape(x.key.toUpperCase())+'</span><b>'+x.a.toFixed(4)+' → '+x.b.toFixed(4)+'</b><strong class="'+(x.pct<=-10?'trend-down':x.pct>=10?'trend-up':'trend-steady')+'">'+(x.pct>0?'+':'')+x.pct.toFixed(1)+'%</strong></div>').join('');
  return '<section class="satellite-trend-summary"><p class="eyebrow">WHOLE-PERIOD TREND · FIRST VS LAST INTERVAL</p><h3>'+escape(headline)+'</h3><p>'+escape(explanation)+'</p><div class="satellite-trend-table">'+rows+'</div><div class="satellite-advisory-next"><b>Recommended field check</b><p>Confirm the rice crop stage and whether harvest, drainage, irrigation or other field operations occurred during this period. Inspect representative areas for soil moisture, waterlogging, leaf colour, pest/disease symptoms and lodging. Do not apply fertiliser or crop-protection products based on these indices alone.</p></div></section>';
}
function opticalAdvisory(stats,previousStats){
  const ndvi=advisoryValue(stats,'ndvi'), ndmi=advisoryValue(stats,'ndmi'), ndre=advisoryValue(stats,'ndre');
  const previousNdvi=advisoryValue(previousStats,'ndvi');
  const items=[];
  if(ndvi===null){
    items.push({title:'Crop vigour',text:'NDVI was not available for this observation, so crop vigour cannot be assessed from this interval.'});
  }else{
    let text=ndvi<0.2?'The vegetation signal is low or sparse. Bare soil, early crop stage, harvested ground, water or weak crop growth can all produce this pattern.':ndvi<0.4?'The vegetation signal is moderate. Whether this is expected depends on crop type, growth stage and field conditions.':'The vegetation signal is relatively strong, which is consistent with a greener or denser canopy; it does not by itself prove the crop is stress-free.';
    if(previousNdvi!==null){
      const delta=ndvi-previousNdvi;
      if(delta<=-0.08) text+=' NDVI has fallen noticeably versus the previous interval; check the field for stress or a normal stage transition.';
      else if(delta>=0.08) text+=' NDVI has risen noticeably versus the previous interval, which may indicate canopy development or recovery.';
      else text+=' NDVI is broadly stable versus the previous interval.';
    }
    items.push({title:'Crop vigour (NDVI)',text});
  }
  if(ndmi===null){
    items.push({title:'Canopy moisture signal (NDMI)',text:'NDMI was not available. No moisture interpretation can be made from this interval.'});
  }else{
    items.push({title:'Canopy moisture signal (NDMI)',text:ndmi<0?'NDMI is below zero, which can be consistent with a relatively low vegetation-moisture signal, but soil background, crop stage and canopy density can affect it. Check soil and plant moisture directly.':'NDMI is above zero, indicating a positive vegetation-moisture signal. Compare with the same field over time; this is not a direct soil-moisture measurement.'});
  }
  if(ndre!==null) items.push({title:'Chlorophyll-related signal (NDRE)',text:'NDRE mean is '+ndre.toFixed(3)+'. Interpret it against earlier observations of this same crop and growth stage; it cannot identify a specific nutrient deficiency on its own.'});
  return '<section class="satellite-advisory"><p class="eyebrow">PLAIN-LANGUAGE INTERPRETATION · SCREENING ONLY</p>'+items.map(x=>'<div class="satellite-advisory-item"><b>'+escape(x.title)+'</b><p>'+escape(x.text)+'</p></div>').join('')+'<div class="satellite-advisory-next"><b>What to do next</b><p>Inspect the field before taking corrective action. Check crop stage, soil moisture, waterlogging, weeds, nutrient symptoms, pests and disease. Satellite indices cannot confirm a pest, disease, lodging event or a specific nutrient problem by themselves.</p></div></section>';
}
function radarAdvisory(vv,vh,previousVv,previousVh){
  const items=[];
  function trend(label,current,previous){
    if(!Number.isFinite(current)) return label+' value is unavailable.';
    if(!Number.isFinite(previous)) return label+' mean is '+current.toFixed(4)+'. A single radar value is not enough to diagnose crop condition or soil moisture.';
    const change=current-previous, pct=Math.abs(previous)>0.000001?Math.abs(change/previous)*100:null;
    if(pct!==null&&pct>=20) return label+' changed by about '+pct.toFixed(0)+'% versus the previous interval. This is a notable radar-signal change, not a diagnosis; rainfall, surface wetness, vegetation structure and acquisition conditions can affect it.';
    return label+' is broadly stable versus the previous interval. This alone does not establish that the crop is healthy or free from stress.';
  }
  items.push(trend('VV backscatter',vv,previousVv));
  items.push(trend('VH backscatter',vh,previousVh));
  return '<section class="satellite-advisory"><p class="eyebrow">PLAIN-LANGUAGE INTERPRETATION · RADAR SIGNAL</p>'+items.map(t=>'<div class="satellite-advisory-item"><p>'+escape(t)+'</p></div>').join('')+'<div class="satellite-advisory-next"><b>What to do next</b><p>Compare several usable observations and check rainfall/irrigation records. Confirm possible water stress, waterlogging or lodging in the field; VV/VH alone cannot confirm any of these conditions.</p></div></section>';
}

function askRamScreen(current){
  const languages=['English','Hindi','Marathi','Telugu','Kannada','Tamil','Gujarati','Bengali','Punjabi','Urdu','Odia','Malayalam','Other language'];
  const examples=['What is the recommended seedling age for transplanting?','When should nick prediction begin?','At what moisture should female plants be harvested?','What are the symptoms of stem borer?'];
  const transcript=askChat.length?askChat.map(item=>{
    const role=item.role==='user'?'user':item.role==='assistant'?'assistant':'notice';
    const label=role==='user'?'YOU':role==='assistant'?'RAM':'SYSTEM';
    return '<div class="ask-chat-row '+role+'"><small>'+label+'</small><p>'+escape(item.text)+'</p></div>';
  }).join(''):'<div class="ask-chat-empty"><span>✳</span><b>Start a conversation with Ram</b><p>Ask a question about Paddy hybrid seed production and the approved SeedWorks SOP.</p></div>';
  const liveSupported=!!(window.WebSocket&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&window.AudioContext);
  return '<button type="button" class="ask-ram-back" data-bottom="inspections">← Back to Inspections</button><div class="mobile-page-heading"><p class="eyebrow">FIELD OFFICER SUPPORT</p><h1>Ask Ram</h1><p>Live voice and chat support for field work</p></div><section class="ask-ram-hero"><img class="ask-ram-avatar" src="assets/ask-ram-avatar.svg" alt="Ask Ram field assistant"><div><span class="ask-ram-status">APPROVED SEEDWORKS PADDY SOP</span><h2>Namaste, I’m Ram.</h2><p>Talk naturally with me about Paddy hybrid seed production.</p></div></section><section class="ask-ram-controls"><label for="askLanguage">Preferred conversation language</label><select id="askLanguage">'+languages.map(x=>'<option '+(askLanguage===x?'selected':'')+'>'+escape(x)+'</option>').join('')+'</select><p class="ask-ram-connection">Type a question or start voice conversation. Your browser will ask for microphone access when you choose voice.</p></section><section class="ask-chat-panel"><div class="ask-chat-heading"><div><h2>Ask Ram · Live conversation</h2><p>Secure connection starts when you send a question. Voice starts only when you choose it.</p></div><span>'+(ramLive.connected?'CONNECTED':ramLive.connecting?'CONNECTING':'NOT CONNECTED')+'</span></div><div class="ask-chat-scope">'+(current?'Selected field: <b>'+escape(current.fieldNo)+' · '+escape(current.village)+'</b>':'No field selected')+' · Ram answers from the approved Paddy SOP knowledge pack, not farmer records.</div><p id="ramLiveStatus" class="ask-ram-connection" role="status">'+(ramLive.connected?'Voice session connected. You can speak now.':ramLive.connecting?'Connecting securely to Gemini Live…':liveSupported?'Ready. Type a question or start a voice conversation.':'Voice needs a browser with microphone and audio support.')+'</p><div class="ask-chat-messages" id="askChatMessages" aria-live="polite">'+transcript+(ramBusy?'<div class="ask-chat-row notice"><small>RAM</small><p>Listening / responding…</p></div>':'')+'</div><div class="ask-chat-suggestions"><small>TRY A QUESTION</small>'+examples.map((x,i)=>'<button type="button" data-chat-example="'+i+'">'+escape(x)+'</button>').join('')+'</div><form class="ask-chat-compose" id="askChatForm"><textarea id="askChatInput" rows="2" placeholder="Type a question to Ram…" maxlength="800" required></textarea><button type="submit" aria-label="Send message" '+(ramBusy?'disabled':'')+'>↑</button></form><button type="button" class="ask-ram-mic ram-live-mic" id="ramVoiceButton" '+(!liveSupported?'disabled':'')+'><span>🎙</span><b>'+(ramLive.connected&&ramLive.voiceConnected?'Stop voice conversation':ramLive.connecting?'Connecting…':'Start voice conversation')+'</b><small>'+(ramLive.connected&&ramLive.voiceConnected?'Tap to end the microphone and live session':ramLive.connecting?'Please wait while the secure session starts':ramLive.connected?'Tap to enable microphone voice':'Real-time microphone input and spoken Gemini response')+'</small></button><p class="ask-chat-local-note">Live audio uses Gemini Live directly. The permanent Gemini API key stays on the Worker; no visitor token is required. Your field record is not attached to the question. Avoid typing personal farmer information.</p></section><section class="ask-ram-boundary"><b>Guidance scope</b><p>Ram answers from the approved SeedWorks Paddy SOP knowledge pack. Confirm field decisions with your Territory Manager; Ram does not replace approved agronomic review.</p></section>';
}

function ramSpeechLanguage(){
  return ({English:'en-IN',Hindi:'hi-IN',Marathi:'mr-IN',Telugu:'te-IN',Kannada:'kn-IN',Tamil:'ta-IN',Gujarati:'gu-IN',Bengali:'bn-IN',Punjabi:'pa-IN',Urdu:'ur-IN',Odia:'or-IN',Malayalam:'ml-IN'})[askLanguage]||'en-IN';
}
function ramLiveSetStatus(message){
  const node=document.getElementById('ramLiveStatus');
  if(node)node.textContent=message;
}
async function ramLivePrepareAudio(){
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass)throw new Error('This browser does not support Web Audio output.');
  if(!ramLive.outputContext||ramLive.outputContext.state==='closed')ramLive.outputContext=new AudioContextClass({sampleRate:24000});
  if(ramLive.outputContext.state==='suspended')await ramLive.outputContext.resume();
  if(ramLive.outputContext.state!=='running')throw new Error('Browser audio output did not enter the running state.');
  return ramLive.outputContext;
}
function ramLiveStop(reason){
  const socket=ramLive.socket;
  ramLive.voiceConnected=false;ramLive.voiceRequested=false;
  ramLive.socket=null;
  ramLive.connected=false;
  ramLive.connecting=false;
  if(ramLive.processor){try{ramLive.processor.disconnect()}catch(_){}ramLive.processor.onaudioprocess=null;ramLive.processor=null;}
  if(ramLive.source){try{ramLive.source.disconnect()}catch(_){}ramLive.source=null;}
  if(ramLive.stream){ramLive.stream.getTracks().forEach(track=>track.stop());ramLive.stream=null;}
  ramLive.playing.forEach(source=>{try{source.stop()}catch(_){}});
  ramLive.playing.clear();
  ramLive.playbackTime=0;
  if(ramLive.outputContext){const context=ramLive.outputContext;ramLive.outputContext=null;context.close().catch(()=>{});}
  if(ramLive.microphoneContext){const context=ramLive.microphoneContext;ramLive.microphoneContext=null;context.close().catch(()=>{});}
  if(socket&&socket.readyState<2){try{socket.close(1000,'User ended Ram voice session')}catch(_){}}
  if(reason)ramLiveSetStatus(reason);
}
function ramLiveEncodePcm(floatSamples,sampleRate){
  const outputLength=Math.max(1,Math.floor(floatSamples.length*16000/sampleRate));
  const bytes=new Uint8Array(outputLength*2);
  const view=new DataView(bytes.buffer);
  const ratio=sampleRate/16000;
  for(let i=0;i<outputLength;i++){
    const position=i*ratio,lower=Math.floor(position),upper=Math.min(lower+1,floatSamples.length-1);
    const fraction=position-lower;
    let sample=floatSamples[lower]+(floatSamples[upper]-floatSamples[lower])*fraction;
    sample=Math.max(-1,Math.min(1,sample));
    view.setInt16(i*2,sample<0?sample*32768:sample*32767,true);
  }
  let binary='';
  for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
  return btoa(binary);
}
async function ramLivePlayAudio(base64){
  if(!base64)return;
  const context=await ramLivePrepareAudio();
  const binary=atob(base64),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const samples=new Int16Array(bytes.buffer,bytes.byteOffset,Math.floor(bytes.byteLength/2));
  if(!samples.length)return;
  const buffer=context.createBuffer(1,samples.length,24000),channel=buffer.getChannelData(0);
  for(let i=0;i<samples.length;i++)channel[i]=samples[i]/32768;
  const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);
  ramLive.playbackTime=Math.max(ramLive.playbackTime,context.currentTime+0.02);
  source.start(ramLive.playbackTime);ramLive.playbackTime+=buffer.duration;
  ramLive.playing.add(source);
  source.onended=()=>{ramLive.playing.delete(source);if(ramLive.playing.size===0&&!ramLive.connected)ramLiveSetStatus('Gemini Live audio playback finished.');};
  ramLive.audioChunks++;ramLive.audioBytes+=bytes.length;
  ramLiveSetStatus('Gemini audio received ('+ramLive.audioChunks+' chunks). Browser audio: '+context.state+'.');
}
async function ramLiveStartMicrophone(){
  const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  if(!ramLive.socket||ramLive.socket.readyState!==WebSocket.OPEN){stream.getTracks().forEach(track=>track.stop());return;}
  ramLive.stream=stream;
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass)throw new Error('This browser does not support microphone audio capture.');
  const context=new AudioContextClass();
  ramLive.microphoneContext=context;
  await context.resume();
  const source=context.createMediaStreamSource(stream);
  const processor=context.createScriptProcessor(4096,1,1);
  ramLive.source=source;ramLive.processor=processor;
  processor.onaudioprocess=event=>{
    if(!ramLive.connected||!ramLive.socket||ramLive.socket.readyState!==WebSocket.OPEN)return;
    const input=event.inputBuffer.getChannelData(0);
    const data=ramLiveEncodePcm(input,context.sampleRate);
    ramLive.socket.send(JSON.stringify({realtimeInput:{audio:{data,mimeType:'audio/pcm;rate=16000'}}}));
  };
  source.connect(processor);
  processor.connect(context.destination);
  ramLiveSetStatus('Connected. Speak naturally; Ram will respond aloud. Tap Stop voice conversation to finish.');
}
async function ramLiveHandleServerMessage(message){
  if(message.setupComplete){
    ramLive.connected=true;ramLive.connecting=false;
    const microphoneReady=ramLive.voiceRequested?ramLiveStartMicrophone():Promise.resolve();
    microphoneReady.then(()=>{
      ramLive.voiceConnected=!!ramLive.voiceRequested;
      ramLiveSetStatus(ramLive.voiceConnected?'Connected. Speak naturally; Ram will respond aloud.':'Ram is connected. Type your next question here.');
      const openingText=ramLive.pendingQuestion;
      ramLive.pendingQuestion=null;
      const prompt=openingText||('Greet me briefly in '+askLanguage+' and invite the user to ask a question about Paddy hybrid seed production. Do not recite SOP facts until asked.');
      ramLive.socket?.send(JSON.stringify({clientContent:{turns:[{role:'user',parts:[{text:prompt}]}],turnComplete:true}}));
      const button=document.getElementById('ramVoiceButton');
      if(button){button.disabled=false;button.querySelector('b').textContent=ramLive.voiceConnected?'Stop voice conversation':'Start voice conversation';button.querySelector('small').textContent=ramLive.voiceConnected?'Tap to end the microphone and live session':'Tap to enable microphone voice';}
      const heading=document.querySelector('.ask-chat-heading>span');if(heading)heading.textContent='CONNECTED';
    }).catch(error=>{
      ramLiveStop('Microphone could not start: '+(error.message||String(error))+' Check microphone permission and try again.');
      const button=document.getElementById('ramVoiceButton');if(button){button.disabled=false;button.querySelector('b').textContent='Start voice conversation';button.querySelector('small').textContent='Tap to retry';}
    });
    return;
  }
  if(message.setupError){
    const detail=message.setupError.message||message.setupError.status||'Gemini rejected the Ram Live setup.';
    askChat.push({role:'system',text:detail});ramLiveStop(detail);fieldScreen();return;
  }
  if(message.error){
    const detail=message.error.message||'Gemini Live returned an error.';
    askChat.push({role:'system',text:detail});ramLiveStop(detail);fieldScreen();return;
  }
  const content=message.serverContent;
  if(!content)return;
  if(content.interrupted){
    ramLive.playing.forEach(source=>{try{source.stop()}catch(_){}});
    ramLive.playing.clear();ramLive.playbackTime=0;
    ramLive.currentAssistantText='';
  }
  if(content.inputTranscription?.text)ramLive.currentUserText+=content.inputTranscription.text;
  if(content.outputTranscription?.text)ramLive.currentAssistantText+=content.outputTranscription.text;
  const parts=content.modelTurn?.parts||[];
  for(const part of parts){
    if(part.text&&!content.outputTranscription?.text)ramLive.currentAssistantText+=part.text;
    const inline=part.inlineData||part.inline_data;
    if(inline?.data)await ramLivePlayAudio(inline.data);
  }
  if(content.turnComplete){
    if(!ramLive.audioChunks&&ramLive.currentAssistantText.trim())ramLiveSetStatus('Ram generated text, but Gemini sent no audio chunks in this turn.');
    if(ramLive.currentUserText.trim())askChat.push({role:'user',text:ramLive.currentUserText.trim()});
    if(ramLive.currentAssistantText.trim())askChat.push({role:'assistant',text:ramLive.currentAssistantText.trim()});
    ramLive.currentUserText='';ramLive.currentAssistantText='';ramBusy=false;
    fieldScreen();
  }
}
async function ramLiveConnect(requestVoice=false){
  if(requestVoice)ramLive.voiceRequested=true;
  if(ramLive.connecting||ramLive.connected){if(requestVoice&&ramLive.connected&&!ramLive.voiceConnected){ramLiveStartMicrophone().then(()=>{ramLive.voiceConnected=true;ramLiveSetStatus('Connected. Speak naturally; Ram will respond aloud.')}).catch(error=>ramLiveSetStatus('Microphone could not start: '+(error.message||String(error))));}return;}
  ramLive.connecting=true;ramLiveSetStatus('Requesting a short-lived Gemini Live token…');
  const button=document.getElementById('ramVoiceButton');
  if(button){button.disabled=true;button.querySelector('b').textContent='Connecting…';}
  try{
    const controller=new AbortController();
    const tokenTimeout=setTimeout(()=>controller.abort(),10000);
    let tokenResponse;
    try{
      tokenResponse=await fetch('https://seed-ram-api-test-v1.raja-vadlamani.workers.dev/live-token',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal});
    }catch(error){
      if(error?.name==='AbortError')throw new Error('Ram Live token request timed out.');
      throw error;
    }finally{clearTimeout(tokenTimeout);}
    const raw=await tokenResponse.text();let tokenData={};
    try{tokenData=raw?JSON.parse(raw):{}}catch(_){throw new Error('The Ram Live service returned an unreadable token response.');}
    if(!tokenResponse.ok||!tokenData.token)throw new Error(tokenData.error||tokenData.detail||('Live token request failed with HTTP '+tokenResponse.status));
    const url='wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token='+encodeURIComponent(tokenData.token);
    const socket=new WebSocket(url);ramLive.socket=socket;
    socket.onopen=()=>{
      if(ramLive.socket!==socket)return;
      socket.send(JSON.stringify({setup:{model:'models/gemini-3.8-live',generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Charon'}}}},inputAudioTranscription:{},outputAudioTranscription:{},sessionResumption:{}}}));
      ramLiveSetStatus('Secure token accepted. Waiting for Gemini Live setup…');
    };
    socket.onmessage=async event=>{
      if(ramLive.socket!==socket)return;
      try{
        let raw=event.data;
        if(raw instanceof Blob)raw=await raw.text();
        else if(raw instanceof ArrayBuffer)raw=new TextDecoder().decode(raw);
        await ramLiveHandleServerMessage(JSON.parse(raw));
      }catch(error){ramLiveStop('Could not process the Gemini Live response: '+(error.message||String(error)));fieldScreen();}
    };
    socket.onerror=()=>{if(ramLive.socket===socket){ramLiveStop('Gemini Live connection error. Check the Worker deployment and try again.');const b=document.getElementById('ramVoiceButton');if(b){b.disabled=false;b.querySelector('b').textContent='Start voice conversation';}}};
    socket.onclose=event=>{
      if(ramLive.socket!==socket)return;
      ramLiveStop(event.reason||('Gemini Live session closed (code '+event.code+').'));
      const b=document.getElementById('ramVoiceButton');if(b){b.disabled=false;b.querySelector('b').textContent='Start voice conversation';b.querySelector('small').textContent='Tap to reconnect';}
      const heading=document.querySelector('.ask-chat-heading>span');if(heading)heading.textContent='LIVE';
    };
  }catch(error){
    ramLiveStop('Could not start Ram voice: '+(error.message||String(error)));
    if(ramLive.pendingQuestion){ramLive.pendingQuestion=null;ramBusy=false;askChat.push({role:'system',text:'Ram could not connect. Check microphone permission and try again.'});fieldScreen();}
    if(button){button.disabled=false;button.querySelector('b').textContent='Start voice conversation';}
  }
}
async function sendRamQuestion(question){
  const value=String(question||'').trim();
  if(!value||ramBusy)return;
  askChat.push({role:'user',text:value});
  ramBusy=true;
  if(ramLive.connected&&ramLive.socket?.readyState===WebSocket.OPEN){
    ramLive.currentUserText='';
    ramLive.socket.send(JSON.stringify({clientContent:{turns:[{role:'user',parts:[{text:value}]}],turnComplete:true}}));
    fieldScreen();
    return;
  }
  ramLive.pendingQuestion=value;
  ramLive.voiceRequested=false;
  ramLive.autoAttemptedForAsk=false;
  fieldScreen();
  ramLivePrepareAudio().then(()=>ramLiveConnect(false)).catch(error=>{ramLiveStop('Could not initialise Ram audio: '+(error.message||String(error)));fieldScreen()});
}
function applySatelliteBoundary(points,plotId,source){
  const clean=points.map(p=>({lon:Number(p.lon??p.lng),lat:Number(p.lat)})).filter(p=>Number.isFinite(p.lon)&&Number.isFinite(p.lat)&&Math.abs(p.lon)<=180&&Math.abs(p.lat)<=90);
  if(clean.length>1&&clean[0].lon===clean[clean.length-1].lon&&clean[0].lat===clean[clean.length-1].lat)clean.pop();
  const unique=new Set(clean.map(p=>p.lon.toFixed(8)+','+p.lat.toFixed(8)));
  if(clean.length<3||unique.size<3)throw new Error('A valid boundary with at least 3 distinct GPS points is required.');
  const lons=clean.map(p=>p.lon),lats=clean.map(p=>p.lat);
  const west=Math.min(...lons),east=Math.max(...lons),south=Math.min(...lats),north=Math.max(...lats);
  if(west===east||south===north)throw new Error('The boundary does not cover a valid geographic area.');
  const ring=clean.map(p=>[p.lon,p.lat]);ring.push([...ring[0]]);
  satelliteRequestGeometry={type:'Polygon',coordinates:[ring]};
  const values={satellitePlotId:String(plotId||'FIELD-BOUNDARY'),satelliteWest:west.toFixed(6),satelliteSouth:south.toFixed(6),satelliteEast:east.toFixed(6),satelliteNorth:north.toFixed(6)};
  Object.entries(values).forEach(([id,value])=>{const input=document.getElementById(id);if(input)input.value=value});
  const note=document.getElementById('satelliteReferenceNote');
  if(note)note.textContent=source+' loaded. The request will include the full polygon plus its bounding box, so pixels outside the field can be excluded by the provider.';
}


async function runCropMonitorSentinel2(){
  const byId=id=>document.getElementById(id);
  const status=byId('cropSatelliteStatus'), output=byId('cropSatelliteResult'), button=byId('runCropSatellite2');
  const endpoint='https://seed-intelligence-eo.raja-vadlamani.workers.dev/api/sentinel2';
  const plotId=(byId('satellitePlotId')?.value||'').trim();
  const west=Number(byId('satelliteWest')?.value), south=Number(byId('satelliteSouth')?.value), east=Number(byId('satelliteEast')?.value), north=Number(byId('satelliteNorth')?.value);
  const fromValue=byId('satelliteFrom')?.value, toValue=byId('satelliteTo')?.value;
  if(!plotId||![west,south,east,north].every(Number.isFinite)||west>=east||south>=north||west < -180||east > 180||south < -90||north > 90||!fromValue||!toValue||fromValue>toValue){
    if(status)status.innerHTML='<div class="control-row"><div><b>Check the request fields</b><small>Enter a plot reference, valid boundary coordinates, and a valid date range.</small></div><span class="pill">Check input</span></div>';
    return;
  }
  const from=new Date(fromValue+'T00:00:00.000Z').toISOString();
  const to=new Date(toValue+'T23:59:59.999Z').toISOString();
  const bbox=[west,south,east,north];
  const centerLat=(south+north)/2;
  const resx=10/(111320*Math.cos(centerLat*Math.PI/180));
  const resy=10/110574;
  const payload={
    input:{bounds:{bbox,...(satelliteRequestGeometry?{geometry:satelliteRequestGeometry}:{}),properties:{crs:'http://www.opengis.net/def/crs/OGC/1.3/CRS84'}},data:[{type:'sentinel-2-l2a',dataFilter:{maxCloudCoverage:20,mosaickingOrder:'leastCC'}}]},
    aggregation:{timeRange:{from,to},aggregationInterval:{of:'P5D'},resx,resy},
    calculations:{default:{statistics:{default:{percentiles:{k:[10,50,90]}}}}},
    acquisition:{plotId,acquisitionId:null,acquisitionDateTime:null,requestedBbox:bbox},
    requestedAt:new Date().toISOString(),clientVersion:'SEED-PRODUCTION-MONITOR-EO-0.2'
  };
  if(button)button.disabled=true;
  if(status)status.innerHTML='<div class="control-row"><div><b>Requesting Sentinel-2 optical statistics</b><small>Using the separate Seed Intelligence Worker. No provider credentials are exposed in the browser.</small></div><span class="pill">Running…</span></div>';
  if(output)output.innerHTML='';
  try{
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload)});
    const raw=await response.text();
    let data;try{data=raw?JSON.parse(raw):{};}catch(_){data={message:raw.slice(0,1200)};}
    if(!response.ok)throw new Error('HTTP '+response.status+(data.error||data.message?': '+(data.error||data.message):''));

    latestSentinel2Response=data;
    // Worker response shape: data.data.data[] -> interval -> outputs -> index -> bands.B0.stats.
    const intervals=data?.data?.data;
    const indexKeys=['ndvi','ndmi','ndre','evi','savi'];
    const indexLabels={ndvi:'NDVI',ndmi:'NDMI',ndre:'NDRE',evi:'EVI',savi:'SAVI'};
    const fmt=value=>Number.isFinite(Number(value))?Number(value).toFixed(4):'—';
    const dateLabel=value=>{
      if(!value)return 'Date unavailable';
      const d=new Date(value);
      return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
    };
    const cards=Array.isArray(intervals)?intervals.map((item,i)=>{
      const interval=item?.interval||{};
      const outputs=item?.outputs||{};
      const allStats=indexKeys.map(key=>{
        const stats=outputs?.[key]?.bands?.B0?.stats||outputs?.[key]?.bands?.B0||{};
        return {key,label:indexLabels[key],stats};
      });
      const available=allStats.filter(x=>Number.isFinite(Number(x.stats?.mean)));
      const sampleCount=Math.max(0,...allStats.map(x=>Number(x.stats?.sampleCount)||0));
      const noDataCount=Math.max(0,...allStats.map(x=>Number(x.stats?.noDataCount)||0));
      const rows=allStats.map(({key,label,stats})=>'<tr><td><b>'+label+'</b></td><td>'+fmt(stats?.mean)+'</td><td>'+fmt(stats?.['50.0']??stats?.percentiles?.['50.0']??stats?.median)+'</td><td>'+fmt(stats?.min)+'</td><td>'+fmt(stats?.max)+'</td><td>'+((Number.isFinite(Number(stats?.sampleCount)))?Number(stats.sampleCount):'—')+'</td><td>'+((Number.isFinite(Number(stats?.noDataCount)))?Number(stats.noDataCount):'—')+'</td></tr>').join('');
      const previousOutputs=i>0?(intervals[i-1]?.outputs||{}):null;
      return '<section class="panel satellite-interval-card"><div class="panel-head"><div><p class="eyebrow">OBSERVATION INTERVAL '+(i+1)+'</p><h3>'+escape(dateLabel(interval.from))+' – '+escape(dateLabel(interval.to))+'</h3><p class="muted">'+available.length+' of 5 indices have mean values · '+sampleCount+' sampled pixels · '+noDataCount+' no-data pixels per index</p></div><span class="status-chip '+(available.length===5?'ok':'planned')+'">'+available.length+'/5 indices</span></div><div class="table-wrap"><table><thead><tr><th>Index</th><th>Mean</th><th>Median (P50)</th><th>Min</th><th>Max</th><th>Sample pixels</th><th>No-data</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+opticalAdvisory(outputs,previousOutputs)+'</section>';
    }).join(''):'';
    const validIntervals=Array.isArray(intervals)?intervals.length:0;
    const indexSet=new Set();
    if(Array.isArray(intervals))intervals.forEach(item=>indexKeys.forEach(key=>{
      const stats=item?.outputs?.[key]?.bands?.B0?.stats||{};
      if(Number.isFinite(Number(stats.mean)))indexSet.add(key);
    }));
    const complete=validIntervals>0&&indexKeys.every(key=>indexSet.has(key));
    if(status)status.innerHTML='<div class="control-row"><div><b>Sentinel-2 Worker returned status OK</b><small>HTTP '+response.status+' · '+escape(data.provider||'provider not supplied')+' · '+escape(data.timestamp||data.measuredAt||new Date().toISOString())+'</small></div><span class="pill">'+(complete?'Indices parsed':'Response received')+'</span></div>';
    if(output){
      const geometryCount=data?.data?.geometryPixelCount??data?.geometryPixelCount;
      output.innerHTML='<section class="satellite-result-summary"><div class="satellite-result-title"><div><p class="eyebrow">SENTINEL-2 · OPTICAL OBSERVATIONS</p><h3>Vegetation-index statistics</h3><p>Requested field reference: '+escape(plotId)+'</p></div><span class="status-chip '+(complete?'ok':'planned')+'">'+(complete?'Indices available':'Review response')+'</span></div><p class="satellite-readonly-note">Read-only provider statistics; not a crop-health diagnosis. Compare like-for-like dates and review crop stage, cloud masking and field conditions before agronomic decisions.</p><div class="satellite-summary-metrics"><div><small>Intervals returned</small><b>'+validIntervals+'</b></div><div><small>Indices found</small><b>'+indexSet.size+' / 5</b></div><div><small>Geometry pixels</small><b>'+(geometryCount??'—')+'</b></div></div>'+(validIntervals?opticalTrendSummary(intervals):'')+(validIntervals?cards:'<p class="satellite-readonly-note">The Worker responded successfully, but no interval statistics were found in the expected response field. Open the raw JSON for diagnosis.</p>')+'<details><summary>View full provider response (JSON)</summary><pre class="satellite-json">'+escape(JSON.stringify(data,null,2))+'</pre></details></section>';
    }
      renderCombinedSatelliteComparison();
  }catch(error){
    if(status)status.innerHTML='<div class="control-row"><div><b>Sentinel-2 request failed</b><small>'+escape(error?.message||'Unknown error')+'</small></div><span class="pill">Error</span></div>';
    if(output)output.innerHTML='<p class="satellite-readonly-note">No production observation was saved. Review the error and Worker logs before retrying.</p>';
  }finally{if(button)button.disabled=false;}
}


async function runCropMonitorSentinel2Image(){
  const byId=id=>document.getElementById(id);
  const status=byId('cropSatelliteStatus'), output=byId('cropSatelliteResult'), button=byId('runCropSatelliteImage');
  const endpoint='https://seed-intelligence-imagery.raja-vadlamani.workers.dev/api/sentinel2/image';
  const west=Number(byId('satelliteWest')?.value), south=Number(byId('satelliteSouth')?.value), east=Number(byId('satelliteEast')?.value), north=Number(byId('satelliteNorth')?.value);
  const fromValue=byId('satelliteFrom')?.value, toValue=byId('satelliteTo')?.value;
  const mode=byId('satelliteImageMode')?.value||'true-colour';
  if(![west,south,east,north].every(Number.isFinite)||west>=east||south>=north||west < -180||east > 180||south < -90||north > 90||!fromValue||!toValue||fromValue>toValue){
    if(status)status.innerHTML='<div class="control-row"><div><b>Check the imagery request fields</b><small>Enter valid boundary coordinates and a valid date range first.</small></div><span class="pill">Check input</span></div>';
    return;
  }
  if(button)button.disabled=true;
  if(status)status.innerHTML='<div class="control-row"><div><b>Requesting Sentinel-2 satellite image</b><small>Using the new imagery Worker. This test does not save a production observation.</small></div><span class="pill">Loading…</span></div>';
  try{
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Accept':'image/png, application/json'},body:JSON.stringify({bbox:[west,south,east,north],from:fromValue,to:toValue,mode,width:768,height:768})});
    const type=response.headers.get('content-type')||'';
    if(!response.ok||!type.includes('image/')){
      const raw=await response.text();
      let details=raw;try{const parsed=JSON.parse(raw);details=parsed.details||parsed.error||raw;}catch(_){}
      throw new Error('HTTP '+response.status+': '+String(details).slice(0,900));
    }
    const blob=await response.blob();
    const imageUrl=URL.createObjectURL(blob);
    const oldImage=byId('sentinel2ImageryPreview');
    if(oldImage?.dataset.objectUrl)URL.revokeObjectURL(oldImage.dataset.objectUrl);
    if(status)status.innerHTML='<div class="control-row"><div><b>Satellite image received successfully</b><small>'+escape(mode)+' · '+escape(fromValue)+' to '+escape(toValue)+' · '+Math.round(blob.size/1024)+' KB · Copernicus Sentinel-2</small></div><span class="pill">Image received</span></div>';
    if(output){
      const previous=byId('sentinel2ImageryCard');
      if(previous)previous.remove();
      const card=document.createElement('section');
      card.id='sentinel2ImageryCard';
      card.className='panel satellite-interval-card';
      const heading=document.createElement('h3');
      heading.textContent='Sentinel-2 satellite imagery · '+mode;
      const note=document.createElement('p');
      note.className='satellite-readonly-note';
      note.textContent='Copernicus imagery for the selected bounding box and date range. This is a visual reference, not a crop-health diagnosis.';
      const image=document.createElement('img');
      image.id='sentinel2ImageryPreview';
      image.alt='Copernicus Sentinel-2 '+mode+' satellite image';
      image.src=imageUrl;
      image.dataset.objectUrl=imageUrl;
      image.style.width='100%';
      image.style.maxWidth='768px';
      image.style.height='auto';
      image.style.display='block';
      image.style.borderRadius='12px';
      image.style.marginTop='12px';
      card.append(heading,note,image);
      output.prepend(card);
    }
  }catch(error){
    if(status)status.innerHTML='<div class="control-row"><div><b>Sentinel-2 imagery request failed</b><small>'+escape(error?.message||'Unknown error')+'</small></div><span class="pill">Error</span></div>';
  }finally{if(button)button.disabled=false;}
}

/* Combined read-only Sentinel-1 + Sentinel-2 comparison. */
let latestSentinel1Response=null;
let latestSentinel2Response=null;
function renderCombinedSatelliteComparison(){
  const output=document.getElementById('cropSatelliteResult');
  if(!output||(!latestSentinel1Response&&!latestSentinel2Response))return;
  const getSeries=(response,kind)=>{const intervals=response?.data?.data;if(!Array.isArray(intervals))return [];return intervals.map(item=>{const rawDate=item?.interval?.from;const date=rawDate?new Date(rawDate):null;let value=null,extra=null;if(kind==='optical'){value=Number(item?.outputs?.ndvi?.bands?.B0?.stats?.mean)}else{const bands=item?.outputs?.backscatter?.bands||{};value=Number(bands.B0?.stats?.mean);extra=Number(bands.B1?.stats?.mean)}return {date:date&&!Number.isNaN(date.getTime())?date:null,label:date&&!Number.isNaN(date.getTime())?date.toISOString().slice(0,10):'Date unavailable',value:Number.isFinite(value)?value:null,extra:Number.isFinite(extra)?extra:null}}).filter(x=>x.date&&x.value!==null)};
  const s1=getSeries(latestSentinel1Response,'radar').sort((a,b)=>a.date-b.date),s2=getSeries(latestSentinel2Response,'optical').sort((a,b)=>a.date-b.date);
  const fmt=x=>Number.isFinite(x)?x.toFixed(4):'—';
  const chart=(series,withSecond,title,labels)=>{if(!series.length)return '<p class="satellite-readonly-note">No usable '+title+' observations are available yet. Run that connector first.</p>';const values=series.map(x=>x.value).concat(withSecond?series.map(x=>x.extra).filter(Number.isFinite):[]);const min=Math.min(...values),max=Math.max(...values),span=max-min||1;const xAt=i=>series.length===1?400:42+i*716/(series.length-1),yAt=v=>140-(v-min)/span*100;const line=arr=>arr.map((v,i)=>(i?'L':'M')+xAt(i).toFixed(1)+','+yAt(v).toFixed(1)).join(' ');const a='<path d="'+line(series.map(x=>x.value))+'" class="combined-line-a" fill="none" stroke-width="3"/>'+series.map((x,i)=>'<circle cx="'+xAt(i)+'" cy="'+yAt(x.value)+'" r="3.5" class="combined-dot-a"><title>'+x.label+': '+fmt(x.value)+'</title></circle>').join('');const b=withSecond?'<path d="'+line(series.map(x=>x.extra))+'" class="combined-line-b" fill="none" stroke-width="3"/>'+series.map((x,i)=>'<circle cx="'+xAt(i)+'" cy="'+yAt(x.extra)+'" r="3.5" class="combined-dot-b"><title>'+x.label+': '+fmt(x.extra)+'</title></circle>').join(''):'';return '<div class="combined-chart"><h4>'+title+'</h4><svg viewBox="0 0 800 190" role="img" aria-label="'+title+' time series"><line x1="42" y1="140" x2="758" y2="140" class="combined-axis"/><line x1="42" y1="40" x2="758" y2="40" class="combined-grid"/>'+a+b+series.map((x,i)=>(i===0||i===series.length-1||i===Math.floor(series.length/2))?'<text x="'+xAt(i)+'" y="165" text-anchor="middle">'+x.label.slice(5)+'</text>':'').join('')+'</svg><div class="combined-legend">'+labels.map(l=>'<span>'+l+'</span>').join('')+'</div><p class="muted">First: '+series[0].label+' · Last: '+series[series.length-1].label+' · '+series.length+' observations</p></div>'};
  const both=!!(latestSentinel1Response&&latestSentinel2Response);
  const nearest=s1.length&&s2.length?s2.map(o=>{const n=s1.reduce((best,r)=>Math.abs(r.date-o.date)<Math.abs(best.date-o.date)?r:best,s1[0]);return {days:Math.round(Math.abs(n.date-o.date)/86400000)}}).filter(x=>x.days<=6):[];
  output.insertAdjacentHTML('beforeend','<section class="satellite-trend-summary combined-satellite-panel"><p class="eyebrow">COMBINED SATELLITE VALIDATION · VIEW ONLY</p><h3>Radar + optical timeline</h3><p>'+(both?'Both live connector responses are available.':'Run both Sentinel-1 and Sentinel-2 to complete the comparison.')+' Charts use provider-reported values; they do not diagnose crop condition or save a production observation.</p>'+chart(s2,false,'Sentinel-2 · NDVI mean',['NDVI'])+chart(s1,true,'Sentinel-1 · VV and VH mean',['VV mean','VH mean'])+'<div class="combined-date-check"><b>Date alignment</b><p>'+(both?nearest.length+' optical observations have a radar observation within 6 days. Use date-near pairs cautiously; these are not necessarily same-day acquisitions.':'Date-near pairs will be assessed after both connectors have run.')+'</p></div><div class="satellite-advisory-next"><b>Crop identification: what is possible?</b><p>Multi-date satellite patterns can support crop-type classification, including rice, but these bands and indices alone cannot reliably confirm crop identity. A credible classifier needs multi-date Sentinel-1 and Sentinel-2 features, crop-calendar/location context, and ground-truth labels from known fields. “Rice” remains the selected record’s declared crop, not a satellite-verified identification.</p></div><p class="muted">View-only diagnostic. No data saved to Supabase; no production observation or farmer attribution is created.</p></section>');
}

async function runCropMonitorSatellite(){
  const byId=id=>document.getElementById(id);
  const status=byId('cropSatelliteStatus'), output=byId('cropSatelliteResult'), button=byId('runCropSatellite');
  const endpoint='https://anvora-eo-connector.raja-vadlamani.workers.dev/api/sentinel1';
  const plotId=(byId('satellitePlotId')?.value||'').trim();
  const west=Number(byId('satelliteWest')?.value), south=Number(byId('satelliteSouth')?.value), east=Number(byId('satelliteEast')?.value), north=Number(byId('satelliteNorth')?.value);
  const fromValue=byId('satelliteFrom')?.value, toValue=byId('satelliteTo')?.value;
  if(!plotId||![west,south,east,north].every(Number.isFinite)||west>=east||south>=north||west < -180||east > 180||south < -90||north > 90||!fromValue||!toValue||fromValue>toValue){
    if(status)status.innerHTML='<div class="control-row"><div><b>Check the request fields</b><small>Enter a plot reference, valid bounding box, and a start/end date range.</small></div><span class="pill">Needs input</span></div>';
    return;
  }
  const bbox=[west,south,east,north];
  const from=new Date(fromValue+'T00:00:00.000Z').toISOString();
  const to=new Date(toValue+'T23:59:59.999Z').toISOString();
  const evalscript='//VERSION=3\nfunction setup(){return {input:[{bands:["VV","VH","dataMask"]}],output:[{id:"backscatter",bands:2,sampleType:"FLOAT32"},{id:"dataMask",bands:1}]};}\nfunction evaluatePixel(samples){return {backscatter:[samples.VV,samples.VH],dataMask:[samples.dataMask]};}';
  // Sentinel Hub resolution units must match the bounds CRS. The bbox is in degrees (CRS84), so convert target metres to approximate degrees at the field latitude.
  const centerLat=(south+north)/2;
  const resx=10/(111320*Math.cos(centerLat*Math.PI/180));
  const resy=10/110574;
  const requestBody={
    input:{bounds:{bbox,...(satelliteRequestGeometry?{geometry:satelliteRequestGeometry}:{}),properties:{crs:'http://www.opengis.net/def/crs/OGC/1.3/CRS84'}},data:[{type:'sentinel-1-grd',dataFilter:{},processing:{orthorectify:true,backCoeff:'GAMMA0_TERRAIN'}}]},
    aggregation:{timeRange:{from,to},aggregationInterval:{of:'P1D'},evalscript,resx,resy},
    calculations:{default:{statistics:{default:{percentiles:{k:[10,50,90]}}}}}
  };
  const payload={operation:'sentinel1-statistics',...requestBody,providerEndpoint:'https://sh.dataspace.copernicus.eu/statistics/v1',acquisition:{plotId,acquisitionId:null,acquisitionDateTime:null,requestedBbox:bbox},requestedAt:new Date().toISOString(),clientVersion:'SEED-PRODUCTION-MONITOR-EO-0.1'};
  if(button)button.disabled=true;
  if(status)status.innerHTML='<div class="control-row"><div><b>Requesting Sentinel-1 statistics</b><small>Sending the request to the existing ANVORA Worker; no provider credentials are exposed in the browser.</small></div><span class="pill">Running…</span></div>';
  if(output)output.innerHTML='';
  try{
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload)});
    const raw=await response.text();
    let data;try{data=raw?JSON.parse(raw):{};}catch(_){data={message:raw.slice(0,1200)};}
    if(!response.ok)throw new Error('HTTP '+response.status+(data.error||data.message?': '+(data.error||data.message):''));
    latestSentinel1Response=data;
    const simulated=!!(data.simulated||data.status==='SIMULATED');
    const confirmed=data.status==='OK'&&!simulated;
    if(status)status.innerHTML='<div class="control-row"><div><b>'+(confirmed?'Worker returned status OK':'Worker responded; inspect status')+'</b><small>HTTP '+response.status+' · '+escape(data.provider||'provider not stated')+' · '+escape(data.measuredAt||data.requestedAt||'timestamp not supplied')+'</small></div><span class="pill">'+(confirmed?'Response OK':(simulated?'Simulation':'Review'))+'</span></div>';
    if(output){
      const intervals=Array.isArray(data.data?.data)?data.data.data:[];
      const fmt=(value,digits=4)=>Number.isFinite(Number(value))?Number(value).toFixed(digits):'—';
      const dateLabel=value=>value?new Date(value).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'Date not supplied';
      const statCard=(label,value,detail='')=>'<div class="satellite-stat-card"><small>'+escape(label)+'</small><b>'+escape(value)+'</b>'+(detail?'<span>'+escape(detail)+'</span>':'')+'</div>';
      const intervalHtml=intervals.map((item,index)=>{
        const outputs=item.outputs?.backscatter?.bands||{};
        const vv=outputs.B0?.stats||{},vh=outputs.B1?.stats||{};
        const intervalStart=item.interval?.from,intervalEnd=item.interval?.to;
        const sampleCount=Number(vv.sampleCount??vh.sampleCount),noData=Number(vv.noDataCount??vh.noDataCount);
        const previousItem=index>0?intervals[index-1]:null;
        const previousBands=previousItem?.outputs?.backscatter?.bands||{};
        const previousVv=Number(previousBands.B0?.stats?.mean),previousVh=Number(previousBands.B1?.stats?.mean);
        return '<article class="satellite-interval-card"><div class="satellite-interval-head"><b>Observation interval '+(index+1)+'</b><span>'+escape(dateLabel(intervalStart))+'</span></div><div class="satellite-band-grid">'+
          '<div><small>VV backscatter · mean</small><b>'+fmt(vv.mean)+'</b><span>Median '+fmt(vv.percentiles?.['50.0'])+'</span></div>'+
          '<div><small>VH backscatter · mean</small><b>'+fmt(vh.mean)+'</b><span>Median '+fmt(vh.percentiles?.['50.0'])+'</span></div></div>'+
          '<p class="satellite-interval-meta">'+escape(intervalStart?new Date(intervalStart).toISOString().slice(0,10):'Start unknown')+' to '+escape(intervalEnd?new Date(intervalEnd).toISOString().slice(0,10):'end unknown')+' · '+(Number.isFinite(sampleCount)?sampleCount+' sampled pixels':'pixel count not supplied')+(Number.isFinite(noData)?' · '+noData+' no-data pixels':'')+'</p>'+radarAdvisory(Number(vv.mean),Number(vh.mean),previousVv,previousVh)+'</article>';
      }).join('');
      const pixelCount=Number(data.data?.geometryPixelCount);
      output.innerHTML='<section class="satellite-result-summary"><div class="satellite-result-title"><div><p class="eyebrow">SENTINEL-1 · PROVIDER RESPONSE</p><h3>Backscatter results</h3><p>Requested field reference: '+escape(plotId)+'</p></div><span class="status-chip '+(confirmed?'planned':'warning')+'">'+(confirmed?'Provider OK':'Review response')+'</span></div>'+
        '<div class="satellite-stat-grid">'+statCard('Provider',data.provider||'Not supplied')+statCard('Intervals returned',String(intervals.length),fromValue+' to '+toValue)+statCard('Geometry pixel count',Number.isFinite(pixelCount)?String(pixelCount):'Not supplied','Provider-reported count')+statCard('Response time',Number.isFinite(Number(data.elapsedMs))?data.elapsedMs+' ms':'Not supplied')+'</div>'+
        (intervalHtml?'<h4 class="satellite-results-subhead">Available observation intervals</h4>'+intervalHtml:'<p class="satellite-readonly-note">The provider returned status OK but no interval statistics were found in the expected response structure.</p>')+
        '<div class="satellite-readonly-note"><b>Interpretation limits</b><p>VV and VH are Sentinel-1 radar backscatter statistics, not NDVI and not a direct measurement of crop health or soil moisture. Values shown here are in the provider response’s numeric scale; they have not been converted to decibels or calibrated into crop-specific thresholds. The request returned '+intervals.length+' interval(s), which may be fewer than the days in the requested date range because imagery availability varies.</p><p>This test is not saved to Supabase or verified against a UUID-backed production field record. Provider response plotId: '+escape(data.plotId??'not returned')+' · acquisitionId: '+escape(data.acquisitionId??'not returned')+'.</p></div>'+
        '<details class="satellite-raw-response"><summary>View full provider response (JSON)</summary><pre style="white-space:pre-wrap;overflow:auto;max-height:360px;background:#f6f8f6;padding:12px;border-radius:10px;border:1px solid #dce5df">'+escape(JSON.stringify(data,null,2))+'</pre></details></section>';
    }
      renderCombinedSatelliteComparison();
  }catch(error){
    if(status)status.innerHTML='<div class="control-row"><div><b>Satellite request did not complete</b><small>'+escape(error&&error.message?error.message:String(error))+' · Check Worker deployment, CORS, request validation and Copernicus response.</small></div><span class="pill">Unavailable</span></div>';
  }finally{if(button)button.disabled=false;}
}

function fieldScreen(){
  if(fieldTab!=='ask'){if(ramLive.connected||ramLive.connecting)ramLiveStop('Voice session ended because you left Ask Ram.');ramLive.pendingQuestion=null;ramBusy=false;ramLive.autoAttemptedForAsk=false;}
  fieldMode=true;document.body.classList.add('field-mode');const list=records.filter(r=>r.officer===selectedOfficer);manager.classList.add('hidden');field.classList.remove('hidden');
  if(!fieldSignedIn){
    const otp=fieldAuthStep==='otp';
    field.innerHTML=`<div class="field-brand-band"><a href="#" class="field-brand-lockup" aria-label="Sage Harvest"><img src="assets/sage-harvest-logo.svg" alt="Sage Harvest"></a><div class="field-brand-meta"><b>SEED PRODUCTION MONITOR</b><span>FIELD OPERATIONS · KHARIF 2026</span></div><span class="field-demo-pill">DEMO</span></div><div class="field-onboarding"><div class="welcome-mark">✳</div><p class="eyebrow">${otp?'PHONE VERIFICATION':'WELCOME TO SAGEHARVEST'}</p><h1>${otp?'Verify your number':'Field work, made simple.'}</h1><p class="welcome-copy">${otp?'Enter the six-digit demo code to continue.':'Sign in to see your assigned farmers, select a field and record one inspection at a time.'}</p><form id="fieldAuthForm" class="auth-card">${otp?`<label for="demoOtp">One-time passcode</label><input id="demoOtp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code" required><small>Prototype demo code: <b>123456</b></small><button class="primary" type="submit">Verify and open app <span>→</span></button><button class="text-button auth-back" type="button" id="authBack">Change mobile number</button>`:`<label for="fieldMobile">Mobile number</label><div class="mobile-entry"><span>+91</span><input id="fieldMobile" type="tel" inputmode="tel" autocomplete="tel" value="${escape(fieldMobile)}" placeholder="Enter mobile number" minlength="10" maxlength="15" required></div><button class="primary" type="submit">Continue <span>→</span></button><small>Phone sign-in is a demo only. No verification message will be sent.</small>`}</form><div class="ask-ram-welcome"><img src="assets/ask-ram-avatar.svg" alt="Illustrated Ask Ram field assistant"><div><b>Ask Ram · Voice & chat support</b><small>Ask Ram voice and chat connects to the approved Paddy SOP service.</small></div><em>AVAILABLE</em></div><div class="auth-trust">🔒 Company beta · shared records</div></div><div class="field-brand-footer"><span>DEVELOPED BY</span><b>SAGE HARVEST</b><i>Seed Production Monitor</i></div>`;
    applyFieldCompanyBranding();field.querySelector('#fieldAuthForm').onsubmit=e=>{e.preventDefault();if(!otp){fieldMobile=field.querySelector('#fieldMobile').value.trim();fieldAuthStep='otp';fieldScreen()}else if(field.querySelector('#demoOtp').value==='123456'){fieldSignedIn=true;fieldAuthStep='welcome';fieldTab='today';fieldScreen()}else notify('For this demo, enter 123456.')};field.querySelector('#authBack')?.addEventListener('click',()=>{fieldAuthStep='welcome';fieldScreen()});return;
  }
  let current=list.find(r=>r.id===selectedFieldId)||null;const allStagesComplete=!!current&&STAGES.every((_,i)=>current.completedStages?.includes(i+1));
  const options=list.map(r=>`<option value="${r.id}" ${current?.id===r.id?'selected':''}>${escape(r.name)} · ${escape(r.fieldNo)} · ${escape(r.village)}</option>`).join('');
  const chooser=`<section class="field-picker"><div class="picker-title"><span class="picker-icon">⌖</span><div><small>YOUR ASSIGNED FIELDS</small><b>Which farmer are you visiting?</b></div></div><label for="assignedField">Farmer / seasonal field number</label><select id="assignedField" ${list.length?'':'disabled'}><option value="">Select farmer or field</option>${options}</select><button class="nearby-button" type="button" id="findNearby">◎ Find the nearest assigned field</button><small class="location-hint">Uses saved field boundary locations when available. You can always choose from your assignments.</small>${nearbyMessage?`<p class="nearby-message">${escape(nearbyMessage)}</p>`:''}</section>`;
  const oneField=current?`<article class="selected-field-card ${current.status==='Follow-up'?'urgent':''}"><div class="selected-field-top"><span class="field-kicker">CURRENT FIELD</span>${badge(current.status)}</div><h2>${escape(current.name)}</h2><p>${escape(current.village)} · ${escape(current.district)} · ${escape(current.state)}</p><p>Contact number · ${escape(current.mobile||'Not provided')}</p><div class="field-crop-line">${escape(current.crop)} <span>·</span> ${escape(current.hybrid)} <span>·</span> Kharif 2026</div><div class="field-id-grid"><div><small>SEASON FIELD NO.</small><b>${escape(current.fieldNo)}</b></div><div><small>SAP LOT</small><b class="${current.sapLot?'':'lot-pending'}">${current.sapLot?escape(current.sapLot):'Awaiting SAP'}</b></div></div><div class="field-card-divider"></div><div class="field-card-actions"><button class="outline" data-gps="${current.id}">⌖ Capture field area</button><button class="primary" data-open-journey>Inspection stages <span>→</span></button></div>${current.qualityFlags?.length?`<div class="quality-alert"><b>Quality review needed</b>${current.qualityFlags.map(x=>`<div>${escape(x)}</div>`).join('')}</div>`:''}</article>`:'<div class="empty-state">No company records are available for this officer yet.</div>';
  const askRamLauncher='';
  const journey=`<section class='inspection-journey'><div class='journey-summary'><div><b>${current?.completedStages?.length||0}<span> / 6</span></b><small>reports completed</small></div><p>${current?'Tap any report to preview its fields and choices. Locked stages remain read-only.':'Choose any report below to read its fields and choices. Select a farmer to edit or save a report.'}</p></div><div class='stage-tabs' role='group' aria-label='Inspection stages'>${STAGES.map((name,i)=>{const n=i+1,complete=!!current&&current.completedStages?.includes(n),locked=!current||(n>1&&!current.completedStages?.includes(n-1)),status=complete?'Completed':!current?'Preview only · select a farmer to edit':locked?'Preview · entry locked':n===1?'Ready to begin':'Ready to open';return `<button type='button' class='stage-tab ${complete?'complete':locked?'locked':'ready'}' data-stage-select='${n}' data-locked='${locked?'true':'false'}' aria-label='${escape(name)} · ${escape(status)}' title='${escape(status)}'><span class='stage-tab-number'>${complete?'✓':locked?'◉':String(n).padStart(2,'0')}</span><span class='stage-tab-copy'><b>${escape(name)}</b><small>${escape(status)}</small></span><span class='stage-tab-arrow'>›</span></button>`}).join('')}</div><p class='journey-note'>${current?'Review all six reports here. Complete reports in sequence to unlock entry.':'All six reports are available in preview mode. Select a farmer before entering or saving report data.'}</p>${allStagesComplete?'<button type="button" class="primary summary-open-button" data-open-summary>View final field summary →</button>':''}</section>`;
  let content='';
  if(fieldTab==='today')content=`<div class="today-welcome"><div><p class="eyebrow">FIELD OFFICER WORKSPACE</p><h1>Good day, ${escape(fieldOfficerDisplayName())}.</h1><p>Your assigned work for Kharif 2026.</p></div><div class="today-count"><b>${list.length}</b><small>assigned fields</small></div></div><div class="field-summary"><div><strong>${list.length}</strong><small>Assigned fields</small></div><div><strong>${list.filter(r=>r.status!=='On track').length}</strong><small>Due / follow-up</small></div><div><strong>${list.filter(r=>r.sapLot).length}</strong><small>SAP lots ready</small></div></div>${askRamLauncher}${chooser}${current?oneField:''}`;
  else if(fieldTab==='fields')content=`<div class="mobile-page-heading"><p class="eyebrow">FIELD DIRECTORY</p><h1>My assigned fields</h1><p>Choose one farmer and lot to work on.</p></div>${chooser}${current?oneField:''}`;
  else if(fieldTab==='inspections')content=`<div class="mobile-page-heading"><p class="eyebrow">INSPECTION WORK · APPROX. 150-DAY CROP SEASON</p><h1>${current?'Your inspection journey':'Inspection reports'}</h1><p>${current?`Six reports for ${escape(current.fieldNo)} · ${escape(current.name)}. Preview every stage; select an available stage to enter it.`:'Browse the six inspection reports and their fields and choices. Select a farmer above to enter or save data.'}</p></div>${chooser}${journey}`;
  else if(fieldTab==='satellite')content=`<div class="mobile-page-heading"><p class="eyebrow">FIELD VALIDATION · SENTINEL-1 & SENTINEL-2</p><h1>Satellite observations</h1><p>Live Sentinel-1 radar and Sentinel-2 optical observations for the selected field.</p></div>${current?`<section class="selected-field-card"><div class="selected-field-top"><span class="field-kicker">SELECTED FIELD</span><span class="status-chip planned">VIEW ONLY</span></div><h2>${escape(current.name)}</h2><p>${escape(current.village)} · ${escape(current.district)}</p><div class="field-crop-line">${escape(current.crop)} · ${escape(current.hybrid)} · Kharif 2026</div><div class="field-id-grid"><div><small>SEASON FIELD NO.</small><b>${escape(current.fieldNo)}</b></div><div><small>SAP LOT</small><b class="lot-pending">${current.sapLot?escape(current.sapLot):'Awaiting SAP'}</b></div></div></section><section class="panel satellite-connector-panel"><div class="panel-head"><div><p class="eyebrow">COPERNICUS SATELLITE CONNECTORS</p><h2>Sentinel-1 and Sentinel-2 live connectors</h2><p class="muted">Sentinel-1 uses the existing ANVORA Worker. Sentinel-2 uses the separate Seed Intelligence Worker. Credentials remain server-side.</p></div><span class="status-chip planned">LIVE DATA</span></div><p class="satellite-readonly-note">Provide a field boundary using a KML file or the GPS walk already recorded for this field in the mobile app. The current Worker request uses the boundary’s bounding box; recorded acres alone cannot locate a field. Results are read only and are not saved as inspection data.</p><div class="satellite-boundary-inputs"><label class="satellite-file-label">Upload field boundary (.kml)<input id="satelliteKmlFile" type="file" accept=".kml,application/vnd.google-earth.kml+xml,application/xml,text/xml"></label><button type="button" class="outline" id="useCurrentGpsBoundary">Use this field’s captured GPS boundary</button><small id="satelliteBoundaryStatus" class="muted">No boundary loaded yet.</small></div><form id="cropSatelliteForm" class="satellite-request-form"><div class="satellite-coordinate-grid"><input id="satellitePlotId" type="hidden" value="">
<input id="satelliteWest" type="hidden" value="">
<input id="satelliteSouth" type="hidden" value="">
<input id="satelliteEast" type="hidden" value="">
<input id="satelliteNorth" type="hidden" value="">
<label>From date<input id="satelliteFrom" type="date" required></label>
<label>To date<input id="satelliteTo" type="date" required></label></div><div class="hero-actions"><button class="primary" id="runCropSatellite" type="submit" disabled>Run Sentinel-1 observation →</button><button class="outline" id="runCropSatellite2" type="button" disabled>Run Sentinel-2 indices →</button><label class="satellite-image-mode-label">Image view<select id="satelliteImageMode"><option value="true-colour">True colour</option><option value="false-colour">False colour (vegetation)</option><option value="ndvi">NDVI visualisation</option></select></label><button class="outline" id="runCropSatelliteImage" type="button" disabled>View Sentinel-2 imagery →</button></div><p id="satelliteReferenceNote" class="muted tiny">Load the selected field GPS boundary or upload a KML to run the live connectors.</p></form><div id="cropSatelliteStatus" class="control-list" aria-live="polite" style="margin-top:14px"><div class="control-row"><div><b>Ready to connect</b><small>The request will be sent to the existing Worker endpoint.</small></div><span class="pill">Ready</span></div></div><div id="cropSatelliteResult" style="margin-top:12px"></div></section>`:chooser}<section class="panel"><h2>What this report will contain</h2><ul class="satellite-list"><li>Provider response status and available observation intervals</li><li>Sentinel-1 VV and VH radar backscatter statistics</li><li>Sentinel-2 NDVI, NDMI, NDRE, EVI and SAVI indices, when returned by the provider</li><li>Provider-reported pixel counts and no-data counts</li><li>Full response details for technical review</li><li>Human interpretation required before agronomic decisions</li></ul></section>`;
  else if(fieldTab==='ask')content=askRamScreen(current);
  else if(fieldTab==='summary')content=current&&allStagesComplete?fieldSummaryScreen(current):`<div class="mobile-page-heading"><p class="eyebrow">FINAL FIELD REPORT</p><h1>Summary not ready</h1><p>Complete all six inspection reports to open the final field summary.</p></div><button type="button" class="outline" data-bottom="inspections">Back to inspections</button>`;
  else content=`<div class="mobile-page-heading"><p class="eyebrow">PREFERENCES</p><h1>More</h1><p>App information and beta controls.</p></div><button class="satellite-more-card" type="button" data-open-satellite><span class="satellite-more-icon">◉</span><span><b>Satellite validation report</b><small>View-only field observations and validation status</small></span><strong>→</strong></button><section class="settings-card"><div><small>SIGNED IN AS</small><b>${escape(fieldMobile||'Demo field officer')}</b></div><div><small>FIELD OFFICER</small><select id="mobileOfficer">${['FA-01','FA-02','FA-03','FA-04'].map(x=>`<option ${x===selectedOfficer?'selected':''}>${x}</option>`).join('')}</select></div><div class="prototype-note"><b>Company beta · shared records</b><p>Field assignments are workflow filters. Company members share the same beta records. SAP is not connected. Satellite observations are available from the field report.</p></div><button class="ask-ram-launcher" type="button" data-open-ask-ram><img src="assets/ask-ram-avatar.svg" alt="Illustrated Ask Ram field assistant"><div><b>Ask Ram</b><small>Voice and chat guidance from the approved Paddy SOP</small></div><strong>→</strong></button>${allStagesComplete?'<button class=\"outline more-nav-link\" type=\"button\" data-open-summary>▤ Final field summary</button>':''}<button class="outline" id="signOutDemo">Sign out</button><button class="outline" id="backManager">Management workspace</button></section>`;
  field.innerHTML=`<div class="field-brand-band"><a href="#" class="field-brand-lockup" aria-label="Sage Harvest"><img src="assets/sage-harvest-logo.svg" alt="Sage Harvest"></a><div class="field-brand-meta"><b>SEED PRODUCTION MONITOR</b><span>FIELD OPERATIONS · KHARIF 2026</span></div><span class="field-demo-pill">DEMO</span></div><div class="field-app-shell">${fieldTab==='ask'?'':`<button type="button" class="ask-ram-global-banner" data-open-ask-ram><img src="assets/ask-ram-avatar.svg" alt=""><span class="ask-ram-banner-copy"><b>Ask Ram</b><small>SOP voice and chat support · open Ask Ram</small></span><span class="ask-ram-banner-tag">OPEN <strong>→</strong></span></button>`}${content}<div class="field-brand-footer"><span>DEVELOPED BY</span><b>SAGE HARVEST</b><i>Seed Production Monitor</i></div><nav class="bottom-nav" aria-label="Field app navigation"><button class="${fieldTab==='today'?'active':''}" data-bottom="today"><span>⌂</span>Today</button><button class="${fieldTab==='fields'?'active':''}" data-bottom="fields"><span>⌖</span>Fields</button><button class="${fieldTab==='inspections'?'active':''}" data-bottom="inspections"><span>☷</span>Reports</button><button class="${fieldTab==='ask'?'active':''}" data-bottom="ask"><span>✳</span>Ask Ram</button><button class="${['more','satellite','summary'].includes(fieldTab)?'active':''}" data-bottom="more"><span>•••</span>More</button></nav></div>`;
  if(fieldTab==='satellite'&&current){
    const today=new Date().toISOString().slice(0,10),from=new Date(Date.now()-60*86400000).toISOString().slice(0,10);
    const dateFrom=field.querySelector('#satelliteFrom'),dateTo=field.querySelector('#satelliteTo');
    if(dateFrom&&!dateFrom.value)dateFrom.value=from;if(dateTo&&!dateTo.value)dateTo.value=today;
    const points=(current.boundaryPoints||[]).filter(p=>Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon))).map(p=>({lat:Number(p.lat),lon:Number(p.lon)}));
    const note=field.querySelector('#satelliteBoundaryStatus');
    if(points.length>=3){
      try{applySatelliteBoundary(points,current.fieldNo,'Saved GPS boundary');if(note)note.textContent='Using '+current.fieldNo+' saved GPS boundary ('+points.length+' points).';field.querySelectorAll('#runCropSatellite,#runCropSatellite2,#runCropSatelliteImage').forEach(b=>b.disabled=false)}catch(error){if(note)note.textContent=error.message||'The saved boundary is not usable.'}
    }else if(note)note.textContent='No saved GPS boundary yet. Capture this field’s boundary or upload a KML file.';
  }
  field.querySelectorAll('[data-bottom]').forEach(b=>b.onclick=()=>{fieldTab=b.dataset.bottom;nearbyMessage='';fieldScreen()});field.querySelector('#assignedField')?.addEventListener('change',e=>{selectedFieldId=e.target.value||null;fieldScreen()});field.querySelector('#findNearby')?.addEventListener('click',findNearestAssignedField);field.querySelectorAll('[data-inspect]').forEach(b=>b.onclick=()=>editInspection(b.dataset.inspect));field.querySelectorAll('[data-gps]').forEach(b=>b.onclick=()=>openGpsPanel(b.dataset.gps));field.querySelector('[data-open-journey]')?.addEventListener('click',()=>{fieldTab='inspections';fieldScreen()});
  field.querySelectorAll('[data-stage-select]').forEach(b=>b.addEventListener('click',()=>{const stage=+b.dataset.stageSelect;if(!current||b.dataset.locked==='true')previewInspection(current?.id,stage);else editInspection(current.id,stage)}));field.querySelectorAll('[data-open-ask-ram]').forEach(b=>b.addEventListener('click',()=>{fieldTab='ask';fieldScreen()}));field.querySelector('[data-open-satellite]')?.addEventListener('click',()=>{fieldTab='satellite';fieldScreen()});
  field.querySelector('#cropSatelliteForm')?.addEventListener('submit',e=>{e.preventDefault();runCropMonitorSatellite()});
  field.querySelector('#runCropSatellite2')?.addEventListener('click',()=>runCropMonitorSentinel2());
  field.querySelector('#runCropSatelliteImage')?.addEventListener('click',()=>runCropMonitorSentinel2Image());
  field.querySelector('#satelliteKmlFile')?.addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    const note=field.querySelector('#satelliteBoundaryStatus');
    try{
      if(!/\.kml$/i.test(file.name))throw new Error('Please choose a .kml file.');
      const xmlText=await file.text(),xml=new DOMParser().parseFromString(xmlText,'application/xml');
      if(xml.querySelector('parsererror'))throw new Error('The KML file could not be read.');
      const outer=xml.getElementsByTagNameNS('*','outerBoundaryIs')[0];
      const coordsNode=outer?.getElementsByTagNameNS('*','coordinates')[0]||xml.getElementsByTagNameNS('*','coordinates')[0];
      const coords=(coordsNode?.textContent||'').trim().split(/\s+/).map(pair=>pair.split(',')).filter(parts=>parts.length>=2).map(parts=>({lon:Number(parts[0]),lat:Number(parts[1])})).filter(p=>Number.isFinite(p.lon)&&Number.isFinite(p.lat)&&Math.abs(p.lon)<=180&&Math.abs(p.lat)<=90);
      if(coords.length<3)throw new Error('No valid outer field-boundary polygon coordinates found in the KML.');
      applySatelliteBoundary(coords,file.name.replace(/\.kml$/i,''),'KML file');
      field.querySelectorAll('#runCropSatellite,#runCropSatellite2,#runCropSatelliteImage').forEach(b=>b.disabled=false);
      if(note)note.textContent='Loaded '+file.name+' ('+coords.length+' outer-boundary coordinates). Full polygon and bounding box are ready.';
    }catch(err){if(note)note.textContent=err.message||'Could not load KML.';notify(err.message||'Could not load KML.');}
  });
  field.querySelector('#useCurrentGpsBoundary')?.addEventListener('click',()=>{
    const selected=records.find(r=>r.id===selectedFieldId);
    const points=(selected?.boundaryPoints||[]).filter(p=>Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon))).map(p=>({lat:Number(p.lat),lon:Number(p.lon)}));
    const note=field.querySelector('#satelliteBoundaryStatus');
    if(points.length<3){if(note)note.textContent='This field has no saved GPS boundary with at least 3 points yet. Use Walk the field boundary first, or upload a KML file.';return;}
    applySatelliteBoundary(points,selected.fieldNo,'Mobile GPS boundary');
    field.querySelectorAll('#runCropSatellite,#runCropSatellite2,#runCropSatelliteImage').forEach(b=>b.disabled=false);
    if(note)note.textContent='Using '+selected.fieldNo+' GPS boundary ('+points.length+' points); recorded area: '+(recordedAcres(selected)?recordedAcres(selected).toFixed(2)+' acres':'not recorded')+'.';
  });

  field.querySelector('#askLanguage')?.addEventListener('change',e=>{askLanguage=e.target.value;fieldScreen()});field.querySelectorAll('[data-chat-example]').forEach(b=>b.addEventListener('click',()=>{const input=field.querySelector('#askChatInput');if(input){input.value=['What should I do in my current inspection stage?','How do I record separate male and female parent seed lots?','How do I report fertilizer or pesticide use?','What details are needed for harvest and dispatch?'][Number(b.dataset.chatExample)]||'';input.focus()}}));field.querySelector('#askChatForm')?.addEventListener('submit',e=>{e.preventDefault();const input=field.querySelector('#askChatInput'),text=input.value.trim();if(!text||ramBusy)return;sendRamQuestion(text)});field.querySelectorAll('[data-open-summary]').forEach(b=>b.addEventListener('click',()=>{fieldTab='summary';fieldScreen()}));
  applyFieldCompanyBranding();field.querySelector('#mobileOfficer')?.addEventListener('change',e=>{selectedOfficer=e.target.value;selectedFieldId=null;fieldScreen()});field.querySelector('#signOutDemo')?.addEventListener('click',()=>supabaseClient.auth.signOut());field.querySelector('#backManager')?.addEventListener('click',()=>{role='manager';page='overview';fieldMode=false;render()});
}
function findNearestAssignedField(){if(!navigator.geolocation){nearbyMessage='Location is unavailable. Choose a farmer or field from your assigned list.';fieldScreen();return}nearbyMessage='Checking your location…';fieldScreen();navigator.geolocation.getCurrentPosition(pos=>{const list=records.filter(r=>r.officer===selectedOfficer&&r.boundaryPoints?.length>=3);if(!list.length){nearbyMessage='No assigned field boundaries have been saved yet, so nearby matching is not available. Choose your field from the list.';fieldScreen();return}const here={lat:pos.coords.latitude,lon:pos.coords.longitude};list.sort((a,b)=>distanceMeters(here,centroid(a.boundaryPoints))-distanceMeters(here,centroid(b.boundaryPoints)));selectedFieldId=list[0].id;nearbyMessage=`Nearest saved assigned boundary selected: ${list[0].fieldNo} · ${Math.round(distanceMeters(here,centroid(list[0].boundaryPoints)))} m away.`;fieldScreen()},()=>{nearbyMessage='Could not access your location. Allow location access or choose from your assignments.';fieldScreen()},{enableHighAccuracy:true,timeout:12000,maximumAge:30000})}
function centroid(points){return points.reduce((c,p)=>({lat:c.lat+p.lat/points.length,lon:c.lon+p.lon/points.length}),{lat:0,lon:0})}
function distanceMeters(a,b){const rad=n=>n*Math.PI/180,lat1=rad(a.lat),lat2=rad(b.lat),dlat=lat2-lat1,dlon=rad(b.lon-a.lon),h=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;return 6371008.8*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))}
function polygonAcres(points){if(points.length<3)return 0;let sum=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],lat1=a.lat*Math.PI/180,lat2=b.lat*Math.PI/180,dlon=(b.lon-a.lon)*Math.PI/180;sum+=dlon*(2+Math.sin(lat1)+Math.sin(lat2))}return Math.abs(sum)*6371008.8**2/2/4046.8564224}
function boundarySvg(points){if(!points.length)return '<div class="gps-map-empty">Your walked boundary will appear here.</div>';const xs=points.map(p=>p.lon),ys=points.map(p=>p.lat),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),dx=maxX-minX||0.00001,dy=maxY-minY||0.00001,coords=points.map(p=>`${20+(p.lon-minX)/dx*200},${120-(p.lat-minY)/dy*100}`).join(' ');return `<svg class="gps-map" viewBox="0 0 240 140" role="img" aria-label="Captured field boundary"><polyline points="${coords}"/><circle cx="${20+(points[0].lon-minX)/dx*200}" cy="${120-(points[0].lat-minY)/dy*100}" r="4"/></svg>`}
function openGpsPanel(id){const button=field.querySelector(`[data-gps="${id}"]`),card=button?.closest('.visit-card')||button?.closest('.selected-field-card'),r=records.find(x=>x.id===id);if(!card||!r)return;let panel=card.querySelector('.gps-capture-panel');if(panel){panel.remove();return}panel=document.createElement('section');panel.className='gps-capture-panel';panel.innerHTML=`<div class="gps-panel-title"><div><b>Capture field boundary</b><small>${escape(r.fieldNo)} · Walk around the field or import a KML boundary.</small></div><button type="button" class="gps-close" aria-label="Close GPS capture">×</button></div><div class="gps-panel-status" data-gps-status>GPS is off. Start capture when you are at the field.</div><div data-gps-map>${boundarySvg(r.boundaryPoints||[])}</div><div class="gps-capture-actions"><button class="primary" type="button" data-gps-start>Start GPS walk</button><button class="outline" type="button" data-gps-finish>Close boundary & save</button></div><label class="gps-kml-picker">Use KML boundary (rare)<input type="file" accept=".kml,application/vnd.google-earth.kml+xml" data-kml-file></label><small class="gps-help">Boundary and measured area are saved to the shared company database. At least 3 boundary points are needed.</small>`;card.appendChild(panel);panel.querySelector('.gps-close').onclick=()=>{if(gpsRecordId===id)stopGps();panel.remove()};panel.querySelector('[data-gps-start]').onclick=()=>startGpsCapture(id,panel);panel.querySelector('[data-gps-finish]').onclick=()=>finishGpsCapture(id,panel);panel.querySelector('[data-kml-file]').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;const original=structuredClone(r);try{const points=await parseKmlBoundary(file);if(points.length<3)throw new Error('The KML does not contain a usable polygon boundary.');const area=polygonAcres(points);r.boundaryPoints=points;r.actualArea=area;r.areaSource='kml';panel.querySelector('[data-gps-map]').innerHTML=boundarySvg(points);panel.querySelector('[data-gps-status]').textContent='KML boundary ready · '+points.length+' points · '+area.toFixed(2)+' acres';await saveBetaRecord(r);notify('KML boundary saved · '+area.toFixed(2)+' acres')}catch(error){Object.assign(r,original);panel.querySelector('[data-gps-map]').innerHTML=boundarySvg(r.boundaryPoints||[]);panel.querySelector('[data-gps-status]').textContent=error.message||'Could not read that KML boundary.';notify('KML boundary was not saved: '+error.message)}}}
async function parseKmlBoundary(file){const xml=new DOMParser().parseFromString(await file.text(),'application/xml');if(xml.querySelector('parsererror'))throw new Error('The KML file is not valid XML.');const ring=xml.getElementsByTagNameNS('*','LinearRing')[0],coordinates=ring?.getElementsByTagNameNS('*','coordinates')[0]?.textContent;if(!coordinates)throw new Error('The KML has no polygon boundary coordinates.');return coordinates.trim().split(/\s+/).map(row=>{const [lon,lat]=row.split(',').map(Number);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw new Error('The KML has invalid latitude or longitude values.');return{lat,lon}})}
function startGpsCapture(id,panel){if(!navigator.geolocation){panel.querySelector('[data-gps-status]').textContent='GPS is not available in this browser. Enter the area in the inspection report.';return}if(gpsWatchId!==null)navigator.geolocation.clearWatch(gpsWatchId);gpsPoints=[];gpsRecordId=id;const status=panel.querySelector('[data-gps-status]');status.textContent='Waiting for a GPS position… Allow location access if your device asks.';gpsWatchId=navigator.geolocation.watchPosition(pos=>{if(gpsRecordId!==id||!panel.isConnected)return;const point={lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy};if(point.accuracy>60){status.textContent=`GPS accuracy is about ${Math.round(point.accuracy)} m. Waiting for a clearer position…`;return}if(!gpsPoints.length||distanceMeters(gpsPoints[gpsPoints.length-1],point)>=3)gpsPoints.push(point);const area=polygonAcres(gpsPoints);status.textContent=`GPS tracking · ${gpsPoints.length} boundary points · accuracy ±${Math.round(point.accuracy)} m${gpsPoints.length>=3?` · preview ${area.toFixed(2)} acres`:''}`;panel.querySelector('[data-gps-map]').innerHTML=boundarySvg(gpsPoints)},err=>{status.textContent=err.code===1?'Location permission was not allowed. Enable it in browser settings or enter the area manually.':err.code===2?'GPS signal is unavailable here. Move outdoors and try again.':'GPS took too long to respond. Try again outdoors.';if(gpsWatchId!==null)navigator.geolocation.clearWatch(gpsWatchId);gpsWatchId=null},{enableHighAccuracy:true,maximumAge:0,timeout:20000})}
function stopGps(){if(gpsWatchId!==null&&navigator.geolocation)navigator.geolocation.clearWatch(gpsWatchId);gpsWatchId=null;gpsRecordId=null}
async function finishGpsCapture(id,panel){
  if(gpsPoints.length<3){panel.querySelector('[data-gps-status]').textContent=`Only ${gpsPoints.length} points captured. Walk a little farther around the field; at least 3 points are needed.`;return}
  const r=records.find(x=>x.id===id);if(!r)return;const original=structuredClone(r),area=polygonAcres(gpsPoints);stopGps();r.boundaryPoints=gpsPoints.map(({lat,lon,accuracy})=>({lat,lon,accuracy}));r.actualArea=area;r.areaSource='gps';
  try{await saveBetaRecord(r);notify(`GPS boundary saved to the company database · ${area.toFixed(2)} acres`);fieldScreen()}
  catch(error){Object.assign(r,original);notify(`GPS boundary was not saved: ${error.message}`)}
}
const REPORT_FIELDS=[
[
['text','contactNumber','Contact Number'],['number','grossArea','Gross area','acres'],['number','netArea','Net area','acres'],['text','maleM1','Male parent · M-1'],['text','maleM1Lot','Male parent seed lot · M-1'],['text','maleM2','Male parent · M-2'],['text','maleM2Lot','Male parent seed lot · M-2'],['text','maleM3','Male parent · M-3'],['text','maleM3Lot','Male parent seed lot · M-3'],['text','femaleParent','Female parent'],['text','femaleParentLot','Female parent seed lot'],['date','soakingDate','Date of soaking'],['number','seedingAge','Seeding age','days'],['date','maleTransplantDate','Male transplanting date'],['date','femaleTransplantDate','Female transplanting date'],['select','plantPopulation','Plant population',['Good','Average','Poor','Not recorded']],['select','germination','Germination',['Good','Average','Poor','Not recorded']],['text','rowRatio','Male : female row ratio'],['text','previousCrop','Previous crop'],['select','seedSource','Seed source / commercial status',['Commercial','Own seed','Certified seed','Other','Not known']],['select','statutoryIsolation','Field isolated as per applicable statutory norms?',['Yes','No','Not known']],['select','timeIsolation','Time isolation available?',['Yes','No','Not known'],'statutoryIsolation=No'],['select','timeMoreThan30','Time isolation more than 30 days?',['Yes','No','Not known'],'timeIsolation=Yes'],['text','nearbyCrop','Nearby / surrounding crop',null,'statutoryIsolation=No'],['number','cropDistance','Distance to nearby crop','metres','statutoryIsolation=No'],['number','isolationDistance','Isolation distance recorded','metres'],['number','isolationDays','Isolation time recorded','days'],['number','borderRows','Number of border rows'],['select','maleBorderRows','Male border rows planted?',['Yes','No','Not known']],['select','borderIsolation','Border isolation',['Good','Needs review','Not recorded']],['select','cropCondition','Crop condition',['Good','Average','Poor','Not recorded']],['textarea','reviewRemarks','Review remarks',null,'wide']
],
[
['select','tillering','Tillering status',['Good','Average','Poor','Not observed']],['number','tillerCount','Number of tillerings'],['select','diseaseObserved','Disease observed?',['No','Yes','Not observed']],['select','pestObserved','Pest observed?',['No','Yes','Not observed']],['textarea','pestDiseaseRemarks','Disease / pest remarks',null,'diseaseObserved=Yes'],['number','netAcreage','Net acreage area','acres'],['select','waterAvailability','Water availability',['Adequate','Limited','Not available','Not recorded']],['select','cropCondition','Crop condition',['Good','Average','Poor','Not recorded']],['textarea','reviewRemarks','Review remarks',null,'wide']
],
[
['date','malePpiDate','PPI date · male'],['date','femalePpiDate','PPI date · female'],['number','malePpiDays','Male PPI days','days'],['number','femalePpiDays','Female PPI days','days'],['readonly','maleSyncDifferenceDays','Male synchronization difference (days)'],['readonly','maleSyncInterpretation','Male synchronization result'],['select','cropCondition','Crop condition',['Good','Average','Poor','Not recorded']],['textarea','reviewRemarks','Review remarks',null,'wide']
],
[
['date','maleFloweringDate','Date of 50% flowering · male'],['date','femaleFloweringDate','Date of 50% flowering · female'],['number','maleFloweringDays','Male flowering days','days'],['number','femaleFloweringDays','Female flowering days','days'],['date','pollinationStart','Date pollination started'],['select','pollenAvailability','Pollen availability',['Adequate','Limited','Not available','Not recorded']],['select','parentalPurity','Parental purity',['Good','Poor','Needs review','Not recorded']],['textarea','purityReason','Reason for poor purity',null,'parentalPurity=Poor'],['select','synchronization','Synchronization status',['Synchronized','Not synchronized','Needs review','Not recorded']],['select','laggingParent','Lagging parent',['Male','Female','Neither','Not known']],['number','lagDays','Lag duration','days'],['select','cropCondition','Crop condition',['Good','Average','Poor','Not recorded']],['textarea','reviewRemarks','Review remarks',null,'wide']
],
[
['date','pollinationStop','Date pollination stopped'],['number','pollinationDays','Effective days of pollination','days'],['number','grainsPerPanicle','Average grains per panicle'],['number','effectiveTillers','Number of effective tillers'],['number','estimatedYield','Estimated yield (as recorded)'],['number','netGpsAcres','Net GPS area for payment','acres'],['number','harvestArea','Final harvestable area','acres'],['select','cropCondition','Crop condition',['Good','Average','Poor','Not recorded']],['textarea','reviewRemarks','Review remarks',null,'wide']
],
[
['date','maleHarvestDate','Male harvesting date'],['date','femaleHarvestDate','Female harvesting date'],['select','harvestMode','Mode of harvest',['Manual','Mechanical','Other','Not recorded']],['select','qualityStatus','Quality status',['Excellent','Good','Average','Poor','Not assessed']],['text','dcNumber','Dispatch challan (DC) number'],['text','dispatchNumber','Seed dispatch number (STN)'],['date','dispatchDate','Dispatch date'],['number','dispatchSeedWeight','Dispatched seed weight'],['select','dispatchWeightUnit','Seed weight unit',['kg','quintal']],['number','seedMoisture','Seed moisture','%'],['number','harvestTanks','Number of harvest tanks'],['number','gunnyBags','Filled gunny bags'],['text','truckNumber','Truck number'],['select','cropCondition','Crop condition',['Good','Average','Poor','Not recorded']],['textarea','reviewRemarks','Review remarks',null,'wide']
]
];
REPORT_FIELDS.forEach((fields,index)=>{if(index===5)return;if(!fields.some(field=>field[1]==='diseaseObserved'))fields.push(['select','diseaseObserved','Disease observed?',['No','Yes','Not observed']]);if(!fields.some(field=>field[1]==='pestObserved'))fields.push(['select','pestObserved','Pest observed?',['No','Yes','Not observed']]);fields.push(['select','diseaseGrade','Disease impact grade',['Excellent','Good','Average','Poor','Not recorded']],['select','pestGrade','Pest impact grade',['Excellent','Good','Average','Poor','Not recorded']])});
const SOP_SNAPSHOTS=[
  {title:'First Inspection',items:['Confirm the farmer, seasonal field number, contract and field identity.','Record male M-1/M-2/M-3 and female parent details; keep each parent seed lot number separate.','Capture crop establishment dates, plant population, germination, previous crop and seed source.','Observe isolation, nearby crops and distance, border rows and crop condition; route concerns for human review.']},
  {title:'Vegetative Inspection',items:['Observe and record tillering and tiller count.','Record water availability, net acreage and overall crop condition.','Record pest or disease status; if observed, describe it in the remarks.']},
  {title:'Pre-Flowering Inspection',items:['Record male and female PPI days separately.','The backend calculates male PPI days minus female PPI days: zero is proper synchronization, positive means the male is delayed, and negative means the male is advanced.','Record crop condition and any review remarks.']},
  {title:'Flowering Inspection',items:['Record male and female 50% flowering dates and days separately.','Record pollination start date, pollen availability and synchronization status.','Assess parental purity; record the reason when purity is poor, plus crop condition and remarks.']},
  {title:'Pre-Harvesting Inspection',items:['Record pollination stop date and effective pollination days.','Record average grains per panicle and effective tillers.','Enter estimated yield, net GPS area for payment in acres, and final harvestable area; note crop condition and remarks.']},
  {title:'Harvesting Inspection',items:['Record male and female harvest dates and the mode of harvest.','Record quality status and dispatch challan (DC), seed dispatch (STN), dispatch date, seed weight and moisture.','Record harvest tanks, filled gunny bags, truck number, crop condition and remarks.']}
];
function stageSopSnapshot(index){const s=SOP_SNAPSHOTS[index];if(!s)return'';return `<details class="sop-snapshot" open><summary><span class="sop-snapshot-icon">✓</span><span><small>STAGE ${String(index+1).padStart(2,'0')} · FIELD GUIDE</small><b>${escape(s.title)} SOP snapshot</b></span><span class="sop-toggle">⌄</span></summary><div class="sop-snapshot-body"><ul>${s.items.map(x=>`<li>${escape(x)}</li>`).join('')}</ul><p>Quick reference from the agreed Paddy report fields. Follow the approved company SOP for technical instructions, thresholds and decisions.</p></div></details>`}
function previewInspection(id,stage){
  const r=id==null?null:records.find(x=>x.id===id);const fields=REPORT_FIELDS[stage-1]||[];
  let dlg=document.getElementById('stagePreviewDialog');if(!dlg){dlg=document.createElement('dialog');dlg.id='stagePreviewDialog';dlg.className='field-dialog stage-preview-dialog';document.body.appendChild(dlg)}
  const sourceLabel=name=>fields.find(x=>x[1]===name)?.[2]||name;
  const cards=fields.map(([type,name,label,options,extra])=>{const conditional=extra&&extra!=='wide'?extra.split('='):null,unit=type==='number'&&typeof options==='string'?options:'';let detail=type==='select'&&Array.isArray(options)?`<div class="preview-options">${options.map(x=>`<span>${escape(x)}</span>`).join('')}</div>`:`<span class="preview-entry-type">${type==='date'?'Date':type==='number'?'Number entry'+(unit?' · '+escape(unit):''):type==='textarea'?'Text observation':type==='readonly'?'Calculated automatically · read only':'Text entry'}</span>`;return `<article class="preview-field"><div class="preview-field-head"><b>${escape(label)}</b>${conditional?`<small class="preview-conditional">Conditional</small>`:''}</div>${detail}${conditional?`<small class="preview-condition-note">Shown when “${escape(sourceLabel(conditional[0]))}” is “${escape(conditional[1])}”.</small>`:''}</article>`}).join('');
  dlg.innerHTML=`<div class="dialog-heading"><div><p class="eyebrow">PREVIEW ONLY · ENTRY LOCKED</p><h2>${escape(STAGES[stage-1])}</h2><p class="muted">${r?`${escape(r.name)} · ${escape(r.fieldNo)} · ${escape(r.village)}, ${escape(r.district)}`:'No farmer selected · general report preview'}</p></div><button type="button" class="dialog-close" data-preview-close aria-label="Close preview">×</button></div><div class="preview-lock-banner"><span>🔒</span><p>${r?'Complete the previous inspection report before entering this stage. Nothing in this preview can be edited or saved.':'You are viewing this report and its choices. Select a farmer in the field selector to edit or save it.'}</p></div>${stageSopSnapshot(stage-1)}<div class="preview-fields">${cards}</div><div class="dialog-actions"><button type="button" class="primary" data-preview-close>Close preview</button></div>`;
  dlg.querySelectorAll('[data-preview-close]').forEach(b=>b.onclick=()=>dlg.close());dlg.showModal()
}
function reportControl(x){
const [type,name,label,options,extra]=x,wide=extra==='wide'?' wide-field':'',cond=extra&&extra!=='wide'?extra.split('='):null;
let control=type==='select'?'<select name="'+name+'"><option value="">Select</option>'+options.map(o=>'<option>'+escape(o)+'</option>').join('')+'</select>':type==='textarea'?'<textarea name="'+name+'" rows="3"></textarea>':type==='readonly'?'<input name="'+name+'" type="text" readonly placeholder="Calculated after saving PPI days">':'<input name="'+name+'" type="'+type+'" min="0" step="0.01">';if(type==='text'&&name.endsWith('Lot'))control='<div class="parent-lot-control"><input name="'+name+'" type="text" placeholder="Scan QR or enter lot number"><button type="button" class="small-action" data-qrscan="'+name+'">Scan packet QR</button></div>';
return '<label class="'+wide+(cond?' conditional-field hidden':'')+'"'+(cond?' data-condition="'+cond[0]+'" data-equals="'+cond[1]+'"':'')+'><span>'+escape(label)+(options?'':'')+(type==='number'&&typeof options==='string'?' <small>('+options+')</small>':'')+'</span>'+control+'</label>';
}
function reportPanel(i){return '<section class="stage-panel '+(i?'hidden':'')+'" data-stage-panel="'+(i+1)+'"><div class="form-section-title"><b>0'+(i+1)+'</b><span><strong>'+escape(STAGES[i])+'</strong><small>Paddy reference report</small></span></div>'+stageSopSnapshot(i)+'<div class="form-grid">'+REPORT_FIELDS[i].map(reportControl).join('')+'</div><section class="application-log"><div class="application-log-head"><div><b>Fertilizer & agrochemical use</b><small>Optional · record each application used for this stage</small></div><button type="button" class="small-action" data-add-application>Add application</button></div><div class="application-rows"></div></section><section class="field-photo-block"><label class="photo-picker"><span aria-hidden="true">▧</span><b>Take or choose a field / leaf photo</b><small>Optional · a clear leaf and whole-field view can help later review</small><input type="file" accept="image/*" capture="environment" data-field-photo></label><div class="field-photo-preview hidden"><img alt="Local field photo preview"><div><b data-photo-name>Photo selected</b><small>Saved in this browser session only. No upload or AI diagnosis is connected.</small></div></div><p class="photo-ai-note">AI pest and disease assessment is deferred. This prototype does not upload or analyse photos.</p></section>'+(i===0?'<p class="isolation-note">Parent details are separate for M-1, M-2, M-3 and female. Parent data from an imported demo master row pre-fills this report when present; QR scans and manual entry are also available. Isolation observations are routed for human review. This prototype does not decide crop-specific statutory compliance.</p>':'')+'</section>'}
function applicationRow(value={}){return '<div class="application-row"><label><span>Application type</span><select data-app="type"><option value="">Choose type</option>'+['Fertilizer','Insecticide','Fungicide','Herbicide','Other agrochemical'].map(x=>'<option '+(value.type===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label><label><span>Product name</span><input data-app="product" type="text" placeholder="Enter product"></label><label><span>Quantity</span><input data-app="quantity" type="number" min="0" step="0.01" placeholder="0"></label><label><span>Unit</span><input data-app="unit" type="text" placeholder="kg, L, ml, g"></label><label class="wide-field"><span>Purpose / target (optional)</span><input data-app="purpose" type="text" placeholder="Reason for application"></label><button type="button" class="remove-application" aria-label="Remove application">Remove</button></div>'}
function loadApplications(panel,rows){const host=panel.querySelector('.application-rows');host.innerHTML=(rows?.length?rows:[{}]).map(applicationRow).join('')}
function syncReportForm(f){const stage=+f.elements.stage.value;f.querySelectorAll('[data-stage-panel]').forEach(p=>p.classList.toggle('hidden',+p.dataset.stagePanel!==stage));f.querySelectorAll('.conditional-field').forEach(l=>{const source=f.elements[l.dataset.condition];l.classList.toggle('hidden',!source||source.value!==l.dataset.equals)})}
function isolationFlags(a){const flags=[];if(!a.statutoryIsolation)flags.push('Statutory isolation answer is missing.');if(a.statutoryIsolation==='No'){flags.push('Statutory isolation marked No — quality review required.');if(!a.timeIsolation)flags.push('Time-isolation availability is missing.');if(a.timeIsolation==='Yes'&&!a.timeMoreThan30)flags.push('Time-isolation duration answer is missing.');if(!a.nearbyCrop)flags.push('Nearby crop is missing.');if(!a.cropDistance)flags.push('Nearby crop distance is missing.');if(!a.maleBorderRows)flags.push('Male border-row answer is missing.')}return flags}
let parentQrStream=null,parentQrFrame=0;
function stopParentQrScan(){if(parentQrFrame)cancelAnimationFrame(parentQrFrame);parentQrFrame=0;if(parentQrStream){parentQrStream.getTracks().forEach(t=>t.stop());parentQrStream=null}}
function startParentQrScan(fieldName){
  if((typeof BarcodeDetector==='undefined'&&typeof jsQR!=='function')||!navigator.mediaDevices?.getUserMedia){notify('Camera scanning is unavailable here. Enter the printed parent lot number.');return}
  let dlg=document.getElementById('parentQrDialog');
  if(!dlg){document.body.insertAdjacentHTML('beforeend','<dialog class="qr-dialog" id="parentQrDialog"><div class="qr-dialog-head"><div><p class="eyebrow">PARENT SEED TRACEABILITY</p><h2>Scan packet QR code</h2><p>Keep the parent lot label inside the camera frame.</p></div><button type="button" class="dialog-close qr-close" aria-label="Close">×</button></div><video playsinline muted></video><p class="qr-scan-status" role="status">Starting camera…</p><p class="qr-scan-help">The QR value will be placed in this parent’s lot field. Verify it before saving.</p><div class="dialog-actions"><button type="button" class="outline qr-close">Cancel</button></div></dialog>');dlg=document.getElementById('parentQrDialog');dlg.querySelectorAll('.qr-close').forEach(b=>b.onclick=()=>dlg.close());dlg.addEventListener('close',stopParentQrScan)}
  const target=document.querySelector('#inspectionDialog [name="'+fieldName+'"]');if(!target)return;
  dlg.querySelector('.qr-scan-status').textContent='Allow camera access and point it at the packet QR code.';dlg.showModal();
  (async()=>{try{const detector=typeof BarcodeDetector==='function'?new BarcodeDetector({formats:['qr_code']}):null,canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true}),video=dlg.querySelector('video');let frames=0;parentQrStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});video.srcObject=parentQrStream;await video.play();const scan=async()=>{if(!dlg.open)return;let value='';try{if(detector){const codes=await detector.detect(video);if(codes.length)value=codes[0].rawValue.trim()}else if(video.readyState>=2&&++frames%3===0){const scale=Math.min(1,480/video.videoWidth);canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);context.drawImage(video,0,0,canvas.width,canvas.height);const code=jsQR(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);if(code)value=code.data.trim()}}catch{}if(value){target.value=value;target.dispatchEvent(new Event('input',{bubbles:true}));dlg.close();notify('QR value captured. Verify the parent lot number before saving.');return}parentQrFrame=requestAnimationFrame(scan)};scan()}catch{stopParentQrScan();dlg.querySelector('.qr-scan-status').textContent='Could not start the camera. Allow camera access or close this panel and enter the packet lot number.'}})()
}
function editInspection(id,initialStage){
const r=records.find(x=>x.id===id);if(!r)return;activeInspectionId=id;let dlg=document.getElementById('inspectionDialog');
if(!dlg){
document.body.insertAdjacentHTML('beforeend','<dialog class="field-dialog" id="inspectionDialog"><form method="dialog"><div class="dialog-heading"><div><p class="eyebrow">SAGEHARVEST · FIELD VISIT</p><h2>Inspection report</h2><p class="muted" id="inspectionFarmer"></p></div><button class="dialog-close" value="cancel" aria-label="Close">×</button></div><div class="shared-context" id="sharedContext"></div><div class="form-grid inspection-meta"><label><span>M.R. number</span><input name="mrNumber" type="text" placeholder="Enter if assigned"></label><label><span>Contract number</span><input name="contractNumber" type="text" placeholder="Enter if assigned"></label><div class="report-stage-pill"><small>SELECTED REPORT</small><b id="inspectionStageName"></b><input name="stage" type="hidden" value="1"></div><label><span>Inspection date</span><input name="inspectionDate" type="date"></label><label><span>Field status</span><select name="status"><option>On track</option><option>Due</option><option>Follow-up</option></select></label></div>'+STAGES.map((_,i)=>reportPanel(i)).join('')+'<p class="dialog-note">Save a draft to continue later. Choose Complete report to confirm this stage and unlock the next one. Reports are saved to the shared company database. Photos stay on this device and are not uploaded.</p><div class="dialog-actions report-actions"><button class="outline" value="cancel">Close</button><button class="outline" value="draft">Save draft</button><button class="primary" value="complete">Complete report & unlock next</button></div></form></dialog>');
dlg=document.getElementById('inspectionDialog');const f=dlg.querySelector('form');f.elements.stage.addEventListener('change',()=>syncReportForm(f));f.addEventListener('change',e=>{syncReportForm(f);if(e.target.matches('[data-field-photo]')){const panel=e.target.closest('[data-stage-panel]'),file=e.target.files?.[0];if(!panel||!file)return;if(!file.type.startsWith('image/')){notify('Choose an image file.');return}const reader=new FileReader();reader.onload=()=>{panel.dataset.photoData=reader.result;panel.dataset.photoName=file.name;const preview=panel.querySelector('.field-photo-preview');preview.classList.remove('hidden');preview.querySelector('img').src=reader.result;preview.querySelector('[data-photo-name]').textContent=file.name};reader.readAsDataURL(file)}});f.addEventListener('click',e=>{const scan=e.target.closest('[data-qrscan]');if(scan)startParentQrScan(scan.dataset.qrscan);if(e.target.closest('[data-add-application]')){const panel=e.target.closest('[data-stage-panel]');panel.querySelector('.application-rows').insertAdjacentHTML('beforeend',applicationRow())}if(e.target.closest('.remove-application')){const host=e.target.closest('.application-rows');e.target.closest('.application-row').remove();if(!host.children.length)host.innerHTML=applicationRow()}});
dlg.querySelector('form').addEventListener('submit',async event=>{
  const result=event.submitter?.value;if(!['draft','complete'].includes(result))return;event.preventDefault();
  const saveButton=event.submitter,activeRecord=records.find(x=>x.id===activeInspectionId);if(!activeRecord)return;saveButton.disabled=true;
  const original=structuredClone(activeRecord),form=dlg.querySelector('form'),n=+form.elements.stage.value,panel=form.querySelector('[data-stage-panel="'+n+'"]'),wasComplete=activeRecord.completedStages?.includes(n)||false;
  const report={inspectionDate:form.elements.inspectionDate.value,mrNumber:form.elements.mrNumber.value,contractNumber:form.elements.contractNumber.value,status:form.elements.status.value,savedAt:new Date().toISOString(),completed:result==='complete'||wasComplete};
  panel.querySelectorAll('[name]').forEach(input=>report[input.name]=input.value);
  report.inputApplications=[...panel.querySelectorAll('.application-row')].map(row=>Object.fromEntries([...row.querySelectorAll('[data-app]')].map(input=>[input.dataset.app,input.value.trim()]))).filter(row=>Object.values(row).some(Boolean));
  report.fieldPhotoData=panel.dataset.photoData||'';report.fieldPhotoName=panel.dataset.photoName||'';activeRecord.inspectionReports=activeRecord.inspectionReports||{};activeRecord.completedStages=activeRecord.completedStages||[];activeRecord.inspectionReports[n]=report;activeRecord.stage=n;activeRecord.status=report.status;activeRecord.notes=report.reviewRemarks||'';
  if(report.completed&&!activeRecord.completedStages.includes(n))activeRecord.completedStages.push(n);if(n===1){activeRecord.mrNumber=report.mrNumber||activeRecord.mrNumber||'';activeRecord.mobile=report.contactNumber||activeRecord.mobile||'';activeRecord.stageOne=report;activeRecord.qualityFlags=isolationFlags(report);if(activeRecord.qualityFlags.length)activeRecord.status='Follow-up'}
  try{await saveBetaRecord(activeRecord);dlg.close();render();if(fieldMode)fieldScreen();notify(result==='complete'?'Report saved. The next stage is now available.':'Draft saved to the shared company database.')}
  catch(error){Object.assign(activeRecord,original);notify(`Report was not saved: ${error.message}`)}finally{saveButton.disabled=false}
});
}
const f=dlg.querySelector('form'),saved=(r.inspectionReports||{})[initialStage||r.stage]||(initialStage===1||r.stage===1?r.stageOne:null)||{};dlg.querySelector('#inspectionFarmer').textContent=r.name+' · '+r.fieldNo;dlg.querySelector('#inspectionStageName').textContent=STAGES[(initialStage||r.stage)-1];
const actual=r.actualArea?r.actualArea.toFixed(2)+' ac · '+(r.areaSource==='kml'?'KML boundary':'GPS boundary'):'Not captured';
dlg.querySelector('#sharedContext').innerHTML='<div><small>Farmer</small><b>'+escape(r.name)+'</b></div><div><small>Season field no.</small><b>'+escape(r.fieldNo)+'</b></div><div><small>SAP lot · read-only</small><b class="'+(r.sapLot?'':'lot-pending')+'">'+(r.sapLot?escape(r.sapLot):'Awaiting SAP')+'</b></div><div><small>Village · district · state</small><b>'+escape(r.village)+', '+escape(r.district)+', '+escape(r.state)+'</b></div><div><small>Crop · hybrid · season</small><b>'+escape(r.crop)+' · '+escape(r.hybrid)+' · Kharif 2026</b></div><div><small>Area captured</small><b>'+escape(actual)+'</b></div><div><small>Organizer / aggregator</small><b>'+escape(r.aggregator)+'</b></div><div><small>Field officer · territory manager</small><b>'+escape(r.officer)+' · '+escape(r.territoryManager)+'</b></div>';
f.elements.stage.value=initialStage||r.stage;f.elements.status.value=r.status;f.elements.inspectionDate.value=saved.inspectionDate||new Date().toISOString().slice(0,10);f.elements.mrNumber.value=saved.mrNumber||r.mrNumber||'';f.elements.contractNumber.value=saved.contractNumber||'';
f.querySelectorAll('[data-stage-panel]').forEach(panel=>{const n=+panel.dataset.stagePanel,data=(r.inspectionReports||{})[n]||(n===1?r.stageOne:null)||{};panel.querySelectorAll('[name]').forEach(input=>{const value=n===1&&input.name==='contactNumber'?(data[input.name]||r.mobile||''):(data[input.name]??(n===1?(r.parentSeed?.[input.name]??''):''));input.value=value;if(input.name==='maleSyncDifferenceDays'&&value!==''&&Number.isFinite(Number(value))){const difference=Number(value);input.value=difference>0?`+${difference}`:difference<0?`−${Math.abs(difference)}`:'0'}});loadApplications(panel,data.inputApplications);panel.dataset.photoData=data.fieldPhotoData||'';panel.dataset.photoName=data.fieldPhotoName||'';const preview=panel.querySelector('.field-photo-preview');preview.classList.toggle('hidden',!data.fieldPhotoData);if(data.fieldPhotoData){preview.querySelector('img').src=data.fieldPhotoData;preview.querySelector('[data-photo-name]').textContent=data.fieldPhotoName||'Selected photo'}});
syncReportForm(f);dlg.showModal()
}
function render(){if(fieldMode)fieldScreen();else{stopGps();manager.classList.remove('hidden');field.classList.add('hidden');renderManager()}}
nav.forEach(b=>b.addEventListener('click',()=>{page=b.dataset.view;fieldMode=false;render()}));
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{if(seedworksFieldApp||b.dataset.mode==='field'){role='officer';fieldMode=true;fieldScreen()}else{role='manager';page='overview';fieldMode=false;render()}}));
document.getElementById('addField')?.addEventListener('click',()=>{page='fields';render()});
initBetaConnection();

