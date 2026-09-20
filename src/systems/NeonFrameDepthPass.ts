import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/** Preserve scene depth for camera motion blur after composer buffer swaps.
 * RGBA packing avoids half-float depth precision loss and texture feedback.
 */
export class NeonFrameDepthPass extends Pass {
  readonly target = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
  });
  private readonly material = new THREE.ShaderMaterial({
    name: 'NeonPreserveSceneDepth', depthTest: false, depthWrite: false,
    uniforms: {tDepth: {value: null}},
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `#include <packing>
      varying vec2 vUv;uniform sampler2D tDepth;
      void main(){gl_FragColor=packDepthToRGBA(texture2D(tDepth,vUv).r);}`,
  });
  private readonly quad = new FullScreenQuad(this.material);
  constructor() {super(); this.needsSwap = false;}
  override setSize(width: number, height: number): void {this.target.setSize(width,height);}
  override render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    this.material.uniforms.tDepth.value=read.depthTexture;
    renderer.setRenderTarget(this.target);this.quad.render(renderer);
  }
  override dispose(): void {this.target.dispose();this.material.dispose();this.quad.dispose();}
}
