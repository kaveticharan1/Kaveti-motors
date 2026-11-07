// Brands and popular models sold in India (new and used). "Other" lets the owner type anything not listed.
export const BRANDS = {
  'Maruti Suzuki': ['Alto', 'Alto K10', 'S-Presso', 'Celerio', 'Wagon R', 'Swift', 'Dzire', 'Baleno', 'Ignis', 'Ciaz', 'Ertiga', 'XL6', 'Brezza', 'Vitara Brezza', 'Fronx', 'Grand Vitara', 'Jimny', 'Invicto', 'Eeco', 'Ritz', 'S-Cross', 'Omni', 'Zen', 'Estilo', 'A-Star', 'SX4', 'Gypsy'],
  Hyundai: ['Santro', 'Eon', 'i10', 'Grand i10', 'Grand i10 Nios', 'i20', 'Elite i20', 'Aura', 'Xcent', 'Verna', 'Venue', 'Exter', 'Creta', 'Alcazar', 'Tucson', 'Elantra'],
  Tata: ['Nano', 'Tiago', 'Tigor', 'Altroz', 'Punch', 'Nexon', 'Curvv', 'Harrier', 'Safari', 'Indica', 'Indigo', 'Zest', 'Bolt', 'Hexa', 'Sumo'],
  Mahindra: ['KUV100', 'XUV300', 'XUV 3XO', 'XUV400', 'Bolero', 'Bolero Neo', 'Scorpio', 'Scorpio N', 'Scorpio Classic', 'Thar', 'Thar Roxx', 'XUV500', 'XUV700', 'Marazzo', 'TUV300', 'Xylo', 'Quanto'],
  Toyota: ['Etios', 'Etios Liva', 'Glanza', 'Urban Cruiser', 'Urban Cruiser Hyryder', 'Rumion', 'Yaris', 'Corolla Altis', 'Innova', 'Innova Crysta', 'Innova Hycross', 'Fortuner', 'Camry'],
  Honda: ['Brio', 'Amaze', 'Jazz', 'City', 'WR-V', 'Elevate', 'Mobilio', 'BR-V', 'Civic', 'CR-V'],
  Kia: ['Sonet', 'Seltos', 'Carens', 'Syros', 'Carnival'],
  Renault: ['Kwid', 'Triber', 'Kiger', 'Duster', 'Lodgy', 'Pulse', 'Scala'],
  Nissan: ['Magnite', 'Micra', 'Sunny', 'Terrano', 'Kicks'],
  Volkswagen: ['Polo', 'Ameo', 'Vento', 'Virtus', 'Taigun', 'Tiguan'],
  Skoda: ['Rapid', 'Slavia', 'Kushaq', 'Kylaq', 'Octavia', 'Laura', 'Superb', 'Kodiaq'],
  MG: ['Comet EV', 'Astor', 'ZS EV', 'Hector', 'Hector Plus', 'Windsor EV', 'Gloster'],
  Ford: ['Figo', 'Figo Aspire', 'Freestyle', 'EcoSport', 'Fiesta', 'Ikon', 'Endeavour'],
  Chevrolet: ['Spark', 'Beat', 'Sail', 'Aveo', 'Enjoy', 'Cruze', 'Tavera'],
  Jeep: ['Compass', 'Meridian', 'Wrangler'],
  Datsun: ['redi-GO', 'GO', 'GO+'],
  Fiat: ['Punto', 'Linea'],
  'Mercedes-Benz': ['A-Class', 'C-Class', 'E-Class', 'GLA', 'GLC', 'GLE'],
  BMW: ['1 Series', '3 Series', '5 Series', 'X1', 'X3', 'X5'],
  Audi: ['A3', 'A4', 'A6', 'Q3', 'Q5', 'Q7'],
};
const ALIASES = { maruti: 'Maruti Suzuki', suzuki: 'Maruti Suzuki', mercedes: 'Mercedes-Benz', benz: 'Mercedes-Benz', vw: 'Volkswagen', chevy: 'Chevrolet' };
export const COLOURS = ['White', 'Silver', 'Grey', 'Black', 'Red', 'Blue', 'Brown', 'Beige', 'Green', 'Orange', 'Yellow', 'Maroon'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// Match free text (from an old car name or from photo detection) to a listed brand.
export function findBrand(text, exact = false) {
  const t = norm(text);
  if (!t) return null;
  const hit = Object.keys(BRANDS).find((b) => norm(b) === t || (!exact && t.startsWith(norm(b))));
  if (hit) return hit;
  const a = Object.keys(ALIASES).find((k) => k === t || (!exact && t.startsWith(k)));
  return a ? ALIASES[a] : null;
}
// Longest listed model that the text starts with (so "Innova Crysta" beats "Innova").
export function findModel(brand, text) {
  const t = norm(text);
  if (!brand || !BRANDS[brand] || !t) return null;
  return [...BRANDS[brand]].sort((a, b) => b.length - a.length).find((m) => t === norm(m) || t.startsWith(norm(m))) || null;
}
// Split an existing car name like "Hyundai Creta 1.6 SX" into brand, model and variant.
export function splitName(name) {
  const words = String(name || '').trim().split(/\s+/);
  for (let i = Math.min(3, words.length); i >= 1; i--) {
    const brand = findBrand(words.slice(0, i).join(' '), true);
    if (!brand) continue;
    const rest = words.slice(i);
    for (let j = Math.min(4, rest.length); j >= 1; j--) {
      const model = findModel(brand, rest.slice(0, j).join(' '));
      if (model && norm(model) === norm(rest.slice(0, j).join(' '))) return { brand, model, variant: rest.slice(j).join(' ') };
    }
    return { brand, model: null, modelText: rest.join(' '), variant: '' };
  }
  return { brand: null, model: null, modelText: name, variant: '' };
}
