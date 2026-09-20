import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export interface NeonAtmosphereLight {
  position: THREE.Vector3;
  radiance: THREE.Vector3;
}

const vertexShader = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;

/** Original bounded volumetric integration, with billboard-lit mist.
 * Integrate at reduced resolution, then composite premultiplied scattering over
 * the scene. No second scene render, history ghosting, or depth feedback loop.
 */
export class NeonAtmospherePass extends Pass {
  private readonly target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  private readonly volume: THREE.ShaderMaterial;
  private readonly composite: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly lights: NeonAtmosphereLight[];
  private time = 0;
  private extreme=false;private width=1;private height=1;

  constructor(private readonly camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    super();
    this.needsSwap = false;
    this.lights = scene.userData.neonAtmosphereLights ?? [];
    this.volume = new THREE.ShaderMaterial({
      name: 'NeonLayeredAtmosphere', depthTest: false, depthWrite: false,
      uniforms: {
        tDepth: {value: null}, uPackedDepth:{value:0}, uInverseProjection: {value: new THREE.Matrix4()},
        uCameraWorld: {value: new THREE.Matrix4()}, uEye: {value: new THREE.Vector3()},
        uTime: {value: 0}, uSteps:{value:8},uLightCount:{value:4},uExtreme:{value:0},
        // Neon Signal mist: density .021 per metre in a 300 m world. Scaled only
        // about half as far as the circuit's size would suggest, because the
        // reference's milky look depends on the scatter dominating the black-out;
        // scatter tint #197ca8 × glow 1.36 in linear light; the world fades to
        // black with exp(-(d·k)²) before the mist is added on top.
        uLook:{value:0},uLookDensity:{value:.012},uLookBlack:{value:.0005},uLookGround:{value:2},
        uLookTint:{value:new THREE.Vector3(.0132,.273,.533)},
        uLights: {value: Array.from({length: 8}, () => new THREE.Vector3())},
        uRadiance: {value: Array.from({length: 8}, () => new THREE.Vector3())},
      },
      vertexShader,
      fragmentShader: `
        #include <packing>
        varying vec2 vUv;
        uniform sampler2D tDepth;uniform float uPackedDepth;
        uniform mat4 uInverseProjection,uCameraWorld;
        uniform vec3 uEye,uLights[8],uRadiance[8];
        uniform float uTime,uSteps,uLightCount,uExtreme,uLook,uLookDensity,uLookBlack,uLookGround;
        uniform vec3 uLookTint;
        void main(){
          vec4 encoded=texture2D(tDepth,vUv);float depth=uPackedDepth>.5?unpackRGBAToDepth(encoded):encoded.r;
          vec4 view=uInverseProjection*vec4(vUv*2.-1.,depth*2.-1.,1.);
          vec3 world=(uCameraWorld*vec4(view.xyz/view.w,1.)).xyz;
          vec3 ray=world-uEye;
          float distance=length(ray),reach=min(distance,mix(360.,720.,uLook));
          vec3 direction=ray/max(distance,.001);
          // Keep the immediate car/road zone clear. Distant mist is genuinely
          // in world space: its depth changes through turns and camera moves.
          float stepLength=max(reach-12.,0.)/uSteps;
          float transmission=1.;vec3 scatter=vec3(0.);
          for(int i=0;i<24;i++){
            if(float(i)>=uSteps)break;
            vec3 p=uEye+direction*(12.+(float(i)+.5)*stepLength);
            float height=max(p.y,0.);
            float drift=sin(p.x*.018+uTime*.04)*sin(p.z*.027-uTime*.025);
            float low=exp(-height/17.);
            float cloud=exp(-pow((height-68.-drift*12.)/38.,2.));
            float upper=exp(-pow((height-180.)/75.,2.));
            float detail=sin(p.x*.14+p.y*.09+uTime*.08)*sin(p.z*.19-p.y*.07);
            float density=(.0012+.0042*low+.0035*cloud+.003*upper)*(.83+.17*drift)*mix(1.,1.1+detail*.17,uExtreme);
            if(uLook>.5){
              // Three mist banks (22, 84, 142 m), warped ground fog and slow eddies.
              float warp=sin(p.x*.025+uTime*.05)*9.+sin(p.z*.019-uTime*.05)*7.;
              float hy=height+warp;
              float banks=exp(-pow((hy-22.)/24.,2.))*.42+exp(-pow((hy-84.)/32.,2.))*.62+exp(-pow((hy-142.)/20.,2.))*.3;
              float ground=exp(-max(height+warp*.35,0.)/9.)*uLookGround*.9;
              float eddies=sin(p.x*.037+sin(p.z*.023)+uTime*.05)*sin(p.y*.029-uTime*.05)*.16+.84;
              density=uLookDensity*((banks+.18)*smoothstep(0.,3.,p.y)+ground)*eddies;
            }
            // Keep nearby architecture contrasty; scattering builds in the distance.
            density*=mix(.22,1.,smoothstep(35.,155.,12.+(float(i)+.5)*stepLength));
            float opacity=1.-exp(-density*stepLength);
            vec3 incident=mix(vec3(.012,.048,.08)*(1.+cloud*.45),uLookTint,uLook);
            for(int j=0;j<8;j++){
              if(float(j)>=uLightCount)break;
              vec3 delta=(p-uLights[j])/vec3(26.,34.,26.);
              float falloff=1./(1.+dot(delta,delta));
              incident+=uRadiance[j]*falloff*falloff;
            }
            scatter+=transmission*opacity*incident;
            transmission*=1.-opacity;
          }
          float black=mix(1.,exp(-pow(distance*uLookBlack,2.)),uLook);
          gl_FragColor=vec4(scatter,transmission*black);
        }`,
    });
    this.composite = new THREE.ShaderMaterial({
      name: 'NeonAtmosphereComposite', uniforms: {tMist: {value: this.target.texture}},
      depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      vertexShader,
      fragmentShader: `varying vec2 vUv;uniform sampler2D tMist;
        void main(){gl_FragColor=texture2D(tMist,vUv);}`,
    });
    this.quad = new FullScreenQuad(this.volume);
  }

  setSceneDepth(depth: THREE.Texture | null, packed=false): void {
    this.volume.uniforms.tDepth.value = depth;
    this.volume.uniforms.uPackedDepth.value=packed?1:0;
  }

  update(seconds: number): void { this.time = seconds; }

  setLook(look:boolean):void {this.volume.uniforms.uLook.value=look?1:0;}
  setExtreme(extreme:boolean):void {this.extreme=extreme;this.volume.uniforms.uSteps.value=extreme?24:8;this.volume.uniforms.uLightCount.value=extreme?8:4;this.volume.uniforms.uExtreme.value=extreme?1:0;this.setSize(this.width,this.height);}
  override setSize(width: number, height: number): void {
    this.width=width;this.height=height;const scale=this.extreme?.65:.4;
    this.target.setSize(Math.max(1, Math.ceil(width*scale)), Math.max(1, Math.ceil(height*scale)));
  }

  override render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    const u = this.volume.uniforms;
    if (!u.tDepth.value) return;
    u.uEye.value.setFromMatrixPosition(this.camera.matrixWorld);
    u.uInverseProjection.value.copy(this.camera.projectionMatrixInverse);
    u.uCameraWorld.value.copy(this.camera.matrixWorld);
    u.uTime.value = this.time;
    const nearest = this.lights.slice().sort((a,b) =>
      a.position.distanceToSquared(u.uEye.value)-b.position.distanceToSquared(u.uEye.value));
    for (let i=0;i<8;i++) {
      u.uLights.value[i].copy(nearest[i]?.position ?? this.camera.position);
      u.uRadiance.value[i].copy(nearest[i]?.radiance ?? new THREE.Vector3());
    }
    renderer.setRenderTarget(this.target);
    this.quad.material = this.volume; this.quad.render(renderer);
    renderer.setRenderTarget(this.renderToScreen ? null : read);
    const autoClear=renderer.autoClear;
    try {
      renderer.autoClear=false; // Blend over the scene; never clear its colour.
      this.quad.material=this.composite;this.quad.render(renderer);
    } finally {renderer.autoClear=autoClear;}
  }

  override dispose(): void {
    this.target.dispose(); this.volume.dispose(); this.composite.dispose(); this.quad.dispose();
  }
}
