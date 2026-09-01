/* CrowdShield — LIVE PERCEPTION ENGINE
   No video-specific fallback counts.
   Reliability strategy: multi-scale zone crops + NMS + anonymous track persistence + quality scoring. */
(function(global){
  'use strict';

  function createVisionEngine(options){
    const opts=Object.assign({
      confidence:.30,
      maxDetections:100,
      minHeightRatio:.020,
      minWidthRatio:.004,
      cropPadding:.08,
      carryMisses:2,
      confirmHits:2,
      nmsIoU:.42,
      modelBase:'mobilenet_v2'
    },options||{});

    let model=null;
    let tracks=[];
    let nextTrackId=1;
    let previousTimestamp=null;
    let sampleIndex=0;
    let flowEvents={};
    let firstVideoTimeMs=null;
    const FLOW_WINDOW_MS=10000;
    const FLOW_WARMUP_MS=5000;

    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    const inside=(px,py,r,w,h)=>px>=r.x*w&&px<(r.x+r.w)*w&&py>=r.y*h&&py<(r.y+r.h)*h;

    async function load(){
      if(model)return model;
      if(!global.cocoSsd)throw new Error('COCO-SSD library unavailable');
      if(global.tf&&tf.setBackend){
        try{await tf.setBackend('webgl');await tf.ready();}catch(_){/* CPU fallback is acceptable */}
      }
      model=await cocoSsd.load({base:opts.modelBase});
      return model;
    }

    function zoneAt(px,py,profile,w,h){
      for(const z of (profile.zones||[]))if(inside(px,py,z.rect,w,h))return z;
      return null;
    }

    function iou(a,b){
      const ax2=a[0]+a[2],ay2=a[1]+a[3],bx2=b[0]+b[2],by2=b[1]+b[3];
      const ix=Math.max(0,Math.min(ax2,bx2)-Math.max(a[0],b[0]));
      const iy=Math.max(0,Math.min(ay2,by2)-Math.max(a[1],b[1]));
      const inter=ix*iy;
      const union=a[2]*a[3]+b[2]*b[3]-inter;
      return union>0?inter/union:0;
    }

    function suppressDuplicates(items){
      const sorted=[...items].sort((a,b)=>b.score-a.score);
      const keep=[];
      for(const d of sorted){
        const duplicate=keep.some(k=>{
          const footDist=Math.hypot(d.foot.x-k.foot.x,d.foot.y-k.foot.y);
          const scale=Math.max(18,Math.min(d.bbox[3],k.bbox[3])*.35);
          return iou(d.bbox,k.bbox)>=opts.nmsIoU || (footDist<scale && iou(d.bbox,k.bbox)>.12);
        });
        if(!duplicate)keep.push(d);
      }
      return keep;
    }

    function mapPrediction(pred,offsetX,offsetY,scaleX,scaleY,w,h,profile,source){
      const [cx,cy,cw,ch]=pred.bbox;
      const x=offsetX+cx*scaleX,y=offsetY+cy*scaleY,bw=cw*scaleX,bh=ch*scaleY;
      if(bh<h*opts.minHeightRatio||bw<w*opts.minWidthRatio)return null;
      const foot={x:x+bw*.5,y:y+bh*.96};
      const zone=zoneAt(foot.x,foot.y,profile,w,h);
      return {bbox:[x,y,bw,bh],score:pred.score,foot,zoneId:zone?zone.id:null,zone,source};
    }

    function expandedRect(r,w,h){
      const padX=r.w*opts.cropPadding,padY=r.h*opts.cropPadding;
      const x=clamp(r.x-padX,0,1),y=clamp(r.y-padY,0,1);
      const x2=clamp(r.x+r.w+padX,0,1),y2=clamp(r.y+r.h+padY,0,1);
      return {x:x*w,y:y*h,w:(x2-x)*w,h:(y2-y)*h};
    }

    async function detectZoneCrops(video,profile,w,h){
      const all=[];
      // Cropping each spatial zone makes distant/small people occupy more of the detector input.
      for(const z of (profile.zones||[])){
        const r=expandedRect(z.rect,w,h);
        const crop=document.createElement('canvas');
        const targetW=Math.min(720,Math.max(360,Math.round(r.w*1.35)));
        const targetH=Math.max(240,Math.round(targetW*(r.h/Math.max(1,r.w))));
        crop.width=targetW;crop.height=Math.min(720,targetH);
        const c=crop.getContext('2d',{alpha:false});
        c.drawImage(video,r.x,r.y,r.w,r.h,0,0,crop.width,crop.height);
        const preds=await model.detect(crop,opts.maxDetections,opts.confidence);
        const sx=r.w/crop.width,sy=r.h/crop.height;
        for(const p of preds){
          if(p.class!=='person'||p.score<opts.confidence)continue;
          const m=mapPrediction(p,r.x,r.y,sx,sy,w,h,profile,'crop');
          if(m)all.push(m);
        }
      }
      return all;
    }

    async function detectFullFrame(video,profile,w,h){
      const preds=await model.detect(video,opts.maxDetections,opts.confidence);
      const out=[];
      for(const p of preds){
        if(p.class!=='person'||p.score<opts.confidence)continue;
        const m=mapPrediction(p,0,0,1,1,w,h,profile,'full');
        if(m)out.push(m);
      }
      return out;
    }

    function resetTracking(){
      tracks=[];nextTrackId=1;previousTimestamp=null;sampleIndex=0;flowEvents={};firstVideoTimeMs=null;
    }

    function matchTracks(detections,profile,w,h,videoTimeMs){
      const now=videoTimeMs;
      const previous=tracks;
      const usedTracks=new Set();
      const usedDetections=new Set();
      const pairs=[];

      // Build candidate matches and greedily take the best normalized distance.
      detections.forEach((d,di)=>previous.forEach((t,ti)=>{
        const predictedX=t.x+(t.vx||0),predictedY=t.y+(t.vy||0);
        const dist=Math.hypot(d.foot.x-predictedX,d.foot.y-predictedY);
        const size=Math.max(30,(t.h||d.bbox[3]||40)*1.25);
        const zonePenalty=t.zoneId&&d.zoneId&&t.zoneId!==d.zoneId?18:0;
        const cost=(dist+zonePenalty)/size;
        if(cost<=1.85)pairs.push({di,ti,cost});
      }));
      pairs.sort((a,b)=>a.cost-b.cost);

      const zoneFlow={};(profile.zones||[]).forEach(z=>{zoneFlow[z.id]={inflow:0,outflow:0};if(!flowEvents[z.id])flowEvents[z.id]=[];});
      const next=[];

      for(const p of pairs){
        if(usedTracks.has(p.ti)||usedDetections.has(p.di))continue;
        usedTracks.add(p.ti);usedDetections.add(p.di);
        const old=previous[p.ti],d=detections[p.di];
        d.trackId=old.id;
        d.hits=(old.hits||1)+1;
        d.misses=0;
        d.vx=d.foot.x-old.x;d.vy=d.foot.y-old.y;
        d.carried=false;
        if(old.zoneId!==d.zoneId){
          if(old.zoneId&&zoneFlow[old.zoneId]){zoneFlow[old.zoneId].outflow++;flowEvents[old.zoneId].push({t:videoTimeMs,type:'out'});}
          if(d.zoneId&&zoneFlow[d.zoneId]){zoneFlow[d.zoneId].inflow++;flowEvents[d.zoneId].push({t:videoTimeMs,type:'in'});}
        }
        next.push({id:d.trackId,x:d.foot.x,y:d.foot.y,vx:d.vx,vy:d.vy,h:d.bbox[3],zoneId:d.zoneId,hits:d.hits,misses:0,score:d.score,lastSeen:now,bbox:d.bbox,carried:false});
      }

      // New observations become fresh anonymous tracks.
      detections.forEach((d,di)=>{
        if(usedDetections.has(di))return;
        d.trackId=nextTrackId++;d.hits=1;d.misses=0;d.vx=0;d.vy=0;d.carried=false;
        next.push({id:d.trackId,x:d.foot.x,y:d.foot.y,vx:0,vy:0,h:d.bbox[3],zoneId:d.zoneId,hits:1,misses:0,score:d.score,lastSeen:now,bbox:d.bbox,carried:false});
      });

      // Keep only previously-confirmed tracks through very short detector dropouts.
      previous.forEach((t,ti)=>{
        if(usedTracks.has(ti))return;
        const misses=(t.misses||0)+1;
        if((t.hits||0)<opts.confirmHits||misses>opts.carryMisses)return;
        const nx=clamp(t.x+(t.vx||0),0,w),ny=clamp(t.y+(t.vy||0),0,h);
        const zone=zoneAt(nx,ny,profile,w,h);
        // Track persistence is evidence-based: it can survive only ~2 samples, never indefinitely.
        next.push(Object.assign({},t,{x:nx,y:ny,zoneId:zone?zone.id:null,misses,score:(t.score||.5)*.82,carried:true}));
      });

      tracks=next;
      const sampleIntervalSec=previousTimestamp!==null?Math.max(.01,(videoTimeMs-previousTimestamp)/1000):null;
      previousTimestamp=videoTimeMs;
      if(firstVideoTimeMs===null)firstVideoTimeMs=videoTimeMs;
      const elapsedMs=Math.max(0,videoTimeMs-firstVideoTimeMs);
      const rollingFlow={};
      (profile.zones||[]).forEach(z=>{
        flowEvents[z.id]=(flowEvents[z.id]||[]).filter(e=>videoTimeMs-e.t<=FLOW_WINDOW_MS && videoTimeMs-e.t>=0);
        const windowMs=Math.min(FLOW_WINDOW_MS,elapsedMs);
        const ready=windowMs>=FLOW_WARMUP_MS;
        const ins=flowEvents[z.id].filter(e=>e.type==='in').length,outs=flowEvents[z.id].filter(e=>e.type==='out').length;
        const minutes=Math.max(1/60,windowMs/60000);
        rollingFlow[z.id]={inflowPerMin:ready?ins/minutes:0,outflowPerMin:ready?outs/minutes:0,windowSec:windowMs/1000,ready,eventsIn:ins,eventsOut:outs};
      });
      return {zoneFlow,rollingFlow,sampleIntervalSec};
    }

    function qualityMetrics(observed,active,fullCount,tiledCount){
      const avgScore=observed.length?observed.reduce((s,d)=>s+d.score,0)/observed.length:0;
      const carried=active.filter(t=>t.carried).length;
      const confirmed=active.filter(t=>(t.hits||0)>=opts.confirmHits).length;
      const carryRatio=active.length?carried/active.length:0;
      const confirmRatio=active.length?confirmed/active.length:0;
      const disagreement=(fullCount!==null&&Math.max(fullCount,tiledCount)>0)
        ? Math.abs(fullCount-tiledCount)/Math.max(fullCount,tiledCount):0;
      let confidence=34+avgScore*38+confirmRatio*20-carryRatio*25-disagreement*18;
      if(active.length===0)confidence=Math.max(confidence,58); // empty scene can be legitimate; still not high-confidence.
      confidence=Math.round(clamp(confidence,20,96));
      let label=confidence>=75?'HIGH':confidence>=58?'MEDIUM':'LOW';
      return {confidence,label,avgScore:Math.round(avgScore*100),carried,confirmed,disagreement:Math.round(disagreement*100)};
    }

    async function analyse(video,canvas,profile){
      if(!model)await load();
      const w=video.videoWidth||960,h=video.videoHeight||540;
      const ctx=canvas.getContext('2d');canvas.width=w;canvas.height=h;ctx.clearRect(0,0,w,h);
      sampleIndex++;

      // Main count source: multi-scale per-zone crops. Every third sample also runs the full frame
      // as an independent QA view; union+NMS improves recall without hard-coded person counts.
      const tiled=await detectZoneCrops(video,profile,w,h);
      let full=[];
      if(sampleIndex%3===1)full=await detectFullFrame(video,profile,w,h);
      const observed=suppressDuplicates([...tiled,...full]);
      // Use VIDEO TIME, not wall-clock inference time, for all movement rates.
      const videoTimeMs=Math.max(0,(Number(video.currentTime)||0)*1000);
      const tracking=matchTracks(observed,profile,w,h,videoTimeMs);

      const active=tracks.filter(t=>t.zoneId);
      const counts={};const observedCounts={};const recoveredCounts={};
      (profile.zones||[]).forEach(z=>{counts[z.id]=0;observedCounts[z.id]=0;recoveredCounts[z.id]=0;});
      observed.forEach(d=>{if(d.zoneId)observedCounts[d.zoneId]=(observedCounts[d.zoneId]||0)+1;});
      active.forEach(t=>{
        counts[t.zoneId]=(counts[t.zoneId]||0)+1;
        if(t.carried)recoveredCounts[t.zoneId]=(recoveredCounts[t.zoneId]||0)+1;
      });

      // LIVE crowd evidence for occlusion-resistant pressure classification.
      // This does NOT invent extra people. It measures how tightly the actual detected person boxes
      // pack each zone, alongside the tracked-person density. Dense occluded scenes therefore remain
      // visually high-pressure even when COCO cannot separate every individual.
      const crowdEvidence={};
      (profile.zones||[]).forEach(z=>{
        const zx=z.rect.x*w,zy=z.rect.y*h,zw=z.rect.w*w,zh=z.rect.h*h,zoneArea=Math.max(1,zw*zh);
        let boxAreaSum=0;
        observed.forEach(d=>{
          if(d.zoneId!==z.id)return;
          const [x,y,bw,bh]=d.bbox;
          const ix=Math.max(0,Math.min(x+bw,zx+zw)-Math.max(x,zx));
          const iy=Math.max(0,Math.min(y+bh,zy+zh)-Math.max(y,zy));
          boxAreaSum+=ix*iy;
        });
        const bboxPacking=clamp(boxAreaSum/zoneArea,0,1.35);
        const areaFraction=Math.max(.001,z.rect.w*z.rect.h);
        const pp10=(counts[z.id]||0)/(areaFraction*10);
        // Count pressure is deliberately much more sensitive than the old /6 heuristic.
        // ~0.35 p/10% frame = sparse; ~1.2 = moderate; ~2.2+ = very crowded.
        const countPressure=clamp((pp10-.35)/1.85*100,0,100);
        // Bounding-box packing captures visible crowd occlusion/packing without changing person count.
        const packingPressure=clamp((bboxPacking-.08)/.52*100,0,100);
        const visualPressure=Math.round(clamp(Math.max(countPressure*.72+packingPressure*.28,packingPressure*.88),0,100));
        crowdEvidence[z.id]={bboxPacking,countPressure,packingPressure,visualPressure};
      });

      // Initial draw; app immediately recolours these boxes from the computed live risk state.
      observed.forEach(d=>{
        const [x,y,bw,bh]=d.bbox,color=(d.zone&&d.zone.color)||'#5de1e6';
        ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;ctx.setLineDash([]);ctx.strokeRect(x,y,bw,bh);
        ctx.font='12px Inter';ctx.fillText(d.zone?`Person · ${d.zone.label}`:'Person',x,Math.max(12,y-4));
        ctx.beginPath();ctx.arc(d.foot.x,d.foot.y,3,0,Math.PI*2);ctx.fill();
      });
      active.filter(t=>t.carried).forEach(t=>{
        const z=(profile.zones||[]).find(x=>x.id===t.zoneId);ctx.strokeStyle=(z&&z.color)||'#f5c451';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);
        const [x,y,bw,bh]=t.bbox||[t.x-10,t.y-30,20,30];ctx.strokeRect(x+(t.vx||0),y+(t.vy||0),bw,bh);ctx.setLineDash([]);
      });

      const q=qualityMetrics(observed,active,full.length?full.length:null,tiled.length);
      return {
        counts,observedCounts,recoveredCounts,
        entranceCounts:{},
        zoneFlow:tracking.zoneFlow,
        rollingFlow:tracking.rollingFlow,
        sampleIntervalSec:tracking.sampleIntervalSec,
        detections:observed,
        total:active.length,
        observedTotal:observed.length,
        recoveredTotal:q.carried,
        timestamp:videoTimeMs,
        videoTimeMs,
        modelConfidence:q.confidence,
        quality:q,
        crowdEvidence,
        activeTracks:active.map(t=>Object.assign({},t)),
        qa:{tiledDetections:tiled.length,fullFrameDetections:full.length,fullFrameRan:full.length>0||sampleIndex%3===1}
      };
    }

    function renderRisk(canvas,frame,analysis){
      if(!canvas||!frame||!analysis)return;
      const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
      const color=r=>r>=62?'#ff5c6c':r>=38?'#f5c451':'#58d68d';
      const riskByZone={};(analysis.zones||[]).forEach(z=>riskByZone[z.id]=z.risk);
      (frame.detections||[]).forEach(d=>{
        const [x,y,bw,bh]=d.bbox,c=color(riskByZone[d.zoneId]||0);
        ctx.strokeStyle=c;ctx.fillStyle=c;ctx.lineWidth=2.4;ctx.setLineDash([]);ctx.strokeRect(x,y,bw,bh);
        ctx.font='12px Inter';ctx.fillText(d.zone?`Person · ${d.zone.label}`:'Person',x,Math.max(12,y-4));
        ctx.beginPath();ctx.arc(d.foot.x,d.foot.y,3,0,Math.PI*2);ctx.fill();
      });
      (frame.activeTracks||[]).filter(t=>t.carried).forEach(t=>{
        const c=color(riskByZone[t.zoneId]||0);ctx.strokeStyle=c;ctx.lineWidth=1.6;ctx.setLineDash([5,4]);
        const [x,y,bw,bh]=t.bbox||[t.x-10,t.y-30,20,30];ctx.strokeRect(x+(t.vx||0),y+(t.vy||0),bw,bh);ctx.setLineDash([]);
      });
    }

    function clear(canvas){if(canvas){const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);}}
    return {load,analyse,renderRisk,clear,resetTracking,getModel:()=>model};
  }

  global.createVisionEngine=createVisionEngine;
})(window);
