"use client";

import * as React from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { resolveDiagram, type Diagram, type Frame } from "@/engines/diagram";
import type { CourtPack, Pt } from "@/engines/diagram/pack";
import { PALETTES } from "@/engines/diagram/render/palette";

/**
 * The drill in three dimensions: the court's own markings painted on a hardwood floor, regulation-height hoops,
 * players as standing (or wheelchair) figures, and the ball at its real height — in a hand, on a dribble, on a pass,
 * or on its arc to the rim. Every position comes from the playback `frame` (the same timeline as the 2D player), so
 * the 3D view can never disagree with the diagram. Coordinates: court x → world x, court y → world z, height → world y.
 *
 * Loaded on demand (the 3D view is opt-in) and rendered on demand: a frame is drawn only when playback moves or the
 * camera is dragged, so an idle court costs nothing. Everything created here is disposed of on unmount.
 */

const RIM_HEIGHT = 3.05;
const BALL_R = 0.12;
const HAND = 1.0;
const INK = "#0F1B33";
const PX_PER_M = 72;
const LINE_W = 0.05;

export interface Court3DProps {
  diagram: Diagram;
  pack: CourtPack;
  /** Where everything is now; null = the drill at rest (start positions, every line shown). */
  frame: Frame | null;
  label: string;
  description: string;
  /** Called once if this device cannot draw WebGL — the player falls back to the flat view. */
  onUnavailable: () => void;
}

interface World {
  update(frame: Frame | null): void;
  resize(): void;
  dispose(): void;
}

export default function Court3D({
  diagram,
  pack,
  frame,
  label,
  description,
  onUnavailable,
}: Court3DProps) {
  const host = React.useRef<HTMLDivElement>(null);
  const world = React.useRef<World | null>(null);
  const descId = React.useId();

  React.useEffect(() => {
    const el = host.current;
    if (!el) return;
    const w = createWorld(el, diagram, pack);
    if (!w) {
      onUnavailable();
      return;
    }
    world.current = w;
    const ro = new ResizeObserver(() => w.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      w.dispose();
      world.current = null;
    };
  }, [diagram, pack, onUnavailable]);

  React.useEffect(() => {
    world.current?.update(frame);
  }, [frame]);

  return (
    <div
      ref={host}
      role="img"
      aria-label={label}
      aria-describedby={descId}
      className="relative aspect-[4/3] max-h-[36rem] w-full cursor-grab touch-none bg-[#0F1B33] active:cursor-grabbing"
    >
      <p id={descId} className="sr-only">
        {description}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// the scene
// ---------------------------------------------------------------------------------------------

function cssColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function createWorld(el: HTMLDivElement, diagram: Diagram, pack: CourtPack): World | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = "block";
  renderer.domElement.setAttribute("aria-hidden", "true");
  el.appendChild(renderer.domElement);

  const accent = cssColor("--accent-bright", "#F26A1B");
  const { resolved } = resolveDiagram(diagram, pack);
  const { minX, maxX, minY, maxY } = pack.bounds;
  const m = Math.max(pack.margin, 3.4); // run-off: real floors extend past the lines, under the stanchions
  const area = { x0: minX - m, x1: maxX + m, y0: minY - m, y1: maxY + m };
  const cx = (area.x0 + area.x1) / 2;
  const cz = (area.y0 + area.y1) / 2;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(INK);
  scene.fog = new THREE.Fog(INK, 34, 80);

  // light: a bright gym ceiling, one key light for shadows
  scene.add(new THREE.HemisphereLight("#e8eeff", "#7a5534", 1.25));
  const sun = new THREE.DirectionalLight("#fff6ea", 2.4);
  sun.position.set(cx + 6, 20, cz - 5);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const half = Math.max(area.x1 - area.x0, area.y1 - area.y0) / 2 + 2;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, far: 60 });
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  // the arena floor beyond the court, then the court itself
  const arena = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: "#1a2540", roughness: 0.95 }),
  );
  arena.rotation.x = -Math.PI / 2;
  arena.position.y = -0.01;
  arena.receiveShadow = true;
  scene.add(arena);

  const floorTex = new THREE.CanvasTexture(paintFloor(pack, area, accent));
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(area.x1 - area.x0, area.y1 - area.y0),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.42, metalness: 0.0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  scene.add(floor);

  for (const hoop of pack.hoops ?? []) scene.add(buildHoop(hoop.at, hoop.board, accent));

  // the drawn actions, as ribbons on the floor (shown as they play, like the 2D view)
  const actionMeshes = new Map<string, THREE.Object3D>();
  for (const ra of resolved.actions) {
    const a = ra.action;
    const pts =
      a.type === "shot"
        ? [ra.points[0]!, ra.points[ra.points.length - 1]!]
        : (ra.points as readonly Pt[]);
    if (pts.length < 2) continue;
    const color = a.type === "pass" || a.type === "shot" ? accent : INK;
    const dash = a.type === "pass" ? [0.34, 0.24] : a.type === "shot" ? [0.08, 0.2] : null;
    const mesh = ribbon(pts, a.type === "dribble" ? 0.07 : 0.055, color, dash);
    actionMeshes.set(a.id, mesh);
    scene.add(mesh);
  }

  // people and things
  const actors = new Map<string, THREE.Object3D>();
  const balls = new Map<string, THREE.Mesh>();
  const ballTex = new THREE.CanvasTexture(paintBall());
  ballTex.colorSpace = THREE.SRGBColorSpace;
  for (const re of resolved.entities) {
    const e = re.entity;
    let obj: THREE.Object3D | null = null;
    if (e.type === "player") {
      const named = e.color ? PALETTES.print.named[e.color].fill : undefined;
      obj = buildPlayer(
        e.side,
        named ?? (e.side === "offense" ? accent : "#12224A"),
        e.label,
        e.mobility === "chair",
      );
    } else if (e.type === "coach") {
      obj = buildPlayer("coach", INK, e.label ?? "C", false);
    } else if (e.type === "cone") {
      obj = new THREE.Mesh(
        new THREE.ConeGeometry(0.13, 0.32, 20),
        new THREE.MeshStandardMaterial({
          color: e.color ? PALETTES.print.named[e.color].fill : accent,
          roughness: 0.6,
        }),
      );
      obj.position.y = 0.16;
      obj.castShadow = true;
      const g = new THREE.Group();
      g.add(obj);
      obj = g;
    } else if (e.type === "marker") {
      obj = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.012, 24),
        new THREE.MeshStandardMaterial({
          color: e.color ? PALETTES.print.named[e.color].fill : "#F4F6F9",
        }),
      );
    } else if (e.type === "equipment") {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.16, 0.5),
        new THREE.MeshStandardMaterial({ color: "#c9ced8", roughness: 0.7 }),
      );
      box.position.y = 0.08;
      box.castShadow = true;
      obj = new THREE.Group();
      obj.add(box);
    } else if (e.type === "ball") {
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(BALL_R, 32, 16),
        new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.68 }),
      );
      ball.castShadow = true;
      balls.set(e.id, ball);
      obj = ball;
    }
    if (!obj) continue;
    if ("scale" in e && e.scale) obj.scale.setScalar(e.scale);
    if ("rotation" in e && e.rotation) obj.rotation.y = (-e.rotation * Math.PI) / 180;
    obj.position.x = re.at.x;
    obj.position.z = re.at.y;
    actors.set(e.id, obj);
    scene.add(obj);
  }

  // the camera: behind the play, looking at the basket, like a coach up in the stands
  const target = pack.primaryTarget;
  const dir = Math.sign(cz - target.y) || 1;
  const span = maxY - minY; // frame the court lines, not the run-off
  const camera = new THREE.PerspectiveCamera(40, 4 / 3, 0.1, 200);
  const look = new THREE.Vector3(cx, 1.4, target.y + dir * Math.min(span * 0.3, 4.2));
  camera.position.set(
    cx + 3,
    Math.min(13, 7.5 + span * 0.18),
    target.y + dir * Math.min(span * 1.2, 26),
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(look);
  controls.enablePan = false;
  controls.minDistance = 5;
  controls.maxDistance = 42;
  controls.maxPolarAngle = 1.36; // never under the floor
  controls.update();

  const render = () => renderer.render(scene, camera);
  controls.addEventListener("change", render);

  const resize = () => {
    const wpx = el.clientWidth;
    const hpx = el.clientHeight;
    if (!wpx || !hpx) return;
    renderer.setSize(wpx, hpx, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = wpx / hpx;
    camera.updateProjectionMatrix();
    render();
  };

  const people = resolved.entities
    .filter((re) => re.entity.type === "player" || re.entity.type === "coach")
    .map((re) => re.entity.id);
  const hoops = pack.hoops ?? [];

  const update = (frame: Frame | null) => {
    for (const re of resolved.entities) {
      const obj = actors.get(re.entity.id);
      if (!obj || re.entity.type === "ball") continue;
      const at = frame?.positions.get(re.entity.id) ?? re.at;
      obj.position.x = at.x;
      obj.position.z = at.y;
    }
    for (const [id, ball] of balls) {
      const at = frame?.positions.get(id) ?? resolved.entities.find((r) => r.entity.id === id)!.at;
      const fx = frame?.ballFx.get(id);
      ball.position.x = at.x;
      ball.position.z = at.y;
      ball.position.y = ballHeight(at, fx, frame, people, hoops);
      if (fx) ball.rotation.x = fx.spin;
    }
    for (const [id, mesh] of actionMeshes)
      mesh.visible = frame ? frame.visibleActions.has(id) : true;
    render();
  };

  resize();
  update(null);

  return {
    update,
    resize,
    dispose() {
      controls.removeEventListener("change", render);
      controls.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : mesh.material
            ? [mesh.material]
            : [];
        for (const mat of mats) {
          (mat as THREE.MeshStandardMaterial).map?.dispose();
          mat.dispose();
        }
      });
      floorTex.dispose();
      ballTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

/** The ball's height above the floor: from its flight when it has one, otherwise in a hand, in the net, or on the floor. */
function ballHeight(
  at: Pt,
  fx: Frame["ballFx"] extends Map<string, infer F> ? F | undefined : never,
  frame: Frame | null,
  people: readonly string[],
  hoops: readonly { at: Pt }[],
): number {
  if (fx) {
    switch (fx.kind) {
      case "dribble":
        return BALL_R + (fx.lift / 0.55) * (HAND - BALL_R);
      case "bounce":
        return BALL_R + (HAND + 0.1 - BALL_R) * Math.abs(Math.cos(Math.PI * fx.u));
      case "pass":
        return HAND + 0.15 + fx.lift;
      case "lob":
        return HAND + 0.4 + fx.lift;
      case "shot":
        return 2.3 + (RIM_HEIGHT + 0.15 - 2.3) * fx.u + fx.lift * 0.55;
    }
  }
  // no flight: someone's holding it if a player is within reach
  if (frame) {
    for (const id of people) {
      const p = frame.positions.get(id);
      if (p && Math.hypot(p.x - at.x, p.y - at.y) < 0.8) return HAND;
    }
    if (hoops.some((h) => Math.hypot(h.at.x - at.x, h.at.y - at.y) < 0.3)) return RIM_HEIGHT - 0.3;
    return BALL_R;
  }
  return HAND;
}

// ---------------------------------------------------------------------------------------------
// builders
// ---------------------------------------------------------------------------------------------

function labelSprite(text: string, fg: string, bg: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = fg;
  g.font = "700 64px Archivo, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text.slice(0, 3), 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.setScalar(0.5);
  return s;
}

function buildPlayer(
  side: "offense" | "defense" | "coach",
  color: string,
  label: string | undefined,
  chair: boolean,
): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05 });
  const bodyLen = chair ? 0.42 : 0.92;
  const lift = chair ? 0.55 : 0.0;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, bodyLen, 6, 16), mat);
  body.position.y = lift + 0.25 + bodyLen / 2;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), mat);
  head.position.y = lift + 0.5 + bodyLen + 0.2;
  head.castShadow = true;
  g.add(head);
  if (side === "defense") {
    // defenders wear a light band: readable against the offense at any angle
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.262, 0.04, 8, 32),
      new THREE.MeshStandardMaterial({ color: "#F4F6F9", roughness: 0.6 }),
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = body.position.y + 0.1;
    g.add(band);
  }
  if (chair) {
    const wheelMat = new THREE.MeshStandardMaterial({
      color: "#2a3550",
      roughness: 0.4,
      metalness: 0.5,
    });
    for (const sx of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 10, 32), wheelMat);
      wheel.rotation.y = Math.PI / 2;
      wheel.rotation.z = (sx * 12 * Math.PI) / 180; // cambered, like a sports chair
      wheel.position.set(sx * 0.34, 0.31, 0);
      wheel.castShadow = true;
      g.add(wheel);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.45), wheelMat);
    seat.position.y = 0.52;
    g.add(seat);
  }
  // a disc on the floor in the team colour: who's where, readable from far away
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.006;
  g.add(disc);
  if (label) {
    const ink = side === "offense" ? INK : "#F4F6F9";
    const s = labelSprite(label, ink, side === "offense" ? "#F4F6F9" : color);
    s.position.y = head.position.y + 0.42;
    g.add(s);
  }
  return g;
}

function buildHoop(at: Pt, board: 1 | -1, accent: string): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({
    color: "#3b4660",
    roughness: 0.45,
    metalness: 0.6,
  });
  const boardZ = at.y + board * 0.375;
  // backboard: clear glass with a white frame and shooter's square
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 1.05, 0.03),
    new THREE.MeshStandardMaterial({
      color: "#dfe9ff",
      transparent: true,
      opacity: 0.28,
      roughness: 0.05,
    }),
  );
  glass.position.set(at.x, 3.425, boardZ);
  g.add(glass);
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.8, 1.05, 0.03)),
    new THREE.LineBasicMaterial({ color: "#ffffff" }),
  );
  frame.position.copy(glass.position);
  g.add(frame);
  const square = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.59, 0.45)),
    new THREE.LineBasicMaterial({ color: "#ffffff" }),
  );
  square.position.set(at.x, RIM_HEIGHT + 0.15 + 0.225, boardZ - board * 0.02);
  g.add(square);
  // rim, arm and net
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.225, 0.012, 10, 40),
    new THREE.MeshStandardMaterial({ color: accent, roughness: 0.35, metalness: 0.4 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(at.x, RIM_HEIGHT, at.y);
  rim.castShadow = true;
  g.add(rim);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.16), steel);
  arm.position.set(at.x, RIM_HEIGHT - 0.02, at.y + board * 0.29);
  g.add(arm);
  const net = new THREE.Mesh(
    new THREE.CylinderGeometry(0.225, 0.15, 0.42, 14, 3, true),
    new THREE.MeshBasicMaterial({
      color: "#ffffff",
      wireframe: true,
      transparent: true,
      opacity: 0.7,
    }),
  );
  net.position.set(at.x, RIM_HEIGHT - 0.21, at.y);
  g.add(net);
  // support: a padded base behind the baseline, a post and a boom to the board
  const postZ = at.y + board * 2.9;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.4, 0.2), steel);
  post.position.set(at.x, 1.7, postZ);
  post.castShadow = true;
  g.add(post);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, Math.abs(postZ - boardZ)), steel);
  boom.position.set(at.x, 3.3, (postZ + boardZ) / 2);
  boom.castShadow = true;
  g.add(boom);
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.7, 1.6),
    new THREE.MeshStandardMaterial({ color: INK, roughness: 0.8 }),
  );
  base.position.set(at.x, 0.35, postZ + board * 0.5);
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);
  return g;
}

/** A flat ribbon on the floor along a polyline, optionally dashed, ending in an arrowhead. */
function ribbon(
  pts: readonly Pt[],
  width: number,
  color: string,
  dash: number[] | null,
): THREE.Mesh {
  const pos: number[] = [];
  const y = 0.012;
  const quad = (a: Pt, b: Pt, w: number) => {
    const dx = b.x - a.x;
    const dz = b.y - a.y;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * (w / 2);
    const nz = (dx / len) * (w / 2);
    pos.push(a.x + nx, y, a.y + nz, b.x + nx, y, b.y + nz, b.x - nx, y, b.y - nz);
    pos.push(a.x + nx, y, a.y + nz, b.x - nx, y, b.y - nz, a.x - nx, y, a.y - nz);
  };
  // walk the line, emitting dashes (or one continuous strip)
  let on = true;
  let left = dash ? dash[0]! : Infinity;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1]!;
    const b = pts[i]!;
    let seg = Math.hypot(b.x - a.x, b.y - a.y);
    while (seg > 1e-6) {
      const step = Math.min(seg, left);
      const u = step / seg;
      const c = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      if (on) quad(a, c, width);
      seg -= step;
      left -= step;
      a = c;
      if (dash && left <= 1e-6) {
        on = !on;
        left = on ? dash[0]! : dash[1]!;
      }
    }
  }
  // arrowhead
  const end = pts[pts.length - 1]!;
  const prev = pts[pts.length - 2]!;
  const dx = end.x - prev.x;
  const dz = end.y - prev.y;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const s = 0.32;
  pos.push(
    end.x + ux * s * 0.4,
    y,
    end.y + uz * s * 0.4,
    end.x - ux * s - uz * s * 0.6,
    y,
    end.y - uz * s + ux * s * 0.6,
    end.x - ux * s + uz * s * 0.6,
    y,
    end.y - uz * s - ux * s * 0.6,
  );
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// textures, painted once on a canvas
// ---------------------------------------------------------------------------------------------

/** A seeded random, so the same court always gets the same grain. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function applyTransform(g: CanvasRenderingContext2D, transform?: string) {
  if (!transform) return;
  for (const [, fn, args] of transform.matchAll(/(translate|scale)\(([^)]*)\)/g)) {
    const [a = 0, b] = args!
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (fn === "translate") g.translate(a, b ?? 0);
    else g.scale(a, b ?? a);
  }
}

function paintFloor(
  pack: CourtPack,
  area: { x0: number; x1: number; y0: number; y1: number },
  accent: string,
): HTMLCanvasElement {
  const wm = area.x1 - area.x0;
  const hm = area.y1 - area.y0;
  const scale = Math.min(PX_PER_M, 2048 / Math.max(wm, hm));
  const c = document.createElement("canvas");
  c.width = Math.round(wm * scale);
  c.height = Math.round(hm * scale);
  const g = c.getContext("2d")!;
  const rand = seeded(7);

  // maple boards running the length of the court, each a slightly different tone, with staggered butt joints
  const plank = 0.115;
  for (let x = 0; x < wm; x += plank) {
    const tone = 0.9 + rand() * 0.12;
    g.fillStyle = `rgb(${Math.round(222 * tone)} ${Math.round(178 * tone)} ${Math.round(122 * tone)})`;
    g.fillRect(x * scale, 0, plank * scale + 1, c.height);
    g.fillStyle = "rgba(90,55,25,0.18)";
    g.fillRect(x * scale, 0, 1, c.height);
    for (let y = rand() * 3; y < hm; y += 2.2 + rand() * 1.6)
      g.fillRect(x * scale, y * scale, plank * scale, 1);
  }
  // grain
  g.strokeStyle = "rgba(120,72,30,0.10)";
  g.lineWidth = 1;
  for (let i = 0; i < wm * 26; i++) {
    const x = rand() * wm * scale;
    const y = rand() * hm * scale;
    const l = (0.4 + rand() * 1.4) * scale;
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + 2, y + l * 0.3, x - 2, y + l * 0.6, x + rand() * 3, y + l);
    g.stroke();
  }

  // the court markings, in metres
  g.save();
  g.scale(scale, scale);
  g.translate(-area.x0, -area.y0);
  // stained out-of-bounds: everything beyond the court rectangle (the first primitive) is darker
  g.save();
  g.fillStyle = "rgba(60,30,10,0.28)";
  g.beginPath();
  g.rect(area.x0, area.y0, wm, hm);
  const { minX, maxX, minY, maxY } = pack.bounds;
  g.rect(maxX, minY, minX - maxX, maxY - minY); // counter-wound hole
  g.fill("evenodd");
  g.restore();

  for (const prim of pack.primitives) {
    g.save();
    applyTransform(g, prim.transform);
    const path = new Path2D(prim.d);
    if (prim.fill === "accent") {
      g.globalAlpha = 0.48;
      g.fillStyle = accent;
      g.fill(path);
      g.globalAlpha = 1;
    }
    g.strokeStyle = prim.stroke === "faint" ? "rgba(255,255,255,0.5)" : "#FBF8F2";
    g.lineWidth = LINE_W;
    g.setLineDash(prim.stroke === "dashed" ? [0.3, 0.22] : []);
    g.stroke(path);
    g.restore();
  }
  g.restore();

  // a satin finish: light pooling at the centre
  const glow = g.createRadialGradient(
    c.width / 2,
    c.height / 2,
    0,
    c.width / 2,
    c.height / 2,
    Math.max(c.width, c.height) * 0.7,
  );
  glow.addColorStop(0, "rgba(255,245,225,0.10)");
  glow.addColorStop(1, "rgba(0,0,0,0.12)");
  g.fillStyle = glow;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function paintBall(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#D9641E";
  g.fillRect(0, 0, 256, 128);
  // pebbled leather
  const rand = seeded(3);
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = rand() > 0.5 ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)";
    g.fillRect(rand() * 256, rand() * 128, 1.5, 1.5);
  }
  // seams: the equator, two meridians and the two curved panel lines
  g.strokeStyle = "#1b120c";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 64);
  g.lineTo(256, 64);
  for (const x of [64, 192]) {
    g.moveTo(x, 0);
    g.lineTo(x, 128);
  }
  g.stroke();
  for (const x of [0, 128]) {
    g.beginPath();
    g.ellipse(x + 64, 64, 38, 64, 0, 0, Math.PI * 2);
    g.stroke();
  }
  return c;
}
