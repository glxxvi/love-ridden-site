// test-teams.js — DEV ONLY. Never imported by the app.
// Two fictional 28-player rosters used only by engine tests.

const p = (id, displayName, num) => ({ id, displayName, numbers: [String(num)], wornNumber: num, active: true });

export const LOVE_RIDDEN_ANGELS = {
  id: 'love-ridden-angels',
  name: 'Love Ridden Angels',
  short: 'Love Ridden',
  roster: [
    p('marcus-webb',      'Marcus Webb',      1),
    p('tremaine-jackson', 'Tremaine Jackson', 2),
    p('kyle-kicker',      'Kyle Kicker',      3),
    p('deandre-collins',  'DeAndre Collins',  4),
    p('jaylen-ortiz',     'Jaylen Ortiz',     5),
    p('caleb-sikes',      'Caleb Sikes',      6),
    p('jake-miller',      'Jake Miller',      7),
    p('brayden-ross',     'Brayden Ross',     8),
    p('isaiah-fontenot',  'Isaiah Fontenot',  9),
    p('darion-brown',     'Darion Brown',    10),
    p('cole-reed',        'Cole Reed',       11),
    p('luis-vega',        'Luis Vega',       12),
    p('jadavian-garner',  'JaDavian Garner', 13),
    p('tyrese-bell',      'Tyrese Bell',     14),
    p('ethan-hargrove',   'Ethan Hargrove',  15),
    p('noah-pruitt',      'Noah Pruitt',     17),
    p('rylan-chapman',    'Rylan Chapman',   18),
    p('cameron-doyle',    'Cameron Doyle',   20),
    p('aaron-vasquez',    'Aaron Vasquez',   21),
    p('micah-landry',     'Micah Landry',    22),
    p('grant-holloway',   'Grant Holloway',  23),
    p('jonah-pierce',     'Jonah Pierce',    24),
    p('bryce-tanner',     'Bryce Tanner',    25),
    p('zeke-marsh',       'Zeke Marsh',      30),
    p('hunter-cross',     'Hunter Cross',    32),
    p('rhett-bowman',     'Rhett Bowman',    33),
    p('xavier-quintero',  'Xavier Quintero', 44),
    p('weston-falco',     'Weston Falco',    88),
  ],
};

export const PFENEX_FINANCIAL_GROUP = {
  id: 'pfenex-financial-group',
  name: 'Pfenex Financial Group',
  short: 'Pfenex',
  roster: [
    p('devin-marlow',       'Devin Marlow',       1),
    p('andres-silva',       'Andres Silva',       2),
    p('brady-kessler',      'Brady Kessler',      3),
    p('jordan-whitfield',   'Jordan Whitfield',   4),
    p('terrance-boyd',      'Terrance Boyd',      5),
    p('malik-reed',         'Malik Reed',         6),
    p('owen-bautista',      'Owen Bautista',      7),
    p('cayden-ellison',     'Cayden Ellison',     8),
    p('aiden-cross',        'Aiden Cross',        9),
    p('quentin-hays',       'Quentin Hays',      10),
    p('elijah-mims',        'Elijah Mims',       11),
    p('sammy-delgado',      'Sammy Delgado',     12),
    p('kaden-sparks',       'Kaden Sparks',      13),
    p('jace-rowland',       'Jace Rowland',      14),
    p('bryson-keel',        'Bryson Keel',       16),
    p('marcus-ferreira',    'Marcus Ferreira',   18),
    p('riley-dunn',         'Riley Dunn',        19),
    p('tariq-osei',         'Tariq Osei',        20),
    p('dominique-vance',    'Dominique Vance',   21),
    p('cole-witten',        'Cole Witten',       22),
    p('preston-mayes',      'Preston Mayes',     23),
    p('nico-salas',         'Nico Salas',        24),
    p('jaxon-baird',        'Jaxon Baird',       25),
    p('roman-petty',        'Roman Petty',       28),
    p('luca-ferraro',       'Luca Ferraro',      31),
    p('dashawn-wills',      'Dashawn Wills',     34),
    p('tobias-grier',       'Tobias Grier',      50),
    p('felix-cardona',      'Felix Cardona',     99),
  ],
};

export function testSetup({ openingKick = 'OPP', startQuarter = 1 } = {}) {
  return {
    teams: {
      US:  { name: LOVE_RIDDEN_ANGELS.name,      short: LOVE_RIDDEN_ANGELS.short },
      OPP: { name: PFENEX_FINANCIAL_GROUP.name,  short: PFENEX_FINANCIAL_GROUP.short },
    },
    roster: LOVE_RIDDEN_ANGELS.roster,
    oppRoster: PFENEX_FINANCIAL_GROUP.roster,
    openingKick,
    startQuarter,
  };
}