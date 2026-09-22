import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { NeonFrameDepthPass } from './NeonFrameDepthPass';
import { NeonAtmospherePass } from './NeonAtmospherePass';
import {NeonVelocityPass,NeonTemporalPass,NeonRoadReflectionPass,createNeonTapePass,createNeonAnamorphicPass} from './NeonExtremePasses';
import { SceneDepthCapturePass, SunShaftPass, AerialPerspectivePass } from './SteamCinematicPasses';
import type { Telemetry } from './VehiclePhysics';

/** Fraction of the composer resolution the ambient-occlusion buffers use. */
const AO_RESOLUTION_SCALE = 0.5;

/**
 * GTAO fed by the depth the scene pass already wrote, with normals rebuilt
 * from that depth. The stock pass re-renders the whole scene with a normal
 * material, which doubles draw calls and breaks the alpha-cut trees and the
 * billboard vertex hooks; reading the composer's own depth avoids all three.
 */
class SceneDepthGtaoPass extends GTAOPass {
  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void {
    // The composer ping-pongs its targets, so the scene depth lives in
    // whichever buffer the render pass just filled.
    const depth = readBuffer.depthTexture;
    if (depth) {
      this.gtaoMaterial.uniforms.tDepth.value = depth;
      this.pdMaterial.uniforms.tDepth.value = depth;
    }
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}

const gradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uSpeed: { value: 0 },
    uVignette: { value: 0.15 },
    uAberration: { value: 0.0001 },
    uDamage: { value: 0 },
    uNeon: { value: 0 },
    uResolution: {value: new THREE.Vector2(1,1)},
    tFrameDepth: {value: null},
    uInverseViewProjection: {value: new THREE.Matrix4()},
    uPreviousViewProjection: {value: new THREE.Matrix4()},
    uEye: {value: new THREE.Vector3()},
    uMotion: {value: 0},
    uExtreme: {value: 0}, tVelocity: {value: null}, uJitterDelta: {value: new THREE.Vector2()},
    uLook: {value: 0}, uDof: {value: 0}, uFocus: {value: 30}, uBokeh: {value: 12}, uDaylight: {value: 0},
    uSteam: {value: 0}, uSolar: {value: 0}, uLetterbox: {value: 0},
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uSpeed;
    uniform float uVignette;
    uniform float uAberration;
    uniform float uDamage;
    uniform float uNeon;
    uniform vec2 uResolution;
    uniform sampler2D tFrameDepth;
    uniform mat4 uInverseViewProjection,uPreviousViewProjection;
    uniform vec3 uEye;
    uniform float uMotion,uExtreme;uniform sampler2D tVelocity;uniform vec2 uJitterDelta;
    uniform float uLook,uDof,uFocus,uBokeh,uDaylight,uSteam,uSolar,uLetterbox;
    #include <packing>
    varying vec2 vUv;

    vec3 saturate(vec3 c, float s) {
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      return mix(vec3(l), c, s);
    }

    void main() {
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      // Mild barrel distortion is confined to the rendered scene, never UI.
      if(uNeon>.5&&uExtreme<.5) uv=clamp(.5+centered*(1.+dot(centered,centered)*.035)/1.009,vec2(.001),vec2(.999));
      float r2 = dot(centered, centered);

      // Speed-triggered radial blur for a sense of velocity.
      vec3 color = vec3(0.0);
      float total = 0.0;
      int samples = 6;
      float strength = uSpeed * (0.0008 + r2 * 0.004);
      float metres = 0.0;
      if(uNeon>.5){
        float depth=unpackRGBAToDepth(texture2D(tFrameDepth,uv));
        vec4 world=uInverseViewProjection*vec4(uv*2.-1.,depth*2.-1.,1.);
        world/=world.w;
        metres=length(world.xyz-uEye);
        vec4 previous=uPreviousViewProjection*world;
        vec2 velocity=(uv-(previous.xy/max(previous.w,.001)*.5+.5))*uMotion;
        if(uExtreme>.5) velocity=(texture2D(tVelocity,uv).xy-uJitterDelta)*uMotion;
        else velocity*=smoothstep(18.,38.,length(world.xyz-uEye));
        velocity*=min(1.,mix(.028,.035,uExtreme)/max(length(velocity),.00001));
        for(int i=0;i<8;i++){
          float t=float(i)/7.-.5;
          vec2 sampleUv=clamp(uv+velocity*t,vec2(.001),vec2(.999));
          float sampleDepth=unpackRGBAToDepth(texture2D(tFrameDepth,sampleUv));
          // Reject samples across a foreground silhouette instead of dragging
          // buildings over the car or smearing a near barrier into the road.
          float w=abs(sampleDepth-depth)<.0007 ? 1. : .04;
          color+=texture2D(tDiffuse,sampleUv).rgb*w;total+=w;
        }
        if(uDof>.5){
          // Replay-only hexagonal bokeh (cinematic tier): focus follows the
          // player's car; blur ramps over a range equal to the focus distance,
          // as the reference shots do. Far samples never bleed over nearer pixels.
          color/=total;total=1.;
          float coc=clamp(abs(metres-uFocus)/max(uFocus*.9,1.),0.,1.);
          float radius=coc*coc*uBokeh;
          vec3 acc=vec3(0.);float aw=0.;
          for(int k=0;k<12;k++){
            float a=float(k)*1.0471976+(k>=6?.5235988:0.);
            float rr=(k>=6?1.:.55)*radius;
            vec2 su=clamp(uv+vec2(cos(a),sin(a))*rr/uResolution,vec2(.001),vec2(.999));
            float sd=unpackRGBAToDepth(texture2D(tFrameDepth,su));
            float w=sd<depth+.0005?1.:.25;
            acc+=texture2D(tDiffuse,su).rgb*w;aw+=w;
          }
          color=mix(color,acc/aw,smoothstep(.02,.2,coc));
        }
      }else{
        for (int i = 0; i < samples; i++) {
          float t = float(i) / float(samples - 1);
          vec2 offset = centered * strength * t;
          vec3 c = texture2D(tDiffuse, uv - offset).rgb;
          float w = 1.0 - t * 0.5;
          color += c * w; total += w;
        }
      }
      color /= total;

      // Chromatic aberration towards the edges.
      float ab = uAberration * (0.4 + r2 * 3.0) * (1.0 + uSpeed * 2.0);
      color.r = mix(color.r, texture2D(tDiffuse, uv - centered * ab).r, 0.7);
      color.b = mix(color.b, texture2D(tDiffuse, uv + centered * ab).b, 0.7);

      float grain = fract(sin(dot(uv * 900.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      if(uLook>.5){
        // Neon Signal authored grade in linear HDR: exposure .84, contrast .98
        // about mid grey, saturation 1.17, gamma .8; then its five-band depth
        // contrast (pivot .18) so dim distant surfaces crush while signs survive.
        vec3 g=(color*.84-.5)*.98+.5;
        float gl=dot(g,vec3(.2126,.7152,.0722));
        g=max(mix(vec3(gl),g,1.17),vec3(0.));
        color=pow(g,vec3(1.25));
        // Bands at half the reference strength: our mist is thinner, so the full
        // curve crushed distant walls to black instead of blue-grey.
        float t=clamp((metres-10.)/440.,0.,1.)*4.;
        float c=1.025+.025*clamp(t,0.,1.)+.01*clamp(t-1.,0.,1.)-.015*clamp(t-2.,0.,1.)-.02*clamp(t-3.,0.,1.);
        float y=max(dot(color,vec3(.2126,.7152,.0722)),.0001);
        color*=clamp(pow(y/.18,c-1.),.05,1.35);
        color+=(grain-.5)*.002;
      }else if(uSolar>.5){
      // Solarpunk film print: neutral daylight balance, foliage pulled from
      // saturated lime towards olive, sky blues calmed, a soft toe with a
      // touch of cool in the blacks, gentle contrast and fine grain.
      color = max(color, vec3(0.0));
      float l0 = dot(color, vec3(0.2126, 0.7152, 0.0722));
      float green = clamp((color.g - max(color.r, color.b)) / max(color.g, 1e-4), 0.0, 1.0);
      color = mix(color, vec3(l0) + (color - vec3(l0)) * .84 + vec3(.01, 0.0, -.008) * l0 * 3.0, green);
      float blue = clamp((color.b - max(color.r, color.g)) / max(color.b, 1e-4), 0.0, 1.0);
      color = mix(color, mix(vec3(l0), color, .9), blue);
      color = max(saturate(color, 1.08), vec3(0.0));
      color *= mix(vec3(.97, .99, 1.03), vec3(1.05, 1.0, .93), smoothstep(.02, .6, l0));
      color = .18 * pow(color / .18 + 1e-5, vec3(1.16));
      color += vec3(.003, .0045, .006) * (1.0 - smoothstep(0.0, .08, l0));
      color += (grain - 0.5) * .005 * (1.0 - .5 * smoothstep(0.0, .8, l0));
      }else if(uSteam>.5){
      // Steampunk golden-hour print: teal shadows against amber highlights,
      // a firmer curve about mid grey, sepia-lifted blacks and film grain.
      color = max(color, vec3(0.0));
      float l0 = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color *= mix(vec3(.84, .97, 1.13), vec3(1.13, .98, .78), smoothstep(.015, .5, l0));
      color = .18 * pow(color / .18 + 1e-5, vec3(1.14));
      color = max(saturate(color, 1.1), vec3(0.0));
      color += vec3(.009, .0055, .002);
      color += (grain - 0.5) * .007 * (1.0 - .6 * smoothstep(0.0, .8, l0));
      }else if(uDaylight>.5){
      // Daylight grade: a little more colour and contrast about mid grey,
      // warm highlights; no cool shadow cast.
      color = max(saturate(color, 1.15), vec3(0.0));
      color = max(color * 1.06 + vec3(.003, .004, .004), vec3(0.0));
      color *= vec3(1.03, 1.0, 0.96);
      color += (grain - 0.5) * 0.002;
      }else{
      // Filmic grade: gentle S-contrast, saturation lift and cool shadows.
      color = saturate(color, 1.02);
      // Grade in linear HDR without the negative highlights of an unclamped S curve.
      color = max(color, vec3(0.0));
      color = mix(color, color * vec3(0.98, 1.0, 1.06), 0.18);
      color += (grain - 0.5) * mix(.002,.0045,uNeon);
      }
      if(uNeon>.5&&uExtreme<.5){
        // Analogue colour bandwidth is softer than luminance. Preserve edge
        // detail while allowing a small horizontal bleed around coloured ads.
        vec2 texel=1./uResolution;
        vec3 bleed=(texture2D(tDiffuse,uv-vec2(texel.x*2.8,0)).rgb+
                    texture2D(tDiffuse,uv+vec2(texel.x*2.8,0)).rgb)*.5;
        float lum=dot(color,vec3(.2126,.7152,.0722));
        float bleedLum=dot(bleed,vec3(.2126,.7152,.0722));
        color=mix(color,vec3(lum)+bleed-vec3(bleedLum),.48);
        color=saturate(max(color,0.),.96)*vec3(.95,1.,1.025);
        color+=vec3(.0015,.003,.0045)*(1.-smoothstep(.0,.2,lum));
        float line=sin(uv.y*uResolution.y*3.141593)*.5+.5;
        color*=1.-line*.018;
      }

      // Vignette. The cinematic tier uses the reference's radius .47, softness .5, strength .9.
      float vignette = 1.0 - smoothstep(0.25, 0.9, length(centered * vec2(1.05, 1.0)));
      color *= mix(1.0, vignette, uVignette);
      if(uLook>.5) color *= 1.0 - smoothstep(.47,.97,length(centered))*.9;
      if(uSteam>.5) color *= 1.0 - smoothstep(.32,.95,length(centered * vec2(1.1, 1.0)))*.6;
      if(uSolar>.5) color *= 1.0 - smoothstep(.4,1.05,length(centered * vec2(1.1, 1.0)))*.42;
      if(uLetterbox>.5){
        // 2.39:1 bars for replays and exports; portrait frames are left open.
        float bar = max(0.0, (1.0 - uResolution.x / uResolution.y / 2.39) * .5);
        if(vUv.y < bar || vUv.y > 1.0 - bar) color = vec3(0.0);
      }

      // Damage/impact red tint.
      color = mix(color, color * vec3(1.4, 0.5, 0.5), uDamage);

      // Safety net: a single bad value (NaN / Inf) upstream must never smear the
      // whole frame to white through the bloom blur. Only non-finite channels
      // are killed; a merely bright channel is clamped. Zeroing anything above
      // the clamp turned warm sun glints into blue holes on the car paint.
      if (color.r != color.r || abs(color.r) > 1.0e6) color.r = 0.0;
      if (color.g != color.g || abs(color.g) > 1.0e6) color.g = 0.0;
      if (color.b != color.b || abs(color.b) > 1.0e6) color.b = 0.0;
      color = clamp(color, 0.0, 4.0);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export class PostProcessing {
  private readonly composer: EffectComposer;
  private readonly grade: ShaderPass;
  private cinematic=false;
  private readonly bloom: UnrealBloomPass;
  private readonly rendererRef: THREE.WebGLRenderer;
  private readonly renderPass: RenderPass;
  private readonly smaa: SMAAPass;
  private readonly gtao: SceneDepthGtaoPass;
  private readonly depthTextures: THREE.DepthTexture[] = [];
  private readonly mainCamera: THREE.PerspectiveCamera;
  private aoWanted = false;
  private look = false;
  private anamorphic?: ShaderPass;
  private readonly steam: boolean;
  private readonly solar: boolean;
  private steamLook = false;
  private solarLook = false;
  private depthCapture?: SceneDepthCapturePass;
  private sunShafts?: SunShaftPass;
  private steamFlare?: ShaderPass;
  private aerial?: AerialPerspectivePass;
  private enabled = true;
  private time = 0;
  private speed = 0;
  private damage = 0;
  private readonly neon: boolean;
  private readonly daylight: boolean;
  private readonly atmosphere?: NeonAtmospherePass;
  private readonly frameDepth?: NeonFrameDepthPass;
  private readonly previousViewProjection = new THREE.Matrix4();
  private readonly currentViewProjection = new THREE.Matrix4();
  private readonly previousCameraPosition = new THREE.Vector3();
  private readonly previousCameraRotation = new THREE.Quaternion();
  private motionHistory = false;
  private extreme = false;
  private velocity?: NeonVelocityPass;
  private temporal?: NeonTemporalPass;
  private reflections?: NeonRoadReflectionPass;
  private tape?: ShaderPass;
  private jitterFrame=0;
  private readonly previousJitter=new THREE.Vector2();
  private readonly jitter=new THREE.Vector2();
  private readonly savedProjection=new THREE.Matrix4();
  private frameDelta=1/60;
  private width=1;private height=1;private dpr=1;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.neon = scene.userData.neon === true;
    this.daylight = scene.userData.daylight === true;
    this.steam = scene.userData.steam === true;
    this.solar = scene.userData.solar === true;
    this.rendererRef = renderer;
    this.mainCamera = camera;
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // Both ping-pong targets carry a depth texture so the scene pass leaves
    // its depth readable for ambient occlusion whichever buffer it lands in.
    for (const target of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      const depth = new THREE.DepthTexture(target.width, target.height, THREE.UnsignedIntType);
      depth.format = THREE.DepthFormat;
      target.depthTexture = depth;
      this.depthTextures.push(depth);
    }
    this.frameDepth = new NeonFrameDepthPass();
    this.frameDepth.enabled=this.neon;
    this.composer.addPass(this.frameDepth);
    this.gtao = new SceneDepthGtaoPass(scene, camera, 1, 1);
    this.gtao.setGBuffer(this.depthTextures[1], undefined);
    // `?aoview` shows the denoised occlusion term alone for inspection.
    this.gtao.output = typeof location !== 'undefined' && location.search.includes('aoview')
      ? GTAOPass.OUTPUT.Denoise
      : GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 1.0;
    this.gtao.updateGtaoMaterial({
      radius: 1.1,
      distanceExponent: 1,
      thickness: 0.6,
      scale: 1.5,
      samples: 12,
      distanceFallOff: 1,
      screenSpaceRadius: false,
    });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 });
    this.composer.addPass(this.gtao);
    if (this.neon) {
      this.atmosphere = new NeonAtmospherePass(camera, scene);
      this.composer.addPass(this.atmosphere);
    }

    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), this.neon ? .83 : this.daylight ? .07 : .12, this.neon ? .48 : this.daylight ? .5 : .35, this.neon ? .85 : this.daylight ? 1.6 : 1.25);
    this.composer.addPass(this.bloom);

    this.grade = new ShaderPass(gradeShader);
    this.grade.uniforms.uNeon.value = this.neon ? 1 : 0;
    this.grade.uniforms.uDaylight.value = this.daylight ? 1 : 0;
    if(this.frameDepth) this.grade.uniforms.tFrameDepth.value = this.frameDepth.target.texture;
    this.grade.uniforms.uAberration.value = this.neon ? .0009 : .0001;
    this.composer.addPass(this.grade);

    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);

    this.composer.addPass(new OutputPass());
  }

  setEnabled(enabled: boolean): void {
    this.resetMotionHistory();
    this.enabled = enabled;
  }

  resetMotionHistory(): void { this.motionHistory=false;this.temporal?.reset();this.jitterFrame=0;this.previousJitter.set(0,0); }

  /**
   * Restricts ambient occlusion to the circuit volume. The sky dome and the
   * far ground disc sit inside the camera's far plane, so without this the
   * occlusion pass evaluates them too and dithers the whole sky.
   */
  setAmbientOcclusionBounds(box: THREE.Box3): void {
    this.gtao.setSceneClipBox(box);
  }

  /** Swaps the camera used by the render pass (e.g. for the zenith map view). */
  setCamera(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera): void {
    this.renderPass.camera = camera;
    this.resetMotionHistory();
    this.applyExtremePasses();
    this.applySteamPasses();
    if (this.atmosphere) this.atmosphere.enabled = camera === this.mainCamera;
    this.applyAmbientOcclusion();
  }

  setQuality(high: boolean, extreme=false, cinematic=false): void {
    this.setExtreme((extreme || cinematic) && this.neon);
    this.setLook(cinematic && this.neon);
    this.setDayLook(cinematic && this.steam ? 'steam' : cinematic && this.solar ? 'solar' : null);
    this.bloom.enabled = high || this.neon;
    // `?noao` isolates ambient occlusion for inspection and profiling.
    this.aoWanted = high && !(typeof location !== 'undefined' && location.search.includes('noao'));
    this.applyAmbientOcclusion();
    // Canvas MSAA does not antialias the composer's offscreen scene target.
    // Keep edge reconstruction at balanced DPR too: fine catch fencing and
    // facade mullions otherwise shimmer exactly when Auto reduces resolution.
    // Performance mode bypasses the composer and retains native canvas MSAA.
    this.smaa.enabled = !this.extreme || this.renderPass.camera!==this.mainCamera;
  }

  private setExtreme(extreme:boolean):void {
    if(this.extreme===extreme)return;
    this.extreme=extreme;
    if(extreme&&this.frameDepth){
      this.velocity=new NeonVelocityPass(this.renderPass.scene,this.mainCamera,this.frameDepth.target.texture);
      this.reflections=new NeonRoadReflectionPass(this.renderPass.scene,this.mainCamera,this.frameDepth.target.texture);
      this.temporal=new NeonTemporalPass(this.frameDepth.target.texture,this.velocity.target.texture);
      this.tape=createNeonTapePass();
      this.tape.uniforms.uCinematic.value=this.look?1:0;
      this.composer.insertPass(this.velocity,2);
      this.composer.insertPass(this.reflections,this.composer.passes.indexOf(this.gtao)+1);
      this.composer.insertPass(this.temporal,this.composer.passes.indexOf(this.bloom));
      this.composer.addPass(this.tape);
      this.grade.uniforms.tVelocity.value=this.velocity.target.texture;
    }else{
      for(const pass of [this.velocity,this.reflections,this.temporal,this.tape])if(pass){this.composer.removePass(pass);pass.dispose();}
      this.velocity=undefined;this.reflections=undefined;this.temporal=undefined;this.tape=undefined;
      this.grade.uniforms.tVelocity.value=null;
    }
    this.atmosphere?.setExtreme(extreme);
    this.renderPass.scene.userData.neonExtreme=extreme;
    const wet=this.renderPass.scene.getObjectByName('neon-wet-road') as (THREE.Object3D&{getRenderTarget():THREE.WebGLRenderTarget})|undefined;
    wet?.getRenderTarget().setSize(extreme?1024:512,extreme?640:320);
    this.applyExtremePasses();this.setSize(this.width,this.height,this.dpr);this.resetMotionHistory();
  }

  /**
   * The Neon Signal look, reverse-engineered from its authored scene defaults:
   * bloom .51 above .94, an anamorphic streak before bloom, the composite tape
   * model, the black-sky mist in the atmosphere pass and the grade in the
   * grade pass. Replay bokeh is armed here and enabled by `setCinematic`.
   */
  private setLook(look:boolean):void {
    if(this.look===look)return;
    this.look=look;
    if(look){
      this.anamorphic=createNeonAnamorphicPass();
      this.composer.insertPass(this.anamorphic,this.composer.passes.indexOf(this.bloom));
    }else if(this.anamorphic){
      this.composer.removePass(this.anamorphic);this.anamorphic.dispose();this.anamorphic=undefined;
    }
    // Bloom threshold scaled like the anamorphic one: .94 in the reference's hot HDR range.
    this.bloom.strength=look?.51:.83;this.bloom.threshold=look?.7:this.neon?.85:this.daylight?.95:1.25;
    this.grade.uniforms.uLook.value=look?1:0;
    this.grade.uniforms.uDof.value=look&&this.cinematic?1:0;
    if(this.tape)this.tape.uniforms.uCinematic.value=look?1:0;
    this.atmosphere?.setLook(look);
    this.renderPass.scene.userData.neonCinematic=look;
    this.applyExtremePasses();this.setSize(this.width,this.height,this.dpr);
  }

  /**
   * Daylight cinematic looks. Steampunk: sun shafts from the open sky, a golden
   * anamorphic streak on the sun and gas lamps, a wider warm bloom and the
   * film grade. Solarpunk: aerial perspective, softer white shafts, a restrained
   * wide bloom, slight lens fringing and a film-print grade.
   */
  private setDayLook(mode:'steam'|'solar'|null):void {
    if((this.steamLook?'steam':this.solarLook?'solar':null)===mode)return;
    for(const pass of [this.depthCapture,this.sunShafts,this.steamFlare,this.aerial])if(pass){this.composer.removePass(pass);pass.dispose();}
    this.depthCapture=undefined;this.sunShafts=undefined;this.steamFlare=undefined;this.aerial=undefined;
    this.steamLook=mode==='steam';this.solarLook=mode==='solar';
    if(mode){
      this.depthCapture=new SceneDepthCapturePass(this.mainCamera,mode==='steam'?.5:1);
      this.composer.insertPass(this.depthCapture,this.composer.passes.indexOf(this.renderPass)+1);
      if(mode==='solar'){
        this.aerial=new AerialPerspectivePass(this.depthCapture,this.mainCamera);
        this.composer.insertPass(this.aerial,this.composer.passes.indexOf(this.bloom));
      }
      this.sunShafts=new SunShaftPass(this.depthCapture,this.mainCamera);
      if(mode==='solar'){const u=this.sunShafts.uniforms;u.uTint.value.setRGB(1,.94,.84);u.uGain.value=.016;u.uThreshold.value=1.1;}
      this.composer.insertPass(this.sunShafts,this.composer.passes.indexOf(this.bloom));
      if(mode==='steam'){
        this.steamFlare=createNeonAnamorphicPass();
        this.steamFlare.uniforms.threshold.value=1.4;this.steamFlare.uniforms.flare.value=.22;this.steamFlare.uniforms.oval.value=.15;
        this.composer.insertPass(this.steamFlare,this.composer.passes.indexOf(this.bloom));
      }
    }
    this.bloom.radius=mode==='steam'?.7:mode==='solar'?.85:.5;this.bloom.threshold=mode==='steam'?1.25:mode==='solar'?1.3:1.6;
    this.grade.uniforms.uSteam.value=this.steamLook?1:0;
    this.grade.uniforms.uSolar.value=this.solarLook?1:0;
    this.grade.uniforms.uLetterbox.value=mode&&this.cinematic?1:0;
    this.aerial?.setFocus(this.cinematic,this.grade.uniforms.uFocus.value);
    this.applySteamPasses();this.setSize(this.width,this.height,this.dpr);
  }

  private applySteamPasses():void {
    const active=this.renderPass.camera===this.mainCamera;
    for(const pass of [this.sunShafts,this.steamFlare,this.aerial])if(pass)pass.enabled=active;
    // A little lateral fringing reads as a real lens on the Solar look.
    if(!this.extreme)this.grade.uniforms.uAberration.value=this.solarLook&&active?.00045:this.neon?.0009:.0001;
  }

  /** Distance the replay bokeh keeps sharp, in metres from the camera. */
  setFocusDistance(metres:number):void { this.grade.uniforms.uFocus.value=Math.max(1,metres); this.aerial?.setFocus(this.cinematic,metres); }

  private applyExtremePasses():void {
    const active=this.extreme&&this.renderPass.camera===this.mainCamera;
    for(const pass of [this.velocity,this.reflections,this.temporal,this.tape])if(pass)pass.enabled=active;
    if(this.anamorphic)this.anamorphic.enabled=active&&this.look;
    this.grade.uniforms.uExtreme.value=active?1:0;
    this.grade.uniforms.uAberration.value=active?0:this.neon?.0009:.0001;
    this.smaa.enabled=!active;
  }

  /** The occlusion pass is projected for the race camera only; the zenith map view skips it. */
  private applyAmbientOcclusion(): void {
    this.gtao.enabled = this.aoWanted && this.renderPass.camera === this.mainCamera;
  }

  setSize(width: number, height: number, dpr: number): void {
    this.width=width;this.height=height;this.dpr=dpr;
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
    this.grade.uniforms.uResolution.value.set(width*dpr,height*dpr);
    this.resetMotionHistory();
    this.tape?.uniforms.resolution.value.set(width*dpr,height*dpr);
    this.anamorphic?.uniforms.resolution.value.set(width*dpr,height*dpr);
    this.steamFlare?.uniforms.resolution.value.set(width*dpr,height*dpr);
    this.grade.uniforms.uBokeh.value=12*dpr;
    this.gtao.setSize(
      Math.max(1, Math.round(width * dpr * (this.extreme?.75:AO_RESOLUTION_SCALE))),
      Math.max(1, Math.round(height * dpr * (this.extreme?.75:AO_RESOLUTION_SCALE))),
    );
  }

  setCinematic(enabled:boolean):void {
    this.cinematic=enabled;
    this.grade.uniforms.uVignette.value=enabled?.28:.15;
    this.grade.uniforms.uDof.value=enabled&&this.look?1:0;
    this.grade.uniforms.uLetterbox.value=enabled&&(this.steamLook||this.solarLook)?1:0;
    this.aerial?.setFocus(enabled,this.grade.uniforms.uFocus.value);
  }

  update(dt: number, telemetry: Telemetry): void {
    this.frameDelta=Math.max(1/240,Math.min(.1,dt));
    this.time += dt;
    if(this.tape)this.tape.uniforms.time.value=this.time;
    this.speed += (Math.min(1, telemetry.speed / 80) - this.speed) * Math.min(1, dt * 2);
    this.damage *= Math.max(0, 1 - dt * 3);
    const uniforms = this.grade.uniforms;
    uniforms.uTime.value = this.time;
    uniforms.uSpeed.value = this.speed;
    uniforms.uDamage.value = this.damage;
    this.bloom.strength = this.look ? .51 : this.steamLook ? .26 : this.solarLook ? .14 : this.neon ? .83 : this.daylight ? .07 : 0.04 + this.speed * 0.03;
  }

  /** Prepare every world material against the target used by the real race. */
  async prepare(): Promise<void> {
    const previousTarget = this.rendererRef.getRenderTarget();
    try {
      // Shader variants depend on the output target. Preparing only the default
      // framebuffer leaves the composer's first-visible variants uncompiled.
      const direct = !this.enabled || (typeof location !== 'undefined' && location.search.includes('nopost'));
      this.rendererRef.setRenderTarget(direct ? null : this.composer.writeBuffer);
      await this.rendererRef.compileAsync(this.renderPass.scene, this.renderPass.camera);
    } finally {
      this.rendererRef.setRenderTarget(previousTarget);
    }
    // Prepare the enabled post passes and initial shadow/texture uploads too.
    this.render();
  }

  render(): void {
    if ((!this.enabled&&!this.cinematic) || (typeof location !== 'undefined' && location.search.includes('nopost'))) {
      this.rendererRef.render(this.renderPass.scene, this.renderPass.camera);
      return;
    }
    if(this.neon){
      const camera=this.renderPass.camera;
      camera.updateMatrixWorld();
      this.savedProjection.copy(camera.projectionMatrix);
      this.jitter.set(0,0);
      if(this.extreme&&camera===this.mainCamera){
        const halton=(index:number,base:number)=>{let f=1,r=0;while(index>0){f/=base;r+=f*(index%base);index=Math.floor(index/base);}return r;};
        const index=(this.jitterFrame++%8)+1;
        this.jitter.set((halton(index,2)-.5)/(this.width*this.dpr),(halton(index,3)-.5)/(this.height*this.dpr));
        camera.projectionMatrix.elements[8]-=this.jitter.x*2;camera.projectionMatrix.elements[9]-=this.jitter.y*2;
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      }
      this.currentViewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
      const cut = camera.position.distanceToSquared(this.previousCameraPosition)>225 || Math.abs(camera.quaternion.dot(this.previousCameraRotation))<.9;
      const valid=this.motionHistory&&!cut&&camera===this.mainCamera;
      if(!valid)this.temporal?.reset();
      this.velocity?.prepare(this.currentViewProjection,this.previousViewProjection,valid);
      this.grade.uniforms.uJitterDelta.value.copy(this.jitter).sub(this.previousJitter);
      this.grade.uniforms.uMotion.value=valid ? (this.extreme?.5*Math.min(2,(1/60)/this.frameDelta):.5) : 0;
      this.grade.uniforms.uInverseViewProjection.value.copy(this.currentViewProjection).invert();
      this.grade.uniforms.uPreviousViewProjection.value.copy(this.previousViewProjection);
      this.grade.uniforms.uEye.value.copy(camera.position);
    }
    this.atmosphere?.setSceneDepth(this.frameDepth?.target.texture??null,true);
    this.atmosphere?.update(this.time);
    const daySun=this.renderPass.scene.userData.cinematicSun as THREE.Vector3|undefined;
    this.sunShafts?.setSun(daySun,this.time);this.aerial?.setSun(daySun);
    try {this.composer.render();}
    finally {if(this.neon){this.renderPass.camera.projectionMatrix.copy(this.savedProjection);this.renderPass.camera.projectionMatrixInverse.copy(this.savedProjection).invert();}}
    if(this.neon){
      this.previousJitter.copy(this.jitter);
      this.previousViewProjection.copy(this.currentViewProjection);
      this.previousCameraPosition.copy(this.renderPass.camera.position);
      this.previousCameraRotation.copy(this.renderPass.camera.quaternion);
      this.motionHistory=true;
    }
  }

  dispose(): void {
    for(const pass of [this.velocity,this.temporal,this.reflections,this.tape,this.anamorphic,this.depthCapture,this.sunShafts,this.steamFlare,this.aerial])pass?.dispose();
    this.gtao.dispose();
    this.atmosphere?.dispose();
    this.frameDepth?.dispose();
    for (const depth of this.depthTextures) depth.dispose();
    this.bloom.dispose();
    this.smaa.dispose();
    this.grade.dispose();
    this.composer.dispose();
  }
}
