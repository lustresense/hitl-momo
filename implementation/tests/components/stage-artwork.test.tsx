import { describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { StageArtwork } from "../../src/components/stage-preview/StageArtwork";
import { STAGE_SCENES } from "../../src/components/stage-preview/scene-metadata";

describe("visual-only stage artwork contract", () => {
 it("provides exactly four original scene metadata entries", () => {
  expect(STAGE_SCENES).toHaveLength(4);
  expect(STAGE_SCENES.map(s=>s.title)).toEqual(["Gameplay Screen","Halaman yang Sobek","Menara Lipatan","Lorong Kabut Penghapus"]);
 });
 it("preserves viewBoxes and static illustrations without raster or canvas", () => {
  for (const scene of [0,1,2,3] as const) {
   const {container}=render(<StageArtwork scene={scene}/>);
   const svg=container.querySelector("svg")!;
   expect(svg.getAttribute("viewBox")).toBe(scene===0 ? "0 0 752 536" : "0 0 490 325");
   expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid slice");
   expect(container.querySelectorAll('[data-asset-role="character-preview"]')).toHaveLength(1);
   expect(container.querySelectorAll('[data-asset-role="goal-preview"]')).toHaveLength(1);
   expect(container.querySelector("img, image, canvas, iframe, script, video")).toBeNull();
   cleanup();
  }
 });
 it("scopes all defs for duplicate mounts and resolves every SVG reference", () => {
  const {container}=render(<><StageArtwork scene={0}/><StageArtwork scene={0}/><StageArtwork scene={1}/><StageArtwork scene={2}/><StageArtwork scene={3}/></>);
  const ids=Array.from(container.querySelectorAll('[id]')).map(e=>e.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const el of container.querySelectorAll('*')) {
   for (const attr of Array.from(el.attributes)) {
    if (attr.name==='href' && attr.value.startsWith('#')) expect(ids).toContain(attr.value.slice(1));
    for(const m of attr.value.matchAll(/url\(#([^)]*)\)/g)) expect(ids).toContain(m[1]);
   }
  }
  cleanup();
 });
 it("server renders without browser-only globals", () => {
  expect(renderToString(<StageArtwork scene={3}/>)).toContain('viewBox="0 0 490 325"');
 });
});
