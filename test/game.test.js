import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { circleHit, circleRectHit, rectsOverlap, makeLevel, updateWalls, GAME } from "../src/main.js";

describe("neon relay logic", () => {
  it("circleHit detects pickup radius", () => {
    assert.equal(circleHit(0, 0, 12, 10, 0, 12), true);
    assert.equal(circleHit(0, 0, 12, 100, 100, 12), false);
  });
  it("circleRectHit detects firewall collision", () => {
    const r = { x: 100, y: 100, w: 20, h: 100 };
    assert.equal(circleRectHit(110, 150, 12, r), true);
    assert.equal(circleRectHit(10, 10, 12, r), false);
  });
  it("rectsOverlap works", () => {
    assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), true);
    assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 50, y: 50, w: 10, h: 10 }), false);
  });
  it("level has 3 shards, 5 walls and a gate", () => {
    const lvl = makeLevel();
    assert.equal(lvl.shards.length, GAME.NEED_SHARDS);
    assert.equal(lvl.walls.length, 5);
    assert.ok(lvl.gate.w > 0 && lvl.gate.h > 0);
  });
  it("walls oscillate with updateWalls", () => {
    const lvl = makeLevel();
    const y0 = lvl.walls[0].y;
    updateWalls(lvl.walls, 0.5, 0);
    assert.notEqual(lvl.walls[0].y, y0);
  });
});
