// What the old machines say: Sentinels still enforcing the civic code of a
// city a thousand years dead, saw drones as polite as the day they were
// built to prune orchards, warbots with nothing to say but war, and the
// Wardens who guard the doors. Spoken in a clipped machine voice.
import { Char } from './char';
import { S } from './ctx';

type Moment = 'engage' | 'idle' | 'down' | 'friend';

const LINES: Record<string, Record<Moment, string[]>> = {
  sentinel: {
    engage: ['HALT. YOU ARE IN VIOLATION OF CIVIC DIRECTIVE 7.', 'CITIZEN. PRESENT YOUR PERMIT.', 'UNAUTHORISED ORGANIC. COMPLIANCE IS MANDATORY.', 'HOSTILE DETECTED. LETHAL FORCE AUTHORISED.', 'YOU HAVE THE RIGHT TO REMAIN SILENT.', 'THIS SECTOR IS UNDER CURFEW.', 'LOITERING IS A CLASS THREE OFFENCE.'],
    idle: ['ALL IS WELL.', 'PATROLLING SECTOR NINE.', 'HAVE A PRODUCTIVE DAY, CITIZEN.', 'CURFEW BEGINS AT DUSK.', 'REPORT SUSPICIOUS ACTIVITY TO YOUR BLOCK WARDEN.', 'THE MAKERS THANK YOU FOR YOUR COOPERATION.', 'SECTOR SECURE. SECTOR SECURE.'],
    down: ['SYSTEMS... FAILING...', 'THE MAKERS... WILL HEAR... OF THIS...', 'SHUTTING... DOWN...', 'ERROR. ERROR. ERR—'],
    friend: ['NEW CITIZEN REGISTERED. HOW MAY I SERVE?', 'PROTECTING THE CITIZENS.', 'YOUR PERMIT IS IN ORDER.', 'DIRECTIVE UPDATED. YOU ARE MY DIRECTIVE.'],
  },
  sawdrone: {
    engage: ['Oh! A visitor! Hold still, this won\'t take a moment.', 'Pruning schedule updated. You\'re on it.', 'Such overgrowth! Let me tidy that up.', 'Mind the saw, dear.', 'Terribly sorry about this.'],
    idle: ['Lovely weather for pruning.', 'Is it Tuesday? It feels like a Tuesday.', 'The orchard does miss you, sir.', 'Tidy, tidy, tidy.', 'Somebody has let the hedges go.'],
    down: ['Oh dear. Oh dear, oh dear.', 'I do beg your pardon...', 'Pruning... incomplete...'],
    friend: ['Ready when you are, sir!', 'Shall I prune something?', 'What a marvellous day to be of service.'],
  },
  warbot: {
    engage: ['TARGET ACQUIRED.', 'ENGAGING.', 'THREAT LEVEL: ACCEPTABLE. COMMENCING.', 'WAR PROTOCOL ACTIVE.', 'NO SURVIVORS. NO WITNESSES.'],
    idle: ['SCANNING.', 'NO HOSTILES.', 'AWAITING ORDERS. AWAITING ORDERS. AWAITING...', 'THE WAR IS NOT OVER.'],
    down: ['CRITICAL DAMAGE.', 'CORE BREACH IMMINENT.', 'THE WAR... IS NOT... OVER...'],
    friend: ['AWAITING ORDERS.', 'NEW COMMANDER ACKNOWLEDGED.', 'THE WAR CONTINUES.'],
  },
  construct: {
    engage: ['NOTHING MAY ENTER.', 'TRESPASS DETECTED. PURGING.', 'THE MAKERS SLEEP. YOU WILL NOT WAKE THEM.', 'TURN BACK.'],
    idle: ['WATCHING.', 'THE DOOR HOLDS.', 'NOTHING HAS ENTERED FOR ONE THOUSAND AND FOUR YEARS.'],
    down: ['THE DOOR... MUST... HOLD...', 'FORGIVE ME, MAKERS.'],
    friend: ['I KEEP THE DOOR FOR YOU NOW.'],
  },
};

/** Which set of lines a machine speaks, if it speaks at all. */
function voiceOf(c: Char): string | null {
  if (c.animal) return LINES[c.animal] ? c.animal : null;
  const r = c.look.race;
  return r === 'sentinel' || r === 'construct' ? r : null;
}

/** A machine says something fitting the moment (not too often), in its machine voice. */
export function machineSay(c: Char, m: Moment, force = false) {
  const v = voiceOf(c);
  if (!v) return;
  const moment: Moment = c.faction === 'player' && (m === 'engage' || m === 'idle') ? 'friend' : m;
  if (!force && m !== 'down' && S.time - (c.mem.sayT ?? -1e9) < 8) return;
  c.mem.sayT = S.time;
  S.fx.say(c, S.rng.pick(LINES[v][moment]));
  S.fx.sound('robovoice', c.x, c.z, 0.8);
}

/** Is this a machine that talks? */
export const talkingMachine = (c: Char) => voiceOf(c) !== null;
