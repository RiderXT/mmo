/**
 * One-off data-fix after replacing computeLevel()'s exp curve (flat "exp/100+1" -> cubic, see
 * packages/shared/src/lib/leveling.ts). Character.level is a STORED field, not derived live, so
 * every existing character is still carrying a level computed under the old flat curve — this
 * recomputes it from the character's own (untouched) exp total under the new curve.
 *
 * Deliberately does NOT touch exp, gold, unspentStatPoints/unspentSkillPoints, or any stat the
 * player already allocated — only the level number itself. Levels will generally drop a lot
 * (e.g. 3957 exp was level 40 under the old curve, is level 4 under the new one); already-spent
 * stat points are left alone rather than guessed-back, since there's no clean way to "unspend"
 * strength/vitality/etc. a player already chose.
 *
 * Run once, from apps/api: `npx tsx prisma/scripts/recompute-character-levels.ts`
 */
import { PrismaClient } from "@prisma/client";
import { computeLevel } from "@mmo/shared";

const prisma = new PrismaClient();

async function main() {
  const characters = await prisma.character.findMany({ select: { id: true, name: true, exp: true, level: true } });
  let changed = 0;
  for (const character of characters) {
    const newLevel = computeLevel(character.exp);
    if (newLevel === character.level) continue;
    await prisma.character.update({ where: { id: character.id }, data: { level: newLevel } });
    console.log(`${character.name}: poziom ${character.level} -> ${newLevel} (exp ${character.exp})`);
    changed++;
  }
  console.log(`Przeliczono poziom dla ${changed}/${characters.length} postaci.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
