/** Metre-scale, world-anchored wet patches shared by both reflection paths.
 * Coarse drainage and smaller broken edges keep the road from becoming a mirror.
 */
export const neonWetSurfaceGLSL = `
float wetHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float wetNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(wetHash(i),wetHash(i+vec2(1,0)),f.x),mix(wetHash(i+vec2(0,1)),wetHash(i+vec2(1)),f.x),f.y);}
float wetPuddle(vec2 p){
 float broad=wetNoise(p*.16);
 float edge=wetNoise(p*.73+vec2(9.2,4.7));
 return smoothstep(.34,.67,broad*.72+edge*.28);
}
`;
