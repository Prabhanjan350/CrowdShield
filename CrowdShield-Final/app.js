/* CrowdShield REAL MODE — one analysis path for every video.
   No filename profiles, no video-specific count floors, no forced recommendations. */
(function(){
  'use strict';

  const input=document.getElementById('videoInput');
  const video=document.getElementById('video');
  const canvas=document.getElementById('detectCanvas');
  const ui=createCrowdShieldUI();
  const vision=createVisionEngine({confidence:.30,maxDetections:100,minHeightRatio:.020,minWidthRatio:.004,modelBase:'mobilenet_v2',carryMisses:2,confirmHits:2});
  const intelligence=createIntelligenceEngine({historyMs:12000,trendMs:8000,minSamples:3,minQualityForDecision:56});

  const SAMPLE_MS=1250;
  let timer=null,analysing=false,busy=false,modelReady=false;
  let currentFile=null,currentUrl=null,transcodedUrl=null;
  let transcodeAttempted=false,transcoding=false,ffmpegInstance=null;
  let profile=null;

  const transcodeBox=document.getElementById('transcodeStatus');
  const transcodeText=document.getElementById('transcodeText');
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function showTranscode(text,show=true){
    if(transcodeText)transcodeText.textContent=text;
    if(transcodeBox)transcodeBox.classList.toggle('active',!!show);
  }

  function safeExt(name){
    const m=(name||'').toLowerCase().match(/\.([a-z0-9]{1,8})$/);
    return m?m[1]:'bin';
  }

  function stop(){
    analysing=false;
    if(timer){clearTimeout(timer);timer=null;}
  }

  function dynamicProfile(videoEl){
    const w=videoEl.videoWidth||1280,h=videoEl.videoHeight||720;
    const aspect=w/Math.max(1,h);
    // Generic spatial lanes. These are analysis regions, not claimed physical exits.
    const n=aspect>=2.15?4:(aspect>=1.15?3:2);
    const labels=['ZONE A','ZONE B','ZONE C','ZONE D'];
    const colors=['#58d68d'];
    const zones=[];
    const top=.08,bottom=.98,zoneH=bottom-top;
    for(let i=0;i<n;i++){
      const rect={x:i/n,y:top,w:1/n,h:zoneH};
      // IMPORTANT: keep the proven TRUE_METRICS intelligence contract unchanged.
      // criticalOccupancy is fed only by the operator's practical "Safe capacity" field.
      // routeWidthM is display/context metadata only and NEVER changes classification.
      zones.push({
        id:`zone-${i+1}`,
        label:labels[i],
        rect,
        areaM2:null,
        criticalOccupancy:null,
        routeWidthM:null,
        color:colors[0],
        enhancedDetection:false,
        auto:true
      });
    }
    return {
      id:'real-dynamic',
      name:`Live Dynamic Scene · ${n} analysis zones`,
      dynamic:true,
      generic:true,
      zones,
      entrances:[]
    };
  }


  function renderMetricCalibration(){
    const host=document.getElementById('metricCalibrationRows');
    if(!host||!profile)return;
    host.innerHTML='';
    profile.zones.forEach(z=>{
      const row=document.createElement('div');row.className='metric-cal-row';
      row.innerHTML=`<span class="cal-zone-name">${z.label}</span><label class="cal-field"><span>Safe capacity</span><input type="number" min="1" step="1" placeholder="e.g. 30" aria-label="${z.label} safe occupancy capacity"><small>people</small></label><label class="cal-field"><span>Effective route width</span><input type="number" min="0.1" step="0.1" placeholder="e.g. 2.4" aria-label="${z.label} effective route width metres"><small>metres</small></label>`;
      const [cap,width]=row.querySelectorAll('input');
      cap.addEventListener('change',()=>{
        const v=Number(cap.value);
        // Translation layer ONLY: the proven engine still consumes criticalOccupancy.
        z.criticalOccupancy=Number.isFinite(v)&&v>0?Math.round(v):null;
        intelligence.reset(profile);
        ui.addEvent('Venue limit updated',`${z.label} safe capacity ${z.criticalOccupancy?z.criticalOccupancy+' people':'cleared'}.`);
      });
      width.addEventListener('change',()=>{
        const v=Number(width.value);
        // Contextual display metric only. It does not feed risk, TTC, or zone classification.
        z.routeWidthM=Number.isFinite(v)&&v>0?v:null;
        ui.addEvent('Venue geometry updated',`${z.label} effective route width ${z.routeWidthM?z.routeWidthM+' m':'cleared'}.`);
      });
      host.appendChild(row);
    });
  }

  function initialiseScene(){
    if(!video.videoWidth||!video.videoHeight)return false;
    profile=dynamicProfile(video);
    intelligence.reset(profile);
    vision.resetTracking();
    ui.renderProfile(profile);
    renderMetricCalibration();
    ui.addEvent('Dynamic scene initialized',`${profile.zones.length} live analysis zones created from the video geometry. No saved video calibration was used.`);
    return true;
  }

  async function analyseOnce(){
    if(!profile||busy||video.paused||video.ended||video.readyState<2)return;
    busy=true;
    try{
      const frame=await vision.analyse(video,canvas,profile);
      // Absolutely no profile-specific substitution happens here.
      const analysis=intelligence.ingest(frame,profile);
      // Repaint person rectangles from LIVE risk: green=low, yellow=moderate, red=high/critical.
      vision.renderRisk(canvas,frame,analysis);
      ui.renderAnalysis(analysis);
      ui.setStatus(`Live model · ${frame.observedTotal} seen + ${frame.recoveredTotal} short-term recovered · quality ${frame.modelConfidence}%`);
    }catch(err){
      console.error('Live inference failed',err);
      ui.setStatus('Live detector error · playback continues');
      ui.addEvent('Inference warning',err&&err.message?err.message:String(err));
    }finally{
      busy=false;
    }
  }

  function start(){
    stop();
    analysing=true;
    const loop=async()=>{
      if(!analysing)return;
      await analyseOnce();
      if(analysing)timer=setTimeout(loop,SAMPLE_MS);
    };
    timer=setTimeout(loop,180);
  }

  async function getFFmpeg(){
    if(ffmpegInstance)return ffmpegInstance;
    if(!window.FFmpeg||!window.FFmpeg.createFFmpeg)throw new Error('Video compatibility engine could not load. Check internet access.');
    ffmpegInstance=window.FFmpeg.createFFmpeg({
      log:false,
      corePath:'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
      progress:({ratio})=>{
        if(Number.isFinite(ratio))showTranscode(`Converting video locally… ${clamp(Math.round(ratio*100),0,100)}%`);
      }
    });
    if(!ffmpegInstance.isLoaded()){
      showTranscode('Loading video compatibility engine…');
      await ffmpegInstance.load();
    }
    return ffmpegInstance;
  }

  async function transcodeForBrowser(file){
    if(transcoding||transcodeAttempted)return;
    transcodeAttempted=true;
    transcoding=true;
    stop();
    try{
      video.pause();
      if(file.size>350*1024*1024)throw new Error('Video is over 350 MB; browser-side conversion may exhaust memory. Use a shorter clip or preprocess it once with FFmpeg.');
      showTranscode('Browser cannot decode this codec. Converting to H.264 MP4 locally…');
      ui.setStatus('Converting video for browser compatibility…');
      ui.addEvent('Compatibility conversion started',`${file.name} will be converted locally; the file is not uploaded to a server by CrowdShield.`);

      const ff=await getFFmpeg();
      const inName=`input_${Date.now()}.${safeExt(file.name)}`;
      const outName=`crowdshield_${Date.now()}.mp4`;
      ff.FS('writeFile',inName,await window.FFmpeg.fetchFile(file));
      try{
        await ff.run('-i',inName,'-map','0:v:0','-an','-vf',"scale=w='min(1280,iw)':h=-2",'-r','24','-c:v','libx264','-preset','ultrafast','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart',outName);
      }catch(first){
        console.warn('Primary transcode failed; retrying',first);
        try{ff.FS('unlink',outName)}catch(_){}
        await ff.run('-i',inName,'-an','-c:v','libx264','-preset','ultrafast','-crf','27','-pix_fmt','yuv420p',outName);
      }
      const data=ff.FS('readFile',outName);
      try{ff.FS('unlink',inName)}catch(_){}
      try{ff.FS('unlink',outName)}catch(_){}
      if(transcodedUrl)URL.revokeObjectURL(transcodedUrl);
      transcodedUrl=URL.createObjectURL(new Blob([data.buffer],{type:'video/mp4'}));
      if(currentUrl&&currentUrl!==transcodedUrl)URL.revokeObjectURL(currentUrl);
      currentUrl=transcodedUrl;
      profile=null;
      video.src=currentUrl;
      video.load();
      showTranscode('Conversion complete · analysing the browser-safe copy.');
      ui.addEvent('Compatibility conversion complete','Converted video is now entering the same live dynamic analysis pipeline.');
    }catch(err){
      console.error('Transcode failed',err);
      showTranscode(`Conversion failed: ${err&&err.message?err.message:String(err)}`);
      ui.setStatus('Video could not be decoded or converted');
      ui.addEvent('Video compatibility error',err&&err.message?err.message:String(err));
    }finally{
      transcoding=false;
    }
  }

  function loadModel(){
    ui.setStatus('Loading person detector…');
    return vision.load().then(()=>{
      modelReady=true;
      ui.setStatus(profile?'Person detector ready · live analysis active':'Person detector ready · waiting for video');
      ui.addEvent('Detection model ready','COCO-SSD MobileNet v2 loaded with multi-scale zone crops, duplicate suppression and short-term anonymous track recovery. No static crowd counts are used.');
      if(profile&&video.readyState>=2)video.play().catch(()=>{});
    }).catch(err=>{
      modelReady=false;
      ui.setStatus('Person detector unavailable · check internet/CDN access');
      ui.addEvent('Detection model unavailable',err&&err.message?err.message:String(err));
      console.error(err);
    });
  }

  document.getElementById('uploadBtn').addEventListener('click',()=>input.click());
  input.addEventListener('change',e=>{
    const file=e.target.files&&e.target.files[0];
    if(!file)return;
    stop();
    currentFile=file;
    profile=null;
    transcodeAttempted=false;
    showTranscode('',false);
    vision.resetTracking();
    vision.clear(canvas);
    if(currentUrl)URL.revokeObjectURL(currentUrl);
    if(transcodedUrl){URL.revokeObjectURL(transcodedUrl);transcodedUrl=null;}
    currentUrl=URL.createObjectURL(file);
    ui.setFile(file);
    ui.showVideo();
    ui.setStatus('Decoding video…');
    ui.addEvent('Video uploaded',`${file.name} will be analysed dynamically. No filename-specific scenario is selected.`);
    video.src=currentUrl;
    video.load();
    if(!modelReady)loadModel();
  });

  video.addEventListener('loadedmetadata',()=>{
    if(!currentFile)return;
    initialiseScene();
    ui.setStatus(modelReady?'Dynamic scene ready · starting analysis':'Dynamic scene ready · loading detector…');
  });

  video.addEventListener('loadeddata',()=>{
    if(!profile)initialiseScene();
    if(modelReady&&profile)video.play().catch(()=>{});
  });

  video.addEventListener('canplay',()=>{
    if(!profile)initialiseScene();
    if(transcodedUrl)showTranscode('Converted video ready · live analysis active.');
  });

  video.addEventListener('play',()=>{
    if(!profile)initialiseScene();
    if(!profile)return;
    if(!modelReady){
      video.pause();
      ui.setStatus('Waiting for person detector…');
      return;
    }
    ui.addEvent('Live analysis started',`${profile.name}: live detections, tracking, density, flow and forecasting enabled.`);
    start();
  });

  video.addEventListener('pause',stop);
  video.addEventListener('seeking',()=>{vision.resetTracking();intelligence.reset(profile||{zones:[]});});
  video.addEventListener('ended',()=>{
    stop();
    ui.setProgress(100);
    ui.setStatus('Dynamic video analysis complete · final observed state shown');
    ui.addEvent('Analysis complete','Final result is based on the detector/tracker history from this video only.');
  });
  video.addEventListener('timeupdate',()=>ui.setProgress(video.duration?(video.currentTime/video.duration)*100:0));

  video.addEventListener('error',()=>{
    const err=video.error;
    console.warn('HTML5 video error',err&&err.code,err&&err.message);
    if(currentFile&&!transcodeAttempted){
      transcodeForBrowser(currentFile);
    }else if(!transcoding){
      ui.setStatus('Video could not be decoded in this browser');
      ui.addEvent('Video load error',err&&err.message?err.message:`Media error ${err&&err.code?err.code:'unknown'}`);
    }
  });

  // Preload detector after page load; upload does not depend on it finishing first.
  loadModel();
})();
