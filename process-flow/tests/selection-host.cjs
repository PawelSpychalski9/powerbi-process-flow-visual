// SDK-shaped host simulation; never substitutes for semantic-model validation.
function identity(key, includes = other => other.getKey() === key) {
    return {key, getKey: () => key, hasIdentity: () => true,
        equals: other => other.getKey() === key, includes};
}

function selectionHost() {
    let selected = [];
    let callback;
    const calls = [];
    const manager = {
        registerOnSelectCallback(fn) {callback = fn;},
        getSelectionIds: () => selected,
        hasSelection: () => selected.length > 0,
        async select(value, multiSelect = false) {
            const ids = Array.isArray(value) ? value : [value];
            calls.push({type: 'select', keys: ids.map(id => id.getKey()), multiSelect});
            if (multiSelect) {
                const allSelected = ids.every(id => selected.some(existing => existing.equals(id)));
                selected = allSelected ? selected.filter(existing => !ids.some(id => existing.equals(id))) :
                    [...new Map([...selected, ...ids].map(id => [id.getKey(), id])).values()];
            } else {
                selected = selected.length === ids.length && ids.every(id => selected.some(existing => existing.equals(id))) ? [] : ids;
            }
            return selected;
        },
        async clear() {calls.push({type: 'clear'}); selected = [];},
        async showContextMenu(id, position) {calls.push({type: 'contextmenu', key: id.getKey?.(), position});}
    };
    return {manager, calls, restore(ids) {selected = ids; callback?.(ids);},
        createSelectionIdBuilder() {
            let row;
            return {withTable(table, index) {row = table.identity[index]; return this;},
                createSelectionId: () => identity(row.key)};
        }};
}
module.exports = {identity, selectionHost};
