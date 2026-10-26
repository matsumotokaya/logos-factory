"use client";

import { useEffect, useRef, useState } from "react";
import type { BuiltinMockupKind } from "@/lib/presentation-mockups";
import { isDeviceMockupKind } from "@/lib/presentation-mockups";
import { svgToDataUri } from "@/lib/svg";
import type { SceneProps } from "@/components/scenes/shared";
import { cn } from "@/lib/cn";

type DeviceVariant = "laptop" | "mobile" | "duo";
type DeviceRenderer = "parametric" | "3d";

type ModelViewerMaterial = {
  pbrMetallicRoughness: {
    baseColorTexture: { setTexture: (texture: unknown) => void };
    setBaseColorFactor: (factor: [number, number, number, number]) => void;
  };
};

type ModelViewerElement = HTMLElement & {
  model: { getMaterialByName: (name: string) => ModelViewerMaterial | null };
  createCanvasTexture: () => {
    source: { element: HTMLCanvasElement; update: () => void };
  };
};

let modelViewerLoader: Promise<void> | null = null;

function ensureModelViewer(): Promise<void> {
  if (customElements.get("model-viewer")) return Promise.resolve();
  if (modelViewerLoader) return modelViewerLoader;

  modelViewerLoader = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src =
      "https://ajax.googleapis.com/ajax/libs/model-viewer/4.2.0/model-viewer.min.js";
    script.dataset.logosModelViewer = "true";
    script.addEventListener("load", () => {
      void customElements.whenDefined("model-viewer").then(() => resolve());
    });
    script.addEventListener("error", () => {
      modelViewerLoader = null;
      script.remove();
      reject(new Error("3Dビューアーを読み込めませんでした"));
    });
    document.head.appendChild(script);
  });

  return modelViewerLoader;
}

function deviceSpec(kind: BuiltinMockupKind): {
  variant: DeviceVariant;
  renderer: DeviceRenderer;
} {
  if (!isDeviceMockupKind(kind)) {
    throw new Error(`Unsupported device mockup: ${kind}`);
  }
  const variant: DeviceVariant = kind.includes("laptop")
    ? "laptop"
    : kind.includes("mobile")
      ? "mobile"
      : "duo";
  return { variant, renderer: kind.endsWith("-3d") ? "3d" : "parametric" };
}

export default function DeviceMockupBuilder({
  kind,
  scene,
  className,
}: {
  kind: BuiltinMockupKind;
  scene: SceneProps;
  className?: string;
}) {
  const [generation, setGeneration] = useState(0);
  const { variant, renderer } = deviceSpec(kind);
  const created = generation > 0;

  return (
    <div className={cn("overflow-hidden rounded-xl border border-hairline bg-paper", className)}>
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-white p-5 md:p-8">
        {created ? (
          renderer === "3d" ? (
            <DeviceModelViewer
              key={generation}
              variant={variant}
              scene={scene}
            />
          ) : (
            <ParametricDeviceMockup variant={variant} scene={scene} />
          )
        ) : (
          <div className="flex max-w-xs flex-col items-center text-center">
            <div
              className="flex size-14 items-center justify-center rounded-full border border-hairline bg-paper font-mono text-xs text-ink-muted"
              aria-hidden="true"
            >
              {renderer === "3d" ? "3D" : "2D"}
            </div>
            <p className="mt-5 text-sm font-medium text-ink text-balance">
              選択中のロゴから端末モックアップを作成
            </p>
            <p className="mt-2 text-xs leading-relaxed text-pretty text-ink-muted">
              自動では実行されません。作成するとブランドカラーとロゴを画面へ反映します。
            </p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-hairline bg-white px-4 py-3">
        <p className="text-xs text-ink-muted">
          {renderer === "3d" ? "GLB＋画面テクスチャ" : "HTML / CSS / SVG"}
        </p>
        <button
          type="button"
          onClick={() => setGeneration((current) => current + 1)}
          className="shrink-0 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {created ? "再作成" : "作成"}
        </button>
      </div>
    </div>
  );
}

function ParametricDeviceMockup({
  variant,
  scene,
}: {
  variant: DeviceVariant;
  scene: SceneProps;
}) {
  return (
    <div
      className="relative flex size-full items-center justify-center"
      role="img"
      aria-label={`${scene.name}の${deviceLabel(variant)}モックアップ`}
    >
      {variant === "laptop" ? (
        <Laptop scene={scene} />
      ) : variant === "mobile" ? (
        <Phone scene={scene} fit="stage" />
      ) : (
        <div className="relative h-full w-full max-w-xl">
          <div className="absolute inset-x-0 top-[12%]">
            <Laptop scene={scene} />
          </div>
          <div className="absolute bottom-[4%] right-[2%] w-[27%]">
            <Phone scene={scene} fit="container" />
          </div>
        </div>
      )}
    </div>
  );
}

function Laptop({ scene }: { scene: SceneProps }) {
  return (
    <div className="relative mx-auto w-full max-w-lg pb-[5.5%]" aria-hidden="true">
      <div className="relative mx-auto aspect-[16/10] w-[92%] rounded-t-2xl rounded-b-md border border-white/20 bg-[#20242b] p-[2.3%] shadow-inner">
        <span className="absolute left-1/2 top-[1%] size-1 -translate-x-1/2 rounded-full bg-black" />
        <div className="size-full overflow-hidden rounded-lg bg-white">
          <ProductScreen scene={scene} viewport="desktop" />
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[7.5%] rounded-b-2xl border-t border-white bg-[#b5bac0] shadow-md">
        <span className="absolute left-[43%] top-0 h-[36%] w-[14%] rounded-b-lg bg-[#8e949b]" />
      </div>
    </div>
  );
}

function Phone({
  scene,
  fit,
}: {
  scene: SceneProps;
  fit: "stage" | "container";
}) {
  return (
    <div
      className={cn(
        "relative mx-auto aspect-[390/844]",
        fit === "stage" ? "h-full max-h-72 w-auto" : "w-full",
      )}
      aria-hidden="true"
    >
      <div className="relative size-full rounded-[12%/5.8%] border border-white/30 bg-[#171a20] p-[5.6%] shadow-lg">
        <span className="absolute left-1/2 top-[2.2%] h-[0.7%] w-[24%] -translate-x-1/2 rounded-full bg-black" />
        <div className="size-full overflow-hidden rounded-[9%/4.4%] bg-white">
          <ProductScreen scene={scene} viewport="mobile" />
        </div>
      </div>
    </div>
  );
}

function ProductScreen({
  scene,
  viewport,
}: {
  scene: SceneProps;
  viewport: "desktop" | "mobile";
}) {
  const primary = scene.logo.colors[0]?.hex ?? "#3157d5";
  const accent = scene.logo.colors[1]?.hex ?? primary;
  const mobile = viewport === "mobile";
  const logoSrc = scene.logo.svg ? svgToDataUri(scene.logo.svg) : null;

  return (
    <div className="size-full bg-[#f7f7f5] text-[#171719]">
      <div className={cn("flex items-center border-b border-black/10 bg-white", mobile ? "h-[9%] px-[6%]" : "h-[11%] px-[4%]")}> 
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoSrc} alt="" className={cn("max-w-[38%] object-contain", mobile ? "h-[28%]" : "h-[38%]")} />
        ) : (
          <span className="truncate text-[0.55em] font-semibold">{scene.name}</span>
        )}
        <span className="ml-auto h-[22%] w-[18%] rounded-full" style={{ backgroundColor: primary }} />
      </div>
      <div className={cn(mobile ? "px-[7%] pt-[8%]" : "grid grid-cols-[1.2fr_.8fr] gap-[6%] px-[6%] pt-[7%]")}> 
        <div>
          <div className={cn("rounded-full bg-black/85", mobile ? "h-2.5 w-[76%]" : "h-3 w-[80%]")} />
          <div className="mt-[5%] h-1.5 w-[92%] rounded-full bg-black/20" />
          <div className="mt-[3%] h-1.5 w-[72%] rounded-full bg-black/15" />
          <div className="mt-[8%] h-5 w-[34%] rounded-full" style={{ backgroundColor: primary }} />
        </div>
        <div
          className={cn("flex items-center justify-center rounded-xl", mobile ? "mt-[10%] aspect-[1.45]" : "aspect-[1.35]")}
          style={{ backgroundColor: `${primary}20` }}
        >
          <span className="size-[34%] rounded-full" style={{ backgroundColor: accent }} />
        </div>
      </div>
      <div className={cn("grid gap-[4%] px-[6%]", mobile ? "mt-[8%] grid-cols-1" : "mt-[7%] grid-cols-3")}> 
        {[0, 1, 2].map((item) => (
          <div key={item} className={cn("rounded-lg border border-black/10 bg-white", mobile ? "h-12" : "aspect-[1.5]")}> 
            <span className="m-[10%] block size-2 rounded-full" style={{ backgroundColor: item === 1 ? accent : primary }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DeviceModelViewer({
  variant,
  scene,
}: {
  variant: DeviceVariant;
  scene: SceneProps;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let disposed = false;
    let viewer: ModelViewerElement | null = null;

    void ensureModelViewer()
      .then(() => {
        if (disposed) return;
        viewer = document.createElement("model-viewer") as ModelViewerElement;
        viewer.setAttribute("src", `/models/device-${variant}-v1.glb`);
        viewer.setAttribute("alt", `${scene.name}の${deviceLabel(variant)}3Dモックアップ`);
        viewer.setAttribute("camera-controls", "");
        viewer.setAttribute("touch-action", "pan-y");
        viewer.setAttribute("disable-zoom", "");
        viewer.setAttribute("interaction-prompt", "none");
        viewer.setAttribute("camera-orbit", cameraOrbit(variant));
        viewer.setAttribute("field-of-view", "30deg");
        viewer.setAttribute("shadow-intensity", "1.1");
        viewer.setAttribute("shadow-softness", ".85");
        viewer.setAttribute("exposure", "1.05");
        viewer.setAttribute("tone-mapping", "neutral");
        viewer.style.width = "100%";
        viewer.style.height = "100%";
        viewer.style.opacity = "0";
        viewer.style.transition = "opacity 180ms ease-out";

        viewer.addEventListener(
          "load",
          () => {
            if (!viewer || disposed) return;
            void applyModelScreens(viewer, variant, scene)
              .then(() => {
                if (!viewer || disposed) return;
                viewer.style.opacity = "1";
                setReady(true);
              })
              .catch((reason: unknown) => {
                if (!disposed) {
                  setError(reason instanceof Error ? reason.message : "画面を適用できませんでした");
                }
              });
          },
          { once: true },
        );
        viewer.addEventListener(
          "error",
          () => {
            if (!disposed) setError("3Dモデルを読み込めませんでした");
          },
          { once: true },
        );
        stage.appendChild(viewer);
      })
      .catch((reason: unknown) => {
        if (!disposed) {
          setError(reason instanceof Error ? reason.message : "3Dビューアーを読み込めませんでした");
        }
      });

    return () => {
      disposed = true;
      viewer?.remove();
    };
  }, [scene, variant]);

  return (
    <div ref={stageRef} className="relative size-full" aria-busy={!ready && !error}>
      {!ready && !error ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-full max-w-md space-y-3" aria-hidden="true">
            <div className="mx-auto h-44 w-4/5 animate-pulse rounded-xl bg-ink/8" />
            <div className="mx-auto h-4 w-2/5 animate-pulse bg-ink/8" />
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : null}
    </div>
  );
}

async function applyModelScreens(
  viewer: ModelViewerElement,
  variant: DeviceVariant,
  scene: SceneProps,
) {
  const tasks: Promise<void>[] = [];
  if (variant !== "mobile") {
    tasks.push(applyCanvasTexture(viewer, "LaptopScreen", "desktop", scene));
  }
  if (variant !== "laptop") {
    tasks.push(applyCanvasTexture(viewer, "PhoneScreen", "mobile", scene));
  }
  await Promise.all(tasks);
}

async function applyCanvasTexture(
  viewer: ModelViewerElement,
  materialName: string,
  viewport: "desktop" | "mobile",
  scene: SceneProps,
) {
  const material = viewer.model.getMaterialByName(materialName);
  if (!material) return;
  const texture = viewer.createCanvasTexture();
  const canvas = texture.source.element;
  await drawProductScreen(canvas, viewport, scene);
  texture.source.update();
  material.pbrMetallicRoughness.baseColorTexture.setTexture(texture);
  material.pbrMetallicRoughness.setBaseColorFactor([1, 1, 1, 1]);
}

async function drawProductScreen(
  canvas: HTMLCanvasElement,
  viewport: "desktop" | "mobile",
  scene: SceneProps,
) {
  const mobile = viewport === "mobile";
  canvas.width = mobile ? 390 : 1024;
  canvas.height = mobile ? 844 : 640;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画面Canvasを作成できませんでした");
  const primary = scene.logo.colors[0]?.hex ?? "#3157d5";
  const accent = scene.logo.colors[1]?.hex ?? primary;
  const width = canvas.width;

  ctx.fillStyle = "#f7f7f5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, mobile ? 72 : 64);
  ctx.fillStyle = primary;
  ctx.fillRect(width - (mobile ? 90 : 170), mobile ? 24 : 20, mobile ? 66 : 130, mobile ? 24 : 26);

  if (scene.logo.svg) {
    try {
      const image = new Image();
      image.src = svgToDataUri(scene.logo.svg);
      await image.decode();
      const maxWidth = mobile ? 120 : 180;
      const maxHeight = mobile ? 30 : 34;
      const ratio = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
      ctx.drawImage(image, mobile ? 24 : 38, mobile ? 21 : 15, image.naturalWidth * ratio, image.naturalHeight * ratio);
    } catch {
      // The brand name below remains a usable deterministic fallback.
    }
  }

  const pad = mobile ? 26 : 58;
  const heroY = mobile ? 116 : 112;
  ctx.fillStyle = "#171719";
  ctx.fillRect(pad, heroY, mobile ? 260 : 430, mobile ? 30 : 38);
  ctx.globalAlpha = 0.2;
  ctx.fillRect(pad, heroY + (mobile ? 48 : 58), mobile ? 320 : 360, 14);
  ctx.fillRect(pad, heroY + (mobile ? 76 : 84), mobile ? 270 : 300, 14);
  ctx.globalAlpha = 1;
  ctx.fillStyle = primary;
  ctx.fillRect(pad, heroY + (mobile ? 124 : 132), mobile ? 150 : 154, mobile ? 44 : 40);
  ctx.globalAlpha = 0.14;
  ctx.fillRect(mobile ? 24 : 620, mobile ? 320 : 100, mobile ? 342 : 340, mobile ? 220 : 246);
  ctx.globalAlpha = 0.84;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(mobile ? 195 : 790, mobile ? 430 : 220, mobile ? 60 : 80, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// Percentages of model-viewer's auto-framing distance. The lab keeps free
// rotation (it is an inspection surface), so the head-room has to hold at every
// angle — fixed metre radii cropped the corners as soon as the model turned.
function cameraOrbit(variant: DeviceVariant): string {
  if (variant === "mobile") return "-10deg 70deg 120%";
  if (variant === "laptop") return "-8deg 67deg 125%";
  return "-8deg 68deg 128%";
}

function deviceLabel(variant: DeviceVariant): string {
  if (variant === "mobile") return "モバイル";
  if (variant === "laptop") return "PC";
  return "PC＋モバイル";
}
