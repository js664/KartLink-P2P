function markCurrent(items, id, running) {
  const current = running && typeof id === 'string' ? id.toLowerCase() : null;
  return items.map(item => ({...item, inUse: !!current && item.id.toLowerCase() === current}));
}
module.exports = {markCurrent};
