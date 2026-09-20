interface Point { x:number;y:number;z:number }
export interface HologramAudioScene { positions:readonly Point[];video:HTMLVideoElement; audioUrl?:string; gain?:number; syncVideo?:boolean }

/** A local hologram soundtrack; one decoder and one nearby speaker per track. */
export class HologramAudio {
  private buffer:AudioBuffer|null=null;
  private source:AudioBufferSourceNode|null=null;
  private disposed=false;
  private active=-1;
  private readonly level:GainNode;
  private readonly filter:BiquadFilterNode;
  private readonly pan:StereoPannerNode;
  private readonly nodes:AudioNode[]=[];
  private readonly abort=new AbortController();
  private rate=1;
  private distance=Infinity;
  private status='loading';
  private readonly output:GainNode;
  private readonly departure:GainNode;
  private headingX=0;
  private headingZ=0;

  constructor(private readonly ctx:AudioContext,master:AudioNode,private readonly scene:HologramAudioScene){
    this.level=ctx.createGain();this.level.gain.value=0;
    this.filter=ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=5000;this.filter.Q.value=.5;
    this.pan=ctx.createStereoPanner();
    this.output=ctx.createGain();this.output.gain.value=1;
    this.departure=ctx.createGain();
    this.departure.connect(this.output);
    this.level.connect(this.filter).connect(this.pan);
    const dry=ctx.createGain();dry.gain.value=.8;
    this.pan.connect(dry).connect(this.departure);
    const reverb=ctx.createConvolver();reverb.buffer=hologramImpulse(ctx);
    const wet=ctx.createGain();wet.gain.value=.32;
    this.pan.connect(reverb).connect(wet).connect(this.departure);
    const delay=ctx.createDelay(1);delay.delayTime.value=.29;
    const feedback=ctx.createGain();feedback.gain.value=.24;
    const echoFilter=ctx.createBiquadFilter();echoFilter.type='lowpass';echoFilter.frequency.value=2400;
    const echo=ctx.createGain();echo.gain.value=.23;
    this.pan.connect(delay).connect(echoFilter).connect(echo).connect(this.departure);
    echoFilter.connect(feedback).connect(delay);
    this.output.connect(master);
    this.nodes.push(this.level,this.filter,this.pan,this.output,this.departure,dry,reverb,wet,delay,feedback,echoFilter,echo);
    void fetch(scene.audioUrl??'/circuits/neon-geisha-voice.mp3',{signal:this.abort.signal}).then(r=>{
      if(!r.ok)throw new Error('Hologram audio unavailable');return r.arrayBuffer();
    }).then(bytes=>ctx.decodeAudioData(bytes)).then(buffer=>{
      if(!this.disposed){this.buffer=buffer;this.status='ready';}
    }).catch(()=>{if(!this.disposed)this.status='unavailable'});
  }
  update(position:Point,velocity:Point,rightX:number,rightZ:number){
    if(this.disposed)return;
    let index=-1,distance=Infinity;
    this.scene.positions.forEach((p,i)=>{const d=Math.hypot(p.x-position.x,p.y-position.y,p.z-position.z);if(d<distance){distance=d;index=i}});
    this.distance=distance;
    const now=this.ctx.currentTime;
    if(index<0||distance>170){
      this.level.gain.setTargetAtTime(0,now,.12);
      // Outside the audible area release the source; preserve phase on re-entry.
      if(this.source){this.source.stop();this.source.disconnect();this.source=null;}
      this.active=-1;return;
    }
    if(!this.buffer)return;
    if(!this.source||this.active!==index){
      this.source?.stop();this.source?.disconnect();
      this.source=this.ctx.createBufferSource();this.source.buffer=this.buffer;this.source.loop=true;
      this.source.connect(this.level);this.source.start(now,(this.scene.syncVideo===false?now:this.scene.video.currentTime)%this.buffer.duration);
      this.active=index;
    }
    const speed=Math.hypot(velocity.x,velocity.z);
    if(speed>1.5){this.headingX=velocity.x/speed;this.headingZ=velocity.z/speed;}
    const mix=hologramMix(this.scene,position,velocity,rightX,rightZ,this.headingX,this.headingZ);
    this.rate=mix.rate;
    this.source.playbackRate.setTargetAtTime(mix.rate,now,.09);
    this.departure.gain.setTargetAtTime(mix.departure,now,.08);
    this.pan.pan.setTargetAtTime(mix.pan,now,.08);
    this.level.gain.setTargetAtTime(mix.level,now,.12);
    this.filter.frequency.setTargetAtTime(mix.cutoff,now,.15);
  }
  setPaused(paused:boolean){
    this.output.gain.setTargetAtTime(paused?0:1,this.ctx.currentTime,.018);
    if(paused){this.source?.stop();this.source?.disconnect();this.source=null;this.active=-1;}
  }
  getDiagnostics(){return{status:this.status,emitters:this.scene.positions.length,active:this.active,distance:Number(this.distance.toFixed(1)),doppler:Number(this.rate.toFixed(3)),gain:Number(this.level.gain.value.toFixed(3)),departureGain:Number(this.departure.gain.value.toFixed(4))}}
  dispose(){this.disposed=true;this.abort.abort();this.source?.stop();this.source?.disconnect();this.source=null;this.nodes.forEach(n=>n.disconnect());this.buffer=null;}
}

/** Shared by live playback and offline MP4 mixing. */
export function hologramMix(scene:Pick<HologramAudioScene,'positions'|'gain'>,position:Point,velocity:Point,rightX:number,rightZ:number,headingX:number,headingZ:number){
  let nearest:Point|undefined,distance=Infinity;
  for(const p of scene.positions){const d=Math.hypot(p.x-position.x,p.y-position.y,p.z-position.z);if(d<distance){distance=d;nearest=p;}}
  if(!nearest||distance>170)return{rate:1,departure:0,pan:0,level:0,cutoff:1800};
  const dx=nearest.x-position.x,dy=nearest.y-position.y,dz=nearest.z-position.z;
  const closing=(velocity.x*dx+velocity.y*dy+velocity.z*dz)/Math.max(distance,1);
  const behind=Math.max(0,-dx*headingX-dz*headingZ),fade=Math.max(0,Math.min(1,(170-distance)/70));
  return{rate:Math.max(.82,Math.min(1.18,1+closing/343)),departure:Math.exp(-((behind/32)**2)),
    pan:Math.max(-.95,Math.min(.95,(dx*rightX+dz*rightZ)/Math.max(15,Math.hypot(dx,dz)))),
    level:(scene.gain??(.95*2/3))*fade*fade/(1+(distance/48)**2),cutoff:1800+4300*Math.max(0,1-distance/170)};
}
export function hologramImpulse(ctx:BaseAudioContext):AudioBuffer{
    const length=Math.floor(ctx.sampleRate*2.2),b=ctx.createBuffer(2,length,ctx.sampleRate);
    let seed=7241;
    for(let ch=0;ch<2;ch++){
      const data=b.getChannelData(ch);let low=0;
      for(let i=0;i<length;i++){
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        low=low*.65+(seed/4294967296*2-1)*.35;
        const t=i/ctx.sampleRate;data[i]=t<.035?0:low*Math.exp(-t*3.1)*Math.min(1,(t-.035)*60);
      }
    }return b;
  }
