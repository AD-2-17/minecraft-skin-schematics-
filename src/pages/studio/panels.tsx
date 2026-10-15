import { useMemo, useRef, useState } from "react";
import { BLOCK_BY_ID, getBlock, PEDESTAL_BLOCKS, STYLES, VERSIONS, availableIn, getVersion } from "../../lib/blocks/blocks";
import { hexString } from "../../lib/blocks/color";
import { JOINT_LABELS, POSE_PRESETS, mirrorPose, restPose, type JointId, type LimbJoint, type Pose } from "../../lib/rig/pose";
import { isValidUsername } from "../../lib/skin/skin";
import { ITEM_KINDS, ITEM_LABELS, MATERIALS, MATERIAL_LABELS, itemHasMaterial, spritePixels, type ItemKind, type Material } from "../../lib/voxel/items";
import { Icon, Section, Segmented, SelectField, Slider } from "../../components/controls";
import type { Settings } from "../../state/settings";

export type Update = (patch: Partial<Settings>, opts?: { commit?: boolean; live?: boolean }) => void;

// ---------------------------------------------------------------------------
// Skin

export function SkinPanel({
  settings,
  update,
  skinUrl,
  skinName,
  onFile,
  onUsername,
  onDefault,
  loading,
  error,
}: {
  settings: Settings;
  update: Update;
  skinUrl: string;
  skinName: string;
  onFile: (f: File) => void;
  onUsername: (name: string) => void;
  onDefault: () => void;
  loading: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Section title="Skin">
        <button
          type="button"
          className={`dropzone${over ? " is-over" : ""}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
        >
          <img className="pixel dropzone-skin" src={skinUrl} alt="" width={128} height={128} />
          <span className="dropzone-text">
            <strong>{skinName}</strong>
            <span>Drop a skin PNG here, or click to choose a file.</span>
          </span>
        </button>
        <input
          ref={input}
          type="file"
          accept="image/png,image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (isValidUsername(name)) onUsername(name);
          }}
        >
          <label className="visually-hidden" htmlFor="username">
            Java username
          </label>
          <input
            id="username"
            className="text-input"
            placeholder="Java username"
            value={name}
            maxLength={16}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
          />
          <button className="btn btn-secondary" type="submit" disabled={!isValidUsername(name) || loading}>
            {loading ? "Loading" : "Fetch"}
          </button>
        </form>
        {error && (
          <p className="note note-error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="link-button" onClick={onDefault}>
          Use the default skin
        </button>
      </Section>
      <Section title="Arm width">
        <Segmented
          label="Arm width"
          value={settings.model}
          onChange={(model) => update({ model }, { commit: true })}
          options={[
            { value: "classic", label: "Classic · 4 px" },
            { value: "slim", label: "Slim · 3 px" },
          ]}
        />
        <p className="note">Detected from the file. Change it if the arms look clipped.</p>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pose

type JointKey = "pitch" | "yaw" | "roll" | "bend";
interface Control {
  key: JointKey;
  label: string;
  min: number;
  max: number;
}

const ARM: Control[] = [
  { key: "pitch", label: "Swing forward", min: -180, max: 180 },
  { key: "roll", label: "Raise sideways", min: -45, max: 180 },
  { key: "yaw", label: "Twist", min: -180, max: 180 },
  { key: "bend", label: "Bend elbow", min: 0, max: 160 },
];
const LEG: Control[] = [
  { key: "pitch", label: "Swing forward", min: -120, max: 120 },
  { key: "roll", label: "Spread", min: -30, max: 90 },
  { key: "yaw", label: "Twist", min: -90, max: 90 },
  { key: "bend", label: "Bend knee", min: 0, max: 160 },
];
const CONTROLS: Record<JointId, Control[]> = {
  head: [
    { key: "pitch", label: "Look up", min: -90, max: 90 },
    { key: "yaw", label: "Turn", min: -90, max: 90 },
    { key: "roll", label: "Tilt", min: -45, max: 45 },
  ],
  body: [
    { key: "pitch", label: "Lean forward", min: -30, max: 90 },
    { key: "yaw", label: "Twist", min: -90, max: 90 },
    { key: "roll", label: "Lean sideways", min: -45, max: 45 },
  ],
  rightArm: ARM,
  leftArm: ARM,
  rightLeg: LEG,
  leftLeg: LEG,
};

/** Front-facing mannequin: the player's right side is on the viewer's left. */
function Mannequin({ value, onChange }: { value: JointId; onChange: (j: JointId) => void }) {
  const parts: { id: JointId; x: number; y: number; w: number; h: number }[] = [
    { id: "head", x: 24, y: 2, w: 32, h: 32 },
    { id: "body", x: 24, y: 36, w: 32, h: 46 },
    { id: "rightArm", x: 8, y: 36, w: 14, h: 46 },
    { id: "leftArm", x: 58, y: 36, w: 14, h: 46 },
    { id: "rightLeg", x: 24, y: 84, w: 15, h: 46 },
    { id: "leftLeg", x: 41, y: 84, w: 15, h: 46 },
  ];
  return (
    <svg className="mannequin" viewBox="0 0 80 132" role="radiogroup" aria-label="Joint">
      {parts.map((p) => (
        <rect
          key={p.id}
          role="radio"
          aria-checked={value === p.id}
          aria-label={JOINT_LABELS[p.id]}
          tabIndex={0}
          x={p.x}
          y={p.y}
          width={p.w}
          height={p.h}
          rx={2}
          className={value === p.id ? "is-on" : undefined}
          onClick={() => onChange(p.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onChange(p.id);
            }
          }}
        />
      ))}
    </svg>
  );
}

export function PosePanel({
  settings,
  update,
  joint,
  setJoint,
  thumbs,
  onPreset,
}: {
  settings: Settings;
  update: Update;
  joint: JointId;
  setJoint: (j: JointId) => void;
  thumbs: Record<string, string>;
  onPreset: (id: string) => void;
}) {
  const pose = settings.pose;
  const setValue = (key: JointKey, v: number, commit: boolean) => {
    setJoint(joint);
    const next: Pose = { ...pose, [joint]: { ...pose[joint], [key]: v } };
    update({ pose: next, poseId: null }, { commit, live: !commit });
  };
  const isLimb = joint !== "head" && joint !== "body";
  const side = joint.startsWith("right") ? "right" : "left";
  return (
    <>
      <Section title="Presets">
        <div className="pose-grid">
          {POSE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`pose-card${settings.poseId === p.id ? " is-on" : ""}`}
              onClick={() => onPreset(p.id)}
              aria-pressed={settings.poseId === p.id}
            >
              <span className="pose-thumb">{thumbs[p.id] ? <img src={thumbs[p.id]} alt="" /> : <span className="pose-thumb-empty" />}</span>
              <span className="pose-name">{p.name}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section
        title="Rig"
        aside={
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => update({ pose: restPose(), poseId: "stand" }, { commit: true })}>
            {Icon.reset}
            Reset pose
          </button>
        }
      >
        <div className="rig">
          <Mannequin value={joint} onChange={setJoint} />
          <div className="rig-controls">
            <div className="rig-title">
              <strong>{JOINT_LABELS[joint]}</strong>
              <span>Tip: click the statue to pick a part.</span>
            </div>
            {CONTROLS[joint].map((c) => (
              <Slider
                key={joint + c.key}
                label={c.label}
                min={c.min}
                max={c.max}
                value={Math.round((pose[joint] as LimbJoint)[c.key] ?? 0)}
                defaultValue={0}
                format={(v) => `${v}°`}
                onChange={(v) => setValue(c.key, v, false)}
                onCommit={(v) => setValue(c.key, v, true)}
              />
            ))}
            <div className="rig-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => update({ pose: { ...pose, [joint]: { ...restPose()[joint] } }, poseId: null }, { commit: true })}
              >
                Reset {isLimb ? "limb" : JOINT_LABELS[joint].toLowerCase()}
              </button>
              {isLimb && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => update({ pose: mirrorPose(pose, side), poseId: null }, { commit: true })}>
                  {Icon.mirror}
                  Copy to {side === "right" ? "left" : "right"} side
                </button>
              )}
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Item

const spriteCache = new Map<string, string>();
export function spriteUrl(kind: ItemKind, material: Material): string {
  const key = kind + material;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const { w, h, px } = spritePixels(kind, material);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  for (let i = 0; i < px.length; i++) {
    if (px[i] < 0) continue;
    img.data[i * 4] = (px[i] >> 16) & 255;
    img.data[i * 4 + 1] = (px[i] >> 8) & 255;
    img.data[i * 4 + 2] = px[i] & 255;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const url = c.toDataURL();
  spriteCache.set(key, url);
  return url;
}

const MATERIAL_SWATCH: Record<Material, string> = {
  wood: "#9f7a45",
  stone: "#8f8f8f",
  iron: "#d8d8d8",
  gold: "#fcdc4a",
  diamond: "#5ef0dc",
  netherite: "#5c535a",
};

export function ItemPanel({ settings, update }: { settings: Settings; update: Update }) {
  const kind = settings.itemKind;
  return (
    <>
      <Section title="Held item">
        <div className="item-grid">
          <button type="button" className={`item-card${kind === "none" ? " is-on" : ""}`} onClick={() => update({ itemKind: "none" }, { commit: true })} aria-pressed={kind === "none"}>
            <span className="item-icon item-none" aria-hidden="true" />
            <span>None</span>
          </button>
          {ITEM_KINDS.map((k) => (
            <button key={k} type="button" className={`item-card${kind === k ? " is-on" : ""}`} onClick={() => update({ itemKind: k }, { commit: true })} aria-pressed={kind === k}>
              <img className="pixel item-icon" src={spriteUrl(k, settings.material)} alt="" />
              <span>{ITEM_LABELS[k]}</span>
            </button>
          ))}
        </div>
      </Section>
      {kind !== "none" && (
        <>
          {itemHasMaterial(kind) && (
            <Section title="Material">
              <div className="swatch-row" role="radiogroup" aria-label="Material">
                {MATERIALS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={settings.material === m}
                    className={`swatch-button${settings.material === m ? " is-on" : ""}`}
                    onClick={() => update({ material: m }, { commit: true })}
                  >
                    <span className="swatch" style={{ background: MATERIAL_SWATCH[m] }} />
                    {MATERIAL_LABELS[m]}
                  </button>
                ))}
              </div>
            </Section>
          )}
          <Section title="Grip">
            <Segmented
              label="Hand"
              value={settings.hand}
              onChange={(hand) => update({ hand }, { commit: true })}
              options={[
                { value: "right", label: "Right hand" },
                { value: "left", label: "Left hand" },
              ]}
            />
            <Slider
              label="Angle"
              min={-180}
              max={180}
              value={settings.itemAngle}
              defaultValue={0}
              format={(v) => `${v}°`}
              onChange={(itemAngle) => update({ itemAngle }, { live: true })}
              onCommit={(itemAngle) => update({ itemAngle }, { commit: true })}
            />
            <p className="note">0° holds it like the game does. Multiples of 45° keep the pixels crisp.</p>
          </Section>
        </>
      )}
      <Section title="Battle poses">
        <p className="note">Strike, Throw, Guard and At rest are tuned for weapons and set the grip angle for you.</p>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Blocks

function StyleSwatches({ ids, versionId }: { ids: string[]; versionId: string }) {
  const v = getVersion(versionId);
  const blocks = ids
    .map((id) => BLOCK_BY_ID[id])
    .filter((b) => b && availableIn(b, v))
    .sort((a, b) => b.lab[0] - a.lab[0]);
  const step = Math.max(1, Math.floor(blocks.length / 14));
  const shown = blocks.filter((_, i) => i % step === 0).slice(0, 14);
  return (
    <span className="style-swatches" aria-hidden="true">
      {shown.map((b) => (
        <span key={b.id} style={{ background: hexString(b.hex) }} />
      ))}
    </span>
  );
}

const PALETTE_LIMITS = [0, 48, 32, 24, 16, 12, 8, 6, 4];

export function BlocksPanel({ settings, update, height }: { settings: Settings; update: Update; height: number | null }) {
  const limitIndex = Math.max(0, PALETTE_LIMITS.indexOf(settings.maxBlocks));
  return (
    <>
      <Section title="Style">
        <div className="style-list" role="radiogroup" aria-label="Style">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={settings.style === s.id}
              className={`style-row${settings.style === s.id ? " is-on" : ""}`}
              onClick={() => update({ style: s.id }, { commit: true })}
            >
              <span className="style-text">
                <strong>{s.name}</strong>
                <span>{s.blurb}</span>
              </span>
              <StyleSwatches ids={s.blocks} versionId={settings.version} />
            </button>
          ))}
        </div>
      </Section>
      <Section title="Size">
        <Slider
          label="Scale"
          min={1}
          max={8}
          value={settings.scale}
          format={(v) => `${v}× · ${v === settings.scale && height ? height : v * 32} blocks tall`}
          onChange={(scale) => update({ scale }, { live: true })}
          onCommit={(scale) => update({ scale }, { commit: true })}
        />
        <p className="note">One skin pixel becomes {settings.scale === 1 ? "one block" : `a ${settings.scale}×${settings.scale}×${settings.scale} cube`}.</p>
      </Section>
      <Section title="Detail">
        <div className="field-stack">
          <div className="field">
            <span className="field-label">Outer layer</span>
            <Segmented
              label="Outer layer"
              value={settings.outer}
              onChange={(outer) => update({ outer }, { commit: true })}
              options={[
                { value: "shell", label: "3D", title: "Hat, jacket and sleeves stand out one block" },
                { value: "flat", label: "Flat", title: "Painted onto the base layer" },
                { value: "off", label: "Off" },
              ]}
            />
          </div>
          <div className="field">
            <span className="field-label">Interior</span>
            <Segmented
              label="Interior"
              value={settings.hollow ? "hollow" : "solid"}
              onChange={(v) => update({ hollow: v === "hollow" }, { commit: true })}
              options={[
                { value: "hollow", label: "Hollow" },
                { value: "solid", label: "Solid" },
              ]}
            />
          </div>
          <Slider
            label="Block types"
            min={0}
            max={PALETTE_LIMITS.length - 1}
            value={limitIndex}
            format={(i) => (PALETTE_LIMITS[i] ? `At most ${PALETTE_LIMITS[i]}` : "Unlimited")}
            onChange={(i) => update({ maxBlocks: PALETTE_LIMITS[i] }, { live: true })}
            onCommit={(i) => update({ maxBlocks: PALETTE_LIMITS[i] }, { commit: true })}
          />
          <SelectField
            label="Pedestal"
            value={settings.pedestal ?? ""}
            onChange={(v) => update({ pedestal: v || null }, { commit: true })}
            options={[
              { value: "", label: "None" },
              ...PEDESTAL_BLOCKS.filter((id) => availableIn(getBlock(id), getVersion(settings.version))).map((id) => ({ value: id, label: getBlock(id).name })),
            ]}
          />
          <SelectField
            label="Minecraft version"
            value={settings.version}
            onChange={(version) => update({ version }, { commit: true })}
            options={VERSIONS.map((v) => ({ value: v.id, label: `Java ${v.label}` }))}
          />
        </div>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Export

export interface MaterialRow {
  id: string;
  name: string;
  hex: number;
  count: number;
}

export function stacks(n: number) {
  const s = Math.floor(n / 64);
  const r = n % 64;
  if (!s) return `${r}`;
  return r ? `${s} × 64 + ${r}` : `${s} × 64`;
}

export function ExportPanel({
  fileName,
  setFileName,
  onDownload,
  exporting,
  rows,
  total,
  dims,
  onCopy,
  onCsv,
}: {
  fileName: string;
  setFileName: (s: string) => void;
  onDownload: (format: "litematic" | "schem") => void;
  exporting: boolean;
  rows: MaterialRow[];
  total: number;
  dims: [number, number, number] | null;
  onCopy: () => void;
  onCsv: () => void;
}) {
  const shulkers = useMemo(() => Math.ceil(total / (27 * 64)), [total]);
  return (
    <>
      <Section title="Download">
        <div className="field">
          <label className="field-label" htmlFor="file-name">
            File name
          </label>
          <input id="file-name" className="text-input" value={fileName} onChange={(e) => setFileName(e.target.value)} spellCheck={false} />
        </div>
        <div className="export-buttons">
          <button type="button" className="btn btn-primary" disabled={exporting} onClick={() => onDownload("litematic")}>
            {Icon.download}
            Litematica (.litematic)
          </button>
          <button type="button" className="btn btn-secondary" disabled={exporting} onClick={() => onDownload("schem")}>
            WorldEdit (.schem)
          </button>
        </div>
        {dims && (
          <dl className="facts">
            <div>
              <dt>Size</dt>
              <dd>
                {dims[0]} × {dims[1]} × {dims[2]}
              </dd>
            </div>
            <div>
              <dt>Blocks</dt>
              <dd>{total.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Shulker boxes</dt>
              <dd>{shulkers}</dd>
            </div>
          </dl>
        )}
      </Section>
      <Section title="Placing it">
        <ol className="steps">
          <li>
            Move the file into <code>.minecraft/schematics</code>.
          </li>
          <li>
            In game, press <kbd>M</kbd>, open <em>Load Schematics</em>, pick it and choose <em>Load</em>.
          </li>
          <li>The statue faces south. Rotate it from the placement settings if you need to.</li>
        </ol>
      </Section>
      <Section
        title="Materials"
        aside={
          <span className="section-actions">
            <button type="button" className="btn btn-quiet btn-sm" onClick={onCopy}>
              {Icon.copy}
              Copy
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={onCsv}>
              CSV
            </button>
          </span>
        }
      >
        <ul className="materials">
          {rows.map((r) => (
            <li key={r.id}>
              <span className="swatch" style={{ background: hexString(r.hex) }} />
              <span className="materials-name">{r.name}</span>
              <span className="materials-count">{r.count.toLocaleString()}</span>
              <span className="materials-stacks">{stacks(r.count)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
