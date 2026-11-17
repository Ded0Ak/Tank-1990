import { Direction } from "@tank1990/shared";

export function createInput(target: Window = window) {
  const down = new Set<string>();

  target.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      if (document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
      }
    }
    down.add(e.code);
  });

  target.addEventListener("keyup", (e) => {
    down.delete(e.code);
  });

  target.addEventListener("blur", () => {
    down.clear();
  });

  function isDown(code: string): boolean {
    return down.has(code);
  }

  function readP1(): { moveDir: Direction | null; fire: boolean } {
    let moveDir: Direction | null = null;
    if (isDown("KeyW") || isDown("ArrowUp")) moveDir = Direction.Up;
    else if (isDown("KeyS") || isDown("ArrowDown")) moveDir = Direction.Down;
    else if (isDown("KeyA") || isDown("ArrowLeft")) moveDir = Direction.Left;
    else if (isDown("KeyD") || isDown("ArrowRight")) moveDir = Direction.Right;

    return { moveDir, fire: isDown("Space") };
  }

  function readP2(): { moveDir: Direction | null; fire: boolean } {
    let moveDir: Direction | null = null;
    if (isDown("KeyI")) moveDir = Direction.Up;
    else if (isDown("KeyK")) moveDir = Direction.Down;
    else if (isDown("KeyJ")) moveDir = Direction.Left;
    else if (isDown("KeyL")) moveDir = Direction.Right;

    return { moveDir, fire: isDown("Enter") };
  }

  return { isDown, readP1, readP2 };
}
