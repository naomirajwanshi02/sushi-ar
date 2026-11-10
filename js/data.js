// Sushi Chef data: every ingredient and every piece on the menu.
//
// A piece is built in stages, the way a sushi chef builds it. Inside one stage the
// ingredients can go in any order; the stages themselves must follow each other.
//   nigiri    rice → wasabi → topping (neta)
//   gunkan    rice → nori wall → loose topping
//   hosomaki  nori → rice → (wasabi) → one filling          (thin roll, nori outside)
//   futomaki  nori → rice → several fillings                (thick roll, nori outside)
//   uramaki   nori → rice → fillings → sesame on the outside (inside-out roll)

export const INGREDIENTS = {
  rice:    { name: 'Sushi rice',     short: 'Rice',         color: '#f3ecdc', say: 'Rice seasoned with vinegar, sugar and salt.' },
  nori:    { name: 'Nori',           short: 'Nori',           color: '#26301f', say: 'Sheets of seaweed, pressed and dried like paper.' },
  wasabi:  { name: 'Wasabi',         short: 'Wasabi',       color: '#86a83c', say: 'A grated green root with a sharp, nose-tingling heat.' },
  salmon:  { name: 'Salmon',         short: 'Salmon',     color: '#f06a32', say: 'Raw salmon, cut against the white lines of fat.' },
  tuna:    { name: 'Tuna',           short: 'Tuna',         color: '#b3162f', say: 'Lean red tuna, called akami.' },
  ebi:     { name: 'Shrimp',         short: 'Ebi',            color: '#f2865a', say: 'Boiled shrimp, opened out flat like a butterfly.' },
  tamago:  { name: 'Tamago',         short: 'Tamago',         color: '#f4c430', say: 'A sweet omelette, rolled up in thin layers.' },
  ikura:   { name: 'Salmon roe',     short: 'Ikura',        color: '#ff6a10', say: 'Shiny orange salmon eggs that pop in your mouth.' },
  kani:    { name: 'Crab stick',     short: 'Crab',       color: '#e2452f', say: 'Fish cake made to look and taste like crab.' },
  avocado: { name: 'Avocado',        short: 'Avocado',    color: '#a8c24a', say: 'Creamy, buttery slices. A favourite outside Japan.' },
  kyuri:   { name: 'Cucumber',       short: 'Cucumber',   color: '#4f8a2f', say: 'Crunchy cucumber, cut into thin sticks.' },
  goma:    { name: 'Sesame seeds',   short: 'Sesame',         color: '#e8d6ad', say: 'Toasted seeds, rolled onto the outside of the rice.' },
  // Pickled ginger is served beside sushi, never in it: it is always a decoy.
  gari:    { name: 'Pickled ginger', short: 'Gari',           color: '#f2a7a0', say: 'Eaten between pieces to refresh your mouth. It never goes in the sushi.' },
};


export const RECIPES = [
  { id: 'sake-nigiri', name: 'Salmon Nigiri', form: 'nigiri', top: 'salmon',
    stages: [['rice'], ['wasabi'], ['salmon']],
    fact: 'Salmon only became a sushi topping in Japan in the 1980s, after Norway started selling its farmed salmon there.' },
  { id: 'maguro-nigiri', name: 'Tuna Nigiri', form: 'nigiri', top: 'tuna',
    stages: [['rice'], ['wasabi'], ['tuna']],
    fact: 'Tuna is the classic Edo-style topping. The fatty belly is called toro and is the most prized cut.' },
  { id: 'ebi-nigiri', name: 'Ebi Nigiri', form: 'nigiri', top: 'ebi',
    stages: [['rice'], ['wasabi'], ['ebi']],
    fact: 'The shrimp is boiled on a skewer so it stays straight, then opened out flat before it goes on the rice.' },
  { id: 'tamago-nigiri', name: 'Tamago Nigiri', form: 'nigiri', top: 'tamago',
    stages: [['rice'], ['tamago'], ['nori']],
    fact: 'Tamago is a sweet rolled omelette. A thin belt of nori holds it on the rice.' },
  { id: 'ikura-gunkan', name: 'Ikura Gunkan', form: 'gunkan', top: 'ikura',
    stages: [['rice'], ['nori'], ['ikura']],
    fact: 'Gunkan means battleship. Its nori wall stops loose toppings like salmon roe from rolling off. It was first made in Tokyo in 1941.' },
  { id: 'kappa-maki', name: 'Kappa Maki', form: 'hosomaki', fill: ['kyuri'],
    stages: [['nori'], ['rice'], ['kyuri']],
    fact: 'A kappa is a water spirit from Japanese folk tales, said to love cucumbers more than anything.' },
  { id: 'sake-maki', name: 'Salmon Maki', form: 'hosomaki', fill: ['salmon'],
    stages: [['nori'], ['rice'], ['salmon']],
    fact: 'Hosomaki means thin roll: nori on the outside and just one filling in the middle.' },
  { id: 'tekka-maki', name: 'Tekka Maki', form: 'hosomaki', fill: ['tuna'],
    stages: [['nori'], ['rice'], ['wasabi'], ['tuna']],
    fact: 'Tekka means red-hot iron, a name often said to come from the bright red tuna inside.' },
  { id: 'futomaki', name: 'Futomaki', form: 'futomaki', fill: ['tamago', 'kyuri', 'kani'],
    stages: [['nori'], ['rice'], ['tamago', 'kyuri', 'kani']],
    fact: 'Futomaki means thick roll. In Osaka a whole uncut one, ehōmaki, is eaten on Setsubun in early February, facing the lucky direction of the year.' },
  { id: 'california', name: 'California Roll', form: 'uramaki', fill: ['kani', 'avocado', 'kyuri'],
    stages: [['nori'], ['rice'], ['kani', 'avocado', 'kyuri'], ['goma']],
    fact: 'Made in North America with the rice on the outside, for diners who were not used to seaweed yet.' },
  { id: 'salmon-avocado', name: 'Salmon Avocado Roll', form: 'uramaki', fill: ['salmon', 'avocado'],
    stages: [['nori'], ['rice'], ['salmon', 'avocado'], ['goma']],
    fact: 'Inside-out rolls are called uramaki. Ura means the back: the nori is hidden on the inside.' },
];
export const BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

// One endless ramp: it starts gentle and gets faster with every plate served.
export const PACE = {
  perStep: 4.5,    // seconds per ingredient on the first order
  shrink: 0.955,   // each plate served multiplies that by this
  floor: 1.4,      // never faster than this per ingredient
  read: 3,         // extra seconds to read the order and look round the board
  decoys: [2, 6],  // wrong ingredients on the board: from 2 up to 6 by the 12th plate
  rampOrders: 12,
  maxTokens: 9,    // ingredient dishes on the board at once
  lives: 3,
  hintAfter: 6,    // seconds without progress before the wanted ingredients hop
  mistakeCost: 1.5, // seconds a wrong tap takes off the clock
  maxMult: 5,
  // Bigger pieces unlock as you go: up to 3 steps first, then 4, then everything.
  unlock: [[0, 3], [3, 4], [6, 6]],
};
