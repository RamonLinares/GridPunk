import type { Game } from '../game/Game';
import { prepareReplayAudio } from './ReplayAudio';

export async function supportsReplayMp4():Promise<boolean>{
  try{const {canEncodeVideo,canEncodeAudio}=await import('mediabunny');return await canEncodeVideo('avc',{width:1280,height:536,bitrate:5_000_000})&&await canEncodeAudio('aac',{numberOfChannels:2,sampleRate:48000,bitrate:192_000});}catch{return false;}
}

/** Deterministic frame stepping: encode time is independent of playback FPS. */
export async function exportReplay(game:Game,format:'gif'|'mp4',start:number,duration:number,signal:AbortSignal,onProgress:(value:number)=>void):Promise<Blob>{
  const fps=format==='gif'?15:30,width=format==='gif'?640:1280,height=format==='gif'?268:536;
  const total=Math.ceil(duration*fps),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:format==='gif'})!;
  const check=()=>{if(signal.aborted)throw new DOMException('Export cancelled','AbortError');};
  let worker:Worker|undefined;
  let output:import('mediabunny').Output<import('mediabunny').Mp4OutputFormat,import('mediabunny').BufferTarget>|undefined;
  let video:import('mediabunny').CanvasSource|undefined;
  const callWorker=(message:unknown,transfer:Transferable[]=[])=>new Promise<{data?:ArrayBuffer}>((resolve,reject)=>{
    const abort=()=>{cleanup();reject(new DOMException('Export cancelled','AbortError'));};
    const cleanup=()=>{signal.removeEventListener('abort',abort);worker!.onmessage=null;worker!.onerror=null;};
    worker!.onmessage=e=>{cleanup();if(e.data.error)reject(new Error(e.data.error));else resolve(e.data);};
    worker!.onerror=e=>{cleanup();reject(new Error(e.message));};
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
    worker!.postMessage(message,transfer);
  });
  game.setReplayExporting(true);
  try{
    check();
    if(format==='gif'){
      worker=new Worker(new URL('./ReplayGif.worker.ts',import.meta.url),{type:'module'});await callWorker({type:'start'});
    }else{
      const {Output,Mp4OutputFormat,BufferTarget,CanvasSource,AudioBufferSource,Quality}=await import('mediabunny');
      if(!await supportsReplayMp4())throw new Error('MP4 encoding is unavailable in this browser. Use Chrome or Safari, or save a GIF.');
      check();output=new Output({format:new Mp4OutputFormat(),target:new BufferTarget()});
      video=new CanvasSource(canvas,{codec:'avc',quality:new Quality({bitrate:5_000_000})});
      output.addVideoTrack(video,{frameRate:fps});
      const audio=new AudioBufferSource({codec:'aac',quality:new Quality({bitrate:192_000})});output.addAudioTrack(audio);
      const renderAudio=await prepareReplayAudio(game.getReplayAudioScene(),signal);check();await output.start();
      for(let offset=0;offset<duration;offset+=8){check();await audio.add(await renderAudio(start+offset,Math.min(8,duration-offset)));onProgress(.1*Math.min(1,(offset+8)/duration));}
      audio.close();
    }
    game.seekReplay(start);
    for(let i=0;i<total;i++){
      check();
      // Copy synchronously while the WebGL drawing buffer is still valid.
      const source=game.renderReplayFrame(start+i/fps,1/fps,width,height);ctx.drawImage(source,0,0,width,height);
      if(worker){const data=ctx.getImageData(0,0,width,height).data.buffer;await callWorker({type:'frame',data,width,height,delay:Math.round((i+1)*100/fps)*10-Math.round(i*100/fps)*10},[data]);}
      else await video!.add(i/fps,Math.min(1/fps,duration-i/fps));
      onProgress(format==='gif'?(i+1)/total:.1+.9*(i+1)/total);
      // Let cancel, progress UI and the browser breathe even on fast encoders.
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    check();
    if(worker){const result=await callWorker({type:'finish'});return new Blob([result.data!],{type:'image/gif'});}
    await output!.finalize();check();return new Blob([output!.target.buffer!],{type:'video/mp4'});
  }finally{
    worker?.terminate();if(output&&output.state!=='finalized'&&output.state!=='canceled')await output.cancel();
    game.setReplayExporting(false);
  }
}
