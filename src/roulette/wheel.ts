import { SeededRng, deriveSeed } from '../domain/rng';
import { PocketColor, SpinResult, WheelKind } from './types';

// physical pocket order around each wheel, clockwise from the top
export const POCKET_ORDER: Record<WheelKind, string[]> = {
  european: ['0', '32', '15', '19', '4', '21', '2', '25', '17', '34', '6', '27', '13', '36', '11', '30', '8', '23', '10', '5', '24', '16', '33', '1', '20', '14', '31', '9', '22', '18', '29', '7', '28', '12', '35', '3', '26'],
  american: ['0', '28', '9', '26', '30', '11', '7', '20', '32', '17', '5', '22', '34', '15', '3', '24', '36', '13', '1', '00', '27', '10', '25', '29', '12', '8', '19', '31', '18', '6', '21', '33', '16', '4', '23', '35', '14', '2'],
};

const RED_NUMBERS = new Set(['1', '3', '5', '7', '9', '12', '14', '16', '18', '19', '21', '23', '25', '27', '30', '32', '34', '36']);

export function pocketColor(pocket: string): PocketColor {
  if (pocket === '0' || pocket === '00') return 'green';
  return RED_NUMBERS.has(pocket) ? 'red' : 'black';
}

// physical model of a spin: a slowly decaying rotor spins one way while the ball
// orbits the other, sheds speed to friction, falls off the track, strikes one of
// eight deflector diamonds and hops a few pockets before the rotor captures it.
// every quantity comes from the seeded stream, so a spin replays exactly by seed.
export function simulateSpin(spinSeed: string, wheel: WheelKind): SpinResult {
  const rng = new SeededRng(deriveSeed(spinSeed, 'physics'));
  const order = POCKET_ORDER[wheel];
  const pockets = order.length;

  // rotor: rev/s counter-clockwise, mild friction
  const wheelRps = 0.22 + rng.nextFloat() * 0.12;
  const wheelPhase = rng.nextFloat();

  // ball: launched clockwise, exponential decay until it drops off the track
  const ballRps0 = 1.4 + rng.nextFloat() * 0.7;
  const decay = 0.16 + rng.nextFloat() * 0.05;
  const dropRps = 0.5 + rng.nextFloat() * 0.12;
  const tDrop = Math.log(ballRps0 / dropRps) / decay;
  const ballRevsAtDrop = (ballRps0 * (1 - Math.exp(-decay * tDrop))) / decay;
  const ballPhase = rng.nextFloat();

  // deflector strike: eight diamonds; the ball falls to the next one it reaches
  const dropAngle = (ballPhase + ballRevsAtDrop) % 1;
  const deflectorAngle = Math.ceil(dropAngle * 8) / 8;

  // scatter: mostly short hops, the odd wild bounce
  const hop = Math.min(Math.floor(-Math.log(1 - rng.nextFloat()) * 3.2), 14);

  // rotor keeps turning while the ball rattles down
  const settleTime = tDrop + 0.6 + rng.nextFloat() * 0.5;
  const wheelAngleAtLand = (wheelPhase + wheelRps * settleTime) % 1;

  // ball angle measured against the rotor picks the pocket; hops shift it along
  const relative = ((deflectorAngle + wheelAngleAtLand) % 1 + 1) % 1;
  const pocketIndex = (Math.floor(relative * pockets) + hop) % pockets;

  return {
    pocket: order[pocketIndex],
    trace: {
      durationMs: Math.round((settleTime + 1.1) * 1000),
      wheelRevs: wheelRps * (settleTime + 1.1),
      ballRevs: ballRevsAtDrop + 1.5 + rng.nextFloat(),
      pocketIndex,
      pockets,
    },
  };
}
