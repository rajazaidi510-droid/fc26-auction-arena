/* FC26 Auction engine. Runs on the server (authoritative) and in the browser (display helpers only). */
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.FC26=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';


const BUDGET=1150, MAXSQ=17, STEP=5, SNIPE=5000, MAXMGR=12;
const GROUP={ST:'FWD',LW:'MID',RW:'MID',LM:'MID',RM:'MID',CAM:'MID',CM:'MID',CDM:'MID',CB:'DEF',RB:'DEF',LB:'DEF',GK:'GK'};
function groupOf(pos){const g=GROUP[pos]; if(!g) throw new Error('Unsupported position: '+pos); return g;}
const RAW=[["Mohamed Salah","Liverpool","Premier League","RM",91,13.0],["Rodri","Manchester City","Premier League","CDM",90,9.0],["Virgil van Dijk","Liverpool","Premier League","CB",90,6.0],["Erling Haaland","Manchester City","Premier League","ST",90,12.5],["Gianluigi Donnarumma","Manchester City","Premier League","GK",89,5.5],["Alisson","Liverpool","Premier League","GK",89,5.5],["Florian Wirtz","Liverpool","Premier League","CAM",89,8.0],["Alexander Isak","Liverpool","Premier League","ST",88,11.0],["Gabriel","Arsenal","Premier League","CB",88,5.5],["Bukayo Saka","Arsenal","Premier League","RW",88,11.0],["Cole Palmer","Chelsea","Premier League","CAM",87,6.5],["Moisés Caicedo","Chelsea","Premier League","CDM",87,6.5],["Declan Rice","Arsenal","Premier League","CDM",87,6.5],["Bruno Fernandes","Man Utd","Premier League","CAM",87,6.5],["William Saliba","Arsenal","Premier League","CB",87,5.0],["Alexis Mac Allister","Liverpool","Premier League","CM",87,6.5],["Martin Ødegaard","Arsenal","Premier League","CM",87,6.5],["David Raya","Arsenal","Premier League","GK",87,5.0],["Viktor Gyökeres","Arsenal","Premier League","ST",87,10.0],["Rúben Dias","Manchester City","Premier League","CB",86,5.0],["Bruno Guimarães","Newcastle Utd","Premier League","CM",86,6.0],["Ibrahima Konaté","Liverpool","Premier League","CB",86,5.0],["Sandro Tonali","Newcastle Utd","Premier League","CDM",86,6.0],["Tijjani Reijnders","Manchester City","Premier League","CM",86,6.0],["Ryan Gravenberch","Liverpool","Premier League","CDM",85,5.5],["Emiliano Martínez","Aston Villa","Premier League","GK",85,4.5],["Bryan Mbeumo","Man Utd","Premier League","RW",85,8.0],["Phil Foden","Manchester City","Premier League","RW",85,8.0],["Youri Tielemans","Aston Villa","Premier League","CM",85,5.5],["Granit Xhaka","Sunderland","Premier League","CDM",85,5.5],["Jordan Pickford","Everton","Premier League","GK",84,4.0],["Joško Gvardiol","Manchester City","Premier League","LB",84,4.0],["Marc Cucurella","Chelsea","Premier League","LB",84,4.0],["Enzo Fernández","Chelsea","Premier League","CM",84,5.0],["Giorgi Mamardashvili","Liverpool","Premier League","GK",84,4.0],["Xavi Simons","Spurs","Premier League","CAM",84,5.0],["Cody Gakpo","Liverpool","Premier League","LM",84,7.0],["Bernardo Silva","Manchester City","Premier League","CM",84,5.0],["Ollie Watkins","Aston Villa","Premier League","ST",84,7.0],["James Maddison","Spurs","Premier League","CM",84,5.0],["Omar Marmoush","Manchester City","Premier League","ST",84,7.0],["Dominik Szoboszlai","Liverpool","Premier League","CAM",83,4.5],["Dejan Kulusevski","Spurs","Premier League","CM",83,4.5],["Mikel Merino","Arsenal","Premier League","CM",83,4.5],["Anthony Gordon","Newcastle Utd","Premier League","LW",83,6.0],["Mateo Kovačić","Manchester City","Premier League","CM",83,4.5],["Jeremie Frimpong","Liverpool","Premier League","RB",83,3.5],["Matheus Cunha","Man Utd","Premier League","CAM",83,4.5],["Zubimendi","Arsenal","Premier League","CDM",83,4.5],["Matz Sels","Nott'm Forest","Premier League","GK",83,3.5],["Eberechi Eze","Arsenal","Premier League","CAM",83,4.5],["Palhinha","Spurs","Premier League","CDM",83,4.5],["Jarrod Bowen","West Ham","Premier League","RM",83,6.0],["Murillo","Nott'm Forest","Premier League","CB",83,3.5],["Boubacar Kamara","Aston Villa","Premier League","CDM",83,4.5],["Nathan Aké","Manchester City","Premier League","CB",83,3.5],["Piero Hincapié","Arsenal","Premier League","CB",83,3.5],["Hugo Ekitiké","Liverpool","Premier League","ST",83,6.0],["Leandro Trossard","Arsenal","Premier League","LW",83,6.0],["Benjamin White","Arsenal","Premier League","RB",83,3.5],["Nikola Milenković","Nott'm Forest","Premier League","CB",83,3.5],["Kylian Mbappé","Real Madrid","La Liga","ST",91,13.0],["Jude Bellingham","Real Madrid","La Liga","CAM",90,9.0],["Raphinha","FC Barcelona","La Liga","LM",89,12.0],["Lamine Yamal","FC Barcelona","La Liga","RM",89,12.0],["Pedri","FC Barcelona","La Liga","CM",89,8.0],["Federico Valverde","Real Madrid","La Liga","CM",89,8.0],["Vini Jr.","Real Madrid","La Liga","LW",89,12.0],["Thibaut Courtois","Real Madrid","La Liga","GK",89,5.5],["Robert Lewandowski","FC Barcelona","La Liga","ST",88,11.0],["Jan Oblak","Atlético de Madrid","La Liga","GK",88,5.5],["Frenkie de Jong","FC Barcelona","La Liga","CM",87,6.5],["Jules Koundé","FC Barcelona","La Liga","RB",87,5.0],["Julián Alvarez","Atlético de Madrid","La Liga","ST",87,10.0],["Antonio Rüdiger","Real Madrid","La Liga","CB",86,5.0],["Trent Alexander-Arnold","Real Madrid","La Liga","RB",86,5.0],["Nico Williams","Athletic Club","La Liga","LM",86,9.0],["Marc-André ter Stegen","FC Barcelona","La Liga","GK",86,5.0],["Antoine Griezmann","Atlético de Madrid","La Liga","ST",85,8.0],["Carvajal","Real Madrid","La Liga","RB",85,4.5],["Unai Simón","Athletic Club","La Liga","GK",85,4.5],["Rodrygo","Real Madrid","La Liga","RW",85,8.0],["Dani Olmo","FC Barcelona","La Liga","CAM",85,5.5],["Marcos Llorente","Atlético de Madrid","La Liga","RB",84,4.0],["Sancet","Athletic Club","La Liga","CAM",84,5.0],["Aurélien Tchouaméni","Real Madrid","La Liga","CDM",84,5.0],["Wojciech Szczęsny","FC Barcelona","La Liga","GK",84,4.0],["Álex Baena","Atlético de Madrid","La Liga","LM",84,7.0],["Éder Militão","Real Madrid","La Liga","CB",84,4.0],["Isco","Real Betis","La Liga","CAM",84,5.0],["Vivian","Athletic Club","La Liga","CB",84,4.0],["Alexander Sørloth","Atlético de Madrid","La Liga","ST",84,7.0],["Eduardo Camavinga","Real Madrid","La Liga","CM",83,4.5],["Ayoze","Villarreal CF","La Liga","ST",83,6.0],["Iñaki Williams","Athletic Club","La Liga","RM",83,6.0],["Joan García","FC Barcelona","La Liga","GK",83,3.5],["Álex Remiro","Real Sociedad","La Liga","GK",83,3.5],["Dávid Hancko","Atlético de Madrid","La Liga","CB",83,3.5],["Thomas Partey","Villarreal CF","La Liga","CDM",83,4.5],["Gavi","FC Barcelona","La Liga","CM",83,4.5],["Balde","FC Barcelona","La Liga","LB",83,3.5],["Ferran Torres","FC Barcelona","La Liga","LW",83,6.0],["Iago Aspas","Celta","La Liga","RW",83,6.0],["Ronald Araujo","FC Barcelona","La Liga","CB",83,3.5],["José María Giménez","Atlético de Madrid","La Liga","CB",83,3.5],["Robin Le Normand","Atlético de Madrid","La Liga","CB",83,3.5],["Joshua Kimmich","FC Bayern München","Bundesliga","CDM",89,8.0],["Harry Kane","FC Bayern München","Bundesliga","ST",89,12.0],["Jamal Musiala","FC Bayern München","Bundesliga","CAM",88,7.5],["Serhou Guirassy","Borussia Dortmund","Bundesliga","ST",87,10.0],["Jonathan Tah","FC Bayern München","Bundesliga","CB",87,5.0],["Michael Olise","FC Bayern München","Bundesliga","RM",86,9.0],["Gregor Kobel","Borussia Dortmund","Bundesliga","GK",86,5.0],["Péter Gulácsi","RB Leipzig","Bundesliga","GK",85,4.5],["Luis Díaz","FC Bayern München","Bundesliga","LM",85,8.0],["Nico Schlotterbeck","Borussia Dortmund","Bundesliga","CB",85,4.5],["Dayot Upamecano","FC Bayern München","Bundesliga","CB",85,4.5],["Patrik Schick","Leverkusen","Bundesliga","ST",85,8.0],["Alphonso Davies","FC Bayern München","Bundesliga","LB",84,4.0],["Grimaldo","Leverkusen","Bundesliga","LM",84,7.0],["Exequiel Palacios","Leverkusen","Bundesliga","CM",84,5.0],["Manuel Neuer","FC Bayern München","Bundesliga","GK",84,4.0],["Willi Orban","RB Leipzig","Bundesliga","CB",84,4.0],["Aleix García","Leverkusen","Bundesliga","CM",83,4.5],["Oliver Baumann","TSG Hoffenheim","Bundesliga","GK",83,3.5],["Julian Brandt","Borussia Dortmund","Bundesliga","CAM",83,4.5],["Angelo Stiller","VfB Stuttgart","Bundesliga","CDM",83,4.5],["Ousmane Dembélé","Paris SG","Ligue 1","ST",90,12.5],["Achraf Hakimi","Paris SG","Ligue 1","RB",89,5.5],["Vitinha","Paris SG","Ligue 1","CM",89,8.0],["Khvicha Kvaratskhelia","Paris SG","Ligue 1","LW",87,10.0],["Marquinhos","Paris SG","Ligue 1","CB",87,5.0],["Nuno Mendes","Paris SG","Ligue 1","LB",86,5.0],["Willian Pacho","Paris SG","Ligue 1","CB",86,5.0],["João Neves","Paris SG","Ligue 1","CM",85,5.5],["Désiré Doué","Paris SG","Ligue 1","RW",85,8.0],["Fabián Ruiz","Paris SG","Ligue 1","CM",85,5.5],["Benjamin Pavard","OM","Ligue 1","CB",84,4.0],["Bradley Barcola","Paris SG","Ligue 1","LW",84,7.0],["Lucas Chevalier","Paris SG","Ligue 1","GK",83,3.5],["Lautaro Martínez","Lombardia FC","Serie A","ST",88,11.0],["Alessandro Bastoni","Lombardia FC","Serie A","CB",87,5.0],["Kevin De Bruyne","SSC Napoli","Serie A","CM",87,6.5],["Yann Sommer","Lombardia FC","Serie A","GK",87,5.0],["Mike Maignan","Milano FC","Serie A","GK",87,5.0],["Nicolò Barella","Lombardia FC","Serie A","CM",87,6.5],["Paulo Dybala","AS Roma","Serie A","CAM",86,6.0],["Hakan Çalhanoğlu","Lombardia FC","Serie A","CDM",86,6.0],["Federico Dimarco","Lombardia FC","Serie A","LB",85,4.5],["Scott McTominay","SSC Napoli","Serie A","CM",85,5.5],["Marcus Thuram","Lombardia FC","Serie A","ST",85,8.0],["De Gea","Fiorentina","Serie A","GK",85,4.5],["Bremer","Juventus","Serie A","CB",85,4.5],["Denzel Dumfries","Lombardia FC","Serie A","RB",84,4.0],["Mattia Zaccagni","Latium","Serie A","LM",84,7.0],["Manuel Locatelli","Juventus","Serie A","CDM",84,5.0],["Christian Pulisic","Milano FC","Serie A","RW",84,7.0],["Marco Carnesecchi","Bergamo Calcio","Serie A","GK",84,4.0],["Rafael Leão","Milano FC","Serie A","LW",84,7.0],["Romelu Lukaku","SSC Napoli","Serie A","ST",84,7.0],["Ademola Lookman","Bergamo Calcio","Serie A","ST",84,7.0],["Francesco Acerbi","Lombardia FC","Serie A","CB",84,4.0],["Stefan de Vrij","Lombardia FC","Serie A","CB",84,4.0],["Adrien Rabiot","Milano FC","Serie A","CAM",83,4.5],["Henrikh Mkhitaryan","Lombardia FC","Serie A","CM",83,4.5],["Giovanni Di Lorenzo","SSC Napoli","Serie A","RB",83,3.5],["Stanislav Lobotka","SSC Napoli","Serie A","CM",83,4.5],["Luka Modrić","Milano FC","Serie A","CM",83,4.5],["Loïs Openda","Juventus","Serie A","ST",83,6.0],["Artem Dovbyk","AS Roma","Serie A","ST",83,6.0],["Moise Kean","Fiorentina","Serie A","ST",83,6.0],["Gianluca Mancini","AS Roma","Serie A","CB",83,3.5],["Amir Rrahmani","SSC Napoli","Serie A","CB",83,3.5]];
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
      mem.val
