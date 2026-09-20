import type { Game } from '../game/Game';
import engineUrl from '../assets/audio/engine-load-loop.mp3';
import { replayMotion } from './LapReplay';
import { hologramImpulse, hologramMix } from './HologramAudio';

const SAMPLE_RATE=48000,STEP=.05;
type Mix=ReturnType<typeof hologramMix>;
interface Cue {time:number;engineRate:number;engineGain:number;cutoff:number;rain:number;tunnel:number;voices:Mix[];phases:number[]}

/** Reconstruct audio on the lap clock, independent of video encoding speed.
 * Eight-second chunks and a three-second reverb preroll bound PCM memory.
 * These are the original ambience clips; no microphone/live-tab capture.
 */
export async function prepareReplayAudio(scene:ReturnType<Game['getReplayAudioScene']>,signal:AbortSignal){
  const check=()=>signal.throwIfAborted();
  const decoder=new OfflineAudioContext(2,1,SAMPLE_RATE);
  const decode=async(url:string)=>{
    const response=await fetch(url,{signal});if(!response.ok)throw new Error(`Replay audio could not load: ${url}`);
    const buffer=await decoder.decodeAudioData(await response.arrayBuffer());check();return buffer;
  };
  const [engine,rain,...voices]=await Promise.all([decode(engineUrl),scene.rain?decode('/circuits/neon-rain.mp3'):Promise.resolve(null),
    ...scene.holograms.map(s=>decode(s.audioUrl??'/circuits/neon-geisha-voice.mp3'))]);
  // Match the seamless rain loop and its measured normalization in RainAudio.
  const seamless=(buffer:AudioBuffer,seconds:number,rainLoop=false)=>{
    const overlap=Math.min(Math.floor(buffer.sampleRate*seconds),Math.floor(buffer.length/4));
    const result=decoder.createBuffer(buffer.numberOfChannels,buffer.length-overlap,buffer.sampleRate);
    for(let ch=0;ch<buffer.numberOfChannels;ch++){
      const input=buffer.getChannelData(ch),out=result.getChannelData(ch);
      out.set(input.subarray(rainLoop?overlap:0,rainLoop?buffer.length:result.length));
      for(let i=0;i<overlap;i++){
        const angle=i/overlap*Math.PI/2;
        if(rainLoop)out[result.length-overlap+i]=input[buffer.length-overlap+i]*Math.cos(angle)+input[i]*Math.sin(angle);
        else out[i]=input[buffer.length-overlap+i]*Math.cos(angle)+input[i]*Math.sin(angle);
      }
      if(rainLoop){let sum=0,peak=0;for(const x of out){sum+=x*x;peak=Math.max(peak,Math.abs(x));}
        const gain=Math.min(2.5,.04/Math.max(1e-9,Math.sqrt(sum/out.length)),.7/Math.max(1e-9,peak));for(let i=0;i<out.length;i++)out[i]*=gain;}
    }return result;
  };
  const engineLoop=seamless(engine,.12),rainLoop=rain?seamless(rain,.22,true):null;
  const cues:Cue[]=[];let headingX=0,headingZ=0;
  const count=Math.ceil(scene.lap.duration/STEP);
  for(let i=0;i<=count;i++){
    check();const time=Math.min(i*STEP,scene.lap.duration),m=replayMotion(scene.lap,time),speed=Math.hypot(m.velocity.x,m.velocity.z);
    if(speed>1.5){headingX=m.velocity.x/speed;headingZ=m.velocity.z/speed;}
    const exposure=scene.exposure(m.position),rpm=Math.max(1000,m.telemetry.rpm),throttle=m.telemetry.throttle,rev=Math.max(0,Math.min(1,(rpm-3500)/11500));
    const mixes=scene.holograms.map(s=>hologramMix(s,m.position,m.velocity,m.right.x,m.right.z,headingX,headingZ));
    const cue:Cue={time,engineRate:Math.max(.42,Math.min(1.7,rpm/9000)),engineGain:(.068+rev*.052)*(.36+throttle*.64)*.78*(.72+throttle*.28),
      cutoff:(1450+rev*3300+throttle*1850)*(1-exposure.tunnel*.08),rain:exposure.rain*.5,tunnel:exposure.tunnel,voices:mixes,phases:[]};
    const rates=[cue.engineRate,...mixes.map(m=>m.rate)],previous=cues.at(-1);
    cue.phases=rates.map((rate,k)=>previous?previous.phases[k]+(time-previous.time)*(rate+(k===0?previous.engineRate:previous.voices[k-1].rate))/2:Math.max(0,m.worldTime));
    cues.push(cue);if(i%200===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  function at(time:number):Cue{
    const index=Math.min(cues.length-1,Math.floor(time/STEP)),a=cues[index],b=cues[Math.min(index+1,cues.length-1)];
    const dt=Math.max(0,time-a.time),u=b.time>a.time?dt/(b.time-a.time):0,lerp=(x:number,y:number)=>x+(y-x)*u;
    const mix=(x:Mix,y:Mix):Mix=>({rate:lerp(x.rate,y.rate),level:lerp(x.level,y.level),pan:lerp(x.pan,y.pan),departure:lerp(x.departure,y.departure),cutoff:lerp(x.cutoff,y.cutoff)});
    const result={time,engineRate:lerp(a.engineRate,b.engineRate),engineGain:lerp(a.engineGain,b.engineGain),cutoff:lerp(a.cutoff,b.cutoff),rain:lerp(a.rain,b.rain),tunnel:lerp(a.tunnel,b.tunnel),voices:a.voices.map((v,k)=>mix(v,b.voices[k])),phases:[] as number[]};
    result.phases=a.phases.map((phase,k)=>phase+dt*((k===0?a.engineRate:a.voices[k-1].rate)+(k===0?result.engineRate:result.voices[k-1].rate))/2);
    return result;
  }
  return async(start:number,duration:number):Promise<AudioBuffer>=>{
    check();const from=Math.max(0,start-3),skip=Math.round((start-from)*SAMPLE_RATE),length=Math.round(duration*SAMPLE_RATE);
    const ctx=new OfflineAudioContext(2,skip+length,SAMPLE_RATE),initial=at(from);
    const master=ctx.createGain();master.gain.value=.68;
    const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-14;compressor.knee.value=14;compressor.ratio.value=5;compressor.attack.value=.004;compressor.release.value=.16;
    master.connect(compressor).connect(ctx.destination);
    const schedule=(param:AudioParam,value:(cue:Cue)=>number)=>{
      param.setValueAtTime(value(initial),0);
      for(let i=Math.floor(from/STEP)+1;i<cues.length&&cues[i].time<start+duration;i++)param.linearRampToValueAtTime(value(cues[i]),cues[i].time-from);
      param.linearRampToValueAtTime(value(at(start+duration)),start+duration-from);
    };
    const loop=(buffer:AudioBuffer,offset:number)=>{const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;source.start(0,offset%buffer.duration);return source;};
    const motor=loop(engineLoop,initial.phases[0]),motorGain=ctx.createGain(),motorFilter=ctx.createBiquadFilter();motorFilter.type='lowpass';
    motor.connect(motorGain).connect(motorFilter).connect(master);schedule(motor.playbackRate,c=>c.engineRate);schedule(motorGain.gain,c=>c.engineGain);schedule(motorFilter.frequency,c=>c.cutoff);
    const room=ctx.createConvolver();room.buffer=hologramImpulse(ctx);const roomGain=ctx.createGain();motorFilter.connect(room).connect(roomGain).connect(master);schedule(roomGain.gain,c=>c.tunnel*.35);
    if(rainLoop){const source=loop(rainLoop,from+scene.lap.frames[0].worldTime),shelf=ctx.createBiquadFilter(),gain=ctx.createGain();shelf.type='lowshelf';shelf.frequency.value=650;shelf.gain.value=3;source.connect(shelf).connect(gain).connect(master);schedule(gain.gain,c=>c.rain);}
    voices.forEach((buffer,k)=>{
      const source=loop(buffer,initial.phases[k+1]),level=ctx.createGain(),filter=ctx.createBiquadFilter(),pan=ctx.createStereoPanner(),departure=ctx.createGain();filter.type='lowpass';filter.Q.value=.5;
      source.connect(level).connect(filter).connect(pan);departure.connect(master);
      const dry=ctx.createGain();dry.gain.value=.8;pan.connect(dry).connect(departure);
      const reverb=ctx.createConvolver();reverb.buffer=hologramImpulse(ctx);const wet=ctx.createGain();wet.gain.value=.32;pan.connect(reverb).connect(wet).connect(departure);
      const delay=ctx.createDelay(1);delay.delayTime.value=.29;const echoFilter=ctx.createBiquadFilter();echoFilter.type='lowpass';echoFilter.frequency.value=2400;
      const echo=ctx.createGain();echo.gain.value=.23;const feedback=ctx.createGain();feedback.gain.value=.24;
      pan.connect(delay).connect(echoFilter).connect(echo).connect(departure);echoFilter.connect(feedback).connect(delay);
      schedule(source.playbackRate,c=>c.voices[k].rate);schedule(level.gain,c=>c.voices[k].level);schedule(pan.pan,c=>c.voices[k].pan);schedule(departure.gain,c=>c.voices[k].departure);schedule(filter.frequency,c=>c.voices[k].cutoff);
    });
    const rendered=await ctx.startRendering();check();
    const trimmed=new AudioBuffer({numberOfChannels:2,length,sampleRate:SAMPLE_RATE});
    for(let ch=0;ch<2;ch++)trimmed.copyToChannel(rendered.getChannelData(ch).subarray(skip,skip+length),ch);
    return trimmed;
  };
}
