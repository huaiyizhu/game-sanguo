/**
 * 三国演义向将领图鉴（≥100）。用于战场生成与秘籍「将领列表」展示。
 */
import type { ArmyType, Side, TroopKind, Unit } from "./types";
import {
  clampMight,
  clampUnitLevel,
  defensePowerForUnit,
  maxHpForLevel,
  MAX_UNIT_LEVEL,
  movePointsForTroop,
  tacticMaxForUnit,
} from "./types";

export type GeneralCatalogEntry = {
  id: string;
  name: string;
  faction: string;
  troopKind: TroopKind;
  armyType: ArmyType;
  /** 图鉴与数值基准等级 */
  refLevel: number;
  might: number;
  intel: number;
  defense: number;
  maxHp: number;
  bio: string;
};

function G(
  id: string,
  name: string,
  faction: string,
  armyType: ArmyType,
  troopKind: TroopKind,
  refLevel: number,
  might: number,
  intel: number,
  maxHp: number,
  bio: string
): GeneralCatalogEntry {
  const m = clampMight(might);
  return {
    id,
    name,
    faction,
    armyType,
    troopKind,
    refLevel,
    might: m,
    intel,
    defense: defensePowerForUnit(m, refLevel, troopKind),
    maxHp,
    bio,
  };
}

/** 演义核心人物（武力 10–100：吕布 100、刘禅 10 为锚；防御由武力·等级·兵种推算） */
const FAMOUS: GeneralCatalogEntry[] = [
  G("liu_bei", "刘备", "蜀", "ping", "infantry", 8, 72, 78, 125, "汉室宗亲，桃园结义之主，以仁德聚人心。"),
  G("guan_yu", "关羽", "蜀", "ping", "cavalry", 10, 98, 72, 118, "美髯公，千里走单骑，威震华夏。"),
  G("zhang_fei", "张飞", "蜀", "shan", "archer", 9, 99, 42, 132, "万人敌，长坂喝退曹军，性烈如火。"),
  G("zhao_yun", "赵云", "蜀", "ping", "cavalry", 9, 94, 76, 120, "常山赵子龙，长坂救主，一身是胆。"),
  G("zhuge_liang", "诸葛亮", "蜀", "ping", "archer", 10, 24, 100, 108, "卧龙，隆中对三分天下，赤壁借东风。"),
  G("huang_zhong", "黄忠", "蜀", "shan", "archer", 8, 88, 58, 112, "老将，定军山斩夏侯，箭法如神。"),
  G("ma_chao", "马超", "蜀", "ping", "cavalry", 9, 93, 48, 122, "锦马超，西凉骁骑，与许褚恶战。"),
  G("wei_yan", "魏延", "蜀", "shan", "infantry", 8, 84, 62, 118, "汉中镇守，子午谷之议见胆略。"),
  G("pang_tong", "庞统", "蜀", "ping", "infantry", 7, 22, 94, 95, "凤雏，与孔明齐名，殒于落凤坡。"),
  G("fa_zheng", "法正", "蜀", "ping", "infantry", 7, 26, 88, 98, "取蜀定计，汉中策动黄忠斩将。"),
  G("jiang_wei", "姜维", "蜀", "ping", "infantry", 9, 82, 90, 115, "孔明传人，九伐中原。"),
  G("guan_ping", "关平", "蜀", "ping", "infantry", 6, 62, 58, 105, "关羽义子，随父征战。"),
  G("zhou_cang", "周仓", "蜀", "shan", "infantry", 5, 68, 38, 108, "关公部将，扛刀有力。"),
  G("wang_ping", "王平", "蜀", "shan", "infantry", 6, 66, 64, 102, "街亭后屡立战功，汉中善守。"),
  G("ma_dai", "马岱", "蜀", "ping", "cavalry", 6, 70, 52, 108, "马超从弟，随诸葛南征。"),
  G("cao_cao", "曹操", "魏", "ping", "cavalry", 10, 88, 92, 128, "乱世奸雄，挟天子以令诸侯，诗文冠世。"),
  G("si_ma_yi", "司马懿", "魏", "ping", "infantry", 10, 32, 98, 118, "隐忍老谋，高平陵后掌魏权柄。"),
  G("xiahou_dun", "夏侯惇", "魏", "ping", "cavalry", 9, 78, 58, 120, "拔矢啖睛，曹氏宗将砥柱。"),
  G("xiahou_yuan", "夏侯渊", "魏", "ping", "cavalry", 9, 76, 54, 115, "妙才，用兵神速，定军山殒命。"),
  G("zhang_liao", "张辽", "魏", "ping", "cavalry", 9, 92, 68, 118, "威震逍遥津，江东小儿止啼。"),
  G("xu_chu", "许褚", "魏", "ping", "infantry", 8, 90, 36, 125, "虎痴，裸衣斗马超。"),
  G("dian_wei", "典韦", "魏", "ping", "infantry", 8, 94, 34, 122, "古之恶来，宛城死战护主。"),
  G("xu_huang", "徐晃", "魏", "ping", "infantry", 8, 80, 62, 112, "周亚夫风，解樊城之围。"),
  G("zhang_he", "张郃", "魏", "ping", "cavalry", 8, 82, 70, 110, "巧变，蜀军后期劲敌。"),
  G("yu_jin", "于禁", "魏", "ping", "infantry", 7, 62, 60, 105, "五子良将，水淹七军后晚节受议。"),
  G("le_jin", "乐进", "魏", "ping", "cavalry", 7, 72, 52, 102, "每战先登，短小精悍。"),
  G("li_dian", "李典", "魏", "ping", "infantry", 7, 66, 74, 100, "儒将风范，合肥协张辽破敌。"),
  G("cao_ren", "曹仁", "魏", "ping", "cavalry", 8, 74, 72, 115, "樊城死守，魏之樊篱。"),
  G("cao_hong", "曹洪", "魏", "ping", "cavalry", 7, 65, 48, 108, "舍命献马，救曹操于危。"),
  G("guo_jia", "郭嘉", "魏", "ping", "archer", 7, 18, 96, 88, "鬼才，遗计定辽东。"),
  G("xun_yu", "荀彧", "魏", "ping", "infantry", 7, 22, 94, 92, "王佐，曹魏后方栋梁。"),
  G("jia_xu", "贾诩", "魏", "ping", "archer", 8, 20, 96, 95, "毒士，算无遗策全身而退。"),
  G("simazhao", "司马昭", "魏", "ping", "infantry", 8, 28, 88, 105, "司马氏代魏之渐。"),
  G("sun_quan", "孙权", "吴", "shui", "archer", 8, 55, 82, 110, "紫髯碧眼，据江东三世。"),
  G("zhou_yu", "周瑜", "吴", "shui", "infantry", 9, 72, 94, 105, "美周郎，赤壁火攻破曹。"),
  G("lu_su", "鲁肃", "吴", "shui", "infantry", 7, 24, 90, 98, "榻上策，联刘抗曹。"),
  G("lu_meng", "吕蒙", "吴", "shui", "infantry", 8, 76, 80, 108, "白衣渡江，擒关羽。"),
  G("lu_xun", "陆逊", "吴", "shui", "archer", 8, 30, 96, 102, "夷陵火攻，书生拜将。"),
  G("gan_ning", "甘宁", "吴", "shui", "cavalry", 8, 86, 62, 112, "锦帆贼，百骑劫魏营。"),
  G("taishi_ci", "太史慈", "吴", "ping", "archer", 8, 88, 64, 108, "神射，与小霸王酣战。"),
  G("huang_gai", "黄盖", "吴", "shui", "infantry", 7, 70, 70, 105, "苦肉计，赤壁献火。"),
  G("ling_tong", "凌统", "吴", "shui", "infantry", 7, 72, 58, 102, "父仇与甘宁释怨。"),
  G("dong_zhuo", "董卓", "董", "ping", "cavalry", 8, 82, 48, 130, "西凉军阀，长安暴虐。"),
  G("lu_bu", "吕布", "吕", "ping", "cavalry", 10, 100, 38, 128, "人中吕布，反复难制。"),
  G("diao_chan", "貂蝉", "群", "ping", "archer", 5, 22, 88, 75, "连环计，演义传奇人物。"),
  G("yuan_shao", "袁绍", "袁", "ping", "cavalry", 8, 76, 72, 120, "河北四世三公，官渡一败。"),
  G("yuan_shu", "袁术", "袁", "ping", "infantry", 6, 48, 52, 105, "僭号仲家，众叛亲离。"),
  G("liu_biao", "刘表", "汉", "ping", "archer", 6, 42, 78, 100, "荆州牧，坐观时变。"),
  G("liu_zhang", "刘璋", "蜀", "shan", "infantry", 5, 38, 56, 95, "暗弱，益州终属刘备。"),
  G("liu_shan", "刘禅", "蜀", "shan", "infantry", 1, 10, 42, 95, "安乐公，蜀汉后主。"),
  G("zhang_jiao", "张角", "黄巾", "ping", "archer", 8, 34, 92, 108, "太平道，黄巾起事。"),
  G("zhang_bao", "张宝", "黄巾", "shan", "infantry", 6, 58, 76, 102, "张角弟，地公将军。"),
  G("zhang_liang", "张梁", "黄巾", "ping", "cavalry", 6, 62, 58, 100, "张角弟，人公将军。"),
  G("hua_xiong", "华雄", "董", "ping", "cavalry", 7, 78, 42, 110, "汜水关前挑战诸侯。"),
  G("yan_liang", "颜良", "袁", "ping", "cavalry", 8, 90, 40, 115, "河北名将，白马被斩。"),
  G("wen_chou", "文丑", "袁", "ping", "cavalry", 8, 89, 42, 112, "与颜良齐名。"),
  G("gao_shun", "高顺", "吕", "ping", "infantry", 7, 80, 68, 108, "陷阵营统帅。"),
  G("chen_gong", "陈宫", "吕", "ping", "archer", 6, 20, 90, 90, "弃曹从吕，白门楼殉义。"),
  G("zhang_ren", "张任", "蜀", "shan", "cavalry", 8, 78, 58, 112, "蜀中名将，落凤坡射庞统，终为刘备所擒。"),
  G("yan_yan", "严颜", "蜀", "shan", "infantry", 7, 74, 54, 108, "巴郡老将，张飞义释后降。"),
];

/** 演义中常见部将、文臣、诸侯（批量生成，属性有随机带） */
const NPC_SPEC =
  "程昱|魏|ping|infantry|荀攸|魏|ping|archer|孔融|汉|ping|archer|祢衡|汉|ping|archer|陈琳|魏|ping|archer|王粲|魏|ping|archer|蔡瑁|魏|shui|infantry|张允|魏|shui|archer|文聘|魏|ping|cavalry|韩当|吴|shui|infantry|程普|吴|shui|infantry|周泰|吴|shui|infantry|蒋钦|吴|shui|cavalry|丁奉|吴|shui|infantry|徐盛|吴|shui|archer|潘璋|吴|shui|infantry|朱然|吴|shui|infantry|韩遂|群|ping|cavalry|马腾|群|ping|cavalry|庞德|魏|ping|infantry|魏延部将|蜀|shan|infantry|李恢|蜀|shan|archer|马谡|蜀|ping|archer|廖化|蜀|shan|infantry|吴懿|蜀|ping|cavalry|陈到|蜀|ping|infantry|向宠|蜀|ping|infantry|张松|蜀|ping|archer|泠苞|蜀|shan|cavalry|邓贤|蜀|shan|archer|刘璝|蜀|shan|infantry|高沛|蜀|shan|cavalry|杨怀|蜀|shan|infantry|刘巴|蜀|ping|archer|李严|蜀|ping|infantry|费祎|蜀|ping|archer|董允|蜀|ping|infantry|蒋琬|蜀|ping|archer|向朗|蜀|ping|infantry|邓芝|蜀|ping|archer|夏侯霸|魏|ping|cavalry|曹彰|魏|ping|cavalry|曹植|魏|ping|archer|牛金|魏|ping|infantry|史涣|魏|ping|cavalry|吕旷|魏|ping|cavalry|吕翔|魏|ping|archer|淳于琼|袁|ping|infantry|审配|袁|shan|archer|逢纪|袁|ping|archer|郭图|袁|ping|archer|辛评|袁|ping|infantry|麴义|袁|ping|cavalry|田丰|袁|ping|archer|沮授|袁|ping|archer|公孙瓒|群|ping|cavalry|陶谦|汉|ping|infantry|孔伷|汉|ping|archer|张邈|群|ping|infantry|张绣|群|ping|cavalry|李傕|董|ping|cavalry|郭汜|董|ping|cavalry|李典副将|魏|ping|infantry|蔡阳|魏|ping|cavalry|秦琪|魏|ping|archer|王植|魏|shan|infantry|卞喜|魏|shan|infantry|韩福|魏|ping|archer|孟坦|魏|ping|cavalry|孔秀|魏|ping|infantry|裴元绍|黄巾|shan|infantry|周仓旧部|黄巾|shan|infantry|杜远|黄巾|ping|infantry|廖化同行|蜀|shan|infantry|范疆|蜀|shan|archer|张达|蜀|shan|infantry|傅士仁|蜀|ping|infantry|糜芳|蜀|ping|infantry|郝萌|吕|ping|cavalry|魏续|吕|ping|cavalry|宋宪|吕|ping|archer|侯成|吕|ping|infantry|曹性|吕|ping|archer|高顺副将|吕|ping|infantry|陈登|汉|ping|archer|陈珪|汉|ping|archer|刘繇|汉|ping|infantry|严白虎|吴|shan|infantry|王朗|魏|ping|archer|钟繇|魏|ping|archer|华歆|魏|ping|infantry|满宠|魏|ping|archer|吕虔|魏|ping|infantry|毛玠|魏|ping|archer|崔琰|魏|ping|infantry|杨修|魏|ping|archer|丁仪|魏|ping|archer|吴质|魏|ping|archer|刘晔|魏|ping|archer|蒋济|魏|ping|archer|孙礼|魏|ping|infantry|孙坚|吴|ping|cavalry|孙策|吴|ping|cavalry|吴国太|吴|shui|archer|大乔|吴|shui|archer|小乔|吴|shui|archer|诸葛瑾|吴|shui|archer|步骘|吴|shui|infantry|张昭|吴|shui|archer|张纮|吴|shui|archer|虞翻|吴|shui|archer|陆绩|吴|shui|archer|骆统|吴|shui|infantry|吾粲|吴|shui|archer|留赞|吴|shui|infantry";

function parseNpcSpec(): GeneralCatalogEntry[] {
  const parts = NPC_SPEC.split("|");
  const out: GeneralCatalogEntry[] = [];
  for (let i = 0; i + 3 < parts.length; i += 4) {
    const name = parts[i]!;
    const faction = parts[i + 1]!;
    const armyType = parts[i + 2]! as ArmyType;
    const troopKind = parts[i + 3]! as TroopKind;
    const idx = out.length;
    const refLevel = 3 + (idx % 9);
    const might = clampMight(28 + (idx % 48));
    const intel = 32 + (idx % 22);
    const maxHp = 72 + (idx % 48);
    const id = `npc_${String(idx + 1).padStart(3, "0")}_${name.replace(/\s/g, "")}`;
    out.push(
      G(id, name, faction, armyType, troopKind, refLevel, might, intel, maxHp, `演义人物${name}，随诸侯征战。`)
    );
  }
  return out;
}

const NPC_GENERATED = parseNpcSpec();

export const GENERAL_CATALOG: GeneralCatalogEntry[] = [...FAMOUS, ...NPC_GENERATED];

const byId = new Map(GENERAL_CATALOG.map((g) => [g.id, g]));

export function getGeneralCatalogEntry(id: string): GeneralCatalogEntry | undefined {
  return byId.get(id);
}

export function listGeneralsSorted(): GeneralCatalogEntry[] {
  return [...GENERAL_CATALOG].sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
}

/** 与 `public/sprites/avatars/{id}.png` 对应的文件名（不含扩展名），供批量配头像脚本使用 */
export function listPortraitImageBasenames(): readonly string[] {
  return GENERAL_CATALOG.map((g) => g.id);
}

/** 战场用：按图鉴生成单位；tier 为关卡序号 0..n，略抬等级与兵力 */
export function unitFromCatalog(
  side: Side,
  catalogId: string,
  battleUnitId: string,
  x: number,
  y: number,
  tier: number
): Unit | null {
  const g = byId.get(catalogId);
  if (!g) return null;
  const lv = Math.min(MAX_UNIT_LEVEL, Math.max(1, g.refLevel + Math.floor(tier * 0.85)));
  const lvC = clampUnitLevel(lv);
  const maxHp = maxHpForLevel(lvC);
  const might = clampMight(g.might + Math.floor(tier / 3));
  const intel = Math.min(100, g.intel + Math.floor(tier / 3));
  const defense = defensePowerForUnit(might, lvC, g.troopKind);
  const tm = side === "player" ? tacticMaxForUnit(intel, lvC) : 0;
  return {
    id: battleUnitId,
    name: g.name,
    side,
    x,
    y,
    hp: maxHp,
    maxHp,
    level: lvC,
    exp: 0,
    might,
    intel,
    defense,
    armyType: g.armyType,
    troopKind: g.troopKind,
    tacticMax: tm,
    tacticPoints: tm,
    move: movePointsForTroop(g.troopKind),
    moved: false,
    acted: false,
    portraitCatalogId: catalogId,
  };
}
