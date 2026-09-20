/** Owner-supplied ElevenLabs ambience, decoded only after entering Neon. */
export class RainAudio {
  private readonly gain:GainNode;
  private source:AudioBufferSourceNode|null=null;
  private readonly body:BiquadFilterNode;
  private readonly abort=new AbortController();
  private disposed=false;
  private exposure=-1;
  private status='loading';
  constructor(private readonly ctx:AudioContext,master:AudioNode){
    this.gain=ctx.createGain();this.gain.gain.value=0;this.gain.connect(master);
    // Add body to the actual recording, rather than another synthetic hiss bed.
    this.body=ctx.createBiquadFilter();this.body.type='lowshelf';
    this.body.frequency.value=650;this.body.gain.value=3;this.body.connect(this.gain);
    void fetch('/circuits/neon-rain.mp3',{signal:this.abort.signal}).then(r=>{if(!r.ok)throw new Error('Rain unavailable');return r.arrayBuffer();})
      .then(b=>ctx.decodeAudioData(b)).then(buffer=>{
        if(this.disposed)return;
        // Overlap the tail and head of the supplied short clip to avoid clicks.
        const overlap=Math.min(Math.round(ctx.sampleRate*.22),Math.floor(buffer.length/4));
        const loop=ctx.createBuffer(buffer.numberOfChannels,buffer.length-overlap,buffer.sampleRate);
        for(let ch=0;ch<buffer.numberOfChannels;ch++){
          const input=buffer.getChannelData(ch),output=loop.getChannelData(ch);output.set(input.subarray(overlap));
          for(let i=0;i<overlap;i++){const t=i/(overlap-1),j=output.length-overlap+i;output[j]=input[buffer.length-overlap+i]*Math.cos(t*Math.PI/2)+input[i]*Math.sin(t*Math.PI/2);}
        }
        // The supplied clip is about -33 dB RMS and leans right. Match channel
        // energy without collapsing its stereo detail; leave transient headroom.
        for(let ch=0;ch<loop.numberOfChannels;ch++){
          const data=loop.getChannelData(ch);let energy=0,peak=0;
          for(const sample of data){energy+=sample*sample;peak=Math.max(peak,Math.abs(sample));}
          const rms=Math.sqrt(energy/data.length);
          const level=rms>1e-6?Math.min(2.5,.04/rms,.7/Math.max(peak,1e-6)):1;
          for(let i=0;i<data.length;i++)data[i]*=level;
        }
        this.source=ctx.createBufferSource();this.source.buffer=loop;this.source.loop=true;this.source.connect(this.body);this.source.start();this.status='ready';
      }).catch(()=>{if(!this.disposed)this.status='unavailable';});
  }
  update(exposure:number){
    exposure=Math.max(0,Math.min(1,exposure));
    if(exposure===this.exposure)return;
    this.exposure=exposure;
    const now=this.ctx.currentTime;this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value,now);
    // A finite ramp reaches true silence under the roof, not an endless tail.
    this.gain.gain.linearRampToValueAtTime(this.exposure*.5,now+(this.exposure===0?.06:.22));
  }
  getDiagnostics(){return{status:this.status,exposure:this.exposure,gain:Number(this.gain.gain.value.toFixed(4)),sources:this.source?1:0};}
  dispose(){this.disposed=true;this.abort.abort();this.source?.stop();this.source?.disconnect();this.source=null;this.body.disconnect();this.gain.disconnect();}
}
