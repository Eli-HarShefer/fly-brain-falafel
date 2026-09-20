/**
 * The connectome, drawn where it actually sits.
 *
 * Every point is a real neuron at its real FlyWire coordinate: 139,255 of them
 * as a dim background cloud, and the 4,798 of the working circuit on top,
 * coloured by role. When a neuron spikes it flares at its own anatomical
 * position, so the signal visibly crosses the brain from the optic lobes to the
 * descending neurons in the neck.
 *
 * FAFB coordinates run y-down, so y is negated to put dorsal up.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const ROLE_COLORS = {
  lc10a: 0x86d9ec,
  lplc2: 0xb28ae8,
  aotu: 0xf5cc72,
  cx: 0x8fd6a6,
  dn: 0xf08268,
  vis: 0x6fa8bd,
  other: 0x6c7480,
};

export const ROLE_LABELS = {
  lc10a: 'LC10a · גלאי מטרה',
  lplc2: 'LPLC2 · גלאי לומינג',
  aotu: 'AOTU · ממסר היגוי',
  cx: 'קומפלקס מרכזי · כיוון ומטרה',
  dn: 'נוירונים יורדים · פלט מוטורי',
};

const CLOUD_MAGIC = 'FLYP';

export function parseCloud(buffer) {
  const dv = new DataView(buffer);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== CLOUD_MAGIC) throw new Error('cloud.bin: bad magic ' + magic);
  const n = dv.getUint32(8, true);
  const pos = new Float32Array(buffer, 16, n * 3);
  const group = new Uint8Array(buffer, 16 + n * 12, n);
  return { n, pos, group };
}

const CIRCUIT_VS = `
attribute vec3 aColor;
attribute float aFlash;
attribute float aBase;
varying vec3 vColor;
varying float vFlash;
uniform float uScale;
void main() {
  vColor = aColor;
  vFlash = aFlash;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = (aBase + aFlash * 9.0) * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const CIRCUIT_FS = `
varying vec3 vColor;
varying float vFlash;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d);
  if (r > 0.25) discard;
  float soft = smoothstep(0.25, 0.0, r);
  float bright = 0.30 + vFlash * 2.6;
  gl_FragColor = vec4(vColor * bright, soft * (0.55 + vFlash * 0.45));
}`;

export class BrainView {
  constructor(canvas, circuit, meta, cloud) {
    this.canvas = canvas;
    this.meta = meta;
    this.n = circuit.nNeurons;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    this.renderer.setClearColor(0x080605, 1);
    this.renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 60);
    // frontal view down the anterior-posterior axis, where the bilateral shape
    // of the brain and both optic lobes read at once
    this.camera.position.set(0, 0.30, 1.95);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.9;
    this.controls.maxDistance = 5;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.42;
    this.controls.addEventListener('start', () => { this.controls.autoRotate = false; });

    this.buildCloud(cloud);
    this.buildCircuit(circuit, meta);
    this.buildEdges(circuit, meta);

    // orbit around where the mass actually is, not the bounding-box midpoint
    this.controls.target.copy(this.center);
    this.camera.position.add(this.center);
    this.controls.update();

    const rp = new RenderPass(this.scene, this.camera);
    // threshold kept high so only genuine spike flares bloom, not the cloud
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.72, 0.62, 0.52);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(rp);
    this.composer.addPass(this.bloom);

    this.resize();
  }

  buildCloud(cloud) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(cloud.n * 3);
    for (let i = 0; i < cloud.n; i++) {
      p[i * 3] = cloud.pos[i * 3];
      p[i * 3 + 1] = -cloud.pos[i * 3 + 1];
      p[i * 3 + 2] = cloud.pos[i * 3 + 2];
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));

    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < cloud.n; i++) { cx += p[i * 3]; cy += p[i * 3 + 1]; cz += p[i * 3 + 2]; }
    this.center = new THREE.Vector3(cx / cloud.n, cy / cloud.n, cz / cloud.n);

    const m = new THREE.PointsMaterial({
      color: 0x64768a,
      size: 0.0050,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.115,
      depthWrite: false,
      // NOT additive: 139k overlapping points accumulate past 1.0 in the dense
      // neuropils and the whole brain blows out to a white blob
      blending: THREE.NormalBlending,
    });
    this.cloud = new THREE.Points(g, m);
    this.scene.add(this.cloud);
  }

  buildCircuit(circuit, meta) {
    const n = circuit.nNeurons;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const base = new Float32Array(n);
    this.flash = new Float32Array(n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      pos[i * 3] = circuit.pos[i * 3];
      pos[i * 3 + 1] = -circuit.pos[i * 3 + 1];
      pos[i * 3 + 2] = circuit.pos[i * 3 + 2];
      const role = meta.roles[i];
      c.setHex(ROLE_COLORS[role] ?? ROLE_COLORS.other);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      base[i] = role === 'other' ? 1.7 : role === 'dn' ? 8.0 : 3.6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aBase', new THREE.BufferAttribute(base, 1));
    this.flashAttr = new THREE.BufferAttribute(this.flash, 1);
    this.flashAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aFlash', this.flashAttr);

    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 300 } },
      vertexShader: CIRCUIT_VS,
      fragmentShader: CIRCUIT_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.scene.add(this.points);
  }

  /** A sampled subset of the pathway wiring, so the shape of the circuit reads. */
  buildEdges(circuit, meta, cap = 3600) {
    const keep = [];
    const roles = meta.roles;
    for (let a = 0; a < circuit.nNeurons && keep.length < cap * 3; a++) {
      if (roles[a] === 'other') continue;
      for (let k = circuit.indptr[a]; k < circuit.indptr[a + 1]; k++) {
        const b = circuit.indices[k];
        if (roles[b] === 'other') continue;
        keep.push(a, b);
      }
    }
    const stride = Math.max(1, Math.floor(keep.length / 2 / cap));
    const verts = [];
    for (let i = 0; i < keep.length; i += 2 * stride) {
      const a = keep[i], b = keep[i + 1];
      verts.push(
        circuit.pos[a * 3], -circuit.pos[a * 3 + 1], circuit.pos[a * 3 + 2],
        circuit.pos[b * 3], -circuit.pos[b * 3 + 1], circuit.pos[b * 3 + 2],
      );
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const m = new THREE.LineBasicMaterial({
      color: 0x3f5a6b, transparent: true, opacity: 0.13,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.edges = new THREE.LineSegments(g, m);
    this.scene.add(this.edges);
  }

  setEdgesVisible(v) { if (this.edges) this.edges.visible = v; }
  setCloudVisible(v) { if (this.cloud) this.cloud.visible = v; }

  /** Flare the neurons that spiked since the last frame. */
  pushSpikes(buf, count) {
    const f = this.flash;
    for (let i = 0; i < count; i++) f[buf[i]] = 1;
  }

  render(dt) {
    const f = this.flash;
    const decay = Math.exp(-dt / 0.085);
    for (let i = 0; i < f.length; i++) if (f[i] > 0.002) f[i] *= decay; else f[i] = 0;
    this.flashAttr.needsUpdate = true;
    this.controls.update();
    this.composer.render();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(200, r.width), h = Math.max(160, r.height);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // gl_PointSize is in device pixels: base * uScale / distance. A base of 3.6
    // at distance ~2.3 should land near 3 px, so uScale stays close to 2.
    // (It was h * 0.42 here, which put single points at 600+ px and turned the
    // additive blend into a white screen.)
    const dpr = this.renderer.getPixelRatio();
    this.mat.uniforms.uScale.value = Math.max(1.2, h * dpr * 0.0046);
  }
}
