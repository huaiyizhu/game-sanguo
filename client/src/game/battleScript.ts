/**
 * 战场剧情对白：开场与关键阵亡。由 `BattleState.battleScript` 驱动，UI 在地图上层逐条展示。
 */
import type {
  BattleScriptLineDef,
  BattleScriptLineResolved,
  BattleScriptQueue,
  BattleState,
  Unit,
} from "./types";

function findSpeaker(units: readonly Unit[], def: BattleScriptLineDef): Unit | undefined {
  if (def.speakerCatalogId) {
    const id = def.speakerCatalogId;
    const byCat = units.find((u) => u.portraitCatalogId === id || u.id === id);
    if (byCat) return byCat;
  }
  if (def.speakerNameIncludes) {
    return units.find((u) => u.name.includes(def.speakerNameIncludes!));
  }
  return undefined;
}

export function resolveScriptLines(units: readonly Unit[], defs: readonly BattleScriptLineDef[]): BattleScriptLineResolved[] {
  const out: BattleScriptLineResolved[] = [];
  for (const def of defs) {
    const u = findSpeaker(units, def);
    if (u) {
      out.push({
        name: u.name,
        level: u.level,
        side: u.side,
        portraitCatalogId: u.portraitCatalogId,
        text: def.text,
      });
    } else if (def.displayName) {
      out.push({
        name: def.displayName,
        level: def.displayLevel ?? 1,
        side: def.displaySide ?? "player",
        portraitCatalogId: undefined,
        text: def.text,
      });
    }
  }
  return out;
}

/** 每关开场：未配置时用通用对白 */
const OPENING_SCRIPTS: Partial<Record<string, readonly BattleScriptLineDef[]>> = {
  prologue_zhangjiao: [
    {
      speakerCatalogId: "liu_bei",
      text: "黄巾势大，然暴虐害民。今日我等替天行道，务必击破张角！",
    },
    {
      speakerCatalogId: "guan_yu",
      text: "大哥放心，关某刀锋所向，必叫渠魁授首。",
    },
    {
      speakerCatalogId: "zhang_fei",
      text: "燕人张翼德在此！哪个是张角？出来会俺三百回合！",
    },
    {
      speakerCatalogId: "zhang_jiao",
      text: "苍天已死，黄天当立！尔等螳臂当车，自取灭亡！",
    },
    { displayName: "演义旁白", displaySide: "player", text: "本关须歼灭黄巾主力；张角若败，余众自溃。" },
  ],
  ch1_pursuit: [
    {
      speakerCatalogId: "liu_bei",
      text: "董卓祸国，天下切齿。今虽势单力薄，亦不可纵虎归山。",
    },
    {
      speakerCatalogId: "guan_yu",
      text: "追兵环伺，仍当以稳为主，切莫孤军深入。",
    },
    {
      speakerCatalogId: "dong_zhuo",
      text: "哼，一群乌合之众，也敢追袭老夫？",
    },
    { displayName: "演义旁白", displaySide: "player", text: "击退董卓亲军，莫使我军主将陷入重围。" },
  ],
  ch3_xiaopei: [
    { speakerCatalogId: "liu_bei", text: "小沛乃暂栖之地，吕布骄横，须慎战固守。" },
    { speakerCatalogId: "zhang_fei", text: "三姓家奴！俺老张最看不惯这等反复小人！" },
    { speakerCatalogId: "lu_bu", text: "刘备，借我城池不还，今日便叫你无处容身！" },
    { displayName: "演义旁白", displaySide: "player", text: "击败吕布方可解围；城下巷战，切忌恋战。" },
  ],
  ch6_chibi: [
    { speakerCatalogId: "liu_bei", text: "东南风起，正是火攻之时，诸君齐心，共破曹军！" },
    { speakerCatalogId: "zhou_yu", text: "曹贼水军虽众，连环既成，一火可焚千里。" },
    { speakerCatalogId: "cao_cao", text: "孤纵横半生，岂会败于东南一隅？传令，谨慎防火！" },
    { displayName: "演义旁白", displaySide: "player", text: "水陆并进，以少胜多；先破曹军水师，再图后计。" },
  ],
};

function defaultOpeningDefs(scenarioTitle: string, victoryBrief: string): BattleScriptLineDef[] {
  const brief = victoryBrief.trim() || "歼灭敌军。";
  return [
    {
      speakerCatalogId: "liu_bei",
      text: `诸位，此即「${scenarioTitle}」。胜败在此一举，望同心戮力。`,
    },
    {
      speakerCatalogId: "guan_yu",
      text: "大哥所言极是。敌军虽众，我军亦当以义胜之。",
    },
    {
      displayName: "演义旁白",
      displaySide: "player",
      text: `本关胜利条件：${brief}`,
    },
  ];
}

export function buildOpeningBattleScript(
  scenarioId: string,
  scenarioTitle: string,
  victoryBrief: string,
  units: readonly Unit[]
): BattleScriptQueue | null {
  const defs = OPENING_SCRIPTS[scenarioId] ?? defaultOpeningDefs(scenarioTitle, victoryBrief);
  const lines = resolveScriptLines(units, defs);
  if (lines.length === 0) return null;
  return { kind: "opening", lines, cursor: 0 };
}

/** 关键将领阵亡：scenarioId → 受害者 catalogId（或 unit id）→ 剧本 */
const DEATH_SCRIPTS: Partial<Record<string, Partial<Record<string, readonly BattleScriptLineDef[]>>>> = {
  prologue_zhangjiao: {
    zhang_jiao: [
      {
        speakerCatalogId: "zhang_jiao",
        text: "黄天……竟不佑我……弟兄们……各自逃生……",
      },
      {
        speakerCatalogId: "liu_bei",
        text: "张角已平，黄巾气数尽矣！众军乘势，勿使余党再聚！",
      },
    ],
  },
  ch3_xiaopei: {
    lu_bu: [
      { speakerCatalogId: "lu_bu", text: "大耳贼……今日……竟败于你手……" },
      { speakerCatalogId: "liu_bei", text: "吕布已去，小沛可保。诸将收拾人马，安抚百姓。" },
    ],
  },
};

/** 我军要员阵亡时的敌方/旁白反应（可选） */
const PLAYER_DEATH_SCRIPTS: Partial<Record<string, Partial<Record<string, readonly BattleScriptLineDef[]>>>> = {
  prologue_zhangjiao: {
    liu_bei: [
      { speakerCatalogId: "liu_bei", text: "恨……天不佑汉室……众将……各自突围……" },
      { speakerCatalogId: "zhang_jiao", text: "哈哈哈哈！刘备授首，还有谁敢挡我黄天大业！" },
    ],
  },
};

function markedBossDeathDefs(victim: Unit): BattleScriptLineDef[] {
  return [
    {
      displayName: victim.name,
      displayLevel: victim.level,
      displaySide: victim.side,
      text: `${victim.name}阵亡，三军震动！`,
    },
    {
      speakerCatalogId: "liu_bei",
      text: "主将已折，余众不足为惧。传令各军，乘胜追击！",
    },
  ];
}

export function tryQueueDeathReactionScript(state: BattleState, victim: Unit): BattleState {
  if (state.battleScript) return state;
  const wc = state.winCondition;
  const marked =
    wc?.type === "eliminate_marked_enemies" ? new Set(wc.unitIds) : null;
  const isMarkedBoss = victim.side === "enemy" && (marked?.has(victim.id) ?? false);

  const key = victim.portraitCatalogId ?? victim.id;
  const enemyTable = DEATH_SCRIPTS[state.scenarioId];
  const playerTable = PLAYER_DEATH_SCRIPTS[state.scenarioId];

  let defs: readonly BattleScriptLineDef[] | null = null;
  if (victim.side === "enemy") {
    defs =
      (enemyTable && (enemyTable[key] ?? enemyTable[victim.id])) ??
      (isMarkedBoss ? markedBossDeathDefs(victim) : null);
  } else {
    defs = (playerTable && (playerTable[key] ?? playerTable[victim.id])) ?? null;
  }
  if (!defs) return state;
  const lines = resolveScriptLines(state.units, defs);
  if (lines.length === 0) return state;
  return { ...state, battleScript: { kind: "reaction", lines, cursor: 0 } };
}

export function advanceBattleScript(state: BattleState): BattleState {
  const q = state.battleScript;
  if (!q) return state;
  const next = q.cursor + 1;
  if (next >= q.lines.length) {
    return { ...state, battleScript: null };
  }
  return { ...state, battleScript: { ...q, cursor: next } };
}
