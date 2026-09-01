/* CrowdShield — LIVE CROWD PRESSURE + TRUE-METRICS FORECAST ENGINE
   Safety rule: static crowd pressure is available from the FIRST analysed frame.
   Only time-dependent metrics (growth / flow / TTC) warm up over multiple video-time samples.
   No filename profiles, no video-specific fallbacks, no synthetic crowd counts.
*/
(function(global){
  'use strict';
  function createIntelligenceEngine(config){
    const cfg=Object.assign({historyMs:12000,trendMs:8000,minSamples:3,minQualityForDecision:56},config||{});
    let history={};
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    const median=a=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
    function reset(profile){history={};((profile&&profile.zones)||[]).forEach(z=>history[z.id]=[]);}
    function push(id,count,t){if(!history[id])history[id]=[];history[id].push({t,c:count});history[id]=history[id].filter(x=>t-x.t<=cfg.historyMs);}
    function stable(id){const v=(history[id]||[]).slice(-5).map(x=>x.c);return v.length?Math.round(median(v)):0;}
    function trend(id){
      const h=history[id]||[];if(h.length<cfg.minSamples)return 0;
      const cutoff=h[h.length-1].t-cfg.trendMs,r=h.filter(x=>x.t>=cutoff);if(r.length<cfg.minSamples)return 0;
      const n=r.length,mt=r.reduce((s,x)=>s+x.t,0)/n,mc=r.reduce((s,x)=>s+x.c,0)/n;
      let num=0,den=0;r.forEach(x=>{num+=(x.t-mt)*(x.c-mc);den+=(x.t-mt)*(x.t-mt);});
      return den?(num/den)*60000:0;
    }
    function ttc(count,critical,netRate,flowReady,uncertain){
      if(uncertain)return 'Uncertain';
      if(!Number.isFinite(critical)||critical<=0)return 'SET LIMIT';
      if(count>=critical)return 'CRITICAL NOW';
      if(!flowReady)return 'WARMING';
      if(!Number.isFinite(netRate)||netRate<=0.5)return 'Stable';
      const sec=((critical-count)/netRate)*60;
      if(sec>900)return '15+ min';
      if(sec>=120)return `~${Math.round(sec/60)} min`;
      return `~${Math.max(5,Math.round(sec/5)*5)} sec`;
    }

    // Risk is a derived pressure index. If a venue safe capacity exists, occupancy ratio dominates.
    // Otherwise it uses LIVE visual crowd evidence from detector geometry (count density + bbox packing).
    function pressureRisk(z,count,growth,netRate,visualPressure){
      let base;
      if(Number.isFinite(z.criticalOccupancy)&&z.criticalOccupancy>0){
        base=clamp(count/z.criticalOccupancy,0,1.25)*82;
      }else{
        base=clamp(Number(visualPressure)||0,0,100)*0.92;
      }
      const growthBonus=clamp(Math.max(0,growth)*.35,0,8);
      const netBonus=clamp(Math.max(0,netRate)*.20,0,7);
      return Math.round(clamp(base+growthBonus+netBonus,0,100));
    }
    function label(r){return r>=82?'CRITICAL':r>=62?'HIGH RISK':r>=38?'MODERATE':'SAFE';}

    function ingest(frame,profile){
      const now=Number.isFinite(frame.videoTimeMs)?frame.videoTimeMs:0,defs=(profile&&profile.zones)||[];
      if(!Object.keys(history).length)reset(profile);
      defs.forEach(z=>push(z.id,(frame.counts&&frame.counts[z.id])||0,now));
      const samples=Math.max(0,...Object.values(history).map(h=>h.length));
      const temporalReady=samples>=cfg.minSamples;
      const quality=Number.isFinite(frame.modelConfidence)?frame.modelConfidence:0;
      const uncertain=quality<cfg.minQualityForDecision;

      const zones=defs.map(z=>{
        const count=stable(z.id),growth=trend(z.id);
        const flow=(frame.rollingFlow&&frame.rollingFlow[z.id])||{inflowPerMin:0,outflowPerMin:0,windowSec:0,ready:false};
        const inflow=flow.ready?flow.inflowPerMin:0,outflow=flow.ready?flow.outflowPerMin:0,netRate=inflow-outflow;
        const areaFraction=Math.max(.001,z.rect.w*z.rect.h);
        const visualDensity=count/(areaFraction*10);
        const physicalDensity=(Number.isFinite(z.areaM2)&&z.areaM2>0)?count/z.areaM2:null;
        const critical=(Number.isFinite(z.criticalOccupancy)&&z.criticalOccupancy>0)?z.criticalOccupancy:null;
        const evidence=(frame.crowdEvidence&&frame.crowdEvidence[z.id])||{};
        const visualPressure=Number.isFinite(evidence.visualPressure)?evidence.visualPressure:clamp((visualDensity-.35)/2.2*100,0,100);
        const risk=pressureRisk(z,count,growth,netRate,visualPressure);
        return Object.assign({},z,{
          count,observedCount:(frame.observedCounts&&frame.observedCounts[z.id])||0,recoveredCount:(frame.recoveredCounts&&frame.recoveredCounts[z.id])||0,
          growth,inflow,outflow,net:netRate,flowWindowSec:flow.windowSec,flowReady:flow.ready,
          visualDensity,physicalDensity,criticalOccupancy:critical,visualPressure,
          bboxPacking:Number(evidence.bboxPacking)||0,countPressure:Number(evidence.countPressure)||0,
          risk,riskLabel:label(risk),
          densityDisplay:physicalDensity!==null?`${physicalDensity.toFixed(2)} p/m²`:`${visualDensity.toFixed(2)} p/10% frame`,
          densityCalibrated:physicalDensity!==null,
          ttc:ttc(count,critical,netRate,flow.ready,uncertain),
          spare:critical!==null?Math.max(0,critical-count):null,
          uncertain,calibrating:!temporalReady
        });
      });

      const sorted=[...zones].sort((a,b)=>b.risk-a.risk),focus=sorted[0]||null;
      const alternatives=zones.filter(z=>!focus||z.id!==focus.id).sort((a,b)=>a.risk-b.risk),best=alternatives[0]||null;
      let action;
      // High visual pressure must NEVER be hidden behind a time-series warm-up state.
      if(focus&&focus.risk>=62){
        action={type:'reroute',text:`IMMEDIATE CROWD PRESSURE · REDUCE FLOW IN ${focus.label}`,
          reason:`${focus.label} is already visually classified ${focus.riskLabel} from live crowd packing evidence${temporalReady?' plus measured trend/flow':' while trend/flow are still warming'}.`,
          confidence:Math.min(92,Math.max(55,quality)),sourceId:focus.id,targetId:best?best.id:null};
      }else if(uncertain){
        action={type:'verify',text:'VISION UNCERTAIN · MANUAL CHECK',reason:`Perception confidence is ${quality}%. Low-risk output is not trusted when vision quality is weak.`,confidence:quality,targetId:null};
      }else if(focus&&focus.risk>=38&&best){
        action={type:'reroute',text:`REDUCE FLOW IN ${focus.label}`,reason:`${focus.label} has the highest live crowd-pressure index.`,confidence:Math.min(92,quality),sourceId:focus.id,targetId:best.id};
      }else if(!temporalReady){
        action={type:'wait',text:'MONITOR · FLOW METRICS WARMING',reason:'Current visual crowd pressure is low; collecting video-time samples for growth and flow.',confidence:Math.max(45,quality),targetId:null};
      }else{
        action={type:'keep',text:'MONITOR · NO ACTION',reason:'Current measured crowd-pressure index is below the intervention threshold.',confidence:Math.min(92,quality),targetId:null};
      }
      return {zones,focus,best,action,total:frame.total||0,observedTotal:frame.observedTotal||0,recoveredTotal:frame.recoveredTotal||0,modelConfidence:quality,quality:frame.quality||null,ready:temporalReady,temporalReady,uncertain,samples};
    }
    return {reset,ingest};
  }
  global.createIntelligenceEngine=createIntelligenceEngine;
})(window);
