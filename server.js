'use strict';
/** FIN470 CFO team workspace — lightweight Node.js server, no external dependencies.
 *  Runtime: Node.js 18+.
 *  The static index.html also works on static hosts in local demo mode.
 *  The server enables shared session notes and live team presence (SSE).
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ACCESS_CODE = process.env.TEAM_ACCESS_CODE || 'NHOM4-CFO-S3'; // classroom demo only; override for deployment
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const COOKIE_NAME = 'cfo_group4_session';
const sessions = new Map();
const clients = new Set();
const presence = new Map();
const loginAttempts = new Map();
const COLORS = { 'Phạm Hoài An':'#0F6B5C', 'Đào Duy Hải':'#3567A1', 'Đỗ Trọng Nhân':'#9C642F', 'Nguyễn Thế Anh':'#8D55A0', 'Đoàn Khánh Linh':'#B15B59', 'Lê Thị Huyền Trang':'#588580' };
fs.mkdirSync(DATA_DIR, { recursive:true });
const defaults = () => ({
  notes:[], deletedNotes:[], synthesis:{}, differences:{}, summaries:{}, conflicts:{},
  conditions:[
    {title:'Validate collections & credit',text:'Management shall submit receivables aging, post-year-end collections and distributor credit/return terms before any material expansion drawdown.',owner:'CFO / Sales Director',deadline:'Before first material tranche',reason:'Receivables grew 72.2% in 2026 versus 20% revenue growth.'},
    {title:'Verify inventory & warranty',text:'Management shall verify inventory aging, stock valuation and warranty provisioning assumptions, with Audit & Risk Committee review before the next stage.',owner:'CFO / Operations / Audit & Risk',deadline:'Before second tranche',reason:'Inventory reached VND 3,400bn; warranty expense/revenue fell from 1.6% to 0.9%.'},
    {title:'Protect liquidity & funding',text:'Each tranche requires a Board-reviewed 13-week cash forecast, documented financing mix, and quarterly transparency reporting.',owner:'CFO / Treasury',deadline:'Before each tranche; quarterly review',reason:'CFO fell to VND 250bn; case lacks 2027 capital requirement and DPO.'}
  ],
  kpis:[
    {name:'CFO / Net income',baseline:'21.7%',target:'≥ 60%',unit:'%',value:21.7,direction:'high'},
    {name:'DSO · year-end proxy',baseline:'75.4 days',target:'≤ 65 days',unit:'days',value:75.4,direction:'low'},
    {name:'DOH · year-end proxy',baseline:'118.2 days',target:'≤ 105 days',unit:'days',value:118.2,direction:'low'}
  ],
  resolution:{decision:'Approve with Conditions',rationale:'',review:'Quarterly Board review; defer later tranches if liquidity or verification gates fail.',dissent:'',statement:'Cash discipline protects sustainable growth.',status:'DRAFT',votes:[],version:0},
  versions:[], checklist:{}, worksheet:{}, speakers:{}, questions:[], scores:{},
  scriptCustom:{}, roleAssignments:{},
  scenario:{dso:65,doh:105,mode:'A'},cccInputs:{ar:'',inv:'',ap:'',source:''},
  sensitivity:{gain:320,warranty:1.6,tax:''}, scanText:'',kpiActuals:{},
  forecast:Array.from({length:13},()=>({opening:'',inflows:'',outflows:'',facility:'',essential:''})),
  commitments:[
    'Reconcile reported and recurring earnings; disclose material tax effects.',
    'Publish CFO/NI, DSO and DOH with explanations each quarter.',
    'Disclose receivables aging, distributor concentration, extended terms and exchange rights.',
    'Publish warranty provision roll-forward and material inventory valuation changes.',
    'Request independent Audit & Risk review before major financing.',
    'Submit an incentive redesign balancing revenue/EPS with operating cash and core performance.'
  ].map(text=>({text,owner:'CFO',status:'Proposed'})),
  evidenceRequests:Array.from({length:4},()=>({status:'Not requested',asked:''})),
  cfoDecisions:{}, boardOutcome:{decision:'',announcedBy:'',announcedAt:'',conditions:'',dissent:'',notes:''},
  stageGates:['Open','Open','Open'], meta:{createdAt:new Date().toISOString()}
});
let state = defaults();
if (fs.existsSync(STATE_PATH)) {
 try { const v=JSON.parse(fs.readFileSync(STATE_PATH,'utf8')); state={...state,...v}; }
 catch(e) { console.error('Cannot load stored state:',e.message); }
}
function saveState(){
 const tmp=STATE_PATH+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(state,null,2),'utf8');fs.renameSync(tmp,STATE_PATH);
}
function respond(res,status,payload,headers={}){const text=JSON.stringify(payload);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(text);}
function readJSON(req,limit=150000){return new Promise((resolve,reject)=>{let b='',size=0;req.on('data',c=>{size+=c.length;if(size>limit){reject(new Error('Request too large'));req.destroy();return}b+=c});req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch{reject(new Error('Invalid JSON'))}});req.on('error',reject)})}
function parseCookie(req){const val=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE_NAME+'='));return val?val.slice(COOKIE_NAME.length+1):''}
function getSession(req){return sessions.get(parseCookie(req))}
function safeKey(x){return typeof x==='string'&&x.length<200&&!['__proto__','prototype','constructor'].includes(x)}
function setField(obj,key,val){if(!obj||!safeKey(key))return false;obj[key]=val;return true}
function broadcast(kind,payload){const evt=`event: ${kind}\ndata: ${JSON.stringify(payload)}\n\n`;for(const c of clients){try{c.write(evt)}catch{clients.delete(c)}}}
function presenceList(){
 const now=Date.now();for(const [key,p] of presence)if(now-p.seen>45000)presence.delete(key);
 const best=new Map();for(const p of presence.values()){
  const k=p.name+'|'+p.group;const old=best.get(k);if(!old||p.status==='online'&&old.status!=='online'||p.seen>old.seen)best.set(k,p)
 }
 return [...best.values()].map(({name,group,color,status,location,id})=>({name,group,color,status,location,id}));
}
function authRequired(req,res){const v=getSession(req);if(!v){respond(res,401,{error:'Login required'});return null}return v}
function applyChange(msg,actor){
 const op=msg.op;let applied={...msg};
 const objKey=(name)=>state[name]??(state[name]={});
 const item=(name)=>Number.isInteger(msg.index)&&state[name]?.[msg.index];
 switch(op){
  case 'addNote':{
    if(!msg.note||typeof msg.note.text!=='string'||msg.note.text.length>4000)throw Error('Invalid note');
    const note={...msg.note,id:msg.note.id||crypto.randomUUID(),tag:'LIVE',author:actor.name,authorId:actor.id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    if(!state.notes.some(x=>x.id===note.id))state.notes.push(note);applied={op,note};break;
  }
  case 'updateNote':{
    const note=state.notes.find(x=>x.id===msg.id);if(!note||!msg.patch||typeof msg.patch!=='object')throw Error('Unknown note');
    const allowed=['text','verified','starred','type','stance','lens','topic','disposition','linkedTo','impact','speaker'];
    const patch=Object.fromEntries(Object.entries(msg.patch).filter(([k])=>allowed.includes(k)));
    Object.assign(note,patch,{updatedAt:new Date().toISOString()});applied={op,id:msg.id,patch};break;
  }
  case 'deleteNote':{
    const idx=state.notes.findIndex(n=>n.id===msg.id);if(idx<0)throw Error('Unknown note');
    const removed=state.notes.splice(idx,1)[0];state.deletedNotes.unshift({...removed,deletedBy:actor.name,deletedAt:new Date().toISOString()});state.deletedNotes=state.deletedNotes.slice(0,300);
    for(const b of Object.keys(state.synthesis||{}))if(state.synthesis[b]===msg.id)state.synthesis[b]='';
    if(state.cfoDecisions)delete state.cfoDecisions[msg.id];applied={op,id:msg.id,deletedBy:actor.name};break;
  }
  case 'setSynthesis':setField(objKey('synthesis'),msg.block,msg.noteId);break;
  case 'setDifference':setField(objKey('differences'),msg.key,msg.value);break;
  case 'setRoleSummary':setField(objKey('summaries'),msg.key,msg.value);break;
  case 'setWorksheet':setField(objKey('worksheet'),msg.key,msg.value);break;
  case 'setSpeaker':setField(objKey('speakers'),msg.key,msg.value);break;
  case 'setScore':setField(objKey('scores'),msg.key,msg.value);break;
  case 'setRoleAssignment':setField(objKey('roleAssignments'),msg.key,msg.value);break;
  case 'setScriptCustom':setField(objKey('scriptCustom'),msg.key,msg.value);break;
  case 'setConflict':{if(!safeKey(msg.id))break;const x=objKey('conflicts');x[msg.id]??={status:'Open'};setField(x[msg.id],msg.field,msg.value);break}
  case 'setCondition':if(item('conditions'))setField(item('conditions'),msg.field,msg.value);break;
  case 'setKpi':if(item('kpis'))setField(item('kpis'),msg.field,msg.value);break;
  case 'setResolution':setField(objKey('resolution'),msg.field,msg.value);break;
  case 'setCfoDecision':{if(!safeKey(msg.id))break;const x=objKey('cfoDecisions');x[msg.id]??={decision:'PENDING',response:'',impact:'',linkTo:'',owner:''};setField(x[msg.id],msg.field,msg.value);break}
  case 'setBoardOutcome':setField(objKey('boardOutcome'),msg.field,msg.value);break;
  case 'setScenarioPreset':{const presets={A:{dso:65,doh:105},B:{dso:14.4/100*365,doh:18.4/100*15000/10500*365},C:{dso:36.5,doh:78.2}};if(presets[msg.mode])state.scenario={...presets[msg.mode],mode:msg.mode};break}
  case 'setScenario':{const sc=objKey('scenario');setField(sc,msg.field,msg.value);if(['dso','doh'].includes(msg.field))sc.mode='custom';break}
  case 'setCcc':setField(objKey('cccInputs'),msg.field,msg.value);break;
  case 'setSensitivity':setField(objKey('sensitivity'),msg.field,msg.value);break;
  case 'setForecast':if(item('forecast'))setField(item('forecast'),msg.field,msg.value);break;
  case 'setKpiActual':setField(objKey('kpiActuals'),`${msg.index}-${msg.quarter}`,msg.value);break;
  case 'setCommitment':if(item('commitments'))setField(item('commitments'),msg.field,msg.value);break;
  case 'setEvidenceRequest':if(item('evidenceRequests'))setField(item('evidenceRequests'),msg.field,msg.value);break;
  case 'setStageGate':if(Number.isInteger(msg.index)&&msg.index>=0&&msg.index<3)state.stageGates[msg.index]=msg.value;break;
  case 'setScanText':state.scanText=String(msg.value||'').slice(0,15000);break;
  case 'setConfidence':state.confidence=msg.value;break;
  case 'setChecklist':setField(objKey('checklist'),msg.key,msg.value);break;
  case 'snapshotResolution':{
    const v={id:crypto.randomUUID(),at:new Date().toISOString(),author:actor.name,data:{resolution:structuredClone(state.resolution),conditions:structuredClone(state.conditions),kpis:structuredClone(state.kpis),synthesis:structuredClone(state.synthesis)}};
    state.versions.unshift(v);state.resolution.version=(state.resolution.version||0)+1;applied={op,version:v};break;
  }
  case 'restoreResolution':{const v=state.versions.find(v=>v.id===msg.id);if(!v)throw Error('Unknown version');Object.assign(state,structuredClone(v.data));applied={op,restored:v.data};break}
  case 'voteFinal':{const votes=[...new Set([...(state.resolution.votes||[]),actor.name])];const status=votes.length>=4?'REVIEWED DRAFT':state.resolution.status;state.resolution.votes=votes;state.resolution.status=status;applied={op,votes,status};break}
  case 'resetVotes':state.resolution.votes=[];break;
  case 'addQuestion':{const question={id:crypto.randomUUID(),q:String(msg.q||'').slice(0,1500),answer:'',owner:''};state.questions.push(question);applied={op,question};break}
  case 'updateQuestion':{const x=state.questions.find(x=>x.id===msg.id);if(!x)throw Error('Unknown question');setField(x,msg.field,msg.value);break}
  default:throw Error('Unsupported operation');
 }
 saveState();return applied;
}
const server=http.createServer(async (req,res)=>{
 const route=(req.url||'/').split('?')[0];
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='GET'&&(route==='/'||route==='/index.html')){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});
  fs.createReadStream(path.join(__dirname,'index.html')).pipe(res);return;
 }
 if(req.method==='GET'&&route==='/api/health')return respond(res,200,{status:'ok',service:'FIN470 CFO Group 4'});
 if(req.method==='POST'&&route==='/api/login'){
  try{
   const ip=req.socket.remoteAddress||'unknown',key=ip+'-login',entry=loginAttempts.get(key)||{count:0,until:0};
   if(entry.until>Date.now()&&entry.count>=10)return respond(res,429,{error:'Too many login attempts; retry later'});
   const body=await readJSON(req);
   const a=Buffer.from(String(body.code||'')),b=Buffer.from(ACCESS_CODE);
   const ok=a.length===b.length&&crypto.timingSafeEqual(a,b);
   if(!ok){loginAttempts.set(key,{count:entry.until>Date.now()?entry.count+1:1,until:Date.now()+60000});return respond(res,403,{error:'Invalid team access code'});}
   loginAttempts.delete(key);
   const name=String(body.name||'').trim().slice(0,70),group=String(body.group||'');
   if(!name||!['4A','4B'].includes(group))return respond(res,400,{error:'Name or group invalid'});
   const id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('hex');
   const member={id,name,group,color:COLORS[name]||'#667589'};
   sessions.set(token,member);
   const secure=req.socket.encrypted||req.headers['x-forwarded-proto']==='https';
   return respond(res,200,{member},{'Set-Cookie':`${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax${secure?'; Secure':''}`});
  }catch(e){return respond(res,400,{error:e.message})}
 }
 if(req.method==='POST'&&route==='/api/logout'){
  const token=parseCookie(req);sessions.delete(token);for(const [key,p] of presence)if(p.session===token)presence.delete(key);broadcast('presence',presenceList());
  return respond(res,200,{ok:true},{'Set-Cookie':`${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`});
 }
 if(req.method==='GET'&&route==='/api/state'){
  const actor=authRequired(req,res);if(!actor)return;
  return respond(res,200,{state,member:actor});
 }
 if(req.method==='GET'&&route==='/api/events'){
  const actor=authRequired(req,res);if(!actor)return;
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
  res.write(': connected\n\n');clients.add(res);
  res.write(`event: presence\ndata: ${JSON.stringify(presenceList())}\n\n`);
  const keep=setInterval(()=>{try{res.write(': ping\n\n')}catch{}},20000);
  req.on('close',()=>{clearInterval(keep);clients.delete(res)});return;
 }
 if(req.method==='POST'&&route==='/api/presence'){
  const actor=authRequired(req,res);if(!actor)return;
  try{
   const b=await readJSON(req),sid=parseCookie(req),tab=String(b.tabId||'').slice(0,80);
   if(!tab)return respond(res,400,{error:'tabId required'});
   const key=sid+'|'+tab;
   if(b.event==='leave')presence.delete(key);
   else presence.set(key,{session:sid,id:actor.id,name:actor.name,group:actor.group,color:actor.color,status:b.hidden?'away':'online',location:String(b.location||'dashboard').slice(0,90),seen:Date.now()});
   broadcast('presence',presenceList());return respond(res,200,{ok:true});
  }catch(e){return respond(res,400,{error:e.message})}
 }
 if(req.method==='POST'&&route==='/api/change'){
  const actor=authRequired(req,res);if(!actor)return;
  try{
   const body=await readJSON(req);
   const applied=applyChange(body,actor);
   broadcast('change',{...applied,from:actor.id});return respond(res,200,{applied});
  }catch(e){return respond(res,400,{error:e.message})}
 }
 return respond(res,404,{error:'Not found'});
});
setInterval(()=>{broadcast('presence',presenceList());},25000).unref();
server.listen(PORT,HOST,()=>console.log(`FIN470 CFO shared server on http://${HOST}:${PORT}`));
