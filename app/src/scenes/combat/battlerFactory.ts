import type Phaser from "phaser";
import type { UnitAssets } from "../../combat/types";
import type { Battler, Side } from "./state";

type CreateBattlerOptions = {
  scene: Phaser.Scene;
  anims: Phaser.Animations.AnimationManager;
  textures: Phaser.Textures.TextureManager;
  asset: UnitAssets;
  side: Side;
  index: number;
  slot: Phaser.Math.Vector2;
  countFrames: (key: string) => number;
};

export function createBattler({
  scene,
  anims,
  textures,
  asset,
  side,
  index,
  slot,
  countFrames,
}: CreateBattlerOptions): Battler {
  const keyPrefix = `${side === "heroes" ? "H" : "E"}${index}`;
  const idleKey = `${keyPrefix}:idle`;
  const hurtKey = `${keyPrefix}:hurt`;
  const deathKey = `${keyPrefix}:death`;

  const ensureAnimation = (key: string, fps: number, repeat: number) => {
    if (!textures.exists(key)) return false;
    const frames = countFrames(key);
    if (frames <= 0) return false;
    if (!anims.exists(key)) {
      anims.create({
        key,
        frames: anims.generateFrameNumbers(key, {
          start: 0,
          end: frames - 1,
        }),
        frameRate: fps,
        repeat,
      });
    }
    return true;
  };

  const makeLoop = (key: string, fps = 10) => ensureAnimation(key, fps, -1);
  const makeOnce = (key: string, fps = 12) => ensureAnimation(key, fps, 0);

  makeLoop(idleKey, 8);
  makeOnce(hurtKey, 14);
  makeOnce(deathKey, 10);

  const atkKeys: string[] = [];
  (["atk1", "atk2", "atk3"] as const).forEach((suffix) => {
    const full = `${keyPrefix}:${suffix}`;
    if (makeOnce(full, 12)) atkKeys.push(full);
  });

  const sprite = scene.add.sprite(slot.x, slot.y, idleKey, 0).setOrigin(0.5);
  const frontRow = index < 2;
  const baseScale = (asset.scale ?? 1) * (frontRow ? 2.5 : 2.35);
  sprite.setScale(baseScale);
  const faceRight = asset.faceRight ?? side === "heroes";
  sprite.setFlipX(!faceRight);

  if (anims.exists(idleKey)) sprite.play(idleKey, true);

  const isHero = side === "heroes";
  const maxHp = 100;
  const maxAp = isHero ? 3 : 0;

  return {
    side,
    ix: index,
    assets: asset,
    sprite,
    idleKey,
    hurtKey,
    deathKey,
    atkKeys,
    basePos: slot.clone(),
    baseScale,
    alive: true,
    hp: maxHp,
    maxHp,
    ap: maxAp,
    maxAp,
  };
}
