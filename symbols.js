// symbols.js — bibliothèque de pictogrammes des points (remplace les catégories de la v2)
// Chaque symbole : pastille de couleur + pictogramme blanc. La couleur reste modifiable par point.
(function () {
  'use strict';
  var W = '#fff';
  var LIST = [
    { id: 'castor_inactif', label: 'Barrage de castor inactif (à démanteler)', short: 'Castor inactif', color: '#1A1A1A',
      g: '<ellipse cx="11" cy="13.2" rx="5.4" ry="3.6" fill="' + W + '"/><circle cx="16.6" cy="10.8" r="2.5" fill="' + W + '"/><circle cx="16" cy="8.4" r=".9" fill="' + W + '"/><ellipse cx="4.9" cy="15.6" rx="2.9" ry="1.5" transform="rotate(-28 4.9 15.6)" fill="' + W + '"/>' },
    { id: 'castor_actif', label: 'Barrage de castor actif', short: 'Castor actif', color: '#D7261E',
      g: '<ellipse cx="11" cy="13.2" rx="5.4" ry="3.6" fill="' + W + '"/><circle cx="16.6" cy="10.8" r="2.5" fill="' + W + '"/><circle cx="16" cy="8.4" r=".9" fill="' + W + '"/><ellipse cx="4.9" cy="15.6" rx="2.9" ry="1.5" transform="rotate(-28 4.9 15.6)" fill="' + W + '"/>' },
    { id: 'frayere', label: 'Frayère potentielle', short: 'Frayère', color: '#1E88E5',
      g: '<ellipse cx="10.5" cy="10.5" rx="5.2" ry="2.9" fill="' + W + '"/><path d="M15 10.5 19.5 7.4v6.2z" fill="' + W + '"/><circle cx="7.6" cy="9.8" r=".9" fill="#1E88E5"/><circle cx="7" cy="16.4" r="1.2" fill="' + W + '"/><circle cx="11" cy="17" r="1.2" fill="' + W + '"/><circle cx="15" cy="16.4" r="1.2" fill="' + W + '"/>' },
    { id: 'embacle', label: 'Embâcle / chablis', short: 'Embâcle', color: '#8D5A2B',
      g: '<rect x="3.5" y="10.6" width="17" height="2.8" rx="1.4" transform="rotate(24 12 12)" fill="' + W + '"/><rect x="3.5" y="10.6" width="17" height="2.8" rx="1.4" transform="rotate(-24 12 12)" fill="' + W + '"/><rect x="4" y="15.6" width="16" height="2.4" rx="1.2" fill="' + W + '"/>' },
    { id: 'protection', label: 'Protection de la faune', short: 'Protection', color: '#2E7D32',
      g: '<path d="M12 4.2 18.4 6.6v4.9c0 4-2.8 6.9-6.4 8.3-3.6-1.4-6.4-4.3-6.4-8.3V6.6z" fill="' + W + '"/><path d="m9 11.8 2.2 2.2 4-4.2" fill="none" stroke="#2E7D32" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' },
    { id: 'artefact', label: 'Artefact', short: 'Artefact', color: '#7B3FA0',
      g: '<path d="M12 4 16.6 13.6 13.6 12.7 12 19.5 10.4 12.7 7.4 13.6z" fill="' + W + '"/>' },
    { id: 'point', label: 'Point', short: 'Point', color: '#FF6D00',
      g: '<circle cx="12" cy="12" r="3.6" fill="' + W + '"/>' },
    { id: 'danger', label: 'Danger', short: 'Danger', color: '#E53935',
      g: '<path d="M12 4.6 19.6 18H4.4z" fill="' + W + '"/><rect x="11.1" y="9" width="1.8" height="5" rx=".9" fill="#E53935"/><circle cx="12" cy="15.9" r="1" fill="#E53935"/>' },
    { id: 'camp', label: 'Camp / abri', short: 'Camp', color: '#6D4C41',
      g: '<path d="M12 5.5 19.5 18h-15z" fill="' + W + '"/><path d="M12 11.5 14.6 18H9.4z" fill="#6D4C41"/>' },
    { id: 'ponceau', label: 'Ponceau', short: 'Ponceau', color: '#546E7A',
      g: '<rect x="4" y="6" width="16" height="2.6" rx="1" fill="' + W + '"/><circle cx="12" cy="14.2" r="4.2" fill="none" stroke="' + W + '" stroke-width="2.4"/>' },
    { id: 'acces', label: 'Accès / stationnement', short: 'Accès', color: '#1565C0',
      g: '<path d="M9 18V6h4.2a3.6 3.6 0 0 1 0 7.2H9" fill="none" stroke="' + W + '" stroke-width="2.6" stroke-linejoin="round"/>' },
    { id: 'note', label: 'Note / à vérifier', short: 'Note', color: '#00897B',
      g: '<circle cx="12" cy="7.2" r="1.5" fill="' + W + '"/><rect x="10.7" y="10" width="2.6" height="8" rx="1.3" fill="' + W + '"/>' }
  ];
  var BY = {}; LIST.forEach(function (s) { BY[s.id] = s; });

  // Correspondance des anciennes catégories (pour l'affichage des points de la v2 non modifiés)
  var LEGACY = { observation: 'point', faune: 'protection', peche: 'frayere', camping: 'camp', danger: 'danger', infra: 'ponceau' };

  // Ancienne forme v2 (cercle, carré…) : conservée tant que le point n'est pas modifié
  function legacyShape(shape, c, size) {
    var s = {
      circle: '<circle cx="12" cy="12" r="10" fill="' + c + '" stroke="white" stroke-width="2"/>',
      square: '<rect x="2" y="2" width="20" height="20" rx="2" fill="' + c + '" stroke="white" stroke-width="2"/>',
      triangle: '<polygon points="12,2 22,22 2,22" fill="' + c + '" stroke="white" stroke-width="2"/>',
      diamond: '<polygon points="12,2 22,12 12,22 2,12" fill="' + c + '" stroke="white" stroke-width="2"/>',
      star: '<polygon points="12,1 14.9,8.5 22.5,8.5 16.8,13.5 19,21 12,16.5 5,21 7.2,13.5 1.5,8.5 9.1,8.5" fill="' + c + '" stroke="white" stroke-width="1.5"/>',
      cross: '<path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z" fill="' + c + '" stroke="white" stroke-width="1.5"/>',
      flag: '<rect x="5" y="16" width="2.5" height="7" fill="' + c + '" stroke="white" stroke-width="1"/><path d="M7.5 2 L20 7 L7.5 13 Z" fill="' + c + '" stroke="white" stroke-width="1.5"/>',
      house: '<polygon points="12,2 22,10 22,22 15,22 15,15 9,15 9,22 2,22 2,10" fill="' + c + '" stroke="white" stroke-width="2"/>' };
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true">' + (s[shape] || s.circle) + '</svg>';
  }
  // Pictogramme d'un symbole (couleur optionnelle)
  function svg(id, color, size) {
    var s = BY[id] || BY.point, c = color || s.color, g = s.g.split(s.color).join(c);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (size || 28) + '" height="' + (size || 28) + '" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="' + c + '" stroke="#fff" stroke-width="1.6"/>' + g + '</svg>';
  }
  // Icône d'un point, qu'il ait un symbole (v3) ou seulement une ancienne forme (v2)
  function forWp(w, size) { return w.sym ? svg(w.sym, w.color, size) : legacyShape(w.shape, w.color || '#ff6d00', size || 28); }
  function labelOf(w) { return w.sym ? (BY[w.sym] || BY.point).label : ((BY[LEGACY[w.cat]] || BY.point).label); }
  function idOf(w) { return w.sym || LEGACY[w.cat] || 'point'; }
  // Reconnaît un symbole à partir d'un texte (import de fichiers : « castor actif », « Frayère »…)
  function match(text) {
    if (!text) return null;
    var t = String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    if (BY[t]) return t;
    if (/castor|barrage/.test(t)) return /inactif|demantel|abandon/.test(t) ? 'castor_inactif' : 'castor_actif';
    if (/fray/.test(t)) return 'frayere';
    if (/embacle|chablis/.test(t)) return 'embacle';
    if (/protection|faune/.test(t)) return 'protection';
    if (/artefact|archeo/.test(t)) return 'artefact';
    if (/danger/.test(t)) return 'danger';
    if (/camp|abri/.test(t)) return 'camp';
    if (/ponceau/.test(t)) return 'ponceau';
    if (/acces|stationnement/.test(t)) return 'acces';
    if (/note|verifier/.test(t)) return 'note';
    return null;
  }
  window.NVSym = { LIST: LIST, BY: BY, svg: svg, forWp: forWp, labelOf: labelOf, idOf: idOf, match: match };
})();
