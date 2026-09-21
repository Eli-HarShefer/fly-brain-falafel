/**
 * A still from the published research, drifting.
 *
 * The HHMI film and the Google Research blog images are all rights reserved, so
 * none of that is here. What is here comes from the papers themselves, which
 * are open access under CC BY 4.0 - the figures may be reused, including
 * commercially, as long as they are credited. The credit is burnt into the
 * frame rather than left to the description, because that is the condition.
 *
 * The motion is a slow push or pull with a little drift, the thing editors call
 * a Ken Burns: enough that a still does not read as a freeze, little enough
 * that it never draws attention to itself.
 */

/** Paper white, so a figure on a white background does not sit in a box. */
const PAPER = '#f3f0ea';

export function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('image failed: ' + src));
    img.src = src;
  });
}

/** Ease that starts and ends calm, so the drift has no visible kick. */
const ease = (p) => p * p * (3 - 2 * p);

export class PhotoView {
  /**
   * @param opt.zoom   'in' | 'out'
   * @param opt.seconds how long the move takes to run its full course
   * @param opt.credit  the attribution, drawn into the frame
   */
  constructor(canvas, img, opt = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.img = img;
    this.zoom = opt.zoom || 'in';
    this.seconds = opt.seconds || 10;
    this.credit = opt.credit || '';
    this.fit = opt.fit || 'contain';
    this.dpr = 2;
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.round(r.width * this.dpr);
    this.h = Math.round(r.height * this.dpr);
    this.canvas.width = this.w;
    this.canvas.height = this.h;
  }

  /** @param t seconds since the scene started */
  draw(t) {
    const ctx = this.ctx;
    const d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    const p = ease(Math.max(0, Math.min(1, t / this.seconds)));
    const k = this.zoom === 'in' ? 1 + p * 0.15 : 1.15 - p * 0.15;

    const iw = this.img.naturalWidth, ih = this.img.naturalHeight;

    if (this.fit === 'cover') {
      // fill the frame and crop: for a texture like raw tissue there is
      // nothing at the edges worth keeping, and a letterbox would waste half
      // the screen
      const fit = Math.max(this.w / iw, this.h / ih) * k;
      const dw = iw * fit, dh = ih * fit;
      const drift = (this.zoom === 'in' ? p : 1 - p) * 0.03;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.img,
        (this.w - dw) / 2 - drift * this.w,
        (this.h - dh) / 2 + drift * this.h * 0.4, dw, dh);
    } else {
      // whole figure, on a paper card sized to it, floating on the dark frame
      const fit = Math.min(this.w / iw, this.h / ih) * k * 0.96;
      const dw = iw * fit, dh = ih * fit;
      const x = (this.w - dw) / 2, y = (this.h - dh) / 2;
      const pad = 14 * d;
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.roundRect(x - pad, y - pad, dw + pad * 2, dh + pad * 2, 16 * d);
      ctx.fill();
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.img, x, y, dw, dh);
    }

    if (this.credit) {
      ctx.direction = 'ltr';
      ctx.textAlign = 'right';
      ctx.font = '600 ' + (11 * d).toFixed(0) + 'px JetBrains Mono, monospace';
      const pad = 12 * d;
      const tw = ctx.measureText(this.credit).width;
      ctx.fillStyle = 'rgba(12,10,10,0.72)';
      ctx.beginPath();
      ctx.roundRect(this.w - tw - pad * 2.4, this.h - 30 * d, tw + pad * 1.8, 24 * d, 8 * d);
      ctx.fill();
      ctx.fillStyle = 'rgba(247,242,234,0.92)';
      ctx.fillText(this.credit, this.w - pad * 1.5, this.h - 13 * d);
    }
  }
}
