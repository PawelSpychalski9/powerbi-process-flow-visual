const roles = ['source','target','value','tooltipId','nodeTitle','nodeDescription','label','group','flowGroup'];

function stressData(kind, count) {
    const columns = roles.map(role => ({displayName: role, roles: {[role]: true}}));
    const rows = Array.from({length: count}, (_, i) => {
        const nodes = Math.min(500, count + 1);
        let source = i % nodes, target = (i + 1) % nodes;
        if (kind === 'disconnected') {source = (i % 250) * 2; target = source + 1;}
        if (kind === 'parallel') {source = 0; target = 1;}
        if (kind === 'branches') {source = Math.floor(i / 3) % 150; target = (i % 499) + 1;}
        const long = kind === 'long-text' ? 'Very long title 漢字 😀 '.repeat(100) : `Step ${source}`;
        return [`N${source}`, `N${target}`, i % 3 === 0 ? 0 : -i, `T${i}`, long, 'Synthetic test data',
            kind === 'long-text' ? long : `Connection ${i}`, 'Test', kind === 'grouped' ? `Group ${Math.floor(source / 25)}` : null];
    });
    return {metadata: {columns}, table: {columns, rows, identity: rows.map((_, i) => ({key: `stress-${i}`}))}};
}

const stressCases = [
    ['chain',25], ['chain',100], ['chain',250], ['chain',499],
    ['cycle',1000], ['branches',1000], ['disconnected',1000], ['parallel',1000],
    ['grouped',1000], ['long-text',100]
];
module.exports = {stressData, stressCases};
