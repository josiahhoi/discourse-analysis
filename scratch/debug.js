const fs = require('fs');
const persistence = fs.readFileSync('js/services/persistence.js', 'utf8');

// Extract normalizeBracketData
const match = persistence.match(/function normalizeBracketData\(data\) \{[\s\S]*?\n\}/);
if (!match) {
    console.log("Could not extract normalizeBracketData");
    process.exit(1);
}

const funcCode = match[0];
eval(funcCode);

const inputData = {
  "version": 1,
  "propositions": [
    "p0","p1","p2","p3","p4","p5","p6","p7","p8","p9","p10","p11"
  ],
  "brackets": [
    { "to": 4, "from": 3, "type": "ground", "labelsSwapped": false },
    { "from": 6, "to": 7, "type": "ground", "labelsSwapped": false },
    { "type": "action-manner", "labelsSwapped": false, "from": 5, "to": 7 },
    { "to": 9, "from": 8, "type": "negative-positive", "labelsSwapped": false },
    { "to": 11, "from": 10, "type": "conditional", "labelsSwapped": false },
    { "type": "ground", "labelsSwapped": false, "to": 1, "from": 0 },
    { "type": "negative-positive", "labelsSwapped": true, "to": 4, "from": 2 },
    { "to": 4, "from": 0, "type": "progression", "labelsSwapped": false },
    { "to": 9, "from": 5, "labelsSwapped": false, "type": "progression" },
    { "to": 9, "from": 0, "labelsSwapped": false, "type": "idea-explanation" },
    { "from": 0, "to": 11, "type": "idea-explanation", "labelsSwapped": false }
  ]
};

const output = normalizeBracketData(inputData);
console.log(JSON.stringify(output.brackets, null, 2));
