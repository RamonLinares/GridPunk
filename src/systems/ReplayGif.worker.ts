import {GIFEncoder,quantize,applyPalette} from 'gifenc';
let gif=GIFEncoder();
self.onmessage=(event:MessageEvent)=>{
  try{
    const m=event.data;
    if(m.type==='start'){gif=GIFEncoder();self.postMessage({ok:true});}
    if(m.type==='frame'){
      const rgba=new Uint8ClampedArray(m.data),palette=quantize(rgba,256);
      gif.writeFrame(applyPalette(rgba,palette),m.width,m.height,{palette,delay:m.delay,repeat:0});
      self.postMessage({ok:true});
    }
    if(m.type==='finish'){gif.finish();const data=Uint8Array.from(gif.bytes()).buffer;self.postMessage({data},{transfer:[data]});}
  }catch(error){self.postMessage({error:String(error)});}
};
