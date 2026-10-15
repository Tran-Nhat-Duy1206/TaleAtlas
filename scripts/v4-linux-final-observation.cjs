'use strict';
// Passive, bounded, Linux-only diagnostic. No HTTP or application implementation is replaced.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const os = require('node:os');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { errorMonitor } = require('node:events');
const { isMainThread } = require('node:worker_threads');
const HEAD = 'a2663369906360ee0db3b51012688c997d32cfad';
const BRANCH = 'diagnostics/v4-linux-final-a266-5f36c8a2';
const MAX_ROWS = 100000, MAX_BYTES = 64 * 1024 * 1024, PID_ROWS = 20000;
const ENUM = {
  event: ['start','exit','sample','request','assignment','response','responseEnd','responseClose','responseAborted','requestError','socketObserved','socketConnect','socketEnd','socketClose','socketError','serverRequest','serverFinish','serverAborted','serverResponseClose','serverRequestError','serverResponseError','clientChannelFinish','serverChannelFinish','coverage','ownedSample','ownedGone','cgroup','environment','identity'],
  role: ['process','client','server','socket','controller'],
  category: ['private-owned-request','health','other','unknown'],
  method: ['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS','OTHER'],
  errorClass: ['reset','refused','pipe','aborted','timeout','other','none'],
  phase: ['prefix','native17','community8','controller'],
  family: ['IPv4','IPv6'],
  identity: ['controller','workflow','sut'],
  imageOS: ['ubuntu24','ubuntu22','ubuntu20','unknown'],
  architecture: ['x64','arm64','unknown'],
  processState: ['live','zombie'],
  mode: ['development','unknown'],
};
const numeric = new Set(('timeOriginMs socketTimeout agentTimeout agentKeepAliveMsecs agentKeepAliveTimeoutBuffer serverKeepAliveTimeout serverKeepAliveTimeoutBuffer serverHeadersTimeout serverRequestTimeout agentMaxSockets agentMaxFreeSockets pid ppid startTicks t ordinal requestOrdinal socketOrdinal status localPort remotePort idleMs assignedAt endAt rss heapUsed cpuUser cpuSystem loopMeanMs loopMaxMs loopUtil rows dropped bytes exitCode signalNumber cpuTicks residentPages memoryTotal cpus oom oomKill high max nrPeriods nrThrottled throttledUsec usageUsec').split(' '));
const boolean = new Set(('agentKeepAlive loopback reused complete destroyed readable writable ended hadError connected readableEnded writableEnded coverageComplete readableMetric').split(' '));
const stringPatterns = {
  nodeVersion: /^v\d{1,3}\.\d{1,3}\.\d{1,3}$/, kernel: /^\d{1,3}\.\d{1,3}(?:\.\d{1,5})?(?:-\d{1,6})?(?:-(?:azure|generic|aws|gcp|cloud|amd64|arm64))?(?:[.+]\d{1,5})?$/,
  ubuntuVersion: /^\d{2}\.\d{2}(?:\.\d{1,2})?$/, imageVersion: /^\d{8}\.\d{1,6}\.\d{1,6}$/,
  sha: /^[a-f0-9]{40}$/, tree: /^[a-f0-9]{40}$/, digest: /^[a-f0-9]{64}$/,
};
function validRow(row) {
  if (!row || Object.getPrototypeOf(row) !== Object.prototype || !ENUM.event.includes(row.event)) return false;
  return Object.entries(row).every(([k,v]) => {
    if (v === null) return numeric.has(k) || boolean.has(k) || k in ENUM || k in stringPatterns;
    if (numeric.has(k)) return typeof v === 'number' && Number.isFinite(v) && v >= 0;
    if (boolean.has(k)) return typeof v === 'boolean';
    if (k in ENUM) return ENUM[k].includes(v);
    if (k in stringPatterns) return typeof v === 'string' && stringPatterns[k].test(v);
    return false;
  });
}
function errorClass(e) {
  return ({ECONNRESET:'reset',ECONNREFUSED:'refused',EPIPE:'pipe',ABORT_ERR:'aborted',ETIMEDOUT:'timeout',ESOCKETTIMEDOUT:'timeout'})[e && e.code] || 'other';
}
function category(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return 'unknown';
  // Never retain URL/path/query text; only this finite classification survives.
  const p = raw.split('?',1)[0];
  if (/^\/api\/health\/?$/.test(p)) return 'health';
  if (/^\/api\/(?:requests|private\/requests)(?:\/|$)/.test(p)) return 'private-owned-request';
  return 'other';
}
function tuple(s) {
  const local = s && s.localAddress, remote = s && s.remoteAddress;
  const loop = x => x === '127.0.0.1' || x === '::1' || x === '::ffff:127.0.0.1';
  const ok = loop(local) && loop(remote);
  return {loopback:ok, family:ok ? (s.remoteFamily === 'IPv6' ? 'IPv6' : 'IPv4') : null,
    localPort:ok && Number.isInteger(s.localPort) ? s.localPort : null,
    remotePort:ok && Number.isInteger(s.remotePort) ? s.remotePort : null};
}
function proc(pid) {
  try {
    const raw = fs.readFileSync(`/proc/${pid}/stat`,'utf8');
    const a = raw.slice(raw.lastIndexOf(')')+2).trim().split(/\s+/);
    return {pid:Number(pid),ppid:Number(a[1]),startTicks:Number(a[19]),cpuTicks:Number(a[11])+Number(a[12]),residentPages:Number(a[21]),processState:a[0]==='Z'?'zombie':'live'};
  } catch { return null; }
}
function sameProcess(a,b) { return !!a && !!b && a.pid === b.pid && a.startTicks === b.startTicks; }
function canAdopt(child,parent,currentParent) {return !!child && sameProcess(parent,currentParent) && child.ppid===parent.pid;}
function privateDir(dir) { fs.mkdirSync(dir,{recursive:true,mode:0o700}); fs.chmodSync(dir,0o700); }
function wx(file,text) { fs.writeFileSync(file,text,{flag:'wx',mode:0o600}); }
function preload() {
  if (process.platform !== 'linux' || !isMainThread) return;
  const dir = process.env.TALEATLAS_LINUX_FINAL_OUTPUT;
  const phase = process.env.TALEATLAS_LINUX_FINAL_PHASE;
  if (!dir || !['native17','community8'].includes(phase)) return;
  let fd, rows=0, bytes=0, dropped=0;
  const self = proc(process.pid); if (!self) return;
  try { fd=fs.openSync(path.join(dir,`probe-${process.pid}-${self.startTicks}.jsonl`),'wx',0o600); } catch { return; }
  function emit(data,terminal=false) {
    const r={event:data.event,role:'process',phase,pid:process.pid,ppid:process.ppid,startTicks:self.startTicks,t:performance.now(),timeOriginMs:performance.timeOrigin,...data};
    if (!validRow(r)) { dropped++; return; }
    const text=JSON.stringify(r)+'\n';
    if (!terminal && (rows >= PID_ROWS-2 || bytes+text.length > 8*1024*1024)) { dropped++;return; }
    try { fs.writeSync(fd,text);rows++;bytes+=Buffer.byteLength(text); } catch { dropped++; }
  }
  emit({event:'start'});
  const delay=monitorEventLoopDelay({resolution:20}); delay.enable();
  let previous=performance.eventLoopUtilization();
  const timer=setInterval(()=>{
    const mem=process.memoryUsage(), cpu=process.cpuUsage(), elu=performance.eventLoopUtilization(previous);
    previous=performance.eventLoopUtilization();
    emit({event:'sample',rss:mem.rss,heapUsed:mem.heapUsed,cpuUser:cpu.user,cpuSystem:cpu.system,
      loopMeanMs:Number.isFinite(delay.mean)?delay.mean/1e6:null,loopMaxMs:delay.max/1e6,loopUtil:elu.utilization});
    delay.reset();
  },1000); timer.unref();
  process.once('exit',code=>{ clearInterval(timer);delay.disable();emit({event:'exit',exitCode:code>=0?code:null},true);emit({event:'coverage',rows,dropped,bytes,coverageComplete:dropped===0},true);try{fs.closeSync(fd);}catch{} });
  const sockets=new WeakMap(), requests=new WeakMap(); let ns=0,nr=0;
  function socket(s) {
    if (!s || typeof s.once !== 'function') return null;
    if (sockets.has(s)) return sockets.get(s);
    const state={id:++ns,lastEnd:null}; sockets.set(s,state);
    const base=()=>({role:'socket',socketOrdinal:state.id,socketTimeout:typeof s.timeout==='number'&&Number.isFinite(s.timeout)&&s.timeout>=0?s.timeout:null,...tuple(s),destroyed:!!s.destroyed,readable:!!s.readable,writable:!!s.writable,readableEnded:!!s.readableEnded,writableEnded:!!s.writableEnded});
    emit({event:'socketObserved',...base(),connected:!s.connecting});
    s.once('connect',()=>emit({event:'socketConnect',...base(),connected:true}));
    s.once('end',()=>emit({event:'socketEnd',...base()}));
    s.once('close',hadError=>emit({event:'socketClose',...base(),hadError:!!hadError}));
    s.on(errorMonitor,e=>emit({event:'socketError',...base(),errorClass:errorClass(e)}));
    return state;
  }
  const dc=require('node:diagnostics_channel');
  dc.channel('http.client.request.start').subscribe(message=>{
    try {
      const req=message.request; if (!req || requests.has(req)) return;
      const id=++nr;requests.set(req,id);const method=ENUM.method.includes(req.method)?req.method:'OTHER';
      const base={role:'client',requestOrdinal:id,category:category(req.path),method};
      const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null;
      emit({event:'request',...base,agentKeepAlive:typeof req.agent?.keepAlive==='boolean'?req.agent.keepAlive:null,agentTimeout:finite(req.agent?.options?.timeout),agentKeepAliveMsecs:finite(req.agent?.keepAliveMsecs),agentKeepAliveTimeoutBuffer:finite(req.agent?.agentKeepAliveTimeoutBuffer),agentMaxSockets:finite(req.agent?.maxSockets),agentMaxFreeSockets:finite(req.agent?.maxFreeSockets)});let assigned=false;
      const assign=s=>{if(assigned)return;assigned=true;const st=socket(s);emit({event:'assignment',...base,socketOrdinal:st?st.id:null,reused:typeof req.reusedSocket==='boolean'?req.reusedSocket:null,idleMs:st&&st.lastEnd!==null?performance.now()-st.lastEnd:null,assignedAt:performance.now(),...tuple(s)});};
      if(req.socket)assign(req.socket);else req.once('socket',assign);
      req.on(errorMonitor,e=>emit({event:'requestError',...base,errorClass:errorClass(e),socketOrdinal:sockets.get(req.socket)?.id??null,reused:typeof req.reusedSocket==='boolean'?req.reusedSocket:null}));
      req.once('response',res=>{
        const st=socket(res.socket || req.socket);
        const rb=()=>({...base,socketOrdinal:st?st.id:null,status:Number.isInteger(res.statusCode)?res.statusCode:null,complete:!!res.complete,readableEnded:!!res.readableEnded,destroyed:!!res.destroyed});
        emit({event:'response',...rb()});
        res.once('end',()=>{if(st)st.lastEnd=performance.now();emit({event:'responseEnd',...rb(),endAt:performance.now()});});
        res.once('aborted',()=>emit({event:'responseAborted',...rb()}));
        res.once('close',()=>emit({event:'responseClose',...rb()}));
        res.on(errorMonitor,e=>emit({event:'requestError',...rb(),errorClass:errorClass(e)}));
      });
    } catch { dropped++; }
  });
  dc.channel('http.client.response.finish').subscribe(message=>{try{const res=message.response;emit({event:'clientChannelFinish',role:'client',requestOrdinal:requests.get(message.request)??null,complete:typeof res?.complete==='boolean'?res.complete:null});}catch{dropped++;}}); // Not a substitute for an observed response 'end'.
  dc.channel('http.server.request.start').subscribe(message=>{
    try { const req=message.request, res=message.response, st=socket(req.socket), id=++nr;
      const base={role:'server',requestOrdinal:id,socketOrdinal:st?st.id:null,category:category(req.url),method:ENUM.method.includes(req.method)?req.method:'OTHER'};
      const server=message.server||res.socket?.server, finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null;
      emit({event:'serverRequest',...base,serverKeepAliveTimeout:finite(server?.keepAliveTimeout),serverKeepAliveTimeoutBuffer:finite(server?.keepAliveTimeoutBuffer),serverHeadersTimeout:finite(server?.headersTimeout),serverRequestTimeout:finite(server?.requestTimeout)});
      const state=()=>({...base,status:Number.isInteger(res.statusCode)?res.statusCode:null,complete:!!res.writableFinished});
      res.once('finish',()=>emit({event:'serverFinish',...state()}));
      req.once('aborted',()=>emit({event:'serverAborted',...state()}));
      res.once('close',()=>emit({event:'serverResponseClose',...state()}));
      req.on(errorMonitor,e=>emit({event:'serverRequestError',...state(),errorClass:errorClass(e)}));
      res.on(errorMonitor,e=>emit({event:'serverResponseError',...state(),errorClass:errorClass(e)}));
    } catch {dropped++;}
  });
  dc.channel('http.server.response.finish').subscribe(message=>{try{emit({event:'serverChannelFinish',role:'server',status:Number.isInteger(message.response?.statusCode)?message.response.statusCode:null,complete:typeof message.response?.writableFinished==='boolean'?message.response.writableFinished:null});}catch{dropped++;}});
}
function strip(s) {return s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');}
function footerState(expected) {return {expected,running:null,passed:null,failed:0,skipped:0,flaky:0,interrupted:0,retry:false,malformed:false};}
function footerLine(state,raw) {
  const line=strip(raw).trim();
  const run=/^Running (\d+) tests? using (\d+) workers?$/.exec(line);
  if(run){if(state.running!==null)state.malformed=true;state.running=Number(run[1]);if(Number(run[2])!==1)state.malformed=true;}
  if(/retry #\d+/i.test(line)) state.retry=true;
  // Only closed summary lines, never count arbitrary title substrings.
  const m=/^(\d+) (passed|failed|skipped|flaky|interrupted)(?:\s+\((?:\d+(?:\.\d+)?(?:ms|s|m|h)\s*)+\))?$/.exec(line);
  if(/^\d+ (?:passed|failed|skipped|flaky|interrupted)\b/.test(line)&&!m)state.malformed=true;
  if(m){const key=m[2]==='passed'?'passed':m[2];if(key==='passed'&&state.passed!==null)state.malformed=true;state[key]=Number(m[1]);}
}
function footerOK(s,code) {return code===0 && s.running===s.expected && s.passed===s.expected && !s.failed && !s.skipped && !s.flaky && !s.interrupted && !s.retry && !s.malformed;}
const PREFIX=[['pnpm',['install','--frozen-lockfile']],['pnpm',['typecheck']],['pnpm',['lint']],['pnpm',['test']],['pnpm',['db:migrate']],['pnpm',['db:migrate']],['pnpm',['db:generate']],['git',['diff','--exit-code','--','packages/database/drizzle']],['pnpm',['test:integration']],['pnpm',['build']],['pnpm',['typecheck']],['pnpm',['exec','playwright','install','--with-deps','chromium']]];
const SENSITIVE=['apps/web/.next','apps/web/.turbo','.turbo','.local','test-results','playwright-report','test-results-community','playwright-report-community','test-results-v4-communities','playwright-report-v4-communities'];
const COUNTERS=['ready','hmrFullReload','pipe','aborted','oom','kill','refused','reset'];
function summaryValid(s) {
  const keys=['version','prefixExitCodes','native17','community8','completed','incomplete','cutoff','interrupted','cleanupConfirmed','knownProcessesStopped','sensitivePathsAbsent','ownedTreeCoverageComplete','coverageComplete','rows','dropped','productAcceptance','incidentCauseEstablished','unit1784Files63','sql272Files26','patterns'];
  if(!s||Object.keys(s).sort().join()!==keys.sort().join())return false;
  if(s.version!==1||s.productAcceptance!==false||s.incidentCauseEstablished!==false||s.ownedTreeCoverageComplete!==false)return false;
  if(!Array.isArray(s.prefixExitCodes)||s.prefixExitCodes.length>12||!s.prefixExitCodes.every(x=>x===null||Number.isInteger(x)&&x>=0&&x<=255))return false;
  for(const k of ['native17','community8'])if(!s[k]||Object.keys(s[k]).sort().join()!=='exitCode,strictPass'||!(s[k].exitCode===null||Number.isInteger(s[k].exitCode)&&s[k].exitCode>=0&&s[k].exitCode<=255)||typeof s[k].strictPass!=='boolean')return false;
  if(!['rows','dropped'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0))return false;
  if(!['completed','incomplete','cutoff','interrupted','cleanupConfirmed','knownProcessesStopped','sensitivePathsAbsent','ownedTreeCoverageComplete','coverageComplete','unit1784Files63','sql272Files26'].every(k=>typeof s[k]==='boolean'))return false;
  return s.patterns&&Object.keys(s.patterns).sort().join()===COUNTERS.slice().sort().join()&&Object.values(s.patterns).every(x=>Number.isSafeInteger(x)&&x>=0);
}
function techGit(cwd,args) {const p=cp.spawnSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:10000,maxBuffer:4096});if(p.status!==0)throw Error('guard');return p.stdout.trim();}
async function controller() {
  let safe=false,code=1,root=null,out=null,canonical=null,halt=false,active=null,timer=null,watch=null,cleanupAuthorized=false;
  const known=new Map(), rows=[];let dropped=0,totalBytes=0,samplePhase='prefix';
  const summary={version:1,prefixExitCodes:[],native17:{exitCode:null,strictPass:false},community8:{exitCode:null,strictPass:false},completed:false,incomplete:true,cutoff:false,interrupted:false,cleanupConfirmed:false,knownProcessesStopped:false,sensitivePathsAbsent:false,ownedTreeCoverageComplete:false,coverageComplete:true,rows:0,dropped:0,productAcceptance:false,incidentCauseEstablished:false,unit1784Files63:false,sql272Files26:false,patterns:Object.fromEntries(COUNTERS.map(k=>[k,0]))};
  function add(data){const r={t:performance.now(),timeOriginMs:performance.timeOrigin,...data};if(!validRow(r)){dropped++;return;}const n=Buffer.byteLength(JSON.stringify(r))+1;if(rows.length>=MAX_ROWS||totalBytes+n>MAX_BYTES){dropped++;return;}rows.push(r);totalBytes+=n;}
  function discover(){
    for(const [pid,old] of known){const now=proc(pid);if(!sameProcess(old,now)){if(now)summary.coverageComplete=false;if(!old.gone){old.gone=true;if(samplePhase!=='prefix')add({event:'ownedGone',role:'controller',phase:samplePhase,pid,startTicks:old.startTicks,t:performance.now()});}continue;}
      if(samplePhase!=='prefix')add({event:'ownedSample',role:'controller',phase:samplePhase,...now,t:performance.now()});
      try{for(const task of fs.readdirSync(`/proc/${pid}/task`)){const children=fs.readFileSync(`/proc/${pid}/task/${task}/children`,'utf8').trim().split(/\s+/);for(const c of children){if(!/^\d+$/.test(c))continue;const p=proc(Number(c));if(canAdopt(p,old,proc(pid))&&(!known.has(p.pid)||!sameProcess(known.get(p.pid),p)))known.set(p.pid,p);}}}catch{summary.coverageComplete=false;}
    }
  }
  async function cleanupOwned(){
    discover();const alive=p=>{const now=proc(p.pid);return sameProcess(p,now)&&now.processState!=='zombie';};let live=[...known.values()].filter(alive);
    for(const p of live.reverse())try{process.kill(p.pid,'SIGTERM');}catch{}
    if(live.length)await new Promise(r=>setTimeout(r,1200));
    live=live.filter(alive);
    for(const p of live)try{process.kill(p.pid,'SIGKILL');}catch{}
    if(live.length)await new Promise(r=>setTimeout(r,300));
    return !live.some(alive);
  }
  function stop(interrupted){
    if(halt)return;halt=true;if(interrupted)summary.interrupted=true;else summary.cutoff=true;
    discover();for(const p of known.values())if(sameProcess(p,proc(p.pid)))try{process.kill(p.pid,'SIGTERM');}catch{}
    const force=setTimeout(()=>{discover();for(const p of known.values())if(sameProcess(p,proc(p.pid)))try{process.kill(p.pid,'SIGKILL');}catch{}},1500);force.unref();
    const unpipe=setTimeout(()=>{if(active){active.stdout.destroy();active.stderr.destroy();}},3500);unpipe.unref();
  }
  const onSignal=()=>stop(true);
  async function run(command,args,phase,expected,index){
    if(halt)return null;samplePhase=phase;const state=footerState(expected);let tail='',overflow=false,seenTests=false,seenFiles=false;
    const env={...process.env};delete env.NODE_OPTIONS;delete env.TALEATLAS_LINUX_FINAL_PRELOAD;delete env.TALEATLAS_LINUX_FINAL_PHASE;
    if(phase!=='prefix'){env.NODE_OPTIONS=`--require ${__filename}`;env.TALEATLAS_LINUX_FINAL_PRELOAD='1';env.TALEATLAS_LINUX_FINAL_PHASE=phase;env.V4_COMMUNITIES_ENABLED=phase==='community8'?'true':'false';}
    let child;try{child=cp.spawn(command,args,{cwd:root,env,stdio:['ignore','pipe','pipe'],detached:false});}catch{return {exitCode:1,strictPass:false};}
    active=child;const p=proc(child.pid);if(p)known.set(p.pid,p);else {dropped++;summary.coverageComplete=false;}
    function line(l){
      if(phase!=='prefix'){footerLine(state,l);const x=strip(l);const patterns={ready:/Ready in \d+/,hmrFullReload:/Fast Refresh had to perform a full reload/i,pipe:/\bEPIPE\b/,aborted:/\baborted\b/i,oom:/heap out of memory|OOMKilled|out of memory/i,kill:/\bSIGKILL\b|\bKilled\b/,refused:/\bECONNREFUSED\b/,reset:/\bECONNRESET\b/};for(const k of COUNTERS)if(patterns[k].test(x))summary.patterns[k]++;}
      if(phase==='prefix'&&(index===3||index===8)){const x=strip(l);if(new RegExp(`\\bTests\\s+${index===3?1784:272} passed\\b`).test(x))seenTests=true;if(new RegExp(`Test Files\\s+${index===3?63:26} passed\\b`).test(x))seenFiles=true;}
    }
    // Separate bounded buffers avoid stdout/stderr fragment interleaving. Text never reaches disk/output.
    const tails={out:'',err:''};
    function consume(which,chunk){let text=tails[which]+chunk.toString('utf8');let at;while((at=text.indexOf('\n'))>=0){line(text.slice(0,at));text=text.slice(at+1);}if(text.length>32768){overflow=true;text='';}tails[which]=text;}
    child.stdout.on('data',x=>consume('out',x));child.stderr.on('data',x=>consume('err',x));
    const exit=await new Promise(resolve=>{child.once('error',()=>resolve(1));child.once('close',(n)=>resolve(Number.isInteger(n)&&n>=0?n:1));});
    for(const t of Object.values(tails))if(t)line(t);tails.out='';tails.err='';active=null;discover();
    if(overflow){dropped++;summary.coverageComplete=false;}
    if(index===3)summary.unit1784Files63=seenTests&&seenFiles;if(index===8)summary.sql272Files26=seenTests&&seenFiles;
    return {exitCode:exit,strictPass:phase!=='prefix'&&!overflow&&footerOK(state,exit)};
  }
  function cgroup(){
    // Job cgroup is not an attribution to any particular PID.
    for(const [file,mapping] of [['memory.events',{oom:'oom',oom_kill:'oomKill',high:'high',max:'max'}],['cpu.stat',{nr_periods:'nrPeriods',nr_throttled:'nrThrottled',throttled_usec:'throttledUsec',usage_usec:'usageUsec'}]]){
      const row={event:'cgroup',role:'controller',phase:samplePhase,t:performance.now(),readableMetric:false};try{const text=fs.readFileSync('/sys/fs/cgroup/'+file,'utf8');row.readableMetric=true;for(const l of text.split('\n')){const [k,v]=l.trim().split(/\s+/);if(mapping[k]&&/^\d+$/.test(v))row[mapping[k]]=Number(v);}}catch{}add(row);
    }
  }
  try {
    const e=process.env,workspace=e.GITHUB_WORKSPACE;
    if(process.platform!=='linux'||e.CI!=='true'||e.GITHUB_ACTIONS!=='true'||e.GITHUB_RUN_ATTEMPT!=='1'||!workspace||e.TALEATLAS_LINUX_FINAL_HEAD!==HEAD||e.TALEATLAS_LINUX_FINAL_DIAG_BRANCH!==BRANCH)throw Error('guard');
    root=path.resolve(e.TALEATLAS_LINUX_FINAL_SUT||'');out=path.resolve(e.TALEATLAS_LINUX_FINAL_OUTPUT||'');
    if(root!==path.join(workspace,'sut')||out!==path.join(workspace,'linux-final-output')||path.resolve(__dirname,'..')!==path.join(workspace,'diagnostic'))throw Error('guard');
    const db='postgresql://taleatlas_test:synthetic_ci_only@127.0.0.1:5432/taleatlas_test';
    if(!['DATABASE_URL','DATABASE_URL_DIRECT','TEST_DATABASE_URL'].every(k=>e[k]===db)||e.BETTER_AUTH_SECRET!=='synthetic-ci-auth-secret-not-for-production-12345'||e.APP_ORIGIN!=='http://127.0.0.1:3000'||e.SMTP_HOST!=='127.0.0.1'||e.SMTP_PORT!=='1025')throw Error('guard');
    if(techGit(root,['rev-parse','HEAD'])!==HEAD||!stringPatterns.sha.test(e.GITHUB_SHA||'')||techGit(path.join(workspace,'diagnostic'),['rev-parse','HEAD'])!==e.GITHUB_SHA||e.GITHUB_REF_NAME!==BRANCH)throw Error('guard');
    if(!stringPatterns.kernel.test(os.release())||fs.existsSync(out)||e.NODE_OPTIONS||e.TALEATLAS_LINUX_FINAL_PRELOAD||e.TALEATLAS_TEST_NATIVE_HEAP_MB||e.TALEATLAS_TEST_NATIVE_SERVER_MODE&&e.TALEATLAS_TEST_NATIVE_SERVER_MODE!=='development'||e.E2E_PORT&&e.E2E_PORT!=='3000'||e.TEST_SMTP_PORT&&e.TEST_SMTP_PORT!=='1025')throw Error('guard');privateDir(out);canonical=path.join(out,'sanitized');cleanupAuthorized=true;
    process.on('SIGINT',onSignal);process.on('SIGTERM',onSignal);
    timer=setTimeout(()=>stop(false),85*60*1000);timer.unref();watch=setInterval(()=>{discover();if(samplePhase!=='prefix')cgroup();},1000);watch.unref();
    const release=fs.readFileSync('/etc/os-release','utf8'), version=/^VERSION_ID="?(\d{2}\.\d{2}(?:\.\d+)?)"?$/m.exec(release)?.[1]||null;
    add({event:'environment',role:'controller',phase:'controller',mode:'development',nodeVersion:process.version,kernel:os.release(),ubuntuVersion:version,imageOS:ENUM.imageOS.includes(e.ImageOS)?e.ImageOS:'unknown',imageVersion:stringPatterns.imageVersion.test(e.ImageVersion||'')?e.ImageVersion:null,architecture:ENUM.architecture.includes(process.arch)?process.arch:'unknown',cpus:os.cpus().length,memoryTotal:os.totalmem()});
    add({event:'identity',role:'controller',identity:'sut',sha:HEAD,tree:techGit(root,['rev-parse','HEAD^{tree}'])});
    const workflow=e.TALEATLAS_LINUX_FINAL_WORKFLOW;
    if(workflow!=='v4-linux-final-observation.yml')throw Error('guard');
    for(const [identity,file] of [['controller',__filename],['workflow',path.join(workspace,'diagnostic','.github/workflows',workflow)]])add({event:'identity',role:'controller',identity,digest:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
    cgroup();
    let prefixOK=true;
    for(let i=0;i<PREFIX.length;i++){const [command,args]=PREFIX[i],r=await run(command,args,'prefix',null,i);summary.prefixExitCodes.push(r?r.exitCode:null);if(!r||r.exitCode!==0||halt){prefixOK=false;break;}}
    if(prefixOK&&!halt){const r=await run('pnpm',['test:e2e','--workers=1','--retries=0'],'native17',17);if(r)summary.native17=r;if(!await cleanupOwned()){halt=true;summary.incomplete=true;}}
    if(summary.native17.strictPass&&!halt){const r=await run('pnpm',['exec','playwright','test','--config','playwright.community.config.ts','--workers=1','--retries=0'],'community8',8);if(r)summary.community8=r;}
    summary.completed=prefixOK&&summary.native17.strictPass&&summary.community8.strictPass&&!halt;
    code=summary.completed?0:1;
  } catch {code=1;}
  finally {
    if(timer)clearTimeout(timer);if(watch)clearInterval(watch);
    let ownedClean=false;try{ownedClean=await cleanupOwned();}catch{}
    if(cleanupAuthorized&&root&&out&&fs.existsSync(out)){
      let deleted=ownedClean;
      if(ownedClean)for(const name of SENSITIVE){try{fs.rmSync(path.join(root,name),{recursive:true,force:true});if(fs.existsSync(path.join(root,name)))deleted=false;}catch{deleted=false;}}
      summary.knownProcessesStopped=ownedClean;
      summary.sensitivePathsAbsent=deleted;
      // Snapshot facts about known validated PIDs and these exact paths, NOT exhaustive tree cleanup.
      summary.cleanupConfirmed=summary.knownProcessesStopped&&summary.sensitivePathsAbsent;
      cgroup();
      try {
        // Validate every per-process row before canonicalization; unknown files fail closed.
        let probes=0;
        for(const name of fs.readdirSync(out)){
          if(!/^probe-\d+-\d+\.jsonl$/.test(name))throw Error('schema');
          const file=path.join(out,name),st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>8*1024*1024+4096)throw Error('schema');
          const text=fs.readFileSync(file,'utf8');if(!text.endsWith('\n'))throw Error('schema');let terminal=false;
          for(const l of text.trimEnd().split('\n')){const r=JSON.parse(l), identity=/^probe-(\d+)-(\d+)\.jsonl$/.exec(name);if(!validRow(r)||r.pid!==Number(identity[1])||r.startTicks!==Number(identity[2]))throw Error('schema');if(r.event==='coverage'){terminal=true;if(!r.coverageComplete)summary.coverageComplete=false;dropped+=r.dropped||0;}add(r);}
          if(!terminal)summary.coverageComplete=false;probes++;fs.unlinkSync(file);
        }
        if(probes===0)summary.coverageComplete=false;
        summary.rows=rows.length;summary.dropped=dropped;summary.coverageComplete=summary.coverageComplete&&dropped===0;
        summary.incomplete=!summary.completed||!summary.coverageComplete||!summary.ownedTreeCoverageComplete||!summary.cleanupConfirmed;
        if(summary.incomplete)code=1;
        if(!summary.cleanupConfirmed||!summaryValid(summary)||!rows.every(validRow))throw Error('schema');
        privateDir(canonical);wx(path.join(canonical,'observations.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');wx(path.join(canonical,'summary.json'),JSON.stringify(summary)+'\n');
        // Re-read canonical files before granting workflow permission to upload them.
        if(!summaryValid(JSON.parse(fs.readFileSync(path.join(canonical,'summary.json'),'utf8')))||!fs.readFileSync(path.join(canonical,'observations.jsonl'),'utf8').trimEnd().split('\n').every(l=>validRow(JSON.parse(l))))throw Error('schema');
        if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'safe_to_upload=true\n');safe=true;
      } catch {code=1;try{if(canonical)fs.rmSync(canonical,{recursive:true,force:true});}catch{}}
    }
    process.removeListener('SIGINT',onSignal);process.removeListener('SIGTERM',onSignal);
    process.stdout.write(JSON.stringify({safeToUpload:safe,completed:summary.completed,incomplete:summary.incomplete,productAcceptance:false,incidentCauseEstablished:false})+'\n');
    process.exitCode=code;
  }
}
function canary(){
  const assert=require('node:assert/strict');
  assert(validRow({event:'assignment',role:'client',pid:1,reused:false,idleMs:null,...tuple(null)}));
  assert(!validRow({event:'start',secret:'not-allowed'}));assert(!validRow({event:'start',pid:'1'}));assert(!validRow({event:'start',pid:-1}));assert(!validRow({event:'start',url:null}));assert(!validRow({event:'start',t:Infinity}));
  assert.deepEqual(tuple({localAddress:'127.0.0.1',remoteAddress:'192.0.2.1',localPort:1,remotePort:2}),{loopback:false,family:null,localPort:null,remotePort:null});
  assert(!sameProcess({pid:1,startTicks:2},{pid:1,startTicks:3}));assert(sameProcess({pid:1,startTicks:2},{pid:1,startTicks:2}));
  for(const n of [17,8]){const s=footerState(n);footerLine(s,`\x1b[32mRunning ${n} tests using 1 worker\x1b[0m`);footerLine(s,`${n} passed (1.2m)`);assert(footerOK(s,0));assert(!footerOK(s,1));for(const l of ['1 skipped','1 flaky','1 interrupted','Retry #1']){const t={...s};footerLine(t,l);assert(!footerOK(t,0));}const t=footerState(n);footerLine(t,`${n} passed (1m)`);assert(!footerOK(t,0));}
  assert.equal(category('/api/requests/123?private=yes'),'private-owned-request');assert.equal(category('/api/health'),'health');assert.equal(category(null),'unknown');assert.equal(errorClass({code:'ECONNRESET'}),'reset');
  assert(!summaryValid({productAcceptance:false}));assert.equal(PREFIX.length,12);
  const closed={version:1,prefixExitCodes:Array(12).fill(0),native17:{exitCode:0,strictPass:true},community8:{exitCode:0,strictPass:true},completed:true,incomplete:false,cutoff:false,interrupted:false,cleanupConfirmed:true,knownProcessesStopped:true,sensitivePathsAbsent:true,ownedTreeCoverageComplete:false,coverageComplete:true,rows:1,dropped:0,productAcceptance:false,incidentCauseEstablished:false,unit1784Files63:true,sql272Files26:true,patterns:Object.fromEntries(COUNTERS.map(k=>[k,0]))};
  assert(summaryValid(closed));assert(!summaryValid({...closed,body:null}));assert(!summaryValid({...closed,rows:-1}));assert(!summaryValid({...closed,completed:1}));
  assert(!validRow({event:'request',body:null}));assert(!validRow({event:'request',headers:null}));assert(!validRow({event:'request',argv:null}));
  const epochA={event:'sample',pid:1,timeOriginMs:1000,t:200},epochB={event:'sample',pid:2,timeOriginMs:1100,t:100};
  assert(validRow(epochA)&&validRow(epochB));assert.equal(epochA.timeOriginMs+epochA.t,epochB.timeOriginMs+epochB.t);assert(!validRow({...epochA,timeOriginMs:'1000'}));
  assert(!validRow({event:'environment',kernel:'RAW_SECRET'}));assert(!validRow({event:'environment',kernel:'6.11.0-RAW_SECRET'}));assert(validRow({event:'environment',kernel:'6.11.0-1018-azure'}));
  const parent={pid:10,startTicks:5};assert(canAdopt({pid:20,ppid:10,startTicks:8},parent,{...parent}));assert(!canAdopt({pid:20,ppid:10,startTicks:8},parent,{pid:10,startTicks:6}));assert(!canAdopt({pid:20,ppid:11,startTicks:8},parent,{...parent}));
  assert(summaryValid({...closed,completed:true,incomplete:true,coverageComplete:false}));
  assert(!summaryValid({...closed,ownedTreeCoverageComplete:true}));assert(!summaryValid({...closed,knownProcessesStopped:'true'}));assert(!summaryValid({...closed,sensitivePathsAbsent:1}));
  const malformed=footerState(17);footerLine(malformed,'Running 17 tests using 1 worker');footerLine(malformed,'17 passed (not-a-duration)');assert(!footerOK(malformed,0));
  process.stdout.write(JSON.stringify({canaryPassed:true,networkRequests:0,fileFixtures:0})+'\n');
}
module.exports={validRow,summaryValid};
if(require.main!==module){if(process.env.TALEATLAS_LINUX_FINAL_PRELOAD==='1')preload();}
else if(process.argv.length===3&&process.argv[2]==='--canary')canary();
else if(process.argv.length===2)controller().catch(()=>{process.stdout.write('{"safeToUpload":false,"completed":false,"incomplete":true}\n');process.exitCode=1;});
else {process.stdout.write('{"safeToUpload":false,"completed":false,"incomplete":true}\n');process.exitCode=1;}
