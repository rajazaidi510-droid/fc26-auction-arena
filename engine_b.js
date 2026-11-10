const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const PLAYERS=RAW.map((r,i)=>({i,name:r[0],club:r[1],league:r[2],pos:r[3],ovr:r[4],price:Math.round(r[5]*10),group:groupOf(r[3]),key:norm(r[0]+' '+r[1])}));
const fmt=n=>'\u00a3'+(n/10).toFixed(1)+'m';

function newState(code,hostId,hostName,practice){
  return {code,hostId,practice:!!practice,phase:'lobby',timer:20,ts:Date.now(),turn:null,turnSeq:0,
    managers:[{id:hostId,name:hostName,ready:true,bot:false,budget:BUDGET,squad:[]}],
    auction:null,sales:[],log:[]};
}
const mg=(S,id)=>S.managers.find(m=>m.id===id);
function addLog(S,t){S.log.push({t:Date.now(),m:t}); if(S.log.length>80) S.log.splice(0,S.log.length-80);}
function soldMap(S){const o={}; S.managers.forEach(m=>m.squad.forEach(p=>{o[p]=m.id;})); return o;}
const maxBid=m=>m.squad.length>=MAXSQ?0:m.budget;
function counts(m){const c={GK:0,DEF:0,MID:0,FWD:0}; m.squad.forEach(p=>{c[PLAYERS[p].group]++;}); return c;}

function nominateCheck(S,from){
  if(S.phase!=='auction') return 'The auction is not running';
  if(S.auction) return 'An auction is already live';
  if(S.turn!==from) return 'It is not your turn to nominate';
  const m=mg(S,from); if(!m) return 'You are not in this room';
  if(m.squad.length>=MAXSQ) return 'Your squad is full';
  return null;
}
function beginAuction(S,p,from,now){
  const pl=PLAYERS[p];
  S.auction={id:now,p,open:pl.price,cur:pl.price-STEP,leader:null,endAt:now+S.timer*1000,pausedLeft:null,nominator:from,n:0};
  addLog(S,mg(S,from).name+' nominated '+pl.name+' ('+pl.ovr+' '+pl.pos+') at '+fmt(pl.price));
}
function finishRoom(S,why){S.phase='finished'; S.auction=null; S.turn=null; addLog(S,why||'Room finished');}
function advanceTurn(S){
  const sold=soldMap(S);
  if(PLAYERS.every(p=>sold[p.i]!==undefined)){finishRoom(S,'Every player has been sold'); return;}
  const cheapest=Math.min(...PLAYERS.filter(p=>sold[p.i]===undefined).map(p=>p.price));
  if(!S.managers.some(m=>m.squad.length<MAXSQ&&m.budget>=cheapest)){finishRoom(S,'Nobody can afford another player'); return;}
  const n=S.managers.length; const i=S.managers.findIndex(m=>m.id===S.turn);
  for(let k=1;k<=n;k++){
    const m=S.managers[(i+k+n)%n];
    if(m.squad.length<MAXSQ){S.turn=m.id; S.turnSeq++; addLog(S,m.name+' is up to nominate'); return;}
  }
  finishRoom(S,'All squads are full');
}
function settle(S){
  const a=S.auction; if(!a) return;
  const pl=PLAYERS[a.p];
  if(a.leader){
    const w=mg(S,a.leader);
    w.budget-=a.cur; w.squad.push(a.p);
    S.sales.push({p:a.p,m:w.id,price:a.cur,t:Date.now()});
    addLog(S,pl.name+' sold to '+w.name+' for '+fmt(a.cur));
  } else addLog(S,pl.name+' went unsold');
  S.auction=null;
  advanceTurn(S);
}
function tick(S,now){
  const a=S.auction;
  if(S.phase==='auction'&&a&&a.pausedLeft==null&&now>=a.endAt){settle(S); return true;}
  return false;
}
const BOT_NAMES=['Bot Alpha','Bot Bravo','Bot Charlie','Bot Delta','Bot Echo','Bot Foxtrot','Bot Golf','Bot Hotel','Bot India','Bot Juliet','Bot Kilo'];

function apply(S,from,it,now){
  const host=from===S.hostId, m=mg(S,from);
  const fail=e=>({ok:false,err:e});
  const ok={ok:true};
  if(it.type==='join'){
    if(m) return ok;
    if(S.phase!=='lobby') return fail('The auction has already started');
    if(S.managers.length>=MAXMGR) return fail('Room is full (12 managers)');
    const name=String(it.name||'').trim().slice(0,16);
    if(!name) return fail('Enter a name');
    if(S.managers.some(x=>x.name.toLowerCase()===name.toLowerCase())) return fail('That name is taken');
    S.managers.push({id:from,name,ready:false,bot:false,budget:BUDGET,squad:[]});
    addLog(S,name+' joined'); return ok;
  }
  if(!m) return fail('You are not in this room');
  switch(it.type){
    case 'ready':
      if(S.phase!=='lobby'||host) return fail('Not available');
      m.ready=!!it.value; addLog(S,m.name+(m.ready?' is ready':' is not ready')); return ok;
    case 'leave':
      if(host) return fail('The host cannot leave');
      if(S.phase!=='lobby') return fail('You can only leave in the lobby');
      S.managers=S.managers.filter(x=>x.id!==from); addLog(S,m.name+' left'); return ok;
    case 'kick':{
      if(!host) return fail('Only the host can remove managers');
      if(S.phase!=='lobby') return fail('Managers can only be removed in the lobby');
      if(it.id===S.hostId) return fail('The host cannot be removed');
      const t=mg(S,it.id); if(!t) return fail('Manager not found');
      S.managers=S.managers.filter(x=>x.id!==it.id); addLog(S,t.name+' was removed'); return ok;}
    case 'addbot':{
      if(!host||S.phase!=='lobby') return fail('Only the host can add bots in the lobby');
      if(S.managers.length>=MAXMGR) return fail('Room is full (12 managers)');
      const used=S.managers.map(x=>x.name);
      const name=BOT_NAMES.find(n=>!used.includes(n))||('Bot '+Math.floor(Math.random()*900+100));
      S.managers.push({id:'bot'+Math.random().toString(36).slice(2,8),name,ready:true,bot:true,budget:BUDGET,squad:[]});
      addLog(S,name+' joined'); return ok;}
    case 'timer':
      if(!host||S.phase!=='lobby') return fail('Only the host can change the timer in the lobby');
      if(![10,15,20,30,45].includes(it.sec)) return fail('Invalid timer');
      S.timer=it.sec; return ok;
    case 'start':{
      if(!host) return fail('Only the host can start');
      if(S.phase!=='lobby') return fail('Already started');
      if(S.managers.length<2&&!S.practice) return fail('Need at least 2 managers');
      const w=S.managers.filter(x=>!x.bot&&x.id!==S.hostId&&!x.ready);
      if(w.length) return fail('Waiting on '+w.map(x=>x.name).join(', '));
      S.phase='auction'; S.turn=S.managers[0].id; S.turnSeq++;
      addLog(S,'Auction started. '+S.managers[0].name+' nominates first'); return ok;}
    case 'nominate':{
      const e=nominateCheck(S,from); if(e) return fail(e);
      const p=it.p; if(!Number.isInteger(p)||!PLAYERS[p]) return fail('Unknown player');
      if(soldMap(S)[p]!==undefined) return fail('That player is already sold');
      beginAuction(S,p,from,now); return ok;}
    case 'random':{
      const e=nominateCheck(S,from); if(e) return fail(e);
      const sold=soldMap(S); const pool=PLAYERS.filter(p=>sold[p.i]===undefined);
      if(!pool.length) return fail('No players left');
      beginAuction(S,pool[Math.floor(Math.random()*pool.length)].i,from,now); return ok;}
    case 'bid':{
      const a=S.auction;
      if(S.phase!=='auction'||!a) return fail('No live auction');
      if(a.pausedLeft!=null) return fail('The auction is paused');
      if(now>=a.endAt) return fail('Time is up');
      if(a.leader===from) return fail('You already lead this bid');
      if(m.squad.length>=MAXSQ) return fail('Your squad is full');
      const next=a.cur+STEP, amt=Math.round(Number(it.amount));
      if(!(amt>=next)||amt%STEP) return fail('Bid at least '+fmt(next)+' in \u00a30.5m steps');
      if(amt>maxBid(m)) return fail('Your maximum bid is '+fmt(maxBid(m)));
      a.cur=amt; a.leader=from; a.n++;
      if(a.endAt-now<=SNIPE) a.endAt=now+SNIPE;
      addLog(S,m.name+' bid '+fmt(amt)+' for '+PLAYERS[a.p].name); return ok;}
    case 'pause':
      if(!host) return fail('Host only');
      if(!S.auction||S.auction.pausedLeft!=null) return fail('Nothing to pause');
      S.auction.pausedLeft=Math.max(0,S.auction.endAt-now); addLog(S,'Auction paused'); return ok;
    case 'resume':
      if(!host) return fail('Host only');
      if(!S.auction||S.auction.pausedLeft==null) return fail('Nothing to resume');
      S.auction.endAt=now+S.auction.pausedLeft; S.auction.pausedLeft=null; addLog(S,'Auction resumed'); return ok;
    case 'close':
      if(!host) return fail('Host only');
      if(!S.auction) return fail('No live auction');
      S.auction.endAt=now; S.auction.pausedLeft=null; settle(S); return ok;
    case 'undo':{
      if(!host) return fail('Host only');
      if(S.phase!=='auction') return fail('Not available now');
      const s=S.sales.pop(); if(!s) return fail('Nothing to undo');
      const w=mg(S,s.m);
      if(w){w.squad=w.squad.filter(p=>p!==s.p); w.budget+=s.price;}
      addLog(S,'Undid sale of '+PLAYERS[s.p].name+(w?' to '+w.name:'')); return ok;}
    case 'finish':
      if(!host) return fail('Host only');
      if(S.phase!=='auction') return fail('Not available now');
      if(S.auction) return fail('Close the live auction first');
      finishRoom(S,'The host finished the room'); return ok;
  }
  return fail('Unknown action');
}

/* ---- bots (run only on the host) ---- */
const botMem={};
function botStep(S,now){
  if(S.phase!=='auction') return false;
  const a=S.auction; let changed=false;
  if(!a){
    const m=mg(S,S.turn);
    if(m&&m.bot){
      const mem=botMem[m.id]||(botMem[m.id]={});
      if(mem.nseq!==S.turnSeq){mem.nseq=S.turnSeq; mem.nat=now+1500+Math.random()*1500;}
      if(now>=mem.nat){
        const sold=soldMap(S);
        const pool=PLAYERS.filter(p=>sold[p.i]===undefined).sort((x,y)=>y.ovr-x.ovr||y.price-x.price);
        mem.nat=now+2000;
        if(pool.length){
          const k=Math.floor(Math.pow(Math.random(),2)*Math.min(30,pool.length));
          changed=apply(S,m.id,{type:'nominate',p:pool[k].i},now).ok;
        }
      }
    }
    return changed;
  }
  if(a.pausedLeft!=null) return false;
  const pl=PLAYERS[a.p];
  S.managers.filter(b=>b.bot).forEach(b=>{
    const mem=botMem[b.id]||(botMem[b.id]={});
    if(mem.aid!==a.id){
      mem.aid=a.id;
      mem.val=Math.round((pl.price*(0.75+Math.random()*0.85)+(pl.ovr>=88?10:0))/STEP)*STEP;
      mem.key=null;
    }
    const key=a.cur+':'+a.leader;
    if(mem.key!==key){mem.key=key; mem.at=now+500+Math.random()*2200;}
    const next=a.cur+STEP;
    const reserve=Math.max(0,11-b.squad.length-1)*35;
    const cap=Math.min(maxBid(b),Math.max(0,b.budget-reserve),mem.val);
    if(now>=mem.at&&a.leader!==b.id&&next<=cap&&S.auction===a){
      if(apply(S,b.id,{type:'bid',amount:next},now).ok){changed=true; mem.key=a.cur+':'+a.leader;}
    }
  });
  return changed;
}

return {PLAYERS,BUDGET,MAXSQ,STEP,SNIPE,MAXMGR,GROUP,groupOf,fmt,newState,mg,soldMap,maxBid,counts,apply,tick,botStep};
});
  
