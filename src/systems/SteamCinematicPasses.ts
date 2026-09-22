import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const vertex = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';

/**
 * Copies the depth the render pass just wrote into its own target as linear
 * view distance in metres (open sky reads as the far plane). That depth
 * texture stays attached to a composer target later passes draw into, so
 * sampling it there would be a feedback loop.
 */
export class SceneDepthCapturePass extends Pass {
  readonly target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, type: THREE.HalfFloatType, format: THREE.RedFormat,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  private readonly quad = new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms: { tDepth: { value: null }, uNear: { value: .3 }, uFar: { value: 5000 } }, vertexShader: vertex, depthTest: false, depthWrite: false,
    fragmentShader: `#include <packing>
      uniform sampler2D tDepth;uniform float uNear,uFar;varying vec2 vUv;
      void main(){float d=texture2D(tDepth,vUv).x;gl_FragColor=vec4(d>=.99999?uFar:-perspectiveDepthToViewZ(d,uNear,uFar));}`,
  }));
  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly scale = 1) { super(); this.needsSwap = false; }
  /** Distances beyond this are open sky. */
  get skyDistance(): number { return this.camera.far * .98; }
  override setSize(width: number, height: number): void { this.target.setSize(Math.max(1, Math.round(width * this.scale)), Math.max(1, Math.round(height * this.scale))); }
  override render(renderer: THREE.WebGLRenderer, _w: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const u = (this.quad.material as THREE.ShaderMaterial).uniforms;
    u.tDepth.value = readBuffer.depthTexture; u.uNear.value = this.camera.near; u.uFar.value = this.camera.far;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target); this.quad.render(renderer); renderer.setRenderTarget(previous);
  }
  override dispose(): void { this.target.dispose(); this.quad.material.dispose(); this.quad.dispose(); }
}

/**
 * Solarpunk cinematic aerial perspective: distance haze thickest near the
 * ground, brighter and warmer towards the sun, so the skyline recedes in
 * layers like a long lens on a clear afternoon. It also carries the replay
 * focus blur, which needs the same linear depth.
 */
export class AerialPerspectivePass extends ShaderPass {
  private readonly sun = new THREE.Vector3(0, 1, 0);
  constructor(private readonly capture: SceneDepthCapturePass, private readonly camera: THREE.PerspectiveCamera) {
    super({
      uniforms: { tDiffuse: { value: null }, tDist: { value: null }, uSky: { value: 4900 }, uSun: { value: new THREE.Vector3(0, 1, 0) },
        uTan: { value: new THREE.Vector2(1, 1) }, uCamera: { value: new THREE.Matrix4() }, uEye: { value: new THREE.Vector3() },
        uDof: { value: 0 }, uFocus: { value: 12 }, uResolution: { value: new THREE.Vector2(1, 1) } },
      vertexShader: vertex,
      fragmentShader: `uniform sampler2D tDiffuse,tDist;uniform float uSky,uDof,uFocus;uniform vec3 uSun,uEye;uniform vec2 uTan,uResolution;uniform mat4 uCamera;varying vec2 vUv;
        void main(){
          vec4 base=texture2D(tDiffuse,vUv);vec3 color=base.rgb;
          float dist=texture2D(tDist,vUv).x;
          if(uDof>.5){
            // Replay focus pull: the car stays sharp, background and foreground go soft.
            float coc=clamp(abs(dist-uFocus)/max(uFocus*1.4,1.),0.,1.);
            float radius=coc*coc*9.*uResolution.y/900.;
            if(radius>.35){
              vec3 acc=color;float aw=1.;
              for(int k=0;k<16;k++){
                float a=float(k)*2.399963;float r=sqrt((float(k)+.5)/16.)*radius;
                vec2 su=clamp(vUv+vec2(cos(a),sin(a))*r/uResolution,vec2(.001),vec2(.999));
                float sd=texture2D(tDist,su).x;float w=sd>=dist-2.?1.:.2;
                acc+=texture2D(tDiffuse,su).rgb*w;aw+=w;
              }
              color=acc/aw;
            }
          }
          if(dist<uSky){
            vec3 view=vec3((vUv*2.-1.)*uTan,-1.);
            vec3 ray=normalize((uCamera*vec4(view,0.)).xyz);
            float metres=dist*length(view);
            float height=max(uEye.y+ray.y*metres,0.);
            // Beer-Lambert extinction with a 220 m scale height.
            float density=1./2600.*mix(.35,1.,exp(-height/220.));
            float haze=1.-exp(-metres*density);
            float toward=max(dot(ray,uSun),0.);
            vec3 air=vec3(.62,.76,.95)+vec3(.55,.45,.3)*pow(toward,5.)+vec3(.9,.8,.6)*pow(toward,40.);
            color=mix(color,air,haze*.85);
          }
          gl_FragColor=vec4(color,base.a);
        }`,
    });
  }
  setSun(direction: THREE.Vector3 | undefined): void { if (direction) this.sun.copy(direction); }
  setFocus(enabled: boolean, metres: number): void { this.uniforms.uDof.value = enabled ? 1 : 0; this.uniforms.uFocus.value = Math.max(1, metres); }
  override setSize(width: number, height: number): void { this.uniforms.uResolution.value.set(width, height); }
  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    const u = this.uniforms, camera = this.camera;
    u.tDist.value = this.capture.target.texture; u.uSky.value = this.capture.skyDistance; u.uSun.value.copy(this.sun);
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    u.uTan.value.set(tan * camera.aspect, tan); u.uCamera.value.copy(camera.matrixWorld); u.uEye.value.setFromMatrixPosition(camera.matrixWorld);
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}

/**
 * Screen-space light scattering for the Steampunk cinematic tier. Only open
 * sky (cleared depth) emits, so chimneys, towers and gantries cut dark bars
 * through golden shafts that radiate from the low sun, even when the sun sits
 * just outside the frame.
 */
export class SunShaftPass extends ShaderPass {
  private readonly projected = new THREE.Vector4();
  private readonly forward = new THREE.Vector3();
  constructor(private readonly capture: SceneDepthCapturePass, private readonly camera: THREE.Camera) {
    super({
      uniforms: { tDiffuse: { value: null }, tSky: { value: null }, uSun: { value: new THREE.Vector2(.5, .5) },
        uStrength: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 }, uSkyDistance: { value: 4900 },
        uTint: { value: new THREE.Color(1, .7, .4) }, uGain: { value: .028 }, uThreshold: { value: .7 } },
      vertexShader: vertex,
      fragmentShader: `uniform sampler2D tDiffuse,tSky;uniform vec2 uSun;uniform float uStrength,uTime,uAspect,uSkyDistance,uGain,uThreshold;uniform vec3 uTint;varying vec2 vUv;
        float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+uTime)*43758.5453);}
        vec3 emit(vec2 uv){
          if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)return vec3(0.);
          float sky=step(uSkyDistance,texture2D(tSky,uv).x);
          vec3 c=texture2D(tDiffuse,uv).rgb;
          // Only the hot sky around the disc emits; a far-reaching falloff
          // keeps a bright horizon from washing the whole frame.
          float near=exp(-length((uv-uSun)*vec2(uAspect,1.))*3.5);
          return min(max(c-vec3(uThreshold),vec3(0.)),vec3(2.))*sky*near;
        }
        void main(){
          vec4 base=texture2D(tDiffuse,vUv);
          if(uStrength<=.001){gl_FragColor=base;return;}
          vec2 delta=(vUv-uSun)*(.92/48.);
          vec2 uv=vUv-delta*hash(vUv*913.);
          vec3 shafts=vec3(0.);float decay=1.;
          for(int i=0;i<48;i++){uv-=delta;shafts+=emit(uv)*decay;decay*=.962;}
          shafts*=uTint*(uGain*uStrength);
          gl_FragColor=vec4(base.rgb+shafts,base.a);
        }`,
    });
  }

  /** Aims the shafts at the sun; fades them out as the camera turns away from it. */
  setSun(direction: THREE.Vector3 | undefined, time: number): void {
    const u = this.uniforms;
    u.uTime.value = time % 97;
    const camera = this.camera as THREE.PerspectiveCamera; u.uAspect.value = camera.aspect ?? 1;
    if (!direction) { u.uStrength.value = 0; return; }
    this.camera.getWorldDirection(this.forward);
    const facing = this.forward.dot(direction);
    this.projected.set(this.camera.position.x + direction.x * 1000, this.camera.position.y + direction.y * 1000, this.camera.position.z + direction.z * 1000, 1)
      .applyMatrix4(this.camera.matrixWorldInverse).applyMatrix4(this.camera.projectionMatrix);
    if (this.projected.w <= 0) { u.uStrength.value = 0; return; }
    u.uSun.value.set(this.projected.x / this.projected.w * .5 + .5, this.projected.y / this.projected.w * .5 + .5);
    u.uStrength.value = THREE.MathUtils.smoothstep(facing, .15, .6);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    this.uniforms.tSky.value = this.capture.target.texture; this.uniforms.uSkyDistance.value = this.capture.skyDistance;
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}
