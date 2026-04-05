import { useNavigate } from "react-router-dom";
import "./game-intro.css";

export default function GameIntro() {
  const navigate = useNavigate();

  const goGame = () => navigate("/game");

  return (
    <div className="game-intro">
      <div className="game-intro__scroll" role="article" aria-label="序章">
        <div className="game-intro__roller game-intro__roller--top" aria-hidden />
        <div className="game-intro__paper-outer">
          <div className="game-intro__paper">
            <p className="game-intro__text">
              <strong>东汉末年，民不聊生。</strong>
              天灾频仍，苛役繁重，黎庶流离，易子而食者有之。朝廷威令不行，豪强并起，人心思变。
              <br />
              <br />
              黄巾一呼，天下响应；董卓入洛，社稷崩裂。诸侯各拥甲兵，或奉天子以令不臣，或割据称雄，彼此征伐无休。
              <strong>烽火连天，城郭为墟；苍生倒悬，只在一念。</strong>
              <br />
              <br />
              曹操挟势于北，刘备辗转于野，孙权守江于东，诸葛亮、周瑜、司马懿辈各尽其智——
              智谋与勇力交织，忠义与权变角力，终成魏、蜀、吴三分之局。
              <br />
              <br />
              今君入局，非为隔岸观火，乃执棋于这乱世沙盘之上：
              <strong>调兵遣将，步步为营</strong>，于刀光与韬略之间争一线生机，图一分版图。
              青史一页，待君亲书。
            </p>
          </div>
        </div>
        <div className="game-intro__roller game-intro__roller--bot" aria-hidden />
      </div>

      <div className="game-intro__actions">
        <button type="button" className="game-intro__start" onClick={goGame}>
          开始征战
        </button>
        <button type="button" className="game-intro__skip" onClick={goGame}>
          跳过序章
        </button>
      </div>
    </div>
  );
}
