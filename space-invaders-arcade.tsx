/**
 * @stele-manifest
 * name: Space Invaders
 * description: Classic arcade shooter — keyboard controls, five rows of aliens, UFO bonuses. Self-contained.
 * archetype: self-contained
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const GAME_WIDTH = 600;
const GAME_HEIGHT = 500;
const PLAYER_WIDTH = 40;
const PLAYER_HEIGHT = 20;
const ALIEN_WIDTH = 30;
const ALIEN_HEIGHT = 20;
const ALIEN_ROWS = 5;
const ALIEN_COLS = 11;
const ALIEN_H_GAP = 15;
const ALIEN_V_GAP = 12;
const BULLET_WIDTH = 3;
const BULLET_HEIGHT = 10;
const UFO_WIDTH = 40;
const UFO_HEIGHT = 16;

const ALIEN_SPRITES = ['👾', '👽', '👻', '💀', '🛸'];

export default function SpaceInvaders() {
  const [gameState, setGameState] = useState('start');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  
  const [player, setPlayer] = useState({ x: GAME_WIDTH / 2 - PLAYER_WIDTH / 2 });
  const [playerBullets, setPlayerBullets] = useState([]);
  const [alienBullets, setAlienBullets] = useState([]);
  const [aliens, setAliens] = useState([]);
  const [alienDir, setAlienDir] = useState(1);
  const [shields, setShields] = useState([]);
  const [ufo, setUfo] = useState(null);
  
  const keysRef = useRef({});
  const lastShotRef = useRef(0);
  const alienMoveTimerRef = useRef(0);
  const gameLoopRef = useRef(null);

  // Submit score to Arcade when game ends
  useEffect(() => {
    if (gameState === 'gameover' && window.Arcade) {
      window.Arcade.submitScore(score);
    }
  }, [gameState, score]);

  const initAliens = useCallback(() => {
    const newAliens = [];
    const startX = 50;
    const startY = 60;
    for (let row = 0; row < ALIEN_ROWS; row++) {
      for (let col = 0; col < ALIEN_COLS; col++) {
        newAliens.push({
          id: `${row}-${col}`,
          x: startX + col * (ALIEN_WIDTH + ALIEN_H_GAP),
          y: startY + row * (ALIEN_HEIGHT + ALIEN_V_GAP),
          row,
          alive: true,
          points: (ALIEN_ROWS - row) * 10
        });
      }
    }
    return newAliens;
  }, []);

  const initShields = useCallback(() => {
    const shieldPositions = [75, 187, 337, 465];
    return shieldPositions.map((x, i) => ({
      id: i,
      x,
      y: GAME_HEIGHT - 100,
      pixels: Array(8).fill().map(() => Array(12).fill(true))
    }));
  }, []);

  const startGame = useCallback(() => {
    setGameState('playing');
    setScore(0);
    setLives(3);
    setLevel(1);
    setPlayer({ x: GAME_WIDTH / 2 - PLAYER_WIDTH / 2 });
    setPlayerBullets([]);
    setAlienBullets([]);
    setAliens(initAliens());
    setAlienDir(1);
    setShields(initShields());
    setUfo(null);
    alienMoveTimerRef.current = 0;
  }, [initAliens, initShields]);

  const nextLevel = useCallback(() => {
    setLevel(l => l + 1);
    setAliens(initAliens());
    setAlienDir(1);
    setPlayerBullets([]);
    setAlienBullets([]);
    setUfo(null);
    alienMoveTimerRef.current = 0;
  }, [initAliens]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['a', 'd', 'w', ' ', 'A', 'D', 'W', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        keysRef.current[e.key.toLowerCase()] = true;
      }
    };
    const handleKeyUp = (e) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (gameState !== 'playing') return;

    const gameLoop = () => {
      const now = Date.now();
      
      setPlayer(p => {
        let newX = p.x;
        if (keysRef.current['a'] || keysRef.current['arrowleft']) newX -= 5;
        if (keysRef.current['d'] || keysRef.current['arrowright']) newX += 5;
        newX = Math.max(0, Math.min(GAME_WIDTH - PLAYER_WIDTH, newX));
        return { x: newX };
      });

      if ((keysRef.current['w'] || keysRef.current[' '] || keysRef.current['arrowup']) && now - lastShotRef.current > 300) {
        lastShotRef.current = now;
        setPlayer(p => {
          setPlayerBullets(b => [...b, { id: now, x: p.x + PLAYER_WIDTH / 2 - BULLET_WIDTH / 2, y: GAME_HEIGHT - 50 }]);
          return p;
        });
      }

      setPlayerBullets(bullets => bullets.map(b => ({ ...b, y: b.y - 8 })).filter(b => b.y > -BULLET_HEIGHT));
      setAlienBullets(bullets => bullets.map(b => ({ ...b, y: b.y + 5 })).filter(b => b.y < GAME_HEIGHT));

      setUfo(u => {
        if (!u && Math.random() < 0.002) {
          return { x: -UFO_WIDTH, dir: 1 };
        }
        if (u) {
          const newX = u.x + u.dir * 3;
          if (newX > GAME_WIDTH || newX < -UFO_WIDTH) return null;
          return { ...u, x: newX };
        }
        return null;
      });

      alienMoveTimerRef.current++;
      const moveInterval = Math.max(5, 30 - level * 2);
      
      if (alienMoveTimerRef.current >= moveInterval) {
        alienMoveTimerRef.current = 0;
        
        setAliens(currentAliens => {
          const aliveAliens = currentAliens.filter(a => a.alive);
          if (aliveAliens.length === 0) return currentAliens;

          const minX = Math.min(...aliveAliens.map(a => a.x));
          const maxX = Math.max(...aliveAliens.map(a => a.x));
          
          let newDir = alienDir;
          let dropDown = false;
          
          if (maxX + ALIEN_WIDTH >= GAME_WIDTH - 10 && alienDir === 1) {
            newDir = -1;
            dropDown = true;
          } else if (minX <= 10 && alienDir === -1) {
            newDir = 1;
            dropDown = true;
          }
          
          setAlienDir(newDir);
          
          return currentAliens.map(a => ({
            ...a,
            x: a.x + (dropDown ? 0 : alienDir * 10),
            y: a.y + (dropDown ? 15 : 0)
          }));
        });

        setAliens(currentAliens => {
          const aliveAliens = currentAliens.filter(a => a.alive);
          if (aliveAliens.length > 0 && Math.random() < 0.3) {
            const shooter = aliveAliens[Math.floor(Math.random() * aliveAliens.length)];
            setAlienBullets(b => [...b, { id: Date.now(), x: shooter.x + ALIEN_WIDTH / 2, y: shooter.y + ALIEN_HEIGHT }]);
          }
          return currentAliens;
        });
      }
    };

    gameLoopRef.current = setInterval(gameLoop, 1000 / 60);
    return () => clearInterval(gameLoopRef.current);
  }, [gameState, alienDir, level]);

  useEffect(() => {
    if (gameState !== 'playing') return;

    setPlayerBullets(bullets => {
      let remainingBullets = [...bullets];
      
      setAliens(currentAliens => {
        return currentAliens.map(alien => {
          if (!alien.alive) return alien;
          
          const hitBullet = remainingBullets.find(b =>
            b.x < alien.x + ALIEN_WIDTH &&
            b.x + BULLET_WIDTH > alien.x &&
            b.y < alien.y + ALIEN_HEIGHT &&
            b.y + BULLET_HEIGHT > alien.y
          );
          
          if (hitBullet) {
            remainingBullets = remainingBullets.filter(b => b !== hitBullet);
            setScore(s => s + alien.points);
            return { ...alien, alive: false };
          }
          return alien;
        });
      });
      
      return remainingBullets;
    });

    setPlayerBullets(bullets => {
      if (!ufo) return bullets;
      
      const hitBullet = bullets.find(b =>
        b.x < ufo.x + UFO_WIDTH &&
        b.x + BULLET_WIDTH > ufo.x &&
        b.y < 30 + UFO_HEIGHT &&
        b.y + BULLET_HEIGHT > 30
      );
      
      if (hitBullet) {
        setScore(s => s + 100);
        setUfo(null);
        return bullets.filter(b => b !== hitBullet);
      }
      return bullets;
    });

    setAlienBullets(bullets => {
      const hitBullet = bullets.find(b =>
        b.x < player.x + PLAYER_WIDTH &&
        b.x + BULLET_WIDTH > player.x &&
        b.y < GAME_HEIGHT - 30 &&
        b.y + BULLET_HEIGHT > GAME_HEIGHT - 30 - PLAYER_HEIGHT
      );
      
      if (hitBullet) {
        setLives(l => l - 1);
        return bullets.filter(b => b !== hitBullet);
      }
      return bullets;
    });

    setShields(currentShields => {
      return currentShields.map(shield => {
        let newPixels = shield.pixels.map(row => [...row]);
        
        [...playerBullets, ...alienBullets].forEach(bullet => {
          const relX = bullet.x - shield.x;
          const relY = bullet.y - shield.y;
          const pixelX = Math.floor(relX / 5);
          const pixelY = Math.floor(relY / 5);
          
          if (pixelX >= 0 && pixelX < 12 && pixelY >= 0 && pixelY < 8) {
            if (newPixels[pixelY][pixelX]) {
              newPixels[pixelY][pixelX] = false;
              setPlayerBullets(b => b.filter(pb => pb.id !== bullet.id));
              setAlienBullets(b => b.filter(ab => ab.id !== bullet.id));
            }
          }
        });
        
        return { ...shield, pixels: newPixels };
      });
    });

    const lowestAlien = aliens.filter(a => a.alive).reduce((max, a) => Math.max(max, a.y), 0);
    if (lowestAlien > GAME_HEIGHT - 100) {
      setLives(0);
    }

  }, [playerBullets, alienBullets, aliens, player, ufo, gameState]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    
    if (lives <= 0) {
      setGameState('gameover');
    }
    
    if (aliens.length > 0 && aliens.every(a => !a.alive)) {
      nextLevel();
    }
  }, [lives, aliens, gameState, nextLevel]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-4">
      <div 
        className="relative overflow-hidden rounded-lg border-4 border-green-500 shadow-lg shadow-green-500/30"
        style={{ width: GAME_WIDTH, height: GAME_HEIGHT, background: '#000' }}
      >
        {/* HUD */}
        <div className="absolute top-2 left-3 text-green-400 font-mono text-sm font-bold">
          SCORE: {score}
        </div>
        <div className="absolute top-2 right-3 text-green-400 font-mono text-sm">
          {'❤️'.repeat(lives)}
        </div>
        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-green-400 font-mono text-sm">
          LEVEL {level}
        </div>

        {/* UFO */}
        {ufo && (
          <div 
            className="absolute text-2xl animate-pulse"
            style={{ left: ufo.x, top: 30 }}
          >
            🛸
          </div>
        )}

        {/* Aliens */}
        {aliens.filter(a => a.alive).map(alien => (
          <div 
            key={alien.id}
            className="absolute text-xl transition-all duration-75"
            style={{ left: alien.x, top: alien.y, width: ALIEN_WIDTH, height: ALIEN_HEIGHT }}
          >
            {ALIEN_SPRITES[alien.row]}
          </div>
        ))}

        {/* Shields */}
        {shields.map(shield => (
          <div key={shield.id} className="absolute" style={{ left: shield.x, top: shield.y }}>
            {shield.pixels.map((row, y) => (
              <div key={y} className="flex">
                {row.map((pixel, x) => (
                  <div 
                    key={x}
                    className={pixel ? 'bg-green-500' : 'bg-transparent'}
                    style={{ width: 5, height: 5 }}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}

        {/* Player */}
        <div 
          className="absolute"
          style={{ left: player.x, bottom: 30, width: PLAYER_WIDTH, height: PLAYER_HEIGHT }}
        >
          <div className="w-0 h-0 mx-auto border-l-[20px] border-r-[20px] border-b-[20px] border-l-transparent border-r-transparent border-b-green-400 drop-shadow-lg" />
        </div>

        {/* Player bullets */}
        {playerBullets.map(b => (
          <div 
            key={b.id}
            className="absolute bg-white rounded-full shadow-lg shadow-white/50"
            style={{ left: b.x, top: b.y, width: BULLET_WIDTH, height: BULLET_HEIGHT }}
          />
        ))}

        {/* Alien bullets */}
        {alienBullets.map(b => (
          <div 
            key={b.id}
            className="absolute bg-red-500 rounded-full shadow-lg shadow-red-500/50"
            style={{ left: b.x, top: b.y, width: BULLET_WIDTH, height: BULLET_HEIGHT }}
          />
        ))}

        {/* Start screen */}
        {gameState === 'start' && (
          <div className="absolute inset-0 flex flex-col justify-center items-center bg-black/95 backdrop-blur">
            <h1 className="text-4xl font-bold text-green-400 mb-2 font-mono tracking-wider animate-pulse">
              SPACE INVADERS
            </h1>
            <div className="text-6xl mb-6">👾</div>
            <div className="text-green-300 text-sm mb-1 font-mono">A/D or ←/→ — Move</div>
            <div className="text-green-300 text-sm mb-6 font-mono">W or SPACE — Fire</div>
            <button
              onClick={startGame}
              className="bg-green-500 hover:bg-green-400 text-black font-bold py-3 px-8 rounded-lg font-mono text-lg transition-all hover:scale-105 hover:shadow-lg hover:shadow-green-500/50"
            >
              START GAME
            </button>
          </div>
        )}

        {/* Game over screen */}
        {gameState === 'gameover' && (
          <div className="absolute inset-0 flex flex-col justify-center items-center bg-black/95 backdrop-blur">
            <h2 className="text-4xl font-bold text-red-500 mb-4 font-mono animate-pulse">
              GAME OVER
            </h2>
            <div className="text-green-400 text-2xl mb-2 font-mono">
              FINAL SCORE
            </div>
            <div className="text-5xl font-bold text-green-300 mb-2 font-mono">
              {score}
            </div>
            <div className="text-green-500 text-sm mb-6 font-mono">
              Level reached: {level}
            </div>
            <button
              onClick={startGame}
              className="bg-green-500 hover:bg-green-400 text-black font-bold py-3 px-8 rounded-lg font-mono text-lg transition-all hover:scale-105 hover:shadow-lg hover:shadow-green-500/50"
            >
              PLAY AGAIN
            </button>
          </div>
        )}
      </div>
      
      {/* Controls hint */}
      {gameState === 'playing' && (
        <div className="mt-4 text-green-500/60 text-xs font-mono">
          A/D or ←/→ to move • W or SPACE to fire
        </div>
      )}
    </div>
  );
}
