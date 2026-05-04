const fs = require('fs');

const constantsJS = fs.readFileSync('js/utils/constants.js', 'utf8');
let DA_CONSTANTS = {};
eval(constantsJS.replace('window.DA_CONSTANTS = {', 'DA_CONSTANTS = {').replace('};', '};'));

const renderingJS = fs.readFileSync('js/utils/rendering-engine.js', 'utf8');

const matchLabels = renderingJS.match(/function getBracketLabels[\s\S]*?\n\}/);
const matchConn = renderingJS.match(/function getConnectionPoints[\s\S]*?\n\}/);
const matchExtent = renderingJS.match(/function getExtent[\s\S]*?\n\}/);

if (!matchLabels || !matchConn || !matchExtent) {
    console.log("Could not extract functions");
    process.exit(1);
}

const DA_UI = { isGurtnerMode: () => true };
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

function getBracketX() { return 0; }

eval(matchLabels[0]);
eval(matchConn[0]);
eval(matchExtent[0]);

const dotPositions = Array.from({length: 12}, (_, i) => ({ midY: i * 10, left: 10 }));

const b1_points = getConnectionPoints("p6", "p7", dotPositions, 1);
console.log("b1 (6,7): topY=", b1_points.topY, "bottomY=", b1_points.bottomY);
console.log("getY('b1')=", getConnectionPoints("b1", "p0", dotPositions, -1).topY);

const b5_points = getConnectionPoints("p5", "b1", dotPositions, 5);
console.log("b5 (5,b1): topY=", b5_points.topY, "bottomY=", b5_points.bottomY);
