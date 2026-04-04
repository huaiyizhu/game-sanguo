import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  apiDeleteSave,
  apiListSaves,
  apiPutSave,
  type ServerSaveRow,
} from "../api";
import {
  cancelPickTarget,
  cancelTacticMenu,
  confirmPickTarget,
  createInitialBattle,
  ensureBattleFields,
  escapeOrRevertUnit,
  gridCellClick,
  isValidSave,
  menuMeleeAttack,
  menuOpenTacticMenu,
  pickTargetFocusEnemy,
  pickTargetNavigate,
  processSingleEnemyStep,
  selectPlayerUnit,
  skipOrEndIfStuck,
  tacticMenuChoose,
  waitAfterMove,
} from "../game/battle";
import type { BattleState, Terrain } from "../game/types";
import { ARMY_TYPE_LABEL, TERRAIN_LABEL, type TacticKind } from "../game/types";

const TERRAIN_LEGEND: { id: Terrain; ch: string }[] = [
  { id: "plain", ch: "陆" },
  { id: "forest", ch: "林" },
  { id: "water", ch: "水" },
  { id: "mountain", ch: "山" },
  { id: "desert", ch: "沙" },
];
import { LOCAL_SAVES_KEY } from "../game/types";
import GameBattle, { type MenuAction } from "./GameBattle";

/** 敌军每名单位行动之间的间隔（毫秒）；队列中第一名立即行动 */
const ENEMY_ACTION_GAP_MS = 2000;

function normalizeLoadedBattle(b: BattleState): BattleState {
  let s = ensureBattleFields(b);
  if ((s.phase as string) === "act") s = { ...s, phase: "menu" };
  return s;
}

type LocalSaveEntry = { slotName: string; updatedAt: string; payload: BattleState };

function readLocalSaves(): LocalSaveEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_SAVES_KEY);
    if (!raw) return [];
    const o = JSON.parse(raw) as Record<string, { updatedAt: string; payload: unknown }>;
    return Object.entries(o)
      .map(([slotName, v]) => {
        if (!v?.payload || !isValidSave(v.payload)) return null;
        return {
          slotName,
          updatedAt: v.updatedAt || "",
          payload: normalizeLoadedBattle(v.payload as BattleState),
        };
      })
      .filter((x): x is LocalSaveEntry => x !== null)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  } catch {
    return [];
  }
}

function writeLocalSave(slotName: string, payload: BattleState) {
  const raw = localStorage.getItem(LOCAL_SAVES_KEY);
  let o: Record<string, { updatedAt: string; payload: BattleState }> = {};
  if (raw) {
    try {
      o = JSON.parse(raw);
    } catch {
      o = {};
    }
  }
  o[slotName] = { updatedAt: new Date().toISOString(), payload };
  localStorage.setItem(LOCAL_SAVES_KEY, JSON.stringify(o));
}

function deleteLocalSave(slotName: string) {
  const raw = localStorage.getItem(LOCAL_SAVES_KEY);
  if (!raw) return;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    delete o[slotName];
    localStorage.setItem(LOCAL_SAVES_KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

export default function GamePage() {
  const { user, token } = useAuth();
  const [battle, setBattle] = useState<BattleState>(() => createInitialBattle());
  const [slotName, setSlotName] = useState("存档1");
  const [message, setMessage] = useState<string | null>(null);
  const [localList, setLocalList] = useState<LocalSaveEntry[]>(() => readLocalSaves());
  const [remoteList, setRemoteList] = useState<ServerSaveRow[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [visualEpoch, setVisualEpoch] = useState(0);
  const [inspectUnitId, setInspectUnitId] = useState<string | null>(null);
  const [metaSidebarCollapsed, setMetaSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sanguo_meta_sidebar_collapsed") === "1";
    } catch {
      return false;
    }
  });
  const bumpVisualEpoch = useCallback(() => setVisualEpoch((n) => n + 1), []);

  const setMetaCollapsed = useCallback((collapsed: boolean) => {
    setMetaSidebarCollapsed(collapsed);
    try {
      localStorage.setItem("sanguo_meta_sidebar_collapsed", collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const refreshLocal = useCallback(() => setLocalList(readLocalSaves()), []);

  const refreshRemote = useCallback(async () => {
    if (!token) {
      setRemoteList([]);
      return;
    }
    setRemoteLoading(true);
    try {
      const { saves } = await apiListSaves(token);
      setRemoteList(saves);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "无法加载云端存档");
    } finally {
      setRemoteLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refreshRemote();
  }, [refreshRemote]);

  useEffect(() => {
    if (battle.outcome !== "playing") return;
    if (battle.turn !== "enemy" || battle.phase !== "enemy") return;
    const q = battle.enemyTurnQueue;
    if (!q?.length) return;
    const c = battle.enemyTurnCursor;
    if (c >= q.length) return;

    const delay = c === 0 ? 0 : ENEMY_ACTION_GAP_MS;
    const tid = window.setTimeout(() => {
      setBattle((s) => processSingleEnemyStep(s));
    }, delay);

    return () => window.clearTimeout(tid);
  }, [
    battle.outcome,
    battle.turn,
    battle.phase,
    battle.enemyTurnCursor,
    battle.enemyTurnQueue?.join(","),
  ]);

  const onCellClick = useCallback((x: number, y: number) => {
    setBattle((s) => {
      if (s.phase === "pick-target" && s.pickTarget) {
        const u = s.units.find(
          (unit) =>
            unit.x === x && unit.y === y && unit.hp > 0 && unit.side === "enemy"
        );
        if (u && s.pickTarget.targetIds.includes(u.id)) return confirmPickTarget(s, u.id);
      }
      return gridCellClick(s, x, y);
    });
  }, []);

  const onUnitClick = useCallback((unitId: string, side: "player" | "enemy") => {
    setInspectUnitId(unitId);
    setBattle((s) => {
      if (side === "player") return selectPlayerUnit(s, unitId);
      if (s.phase === "pick-target" && s.pickTarget?.targetIds.includes(unitId)) {
        return confirmPickTarget(s, unitId);
      }
      return s;
    });
  }, []);

  const onMenuAction = useCallback((action: MenuAction) => {
    setBattle((s) => {
      if (action === "attack") return menuMeleeAttack(s);
      if (action === "tactic") return menuOpenTacticMenu(s);
      return waitAfterMove(s);
    });
  }, []);

  const onTacticPick = useCallback((kind: TacticKind) => {
    setBattle((s) => tacticMenuChoose(s, kind));
  }, []);

  const onEscapeOrRevert = useCallback(() => {
    setBattle((s) => escapeOrRevertUnit(s));
  }, []);

  const onPickNavigate = useCallback((delta: number) => {
    setBattle((s) => pickTargetNavigate(s, delta));
  }, []);

  const onPickConfirmFocused = useCallback(() => {
    setBattle((s) => {
      const p = s.pickTarget;
      if (!p || s.phase !== "pick-target") return s;
      const id = p.targetIds[p.focusIndex];
      return confirmPickTarget(s, id);
    });
  }, []);

  const onPickHoverEnemy = useCallback((enemyId: string) => {
    setBattle((s) => pickTargetFocusEnemy(s, enemyId));
  }, []);

  const onWait = useCallback(() => {
    setBattle((s) => {
      if (s.phase === "pick-target") return cancelPickTarget(s);
      if (s.phase === "tactic-menu") return cancelTacticMenu(s);
      if (s.phase === "move") return skipOrEndIfStuck(s);
      if (s.phase === "menu") return waitAfterMove(s);
      return s;
    });
  }, []);

  const onNewGame = useCallback(() => {
    setBattle(createInitialBattle());
    setInspectUnitId(null);
    setMessage(null);
    bumpVisualEpoch();
  }, [bumpVisualEpoch]);

  const saveLocal = useCallback(() => {
    const name = slotName.trim() || "存档1";
    writeLocalSave(name, battle);
    refreshLocal();
    setMessage(`已保存到本地：${name}`);
  }, [battle, slotName, refreshLocal]);

  const saveRemote = useCallback(async () => {
    if (!token) {
      setMessage("请先登录后再保存到服务器");
      return;
    }
    const name = slotName.trim() || "存档1";
    try {
      await apiPutSave(token, name, battle);
      setMessage(`已同步到云端：${name}`);
      await refreshRemote();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "云端保存失败");
    }
  }, [token, slotName, battle, refreshRemote]);

  const loadLocal = useCallback(
    (entry: LocalSaveEntry) => {
      setBattle(entry.payload);
      setSlotName(entry.slotName);
      setMessage(`已读取本地：${entry.slotName}`);
      bumpVisualEpoch();
    },
    [bumpVisualEpoch]
  );

  const loadRemote = useCallback(
    async (row: ServerSaveRow) => {
      if (!isValidSave(row.payload)) {
        setMessage("云端存档格式无效");
        return;
      }
      setBattle(normalizeLoadedBattle(row.payload as BattleState));
      setSlotName(row.slotName);
      setMessage(`已读取云端：${row.slotName}`);
      bumpVisualEpoch();
    },
    [bumpVisualEpoch]
  );

  const removeLocal = useCallback(
    (name: string) => {
      deleteLocalSave(name);
      refreshLocal();
      setMessage(`已删除本地：${name}`);
    },
    [refreshLocal]
  );

  const removeRemote = useCallback(
    async (name: string) => {
      if (!token) return;
      try {
        await apiDeleteSave(token, name);
        await refreshRemote();
        setMessage(`已删除云端：${name}`);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "删除失败");
      }
    },
    [token, refreshRemote]
  );

  const statusLine = useMemo(() => {
    if (battle.outcome === "won") return "战斗胜利";
    if (battle.outcome === "lost") return "战斗失败";
    return battle.turn === "player" ? "我军回合" : "敌军行动中…";
  }, [battle.outcome, battle.turn]);

  const inspectedUnit = useMemo(() => {
    if (!inspectUnitId) return null;
    return battle.units.find((u) => u.id === inspectUnitId && u.hp > 0) ?? null;
  }, [battle.units, inspectUnitId]);

  const inspectedTerrain = useMemo(() => {
    if (!inspectedUnit) return null;
    const row = battle.terrain[inspectedUnit.y];
    const t = row?.[inspectedUnit.x];
    return t ? TERRAIN_LABEL[t] : null;
  }, [battle.terrain, inspectedUnit]);

  return (
    <div className="page game-layout">
      <div className="game-left-stack">
        <aside className="unit-inspect" aria-label="武将信息">
          <h3>武将信息</h3>
          {!inspectedUnit && (
            <p className="muted small">点击场上武将查看兵力、武力、智力与计策值。</p>
          )}
          {inspectedUnit && (
            <dl className="unit-inspect-dl">
              <dt>姓名</dt>
              <dd>{inspectedUnit.name}</dd>
              <dt>阵营</dt>
              <dd>{inspectedUnit.side === "player" ? "我军" : "敌军"}</dd>
              <dt>兵力</dt>
              <dd>
                {inspectedUnit.hp} / {inspectedUnit.maxHp}
              </dd>
              <dt>兵种</dt>
              <dd>{ARMY_TYPE_LABEL[inspectedUnit.armyType]}</dd>
              <dt>武力</dt>
              <dd>{inspectedUnit.might}</dd>
              <dt>智力</dt>
              <dd>{inspectedUnit.intel}</dd>
              {inspectedUnit.side === "player" && (
                <>
                  <dt>计策值</dt>
                  <dd>
                    {inspectedUnit.tacticPoints} / {inspectedUnit.tacticMax}
                  </dd>
                </>
              )}
              {inspectedTerrain && (
                <>
                  <dt>脚下地形</dt>
                  <dd>{inspectedTerrain}</dd>
                </>
              )}
            </dl>
          )}
          <div className="terrain-legend">
            <p className="terrain-legend-title">战场地形</p>
            <div className="terrain-legend-row">
              {TERRAIN_LEGEND.map(({ id, ch }) => (
                <span key={id} className="terrain-legend-item">
                  <span
                    className={`terrain-legend-swatch ${id}`}
                    title={TERRAIN_LABEL[id]}
                    aria-hidden
                  >
                    {ch}
                  </span>
                  <span>{TERRAIN_LABEL[id]}</span>
                </span>
              ))}
            </div>
          </div>
        </aside>

        {metaSidebarCollapsed ? (
          <button
            type="button"
            className="sidebar-expand-bar"
            onClick={() => setMetaCollapsed(false)}
          >
            展开战局与存档
          </button>
        ) : (
          <aside className="game-meta-sidebar" aria-label="战局与存档">
            <div className="meta-sidebar-header">
              <Link to="/" className="back-link">
                ← 返回首页
              </Link>
              <button
                type="button"
                className="btn-collapse-sidebar"
                onClick={() => setMetaCollapsed(true)}
                title="收起侧栏，腾出空间"
              >
                收起
              </button>
            </div>
            <p className="meta-compact-line">
              <strong>{battle.scenarioTitle}</strong>
              <br />
              <span className="status-inline">{statusLine}</span>
            </p>
            {message && <p className="toast-msg">{message}</p>}
            <div className="sidebar-actions">
              <button type="button" className="btn" onClick={onNewGame}>
                新游戏
              </button>
              <button
                type="button"
                className="btn"
                onClick={onWait}
                disabled={
                  battle.outcome !== "playing" ||
                  battle.turn !== "player" ||
                  !battle.selectedId ||
                  battle.phase === "enemy"
                }
              >
                待机
              </button>
            </div>

            <details className="save-details" open>
              <summary>存档</summary>
              <div className="meta-slot-row">
                <input
                  className="slot-input"
                  value={slotName}
                  onChange={(e) => setSlotName(e.target.value)}
                  placeholder="存档槽名称"
                  maxLength={64}
                />
                <div className="meta-save-buttons">
                  <button type="button" className="btn primary" onClick={saveLocal}>
                    存本地
                  </button>
                  <button type="button" className="btn" onClick={saveRemote} disabled={!user}>
                    存云端
                  </button>
                </div>
                {!user && <p className="hint small">登录后可云端存档</p>}
              </div>
            </details>

            <details className="save-details" open>
              <summary>本地列表 ({localList.length})</summary>
              <ul className="save-list save-list--compact">
                {localList.length === 0 && <li className="muted">暂无</li>}
                {localList.map((e) => (
                  <li key={e.slotName}>
                    <button type="button" className="linkish" onClick={() => loadLocal(e)}>
                      {e.slotName}
                    </button>
                    <button
                      type="button"
                      className="btn tiny danger"
                      onClick={() => removeLocal(e.slotName)}
                    >
                      删
                    </button>
                  </li>
                ))}
              </ul>
            </details>

            <details className="save-details" open>
              <summary>
                云端列表 {remoteLoading && <span className="muted">…</span>}
              </summary>
              <ul className="save-list save-list--compact">
                {!token && <li className="muted">未登录</li>}
                {token && remoteList.length === 0 && !remoteLoading && <li className="muted">暂无</li>}
                {remoteList.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="linkish" onClick={() => void loadRemote(r)}>
                      {r.slotName}
                    </button>
                    <button
                      type="button"
                      className="btn tiny danger"
                      onClick={() => void removeRemote(r.slotName)}
                    >
                      删
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          </aside>
        )}
      </div>

      <main className="game-main">
        <GameBattle
          battle={battle}
          visualEpoch={visualEpoch}
          onCellClick={onCellClick}
          onUnitClick={onUnitClick}
          onMenuAction={onMenuAction}
          onTacticPick={onTacticPick}
          onEscapeOrRevert={onEscapeOrRevert}
          onPickNavigate={onPickNavigate}
          onPickConfirmFocused={onPickConfirmFocused}
          onPickHoverEnemy={onPickHoverEnemy}
        />
        <div className="battle-log">
          <h3>战报</h3>
          <ol reversed>
            {battle.log
              .slice()
              .reverse()
              .slice(0, 12)
              .map((line, i) => (
                <li key={i}>{line}</li>
              ))}
          </ol>
        </div>
      </main>
    </div>
  );
}
