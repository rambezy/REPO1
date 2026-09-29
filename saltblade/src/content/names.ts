// Names for every people of the waste. The named characters' own names
// (Dunstan, Skarra, Echo and the rest) are kept out, so nobody else has them.
import { RNG } from '../core/rng';

const VALE_M = ['Aldo', 'Bran', 'Cass', 'Doran', 'Edrin', 'Felix', 'Gavin', 'Hale', 'Ivo', 'Jory', 'Kellan', 'Lorne', 'Marek', 'Nils', 'Oren', 'Pell', 'Quill', 'Rolf', 'Silas', 'Tobin', 'Ulric', 'Varden', 'Wes', 'Yorick', 'Brannoc', 'Corwin', 'Emeric', 'Garth', 'Hollis', 'Jasper', 'Lucan', 'Morrow', 'Ned', 'Roderick', 'Stellan', 'Thane', 'Wyatt', 'Anselm', 'Bram', 'Cedric', 'Dell', 'Fenn', 'Gideon', 'Harlan', 'Ansel', 'Kip', 'Lars'];
const VALE_F = ['Ada', 'Bryn', 'Cora', 'Dara', 'Elin', 'Faye', 'Greta', 'Hild', 'Ilse', 'Jessa', 'Kara', 'Lena', 'Mira', 'Nell', 'Orla', 'Petra', 'Rhea', 'Sella', 'Tamsin', 'Una', 'Vera', 'Agnes', 'Brida', 'Clover', 'Delia', 'Elsa', 'Frida', 'Gwen', 'Hanna', 'Ines', 'Juniper', 'Lark', 'Maud', 'Nora', 'Opal', 'Pia', 'Rosalind', 'Sif', 'Tilde', 'Vesna', 'Willa', 'Zelda', 'Ashe', 'Birgit', 'Dagny', 'Esme', 'Marta'];
const DUNE_M = ['Amir', 'Badr', 'Dakan', 'Emre', 'Farid', 'Ghazi', 'Hadi', 'Idris', 'Jabari', 'Latif', 'Malik', 'Nasir', 'Omari', 'Qadir', 'Rashid', 'Samir', 'Tariq', 'Umar', 'Wadi', 'Yusuf', 'Zahir', 'Ayo', 'Bakari', 'Chike', 'Dayo', 'Ekon', 'Femi', 'Jomo', 'Kofi', 'Lekan', 'Mosi', 'Nuru', 'Obi', 'Sefu', 'Zuberi', 'Harun', 'Kamal', 'Rafiq'];
const DUNE_F = ['Aisha', 'Basra', 'Dalia', 'Esi', 'Farah', 'Hana', 'Imani', 'Jamila', 'Kali', 'Layla', 'Maryam', 'Nadia', 'Oma', 'Rana', 'Safa', 'Tala', 'Yara', 'Zara', 'Abeni', 'Chiamaka', 'Dalila', 'Eshe', 'Folami', 'Ife', 'Lulu', 'Makena', 'Nia', 'Sanaa', 'Thandi', 'Zuri', 'Samira', 'Yasmin', 'Leila', 'Noor'];
const KARUK = ['Gorath', 'Krugg', 'Varra', 'Druum', 'Hesk', 'Torva', 'Dovrak', 'Kethra', 'Mograth', 'Yuvek', 'Harrok', 'Zhenn', 'Orrun', 'Grisk', 'Baarak', 'Vosh', 'Thurra', 'Ruskal', 'Hagga', 'Korrin', 'Valka', 'Drossa', 'Uthgar', 'Kaelum', 'Ferrek', 'Shaara', 'Jorvik', 'Magda', 'Rakk', 'Stonna', 'Brekka', 'Tovun'];
const THRUM_A = ['Zz', 'Tch', 'Hm', 'Kr', 'Vss', 'Rik', 'Tk', 'Zh', 'Bzz', 'Ch', 'Kk', 'Skr'];
const THRUM_B = ['ik', 'ak', 'uk', 'ek', 'a', 'i', 'eth', 'ara', 'ikka', 'ou', 'ess', 'arr'];
const HOLLOW = ['Latch', 'Relay', 'Tally', 'Cog', 'Vesper', 'Seven Wires', 'Gauge', 'Piston', 'Archive', 'Ferrous', 'Dial', 'Quiet', 'Sprocket', 'Index', 'Custodian', 'Halt', 'Spindle', 'Vane', 'Oracle', 'Rivet'];
const NICK = ['Crow', 'Dusty', 'Knuckles', 'Red', 'Salt', 'Ash', 'Bones', 'Lucky', 'Sparrow', 'Mole', 'Scab', 'Grit', 'Squint', 'Jackal', 'Flint', 'Rattle', 'Tinker', 'Hook', 'Stitch', 'Patch', 'Shade', 'Nails', 'Rust', 'Cinder', 'Scratch', 'Whisper', 'Bristle', 'Gravel'];

export function personName(race: string, female: boolean, rng: RNG): string {
  switch (race) {
    case 'valefolk':
      return rng.chance(0.08) ? rng.pick(NICK) : rng.pick(female ? VALE_F : VALE_M);
    case 'duneborn':
      return rng.chance(0.08) ? rng.pick(NICK) : rng.pick(female ? DUNE_F : DUNE_M);
    case 'karuk':
      return rng.pick(KARUK);
    case 'thrum_worker':
    case 'thrum_soldier': {
      const n = rng.pick(THRUM_A) + rng.pick(THRUM_B);
      return rng.chance(0.4) ? n + '-' + rng.pick(THRUM_A).toLowerCase() + rng.pick(THRUM_B) : n;
    }
    case 'hollow':
      return rng.chance(0.4) ? `Unit ${rng.int(2, 99)}` : rng.pick(HOLLOW);
    case 'construct':
      return `Warden ${String.fromCharCode(65 + rng.int(0, 25))}-${rng.int(1, 40)}`;
    case 'sentinel':
      return `Sentinel ${rng.pick(['S', 'K', 'P', 'M', 'R'])}${rng.int(10, 99)}-${String.fromCharCode(65 + rng.int(0, 25))}`;
    case 'pale':
      return 'Mistcrawler';
  }
  return rng.pick(VALE_M);
}

export function titleFor(role: string, faction: string): string {
  switch (role) {
    case 'guard': return faction === 'ember' ? 'Warden' : faction === 'concord' ? 'Blade' : faction === 'karuk' ? 'Horn Guard' : faction === 'thrum' ? 'Hive Soldier' : faction === 'hollows' ? 'Sentinel' : 'Watchman';
    case 'patrol': return faction === 'ember' ? 'Flamebearer' : faction === 'concord' ? 'Blade' : 'Patrol';
    case 'shopkeeper': return 'Trader';
    case 'barkeep': return 'Barkeep';
    case 'noble': return faction === 'concord' ? 'Lord' : 'Elder';
    case 'slave': return 'Slave';
    case 'priest': return 'Priest';
    case 'slaver': return 'Slave Hunter';
    case 'merc': return 'Sellsword';
    case 'prisoner': return 'Prisoner';
    case 'caravan': return 'Caravaneer';
    case 'worker': return faction === 'thrum' ? 'Worker' : 'Labourer';
  }
  return '';
}
