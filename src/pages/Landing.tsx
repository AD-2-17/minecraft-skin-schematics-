import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, Logo } from "../components/controls";
import { BLOCK_BY_ID, STYLES } from "../lib/blocks/blocks";
import { hexString } from "../lib/blocks/color";
import { getPreset, lerpPose, makePose, restPose, type Pose } from "../lib/rig/pose";
import { normalizeSkin } from "../lib/skin/skin";
import { paintSteve } from "../lib/skin/steve";
import type { Stage } from "../lib/three/stage";
import { buildMesh } from "../lib/voxel/mesh";
import { voxelize } from "../lib/voxel/voxelize";
import { ITEM_KINDS, ITEM_LABELS } from "../lib/voxel/items";

// Three.js loads after first paint; the page reads fine without it.
const loadStage = () => import("../lib/three/stage").then((m) => m.Stage);
const loadThumbs = () => import("../lib/three/geometry").then((m) => m.renderThumbnail);
import { spriteUrl } from "./studio/panels";
import "./landing.css";

const STEVE = normalizeSkin(paintSteve(), 64, 64).data;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function useInView<T extends Element>(onChange: (visible: boolean) => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([e]) => onChange(e.isIntersecting), { rootMargin: "100px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Reveal({ children, className = "", as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "li" }) {
  const [on, setOn] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref as never} className={`reveal${on ? " is-in" : ""} ${className}`}>
      {children}
    </Tag>
  );
}

// ---------------------------------------------------------------------------

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`nav${scrolled ? " is-scrolled" : ""}`}>
      <div className="nav-inner">
        <Link to="/" className="nav-brand" aria-label="Skin Schematic">
          <Logo />
          <span>Skin Schematic</span>
        </Link>
        <nav className="nav-links" aria-label="Sections">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#faq">FAQ</a>
        </nav>
        <Link to="/app" className="btn btn-primary btn-sm">
          Launch app
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const pointer = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const [ready, setReady] = useState(false);
  const section = useInView<HTMLElement>((v) => (v ? stage.current?.play() : stage.current?.pause()));

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    loadStage().then((StageClass) => {
      if (disposed || !host.current) return;
      cleanup = startHero(new StageClass(host.current, STEVE, "classic", null, { height: 0.78, centerY: 0.51 }));
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  function startHero(s: Stage) {
    stage.current = s;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    s.onFrame = (t) => {
      const p = pointer.current;
      p.x += (p.tx - p.x) * 0.06;
      p.y += (p.ty - p.y) * 0.06;
      const breathe = reduce ? 0 : Math.sin(t * 1.6);
      const pose = makePose({
        head: { yaw: p.x * 38, pitch: -p.y * 22 + breathe * 0.6 },
        body: { yaw: p.x * 4 },
        rightArm: { roll: 3 + breathe * 1.4, pitch: -2 },
        leftArm: { roll: 3 + breathe * 1.4, pitch: 2 },
      });
      const narrow = window.innerWidth < 900;
      const framing = narrow ? { height: 0.6, centerY: 0.52 } : { height: 0.78, centerY: 0.51 };
      return { pose, explode: 0, item: 0, itemAngle: 0, yaw: -14 + p.x * 6, framing };
    };
    s.play();
    requestAnimationFrame(() => setReady(true));
    const onMove = (e: PointerEvent) => {
      pointer.current.tx = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      s.dispose();
      stage.current = null;
    };
  }

  return (
    <section className="hero" ref={section}>
      <h1 className={`hero-title${ready ? " is-in" : ""}`} aria-label="Skin Schematic">
        <span aria-hidden="true">Skin</span>
        <span aria-hidden="true">Schematic</span>
      </h1>
      <div className={`hero-stage${ready ? " is-in" : ""}`} ref={host} aria-hidden="true" />
      <div className="hero-foot">
        <p>Turn any Minecraft skin into a posed statue you can actually build.</p>
        <p className="hero-meta">Litematica · WorldEdit · Java 1.16 to 26.3</p>
      </div>
    </section>
  );
}

function Launch() {
  return (
    <section className="launch">
      <Reveal className="launch-inner">
        <h2>
          Your skin.
          <br />
          As a statue.
        </h2>
        <p className="lede">
          Drop in a skin or type a username. Pick a pose, put a sword in its hand, choose your blocks, and download a schematic that pastes straight into your world.
        </p>
        <div className="cta-row">
          <Link to="/app" className="btn btn-primary btn-lg">
            Launch app
            {Icon.arrow}
          </Link>
          <a href="#how" className="btn btn-secondary btn-lg">
            How it works
          </a>
        </div>
        <p className="fine">Free. Runs entirely in your browser. No account.</p>
      </Reveal>
    </section>
  );
}

function Sequence() {
  const track = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const progress = useRef(0);
  const [phase, setPhase] = useState(0);
  const visible = useRef(false);
  const sticky = useInView<HTMLDivElement>((v) => {
    visible.current = v;
    if (v) stage.current?.play();
    else stage.current?.pause();
  });

  useEffect(() => {
    const onScroll = () => {
      const el = track.current!;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const p = clamp01(-r.top / Math.max(1, total));
      progress.current = p;
      setPhase(p < 0.12 ? 0 : p < 0.58 ? 1 : 2);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    let disposed = false;
    loadStage().then((StageClass) => {
      if (disposed || !host.current) return;
      startSequence(new StageClass(host.current, STEVE, "classic", { kind: "sword", material: "diamond", hand: "right", angle: getPreset("strike")!.itemAngle ?? 0 }, { height: 0.56, centerY: 0.6 }));
    });
    return () => {
      disposed = true;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      stage.current?.dispose();
      stage.current = null;
    };
  }, []);

  function startSequence(s: Stage) {
    const strike = getPreset("strike")!;
    const target: Pose = strike.pose;
    stage.current = s;
    let shown = 0;
    s.onFrame = (t) => {
      const p = progress.current;
      shown += (p - shown) * 0.12;
      const x = shown;
      const explode = smooth(0.06, 0.32, x) * (1 - smooth(0.46, 0.7, x));
      const assemble = smooth(0.5, 0.78, x);
      const pose = lerpPose(restPose(), target, assemble);
      pose.head.pitch += Math.sin(t * 1.3) * 0.8;
      const framing = { height: 0.62 - 0.12 * explode - 0.14 * assemble, centerY: 0.56 + 0.1 * assemble };
      return { pose, explode, item: smooth(0.6, 0.9, x), itemAngle: strike.itemAngle ?? 0, yaw: -28 + x * 52, framing };
    };
    s.render();
    if (visible.current) s.play();
  }

  return (
    <section className="sequence" ref={track} aria-label="From skin to blocks">
      <div className="sequence-sticky" ref={sticky}>
        <div className="sequence-copy">
          <div className={`sequence-line${phase === 0 ? " is-on" : ""}`}>
            <p className="eyebrow">How it’s made</p>
            <h2>Start with a skin.</h2>
            <p>Every skin is a 64 × 64 image wrapped around six boxes. We read it the way the game does, outer layer included.</p>
          </div>
          <div className={`sequence-line${phase === 1 ? " is-on" : ""}`}>
            <p className="eyebrow">Voxelize</p>
            <h2>Every pixel becomes a block.</h2>
            <p>Each texel is matched to the closest real block by perceived color, from 172 solid, buildable blocks.</p>
          </div>
          <div className={`sequence-line${phase === 2 ? " is-on" : ""}`}>
            <p className="eyebrow">Pose</p>
            <h2>Pose it. Arm it. Build it.</h2>
            <p>Rotate the head, shoulders and hips, bend elbows and knees, and put a sword, axe, mace or trident in either hand.</p>
          </div>
        </div>
        <div className="sequence-stage" ref={host} aria-hidden="true" />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

const FEATURE_POSES = ["wave", "victory", "run", "strike", "sit", "dab"];

function PoseStrip() {
  const [urls, setUrls] = useState<string[]>([]);
  const started = useRef(false);
  const ref = useInView<HTMLDivElement>(async (v) => {
    if (!v || started.current) return;
    started.current = true;
    const renderThumbnail = await loadThumbs();
    // small enough to do on the main thread
    const out: string[] = [];
    for (const id of FEATURE_POSES) {
      const p = getPreset(id)!;
      const g = voxelize(STEVE, {
        model: "classic",
        pose: p.pose,
        scale: 1,
        outer: "shell",
        item: p.itemAngle !== undefined ? { kind: "sword", material: "diamond", hand: "right", angle: p.itemAngle } : null,
      });
      const colors: number[] = [];
      const map = new Map<number, number>();
      const cells = new Uint16Array(g.color.length);
      g.color.forEach((c, i) => {
        if (!c) return;
        let k = map.get(c);
        if (k === undefined) {
          k = colors.length;
          colors.push(c - 1);
          map.set(c, k);
        }
        cells[i] = k + 1;
      });
      out.push(renderThumbnail(buildMesh(g.sx, g.sy, g.sz, cells, (i) => colors[i]), [g.sx, g.sy, g.sz], 176, 224));
    }
    setUrls(out);
  });
  return (
    <div className="pose-strip" ref={ref}>
      {FEATURE_POSES.map((id, i) => (
        <figure key={id}>
          {urls[i] ? <img src={urls[i]} alt="" width={88} height={112} /> : <span className="pose-strip-empty" />}
          <figcaption>{getPreset(id)!.name}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function RigVisual() {
  const rows = [
    { label: "Shoulder", value: 128 },
    { label: "Elbow", value: 92 },
    { label: "Hip", value: 26 },
    { label: "Knee", value: 55 },
  ];
  return (
    <div className="rig-visual" aria-hidden="true">
      {rows.map((r) => (
        <div key={r.label} className="rig-visual-row">
          <span>{r.label}</span>
          <span className="rig-visual-track">
            <span style={{ width: `${(r.value / 180) * 100}%` }} />
          </span>
          <span className="rig-visual-value">{r.value}°</span>
        </div>
      ))}
    </div>
  );
}

function ItemsVisual() {
  return (
    <div className="items-visual" aria-hidden="true">
      {ITEM_KINDS.map((k) => (
        <figure key={k}>
          <img className="pixel" src={spriteUrl(k, k === "axe" ? "netherite" : k === "pickaxe" ? "gold" : "diamond")} alt="" />
          <figcaption>{ITEM_LABELS[k]}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function StylesVisual() {
  return (
    <div className="styles-visual" aria-hidden="true">
      {STYLES.slice(0, 7).map((s) => {
        const blocks = s.blocks.map((id) => BLOCK_BY_ID[id]).filter(Boolean).sort((a, b) => b.lab[0] - a.lab[0]);
        const step = Math.max(1, Math.floor(blocks.length / 12));
        return (
          <div key={s.id} className="styles-visual-row">
            <span>{s.name}</span>
            <span className="styles-visual-swatches">
              {blocks
                .filter((_, i) => i % step === 0)
                .slice(0, 12)
                .map((b) => (
                  <i key={b.id} style={{ background: hexString(b.hex) }} />
                ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ScaleVisual() {
  return (
    <div className="scale-visual" aria-hidden="true">
      {[1, 2, 4, 8].map((s) => (
        <div key={s} className="scale-visual-col">
          <span className="scale-visual-bar" style={{ height: `${(s / 8) * 100}%` }} />
          <strong>{s}×</strong>
          <span>{s * 32} tall</span>
        </div>
      ))}
    </div>
  );
}

function FilesVisual() {
  return (
    <div className="files-visual" aria-hidden="true">
      <div className="file-chip">
        <span className="file-ext">.litematic</span>
        <span>Litematica, with preview image</span>
      </div>
      <div className="file-chip">
        <span className="file-ext">.schem</span>
        <span>WorldEdit · FAWE · Amulet</span>
      </div>
      <div className="file-chip">
        <span className="file-ext">.csv</span>
        <span>Material list, in stacks</span>
      </div>
    </div>
  );
}

function Features() {
  return (
    <section className="features" id="features">
      <Reveal className="section-head">
        <p className="eyebrow">Features</p>
        <h2>Everything a statue needs. Nothing it doesn’t.</h2>
      </Reveal>
      <div className="bento">
        <Reveal className="tile tile-wide">
          <div className="tile-copy">
            <h3>Twenty poses, ready to go.</h3>
            <p>Wave, salute, dab, sit, kneel, strike. Each one previews with your own skin.</p>
          </div>
          <PoseStrip />
        </Reveal>
        <Reveal className="tile">
          <div className="tile-copy">
            <h3>Rig it yourself.</h3>
            <p>Rotate the head, shoulders and hips on every axis. Bend elbows and knees. Click any part of the statue to pick it.</p>
          </div>
          <RigVisual />
        </Reveal>
        <Reveal className="tile">
          <div className="tile-copy">
            <h3>Armed and ready.</h3>
            <p>Sword, axe, pickaxe, mace or trident, in either hand, in six materials, at any angle.</p>
          </div>
          <ItemsVisual />
        </Reveal>
        <Reveal className="tile">
          <div className="tile-copy">
            <h3>Pick a style.</h3>
            <p>Full color, concrete, wool, terracotta, survival-friendly, or a monochrome stone, gold or onyx monument.</p>
          </div>
          <StylesVisual />
        </Reveal>
        <Reveal className="tile">
          <div className="tile-copy">
            <h3>Any size.</h3>
            <p>From one block per pixel up to 8×. Hollow inside so it costs a fraction of the blocks.</p>
          </div>
          <ScaleVisual />
        </Reveal>
        <Reveal className="tile tile-wide tile-dark">
          <div className="tile-copy">
            <h3>Real schematic files.</h3>
            <p>Written to the same spec the mods read, for every Java version from 1.16 to 26.3. Litematica files include a preview image for the in-game browser.</p>
          </div>
          <FilesVisual />
        </Reveal>
      </div>
    </section>
  );
}

function How() {
  const steps = [
    { n: "01", title: "Bring your skin", body: "Drop a PNG, paste it, or type a Java username. Classic and slim arms are detected automatically." },
    { n: "02", title: "Pose and style it", body: "Choose a preset or rig every joint. Add a weapon, pick a block style and a size." },
    { n: "03", title: "Build it in game", body: "Download the .litematic, drop it in .minecraft/schematics, press M and place it." },
  ];
  return (
    <section className="how" id="how">
      <Reveal className="section-head">
        <p className="eyebrow">How it works</p>
        <h2>Three steps. About a minute.</h2>
      </Reveal>
      <ol className="how-steps">
        {steps.map((s) => (
          <Reveal key={s.n} as="li" className="how-step">
            <span className="how-n">{s.n}</span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Which mods can open the files?",
    a: (
      <>
        <strong>.litematic</strong> opens in Litematica (Fabric, NeoForge and Forge ports). <strong>.schem</strong> is the Sponge v2 format used by WorldEdit, FastAsyncWorldEdit, Amulet and
        Litematica itself.
      </>
    ),
  },
  {
    q: "Which Minecraft versions are supported?",
    a: "Every Java release from 1.16 to 26.3. Choose your version in the Blocks tab and only blocks that exist in it are used.",
  },
  {
    q: "Is my skin uploaded anywhere?",
    a: "No. Skins are read and converted in your browser. Looking up a username asks Mojang for that player's public skin, and nothing else is stored.",
  },
  {
    q: "Why does my statue use so many kinds of blocks?",
    a: "Skins have a lot of subtle shading. Use the Block types slider to cap the palette, or switch to Concrete, Wool or a monochrome style for a cleaner look.",
  },
  {
    q: "Which way does the statue face?",
    a: "South (+Z). Litematica's placement settings can rotate and mirror it before you paste.",
  },
  {
    q: "Does the outer skin layer work?",
    a: "Yes. 3D mode builds hats, jackets and sleeves one block out, like the 3D Skin Layers mod. Flat mode paints them onto the base layer instead.",
  },
];

function Faq() {
  return (
    <section className="faq" id="faq">
      <Reveal className="section-head">
        <p className="eyebrow">FAQ</p>
        <h2>Questions, answered.</h2>
      </Reveal>
      <div className="faq-list">
        {FAQ.map((f) => (
          <details key={f.q}>
            <summary>
              {f.q}
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="closing">
      <Reveal className="closing-inner">
        <h2>Build yourself.</h2>
        <Link to="/app" className="btn btn-primary btn-lg">
          Launch app
          {Icon.arrow}
        </Link>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Logo size={16} />
          <span>Skin Schematic</span>
        </div>
        <p>Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.</p>
        <a href="https://github.com/AD-2-17/minecraft-skin-schematics-" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <div className="landing">
      <Nav />
      <main>
        <Hero />
        <Launch />
        <Sequence />
        <Features />
        <How />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}
