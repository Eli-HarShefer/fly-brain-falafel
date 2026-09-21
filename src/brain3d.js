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

/** How close a ray has to pass to a neuron to pick it, in world units. */
const PICK_RADIUS = 0.016;

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

/**
 * Background cloud tint per anatomical super-class, so the optic lobes separate
 * from the central brain instead of the whole thing being one grey fog. Index
 * order matches cloud.json superClasses.
 * ascending, central, descending, endocrine, motor, optic, sensory,
 * sensory_ascending, visual_centrifugal, visual_projection
 */
const CLOUD_TINT = [
  [0.44, 0.50, 0.60],  // ascending
  [0.42, 0.46, 0.56],  // central
  [0.72, 0.46, 0.40],  // descending - warm, they are the output
  [0.50, 0.46, 0.58],  // endocrine
  [0.66, 0.50, 0.44],  // motor
  [0.34, 0.50, 0.60],  // optic - the big cool mass
  [0.52, 0.50, 0.44],  // sensory
  [0.48, 0.50, 0.52],  // sensory_ascending
  [0.40, 0.54, 0.58],  // visual_centrifugal
  [0.40, 0.58, 0.66],  // visual_projection
];

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
    // framed on the head, where the connectome is; zoom out to see the animal
    this.camera.position.set(0.15, 0.62, 3.55);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.9;
    this.controls.maxDistance = 16;   // far enough to take in the whole fly
    // The brain always turns - a still point cloud reads as a picture, a
    // turning one reads as an object. Reduced motion slows it and calms the
    // spike strobe rather than freezing the scene outright.
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = this.reducedMotion ? 0.5 : 0.95;
    this.idleSpin = this.controls.autoRotateSpeed;
    // pause while the user is dragging, then drift back on
    this.resumeIn = 0;
    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false;
      this.resumeIn = 2.2;
    });

    this.buildCloud(cloud);
    this.buildCircuit(circuit, meta);
    this.buildEdges(circuit, meta);
    this.buildPicking(circuit);
    this.buildBody();

    // orbit around where the mass actually is, not the bounding-box midpoint
    this.controls.target.copy(this.center);
    this.camera.position.add(this.center);
    this.controls.update();

    const rp = new RenderPass(this.scene, this.camera);
    // threshold kept high so only genuine spike flares bloom, not the cloud
    // Kept modest: with the translucent head shell stacking on top of the point
    // cloud, a stronger bloom turns the whole brain into one white blob and the
    // structure stops reading.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.52, 0.68, 0.62);
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

    const col = new Float32Array(cloud.n * 3);
    for (let i = 0; i < cloud.n; i++) {
      const t = CLOUD_TINT[cloud.group[i]] || CLOUD_TINT[1];
      col[i * 3] = t[0]; col[i * 3 + 1] = t[1]; col[i * 3 + 2] = t[2];
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));

    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < cloud.n; i++) { cx += p[i * 3]; cy += p[i * 3 + 1]; cz += p[i * 3 + 2]; }
    this.center = new THREE.Vector3(cx / cloud.n, cy / cloud.n, cz / cloud.n);

    const m = new THREE.PointsMaterial({
      vertexColors: true,
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

  /**
   * A sampled subset of the pathway wiring.
   *
   * Each edge remembers which neuron it comes from, so it can brighten while
   * that neuron is firing. The result is that you watch signal travel along the
   * actual connections rather than just seeing endpoints blink: the same thing
   * the 2D pathway panel shows, in anatomical space.
   */
  buildEdges(circuit, meta, cap = 3600) {
    const keep = [];
    const roles = meta.roles;
    for (let a = 0; a < circuit.nNeurons && keep.length < cap * 3; a++) {
      if (roles[a] === 'other') continue;
      for (let k = circuit.indptr[a]; k < circuit.indptr[a + 1]; k++) {
        const b = circuit.indices[k];
        if (roles[b] === 'other') continue;
        keep.push(a, b, circuit.weights[k] < 0 ? 1 : 0);
      }
    }
    const nEdge = keep.length / 3;
    const stride = Math.max(1, Math.floor(nEdge / cap));
    const verts = [];
    const src = [];
    const inh = [];
    for (let i = 0; i < nEdge; i += stride) {
      const a = keep[i * 3], b = keep[i * 3 + 1];
      verts.push(
        circuit.pos[a * 3], -circuit.pos[a * 3 + 1], circuit.pos[a * 3 + 2],
        circuit.pos[b * 3], -circuit.pos[b * 3 + 1], circuit.pos[b * 3 + 2],
      );
      src.push(a);
      inh.push(keep[i * 3 + 2]);
    }
    this.edgeSrc = Int32Array.from(src);
    this.edgeInh = Uint8Array.from(inh);
    this.edgeColor = new Float32Array(src.length * 6);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    this.edgeColorAttr = new THREE.BufferAttribute(this.edgeColor, 3);
    this.edgeColorAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('color', this.edgeColorAttr);
    const m = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.edges = new THREE.LineSegments(g, m);
    this.scene.add(this.edges);
    this.paintEdges();
  }

  /** Recolour edges from the activity of the neuron each one leaves. */
  paintEdges() {
    if (!this.edgeSrc) return;
    const c = this.edgeColor, src = this.edgeSrc, inh = this.edgeInh, f = this.flash;
    for (let e = 0; e < src.length; e++) {
      const a = f ? f[src[e]] : 0;
      // dim resting wire, warming toward the sign's colour as it carries signal
      const base = 0.045;
      let r, g, b;
      if (inh[e]) { r = base + a * 0.62; g = base * 0.7 + a * 0.20; b = base * 0.6 + a * 0.14; }
      else { r = base * 0.5 + a * 0.16; g = base + a * 0.50; b = base * 1.4 + a * 0.62; }
      const o = e * 6;
      c[o] = r; c[o + 1] = g; c[o + 2] = b;
      c[o + 3] = r * 0.35; c[o + 4] = g * 0.35; c[o + 5] = b * 0.35;
    }
    this.edgeColorAttr.needsUpdate = true;
  }

  /**
   * In-degree per neuron, and a raycaster, so a neuron can be identified by
   * pointing at it. The 3D view is a map of a real brain; being able to ask
   * "what is that one" is most of what makes it worth looking at.
   */
  buildPicking(circuit) {
    const n = circuit.nNeurons;
    this.outDeg = new Int32Array(n);
    this.inDeg = new Int32Array(n);
    for (let a = 0; a < n; a++) {
      this.outDeg[a] = circuit.indptr[a + 1] - circuit.indptr[a];
      for (let k = circuit.indptr[a]; k < circuit.indptr[a + 1]; k++) this.inDeg[circuit.indices[k]]++;
    }
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points.threshold = PICK_RADIUS;
    this.pointer = new THREE.Vector2();
    this.selected = -1;
    this.hovered = -1;
  }

  /**
   * @param {number} nx normalised device x in [-1,1]
   * @param {number} ny normalised device y in [-1,1]
   * @returns neuron index, or -1
   */
  pick(nx, ny) {
    if (!this.raycaster) return -1;
    this.pointer.set(nx, ny);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.points, false);
    if (!hits.length) return -1;
    // prefer an identified neuron over a background one at similar depth
    let best = hits[0];
    const roles = this.meta.roles;
    for (const h of hits) {
      if (h.distance > best.distance * 1.25) break;
      if (roles[h.index] !== 'other' && roles[best.index] === 'other') best = h;
    }
    return best.index;
  }

  setHovered(i) { this.hovered = i; }
  setSelected(i) { this.selected = i; }

  /** Everything worth showing about one neuron. */
  describe(i) {
    if (i < 0 || i >= this.n) return null;
    const m = this.meta;
    return {
      index: i,
      type: m.types[i],
      side: m.sides[i],
      role: m.roles[i],
      nt: m.nt ? m.nt[i] : null,
      rate: this.lastRate ? this.lastRate[i] : 0,
      outDeg: this.outDeg[i],
      inDeg: this.inDeg[i],
    };
  }

  /**
   * The fly around its own brain.
   *
   * The scale is not invented: FlyWire coordinates are real positions inside a
   * real head, so once the point cloud is in the scene the head has to be built
   * around it rather than the other way round. One scene unit is about 450 um,
   * the brain spans roughly 900 x 440 x 280 um, and a head is about 800 um
   * across - which is why the brain very nearly fills it. The optic lobes are
   * the wide parts at the sides, and they are most of the volume.
   *
   * The body is translucent with depthWrite off so the neurons keep glowing
   * through it.
   */
  buildBody() {
    const g = new THREE.Group();

    const shell = (rx, ry, rz, x, y, z, color, opacity) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(1, 28, 20),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity,
          depthWrite: false, side: THREE.DoubleSide,
        }),
      );
      m.scale.set(rx, ry, rz);
      m.position.set(x, y, z);
      g.add(m);
      // a faint wireframe so the silhouette reads against the glow
      const w = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 11),
        new THREE.MeshBasicMaterial({
          color, wireframe: true, transparent: true,
          opacity: opacity * 0.5, depthWrite: false,
        }),
      );
      w.scale.copy(m.scale);
      w.position.copy(m.position);
      g.add(w);
      return m;
    };

    // head, wrapped around the connectome; +z is posterior, so the fly faces -z
    shell(1.22, 0.70, 0.60, 0, 0.02, 0.06, 0x8a6a34, 0.085);
    // thorax
    shell(0.92, 0.82, 1.15, 0, -0.18, 1.62, 0x6b4a20, 0.15);
    // abdomen, tapering back
    shell(0.80, 0.74, 1.45, 0, -0.30, 3.65, 0xa8813a, 0.15);
    // abdominal banding
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.045, 8, 36),
        new THREE.MeshBasicMaterial({
          color: 0x2a1c0d, transparent: true, opacity: 0.22, depthWrite: false,
        }),
      );
      const t = i / 4;
      ring.scale.set(0.80 * (1 - t * 0.42), 0.74 * (1 - t * 0.42), 1);
      ring.position.set(0, -0.30, 2.6 + i * 0.72);
      g.add(ring);
    }

    // compound eyes: the one part that should read solid and red
    for (const sgn of [-1, 1]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(1, 22, 16),
        new THREE.MeshBasicMaterial({
          color: 0xc0392b, transparent: true, opacity: 0.22, depthWrite: false,
        }),
      );
      eye.scale.set(0.40, 0.50, 0.44);
      eye.position.set(sgn * 1.02, 0.06, -0.10);
      g.add(eye);
    }

    // Wings, swept back over the abdomen. The shape is drawn with its length
    // along +y so that a +90 deg turn about X lays it flat in the XZ plane with
    // the length running backwards; drawing it along x instead leaves the wings
    // sticking straight out sideways.
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.bezierCurveTo(0.55, 0.6, 0.92, 2.9, 0.34, 4.3);
    wingShape.bezierCurveTo(-0.18, 3.0, -0.44, 1.2, 0, 0);
    const wingGeo = new THREE.ShapeGeometry(wingShape, 20);
    for (const sgn of [-1, 1]) {
      const wing = new THREE.Mesh(wingGeo, new THREE.MeshBasicMaterial({
        color: 0xcfe6f0, transparent: true, opacity: 0.10,
        depthWrite: false, side: THREE.DoubleSide,
      }));
      wing.position.set(sgn * 0.42, 0.62, 1.35);
      wing.rotation.x = Math.PI / 2;
      wing.rotation.z = sgn * 0.30;     // splay outward
      wing.rotation.y = sgn * -0.16;    // and tilt up a little
      wing.scale.set(sgn, 1, 1);
      g.add(wing);
    }

    // legs
    const legMat = new THREE.LineBasicMaterial({
      color: 0x5a4020, transparent: true, opacity: 0.34, depthWrite: false,
    });
    const legs = [
      [0.55, 0.55, -0.9, 1.5, -1.3], [0.75, 1.55, -1.0, 1.9, -0.2],
      [0.70, 2.35, -1.0, 2.0, 1.1],
    ];
    for (const sgn of [-1, 1]) {
      for (const [ox, oz, kx, ky, kz] of legs) {
        const pts = [
          new THREE.Vector3(sgn * ox, -0.6, oz),
          new THREE.Vector3(sgn * (ox + 0.75), -1.15, oz + kz * 0.25),
          new THREE.Vector3(sgn * (ox + kx * -1), -1.05 - ky * 0.25, oz + kz * 0.7),
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        g.add(new THREE.Line(geo, legMat));
      }
    }

    // sit the whole animal on the brain's own centre
    g.position.copy(this.center);
    this.body = g;
    this.scene.add(g);
  }

  setBodyVisible(v) { if (this.body) this.body.visible = v; }

  setEdgesVisible(v) { if (this.edges) this.edges.visible = v; }
  setCloudVisible(v) { if (this.cloud) this.cloud.visible = v; }

  /** Flare the neurons that spiked since the last frame. */
  pushSpikes(buf, count) {
    const f = this.flash;
    for (let i = 0; i < count; i++) f[buf[i]] = 1;
  }

  render(dt, rates) {
    if (rates) this.lastRate = rates;
    const f = this.flash;
    // slower decay when reduced motion is requested: same information, less strobe
    const decay = Math.exp(-dt / (this.reducedMotion ? 0.24 : 0.085));
    for (let i = 0; i < f.length; i++) if (f[i] > 0.002) f[i] *= decay; else f[i] = 0;
    if (this.resumeIn > 0) {
      this.resumeIn -= dt;
      if (this.resumeIn <= 0) this.controls.autoRotate = true;
    }

    // keep hover and selection visibly lit so they can be found again
    if (this.hovered >= 0) f[this.hovered] = Math.max(f[this.hovered], 0.75);
    if (this.selected >= 0) f[this.selected] = 1;
    this.flashAttr.needsUpdate = true;
    if (this.edges.visible) this.paintEdges();
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
