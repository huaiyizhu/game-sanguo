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
  confirmPickTarget,
  createInitialBattle,
  ensureBattleFields,
  escapeOrRevertUnit,
  gridCellClick,
  isValidSave,
  menuMeleeAttack,
  menuTactic,
  pickTargetFocusEnemy,
  pickTargetNavigate,
  selectPlayerUnit,
  skipOrEndIfStuck,
  waitAfterMove,
} from "../game/battle";
import type { BattleState } from "../game/types";
import { LOCAL_SAVES_KEY } from "../game/types";
import GameBattle, { type MenuAction } from "./GameBattle";

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
  const bumpVisualEpoch = useCallback(() => setVisualEpoch((n) => n + 1), []);

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
      if (action === "tactic") return menuTactic(s);
      return waitAfterMove(s);
    });
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
      if (s.phase === "move") return skipOrEndIfStuck(s);
      if (s.phase === "menu") return waitAfterMove(s);
      return s;
    });
  }, []);

  const onNewGame = useCallback(() => {
    setBattle(createInitialBattle());
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

  return (
    <div className="page game-layout">
      <aside className="game-sidebar">
        <Link to="/" className="back-link">
          ← 返回首页
        </Link>
        <h2>战局</h2>
        <p className="scenario-title">{battle.scenarioTitle}</p>
        <p className="status">{statusLine}</p>
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
        <hr className="divider" />
        <h3>存档槽名称</h3>
        <input
          className="slot-input"
          value={slotName}
          onChange={(e) => setSlotName(e.target.value)}
          placeholder="例如：存档1"
          maxLength={64}
        />
        <div className="save-row">
          <button type="button" className="btn primary" onClick={saveLocal}>
            保存到本地
          </button>
          <button type="button" className="btn" onClick={saveRemote} disabled={!user}>
            保存到云端
          </button>
        </div>
        {!user && <p className="hint small">登录后可使用云端存档</p>}
        <h3>本地存档</h3>
        <ul className="save-list">
          {localList.length === 0 && <li className="muted">暂无</li>}
          {localList.map((e) => (
            <li key={e.slotName}>
              <button type="button" className="linkish" onClick={() => loadLocal(e)}>
                {e.slotName}
              </button>
              <span className="muted small">{e.updatedAt.slice(0, 19).replace("T", " ")}</span>
              <button type="button" className="btn tiny danger" onClick={() => removeLocal(e.slotName)}>
                删
              </button>
            </li>
          ))}
        </ul>
        <h3>云端存档 {remoteLoading && <span className="muted">加载中…</span>}</h3>
        <ul className="save-list">
          {!token && <li className="muted">未登录</li>}
          {token && remoteList.length === 0 && !remoteLoading && <li className="muted">暂无</li>}
          {remoteList.map((r) => (
            <li key={r.id}>
              <button type="button" className="linkish" onClick={() => void loadRemote(r)}>
                {r.slotName}
              </button>
              <span className="muted small">{r.updatedAt.replace(" ", " ").slice(0, 19)}</span>
              <button type="button" className="btn tiny danger" onClick={() => void removeRemote(r.slotName)}>
                删
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <main className="game-main">
        <GameBattle
          battle={battle}
          visualEpoch={visualEpoch}
          onCellClick={onCellClick}
          onUnitClick={onUnitClick}
          onMenuAction={onMenuAction}
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
