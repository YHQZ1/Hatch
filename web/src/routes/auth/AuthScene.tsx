import type { CSSProperties } from "react";

type Cube = {
  /** Distance from the middle of the floor in pixels (negative is left). */
  dx: number;
  /** Edge length in pixels. */
  size: number;
  /** Seconds into the 28 second run the cube starts at (negative: already under way). */
  delay: number;
  /** Where the cube stands when motion is reduced, in pixels from the horizon. */
  rest: number;
  accent?: boolean;
};

// The middle of the screen is left empty for the sign-in card.
const CUBES: Cube[] = [
  { dx: -330, size: 80, delay: -2, rest: 700 },
  { dx: -470, size: 56, delay: -8, rest: 420 },
  { dx: -290, size: 64, delay: -13, rest: 240 },
  { dx: -540, size: 90, delay: -18, rest: 900 },
  { dx: 380, size: 90, delay: -1, rest: 760, accent: true },
  { dx: 300, size: 56, delay: -6, rest: 400 },
  { dx: 520, size: 70, delay: -11, rest: 560 },
  { dx: 340, size: 64, delay: -16, rest: 280 },
  { dx: 560, size: 56, delay: -21, rest: 980 },
];

const FACES = ["face-top", "face-n", "face-s", "face-e", "face-w"];

/**
 * The sign-in page's backdrop: a grid floor sliding toward you in perspective,
 * with wireframe cubes (Hatch's containers) riding along it. The accent cube is
 * the one that is deployed. Pure CSS, see styles.css.
 */
export default function AuthScene() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 select-none overflow-hidden">
      <div className="scene absolute inset-x-0 bottom-0 top-0">
        <div className="floor">
          {CUBES.map((cube) => (
            <div
              key={cube.dx}
              className="mover"
              style={
                {
                  left: `calc(50% + ${cube.dx}px)`,
                  "--delay": `${cube.delay}s`,
                  "--rest": `${cube.rest}px`,
                } as CSSProperties
              }
            >
              <div
                className={`cube ${cube.accent ? "cube-accent" : ""}`}
                style={{ "--s": `${cube.size}px` } as CSSProperties}
              >
                {FACES.map((face) => (
                  <div key={face} className={`face ${face}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
