const fs = require('fs');

const DA_CONSTANTS = {
  BRACKET_LABELS: {
    ground: '*/G',
    'action-manner': 'Ac/Mn*',
    progression: 'P/*',
    'negative-positive': '-/+',
    'idea-explanation': 'Id/Exp*',
    conditional: 'If/Th*'
  },
  GURTNER_LABELS: {
    ground: '*/G',
    'action-manner': 'W/Ed/*',
    progression: 'P/*',
    'negative-positive': '-/+',
    'idea-explanation': 'Id/Exp*',
    conditional: 'C?/E/*'
  },
  SINGLE_LABEL_TYPES: new Set()
};

const DA_UI = {
  isGurtnerMode: () => true
};

const DA_STATE = {
  customLabels: [],
  savedCustomLabels: [],
  brackets: [
    { from: "p3", to: "p4", type: "ground", labelsSwapped: false, dominanceFlipped: false }, // b0
    { from: "p6", to: "p7", type: "ground", labelsSwapped: false, dominanceFlipped: false }, // b1
    { from: "p8", to: "p9", type: "negative-positive", labelsSwapped: false, dominanceFlipped: false }, // b2
    { from: "p10", to: "p11", type: "conditional", labelsSwapped: false, dominanceFlipped: false }, // b3
    { from: "p0", to: "p1", type: "ground", labelsSwapped: false, dominanceFlipped: false }, // b4
    { from: "p5", to: "b1", type: "action-manner", labelsSwapped: false, dominanceFlipped: false }, // b5
    { from: "p2", to: "b0", type: "negative-positive", labelsSwapped: true, dominanceFlipped: false }, // b6
    { from: "b4", to: "b6", type: "progression", labelsSwapped: false, dominanceFlipped: false }, // b7
    { from: "b5", to: "b2", type: "progression", labelsSwapped: false, dominanceFlipped: false }, // b8
    { from: "b7", to: "b8", type: "idea-explanation", labelsSwapped: false, dominanceFlipped: false }, // b9
    { from: "b9", to: "b3", type: "idea-explanation", labelsSwapped: false, dominanceFlipped: false } // b10
  ]
};

function getBracketLabels(type, labelsSwapped = false, dominanceFlipped = false) {
  const typeKey = type.toLowerCase();
  let labelStr = DA_CONSTANTS.BRACKET_LABELS[typeKey];
  if (!labelStr && typeKey.startsWith('cl_')) {
    labelStr = "custom";
  }
  if (!labelStr) labelStr = type.slice(0, 2);
  if (DA_UI.isGurtnerMode() && DA_CONSTANTS.GURTNER_LABELS[typeKey]) labelStr = DA_CONSTANTS.GURTNER_LABELS[typeKey];
  
  let top = '', bottom = '';
  const parts = labelStr.split('/');
  if (parts.length === 3) {
    if (parts[0] === '*') { top = parts[1] + '*'; bottom = parts[2]; }
    else if (parts[2] === '*') { top = parts[0]; bottom = parts[1] + '*'; }
    else { top = parts[0]; bottom = parts[1]; }
  } else if (parts.length === 2) {
    top = parts[0] || ''; bottom = parts[1] || '';
    if (!top.includes('*') && !bottom.includes('*')) bottom += '*';
  } else {
    top = labelStr; bottom = '*';
  }

  if (labelsSwapped) { let tmp = top; top = bottom; bottom = tmp; }
  if (dominanceFlipped) {
    const hasStarTop = top.includes('*');
    const hasStarBottom = bottom.includes('*');
    if (hasStarTop && !hasStarBottom) { top = top.replace('*', ''); bottom += '*'; }
    else if (hasStarBottom && !hasStarTop) { bottom = bottom.replace('*', ''); top += '*'; }
    else if (!hasStarTop && !hasStarBottom) { top += '*'; }
  }

  return { top: top.trim(), bottom: bottom.trim() };
}

function getExtent(id) {
  if (typeof id === 'number') return { from: id, to: id };
  if (id.startsWith('p')) {
    const idx = parseInt(id.slice(1), 10);
    return { from: idx, to: idx };
  }
  if (id.startsWith('b')) {
    const bIdx = parseInt(id.slice(1), 10);
    const b = DA_STATE.brackets[bIdx];
    if (!b) return { from: 0, to: 0 }; 
    const eFrom = getExtent(b.from);
    const eTo = getExtent(b.to);
    return { from: Math.min(eFrom.from, eTo.from), to: Math.max(eFrom.to, eTo.to) };
  }
  return { from: 0, to: 0 };
}

// simulate dot positions 0-11
const dotPositions = Array.from({length: 12}, (_, i) => ({ midY: i * 10 }));

function getConnectionPoints(fromId, toId, dotPositions, excludeBracketIdx = -1) {
  const getY = (id) => {
    if (id.startsWith('p')) return dotPositions[parseInt(id.slice(1))].midY;
    if (id.startsWith('b')) {
      const bIdx = parseInt(id.slice(1), 10);
      const b = DA_STATE.brackets[bIdx];
      const points = getConnectionPoints(b.from, b.to, dotPositions, bIdx);
      const labels = getBracketLabels(b.type, b.labelsSwapped, b.dominanceFlipped);
      if (labels.top && labels.top.includes('*')) return points.topY;
      if (labels.bottom && labels.bottom.includes('*')) return points.bottomY;
      return (points.topY + points.bottomY) / 2;
    }
    return 0;
  };

  return {
    topY: getY(fromId),
    bottomY: getY(toId)
  };
}

const b1_points = getConnectionPoints(DA_STATE.brackets[1].from, DA_STATE.brackets[1].to, dotPositions);
console.log("b1 (6,7): topY=", b1_points.topY, "bottomY=", b1_points.bottomY);
console.log("getY('b1')=", getConnectionPoints("b1", "p0", dotPositions).topY);

const b5_points = getConnectionPoints(DA_STATE.brackets[5].from, DA_STATE.brackets[5].to, dotPositions);
console.log("b5 (5,b1): topY=", b5_points.topY, "bottomY=", b5_points.bottomY);

const b7_points = getConnectionPoints(DA_STATE.brackets[7].from, DA_STATE.brackets[7].to, dotPositions);
console.log("b7 (b4,b6): topY=", b7_points.topY, "bottomY=", b7_points.bottomY);
