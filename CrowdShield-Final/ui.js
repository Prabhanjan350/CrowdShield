/* ============================================================
   MODULE 3 — UI ENGINE
   UI / INTERACTION ENGINE
   ============================================================ */
/*
 TEAMMATE 4 — UI / INTERACTION ENGINE
 Change rendering, cards, overlays, timeline, orbit and simulation presentation here.
 Contract: createCrowdShieldUI() -> methods used by app.js.
 Business rules are passed in as analysis objects rather than hard-coded here.
*/
(function(global){
  function createCrowdShieldUI(){
    const q=id=>document.getElementById(id),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    const colorForRisk=(r)=>r>=62?'var(--red)':r>=38?'var(--yellow)':'var(--green)';
    const badgeClass=(r)=>r>=62?'danger':r>=38?'moderate':'safe';
    const usefulTrend=(z)=>{
      if(z.ttc&&z.ttc!=='SET LIMIT')return z.ttc;
      if(!z.flowReady)return 'WARMING';
      if(z.net>2||z.growth>2)return 'RISING';
      if(z.net<-2||z.growth<-2)return 'EASING';
      return 'STABLE';
    };
    let latest=null,selectedAction=null;

    function addEvent(title,text){const now=new Date().toLocaleTimeString([],{hour12:false});q('feed').insertAdjacentHTML('afterbegin',`<div class="event"><div class="time">${now}</div><div class="evt"><b>${title}</b><span>${text}</span></div></div>`)}
    function setFile(file){q('fileChip').textContent=file?file.name:'No video loaded'}
    function setStatus(text){q('analysisChip').textContent=text}
    function showVideo(){q('video').style.display='block';q('emptyState').style.display='none'}
    function setProgress(v){q('progress').style.width=`${clamp(v,0,100)}%`}

    function renderProfile(profile){
      q('zoneLayer').innerHTML='';q('zoneCards').innerHTML='';
      (profile.zones||[]).forEach(z=>{
        const o=document.createElement('div');o.className='dynamic-zone';o.dataset.zone=z.id;o.style.left=`${z.rect.x*100}%`;o.style.top=`${z.rect.y*100}%`;o.style.width=`${z.rect.w*100}%`;o.style.height=`${z.rect.h*100}%`;o.style.borderColor='var(--green)';o.innerHTML=`<span style="background:var(--green);color:#031014">${z.label} · SAFE · <b>0 people</b></span>`;q('zoneLayer').appendChild(o);
        q('zoneCards').insertAdjacentHTML('beforeend',`<div class="zcard" data-card="${z.id}"><div class="name">${z.label}</div><div class="count-wrap"><div class="count">0</div><div class="count-label">TRACKED PEOPLE NOW</div></div><span class="badge safe">SAFE</span><div class="zone-extra"><span>Crowd pressure</span><b class="load">0% risk</b><span>Measured outflow</span><b class="widthFlow">WARMING</b></div></div>`);
      });
      (profile.entrances||[]).forEach(e=>{
        const o=document.createElement('div');o.className='entrance-zone';o.dataset.entrance=e.id;o.style.left=`${e.rect.x*100}%`;o.style.top=`${e.rect.y*100}%`;o.style.width=`${e.rect.w*100}%`;o.style.height=`${e.rect.h*100}%`;o.innerHTML=`<span>${e.label}</span>`;q('zoneLayer').appendChild(o);
      });
      addEvent('Venue profile loaded',`${profile.name} · ${(profile.zones||[]).length} analysis zones. Live crowd pressure, tracked counts and movement trends are calculated from video evidence.`);
    }

    function renderSimulationOptions(analysis){
      const previous=selectedAction?`${selectedAction.type}:${selectedAction.targetId||''}`:null;
      q('simOptions').innerHTML='';
      const keep={type:'keep',text:'KEEP CURRENT FLOW',targetId:null};
      const allCritical=!analysis.uncertain&&analysis.ready&&analysis.zones.length>1&&analysis.zones.every(z=>z.risk>=82);
      const opts=(!analysis.ready||analysis.uncertain)?[keep]:allCritical
        ? [keep,{type:'meter',text:'CONTROL ENTRY / METER FLOW',targetId:null},{type:'staff',text:'DEPLOY STAFF TO ALL EXITS',targetId:null}]
        : [keep,...analysis.zones.filter(z=>!analysis.focus||z.id!==analysis.focus.id).map(z=>({type:'reroute',text:`REDIRECT → ${z.label}`,targetId:z.id}))];
      let chosen=opts.find(o=>`${o.type}:${o.targetId||''}`===previous)||opts.find(o=>analysis.action&&o.targetId===analysis.action.targetId)||opts[0];
      opts.forEach(o=>{const active=o===chosen;const b=document.createElement('button');b.className='sim-option'+(active?' active':'');b.dataset.type=o.type;b.dataset.target=o.targetId||'';b.innerHTML=`${o.text}<small>${o.type==='keep'?'No routing change':o.type==='meter'?'Reduce arrivals to every exit':o.type==='staff'?'Improve discharge at every exit':'Use available capacity'}</small>`;b.addEventListener('click',()=>{q('simOptions').querySelectorAll('.sim-option').forEach(x=>x.classList.remove('active'));b.classList.add('active');selectedAction=o});q('simOptions').appendChild(b)});
      selectedAction=chosen;
    }

    function renderAnalysis(a){
      latest=a;if(!a.focus)return;
      a.zones.forEach(z=>{
        const card=document.querySelector(`[data-card="${z.id}"]`);if(card){
          card.querySelector('.count').textContent=z.count;
          const badge=card.querySelector('.badge');badge.className='badge '+badgeClass(z.risk);badge.textContent=z.riskLabel;
          const load=card.querySelector('.load');if(load)load.textContent=`${z.risk}% · ${z.riskLabel}`;
          const widthFlow=card.querySelector('.widthFlow');
          const width=Number.isFinite(z.routeWidthM)&&z.routeWidthM>0?z.routeWidthM:null;
          if(widthFlow)widthFlow.textContent=z.flowReady?(width?`${z.outflow.toFixed(1)}/min · ${(z.outflow/width).toFixed(1)}/min/m`:`${z.outflow.toFixed(1)} people/min`):'WARMING';
        }
        const overlay=document.querySelector(`.dynamic-zone[data-zone="${z.id}"]`);if(overlay){
          const crowdColor=colorForRisk(z.risk);
          overlay.style.borderColor=crowdColor;
          const span=overlay.querySelector('span');span.style.background=crowdColor;span.firstChild.textContent=`${z.label} · ${z.riskLabel} · `;span.querySelector('b').textContent=`${z.count} ${z.count===1?'person':'people'}`;
        }
      });
      const f=a.focus;if(q('densityLabel'))q('densityLabel').textContent=f.criticalOccupancy!==null?'OCCUPANCY LOAD':'VISUAL DENSITY';q('focusZone').textContent=f.label.toUpperCase();q('riskScore').textContent=`${f.risk}%`;q('riskScore').style.color=colorForRisk(f.risk);q('density').textContent=f.criticalOccupancy!==null?`${Math.round((f.count/f.criticalOccupancy)*100)}% CAP`:f.densityDisplay;q('inflow').textContent=f.flowReady?`${f.inflow.toFixed(1)}/min`:'WARMING';q('outflow').textContent=f.flowReady?`${f.outflow.toFixed(1)}/min`:'WARMING';q('ttc').textContent=usefulTrend(f);q('growth').textContent=`${f.growth>=0?'+':''}${Math.round(f.growth)} people/min`;q('focusFlow').textContent=f.flowReady?`${f.outflow.toFixed(1)}/min`:'WARMING';q('bestCapacity').textContent=a.best?`${a.best.label} · ${a.best.risk}% risk`:'—';q('metricConfidence').textContent=`${a.modelConfidence}%`;q('confidence').textContent=`${a.action.confidence}%`;q('recommendedAction').textContent=a.action.text;q('reason').textContent=a.action.reason;q('beforeRisk').textContent=`${f.risk}%`;q('beforeTime').textContent=usefulTrend(f);q('analysisChip').textContent=`Live crowd pressure · ${a.ready?'trend ready':'flow/trend warming'} · ${a.observedTotal} seen${a.recoveredTotal?` + ${a.recoveredTotal} recovered`:''} · quality ${a.modelConfidence}% · ${a.zones.map(z=>`${z.label} ${z.count}`).join(' / ')}`;
      renderSimulationOptions(a);
    }

    function runSimulation(){
      if(!latest||!latest.focus)return;
      if(!latest.ready||latest.uncertain){q('afterRisk').textContent='—';q('afterTime').textContent=latest.ready?'Vision uncertain':'Still calibrating';q('decisionBox').textContent=latest.ready?'Simulation withheld until perception quality improves. CrowdShield will not project an intervention from weak visual evidence.':'Simulation becomes available after the live perception warm-up.';addEvent('Simulation withheld','Insufficient live perception confidence for a responsible projection.');return;}
      const base=latest.focus.risk,target=selectedAction&&selectedAction.targetId?latest.zones.find(z=>z.id===selectedAction.targetId):null;
      let projected=base-3,text='Minimal change · continue monitoring.';
      if(selectedAction&&selectedAction.type==='meter'){
        projected=Math.max(45,Math.round(base*.62));text='Metering incoming flow reduces pressure simultaneously across all overloaded exits.';
      }else if(selectedAction&&selectedAction.type==='staff'){
        projected=Math.max(55,Math.round(base*.72));text='Deploying operators at every exit improves lane discipline and controlled discharge, but entry control remains the stronger intervention.';
      }else if(target){const advantage=Math.max(5,latest.focus.risk-target.risk);projected=Math.max(8,Math.round(base*(.72-Math.min(.22,advantage/200))));text=`Redirecting toward ${target.label} uses lower-risk spare capacity and reduces concentration near ${latest.focus.label}.`}
      q('afterRisk').textContent='…';q('afterTime').textContent='Simulating flow…';q('simulateBtn').textContent='Simulating intervention…';setTimeout(()=>{q('afterRisk').textContent=`${Math.max(0,projected)}%`;q('afterTime').textContent=target?'Time-to-critical extended':'Minimal change';q('decisionBox').textContent=text;q('simulateBtn').textContent='Run intervention simulation';addEvent('Intervention simulated',`${base}% → ${Math.max(0,projected)}% projected risk.`)},500);
    }
    q('simulateBtn').addEventListener('click',runSimulation);
    return {addEvent,setFile,setStatus,showVideo,setProgress,renderProfile,renderAnalysis};
  }
  global.createCrowdShieldUI=createCrowdShieldUI;
})(window);
