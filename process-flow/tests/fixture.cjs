const fs = require('node:fs');
const path = require('node:path');
const { roles } = require('../.tmp/tests/graph.js');

function dataView(rows, selectedRoles = roles) {
    const columns = selectedRoles.map(role => ({displayName: role, roles: {[role]: true}}));
    return {metadata: {columns}, table: {columns, rows}};
}

function sample() {
    // This fixture contains no quoted commas; reject changes requiring a full CSV parser.
    const lines = fs.readFileSync(path.join(__dirname, '../../example_data/example_data.csv'), 'utf8').trim().split(/\r?\n/);
    const expected = ['Source', 'Target', 'Value', 'Tooltip ID', 'Node Title', 'Node Description', 'Label', 'Group'];
    if (JSON.stringify(lines.shift().split(',')) !== JSON.stringify(expected)) throw new Error('Unexpected sample header');
    const rows = lines.map(line => {
        const row = line.split(',');
        if (row.length !== 8 || line.includes('"')) throw new Error('Unsupported fixture CSV syntax');
        row[2] = Number(row[2]);
        if (!Number.isFinite(row[2])) throw new Error('Non-finite sample value');
        return row;
    });
    return dataView(rows);
}

module.exports = {dataView, sample};
