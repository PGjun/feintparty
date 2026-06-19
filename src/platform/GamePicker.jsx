import { PlatformLogo } from './components/PlatformLogo.jsx';

export function GamePicker({ games, onSelect }) {
  return (
    <div className="entry">
      <PlatformLogo />
      <p className="entry-desc">친구와 함께 즐기는 멀티플레이 게임</p>
      <div className="game-picker">
        {games.map((game) => (
          <button
            key={game.id}
            type="button"
            className="game-card"
            onClick={() => onSelect(game.id)}
          >
            <span className="game-card-emoji">{game.emoji}</span>
            <span className="game-card-name">{game.name}</span>
            <span className="game-card-desc">{game.description}</span>
            <span className="game-card-meta">2~{game.maxPlayers}명</span>
          </button>
        ))}
      </div>
    </div>
  );
}
