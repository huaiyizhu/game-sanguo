/**
 * 刘备演义线关卡表：顺序、地形键、敌军布置与援军列表。
 * 敌军坐标与原版 `scenarios.ts` 对齐；tier 由关卡在 `SCENARIO_IDS` 中的下标传入。
 */
import type { ArmyType, TroopKind, WinCondition } from "./types";

export type CampaignTerrainKind =
  | "classic"
  | "open"
  | "forest"
  | "river"
  | "chibi"
  | "pass"
  | "hanzhong"
  | "fan"
  | "yiling"
  | "qishan"
  | "xuzhou";

type UU = readonly ["U", string, string, number, number];
type GG = readonly ["G", string, string, number, number, number, number, number, number, TroopKind, ArmyType];
export type CampaignEnemyRow = UU | GG;

export const U = (cat: string, bid: string, x: number, y: number): UU => ["U", cat, bid, x, y];

export const G = (
  id: string,
  name: string,
  x: number,
  y: number,
  unusedHp: number,
  level: number,
  might: number,
  intel: number,
  troop: TroopKind,
  army: ArmyType
): GG => ["G", id, name, x, y, unusedHp, level, might, intel, troop, army];

export interface LiuBeiScenarioBody {
  title: string;
  w: number;
  h: number;
  terrain: CampaignTerrainKind;
  openingLog: string;
  scenarioBrief: string;
  victoryBrief: string;
  winCondition: WinCondition;
  maxBattleRounds?: number;
  extraLog?: string[];
  /** 在刘关张之后追加的图鉴 id（最多 3 人 → 共 6 将） */
  allyExtras: readonly string[];
  /** 若设置则本关不使用刘关张模板，改为北伐阵容（全来自图鉴） */
  northernTeam?: readonly string[];
  enemies: readonly CampaignEnemyRow[];
}

export const SCENARIO_IDS = [
  "prologue_zhangjiao",
  "lb_yingchuan",
  "lb_dong_van",
  "ch1_pursuit",
  "lb_beihai",
  "lb_taoqian",
  "ch2_xuzhou",
  "lb_hubmen",
  "ch3_xiaopei",
  "lb_xu_rout",
  "lb_yuan_camp",
  "lb_guandu_foray",
  "lb_maichang",
  "lb_bowang",
  "ch4_xinye",
  "ch5_changban",
  "lb_jiangxia",
  "ch6_chibi",
  "lb_jingzhou",
  "lb_hefei_shadow",
  "ch7_yizhou",
  "lb_luofeng",
  "lb_chengdu",
  "lb_hanzhong_probe",
  "ch8_hanzhong",
  "lb_jing_front",
  "ch9_xiangfan",
  "lb_fancheng_wave",
  "lb_maicheng",
  "ch10_yiling",
  "lb_xiaoting",
  "ch11_qishan",
] as const;

export type ScenarioId = (typeof SCENARIO_IDS)[number];

export const SCENARIO_ORDER = SCENARIO_IDS;

const CAMPAIGN = {
  prologue_zhangjiao: {
    title: "序章 · 讨伐黄巾",
    w: 32,
    h: 20,
    terrain: "classic" as const,
    openingLog:
      "灵帝末年，张角以太平道聚众三十六万，烽火燎原。刘备随邹靖讨贼，与关羽、张飞首阵共讨黄巾。",
    scenarioBrief:
      "钜鹿张角自称天公将军，弟宝、梁分统地公、人公；官军初战需挫其锋。演义此战重在义兵崛起，非一城一池之得失。",
    victoryBrief: "张角授首（或溃败），黄巾失其魁首，关东州郡得以喘息。",
    winCondition: { type: "eliminate_marked_enemies", unitIds: ["e_zhang_jiao"] } as WinCondition,
    extraLog: ["胜利条件：击败天公将军张角（张宝、张梁与余众可续剿，本关以张角溃败为胜）。"],
    allyExtras: [],
    enemies: [
      U("zhang_jiao", "e_zhang_jiao", 14, 4),
      U("zhang_bao", "e_zhang_bao", 20, 4),
      U("zhang_liang", "e_zhang_liang", 8, 4),
      G("e_g1", "黄巾术士", 12, 6, 62, 2, 20, 34, "archer", "shui"),
      G("e_g2", "黄巾刀兵", 22, 8, 68, 2, 22, 28, "infantry", "ping"),
      G("e_g3", "黄巾骑手", 4, 8, 58, 3, 24, 22, "cavalry", "ping"),
    ],
  },
  lb_yingchuan: {
    title: "颍川讨贼",
    w: 34,
    h: 20,
    terrain: "forest",
    openingLog:
      "黄巾别部扰颍川，官军一时难聚。刘备义勇先行，与关张深入林薮，欲断贼渠魁与援路。",
    scenarioBrief: "密林起伏，弓步利于设伏；敌军以黄巾降将张宝旧部为核心，骑兵较少。",
    victoryBrief: "颍川贼势顿挫，郡县道路暂通。",
    winCondition: { type: "eliminate_all" } as WinCondition,
    allyExtras: [],
    enemies: [
      U("zhang_bao", "e_zb_yc", 18, 4),
      G("e_yc1", "黄巾长", 26, 6, 80, 3, 24, 26, "infantry", "ping"),
      G("e_yc2", "黄巾弓手", 10, 6, 70, 3, 22, 30, "archer", "ping"),
      G("e_yc3", "黄巾骑哨", 22, 8, 75, 4, 26, 22, "cavalry", "ping"),
      G("e_yc4", "太平道众", 14, 8, 72, 3, 20, 36, "archer", "shan"),
    ],
  },
  lb_dong_van: {
    title: "讨董前哨",
    w: 36,
    h: 20,
    terrain: "classic",
    openingLog:
      "诸侯会盟酸枣，前锋与西凉斥候已数交锋。刘备军为联军左翼，先挫董军游骑，以通粮道。",
    scenarioBrief: "西凉铁骑机动强，宜借林地与浅溪迟滞；华雄旧部与李傕郭汜旗号之偏师混杂其间。",
    victoryBrief: "董军游骑退却，联军前锋站稳脚跟。",
    winCondition: { type: "eliminate_all" } as WinCondition,
    allyExtras: [],
    enemies: [
      U("hua_xiong", "e_hx_van", 20, 3),
      U("zhang_liao", "e_zl_van", 28, 5),
      G("e_dv1", "西凉铁骑", 32, 7, 82, 4, 28, 24, "cavalry", "ping"),
      G("e_dv2", "飞熊斥候", 12, 7, 76, 4, 26, 28, "archer", "ping"),
      G("e_dv3", "董营步卒", 24, 9, 88, 5, 27, 26, "infantry", "ping"),
    ],
  },
  ch1_pursuit: {
    title: "第一章 · 洛阳溃敌",
    w: 36,
    h: 20,
    terrain: "classic",
    openingLog:
      "董卓迁都长安，西凉兵马断后；曹操发檄未至，刘备先遇华雄旧部与董军精锐，洛阳道上一战定去留。",
    scenarioBrief:
      "洛阳残破，西凉军团仍控要道。敌军含华雄、董卓亲兵与张辽等名将，兵力厚于序章。",
    victoryBrief: "敌军全灭，西凉断后部队溃散。",
    winCondition: { type: "eliminate_all" } as WinCondition,
    allyExtras: [],
    enemies: [
      U("hua_xiong", "e_hua_xiong", 16, 2),
      U("dong_zhuo", "e_dong_zhuo", 10, 4),
      U("zhang_liao", "e_zhang_liao", 24, 4),
      G("e_x1", "西凉铁骑", 28, 6, 72, 4, 27, 24, "cavalry", "ping"),
      G("e_x2", "西凉弓骑", 6, 6, 65, 4, 24, 30, "archer", "ping"),
      G("e_x3", "飞熊军", 20, 8, 88, 5, 29, 28, "infantry", "shan"),
      G("e_x4", "董府死士", 12, 8, 78, 5, 28, 32, "infantry", "ping"),
    ],
  },
  lb_beihai: {
    title: "北海解围",
    w: 36,
    h: 22,
    terrain: "forest",
    openingLog:
      "孔融为黄巾管亥所围，遣太史慈求救；刘备素慕其名，提兵来援，与关张再赴北海城下。",
    scenarioBrief: "城外援军与围城黄巾对峙，密林可藏弓弩；管亥骁勇，宜分兵牵制后击其中军。",
    victoryBrief: "围解，北海与徐州声气相通。",
    winCondition: { type: "eliminate_marked_enemies", unitIds: ["e_zhang_liang_bh"] } as WinCondition,
    extraLog: ["胜利条件：击破黄巾主将张梁所部本阵（演义向：管亥之围以贼酋溃败为胜）。"],
    allyExtras: ["mi_zhu"],
    enemies: [
      U("zhang_liang", "e_zhang_liang_bh", 14, 4),
      G("e_bh1", "管亥旧部", 22, 6, 90, 5, 28, 24, "cavalry", "ping"),
      G("e_bh2", "黄巾盾墙", 28, 8, 85, 5, 26, 26, "infantry", "ping"),
      G("e_bh3", "北海围城卒", 8, 8, 78, 4, 24, 28, "archer", "ping"),
      G("e_bh4", "黄巾术士", 18, 10, 70, 4, 22, 34, "archer", "shan"),
    ],
  },
  lb_taoqian: {
    title: "陶恭祖求援",
    w: 36,
    h: 22,
    terrain: "open",
    openingLog:
      "曹操攻徐州甚急，陶谦遣使四出。刘备兵少，仍先赴郯城外道，与曹军游骑交锋，为百姓争一日之安。",
    scenarioBrief: "开阔战场，骑兵威胁大；敌军以夏侯渊偏师与青州兵为主，宜先破弓弩再折其翼。",
    victoryBrief: "曹军前锋受挫，徐州城下稍缓。",
    winCondition: { type: "eliminate_all" } as WinCondition,
    allyExtras: ["mi_zhu", "jian_yong"],
    enemies: [
      U("xiahou_yuan", "e_xhy_tq", 20, 4),
      U("cheng_yu", "e_cy_tq", 8, 8),
      G("e_tq1", "青州兵", 28, 6, 84, 5, 27, 26, "infantry", "ping"),
      G("e_tq2", "曹军弩手", 10, 6, 72, 5, 25, 32, "archer", "ping"),
      G("e_tq3", "斥候骑", 24, 8, 76, 5, 28, 22, "cavalry", "ping"),
      G("e_tq4", "辎重营卒", 16, 10, 80, 5, 24, 24, "infantry", "ping"),
    ],
  },
  ch2_xuzhou: {
    title: "第二章 · 徐州驰援",
    w: 36,
    h: 24,
    terrain: "xuzhou",
    openingLog:
      "陶谦三让徐州前夜，曹操以父仇为名大军压境；刘备自公孙瓒处来援，小沛未立先战彭城外道。",
    scenarioBrief:
      "战场开阔，河中游可迟滞骑兵。曹操本人督阵，夏侯惇、张辽、于禁分统诸部，需分路牵制。",
    victoryBrief: "击退曹军前锋，徐州暂得喘息（本关以全歼敌军为胜）。",
    winCondition: { type: "eliminate_all" } as WinCondition,
    allyExtras: ["zhao_yun", "mi_zhu", "jian_yong"],
    enemies: [
      U("cao_cao", "e_cao_cao", 18, 4),
      U("xiahou_dun", "e_xiahou_dun", 24, 4),
      U("zhang_liao", "e_zhang_liao2", 12, 4),
      U("yu_jin", "e_yu_jin", 28, 6),
      U("cao_chun", "e_cc_xz", 6, 10),
      G("e_c1", "青州兵", 8, 8, 82, 5, 27, 26, "infantry", "ping"),
      G("e_c2", "曹军弩手", 32, 8, 68, 5, 25, 32, "archer", "ping"),
      G("e_c3", "虎豹骑斥候", 16, 8, 76, 6, 30, 24, "cavalry", "ping"),
      G("e_c4", "辎重营卒", 22, 10, 74, 5, 24, 22, "infantry", "ping"),
    ],
  },
  lb_hubmen: {
    title: "辕门射戟前",
    w: 38,
    h: 22,
    terrain: "open",
    openingLog:
      "吕布辕门射戟前，刘备暂驻小沛外营，与吕部将郝萌、宋宪等数有小战；此乃两家翻脸前的最后试探。",
    scenarioBrief: "并州骑射凌厉，宜以步兵卡要、弓兵断其回旋；敌军数量不多但精悍。",
    victoryBrief: "吕军偏师退却，暂保营栅。",
    winCondition: { type: "eliminate_all" } as WinCondition,
    allyExtras: ["zhao_yun", "mi_zhu", "mi_fang"],
    enemies: [
      U("gao_shun", "e_gs_hub", 22, 4),
      G("e_hb1", "并州狼骑", 30, 6, 78, 6, 29, 22, "cavalry", "ping"),
      G("e_hb2", "陷阵营前哨", 14, 8, 92, 7, 30, 26, "infantry", "shan"),
      G("e_hb3", "飞将弓骑", 10, 6, 70, 6, 27, 30, "archer", "ping"),
      G("e_hb4", "下邳援军", 34, 8, 80, 6, 28, 24, "cavalry", "shan"),
    ],
  },
  ch3_xiaopei: {
    title: "第三章 · 小沛据守",
    w: 40,
    h: 24,
    terrain: "forest",
    openingLog:
      "刘备暂驻小沛，吕布忌其得人心，陈宫劝早除后患。营栅之外密林起伏，正是步弓设伏之地。",
    scenarioBrief:
      "吕布亲自冲锋，高顺陷阵营与张辽侧翼呼应。林地利于我军步兵与弓兵，骑兵须慎入深林。",
    victoryBrief: "吕布败走，小沛之围得解。",
    winCondition: { type: "eliminate_marked_enemies", unitIds: ["e_lu_bu"] } as WinCondition,
    extraLog: ["胜利条件：击败飞将吕布（余部可溃散不顾）。"],
    allyExtras: ["zhao_yun", "guan_ping", "jian_yong"],
    enemies: [
      U("lu_bu", "e_lu_bu", 20, 4),
      U("gao_shun", "e_gao_shun", 16, 6),
      U("zhang_liao", "e_zhang_liao3", 26, 4),
      G("e_b1", "陷阵营", 14, 8, 92, 7, 30, 26, "infantry", "shan"),
      G("e_b2", "并州狼骑", 30, 6, 74, 6, 29, 22, "cavalry", "ping"),
      G("e_b3", "方天画戟亲卫", 22, 8, 85, 7, 31, 28, "infantry", "ping"),
      G("e_b4", "飞将弓骑", 10, 6, 70, 6, 27, 30, "archer", "ping"),
      G("e_b5", "下邳援军", 34, 8, 80, 6, 28, 24, "cavalry", "shan"),
    ],
  },
  lb_xu_rout: {
    title: "徐州突围",
    w: 38,
    h: 22,
    terrain: "river",
    openingLog:
      "曹操再攻徐州，城破在即；刘备夜引关张与赵云突围，百姓塞道，曹军虎骑已逼后营。",
    scenarioBrief: "河道迟滞追兵，水军兵种在浅滩有优势；敌军以张辽、许褚为锋。",
    victoryBrief: "突出重围，暂保义兵火种。",
    winCondition: { type: "eliminate_all" } as WinCondition,
    allyExtras: ["zhao_yun", "guan_ping", "mi_fang"],
    enemies: [
      U("zhang_liao", "e_zl_xr", 32, 3),
      U("xu_chu", "e_xc_xr", 26, 5),
      G("e_xr1", "虎豹骑", 36, 5, 84, 7, 31, 22, "cavalry", "ping"),
      G("e_xr2", "曹军弩营", 18, 7, 70, 6, 26, 34, "archer", "ping"),
      G("e_xr3", "青州射手", 12, 9, 68, 6, 24, 32, "archer", "ping"),
      G("e_xr4", "曹军司马", 8, 7, 95, 7, 29, 34, "infantry", "shan"),
    ],
  },
  lb_yuan_camp: {
    title: "河北投袁绍",
    w: 36,
    h: 22,
    terrain: "classic",
    openingLog:
      "刘备败投袁绍，绍待以上宾，却命其率偏师袭扰曹操侧翼。此战遇曹军游骑与河北降卒混编之敌。",
    scenarioBrief: "平原战场，敌骑与弓弩兼备；宜先断其两翼再逼中军。",
    victoryBrief: "小胜而归，袁绍帐前暂立脚跟。",
    winCondition: { type: "eliminate_all" } as WinCondition,
    allyExtras: ["zhao_yun", "guan_ping", "xu_shu"],
    enemies: [
      U("zhang_he", "e_zh_yu", 18, 4),
      U("yan_liang", "e_yl_yu", 26, 4),
      U("xu_you", "e_xu_you_yc", 6, 8),
      G("e_yu1", "河北弓骑", 30, 6, 78, 6, 28, 28, "cavalry", "ping"),
      G("e_yu2", "大戟士", 12, 8, 90, 7, 30, 26, "infantry", "ping"),
      G("e_yu3", "曹军斥候", 22, 10, 74, 6, 26, 30, "archer", "ping"),
    ],
  },
  lb_guandu_foray: {
    title: "官渡侧击",
    w: 40,
    h: 22,
    terrain: "forest",
    openingLog:
      "官渡相持，袁绍令刘备南下汝南，牵制曹仁。曹军粮道护卫森严，林道狭处或可一击。",
    scenarioBrief: "密林分割战场，骑兵难展；敌军含曹仁、李典等善守之将。",
    victoryBrief: "粮道震动，曹军分兵，官渡正面稍松。",
    winCondition: { type: "eliminate_all" } as WinCondition,
    allyExtras: ["zhao_yun", "guan_ping", "fa_zheng"],
    enemies: [
      U("cao_ren", "e_cr_gd", 20, 4),
      U("li_dian", "e_ld_gd", 28, 6),
      U("man_chong", "e_mc_gd", 12, 10),
      G("e_gd1", "辎重护卫", 14, 8, 88, 7, 28, 26, "infantry", "ping"),
      G("e_gd2", "强弩营", 32, 8, 76, 7, 27, 36, "archer", "ping"),
      G("e_gd3", "汝南黄巾残部", 8, 10, 82, 6, 25, 28, "infantry", "shan"),
    ],
  },
  lb_maichang: {
    title: "脱曹南走",
    w: 38,
    h: 22,
    terrain: "river",
    openingLog:
      "衣带诏事发，刘备不得复留许都，连夜南奔。曹操遣蔡阳等追之，江岸狭道，一战定生死。",
    scenarioBrief: "河道与浅林交错，弓兵封渡口可迟滞追骑；敌军骑兵众多。",
    victoryBrief: "追兵溃散，刘军得投荆州。",
    winCondition: { type: "eliminate_marked_enemies", unitIds: ["e_caiyang"] } as WinCondition,
    extraLog: ["胜利条件：斩杀蔡阳（余众可不计）。"],
    allyExtras: ["zhao_yun", "guan_ping", "xu_shu"],
    enemies: [
      G("e_caiyang", "蔡阳", 24, 3, 88, 8, 31, 26, "cavalry", "ping"),
      G("e_mc1", "蔡阳部曲", 30, 5, 86, 7, 28, 26, "cavalry", "ping"),
      G("e_mc2", "许都追骑", 16, 7, 80, 7, 29, 24, "cavalry", "ping"),
      G("e_mc3", "江岸弩手", 10, 9, 72, 6, 26, 32, "archer", "shui"),
      G("e_mc4", "曹军司马", 34, 7, 90, 7, 30, 30, "infantry", "ping"),
    ],
  },
  lb_bowang: {
    title: "博望坡火计",
    w: 38,
    h: 22,
    terrain: "forest",
    openingLog:
      "诸葛亮初出茅庐，博望坡设伏火攻；夏侯惇恃勇轻进，刘备为饵，关张分兵夹击。",
    scenarioBrief: "中央密林利于火计与弓弩；敌军骑兵冒进可诱入谷口。",
    victoryBrief: "曹军前锋大败，新野军民知孔明非虚谈。",
    winCondition: { type: "eliminate_marked_enemies", unitIds: ["e_xiahou_dun_bw"] } as WinCondition,
    extraLog: ["胜利条件：击破夏侯惇中军（演义向火攻定局）。"],
    allyExtras: ["zhao_yun", "zhuge_liang", "fa_zheng"],
    enemies: [
      U("xiahou_dun", "e_xiahou_dun_bw", 22, 4),
      U("li_dian", "e_li_dian_bw", 30, 6),
      G("e_bw1", "虎豹骑", 18, 8, 82, 8, 31, 22, "cavalry", "ping"),
      G("e_bw2", "曹军弩营", 28, 10, 70, 7, 26, 34, "archer", "ping"),
      G("e_bw3", "青州兵", 12, 10, 88, 8, 28, 26, "infantry", "ping"),
    ],
  },
  ch4_xinye: {
    title: "第四章 · 新野初谋",
    w: 40,
    h: 24,
    terrain: "forest",
    openingLog:
      "诸葛亮新拜军师，博望未战先谋新野：曹军先锋追至，林道狭窄，正可示敌以弱、诱而分之。",
    scenarioBrief:
      "（演义向）孔明初出茅庐第一策，战场以密林与浅溪分割敌军。本关敌军含张郃、徐晃与司马昭所部。",
    victoryBrief: "敌军全灭，新野军民得安。",
    winCondition: { type: "eliminate_all" } as WinCondition,
    extraLog: [
      "注：敌军「诸葛亮」旗号实为诱敌疑兵；我军本阵军师诸葛亮随军参谋，两不相混。",
    ],
    allyExtras: ["zhao_yun", "guan_ping", "zhuge_liang"],
    enemies: [
      U("zhuge_liang", "e_kongming_decoy", 6, 21),
      U("simazhao", "e_sima_zhao", 28, 4),
      U("zhang_he", "e_zhang_he", 22, 6),
      U("xu_huang", "e_xu_huang", 16, 6),
      G("e_n1", "虎豹骑", 32, 4, 78, 7, 31, 22, "cavalry", "ping"),
      G("e_n2", "虎豹骑", 12, 4, 76, 7, 30, 22, "cavalry", "ping"),
      G("e_n3", "许都弩营", 24, 8, 68, 7, 25, 36, "archer", "ping"),
      G("e_n4", "青州射手", 18, 10, 65, 6, 24, 32, "archer", "ping"),
      G("e_n5", "曹军精锐", 34, 8, 90, 8, 30, 28, "infantry", "ping"),
      G("e_n6", "曹军司马", 10, 8, 95, 8, 29, 34, "infantry", "shan"),
    ],
  },
  ch5_changban: {
    title: "第五章 · 长坂退敌",
    w: 44,
    h: 24,
    terrain: "river",
    openingLog:
      "当阳道上，百姓塞路；曹军虎豹骑追及，刘备不忍弃民，关张护主且战且走。",
    scenarioBrief:
      "河道横贯地图中央，非水军难渡。骑兵自两翼包抄，需利用河岸迟滞与弓兵牵制。",
    victoryBrief: "敌军全灭，百姓得续向南。",
    winCondition: { type: "eliminate_all" } as WinCondition,
    allyExtras: ["zhao_yun", "huang_zhong", "zhuge_liang"],
    enemies: [
      U("zhang_liao", "e_zhang_liao_cb", 36, 2),
      U("xu_chu", "e_xu_chu", 32, 4),
      U("zhang_he", "e_zhang_he2", 28, 2),
      G("e_cb1", "虎豹骑", 40, 4, 82, 8, 32, 22, "cavalry", "ping"),
      G("e_cb2", "虎豹骑", 24, 4, 80, 8, 31, 22, "cavalry", "ping"),
      G("e_cb3", "虎豹骑", 20, 6, 78, 8, 31, 22, "cavalry", "ping"),
      G("e_cb4", "长坂斥候", 16, 4, 70, 7, 27, 28, "archer", "ping"),
      G("e_cb5", "曹军别部", 12, 6, 92, 8, 30, 30, "infantry", "ping"),
      G("e_cb6", "曹军偏将", 8, 4, 100, 9, 32, 36, "infantry", "shan"),
      G("e_cb7", "江岸弩手", 38, 8, 68, 7, 26, 32, "archer", "shui"),
      G("e_cb8", "江岸弩手", 14, 8, 66, 7, 25, 30, "archer", "shui"),
    ],
  },
  lb_jiangxia: {
    title: "江夏合兵",
    w: 40,
    h: 24,
    terrain: "chibi",
    openingLog:
      "刘备败走江夏，刘琦开门延纳；曹军水师游骑沿江搜剿，孙刘结盟前须先稳南岸。",
    scenarioBrief: "水泽与浅滩交错，水军与弓兵占优；敌军以曹军水师偏师与荆州降卒混编为主。",
    victoryBrief: "南岸肃清，为赤壁结盟铺路。",
    winCondition: { type: "eliminate_all" } as WinCondition,
    allyExtras: ["zhao_yun", "xu_shu", "zhuge_liang"],
    enemies: [
      U("zhang_he", "e_zhang_he_jx", 22, 4),
      G("e_jx1", "荆州水卒", 30, 6, 80, 8, 28, 28, "infantry", "shui"),
      G("e_jx2", "江夏弩台", 14, 8, 76, 7, 27, 36, "archer", "ping"),
      G("e_jx3", "曹军楼船", 34, 8, 84, 8, 29, 26, "archer", "shui"),
      G("e_jx4", "浅滩死士", 10, 10, 88, 8, 30, 26, "infantry", "shui"),
    ],
  },
  ch6_chibi: {
    title: "第六章 · 赤壁前哨",
    w: 44,
    h: 28,
    terrain: "chibi",
    openingLog:
      "孙刘结盟，周瑜程督水军；江岸前哨已与曹军水寨交锋，烟火映红半壁天。",
    scenarioBrief: "大面积水泽，水军与弓兵占优。曹军亦有水卒与降卒，不可轻敌。",
    victoryBrief: "肃清前哨，为赤壁大战铺路。",
    winCondition: { type: "eliminate_all" } as WinCondition,
    allyExtras: ["zhao_yun", "pang_tong", "zhuge_liang"],
    enemies: [
      U("zhou_yu", "e_zhou_yu", 36, 6),
      U("gan_ning", "e_gan_ning", 32, 8),
      U("huang_gai", "e_huang_gai", 28, 10),
      U("cao_cao", "e_cao_cao_cb", 12, 4),
      U("zhang_liao", "e_zhang_liao_cb2", 16, 4),
      G("e_w1", "江东弩手", 40, 10, 72, 8, 28, 36, "archer", "shui"),
      G("e_w2", "连环舟卒", 22, 12, 80, 8, 28, 26, "infantry", "shui"),
      G("e_w3", "曹军水卒", 10, 10, 76, 8, 27, 28, "infantry", "shui"),
      G("e_w4", "荆州降卒", 18, 8, 82, 9, 29, 28, "archer", "ping"),
      G("e_w5", "楼船弓手", 26, 12, 70, 8, 27, 34, "archer", "shui"),
      G("e_w6", "浅滩死士", 8, 12, 88, 9, 30, 26, "infantry", "shui"),
    ],
  },
  lb_jingzhou: {
    title: "南郡争锋",
    w: 42,
    h: 26,
    terrain: "fan",
    openingLog:
      "赤壁之后，荆州数郡未定；周瑜北攻南郡，刘备亦欲取四郡为基，江陵外道再燃烽火。",
    scenarioBrief: "河道纵贯，弓弩封浅滩可断敌迂回；东吴与曹军降卒混战中立为敌。",
    victoryBrief: "江陵外垒动摇，为借荆州与取四郡张本。",
    winCondition: { type: "eliminate_all" } as WinCondition,
    allyExtras: ["zhao_yun", "wei_yan", "ma_liang"],
    enemies: [
      U("zhou_yu", "e_zy_jj", 24, 4),
      U("cao_ren", "e_cr_jj", 32, 6),
      G("e_jj1", "江东强弩", 18, 8, 76, 9, 28, 38, "archer", "shui"),
      G("e_jj2", "曹军残部", 36, 8, 88, 9, 30, 28, "infantry", "ping"),
      G("e_jj3", "江陵戍卒", 12, 10, 82, 8, 27, 30, "archer", "ping"),
    ],
  },
  lb_hefei_shadow: {
    title: "合淝阴影",
    w: 40,
    h: 24,
    terrain: "open",
    openingLog:
      "孙权屡攻合淝，甘宁百骑劫营威震江淮；刘备在荆州亦遣偏师策应，牵制曹魏东方兵力。",
    scenarioBrief: "开阔战场，敌骑冲锋猛；宜以弓兵与步兵方阵层层迟滞。",
    victoryBrief: "魏军东方机动受挫，荆州侧翼稍安。",
    winCondition: { type: "eliminate_marked_enemies", unitIds: ["e_gan_ning_hf"] } as WinCondition,
    extraLog: ["胜利条件：击退甘宁先锋（演义向江淮机动战）。"],
    allyExtras: ["zhao_yun", "huang_zhong", "huang_quan"],
    enemies: [
      U("gan_ning", "e_gan_ning_hf", 22, 4),
      U("ling_tong", "e_ling_tong_hf", 30, 6),
      G("e_hf1", "锦帆贼众", 16, 8, 80, 9, 29, 28, "infantry", "shui"),
      G("e_hf2", "吴军强弩", 34, 8, 74, 9, 27, 36, "archer", "ping"),
      G("e_hf3", "江淮斥候", 10, 10, 78, 8, 26, 30, "cavalry", "ping"),
    ],
  },
  ch7_yizhou: {
    title: "第七章 · 剑阁先声",
    w: 40,
    h: 28,
    terrain: "pass",
    openingLog:
      "入蜀必经剑阁天险，刘璋虽暗弱，麾下张任、严颜辈皆善战；先破外围，再图成都。",
    scenarioBrief: "中央山隘狭窄，大军难以展开。宜以弓兵封谷口、步兵层层推进。",
    victoryBrief: "剑阁外垒尽拔，益州震动。",
    winCondition: { type: "eliminate_marked_enemies", unitIds: ["e_liu_zhang"] } as WinCondition,
    extraLog: ["胜利条件：击破刘璋本队（迫其退守成都，余众可不究）。"],
    allyExtras: ["zhao_yun", "wei_yan", "fa_zheng"],
    enemies: [
      U("liu_zhang", "e_liu_zhang", 8, 6),
      U("yan_yan", "e_yan_yan", 16, 8),
      U("zhang_ren", "e_zhang_ren", 12, 10),
      U("li_yan", "e_li_yan_yz", 20, 12),
      G("e_yz1", "益州弓手", 24, 12, 76, 9, 29, 32, "archer", "shan"),
      G("e_yz2", "剑阁守军", 20, 10, 90, 9, 28, 28, "infantry", "shan"),
      G("e_yz3", "益州骑兵", 28, 14, 80, 9, 30, 24, "cavalry", "ping"),
      G("e_yz4", "涪城援军", 32, 8, 94, 10, 31, 28, "infantry", "shan"),
      G("e_yz5", "栈道甲士", 14, 12, 88, 10, 29, 26, "infantry", "shan"),
      G("e_yz6", "益州司马", 4, 10, 120, 11, 33, 42, "infantry", "shan"),
      G("e_yz7", "江油戍卒", 36, 12, 78, 9, 27, 30, "archer", "shan"),
    ],
  },
  lb_luofeng: {
    title: "落凤坡",
    w: 38,
    h: 26,
    terrain: "pass",
    openingLog:
      "庞统率军取川，张任设伏落凤坡；刘备在后军闻警，急遣关张分救，仍难改史笔之痛。",
    scenarioBrief: "山隘狭险，伏兵与弓弩威胁极大；宜步步为营，先清侧翼再救中军。",
    victoryBrief: "张任伏兵溃散，为雒城决战清障（演义向）。",
    winCondition: { type: "eliminate_marked_enemies", unitIds: ["e_zhang_ren_lf"] } as WinCondition,
    extraLog: ["胜利条件：击破张任（伏军主将）。"],
    allyExtras: ["zhao_yun", "wei_yan", "liu_feng"],
    enemies: [
      U("zhang_ren", "e_zhang_ren_lf", 16, 6),
      U("yan_yan", "e_yy_lf", 24, 8),
      G("e_lf1", "益州弩手", 12, 10, 78, 10, 28, 36, "archer", "shan"),
      G("e_lf2", "落凤伏兵", 28, 10, 86, 10, 30, 26, "infantry", "shan"),
      G("e_lf3", "栈道死士", 8, 12, 92, 11, 31, 28, "infantry", "shan"),
    ],
  },
  lb_chengdu: {
    title: "成都定益",
    w: 40,
    h: 26,
    terrain: "forest",
    openingLog:
      "刘璋出降前夕，成都尚有余勇；马超新附，兵临城下，最后一战定益州归属。",
    scenarioBrief: "城外林带与壕沟交错，步弓协同可压降卒士气；马超西凉骑为锋。",
    victoryBrief: "成都易帜，益州底定。",
    winCondition: { type: "eliminate_marked_enemies", unitIds: ["e_ma_chao_cd"] } as WinCondition,
    extraLog: ["胜利条件：击破马超所部前锋（象征成都外围决战）。"],
    allyExtras: ["zhao_yun", "wei_yan", "fa_zheng"],
    enemies: [
      U("ma_chao", "e_ma_chao_cd", 20, 4),
      U("liu_zhang", "e_lz_cd", 10, 8),
      G("e_cd1", "成都弩楼", 30, 8, 80, 10, 28, 38, "archer", "ping"),
      G("e_cd2", "益州甲士", 26, 10, 94, 11, 30, 28, "infantry", "shan"),
      G("e_cd3", "西凉铁骑", 34, 6, 88, 10, 32, 24, "cavalry", "ping"),
    ],
  },
  lb_hanzhong_probe: {
    title: "汉中前哨",
    w: 44,
    h: 26,
    terrain: "hanzhong",
    openingLog:
      "刘备既得蜀中，曹操不敢坐视；夏侯渊、张郃先据阳平关外，蜀军遣魏延、黄忠试探锋刃。",
    scenarioBrief: "沙地与山麓交错，骑兵与弓弩齐备；宜占高地再压谷口。",
    victoryBrief: "魏军外垒动摇，为定军山决战蓄势。",
    winCondition: { type: "eliminate_all" } as WinCondition,
    allyExtras: ["zhao_yun", "huang_zhong", "ma_liang"],
    enemies: [
      U("zhang_he", "e_zh_hz_p", 26, 4),
      U("xu_huang", "e_xh_hz_p", 32, 6),
      G("e_hp1", "阳平戍卒", 18, 8, 88, 10, 29, 28, "infantry", "shan"),
      G("e_hp2", "魏军强弩", 36, 8, 76, 10, 27, 38, "archer", "ping"),
      G("e_hp3", "汉中斥候", 12, 10, 82, 10, 28, 30, "cavalry", "ping"),
    ],
  },
  ch8_hanzhong: {
    title: "第八章 · 定军山麓",
    w: 48,
    h: 28,
    terrain: "hanzhong",
    openingLog:
      "刘备既得益州，曹操不敢坐视，夏侯渊、张郃屯汉中；此为定军山决战前哨，司马懿亦献策于军中。",
    scenarioBrief:
      "大地图分沙地、山麓与浅溪，骑兵与弓弩齐备。敌军名将云集，等级与兵力为本线最高。",
    victoryBrief: "夏侯惇本阵被破，魏军撤出山麓，汉中归属见分晓。",
    winCondition: { type: "eliminate_marked_enemies", unitIds: ["e_xiahou_dun_hz"] } as WinCondition,
    extraLog: ["胜利条件：击破夏侯惇督军本阵（敌军虽众，斩其大将则全线动摇）。"],
    allyExtras: ["zhao_yun", "huang_zhong", "zhuge_liang"],
    enemies: [
      U("xiahou_dun", "e_xiahou_dun_hz", 24, 2),
      U("zhang_he", "e_zhang_he_hz", 30, 4),
      U("xu_huang", "e_xu_huang_hz", 18, 4),
      U("si_ma_yi", "e_si_ma_yi", 14, 2),
      G("e_hz1", "魏军骑兵", 36, 4, 86, 11, 33, 24, "cavalry", "ping"),
      G("e_hz2", "魏军骑兵", 40, 6, 84, 11, 32, 24, "cavalry", "shan"),
      G("e_hz3", "夏侯部曲", 28, 6, 94, 11, 33, 30, "infantry", "ping"),
      G("e_hz4", "魏武强弩", 22, 6, 76, 10, 28, 38, "archer", "ping"),
      G("e_hz5", "长安精兵", 10, 8, 102, 11, 32, 28, "infantry", "shan"),
      G("e_hz6", "魏军参军", 6, 6, 108, 11, 30, 40, "archer", "ping"),
      G("e_hz7", "辎重护卫", 34, 8, 88, 10, 29, 26, "infantry", "ping"),
      G("e_hz8", "斜谷援军", 42, 8, 92, 11, 31, 28, "cavalry", "ping"),
      G("e_hz9", "定军斥候", 12, 10, 72, 10, 27, 32, "archer", "ping"),
      G("e_hz10", "汉中垒壁", 16, 12, 96, 11, 30, 26, "infantry", "shan"),
    ],
  },
  lb_jing_front: {
    title: "荆州北伐锋",
    w: 42,
    h: 24,
    terrain: "fan",
    openingLog:
      "汉中既定，关羽威镇荆州，北伐襄樊；曹仁固守，徐晃张郃陆续来援，汉水两岸战云密布。",
    scenarioBrief: "河道与岸炮相持，水军与弓弩为核心；宜断浮桥、分击两岸。",
    victoryBrief: "魏军外援迟滞，为樊城大战蓄势。",
    winCondition: { type: "eliminate_all" } as WinCondition,
    allyExtras: ["guan_xing", "zhang_baof", "zhou_cang"],
    enemies: [
      U("zhang_he", "e_zh_jf", 20, 4),
      U("xu_huang", "e_xh_jf", 30, 6),
      G("e_jf1", "樊城弩台", 14, 8, 78, 10, 28, 36, "archer", "ping"),
      G("e_jf2", "汉水斥候", 34, 8, 74, 10, 27, 30, "cavalry", "ping"),
      G("e_jf3", "七军前哨", 26, 10, 86, 11, 30, 28, "infantry", "shui"),
    ],
  },
  ch9_xiangfan: {
    title: "第九章 · 汉水樊城",
    w: 44,
    h: 24,
    terrain: "fan",
    openingLog:
      "关羽北伐威震华夏，曹仁固守樊城，于禁督七军来援；汉水暴涨，正是水战与岸炮相持之地。",
    scenarioBrief:
      "河道纵贯中央，水军与弓兵可封浅滩。曹仁、于禁、徐晃、张郃、许褚分督诸部，宜先断其两翼再逼中军。",
    victoryBrief: "七军溃散，樊城外援断绝（本关以全歼敌军为胜）。",
    winCondition: { type: "eliminate_all" } as WinCondition,
    maxBattleRounds: 95,
    allyExtras: ["guan_xing", "zhang_baof", "ma_liang"],
    enemies: [
      U("cao_ren", "e_cao_ren_xf", 20, 4),
      U("yu_jin", "e_yu_jin_xf", 28, 6),
      U("xu_huang", "e_xu_huang_xf", 14, 4),
      U("zhang_he", "e_zhang_he_xf", 10, 6),
      U("xu_chu", "e_xu_chu_xf", 34, 4),
      G("e_xf1", "七军舟师", 24, 8, 88, 10, 30, 28, "infantry", "shui"),
      G("e_xf2", "樊城弩台", 16, 8, 76, 10, 27, 36, "archer", "ping"),
      G("e_xf3", "魏武强弩", 6, 6, 80, 10, 28, 34, "archer", "ping"),
      G("e_xf4", "汉水斥候", 36, 8, 72, 9, 26, 30, "cavalry", "ping"),
      G("e_xf5", "曹军别部", 30, 10, 96, 11, 31, 28, "infantry", "shan"),
      G("e_xf6", "辎重营卒", 12, 10, 84, 10, 26, 24, "infantry", "ping"),
    ],
  },
  lb_fancheng_wave: {
    title: "樊城水威",
    w: 44,
    h: 24,
    terrain: "fan",
    openingLog:
      "汉水骤涨，于禁七军为波所吞；曹仁孤城岌岌，徐晃长驱来救，关羽军与魏援于岸滩再决雌雄。",
    scenarioBrief: "浅滩与岸炮交错，弓兵封水门可遏魏援；敌军步兵厚实。",
    victoryBrief: "魏援再挫，威震华夏之势达于顶点。",
    winCondition: { type: "eliminate_marked_enemies", unitIds: ["e_xu_huang_fw"] } as WinCondition,
    extraLog: ["胜利条件：击破徐晃救樊前锋。"],
    allyExtras: ["guan_xing", "zhang_baof", "liao_hua"],
    enemies: [
      U("xu_huang", "e_xu_huang_fw", 22, 4),
      U("cao_ren", "e_cao_ren_fw", 30, 6),
      G("e_fw1", "长驱部曲", 16, 8, 90, 11, 31, 28, "infantry", "ping"),
      G("e_fw2", "魏武强弩", 34, 8, 78, 10, 28, 38, "archer", "ping"),
      G("e_fw3", "汉水舟师", 10, 10, 84, 10, 27, 30, "infantry", "shui"),
    ],
  },
  lb_maicheng: {
    title: "麦城悲歌",
    w: 40,
    h: 22,
    terrain: "forest",
    openingLog:
      "荆州已失，关羽败走麦城；刘备远在蜀中，遣赵云等星夜来援，欲于重围中撕开一线生机。",
    scenarioBrief: "密林狭道，东吴追兵与伏弩层层；敌军以吕蒙、朱然所部为锋（演义向）。",
    victoryBrief: "吴军追势顿挫（史实虽悲，本关以战术突围为胜）。",
    winCondition: { type: "eliminate_marked_enemies", unitIds: ["e_lu_meng_mc"] } as WinCondition,
    extraLog: ["胜利条件：击破吕蒙中军，挫其追势。"],
    allyExtras: ["zhao_yun", "liao_hua", "ma_liang"],
    enemies: [
      U("lu_meng", "e_lu_meng_mc", 20, 4),
      U("gan_ning", "e_gan_ning_mc", 28, 6),
      U("zhu_ran", "e_zhuran_mc", 26, 6),
      G("e_mc1", "吴军强弩", 14, 8, 76, 11, 28, 38, "archer", "ping"),
      G("e_mc2", "麦城伏兵", 32, 8, 88, 11, 30, 28, "infantry", "shan"),
      G("e_mc3", "江岸死士", 10, 10, 92, 11, 31, 26, "infantry", "shui"),
    ],
  },
  ch10_yiling: {
    title: "第十章 · 夷陵复仇",
    w: 44,
    h: 28,
    terrain: "yiling",
    openingLog:
      "关羽既殁，刘备倾国东征；陆逊坚守夷陵，火攻连营之势已成，此战关乎国运与军心。",
    scenarioBrief:
      "岸滩与林带交错，弓兵与步兵可层层设防。敌军以陆逊为核心，甘宁、凌统等骁将侧翼游弋，不可冒进。",
    victoryBrief: "吴军全灭，东征军夺还战场主动（演义向：以全歼敌军为胜）。",
    winCondition: { type: "eliminate_marked_enemies", unitIds: ["e_lu_xun_yi"] } as WinCondition,
    extraLog: ["胜利条件：击破吴军大都督陆逊本阵（余众可溃）。"],
    maxBattleRounds: 100,
    allyExtras: ["zhao_yun", "zhang_baof", "wu_ban"],
    enemies: [
      U("lu_xun", "e_lu_xun_yi", 32, 6),
      U("lu_meng", "e_lu_meng_yi", 24, 8),
      U("gan_ning", "e_gan_ning_yi", 36, 8),
      U("ling_tong", "e_ling_tong_yi", 28, 10),
      U("sun_quan", "e_sun_quan_yi", 16, 4),
      G("e_yi1", "江东水军", 40, 12, 82, 11, 29, 32, "infantry", "shui"),
      G("e_yi2", "吴军强弩", 20, 10, 76, 11, 28, 38, "archer", "shui"),
      G("e_yi3", "夷陵刀盾", 12, 12, 92, 12, 31, 28, "infantry", "ping"),
      G("e_yi4", "江岸弓骑", 8, 8, 78, 11, 27, 30, "cavalry", "ping"),
      G("e_yi5", "连营斥候", 38, 10, 70, 10, 26, 32, "archer", "shan"),
      G("e_yi6", "吴军司马", 14, 14, 100, 12, 30, 36, "infantry", "shan"),
    ],
  },
  lb_xiaoting: {
    title: "猇亭余烈",
    w: 42,
    h: 26,
    terrain: "yiling",
    openingLog:
      "夷陵大败后，吴军乘胜追蹑；赵云断后，诸葛亮遣马岱接应，于猇亭外再遏追锋，保全主力。",
    scenarioBrief: "岸滩火迹未冷，林带仍有伏弩；宜以弓步层层迟滞，勿与吴水军深缠。",
    victoryBrief: "追兵遏止，蜀汉元气得续。",
    winCondition: { type: "eliminate_all" } as WinCondition,
    allyExtras: ["zhao_yun", "chen_dao", "dong_yun"],
    enemies: [
      U("gan_ning", "e_gn_xt", 24, 4),
      U("ling_tong", "e_lt_xt", 30, 6),
      G("e_xt1", "江东强弩", 18, 8, 78, 11, 28, 38, "archer", "shui"),
      G("e_xt2", "猇亭追骑", 34, 8, 82, 11, 30, 26, "cavalry", "ping"),
      G("e_xt3", "吴军司马", 12, 10, 96, 12, 30, 34, "infantry", "shan"),
    ],
  },
  ch11_qishan: {
    title: "第十一章 · 祁山北伐",
    w: 48,
    h: 28,
    terrain: "qishan",
    openingLog:
      "诸葛亮再上祁山，司马懿深沟高垒；姜维、费祎等分掌军政，正是锐气可用之时。（秉承昭烈帝遗志，兴复汉室。）",
    scenarioBrief:
      "沙地与浅溪分割战场，骑兵与弓弩齐备。司马懿与张郃、徐晃诸部互为掎角，宜分兵牵制、寻机破其中军。",
    victoryBrief: "魏军全灭，祁山前哨得定（本关以全歼敌军为胜）。",
    winCondition: { type: "eliminate_all" } as WinCondition,
    maxBattleRounds: 105,
    northernTeam: ["zhuge_liang", "jiang_wei", "wei_yan", "ma_su", "wang_ping", "fei_yi"],
    allyExtras: [],
    enemies: [
      U("si_ma_yi", "e_si_ma_yi_qs", 16, 4),
      U("zhang_he", "e_zhang_he_qs", 28, 4),
      U("xu_huang", "e_xu_huang_qs", 22, 6),
      U("dian_wei", "e_dian_wei_qs", 12, 6),
      U("cao_ren", "e_cao_ren_qs", 36, 4),
      G("e_qs1", "魏军铁骑", 40, 6, 90, 12, 32, 24, "cavalry", "ping"),
      G("e_qs2", "祁山弩阵", 32, 8, 78, 12, 28, 40, "archer", "ping"),
      G("e_qs3", "陇右甲士", 24, 10, 102, 13, 32, 30, "infantry", "shan"),
      G("e_qs4", "魏军参军", 8, 8, 88, 12, 30, 34, "archer", "ping"),
      G("e_qs5", "斜谷辎重", 42, 10, 86, 12, 29, 26, "infantry", "ping"),
      G("e_qs6", "长安精骑", 6, 6, 94, 12, 31, 28, "cavalry", "ping"),
      G("e_qs7", "寨栅守卒", 18, 12, 96, 13, 30, 28, "infantry", "shan"),
    ],
  },
} satisfies Record<ScenarioId, LiuBeiScenarioBody>;

export function getLiuBeiScenarioBody(id: ScenarioId): LiuBeiScenarioBody {
  return CAMPAIGN[id];
}
