import type { Game } from '../game/Game';
import { formatTime } from './Timing';
import { exportReplay,supportsReplayMp4 } from './ReplayExport';

export function installReplayPanel(game:Game,circuit:string,signal:AbortSignal){
  const button=document.createElement('button');button.id='session-replay';button.className='secondary-button';button.type='button';button.textContent='WATCH LAST LAP';button.hidden=true;
  const hint=document.createElement('p');hint.className='replay-menu-hint';hint.id='replay-menu-hint';button.setAttribute('aria-describedby',hint.id);
  document.querySelector('#session-restart')!.after(button,hint);
  const panel=document.createElement('section');panel.id='replay-panel';panel.hidden=true;panel.setAttribute('aria-label','Cinematic lap replay');
  panel.innerHTML=`<header class="replay-header"><div><span class="replay-eyebrow">GRIDPUNK / CINEMA</span><h2>Last lap</h2><p id="replay-lap-meta"></p></div><button id="replay-close" type="button">← BACK TO SESSION</button></header>
    <div class="replay-controls"><div class="replay-transport"><button id="replay-play" type="button">PAUSE</button><span id="replay-time"></span><label class="sr-only" for="replay-seek">Replay position</label><input id="replay-seek" type="range" min="0" step="0.05" value="0"><span id="replay-duration"></span></div>
    <div class="replay-export-row"><span class="replay-eyebrow">SAVE YOUR LAP</span><button id="replay-gif" type="button">GIF · 20s</button><button id="replay-mp4" type="button" disabled>MP4 · CHECKING…</button><button id="replay-cancel" type="button" hidden>CANCEL EXPORT</button><a id="replay-download" hidden>DOWNLOAD</a></div>
    <p id="replay-export-status" role="status">2.39:1 CinemaScope · GIF: 20s from playhead · MP4: full lap with sound · GIF is silent · Saved on your device.</p><progress id="replay-progress" max="1" value="0" hidden></progress></div>`;
  document.querySelector('#app')!.append(panel);
  const el=<T extends HTMLElement>(id:string)=>panel.querySelector<T>('#'+id)!;
  const play=el<HTMLButtonElement>('replay-play'),seek=el<HTMLInputElement>('replay-seek'),close=el<HTMLButtonElement>('replay-close');
  const gif=el<HTMLButtonElement>('replay-gif'),mp4=el<HTMLButtonElement>('replay-mp4'),cancel=el<HTMLButtonElement>('replay-cancel');
  const status=el('replay-export-status'),progress=el<HTMLProgressElement>('replay-progress'),download=el<HTMLAnchorElement>('replay-download');
  let raf=0,controller:AbortController|undefined,url:string|undefined,mp4Supported=false,exitAfterExport=false;
  function updateMenu(){const state=document.body.dataset.session,lap=game.getLastLapReplay();button.hidden=state!=='pause'&&state!=='finish';hint.hidden=button.hidden;button.disabled=!lap;hint.textContent=lap?'Cinematic cameras · save a GIF or MP4':'Complete a lap to unlock your cinematic replay.';}
  const observer=new MutationObserver(updateMenu);observer.observe(document.body,{attributes:true,attributeFilter:['data-session']});
  document.addEventListener('race:pause',updateMenu,{signal});document.addEventListener('race:finish',updateMenu,{signal});
  const labels=()=>{gif.disabled=!!controller;mp4.disabled=!!controller||!mp4Supported;mp4.textContent=mp4Supported?'MP4 · FULL LAP':'MP4 UNAVAILABLE';};
  const tick=()=>{const r=game.getReplayState();if(!r)return;seek.value=String(r.time);el('replay-time').textContent=formatTime(r.time);play.textContent=r.playing?'PAUSE':'PLAY';raf=requestAnimationFrame(tick);};
  button.addEventListener('click',async()=>{
    document.body.classList.add('replay-active');
    if(!game.beginReplay()){document.body.classList.remove('replay-active');return;}
    panel.hidden=false;const lap=game.getLastLapReplay()!;
    el('replay-lap-meta').textContent=`${circuit.toUpperCase()} · LAP ${lap.lap} · ${formatTime(lap.duration)}${lap.valid?'':' · INVALID LAP'}`;
    el('replay-duration').textContent=formatTime(lap.duration);seek.max=String(lap.duration);tick();close.focus();
    mp4Supported=await supportsReplayMp4();labels();
    if(!mp4Supported)status.textContent='MP4 encoding is unavailable here. GIF export is available; try Chrome or Safari for MP4.';
  },{signal});
  function exit(){
    if(controller){exitAfterExport=true;controller.abort();return;}
    cancelAnimationFrame(raf);panel.hidden=true;document.body.classList.remove('replay-active');game.endReplay();
    if(url){URL.revokeObjectURL(url);url=undefined;}download.hidden=true;button.focus();
  }
  close.addEventListener('click',exit,{signal});document.addEventListener('replay:exit-request',exit,{signal});
  play.addEventListener('click',()=>{const r=game.getReplayState();if(!r)return;if(r.time>=game.getLastLapReplay()!.duration)game.seekReplay(0);game.setReplayPlaying(!r.playing);},{signal});
  seek.addEventListener('input',()=>{game.setReplayPlaying(false);game.seekReplay(Number(seek.value));},{signal});
  cancel.addEventListener('click',()=>controller?.abort(),{signal});
  async function save(format:'gif'|'mp4'){
    if(controller)return;const lap=game.getLastLapReplay()!,state=game.getReplayState()!;
    const duration=format==='mp4'?lap.duration:Math.min(20,lap.duration);
    const start=format==='mp4'?0:Math.min(state.time,lap.duration-duration);
    const originalTime=state.time;controller=new AbortController();labels();play.disabled=seek.disabled=true;
    cancel.hidden=false;progress.hidden=false;progress.value=0;download.hidden=true;
    try{
      const blob=await exportReplay(game,format,start,duration,controller.signal,value=>{progress.value=value;status.textContent=`RENDERING ${format.toUpperCase()} · ${Math.round(value*100)}% · ${formatTime(start)}–${formatTime(start+duration)}`;});
      if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);download.href=url;download.download=`gridpunk-${circuit}-lap-${lap.lap}.${format}`;download.textContent=`DOWNLOAD ${format.toUpperCase()}`;download.hidden=false;download.click();
      status.textContent=`${format.toUpperCase()} ready · ${duration.toFixed(1)} seconds · ${(blob.size/1048576).toFixed(1)} MB · ${format==='mp4'?'with sound':'silent GIF'}`;
    }catch(error){status.textContent=error instanceof DOMException&&error.name==='AbortError'?'Export cancelled. Your replay is ready.':`Could not export: ${error instanceof Error?error.message:String(error)}`;}
    finally{controller=undefined;cancel.hidden=true;progress.hidden=true;play.disabled=seek.disabled=false;labels();game.seekReplay(originalTime);if(exitAfterExport){exitAfterExport=false;exit();}}
  }
  gif.addEventListener('click',()=>void save('gif'),{signal});mp4.addEventListener('click',()=>void save('mp4'),{signal});
  signal.addEventListener('abort',()=>{observer.disconnect();controller?.abort();cancelAnimationFrame(raf);if(url)URL.revokeObjectURL(url);},{once:true});
  updateMenu();
}
