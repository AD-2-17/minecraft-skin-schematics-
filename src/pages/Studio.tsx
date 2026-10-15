import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BLOCK_BY_ID, blockStateString, getBlock, getVersion } from "../lib/blocks/blocks";
import { StatueEngine, type BuildPayload } from "../lib/engine";
import { writeLitematic, writeSpongeSchem, type Structure } from "../lib/export/schematic";
import { getPreset, POSE_PRESETS, SEGMENT_ORDER, SEGMENT_PART, type JointId } from "../lib/rig/pose";
import { loadSkinFromBlob, loadSkinFromDataUrl, loadSkinFromUsername, normalizeSkin, skinToDataUrl, type SkinPixels } from "../lib/skin/skin";
import { paintSteve } from "../lib/skin/steve";
import { renderPreviewArgb, renderThumbnail } from "../lib/three/geometry";
import { StatueView, type ViewPreset } from "../lib/three/statueView";
import { ITEM_LABELS } from "../lib/voxel/items";
import { DEFAULT_SETTINGS, loadSaved, save, toStatueSettings, type Settings } from "../state/settings";
import { Icon, Logo } from "../components/controls";
import { BlocksPanel, ExportPanel, ItemPanel, PosePanel, SkinPanel, type MaterialRow, type Update } from "./studio/panels";
import "./studio.css";

type Tab = "skin" | "pose" | "item" | "blocks" | "export";
const TABS: { id: Tab; label: string }[] = [
  { id: "skin", label: "Skin" },
  { id: "pose", label: "Pose" },
  { id: "item", label: "Item" },
  { id: "blocks", label: "Blocks" },
  { id: "export", label: "Export" },
];

const DEFAULT_NAME = "Steve";

function defaultSkin() {
  const pixels = normalizeSkin(paintSteve(), 64, 64);
  return { pixels, dataUrl: skinToDataUrl(pixels), name: DEFAULT_NAME };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "statue";

function download(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes.slice().buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function Studio() {
  const saved = useMemo(() => loadSaved(), []);
  const [settings, setSettings] = useState<Settings>(saved?.settings ?? DEFAULT_SETTINGS);
  const [skin, setSkin] = useState<{ pixels: SkinPixels | null; dataUrl: string; name: string }>(() =>
    saved?.skin ? { pixels: null, dataUrl: saved.skin.dataUrl, name: saved.skin.name } : defaultSkin(),
  );
  const [tab, setTab] = useState<Tab>("skin");
  const [joint, setJointState] = useState<JointId>("rightArm");
  // Only fade the rest of the statue once someone is actually working on a part.
  const [focus, setFocus] = useState(false);
  const setJoint = useCallback((j: JointId) => {
    setJointState(j);
    setFocus(true);
  }, []);
  const [build, setBuild] = useState<BuildPayload | null>(null);
  const [building, setBuilding] = useState(false);
  const [live, setLive] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [skinBusy, setSkinBusy] = useState(false);
  const [skinError, setSkinError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileNameTouched, setFileNameTouched] = useState(false);

  const engine = useRef<StatueEngine | null>(null);
  const view = useRef<StatueView | null>(null);
  const viewportEl = useRef<HTMLDivElement>(null);
  const framed = useRef<number[] | null>(null);
  /** settings the current full-resolution build was made from */
  const builtFor = useRef<Settings | null>(null);
  const history = useRef<{ past: Settings[]; future: Settings[]; committed: Settings }>({ past: [], future: [], committed: settings });
  const [, forceHistory] = useState(0);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout((flash as any).t);
    (flash as any).t = window.setTimeout(() => setToast(null), 2600);
  }, []);

  // Engine and viewport lifetimes
  useEffect(() => {
    engine.current = new StatueEngine();
    const v = new StatueView(viewportEl.current!);
    view.current = v;
    return () => {
      engine.current?.dispose();
      v.dispose();
      engine.current = null;
      view.current = null;
    };
  }, []);

  // Decode a persisted skin on first load.
  useEffect(() => {
    if (skin.pixels) return;
    loadSkinFromDataUrl(skin.dataUrl)
      .then((s) => setSkin({ pixels: s.pixels, dataUrl: s.dataUrl, name: skin.name }))
      .catch(() => setSkin(defaultSkin()));
  }, [skin]);

  // Push the skin to the worker.
  useEffect(() => {
    if (skin.pixels) engine.current?.setSkin(skin.pixels.data);
  }, [skin.pixels]);

  // Build whenever settings or skin change. While dragging, preview at low scale.
  useEffect(() => {
    if (!skin.pixels || !engine.current) return;
    const scale = live ? Math.min(settings.scale, 2) : settings.scale;
    setBuilding(true);
    let cancelled = false;
    engine.current.build(toStatueSettings(settings, scale)).then((b) => {
      if (cancelled || !b) return;
      builtFor.current = live ? null : settings;
      setBuild(b);
      setBuilding(false);
      // Re-frame on first build, or when a committed change makes the statue much bigger or smaller.
      const size = [b.sx / scale, b.sy / scale, b.sz / scale];
      const prev = framed.current;
      const changed = !prev || size.some((v, i) => Math.abs(v - prev[i]) / Math.max(prev[i], 8) > 0.2);
      const refit = !prev || (!live && changed);
      view.current?.setBuild(b, refit, scale);
      if (refit) framed.current = size;
    });
    return () => {
      cancelled = true;
    };
  }, [settings, skin.pixels, live]);

  // Pose thumbnails with the current skin.
  useEffect(() => {
    if (!skin.pixels || !engine.current) return;
    const kind = settings.itemKind === "none" ? "sword" : settings.itemKind;
    const poses = POSE_PRESETS.map((p) => ({
      key: p.id,
      pose: p.pose,
      item: p.itemAngle !== undefined ? { kind, material: settings.material, hand: "right" as const, angle: p.itemAngle } : null,
    }));
    let cancelled = false;
    engine.current.thumbs(settings.model, poses).then((meshes) => {
      if (cancelled) return;
      const out: Record<string, string> = {};
      for (const m of meshes) out[m.key] = renderThumbnail(m.mesh, m.size, 132, 168);
      setThumbs(out);
    });
    return () => {
      cancelled = true;
    };
  }, [skin.pixels, settings.model, settings.itemKind, settings.material]);

  // Persist.
  useEffect(() => {
    const t = window.setTimeout(() => save({ settings, skin: { dataUrl: skin.dataUrl, name: skin.name } }), 400);
    return () => window.clearTimeout(t);
  }, [settings, skin.dataUrl, skin.name]);

  // Default file name follows the skin and pose until the user edits it.
  useEffect(() => {
    if (fileNameTouched) return;
    const pose = settings.poseId ? getPreset(settings.poseId)?.name : "custom";
    const item = settings.itemKind !== "none" ? ITEM_LABELS[settings.itemKind] : "";
    setFileName(slug([skin.name, pose, item].filter(Boolean).join(" ")));
  }, [skin.name, settings.poseId, settings.itemKind, fileNameTouched]);

  // Highlight the selected part while posing; click the model to pick one.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.onPick = (seg) => {
      if (!seg || seg > SEGMENT_ORDER.length) return;
      setJoint(SEGMENT_PART[SEGMENT_ORDER[seg - 1]]);
      setTab("pose");
    };
    if (tab !== "pose" || !build || !focus) return v.setHighlight(null);
    const segs = new Set<number>();
    SEGMENT_ORDER.forEach((id, i) => SEGMENT_PART[id] === joint && segs.add(i + 1));
    v.setHighlight(segs);
  }, [tab, joint, build, focus, setJoint]);

  useEffect(() => {
    if (tab !== "pose") setFocus(false);
  }, [tab]);

  const update: Update = useCallback((patch, opts = {}) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (opts.commit) {
        const h = history.current;
        h.past.push(h.committed);
        if (h.past.length > 100) h.past.shift();
        h.future = [];
        h.committed = next;
        forceHistory((n) => n + 1);
      }
      return next;
    });
    setLive(!!opts.live);
  }, []);

  const undo = useCallback(() => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(h.committed);
    h.committed = prev;
    setSettings(prev);
    setLive(false);
    forceHistory((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(h.committed);
    h.committed = next;
    setSettings(next);
    setLive(false);
    forceHistory((n) => n + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" && (target as HTMLInputElement).type === "text") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const applySkin = useCallback(
    (s: { pixels: SkinPixels; dataUrl: string; model: Settings["model"] }, name: string) => {
      setSkin({ pixels: s.pixels, dataUrl: s.dataUrl, name });
      update({ model: s.model }, { commit: true });
      setSkinError(null);
      flash(`Loaded ${name}`);
    },
    [update, flash],
  );

  const onFile = useCallback(
    async (f: File) => {
      try {
        const s = await loadSkinFromBlob(f);
        applySkin(s, f.name.replace(/\.[a-z]+$/i, "") || "Skin");
      } catch (e) {
        setSkinError(e instanceof Error ? e.message : "That file couldn't be used.");
      }
    },
    [applySkin],
  );

  const onUsername = useCallback(
    async (name: string) => {
      setSkinBusy(true);
      setSkinError(null);
      try {
        const s = await loadSkinFromUsername(name);
        applySkin(s, s.name);
      } catch (e) {
        setSkinError(e instanceof Error ? e.message : "Couldn't load that player.");
      } finally {
        setSkinBusy(false);
      }
    },
    [applySkin],
  );

  // Paste a skin image from the clipboard anywhere in the studio.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) onFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFile]);

  const onPreset = (id: string) => {
    const p = getPreset(id)!;
    update({ pose: JSON.parse(JSON.stringify(p.pose)), poseId: id, ...(p.itemAngle !== undefined ? { itemAngle: p.itemAngle } : { itemAngle: 0 }) }, { commit: true });
  };

  const rows: MaterialRow[] = useMemo(() => {
    if (!build) return [];
    return build.palette
      .map((id, i) => ({ id, name: BLOCK_BY_ID[id]?.name ?? id, hex: BLOCK_BY_ID[id]?.hex ?? 0, count: build.counts[i] ?? 0 }))
      .sort((a, b) => b.count - a.count);
  }, [build]);

  const exportFile = async (format: "litematic" | "schem") => {
    if (!engine.current) return;
    setExporting(true);
    try {
      // Always export a fresh full-resolution build of the current settings.
      const b = builtFor.current === settings && build ? build : await engine.current.build(toStatueSettings(settings));
      if (!b) throw new Error("Nothing to export yet.");
      const structure: Structure = {
        sx: b.sx,
        sy: b.sy,
        sz: b.sz,
        blocks: b.cells,
        palette: ["minecraft:air", ...b.palette.map((id) => blockStateString(getBlock(id)))],
      };
      const v = getVersion(settings.version);
      const poseName = settings.poseId ? getPreset(settings.poseId)?.name : "Custom pose";
      const meta = {
        name: `${skin.name} · ${poseName}`,
        author: skin.name,
        description: `Made with Skin Schematic. ${b.total.toLocaleString()} blocks, ${b.sx}×${b.sy}×${b.sz}.`,
        dataVersion: v.dataVersion,
        litematicVersion: v.litematicVersion,
      };
      const name = slug(fileName || "statue");
      if (format === "litematic") {
        const preview = renderPreviewArgb(b.mesh, [b.sx, b.sy, b.sz], 140);
        download(writeLitematic(structure, { ...meta, preview }), `${name}.litematic`);
      } else {
        download(writeSpongeSchem(structure, meta), `${name}.schem`);
      }
      flash(`Saved ${name}.${format}`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const materialText = () => rows.map((r) => `${r.count}\t${r.name}`).join("\n");
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(materialText());
      flash("Material list copied");
    } catch {
      flash("Couldn't access the clipboard");
    }
  };
  const onCsv = () => {
    const csv = "Block,ID,Count,Stacks\n" + rows.map((r) => `"${r.name}",minecraft:${r.id},${r.count},${(r.count / 64).toFixed(2)}`).join("\n");
    download(new TextEncoder().encode(csv), `${slug(fileName || "statue")}-materials.csv`);
  };

  const fitView = (p: ViewPreset) => view.current?.fit(p);
  const dims: [number, number, number] | null = build ? [build.sx, build.sy, build.sz] : null;

  return (
    <div className="studio">
      <header className="studio-bar">
        <Link to="/" className="wordmark" aria-label="Skin Schematic home">
          <Logo />
          <span>Skin Schematic</span>
        </Link>
        <div className="studio-bar-center" aria-live="polite">
          {dims && (
            <span className="bar-dims">
              <span>{dims[0]}</span>×<span>{dims[1]}</span>×<span>{dims[2]}</span>
              <span className="bar-sep" />
              {build!.total.toLocaleString()} blocks
            </span>
          )}
        </div>
        <div className="studio-bar-actions">
          <button type="button" className="btn btn-quiet btn-sm icon-only" onClick={undo} disabled={!history.current.past.length} aria-label="Undo" title="Undo (⌘Z)">
            {Icon.undo}
          </button>
          <button type="button" className="btn btn-quiet btn-sm icon-only" onClick={redo} disabled={!history.current.future.length} aria-label="Redo" title="Redo (⇧⌘Z)">
            {Icon.redo}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => exportFile("litematic")} disabled={!build || exporting}>
            {Icon.download}
            <span className="hide-sm">Download</span> .litematic
          </button>
        </div>
      </header>

      <main className="studio-main">
        <div className="viewport">
          <div className="viewport-canvas" ref={viewportEl} />
          <div className={`viewport-status${building ? " is-on" : ""}`} aria-hidden={!building}>
            <span className="spinner" />
            {live ? "Preview" : "Building"}
          </div>
          <div className="viewport-views" role="group" aria-label="Camera">
            {(["front", "side", "back", "angle"] as ViewPreset[]).map((p) => (
              <button key={p} type="button" onClick={() => fitView(p)}>
                {p === "angle" ? "3/4" : p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          {build && build.ms > 0 && <div className="viewport-meta">{build.palette.length} block types</div>}
        </div>

        <aside className="inspector" aria-label="Settings">
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "is-on" : undefined} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="ins-body" role="tabpanel">
            {tab === "skin" && (
              <SkinPanel
                settings={settings}
                update={update}
                skinUrl={skin.dataUrl}
                skinName={skin.name}
                onFile={onFile}
                onUsername={onUsername}
                onDefault={() => {
                  const d = defaultSkin();
                  setSkin(d);
                  update({ model: "classic" }, { commit: true });
                  setSkinError(null);
                }}
                loading={skinBusy}
                error={skinError}
              />
            )}
            {tab === "pose" && <PosePanel settings={settings} update={update} joint={joint} setJoint={setJoint} thumbs={thumbs} onPreset={onPreset} />}
            {tab === "item" && <ItemPanel settings={settings} update={update} />}
            {tab === "blocks" && <BlocksPanel settings={settings} update={update} height={build && !live ? build.sy : null} />}
            {tab === "export" && (
              <ExportPanel
                fileName={fileName}
                setFileName={(s) => {
                  setFileName(s);
                  setFileNameTouched(true);
                }}
                onDownload={exportFile}
                exporting={exporting}
                rows={rows}
                total={build?.total ?? 0}
                dims={dims}
                onCopy={onCopy}
                onCsv={onCsv}
              />
            )}
          </div>
        </aside>
      </main>
      <div className={`toast${toast ? " is-on" : ""}`} role="status">
        {toast}
      </div>
    </div>
  );
}
